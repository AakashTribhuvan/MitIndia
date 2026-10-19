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

### ISL500 video pilot (14 isolated words)

The locally downloaded 15-signer subset is tracked with the same MediaPipe Pose/Hand pipeline as
the live app. The feature vector includes fingers and palm geometry, hand position against the
torso, pose anchors for eyes/ears/mouth, and hand-to-face distances. Landmark clips are saved by
word under ignored `data/processed/isl500_sentence_subset/landmarks/` for later learning-page use.

```powershell
app\backend\.venv\Scripts\python.exe training\scripts\train_isl500_word_model.py prepare --workers 4 --max-fps 15
app\backend\.venv\Scripts\python.exe training\scripts\train_isl500_word_model.py train
```

The split locks Users 013-015 for final testing. Classifier and temporal-window selection use
four-fold grouped validation across Users 001-012; mirrored augmentation is applied only to each
training fold. The current calibrated linear SVM scored 80.5% accuracy / 0.79 macro-F1 on 41
clips from the three held-out signers (the `I` clip for User014 had no usable hand track and was
excluded). This is a small signer-held-out clip result, not a live-webcam estimate. Training saves
a working copy to ignored `data/processed/isl500_sentence_subset/model/`; the inference artifact is
packaged at `app/backend/models/isl500_video_pilot/model.joblib` and is available from a fresh clone
in the Communication word-model menu. It does not replace the deployed sequence model.

Selecting the pilot in Communication also provides a held-out clip viewer. It lists the 41 exact test
videos with the expected gloss and the saved offline prediction. Watch a source clip, then try the same
action in the app's live camera; those webcam attempts are separate and are not included in the 80.5%
offline score. The test-video endpoints are available only for clip IDs in both the evaluation report
and the locked test split. The source videos remain local and are not committed to Git.

Current labels: `FOOD`, `HELP`, `I`, `MYSELF`, `NICE`, `NO`, `THANKYOU`, `WATER`, `WHAT`, `YOU`,
`HELLO`, `WE`, `STUDENT`, `THIS`. `I`, `MYSELF`, and `NO` are available dataset labels, not
substitutes asserted to mean the unavailable `HOW`, `NOT`, or `I_ME_MINE_MY` glosses.

### Static still-image prototype

The current local experiment uses the 32-label `intro` profile from
`data/raw/static_signs/Frames_Word_Level/`. It extracts MediaPipe pose/hand features and fits
nearest-medoid prototypes from scratch; it is separate from the sequence model and is not wired
into live recognition.

```powershell
python training/scripts/static_sign_prototype.py prepare --profile intro
python training/scripts/static_sign_prototype.py train --profile intro
```

The split targets 4:1 by image count when possible, but keeps inferred filename families wholly
within train or test. Labels represented by only one source family have no held-out test samples.
The model card, confusion matrix, metrics and per-label counts are written by the training command;
see `docs/STATIC_SIGN_GLOSSARY.md`. Do not adjust feature weights or thresholds based on the test
set. The current small, unverified dataset is not enough to establish performance for every label.

### Static image landmark tracking (no training)

Track the source stills in the sibling `MudraPhoneWebcam/training_data/Frames_Word_Level/` before
changing the model. This pass captures PoseLandmarker torso/arms plus its eye, ear and mouth anchors;
FaceLandmarker eye/lip mesh (with an enlarged head-crop retry); HandLandmarker finger joints and
world landmarks; and a 3D palm-plane normal. It does not alter the existing feature schema or model.

```powershell
app\backend\.venv\Scripts\python.exe training\scripts\track_static_images.py
```

Landmark arrays are written to ignored `data/processed/static_signs/tracked_landmarks_v1.npz`;
coverage reports and annotated preview sheets are written under ignored
`experiments/reports/static_signs/tracking/`. The source images and extracted landmarks are not
committed. On the current source, 1,008 of 1,036 images had torso, face-region anchors, hands and
palm direction; 93 classes had at least five such images. The full source has 131 folders, including
17 empty folders. A strict 4-train/1-test split cannot be made for every folder without more usable
images, and future splitting must keep near-duplicate image families together.

