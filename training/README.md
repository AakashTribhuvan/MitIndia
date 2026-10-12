# MUDRA training pipeline (`mudra_ml`)

Landmark-first ISL recognition: raw videos/images -> MediaPipe landmarks -> leakage-safe splits ->
sequence models -> calibrated, exported models and live-use benchmarks. The live API imports this
package, so features, segmentation and decisions are identical offline and live. Full details:
`HANDOVER.md` at the repository root.

## Setup

Everything runs in the shared environment `app/backend/.venv` (Python 3.14, PyTorch CUDA 12.8).

```powershell
cd C:\Users\ADNAN\Desktop\Mudra_Claude_Handoff
app\backend\.venv\Scripts\activate
pip install -e training          # once; already done on this machine
pytest training app/backend/tests   # 61 tests
```

MediaPipe models live in `training/assets/mediapipe/` (not committed). Download links:
`https://storage.googleapis.com/mediapipe-models/<task>/<task>/float16/latest/<task>.task` for
`hand_landmarker`, `pose_landmarker_full`, `pose_landmarker_lite`, `face_landmarker`, `holistic_landmarker`.

## Workflow

| Step | Command | Output |
|---|---|---|
| 1. Audit raw data (read-only) | `python training/scripts/audit_dataset.py --source own --input data/raw/own` | `experiments/reports/audit_own.{md,json}` |
| 2. Extract landmarks | `python training/scripts/extract_landmarks.py --source own --input data/raw/own` | `data/processed/landmarks/own/<LABEL>/<id>.npz`, `data/metadata/manifest_own.csv` |
| 3. Make splits | `python training/scripts/make_splits.py --manifests data/metadata/manifest_own.csv --name own` | `data/metadata/splits/own/{train,val,test}.csv`, `classes.json`, `split_report.json` |
| INCLUDE (public) | `python training/scripts/convert_include_pose.py --variant include` then `make_splits.py ... --name include --ratios 0.85 0.15 0` | already done: 263 classes, 2,908 / 523 / 816 clips |

Combine sources by passing several manifests to `make_splits.py`.

Signs recorded in the app (Record page) are already landmarks: they are in
`data/metadata/manifest_app.csv`, grouped by session (signer + day) with the signer's name in
`signer_id`. Add them to a training run with
`make_splits.py --manifests ... data/metadata/manifest_app.csv --name <name>`.

Few-shot benchmark for new words: `eval_fewshot.py --model <model trained without some words>
--split-dir <split set with novel.csv>`; it tunes `training/configs/fewshot.json` on validation.

## Models, training, evaluation

| Task | Command |
|---|---|
| Train the deployed model | `python training/scripts/train.py --config mudra_words.yaml --name mudra_words` |
| Change settings | `... --set data.split_dir=data/metadata/splits/include model.temporal=transformer train.epochs=200` |
| Ablation table (INCLUDE) | `python training/scripts/run_ablation.py --config ablation_landmarks.yaml --tag include` |
| Watch training | `tensorboard --logdir experiments/runs` |
| Re-score saved runs | `python training/scripts/evaluate.py experiments/runs/include_*` |
| Comparison table | `python training/scripts/summarize_runs.py --glob "include_*" --title "INCLUDE"` |
| Live-use (streaming) test | `python training/scripts/eval_continuous.py --model <exported dir> --split <split>/test.csv --scenarios normal,closeup --fps-cap 12` |
| Tune the commit threshold | `... eval_continuous.py --split <split>/val.csv --tune-threshold-only --config-out <streaming.json>` |
| Test on another dataset | `python training/scripts/eval_external.py --model <exported dir> --manifest <manifest.csv>` |
| Ship a model to the API | `python training/scripts/export_model.py --run experiments/runs/<run> --name <model_name> --data-source combined` |

Models (`mudra_ml/models/sequence_model.py`): per-frame **Landmark MLP** -> temporal block
(`none` = mean pooling, `bilstm`, `transformer`) -> attention pooling -> classifier. The deployed
model is the BiLSTM (2.6 M parameters). An RGB CNN branch was planned in the original spec but
never used, and has been removed.

Each run writes `experiments/runs/<name>_<time>/`:
`config.yaml`, `history.csv`, `tensorboard/`, `best.pt` (weights + classes + model/feature config +
standardisation stats + temperature), `summary.json`, and `reports/` with metrics JSON,
classification report, predictions CSV, confusion matrix (PNG + .npy), reliability diagram and
confidence-threshold coverage table (input for the app's "Uncertain" threshold).

Training: AdamW, warmup + cosine LR, label smoothing, fp16 mixed precision, gradient clipping,
early stopping on validation macro-F1; temperature scaling fitted on validation, test evaluated once.
Features are standardised per block (hand shape / location / pose / velocity), not per dimension,
so near-constant jitter dimensions are not amplified.

## Design decisions

- **Landmarks only are stored** (no frames, no face images). Raw coordinates are kept so
  normalisation can change without re-extracting video.
- **Hands are slotted by the signer's anatomy** (nearest pose wrist), not by MediaPipe's
  handedness label, which assumes a mirrored selfie image.
- **Per-frame features (162 dims)** = for each hand: wrist-relative palm-scaled shape (63) +
  wrist location relative to shoulders (3); upper-body pose (27); presence masks (3).
  Location is kept on purpose: chin vs chest vs temple distinguishes many ISL signs.
- **Splits are grouped**: a signer (or a clip, when signers are unknown) never spans splits.
  Official test sets are preserved and low-quality clips are removed from training only.
- **Signer IDs**: add `data/raw/<source>/signers.csv` (`relative_path,signer_id`) to get
  signer-independent evaluation. INCLUDE has none, so its test set is *not* signer-independent.

## Known data quirks

- INCLUDE pose release (OpenHands, Zenodo 6674324) stores `x * 1080` and `y * 1920` for
  1920x1080 video; the converter corrects this (verified via body proportions).
- INCLUDE's CSV `Word` column is inconsistent ("goodmorning" vs "Good Morning") and some clips
  sit in `Extra/` subfolders; labels come from the word folder (`FilePath` part 2).
- Pose depth (z) is noisy; consider clipping or dropping z during Phase 2 ablations.
