# MUDRA: Indian Sign Language Learning & Real-Time Communication

**The web app is now branded SignLine** (2026-10-16): demo sign-in with User and Admin workspaces, Game Mode
lessons, a word library and an admin overview. Sign-in is a demo with no real accounts; see `HANDOVER.md` Section 5.2.

MUDRA turns Indian Sign Language (ISL) into text and speech from an ordinary webcam, and turns
text or speech into ISL with a 3D avatar. It combines a React web app, a FastAPI recognition
service and a PyTorch landmark model trained on public and team-recorded ISL data.

Only body and hand landmark coordinates leave the browser, never camera images.

**Taking over the project (people or AI models): read [`HANDOVER.md`](HANDOVER.md) first.** It is
updated at every push and documents the architecture, interfaces, data, models and open problems.

## Status (13 Oct 2026)

| Area | State |
|---|---|
| Web app (Home, Learn, Practice, Communicate, Progress, Record) | Working; avatar demonstrates 26 letters and 13 words |
| Recognition model | `isl_mudra_combined_v8_desk_bilstm`: 314 words + "no sign"; also trained with hands resting in view and low camera frame rates (the numbers below are for the previous model, v6; v8 is in HANDOVER Section 14) |
| Live recognition (Communicate) | Sign start/end detection, automatic word adding, spoken sentence, "How to sign it" examples |
| New words from the Record page | Work immediately (few-shot), stored for retraining |
| Data pipeline | MediaPipe landmarks, leakage-safe splits, label audit |
| Known gap | Live use on a laptop webcam is not yet reliable: the browser tracks at ~6 fps on some machines and the model has seen few signers (66.7% on unseen recording sessions) |
| Honest reading of the numbers | Test clips come from the same signers and sessions as training clips, so the 97-99% figures below are "new takes by known signers". Accuracy for new people has not been measured. See the audit: [`docs/AUDIT_2026-10-13.md`](docs/AUDIT_2026-10-13.md) |

## Results

Live-use benchmark: held-out signs joined into continuous streams with transitions and idle
movement, delivered at 12 frames/s like a laptop webcam. Settings were chosen on validation
streams; these are held-out test numbers, with the corrected labels (see Data quality). The test
clips share signers and recording sessions with training (90% of INCLUDE test clips have a same-word
training take 1-2 files away; every team-word test clip a take within 2 minutes), and the streams are
simulated, so these are upper bounds for new users. Only `ok` words are scored; the app also adds
unsure guesses (50-70%), which on the same streams changes correct words by 0 to +1.7 points and wrong
words by -0.5 to +0.9 points.

| Source | Framing | Correct | Wrong | Missed |
|---|---|---|---|---|
| INCLUDE original videos, MediaPipe landmarks (498 signs) | normal | 93.8% | 1.2% | 5.0% |
| | close-up webcam | 90.6% | 2.0% | 7.4% |
| INCLUDE pose release (816 signs) | normal | 92.6% | 2.1% | 5.3% |
| | close-up webcam | 90.0% | 2.0% | 8.1% |
| Team words (181 signs) | normal | 97.2% | 0.0% | 2.8% |
| | close-up webcam | 90.1% | 2.2% | 7.7% |

Close-up webcam = the frame ends between the chin and the waist and the hands are only visible
when raised, which is how most people use the app. Extra words: at most 0.002 per sign; false
words while idle: at most 0.1 per minute.

The first row is the closest proxy for the webcam: the same landmark pipeline the browser runs.
The first model, trained on the pose release only, scored 41.8% correct / 7.0% wrong on that row.

**Data quality.** An embedding audit found that one INCLUDE recording session (Home words,
MVI_4896-4955) has its folder boundaries off by one: the third take of each word is the next word's
sign. 20 clips (both the video and the pose-release copy) were relabelled; the evidence and the list
are in `HANDOVER.md` Section 12 (local copy: `data/metadata/splits/combined_words_v3/label_fixes.json`). No video is filed under two
words, and the pose-release and video copies of every clip agree (median correlation 0.96).

