"""Small local web dashboard for live sign-boundary tuning."""

from __future__ import annotations

import json
import math
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


WEB_ROOT = Path(__file__).resolve().parent / "web"
DATASET_ROOT = Path(__file__).resolve().parent / "training_data" / "Frames_Word_Level"
DEFAULT_SETTINGS = {
    "start_hold": {"value": 0.15, "min": 0.05, "max": 1.0, "step": 0.05},
    "stop_hold": {"value": 0.7, "min": 0.2, "max": 2.0, "step": 0.05},
    "movement_threshold": {"value": 1.0, "min": 0.2, "max": 4.0, "step": 0.1},
    "raised_below_shoulder": {"value": 0.55, "min": 0.0, "max": 1.5, "step": 0.05},
    "mode_hold": {"value": 0.45, "min": 0.1, "max": 1.5, "step": 0.05},
}
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/images": ("image-index.html", "text/html; charset=utf-8"),
    "/image-index.html": ("image-index.html", "text/html; charset=utf-8"),
    "/image-index.css": ("image-index.css", "text/css; charset=utf-8"),
    "/image-index.js": ("image-index.js", "text/javascript; charset=utf-8"),
}
IMAGE_CONTENT_TYPES = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def dataset_image_records(dataset_root: Path) -> list[tuple[str, Path, str]]:
    root = dataset_root.resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Training image folder does not exist: {root}")

    images: list[tuple[str, Path, str]] = []
    for path in root.rglob("*"):
        content_type = IMAGE_CONTENT_TYPES.get(path.suffix.lower())
        if content_type is None or not path.is_file():
            continue
        resolved = path.resolve()
        try:
            relative_path = resolved.relative_to(root)
        except ValueError:
            continue
        label = relative_path.parts[0] if len(relative_path.parts) > 1 else "Uncategorized"
        images.append((label, resolved, content_type))
    return sorted(
        images,
        key=lambda image: image[1].relative_to(root).as_posix().casefold(),
    )


class DashboardState:
    def __init__(self, initial_settings: dict[str, float]):
        self._lock = threading.Lock()
        self._settings = {key: float(item["value"]) for key, item in DEFAULT_SETTINGS.items()}
        self._settings.update(initial_settings)
        self._runtime: dict[str, Any] = {
            "state": "starting",
            "mode": "idle",
            "elapsed": 0.0,
            "hands": 0,
            "fps": 0.0,
            "wrist_speed": 0.0,
            "raised": False,
            "resolution": "—",
            "event": None,
            "recognition": {
                "enabled": False,
                "state": "disabled",
                "label": None,
                "nearest_label": None,
                "distance": None,
                "threshold": None,
                "reason": None,
            },
        }
        self._latest_jpeg: bytes | None = None

    def settings(self) -> dict[str, float]:
        with self._lock:
            return self._settings.copy()

    def update_settings(self, changes: Any) -> dict[str, float]:
        if not isinstance(changes, dict) or not changes:
            raise ValueError("Send a JSON object with at least one setting.")
        unknown = set(changes) - set(DEFAULT_SETTINGS)
        if unknown:
            raise ValueError(f"Unknown setting: {', '.join(sorted(unknown))}")

        with self._lock:
            updated = self._settings.copy()
            for key, value in changes.items():
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError(f"{key} must be a number.")
                value = float(value)
                bounds = DEFAULT_SETTINGS[key]
                if not math.isfinite(value) or not bounds["min"] <= value <= bounds["max"]:
                    raise ValueError(
                        f"{key} must be between {bounds['min']} and {bounds['max']}."
                    )
                updated[key] = value
            self._settings = updated
            return updated.copy()

    def update_runtime(self, runtime: dict[str, Any], jpeg: bytes) -> None:
        with self._lock:
            self._runtime = runtime.copy()
            self._latest_jpeg = jpeg

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {"settings": self._settings.copy(), "runtime": self._runtime.copy()}

    def latest_jpeg(self) -> bytes | None:
        with self._lock:
            return self._latest_jpeg


