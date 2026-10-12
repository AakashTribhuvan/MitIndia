# MUDRA Architecture

Short summary. The detailed, maintained version is `HANDOVER.md` (Sections 4-11).

## Runtime

| Layer | Component | Responsibility |
|---|---|---|
| Browser | `app/frontend/src/services/handTracker.js` | MediaPipe Tasks HandLandmarker + PoseLandmarker on the webcam (models and WASM served locally) |
| Browser | `app/frontend/src/services/signRecognizer.js` | Streams each frame's landmarks over WebSocket `/stream`; receives sign_started / provisional / sign_ended events |
| Browser | `app/frontend/src/pages/CommunicatePage.jsx` | Shows Signing… and "Looks like X" states, adds words automatically (unsure ones with one-tap replacements), speaks the sentence after a pause, framing and frame-rate warnings, "What can I sign?" list with "How to sign it" examples |
| Browser | `app/frontend/src/pages/RecordPage.jsx` | Records signs with a countdown (landmarks only) for training and as new custom words |
| Backend | `app/backend/mudra_api/app.py` | FastAPI: `/health`, `/labels`, `/model`, `/predict` (one clip), `/stream` (live), `/recordings` (GET / POST / DELETE) |
| Backend | `app/backend/mudra_api/references.py` | "How to sign it": one real training example per word as landmark frames (`/reference/{sign}`) |
| Backend | `app/backend/mudra_api/recordings.py` | Stores app recordings as `.npz` + `data/metadata/manifest_app.csv` (signer and session groups) and keeps the custom-word bank |
| Shared | `training/src/mudra_ml/fewshot.py` | Custom words: prototype of each word's recorded examples in the model's embedding space; accepted only when the model is not confident about a known word (limits in `training/configs/fewshot.json`) |
| Shared | `training/src/mudra_ml/streaming.py` | SignSegmenter (resting → signing → ended) and StreamingRecognizer (whole-sign classification, smoothing, thresholds, cooldown). The live API and the benchmarks use the same code |
| Model | `app/backend/models/isl_mudra_combined_v6_bilstm` | Landmark MLP → BiLSTM → attention pooling; 314 words plus a "no sign" class |

When the backend is offline, the Communicate page falls back to the rule-based matcher in
`islClassifier.js` (8 static signs). The Practice page always uses that rule engine for its
coaching feedback.

## Training pipeline

1. `extract_landmarks.py`: decodes video and runs MediaPipe Tasks, saving raw landmarks only (`.npz`) plus a manifest.
2. `make_splits.py`: grouped splits; signers or recordings never cross splits; content-hash dedupe; optional session hold-out.
3. `train.py` / `run_ablation.py`: PyTorch training with augmentation, mirror and "no sign" samples (including synthetic fidgets), and early stopping on validation macro-F1.
4. `evaluate.py`: per-source metrics and temperature calibration.
5. `eval_continuous.py`: live-use benchmark (continuous streams; normal, close-up and hands-resting framings; frame-rate cap); `--tune` / `--tune-threshold-only` choose the segmenter and decision settings on validation. `eval_fewshot.py`: new words from k recordings.
6. `export_model.py`: `model.pt` (weights only) plus `model_card.json` (classes, feature stats, threshold, metrics, data sources, limitations).