Clip-level accuracy (complete pre-cut clips, corrected labels; same signers and sessions as training):
- INCLUDE original videos re-extracted with MediaPipe: 99.0%; team words 99.4% (new takes recorded
  minutes after training takes of the same word).
- INCLUDE 263 words, pose release: 97.4%. Published references on the same official split: 85.6%
  (original paper), 93.5% (OpenHands SL-GCN), 97.7% (HWGAT).
- All 997 test recordings counted once (the INCLUDE video and pose copies of a recording are one
  recording): 97.6%. The often-quoted 98.2% counts 498 recordings twice.
- Team words, on a recording day held out from training: 98.0% (99 clips of 20 words, earlier
  combined model; probably the same people on another day).
- Earlier rule-based / Random-Forest system: about 44%.

New words from recordings (few-shot, no retraining): tested on 25 team words the model never saw,
from k recorded examples each (held-out test clips, averaged over 5 draws). The test clips were
recorded in the same sessions as the examples (within 2 minutes), so these are same-session numbers.

| Examples per word | Recognised | Wrong word | Missed | Known words taken over |
|---|---|---|---|---|
| 1 | 70.1% | 12.0% | 17.9% | 0.10% |
| 3 | 79.5% | 11.5% | 9.1% | 0.14% |
| 5 | 81.6% | 10.9% | 7.5% | 0.14% |

Almost all wrong words (10.1-10.7 points) are the model confidently reading the new sign as a
known look-alike; without custom words that happens for 18.7% of them. Retraining with the
recordings is the real fix, so recordings are stored in the training format.

**New recording conditions (the honest number for new users).** INCLUDE was recorded in sessions
(day, outfit, camera setup). Holding out 9 whole sessions from training and testing on them:

| Unseen sessions | Clip accuracy | Top-5 | Streams: correct | Streams: wrong |
|---|---|---|---|---|
| INCLUDE real video (529 clips) | 66.7% (96.5% when sessions are mixed); pose-release copies 66.8% | 91.3% | 48.4% | 9.5% |
| Team words (181 clips; **not** held out by day: same signers and sessions as training) | 96.7% | 100% | 91.2% | 0% |

Every held-out word had been trained on only 2-4 sessions, and accuracy follows that count
(64% with 2, 69% with 3-4, 92% with 5+). Mirror, stronger geometric augmentation and pose
dropout did not close the gap (60-65%), so more signers per word is the fix, not more training
tricks. A signer can appear in several sessions, so this is session-independent, not strictly
signer-independent. Raising the confidence bar trades correct words for fewer wrong ones on new
users: at 0.9, 39.3% correct / 5.3% wrong; at 0.95, 30.1% / 2.3%.

**Limits:**
- No dataset has signer IDs; the session hold-out above is the closest measured proxy for new
  people. Recordings made in the app carry the signer's name, so they can provide the real test.
- The idle movements in the benchmark are synthetic.
- The app's own words NAMASTE, WATER, HELP, YES, NO, GOODBYE, HOME and PERSON have no training data yet.

## How it works

```
Browser                               Backend (FastAPI)                      Model
MediaPipe Tasks hands + pose  --WS--> /stream: SignSegmenter            --> BiLSTM over 24 frames
(on device, ~30 fps)                  resting -> signing -> ended            of hand shape, hand
                                      classify each whole sign once          position vs shoulders,
UI: Signing... / "Looks like X" <---- (3-cut smoothing, threshold,           upper-body pose
    word added / "Did you mean"        cooldown, "no sign" class)
```

1. **Landmarks:** 2 x 21 hand points and 33 pose points per frame. Hands are matched to the
   signer's left/right by the nearest pose wrist.
2. **Features (162 per frame):** wrist-relative hand shape plus hand location relative to the
   shoulders, so chin vs chest signs stay distinct.
3. **Segmentation:** a sign starts when hands are raised or moving, and ends after 0.4 s of rest.
   Tuned on validation streams (`training/configs/streaming.json`).
4. **Decision:** the whole sign is classified once. A "no sign yet" class covers rest, partial
   signs and fidgets; a word is added at 70% confidence or more (chosen on validation streams); between 50% and 70% the best guess is added and two alternatives are offered as one-tap replacements.

