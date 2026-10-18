"""FastAPI application factory."""

from __future__ import annotations

import json
import logging
import time

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from mudra_ml.config import project_path
from mudra_ml.fewshot import FewShotConfig
from mudra_ml.streaming import ModelBundle, SegmenterConfig, StreamingRecognizer
from pydantic import BaseModel, Field

from mudra_api import __version__
from mudra_api.library import Library
from mudra_api.recognizer import SignRecognizer, readable
from mudra_api.recordings import RecordingStore, frames_to_sequence, parse_frame
from mudra_api.references import ReferenceClips
from mudra_api.schemas import LetterRequest, PredictRequest, PredictResponse
from mudra_api.settings import Settings
from mudra_api.static_pose import StaticPoseModel, StaticPoseStreamingRecognizer
from mudra_api.static_top10 import StaticTop10Model, StaticTop10StreamingRecognizer, frame_palm_directions
from mudra_api.static_tracking_references import StaticTrackingReferences
from mudra_api.isl500_video import ISL500VideoStreamingRecognizer, ISL500WordModel
from signline_emergency.api import emergency_router

log = logging.getLogger("mudra_api")


class RecordingRequest(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    signer: str = Field(default="anonymous", max_length=64)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    frames: list[dict] = Field(min_length=1, max_length=1200)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="MUDRA API", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-Device-Key", "X-Session-Token"],
    )

    recognizer: SignRecognizer | None = None
    bundle: ModelBundle | None = None
    intro_static_model: StaticPoseModel | None = None
    static_top10_model: StaticTop10Model | None = None
    isl500_video_model: ISL500WordModel | None = None
    common_word_video_recognizer: SignRecognizer | None = None
    common_word_video_bundle: ModelBundle | None = None
    load_error: str | None = None
    segmenter_cfg = SegmenterConfig.load(project_path("training/configs/streaming.json"))
    try:
        recognizer = SignRecognizer(settings.model_dir, settings.device, settings.uncertain_threshold)
        bundle = ModelBundle(settings.model_dir, str(recognizer.device))
        bundle.threshold = recognizer.threshold
        log.info("Loaded model %s (%d signs) on %s", recognizer.name, len(recognizer.classes), recognizer.device)
    except FileNotFoundError as exc:
        load_error = f"Model files not found in {settings.model_dir}: {exc.filename}"
        log.warning(load_error)
    try:
        intro_static_model = StaticPoseModel(settings.intro_static_model)
        log.info(
            "Loaded experimental intro static model (%d classes, %d live-eligible)",
            len(intro_static_model.classes),
            len(intro_static_model.live_labels),
        )
    except FileNotFoundError as exc:
        log.warning("Intro static model is unavailable: %s", exc)
    try:
        static_top10_model = StaticTop10Model(settings.static_top10_model)
        log.info("Loaded experimental top-ten SVM model (%d words)", len(static_top10_model.classes))
    except (FileNotFoundError, ValueError, KeyError, OSError) as exc:
        log.warning("Top-ten SVM model is unavailable: %s", exc)
    try:
        common_word_video_recognizer = SignRecognizer(settings.common_word_video_model_dir, settings.device)
        common_word_video_bundle = ModelBundle(settings.common_word_video_model_dir, str(common_word_video_recognizer.device))
        log.info("Loaded experimental common-word video model (%d words)", len(common_word_video_recognizer.classes))
    except (FileNotFoundError, ValueError, KeyError, OSError) as exc:
        log.info("Common-word video model is unavailable: %s", exc)
    try:
        isl500_video_model = ISL500WordModel(settings.isl500_video_model)
        log.info("Loaded experimental ISL500 video model (%d words)", len(isl500_video_model.classes))
    except (FileNotFoundError, ValueError, KeyError, OSError) as exc:
        log.info("ISL500 video model is unavailable: %s", exc)
    references = ReferenceClips(settings.reference_split)
    # Full v8 reference landmarks are optional local training data. When they are
    # absent, expose real training examples from the bundled common-word video set.
    common_reference_split = project_path("data/metadata/splits/common_word_videos/train.csv")
    common_references = ReferenceClips(
        common_reference_split,
        sources=("ISL500", "CISLR", "INCLUDE"),
        quality_first=True,
    )
    static_tracking_references = StaticTrackingReferences(settings.static_learning_landmarks)
    library = Library(settings.letters_model_dir, settings.letters_landmarks, settings.phrases_model_dir,
                      settings.phrases_split, settings.device)
    store = RecordingStore(settings.recordings_dir, bundle, FewShotConfig.load(project_path("training/configs/fewshot.json")))
    if len(store.bank):
        log.info("Custom words from app recordings: %s", ", ".join(store.bank.labels))

    def require_model() -> SignRecognizer:
        if recognizer is None:
            raise HTTPException(
                status_code=503,
                detail=f"{load_error}. Export one with training/scripts/export_model.py.",
            )
        return recognizer

    @app.get("/")
    def root() -> dict:
        return {"project": "MUDRA", "api_version": __version__, "docs": "/docs"}

    @app.get("/health")
    def health() -> dict:
        active_model = recognizer or intro_static_model or static_top10_model or common_word_video_recognizer or isl500_video_model
        if recognizer is not None:
            num_signs = len([c for c in recognizer.classes if not c.startswith("_")])
            model_name = recognizer.name
            device = str(recognizer.device)
        elif intro_static_model is not None:
            num_signs = len(intro_static_model.live_labels)
            model_name = "intro_static"
            device = "cpu"
        elif static_top10_model is not None:
            num_signs = len(static_top10_model.live_labels)
            model_name = "top10_v2"
            device = "cpu"
        elif common_word_video_recognizer is not None:
            num_signs = len([c for c in common_word_video_recognizer.classes if not c.startswith("_")])
            model_name = "common_word_video"
            device = str(common_word_video_recognizer.device)
        elif isl500_video_model is not None:
            num_signs = len(isl500_video_model.live_labels)
            model_name = "isl500_video"
            device = "cpu"
        else:
            num_signs = 0
            model_name = None
            device = None
        return {
            "status": "ok",
            "model_loaded": active_model is not None,
            "model": model_name,
            "num_signs": num_signs,
            "device": device,
            "error": load_error,
            "custom_words": len(store.bank),
        }

    @app.get("/labels")
    def labels(model: str = "sequence") -> dict:
        if model == "common_word_video":
            if common_word_video_recognizer is None:
                raise HTTPException(status_code=503, detail="The common-word video experiment is not installed.")
            return {"count": len(common_word_video_recognizer.classes), "labels": [
                {"sign": label, "label": readable(label), "has_reference": False}
                for label in common_word_video_recognizer.classes if not label.startswith("_")
            ]}
        if model == "isl500_video":
            if isl500_video_model is None:
                raise HTTPException(status_code=503, detail="The ISL500 temporal pilot is not installed.")
            return {"count": len(isl500_video_model.classes), "labels": [
                {"sign": label, "label": readable(label), "has_reference": False, "live": True}
                for label in isl500_video_model.classes
            ]}
        if model == "intro_static":
            if intro_static_model is None:
                raise HTTPException(status_code=503, detail="The expanded introduction model is not installed.")
            return {
                "count": len(set(intro_static_model.classes)),
                "labels": [
                    {
                        "sign": label,
                        "label": readable(label),
                        "has_reference": False,
                        "live": label in intro_static_model.live_labels,
                    }
                    for label in sorted(set(intro_static_model.classes))
                ],
            }
        if model == "top10_v2":
            if static_top10_model is None:
                raise HTTPException(status_code=503, detail="The top-ten SVM experiment is not installed.")
            return {"count": len(static_top10_model.classes), "labels": [
                {"sign": label, "label": readable(label), "has_reference": False, "live": True}
                for label in static_top10_model.classes
            ]}
        if model != "sequence":
            raise HTTPException(status_code=400, detail="Unknown recognition model.")
        rec = require_model()
        signs = [c for c in rec.classes if not c.startswith("_")]
        tested = rec.card.get("per_word_test", {})
        return {"count": len(signs), "labels": [
            {"sign": c, "label": readable(c), "has_reference": (
                c in references.available
                or c in common_references.available
                or c in static_tracking_references.available
            ),
             **({"test_correct": tested[c]["correct"], "test_clips": tested[c]["clips"]} if c in tested else {})}
            for c in signs]}

    @app.get("/reference/{sign}")
    def reference(sign: str) -> dict:
        """One real training example of a sign as landmark frames, so people can see which sign the model learned."""
        found = (
            references.get(sign.upper())
            or common_references.get(sign.upper())
            or static_tracking_references.get(sign.upper())
            or library.reference(sign.upper())
        )
        if found is None:
            raise HTTPException(
                status_code=404,
                detail=f"No tracked reference clip is installed for {readable(sign.upper())} yet.",
            )
        sign_id = found["sign"]
        label = f"Letter {sign_id.removeprefix('LETTER_')}" if sign_id.startswith("LETTER_") else readable(sign_id)
        return {**found, "label": label}

    @app.get("/static-reference/{sign}")
    def static_reference(sign: str) -> dict:
        """A single held-out, tracker-extracted static image example for the Learning interface."""
        found = static_tracking_references.get(sign.upper())
        if found is None:
            raise HTTPException(status_code=404, detail=f"no static tracking example for {sign}")
        return found

    @app.get("/model")
    def model_card() -> dict:
        rec = require_model()
        card = {k: v for k, v in rec.card.items() if k not in ("feature_mean", "feature_std", "classes")}
        card["num_signs"] = len([c for c in rec.classes if not c.startswith("_")])
        card["active_threshold"] = rec.threshold
        return card

    @app.get("/models")
    def models() -> dict:
        available = []

        def evaluation(
            metrics: dict | None, *, split: str = "test", samples: int | None = None,
            split_label: str = "held-out clip test",
        ) -> dict:
            result = (metrics or {}).get(split, {})
            accuracy = result.get("accuracy")
            return {
                "test_accuracy": float(accuracy) if accuracy is not None else None,
                "accuracy_split": split_label if accuracy is not None else None,
                "accuracy_samples": samples or result.get("n"),
            }

        def read_json(path) -> dict:
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError, OSError):
                return {}

        if recognizer is not None:
            count = len([c for c in recognizer.classes if not c.startswith("_")])
            available.append({
                "id": "sequence",
                "name": recognizer.name,
                "trained_words": count,
                "live_words": count,
                "experimental": False,
                **evaluation(
                    recognizer.card.get("metrics"), samples=recognizer.card.get("metrics", {}).get("test_samples"),
                    split_label="held-out clip test",
                ),
            })
        if intro_static_model is not None:
            intro_card = read_json(settings.intro_static_model.with_name("mudra_intro_static_pose_medoids_v1.json"))
            available.append({
                "id": "intro_static",
                "name": "Expanded introduction (static pose)",
                "trained_words": len(set(intro_static_model.classes)),
                "live_words": len(intro_static_model.live_labels),
                "experimental": True,
                "test_accuracy": intro_card.get("test_accuracy"),
                "accuracy_split": "exploratory held-out image test" if intro_card.get("test_accuracy") is not None else None,
                "accuracy_samples": intro_card.get("test_samples"),
                "words": [
                    {"label": label, "live": label in intro_static_model.live_labels}
                    for label in sorted(set(intro_static_model.classes))
                ],
            })
        if static_top10_model is not None:
            top10_report = read_json(project_path("experiments/reports/static_signs/top10_v2/static_top10_v2_report.json"))
            available.append({
                "id": "top10_v2",
                "name": "Top 10 · grouped SVM v2 (experimental)",
                "trained_words": len(static_top10_model.classes),
                "live_words": len(static_top10_model.live_labels),
                "experimental": True,
                "test_accuracy": top10_report.get("test_accuracy"),
                "accuracy_split": "grouped held-out photo test" if top10_report.get("test_accuracy") is not None else None,
                "accuracy_samples": top10_report.get("test_examples"),
                "words": [{"label": label, "live": True} for label in static_top10_model.classes],
            })
        if common_word_video_recognizer is not None:
            count = len([c for c in common_word_video_recognizer.classes if not c.startswith("_")])
            available.append({
                "id": "common_word_video",
                "name": "Common word videos · signer-held-out (experimental)",
                "trained_words": count,
                "live_words": count,
                "experimental": True,
                **evaluation(
                    common_word_video_recognizer.card.get("metrics"),
                    samples=common_word_video_recognizer.card.get("metrics", {}).get("test_samples"),
                    split_label="signer-held-out clip test",
                ),
            })
        if isl500_video_model is not None:
            isl500_report = read_json(project_path("experiments/reports/isl500_sentence_subset/model_report.json"))
            available.append({
                "id": "isl500_video",
                "name": "ISL500 video pilot · signer-held-out (experimental)",
                "trained_words": len(isl500_video_model.classes),
                "live_words": len(isl500_video_model.live_labels),
                "experimental": True,
                "test_accuracy": isl500_report.get("test_accuracy"),
                "accuracy_split": "locked signer-held-out clip test" if isl500_report.get("test_accuracy") is not None else None,
                "accuracy_samples": isl500_report.get("test_samples"),
                "words": [{"label": label, "live": True} for label in isl500_video_model.classes],
            })
        return {"models": available}

    events_log = settings.events_log

    def log_sign(event: dict) -> None:
        """One line per finished sign (decision summary only, never landmarks) for diagnosing live use."""
        res = event.get("result") or {}
        line = {"event": event["event"], **(event.get("stats") or {}),
                "status": res.get("status"), "sign": res.get("sign"), "custom": bool(res.get("custom")),
                "top": [(c["sign"], round(c["confidence"], 3)) for c in res.get("top_k", [])],
                "background": round(float(res.get("background", 0.0)), 3)}
        log_line(line)

    def log_line(line: dict) -> None:
        line = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), **line}
        try:
            events_log.parent.mkdir(parents=True, exist_ok=True)
            with events_log.open("a", encoding="utf-8") as f:
                f.write(json.dumps(line) + "\n")
        except OSError:
            pass

    session_dir = settings.session_dir
    # Browser diagnostics written to the events log (numbers and the camera's name; never landmarks)
    DIAG_KEYS = ("camera_fps", "tracking_fps", "inference_ms", "delegate", "camera", "width", "height")
    DIAG_LOG_EVERY_S = 60.0
    max_session_frames = 30 * 60 * 20  # 20 minutes at 30 fps

    def save_session(frames: list, width: int, height: int, diag: dict) -> None:
        """Opt-in (MUDRA_SESSION_DIR): one live session's landmarks, for offline replay."""
        if session_dir is None or len(frames) < 30:
            return
        try:
            session_dir.mkdir(parents=True, exist_ok=True)
            seq = frames_to_sequence(frames, width, height, {"source": "live_session", "client": diag,
                                                              "segmenter": segmenter_cfg.to_dict(),
                                                              "model": bundle.name if bundle else None})
            seq.save(session_dir / f"session_{time.strftime('%Y%m%d-%H%M%S')}.npz")
        except (OSError, ValueError):
            pass

    @app.websocket("/stream")
    async def stream(ws: WebSocket) -> None:
        """Live recognition. Client sends {"type":"start","width","height"} then
        {"type":"frame","t":seconds,"hands":[{landmarks,handedness,score}],"pose":[[x,y,z,v]]|null}.
        Server replies only on changes: sign_started, sign_ended (+result), too_short."""
        await ws.accept()
        if bundle is None and intro_static_model is None and static_top10_model is None and common_word_video_bundle is None and isl500_video_model is None:
            await ws.send_json({"event": "error", "detail": load_error})
            await ws.close()
            return
        session: StreamingRecognizer | StaticPoseStreamingRecognizer | StaticTop10StreamingRecognizer | ISL500VideoStreamingRecognizer | None = None
        frames: list = []
        size, diag, diag_logged = (0, 0), {}, -1e9
        try:
            while True:
                msg = await ws.receive_json()
                if msg.get("type") == "start":
                    save_session(frames, *size, diag)
                    frames, size = [], (int(msg["width"]), int(msg["height"]))
                    model_id = msg.get("model", "sequence")
                    if model_id == "intro_static":
                        if intro_static_model is None:
                            await ws.send_json({
                                "event": "error",
                                "detail": "The expanded introduction model is not installed on this server.",
                            })
                            await ws.close()
                            return
                        session = StaticPoseStreamingRecognizer(intro_static_model, *size)
                    elif model_id == "top10_v2":
                        if static_top10_model is None:
                            await ws.send_json({"event": "error", "detail": "The top-ten SVM experiment is not installed."})
                            await ws.close()
                            return
                        session = StaticTop10StreamingRecognizer(static_top10_model, *size)
                    elif model_id == "common_word_video":
                        if common_word_video_bundle is None:
                            await ws.send_json({"event": "error", "detail": "The common-word video experiment is not installed."})
                            await ws.close()
                            return
                        session = StreamingRecognizer(common_word_video_bundle, segmenter_cfg, *size)
                    elif model_id == "isl500_video":
                        if isl500_video_model is None:
                            await ws.send_json({"event": "error", "detail": "The ISL500 temporal pilot is not installed."})
                            await ws.close()
                            return
                        session = ISL500VideoStreamingRecognizer(isl500_video_model, segmenter_cfg, *size)
                    elif model_id == "sequence":
                        if bundle is None:
                            await ws.send_json({"event": "error", "detail": "The deployed sequence model is not installed."})
                            await ws.close()
                            return
                        session = StreamingRecognizer(bundle, segmenter_cfg, *size, store.bank)
                    else:
                        await ws.send_json({"event": "error", "detail": "Unknown recognition model."})
                        await ws.close()
                        return
                    continue
                if msg.get("type") == "diag":  # client tracking diagnostics (fps, delegate), kept with a saved session
                    diag = {k: msg[k] for k in DIAG_KEYS if k in msg}
                    now = time.monotonic()
                    if now - diag_logged >= DIAG_LOG_EVERY_S:  # first report of a session, then once a minute
                        diag_logged = now
                        log_line({"event": "client_diag", **diag})
                    continue
                if msg.get("type") != "frame" or session is None:
                    continue
                frame = parse_frame(msg)
                if session_dir is not None and len(frames) < max_session_frames:
                    frames.append(frame)
                if isinstance(session, StaticTop10StreamingRecognizer):
                    event = session.push(frame, frame_palm_directions(msg, frame))
                else:
                    event = session.push(frame)
                if event and event["event"] in ("sign_ended", "too_short"):
                    log_sign(event)
                if event:
                    if "guess" in event:
                        event["guess"]["label"] = readable(event["guess"]["sign"])
                    if "result" in event:
                        for item in event["result"]["top_k"]:
                            item["label"] = readable(item["sign"])
                        sign = event["result"]["sign"]
                        event["result"]["label"] = readable(sign) if sign else None
                    await ws.send_json(event)
        except WebSocketDisconnect:
            save_session(frames, *size, diag)
            return

    @app.get("/events")
    def events(limit: int = 500) -> dict:
        """Latest lines of the live decision log (sign results and browser diagnostics; never landmarks),
        newest first, for the admin Records and Reports pages."""
        limit = max(1, min(int(limit), 5000))
        if not events_log.exists():
            return {"total": 0, "events": []}
        lines = events_log.read_text(encoding="utf-8", errors="replace").splitlines()
        out = []
        for line in reversed(lines):
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
            if len(out) >= limit:
                break
        return {"total": len(lines), "events": out}

    @app.get("/recordings")
    def recordings() -> dict:
        signs = store.summary()
        for s in signs:
            s["label"] = readable(s["sign"])
        return {"total": sum(s["recordings"] for s in signs), "signs": signs,
                "custom_words": [{"sign": w, "label": readable(w), "examples": n}
                                 for w, n in zip(store.bank.labels, store.bank.counts)]}

    @app.post("/recordings")
    def add_recording(req: RecordingRequest) -> dict:
        try:
            frames = [parse_frame(f) for f in req.frames]
            saved = store.add(req.label, req.signer, frames, req.width, req.height)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid recording: {exc}") from exc
        saved["label_readable"] = readable(saved["label"])
        saved["custom_active"] = saved["label"] in store.bank.labels
        saved["in_model"] = saved["label"] in store.known
        return saved

    @app.delete("/recordings/{sample_id}")
    def delete_recording(sample_id: str) -> dict:
        if not store.delete(sample_id):
            raise HTTPException(status_code=404, detail="recording not found")
        return {"deleted": sample_id}

    @app.get("/library")
    def library_listing() -> dict:
        """Letters and phrases available besides the word model's vocabulary (/labels)."""
        return library.listing()

    @app.post("/letters/predict")
    def predict_letter(req: LetterRequest) -> dict:
        if library.letter_model is None:
            raise HTTPException(status_code=503, detail="no letter model loaded")
        frames = [[np.asarray(h.landmarks, np.float32) for h in f.hands] for f in req.frames]
        result = library.letter_model.predict_frames(frames, req.width, req.height, req.top_k)
        result["sign"] = f"LETTER_{result['letter']}" if result["letter"] else None
        for t in result["top_k"]:
            t["sign"], t["label"] = f"LETTER_{t['letter']}", t["letter"]
        return result

    @app.post("/phrases/predict", response_model=PredictResponse)
    def predict_phrase(req: PredictRequest) -> dict:
        if library.phrase_model is None:
            raise HTTPException(status_code=503, detail="no phrase model loaded")
        return library.phrase_model.predict(req, settings.min_hand_rate)

    @app.post("/predict", response_model=PredictResponse)
    def predict(req: PredictRequest) -> dict:
        return require_model().predict(req, settings.min_hand_rate)

    app.include_router(emergency_router())  # SignLine Emergency (self-contained, /api/v1/emergency)
    return app
