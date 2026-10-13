"""Preview a webcam and draw the upper-body landmarks needed for MUDRA.

On Windows, the camera index is backend- and driver-dependent. Index 1 is only
an initial guess; use --list-cameras to inspect readable sources and brightness.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
import webbrowser

try:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    from static_sign_prototype import (
        StaticPoseRecognizer,
        StaticPredictionStabilizer,
        _pose_array,
        load_learning_examples,
    )
    from web_dashboard import DashboardServer
except ImportError as exc:
    missing = exc.name or "a required package"
    raise SystemExit(
        f"Missing {missing}. From this folder, run: python -m pip install -r requirements.txt"
    ) from exc


ROOT = Path(__file__).resolve().parent
WINDOW_NAME = "MUDRA - hand and pose tracking (press Q to quit)"

# Pose landmarks used here: shoulders, elbows, wrists, coarse hand points and hips.
# This avoids the 21-point-per-hand finger skeleton from Hand Landmarker.
BODY_CONNECTIONS = (
    (11, 12),
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22),
    (11, 23), (12, 24), (23, 24),
)
HAND_CONNECTIONS = (
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
)
FINGER_LANDMARKS = (
    (1, 2, 3, 4),
    (5, 6, 7, 8),
    (9, 10, 11, 12),
    (13, 14, 15, 16),
    (17, 18, 19, 20),
)


@dataclass
class SignActivityTracker:
    start_hold_s: float = 0.15
    stop_hold_s: float = 0.7
    mode_hold_s: float = 0.45
    state: str = "idle"
    candidate_since: float | None = None
    sign_started_at: float | None = None
    rest_since: float | None = None
    completed_end_at: float | None = None
    completed_duration_s: float = 0.0
    mode: str = "idle"
    mode_candidate: str | None = None
    mode_candidate_since: float | None = None

    def update(self, timestamp: float, visible: bool, raised: bool, moving: bool) -> str | None:
        active = visible and (raised or moving)

        if self.state == "idle":
            if active:
                self.state = "starting"
                self.candidate_since = timestamp
            return None

        if self.state == "starting":
            if not active:
                self.state = "idle"
                self.candidate_since = None
                return None
            if self.candidate_since is None:
                self.candidate_since = timestamp
            if timestamp - self.candidate_since >= self.start_hold_s:
                self.state = "signing"
                self.sign_started_at = self.candidate_since
                self.completed_end_at = None
                self.completed_duration_s = 0.0
                self.mode = "dynamic" if moving else "static"
                self.mode_candidate = None
                self.mode_candidate_since = None
                self.candidate_since = None
                return "started"
            return None

        if active:
            if self.state == "ending":
                self.state = "signing"
                self.rest_since = None
            return None

        if self.state == "signing":
            self.state = "ending"
            self.rest_since = timestamp
            return None

        if (
            self.state == "ending"
            and self.rest_since is not None
            and timestamp - self.rest_since >= self.stop_hold_s
        ):
            self.completed_end_at = self.rest_since
            if self.sign_started_at is not None:
                self.completed_duration_s = self.completed_end_at - self.sign_started_at
            self.state = "idle"
            self.rest_since = None
            self.sign_started_at = None
            return "stopped"
        return None

    def update_mode(self, timestamp: float, raised: bool, moving: bool) -> str:
        if self.state not in ("signing", "ending"):
            self.mode = "idle"
            self.mode_candidate = None
            self.mode_candidate_since = None
            return self.mode

        candidate = "dynamic" if moving else "static" if raised else self.mode
        if candidate == self.mode:
            self.mode_candidate = None
            self.mode_candidate_since = None
        elif self.mode_candidate != candidate:
            self.mode_candidate = candidate
            self.mode_candidate_since = timestamp
        elif (
            self.mode_candidate_since is not None
            and timestamp - self.mode_candidate_since >= self.mode_hold_s
        ):
            self.mode = candidate
            self.mode_candidate = None
            self.mode_candidate_since = None
        return self.mode

    def elapsed(self, timestamp: float) -> float:
        if self.sign_started_at is None:
            return 0.0
        elapsed_until = self.rest_since if self.state == "ending" and self.rest_since is not None else timestamp
        return max(0.0, elapsed_until - self.sign_started_at)


def get_backends(selection: str = "auto"):
    available = {
        "dshow": ("DirectShow", getattr(cv2, "CAP_DSHOW", None)),
        "msmf": ("Media Foundation", getattr(cv2, "CAP_MSMF", None)),
    }
    choices = list(available.values()) if selection == "auto" else [available[selection]]
    return [(name, backend) for name, backend in choices if backend is not None]


def open_camera(
    index: int,
    backend_selection: str,
    capture_width: int,
    capture_height: int,
) -> cv2.VideoCapture:
    """Open a camera at the requested resolution, rejecting black frames."""
    readable_but_black = []

    for backend_name, backend in get_backends(backend_selection):
        camera = cv2.VideoCapture(index, backend)
        if camera.isOpened():
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, capture_width)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, capture_height)
            camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # Some virtual-camera backends open successfully but return black frames.
            # Try a few frames before rejecting the backend as a black source.
            for _ in range(3):
                ok, frame = camera.read()
                if not ok or frame is None:
                    continue
                luminance = float(cv2.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))[0])
                if luminance >= 5:
                    print(
                        f"Opened camera {index} with {backend_name}: "
                        f"{frame.shape[1]}x{frame.shape[0]}, mean brightness {luminance:.1f}/255"
                    )
                    return camera
                readable_but_black.append((backend_name, luminance))
        camera.release()

    if readable_but_black:
        tested = ", ".join(f"{name} ({luma:.1f}/255)" for name, luma in readable_but_black)
        raise RuntimeError(
            f"Camera index {index} returned near-black frames with {tested}. "
            "A camera can report opened even when it supplies black pixels; auto mode now skips those frames. "
            "Confirm the index is Camo Camera, install Camo's Windows compatibility add-on, "
            "and try `--backend msmf` or another camera index."
        )

    raise RuntimeError(
        f"Could not read camera {index} with the selected backend(s). Run `python test.py --list-cameras`, "
        "then retry with `python test.py --camera N --backend dshow` or `--backend msmf`."
    )


def list_cameras(max_index: int) -> None:
    """Probe camera indices and print the ones that return a frame."""
    found = False
    backends = get_backends("auto")
    for index in range(max_index + 1):
        for backend_name, backend in backends:
            camera = cv2.VideoCapture(index, backend)
            ok, frame = camera.read() if camera.isOpened() else (False, None)
            camera.release()
            if ok and frame is not None:
                luminance = float(cv2.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))[0])
                signal = "BLACK/NO VIDEO" if luminance < 5 else "video present"
                print(
                    f"Camera {index} [{backend_name}]: {frame.shape[1]}x{frame.shape[0]} "
                    f"(brightness {luminance:.1f}/255; {signal})"
                )
                found = True
    if not found:
        print("No camera indices returned a frame. Check that Camo is connected and its virtual camera is enabled.")


def draw_upper_body(frame, pose_landmarks) -> None:
    if not pose_landmarks:
        cv2.putText(frame, "No upper body detected", (16, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                    (40, 190, 255), 2, cv2.LINE_AA)
        return

    height, width = frame.shape[:2]
    points = [(int(point.x * width), int(point.y * height)) for point in pose_landmarks]
    skeleton_color = (120, 210, 190)

    for start, end in BODY_CONNECTIONS:
        cv2.line(frame, points[start], points[end], skeleton_color, 3, cv2.LINE_AA)

    # Only show joints around each wrist/palm. Pose Landmarker does not estimate fingers.
    visible_indices = (11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24)
    for index in visible_indices:
        radius = 6 if index in (15, 16) else 4
        cv2.circle(frame, points[index], radius, skeleton_color, -1, cv2.LINE_AA)

    face_pair = next(
        (
            (left, right, label)
            for left, right, label in ((7, 8, "EARS"), (2, 5, "EYES"))
            if min(
                float(getattr(pose_landmarks[left], "visibility", 0.0) or 0.0),
                float(getattr(pose_landmarks[right], "visibility", 0.0) or 0.0),
            )
            >= 0.35
        ),
        None,
    )
    if (
        face_pair is not None
        and float(getattr(pose_landmarks[0], "visibility", 0.0) or 0.0) >= 0.35
    ):
        left, right, label = face_pair
        face_color = (255, 230, 120)
        cv2.line(frame, points[left], points[right], face_color, 2, cv2.LINE_AA)
        cv2.circle(frame, points[0], 5, face_color, -1, cv2.LINE_AA)
        cv2.putText(
            frame,
            f"FACE ANCHOR ({label})",
            (points[0][0] + 8, points[0][1] - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            face_color,
            1,
            cv2.LINE_AA,
        )


def draw_hand(
    frame,
    landmarks,
    face_point: tuple[int, int] | None = None,
) -> None:
    height, width = frame.shape[:2]
    points = [(int(point.x * width), int(point.y * height)) for point in landmarks]
    finger_for_landmark = {
        index: finger
        for finger, indices in enumerate(FINGER_LANDMARKS)
        for index in indices
    }

    for start, end in HAND_CONNECTIONS:
        finger = finger_for_landmark.get(end)
        color = (185, 220, 215) if finger is not None else (220, 220, 220)
        cv2.line(frame, points[start], points[end], color, 2, cv2.LINE_AA)

    for index, point in enumerate(points):
        finger = finger_for_landmark.get(index)
        color = (185, 220, 215) if finger is not None else (245, 245, 245)
        cv2.circle(frame, point, 4 if index else 6, color, -1, cv2.LINE_AA)

    index_base, index_tip = points[5], points[8]
    direction_color = (60, 240, 255)
    cv2.arrowedLine(
        frame,
        index_base,
        index_tip,
        direction_color,
        4,
        cv2.LINE_AA,
        tipLength=0.3,
    )
    direction_label = "INDEX DIRECTION"
    if face_point is not None:
        toward_face = (face_point[0] - points[0][0], face_point[1] - points[0][1])
        finger_direction = (
            index_tip[0] - index_base[0],
            index_tip[1] - index_base[1],
        )
        denominator = math.hypot(*toward_face) * math.hypot(*finger_direction)
        alignment = (
            (
                toward_face[0] * finger_direction[0]
                + toward_face[1] * finger_direction[1]
            )
            / denominator
            if denominator > 1e-6
            else 0.0
        )
        direction_label = (
            "POINTING TOWARD FACE"
            if alignment > 0.35
            else "POINTING AWAY FROM FACE"
            if alignment < -0.35
            else "POINTING ACROSS"
        )
    text_position = (
        min(max(8, index_tip[0] + 8), max(8, width - 230)),
        min(max(20, index_tip[1] - 8), height - 8),
    )
    cv2.putText(
        frame,
        direction_label,
        text_position,
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        direction_color,
        2,
        cv2.LINE_AA,
    )


def draw_clean_inset(frame, clean_frame) -> None:
    width = frame.shape[1]
    inset_width = min(width // 4, 360)
    inset_height = int(inset_width * clean_frame.shape[0] / clean_frame.shape[1])
    inset = cv2.resize(clean_frame, (inset_width, inset_height), interpolation=cv2.INTER_AREA)
    x, y = width - inset_width - 16, 48
    frame[y:y + inset_height, x:x + inset_width] = inset
    cv2.rectangle(frame, (x, y), (x + inset_width, y + inset_height), (245, 245, 245), 2)
    cv2.putText(
        frame,
        "CLEAN CAMERA",
        (x + 8, y + 22),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def draw_sign_box(frame, hand_landmarks, label: str, color: tuple[int, int, int]) -> None:
    if not hand_landmarks:
        return

    height, width = frame.shape[:2]
    points = [
        (int(landmark.x * width), int(landmark.y * height))
        for hand in hand_landmarks
        for landmark in hand
    ]
    min_x = min(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_x = max(point[0] for point in points)
    max_y = max(point[1] for point in points)
    padding = max(12, int(max(max_x - min_x, max_y - min_y) * 0.12))
    top_left = (max(0, min_x - padding), max(0, min_y - padding))
    bottom_right = (min(width - 1, max_x + padding), min(height - 1, max_y + padding))

    cv2.rectangle(frame, top_left, bottom_right, color, 3, cv2.LINE_AA)
    label_y = max(22, top_left[1] - 8)
    cv2.putText(
        frame,
        label,
        (top_left[0], label_y),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        color,
        2,
        cv2.LINE_AA,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Track finger joints, hands and upper-body pose with MediaPipe."
    )
    parser.add_argument(
        "--camera",
        type=int,
        default=1,
        help="OpenCV camera index (default: 1, often the external/Camo camera)",
    )
    parser.add_argument(
        "--backend",
        choices=("auto", "dshow", "msmf"),
        default="auto",
        help="Camera capture backend; auto tries both and skips black frames (default: auto)",
    )
    parser.add_argument("--list-cameras", action="store_true", help="Probe camera indices 0 through --max-index")
    parser.add_argument("--max-index", type=int, default=8, help="Last camera index to probe (default: 8)")
    parser.add_argument(
        "--model",
        type=Path,
        default=ROOT / "models" / "pose_landmarker_lite.task",
        help="Path to a MediaPipe pose_landmarker_lite.task file",
    )
    parser.add_argument(
        "--hand-model",
        type=Path,
        default=ROOT / "models" / "hand_landmarker.task",
        help="Path to a MediaPipe hand_landmarker.task file",
    )
    parser.add_argument(
        "--capture-width",
        type=int,
        default=1920,
        help="Requested camera capture width (default: 1920)",
    )
    parser.add_argument(
        "--capture-height",
        type=int,
        default=1080,
        help="Requested camera capture height (default: 1080)",
    )
    parser.add_argument(
        "--max-width",
        type=int,
        default=0,
        help="Resize before inference to this maximum width; 0 keeps the camera's native frame size (default: 0)",
    )
    parser.add_argument(
        "--pose-every",
        type=int,
        default=2,
        help="Run pose inference every N frames, reusing the last result between runs (default: 2)",
    )
    parser.add_argument(
        "--show-clean-inset",
        action="store_true",
        help="Show an unannotated picture-in-picture view from the same live camera frame",
    )
    parser.add_argument(
        "--start-hold",
        type=float,
        default=0.15,
        help="Activity needed to confirm a sign start, in seconds (default: 0.15)",
    )
    parser.add_argument(
        "--stop-hold",
        type=float,
        default=0.7,
        help="Rest needed to confirm a sign stop, in seconds (default: 0.7)",
    )
    parser.add_argument(
        "--movement-threshold",
        type=float,
        default=1.0,
        help="Wrist speed that counts as movement, in shoulder widths per second (default: 1.0)",
    )
    parser.add_argument(
        "--raised-below-shoulder",
        type=float,
        default=0.55,
        help="A wrist above this distance below the shoulder line counts as held/raised, "
        "in shoulder widths (default: 0.55)",
    )
    parser.add_argument(
        "--mode-hold",
        type=float,
        default=0.45,
        help="How long movement/static evidence must persist before changing the displayed mode "
        "(default: 0.45 seconds)",
    )
    parser.add_argument(
        "--web-ui",
        action="store_true",
        help="Serve the responsive browser dashboard and live camera preview",
    )
    parser.add_argument(
        "--web-host",
        default="127.0.0.1",
        help="Dashboard bind address; use 0.0.0.0 to allow trusted LAN devices (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--web-port",
        type=int,
        default=8765,
        help="Dashboard port (default: 8765)",
    )
    parser.add_argument(
        "--open-web-ui",
        action="store_true",
        help="Open the dashboard in the default browser (also enables --web-ui)",
    )
    parser.add_argument(
        "--static-demo",
        action="store_true",
        help="Enable experimental live matching against the selected still-image pose classes",
    )
    parser.add_argument(
        "--static-model",
        type=Path,
        default=ROOT / "training_data" / "models" / "static_pose_medoids.npz",
        help="Static-pose model used with --static-demo",
    )
    args = parser.parse_args()

    if args.capture_width <= 0 or args.capture_height <= 0:
        parser.error("--capture-width and --capture-height must be positive")
    if args.max_width < 0:
        parser.error("--max-width must be 0 (native size) or a positive width")
    if args.pose_every < 1:
        parser.error("--pose-every must be at least 1")
    if not all(
        math.isfinite(value)
        for value in (
            args.start_hold,
            args.stop_hold,
            args.movement_threshold,
            args.raised_below_shoulder,
            args.mode_hold,
        )
    ):
        parser.error("All sign-activity thresholds must be finite numbers")
    if args.start_hold < 0 or args.stop_hold <= 0:
        parser.error("--start-hold must be non-negative and --stop-hold must be positive")
    if args.movement_threshold <= 0 or args.raised_below_shoulder < 0 or args.mode_hold <= 0:
        parser.error(
            "--movement-threshold and --mode-hold must be positive and "
            "--raised-below-shoulder non-negative"
        )
    if not 1 <= args.web_port <= 65535:
        parser.error("--web-port must be between 1 and 65535")
    if args.open_web_ui or args.static_demo:
        args.web_ui = True
    if args.web_ui and not (
        0.05 <= args.start_hold <= 1.0
        and 0.2 <= args.stop_hold <= 2.0
        and 0.2 <= args.movement_threshold <= 4.0
        and 0.0 <= args.raised_below_shoulder <= 1.5
        and 0.1 <= args.mode_hold <= 1.5
    ):
        parser.error(
            "When using --web-ui, initial thresholds must fit the dashboard slider ranges: "
            "--start-hold 0.05..1.0, --stop-hold 0.2..2.0, "
            "--movement-threshold 0.2..4.0, --raised-below-shoulder 0..1.5, "
            "--mode-hold 0.1..1.5"
        )

    if args.list_cameras:
        list_cameras(args.max_index)
        return 0
    if not args.model.is_file():
        print(f"Pose landmarker model not found: {args.model}", file=sys.stderr)
        return 2
    if not args.hand_model.is_file():
        print(f"Hand landmarker model not found: {args.hand_model}", file=sys.stderr)
        return 2
    static_recognizer = None
    if args.static_demo:
        try:
            static_recognizer = StaticPoseRecognizer(args.static_model)
        except (FileNotFoundError, OSError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(
            "Experimental static-pose demo enabled. Labels and the "
            "I_ME_MINE_MY folder class are unverified."
        )

    camera = None
    dashboard = None
    dashboard_started = False
    try:
        camera = open_camera(
            args.camera,
            args.backend,
            args.capture_width,
            args.capture_height,
        )

        pose_options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(args.model)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        hand_options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(args.hand_model)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        print(
            f"Tracking fingers, hands and pose at native capture resolution "
            f"(requested {args.capture_width}x{args.capture_height})."
        )
        start_time = time.monotonic()
        previous_timestamp_ms = -1
        frames = 0
        fps_started = start_time
        displayed_fps = 0.0
        frame_count = 0
        last_pose = None
        activity_tracker = SignActivityTracker(
            args.start_hold,
            args.stop_hold,
            mode_hold_s=args.mode_hold,
        )
        prediction_stabilizer = StaticPredictionStabilizer()
        previous_wrists = {}
        previous_tracking_time = None
        max_wrist_speed = 0.0
        any_wrist_raised = False

        if args.web_ui:
            learning_profiles = None
            if static_recognizer is not None:
                learning_profiles = static_recognizer.supported_learning_profiles()
            dashboard = DashboardServer(
                args.web_host,
                args.web_port,
                {
                    "start_hold": args.start_hold,
                    "stop_hold": args.stop_hold,
                    "movement_threshold": args.movement_threshold,
                    "raised_below_shoulder": args.raised_below_shoulder,
                    "mode_hold": args.mode_hold,
                },
                learning_examples=load_learning_examples(learning_profiles),
            )
            dashboard.start()
            dashboard_started = True
            dashboard_host, dashboard_port = dashboard.address
            dashboard_url = f"http://127.0.0.1:{dashboard_port}/"
            if dashboard_host not in ("127.0.0.1", "localhost"):
                dashboard_url += " (for phone: use this computer's LAN IP)"
            print(f"Dashboard: {dashboard_url}")
            if args.open_web_ui:
                webbrowser.open(f"http://127.0.0.1:{dashboard_port}/")
            if dashboard_host not in ("127.0.0.1", "localhost"):
                print("LAN access is enabled; open http://<this-computer-LAN-IP>:"
                      f"{dashboard_port}/ on a trusted device on the same network.")
            print("Press Ctrl+C in this terminal to stop the tracker and dashboard.")
        else:
            print("Press Q or Esc in the preview window to quit.")

        with (
            vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker,
            vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker,
        ):
            while True:
                ok, frame = camera.read()
                if not ok or frame is None:
                    raise RuntimeError("The webcam stopped returning frames.")

                # Mirror the preview like a selfie camera; MediaPipe detects on this same image.
                clean_frame = cv2.flip(frame, 1)
                frame = clean_frame.copy()
                inference_frame = clean_frame
                if args.max_width and inference_frame.shape[1] > args.max_width:
                    ratio = args.max_width / inference_frame.shape[1]
                    inference_frame = cv2.resize(
                        inference_frame,
                        (args.max_width, int(inference_frame.shape[0] * ratio)),
                        interpolation=cv2.INTER_AREA,
                    )
                rgb = cv2.cvtColor(inference_frame, cv2.COLOR_BGR2RGB)
                brightness = float(cv2.mean(cv2.cvtColor(clean_frame, cv2.COLOR_BGR2GRAY))[0])
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                timestamp_ms = int((time.monotonic() - start_time) * 1000)
                timestamp_ms = max(timestamp_ms, previous_timestamp_ms + 1)
                previous_timestamp_ms = timestamp_ms
                hand_result = hand_landmarker.detect_for_video(image, timestamp_ms)
                if frame_count % args.pose_every == 0 or last_pose is None:
                    pose_result = pose_landmarker.detect_for_video(image, timestamp_ms)
                    last_pose = pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
                frame_count += 1

                if dashboard is not None:
                    settings = dashboard.state.settings()
                    activity_tracker.start_hold_s = settings["start_hold"]
                    activity_tracker.stop_hold_s = settings["stop_hold"]
                    activity_tracker.mode_hold_s = settings["mode_hold"]
                    movement_threshold = settings["movement_threshold"]
                    raised_below_shoulder = settings["raised_below_shoulder"]
                else:
                    movement_threshold = args.movement_threshold
                    raised_below_shoulder = args.raised_below_shoulder

                frame_height, frame_width = frame.shape[:2]
                shoulder_center_y = None
                shoulder_width = frame_width * 0.25
                if last_pose and len(last_pose) > 12:
                    left_shoulder, right_shoulder = last_pose[11], last_pose[12]
                    if min(left_shoulder.visibility, right_shoulder.visibility) >= 0.5:
                        left_xy = (left_shoulder.x * frame_width, left_shoulder.y * frame_height)
                        right_xy = (right_shoulder.x * frame_width, right_shoulder.y * frame_height)
                        shoulder_center_y = (left_xy[1] + right_xy[1]) / 2
                        shoulder_width = max(
                            1.0,
                            ((left_xy[0] - right_xy[0]) ** 2 + (left_xy[1] - right_xy[1]) ** 2) ** 0.5,
                        )

                draw_upper_body(frame, last_pose)
                current_wrists = {}
                max_wrist_speed = 0.0
                any_wrist_raised = False
                for hand_index, hand_landmarks in enumerate(hand_result.hand_landmarks):
                    wrist = hand_landmarks[0]
                    wrist_xy = (wrist.x * frame_width, wrist.y * frame_height)
                    tracking_id = f"hand_{hand_index}"
                    current_wrists[tracking_id] = wrist_xy
                    if shoulder_center_y is not None:
                        any_wrist_raised |= (
                            wrist_xy[1] <= shoulder_center_y + raised_below_shoulder * shoulder_width
                        )
                    else:
                        any_wrist_raised |= wrist.y < 0.55
                    previous = previous_wrists.get(tracking_id)
                    if previous and previous_tracking_time is not None:
                        dt = max(1e-3, timestamp_ms / 1000 - previous_tracking_time)
                        distance = ((wrist_xy[0] - previous[0]) ** 2 + (wrist_xy[1] - previous[1]) ** 2) ** 0.5
                        max_wrist_speed = max(max_wrist_speed, distance / shoulder_width / dt)
                previous_wrists = current_wrists
                previous_tracking_time = timestamp_ms / 1000
                is_moving = max_wrist_speed >= movement_threshold
                event = activity_tracker.update(
                    timestamp_ms / 1000,
                    visible=bool(hand_result.hand_landmarks),
                    raised=any_wrist_raised,
                    moving=is_moving,
                )
                mode = activity_tracker.update_mode(
                    timestamp_ms / 1000,
                    raised=any_wrist_raised,
                    moving=is_moving,
                )
                recognition = {
                    "enabled": static_recognizer is not None,
                    "state": "disabled" if static_recognizer is None else "waiting",
                    "label": None,
                    "nearest_label": None,
                    "distance": None,
                    "threshold": None,
                    "threshold_source": None,
                    "reason": None,
                }
                if static_recognizer is not None:
                    static_active = activity_tracker.state == "signing" and mode == "static"
                    if static_active:
                        inference_height, inference_width = inference_frame.shape[:2]
                        raw_prediction = static_recognizer.predict_landmarks(
                            last_pose,
                            hand_result.hand_landmarks,
                            inference_width,
                            inference_height,
                        )
                        stable_label, prediction_state = prediction_stabilizer.update(
                            timestamp_ms / 1000,
                            raw_prediction.get("prediction"),
                            active=True,
                        )
                        recognition.update(
                            {
                                "state": (
                                    "tracking"
                                    if raw_prediction.get("prediction") is None
                                    and raw_prediction.get("reason")
                                    not in (
                                        "distance_exceeds_experimental_threshold",
                                        "no_reliable_validation_threshold",
                                    )
                                    and not str(raw_prediction.get("reason", "")).endswith(
                                        "_requires_2_tracked_hands"
                                    )
                                    else prediction_state
                                ),
                                "label": stable_label,
                                "nearest_label": raw_prediction.get("nearest_label"),
                                "distance": raw_prediction.get("distance"),
                                "threshold": raw_prediction.get("threshold"),
                                "threshold_source": raw_prediction.get("threshold_source"),
                                "reason": raw_prediction.get("reason"),
                                "torso_anchor_source": raw_prediction.get(
                                    "torso_anchor_source"
                                ),
                                "face_anchor_source": raw_prediction.get(
                                    "face_anchor_source"
                                ),
                                "required_hand_count": raw_prediction.get(
                                    "required_hand_count"
                                ),
                            }
                        )
                        if raw_prediction.get("prediction") is not None and stable_label is None:
                            recognition["state"] = "confirming"
                    else:
                        prediction_stabilizer.reset()
                        if activity_tracker.state == "signing" and mode == "dynamic":
                            recognition["state"] = "dynamic"
                        elif activity_tracker.state in ("starting", "ending"):
                            recognition["state"] = activity_tracker.state
                if event == "started":
                    if activity_tracker.sign_started_at is None:
                        raise RuntimeError("Sign start event has no start timestamp.")
                    print(
                        f"Sign started at {activity_tracker.sign_started_at:.2f}s "
                        f"(confirmed at {timestamp_ms / 1000:.2f}s)"
                    )
                elif event == "stopped":
                    if activity_tracker.completed_end_at is None:
                        raise RuntimeError("Sign stop event has no end timestamp.")
                    print(
                        f"Sign stopped at {activity_tracker.completed_end_at:.2f}s "
                        f"(confirmed at {timestamp_ms / 1000:.2f}s; "
                        f"duration {activity_tracker.completed_duration_s:.2f}s)"
                    )

                face_point = None
                if (
                    last_pose
                    and len(last_pose) > 8
                    and float(getattr(last_pose[0], "visibility", 0.0) or 0.0) >= 0.35
                ):
                    face_point = (
                        int(last_pose[0].x * frame_width),
                        int(last_pose[0].y * frame_height),
                    )
                for hand_landmarks in hand_result.hand_landmarks:
                    draw_hand(frame, hand_landmarks, face_point)
                if activity_tracker.state in ("starting", "signing", "ending"):
                    if activity_tracker.state == "starting":
                        box_label = "SIGN CANDIDATE"
                        box_color = (0, 220, 255)
                    elif activity_tracker.state == "ending":
                        box_label = "SIGN ENDING"
                        box_color = (0, 150, 255)
                    elif mode == "static":
                        box_label = "STATIC SIGN"
                        box_color = (255, 200, 0)
                    else:
                        box_label = "SIGN IN ACTION"
                        box_color = (80, 240, 160)
                    draw_sign_box(frame, hand_result.hand_landmarks, box_label, box_color)
                if static_recognizer is not None:
                    if recognition["label"]:
                        demo_text = f"STATIC MATCH: {recognition['label']}"
                    elif recognition["state"] == "confirming":
                        demo_text = "STATIC MATCH: confirming..."
                    elif recognition["state"] == "dynamic":
                        demo_text = "STATIC MATCH: static poses only"
                    elif recognition["state"] == "unknown":
                        demo_text = "STATIC MATCH: unknown"
                    elif recognition["state"] == "tracking":
                        demo_text = "STATIC MATCH: check tracking"
                    else:
                        demo_text = "STATIC MATCH: hold a pose"
                    cv2.putText(
                        frame,
                        demo_text,
                        (16, 116),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.62,
                        (40, 220, 255),
                        2,
                        cv2.LINE_AA,
                    )
                if args.show_clean_inset:
                    draw_clean_inset(frame, clean_frame)
                frames += 1
                now = time.monotonic()
                elapsed = now - fps_started
                if elapsed >= 1.0:
                    displayed_fps = frames / elapsed
                    frames = 0
                    fps_started = now

                status = activity_tracker.state.upper()
                if activity_tracker.state == "signing":
                    status = "STATIC HOLD" if mode == "static" else "MOVING"
                elif activity_tracker.state == "ending":
                    status = "ENDING"
                elif activity_tracker.state == "starting":
                    status = "STARTING"
                cv2.putText(
                    frame,
                    f"Sign: {status}  {activity_tracker.elapsed(timestamp_ms / 1000):.1f}s",
                    (16, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (80, 240, 160),
                    2,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame,
                    f"Hands: {len(hand_result.hand_landmarks)}  |  {displayed_fps:.1f} FPS  |  "
                    f"Brightness: {brightness:.1f}/255",
                    (16, 58),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (80, 240, 160),
                    2,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame,
                    f"Wrist speed: {max_wrist_speed:.2f} shoulder-widths/s  |  "
                    f"Raised: {'yes' if any_wrist_raised else 'no'}",
                    (16, 86),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (80, 240, 160),
                    2,
                    cv2.LINE_AA,
                )
                if brightness < 5:
                    cv2.putText(
                        frame,
                        "BLACK CAMERA FEED - verify Camo Camera source/add-on",
                        (16, 62),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (40, 40, 255),
                        2,
                        cv2.LINE_AA,
                    )
                if dashboard is not None:
                    learning_guide = None
                    learning_target = dashboard.learning_target()
                    if (
                        static_recognizer is not None
                        and learning_target is not None
                        and last_pose
                    ):
                        target_label, target_hand_count = learning_target
                        guide_pose, guide_visibility = _pose_array(
                            last_pose,
                            frame_width,
                            frame_height,
                        )
                        try:
                            expected_positions = static_recognizer.expected_hand_positions(
                                target_label,
                                target_hand_count,
                                guide_pose,
                                guide_visibility,
                            )
                        except ValueError as exc:
                            learning_guide = {
                                "label": target_label,
                                "expected_hand_count": target_hand_count,
                                "positions": [],
                                "reason": str(exc),
                            }
                        else:
                            learning_guide = {
                                "label": target_label,
                                "expected_hand_count": target_hand_count,
                                "positions": [
                                    {"x": x, "y": y}
                                    for x, y in expected_positions
                                ],
                                "frame_width": frame_width,
                                "frame_height": frame_height,
                                "marker_radius": (
                                    math.hypot(
                                        *(guide_pose[12, :2] - guide_pose[11, :2])
                                    )
                                    * 0.18
                                ),
                            }
                    encoded_ok, encoded_frame = cv2.imencode(
                        ".jpg",
                        frame,
                        [cv2.IMWRITE_JPEG_QUALITY, 86],
                    )
                    if not encoded_ok:
                        raise RuntimeError("Could not encode the latest frame for the dashboard.")
                    dashboard.state.update_runtime(
                        {
                            "state": activity_tracker.state,
                            "mode": mode,
                            "elapsed": activity_tracker.elapsed(timestamp_ms / 1000),
                            "hands": len(hand_result.hand_landmarks),
                            "fps": displayed_fps,
                            "wrist_speed": max_wrist_speed,
                            "raised": any_wrist_raised,
                            "resolution": f"{frame_width} × {frame_height}",
                            "event": event,
                            "recognition": recognition,
                            "learning_guide": learning_guide,
                        },
                        encoded_frame.tobytes(),
                    )
                else:
                    cv2.imshow(WINDOW_NAME, frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (ord("q"), 27):
                        break
    except KeyboardInterrupt:
        print("Stopped.")
    except (RuntimeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        if dashboard is not None and dashboard_started:
            dashboard.close()
        if camera is not None:
            camera.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