## Quick start (Windows)

1. Run `start_all.bat`. It creates the Python environment, installs dependencies and starts both servers.
2. Open http://localhost:3000, then **Communicate -> Start Camera**.
3. Sign one word from start to finish, then lower your hands. The word is added when the sign ends.
4. To teach it a new word, open **Record**, enter your name, pick or type the word and record it
   5 times. The word works in Communicate straight away and is saved for the next training run.

Backend: http://localhost:8000 (`/docs`, `/health`, `/labels`, `/predict`, `/recordings`,
`/reference/{sign}`, WebSocket `/stream`). If port 8000 is taken, start the backend with
`MUDRA_PORT=8010` and set `VITE_API_URL=http://localhost:8010` in `app/frontend/.env`.
Requires Python 3.12+ (tested on 3.14) and Node 20+. An NVIDIA GPU is optional (training only).
The backend `requirements.txt` pins the CUDA 12.8 PyTorch build used for training; for a CPU-only
machine install `torch` from the default index instead.

## Repository layout

```
app/
  frontend/            React + Vite + Tailwind + Three.js app (pages, 3D avatar, MediaPipe tracker,
                       signRecognizer WebSocket client)
  backend/
    mudra_api/         FastAPI service: /predict, /stream, /recordings, /reference, model loading
    models/            the deployed model (model.pt + model_card.json: classes, metrics, threshold, licences)
    tests/             API, streaming and recording tests
training/
  src/mudra_ml/        landmark extraction, normalisation, datasets, models, training, evaluation,
                       streaming (segmenter + recogniser)
  scripts/             audit, extract, split, train, ablate, evaluate, export, live-stream and few-shot benchmarks
  configs/             data, experiment (experiments/mudra_words.yaml = the deployed model), streaming
                       and few-shot settings
  tests/               unit and end-to-end tests
data/                  README only: datasets, manifests and splits are kept locally (see data/README.md)
docs/
  MUDRA_MASTER_PLAN.md full analysis, dataset research, roadmap and dated progress log
  architecture.md      system architecture
  planning/            original project review documents
```

## Training workflow

See `training/README.md`. In short:

```powershell
app\backend\.venv\Scripts\activate
python training/scripts/extract_landmarks.py --source own --input data/raw/own
python training/scripts/make_splits.py --manifests data/metadata/manifest_own.csv --name own
python training/scripts/train.py --config mudra_words.yaml --name mudra_words
python training/scripts/export_model.py --run experiments/runs/mudra_words_<time> --name <model> --data-source combined
python training/scripts/eval_continuous.py --model app/backend/models/<model> \
    --split data/metadata/splits/combined_words_v3/val.csv --scenarios normal,closeup --fps-cap 12 --tune-threshold-only
```

`mudra_words.yaml` reproduces the deployed model (about 45 minutes on an RTX 5060).
Tests: `pytest training app/backend/tests` (61).

## Data and licences

- **INCLUDE** (Sridhar et al., ACM MM 2020): pose release via AI4Bharat OpenHands and the original videos (Zenodo), CC-BY-4.0.
- **Team ISL recordings** (61 words, 101 sentences): provided by the MUDRA team. Source and
  licence to be confirmed before any public release.
- Raw videos and extracted landmarks are not committed; see `data/README.md` for the layout.

## Roadmap

Done: sign start/end detection, smoothing and commit rules, close-up webcam robustness, in-app
recording and few-shot new words, session-independent test, INCLUDE label audit and fixes.

Next:
- live webcam use: find why some browsers track at ~6 fps; collect the users' own recordings of
  known words to see why their signs are rejected
- more signers per word (FDMSE-ISL: 2,002 words, 20 signers, access by email; teammates recording in the app)
- retrain with app recordings once each new word has 5 or more
- the app's own words (Namaste, Water, Help, Yes, No, Goodbye, Home, Person) need recordings

Tried and not adopted (measured, see the progress log): velocity features, ending a sign when the
hands are held still, a zoomed hand search during extraction, hand gap filling, pose dropout,
mirror augmentation, and an RGB CNN branch.

Details are in `docs/MUDRA_MASTER_PLAN.md`.