Train the isolated ten-word prototype from the tracking archive:

```powershell
app\backend\.venv\Scripts\python.exe training\scripts\train_static_top10.py
```

The labels are YOU, I_ME_MINE_MY, WHAT, HELP, FOOD, WATER, HOW, NOT, NICE, and THANK, selected by
complete tracked-image count; `COLLEGE_SCHOOL` is excluded because its folder mixes several glosses.
Each selected label contributes exactly four train images and one test image from separate
perceptual-hash groups. The nearest-neighbour model and split report stay under ignored local output
folders and do not replace the deployed sequence or alphabet model. The Learning page can show the
separately saved held-out landmarks for these words when the local artifact exists.

For a less sample-starved comparison, run the v2 experiment:

```powershell
app\backend\.venv\Scripts\python.exe training\scripts\train_static_top10_v2.py
```

V2 uses all eligible tracked images (about 80% train / 20% held out per word), keeps pHash-near-
duplicates in the same split, and compares nearest-centroid, 1/3-nearest-neighbour, linear SVM and
RBF SVM using grouped cross-validation on training data. It selects by mean CV macro-F1, then scores
the selected model once on the held-out set. In the current corpus, the selected RBF SVM achieved
73.0% accuracy and 0.64 macro-F1 on 74 held-out images; performance varies sharply by word and this
single-directory split does not establish signer-independent or live-camera accuracy. V2 artifacts
are written to ignored `top10_v2` folders and do not replace the v1 result or deployed recognizer.
When `data/processed/static_signs/top10_v2/static_top10_model_v2.joblib` exists locally, the backend
loads it as an experimental live option and the Communicate page's **Word recognition model** menu can
switch between it, the phone static prototype, and the deployed sequence recognizer without restarting.
V2 uses a separate live feature adapter and a margin reject band; treat webcam behavior as experimental
until it has been evaluated on recordings from different people and cameras.

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

## SignLine intro + everyday video model

This is a separate local 26-class video-word experiment. It uses the shared body/face/hand
tracker and the live `/stream` feature schema. Its 390 ISL500 clips cover 15 signers per class;
Users 001–012 are training/validation, Users 013–015 are the locked final test. There are also
115 accepted CISLR/INCLUDE clips available in a training-only pool; grouped CV favored the
ISL500-only recipe, so those clips are excluded by default (`--include-extra-training` opts in).
It includes exact dataset glosses
for HELLO, MYSELF, I, WE, YOU, STUDENT, THIS, GOOD_MORNING, GOOD_AFTERNOON, FOOD, WATER, PLEASE,
THANKYOU, YES, NO, HELP, EAT, DRINK, FRIEND, SCHOOL, TODAY, WHAT, WHERE, GO, NICE, and GOOD.
The plural request “Students” maps to the dataset gloss STUDENT. ARE, FROM, PUNE, INVENTORS, AND,
IS, SIGN, and LINE are not part of this model because the available 15-signer source did not have
those exact labels; the deployed sequence model remains separately selectable for its own classes.
The 15 added everyday words are a practical selection from the available labeled data, not an
official frequency-ranked vocabulary list.

```powershell
app/backend/.venv/Scripts/python.exe training/scripts/download_signline_intro_terms.py
app/backend/.venv/Scripts/python.exe training/scripts/prepare_signline_intro_data.py
app/backend/.venv/Scripts/python.exe training/scripts/train_signline_intro_model.py prepare --workers 4
app/backend/.venv/Scripts/python.exe training/scripts/train_signline_intro_model.py train
```

The downloaded MP4s, staged hard links, landmark NPZs, model joblib, and reports remain in ignored
local data/ and experiments/ paths. With its 62.3% score on 77 held-out clips, this experiment is
hidden from the live model selector until it improves; its local artifacts are retained. The upstream ISL500 card marks the source for
academic/research use and says to contact the authors for commercial use; do not redistribute
source videos or generated artifacts without checking the applicable terms.