class DashboardServer:
    def __init__(
        self,
        host: str,
        port: int,
        initial_settings: dict[str, float],
        learning_examples: (
            list[tuple[str, Path] | tuple[str, Path, int]] | None
        ) = None,
    ):
        self.state = DashboardState(initial_settings)
        self._dataset_images = dataset_image_records(DATASET_ROOT)
        self._learning_samples: list[tuple[str, Path, int]] = []
        for sample in learning_examples or []:
            label, path = sample[:2]
            hand_count = sample[2] if len(sample) == 3 else 1
            if isinstance(hand_count, bool) or hand_count not in (1, 2):
                raise ValueError("Learning references must have one or two tracked hands.")
            resolved = path.resolve()
            try:
                resolved.relative_to(DATASET_ROOT.resolve())
            except ValueError as exc:
                raise ValueError("Learning images must stay inside the selected dataset.") from exc
            if not resolved.is_file():
                raise FileNotFoundError(f"Learning image does not exist: {resolved}")
            self._learning_samples.append((label, resolved, hand_count))
        self._learning_lock = threading.Lock()
        self._learning_index = 0
        self._learning_target: tuple[str, int] | None = None
        state = self.state
        server_owner = self

        class RequestHandler(BaseHTTPRequestHandler):
            server_version = "MudraDashboard/1.0"

            def log_message(self, message: str, *args: Any) -> None:
                if args and str(args[0]).startswith(("4", "5")):
                    super().log_message(message, *args)

            def send_json(self, status: int, payload: dict[str, Any]) -> None:
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(encoded)

            def do_GET(self) -> None:
                path = urlsplit(self.path).path
                if path == "/api/status":
                    self.send_json(200, state.snapshot())
                    return
                if path == "/api/dataset/images":
                    self.send_json(
                        200,
                        {
                            "total": len(server_owner._dataset_images),
                            "images": [
                                {
                                    "id": image_id,
                                    "label": label,
                                    "filename": image_path.name,
                                    "relative_path": image_path.relative_to(
                                        DATASET_ROOT.resolve()
                                    ).as_posix(),
                                    "url": f"/api/dataset/image/{image_id}",
                                }
                                for image_id, (label, image_path, _) in enumerate(
                                    server_owner._dataset_images
                                )
                            ],
                        },
                    )
                    return
                if path.startswith("/api/dataset/image/"):
                    image_key = path.removeprefix("/api/dataset/image/")
                    if (
                        not image_key.isascii()
                        or not image_key.isdecimal()
                        or not 0 <= int(image_key) < len(server_owner._dataset_images)
                    ):
                        self.send_json(404, {"error": "Dataset image not found."})
                        return
                    _, image_path, content_type = server_owner._dataset_images[
                        int(image_key)
                    ]
                    data = image_path.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                if path == "/api/learning/next":
                    if not server_owner._learning_samples:
                        self.send_json(
                            404,
                            {
                                "error": (
                                    "No eligible learning references. Prepare accepted samples; "
                                    "static-demo references also need a calibrated class."
                                )
                            },
                        )
                        return
                    with server_owner._learning_lock:
                        sample_id = server_owner._learning_index
                        server_owner._learning_index = (
                            sample_id + 1
                        ) % len(server_owner._learning_samples)
                        label, _, hand_count = server_owner._learning_samples[sample_id]
                        server_owner._learning_target = (label, hand_count)
                    self.send_json(
                        200,
                        {
                            "label": label,
                            "sample_id": sample_id,
                            "expected_hand_count": hand_count,
                            "image_url": f"/api/learning/images/{sample_id}",
                            "sample": sample_id + 1,
                            "total": len(server_owner._learning_samples),
                        },
                    )
                    return
                if path.startswith("/api/learning/images/"):
                    sample_key = path.removeprefix("/api/learning/images/")
                    if not sample_key.isascii() or not sample_key.isdecimal():
                        self.send_json(404, {"error": "Learning image not found."})
                        return
                    sample_id = int(sample_key)
                    if not 0 <= sample_id < len(server_owner._learning_samples):
                        self.send_json(404, {"error": "Learning image not found."})
                        return
                    _, image_path, _ = server_owner._learning_samples[sample_id]
                    data = image_path.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                if path == "/stream.mjpg":
                    self.stream_frames()
                    return
                asset = ASSETS.get(path)
                if asset is None:
                    self.send_json(404, {"error": "Not found."})
                    return
                filename, content_type = asset
                data = (WEB_ROOT / filename).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(data)

            def stream_frames(self) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                try:
                    while True:
                        frame = state.latest_jpeg()
                        if frame is not None:
                            self.wfile.write(
                                b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                + str(len(frame)).encode("ascii")
                                + b"\r\n\r\n"
                                + frame
                                + b"\r\n"
                            )
                            self.wfile.flush()
                        time.sleep(0.08)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    return

            def do_PUT(self) -> None:
                path = urlsplit(self.path).path
                if path == "/api/learning/target":
                    try:
                        length = int(self.headers.get("Content-Length", "0"))
                        if not 1 <= length <= 4096:
                            raise ValueError(
                                "Learning target request must be between 1 and 4096 bytes."
                            )
                        payload = json.loads(self.rfile.read(length).decode("utf-8"))
                        if not isinstance(payload, dict) or set(payload) != {"sample_id"}:
                            raise ValueError("Send an object containing only sample_id.")
                        sample_id = payload["sample_id"]
                        if sample_id is not None and (
                            isinstance(sample_id, bool)
                            or not isinstance(sample_id, int)
                            or not 0 <= sample_id < len(server_owner._learning_samples)
                        ):
                            raise ValueError("sample_id is not a registered learning reference.")
                        with server_owner._learning_lock:
                            server_owner._learning_target = (
                                None
                                if sample_id is None
                                else (
                                    server_owner._learning_samples[sample_id][0],
                                    server_owner._learning_samples[sample_id][2],
                                )
                            )
                            target = server_owner._learning_target
                    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                        self.send_json(400, {"error": str(exc)})
                        return
                    self.send_json(
                        200,
                        {
                            "target": (
                                None
                                if target is None
                                else {
                                    "label": target[0],
                                    "expected_hand_count": target[1],
                                }
                            )
                        },
                    )
                    return
                if path != "/api/settings":
                    self.send_json(404, {"error": "Not found."})
                    return
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 1 <= length <= 4096:
                        raise ValueError("Settings request must be between 1 and 4096 bytes.")
                    changes = json.loads(self.rfile.read(length).decode("utf-8"))
                    updated = state.update_settings(changes)
                except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    self.send_json(400, {"error": str(exc)})
                    return
                self.send_json(200, {"settings": updated})

        self._server = ThreadingHTTPServer((host, port), RequestHandler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def address(self) -> tuple[str, int]:
        return self._server.server_address[:2]

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2)

    def learning_target(self) -> tuple[str, int] | None:
        with self._learning_lock:
            return self._learning_target
