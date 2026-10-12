# MUDRA — Master Analysis & Implementation Plan

Date: 2026-10-04
Sources analysed: this handoff package, GitHub `aryanhinge20-dot/Mudra_ISL_Platform` (6 commits, last push 2026-08-21), `MUDRA_ISL_HYBRID_IMPLEMENTATION.md`, `MUDRA_ISL_CONTEXT_AWARE_IMPLEMENTATION.md`, architecture diagrams.

---

## 1. Where the project actually stands

### 1.1 What is genuinely done (and good)

| Area | Evidence | Quality |
|---|---|---|
| Product shell & brand | React 18 + Vite + Tailwind, 5 pages, glass design system, intro loader | Strong — keep it |
| 3D avatar (text → sign) | `src/avatar/` — Three.js + `ybot.glb`, 26 alphabet + 13 word keyframe animations, fingerspelling fallback | Strong — the most finished subsystem |
| Learn page | Sentence parser → word-by-word avatar playback, EN/HI/MR templates | Working |
| Live hand tracking | MediaPipe Hands in browser, skeleton overlay | Working |
| Practice coach UX | 4-dimension feedback UI with coaching tips | Good UX, weak engine (see below) |
| Accessibility | Contrast, text scale, reduced motion, speech rate | Good |
| Multilingual TTS | Web Speech API `en-IN / hi-IN / mr-IN` | Working |

### 1.2 What is claimed but NOT actually in either codebase

The achievement/SWOT docs describe a dataset extraction pipeline, Random-Forest models, `.pkl` bridge, template library and a 44 % accuracy experiment. **None of these exist in the handoff package or the GitHub repo.** The GitHub repo is frontend-only (88 files).

| Claimed | Reality |
|---|---|
| "Dataset extraction pipeline (.npy/.npz, shoulder-normalised, velocity features)" | Not present. `data/` folders are empty |
| ~794 videos, ~1,090 images | Not present anywhere |
| Random Forest / template matching / `.pkl` bridge | Not present. `pythonRecognizer.js` posts to `127.0.0.1:8765/predict` — no such server exists |
| "Real-time recognition / ISL classifier" | **Hand-written if/else rules** for 8 signs, single frame (`islClassifier.js`). No machine learning |
| Backend "inference layer" | `main.py` has only `/` and `/health` |
| Training pipeline | `train_baseline.py` is a 10-line placeholder |
| Progress dashboard "87 % accuracy, 5-day streak" | **Hard-coded fake numbers** in `ProgressPage.jsx` (and includes SORRY/PLEASE which don't exist in the lexicon) |

→ **Action needed from the team:** locate the original extraction scripts, the 794 videos / 1,090 images and the RF experiment. If they are lost, the plan below still works using public datasets.

### 1.3 Bugs and technical debt found

| # | Issue | Location | Severity |
|---|---|---|---|
| B1 | Recognition is rule-based, 8 of 13 words, static single frame — dynamic signs (THANK YOU, GOODBYE, HELP) cannot be recognised by design | `services/islClassifier.js` | Critical |
| B2 | `classifyISLSign` picks the max rule score with a 68 % threshold; unknown signs `default:` score 75/80/80 → false positives | `islClassifier.js:232` | High |
| B3 | Progress page shows fabricated metrics — contradicts the project's own "zero fake confidence" principle | `pages/ProgressPage.jsx:16-60` | High (trust) |
| B4 | `expressionAnalyzer.js` labels users "Angry", "Sad" from hand-tuned blendshape weights calibrated on one camera — conflicts with the context-aware spec's safety rule (non-manual cues ≠ emotions) | `services/expressionAnalyzer.js` | High (ethics) |
| B5 | Python bridge: wrong port (8765 vs 8000), endpoint missing, window = 1 frame, pose always `null` | `services/pythonRecognizer.js` | Medium |
| B6 | Handoff package was missing `public/wasm`, `public/models/face_landmarker.task`, `public/assets/mudra-intro.mp4` → face tracking & intro broken | **Fixed during this session** (copied from GitHub) | — |
| B7 | Two MediaPipe stacks: legacy `@mediapipe/hands` (deprecated, CDN-loaded) + `@mediapipe/tasks-vision` | `handTracker.js`, `faceExpressionTracker.js` | Medium |
| B8 | README says frontend on :5173, Vite config uses :3000 | `vite.config.js`, `README.md` | Low |
| B9 | `requirements.txt` pins (mediapipe 0.10.18, numpy 2.1.2 …) have no wheels for this machine's Python 3.14; bundled `.venv` was from another PC | **Fixed during this session** | — |
| B10 | No git repo in handoff, no tests, no lint, no CI, 1.2 MB single JS bundle, tab state instead of router (no deep links / back button) | project-wide | Medium |
| B11 | `expressiveTone.js` empty file; `ishaara-react` broken gitlink in GitHub repo | misc | Low |

---

## 2. Target architecture (refined from your hybrid + context specs)

Your two specs are well-designed (staged build, ablations, signer-independent splits, no fake metrics, confirmation UI for urgency). Four refinements:

1. **Landmark-first, RGB second.** With < 1k own videos, an RGB CNN learns backgrounds/clothes/signer identity. Published ISL results (INCLUDE) show pose/landmark models at 91–98 % top-1. Build the landmark model first; add the CNN branch as ablation **E** and keep it only if it measurably helps on unseen signers.
2. **Don't lose hand location.** Wrist-relative normalisation (spec §4) deletes *where* the hand is (chin vs chest vs temple), which distinguishes many ISL signs. Feed both: (a) wrist-relative hand shape, and (b) hand position relative to shoulders/nose (pose landmarks). Use MediaPipe Holistic-style input: 2×21 hand + upper-body pose + a few face anchors (≈ 27–75 keypoints).
3. **CNN on hand crops, not full frames**, if/when added. Cache frozen-CNN features to disk so training fits the 8 GB RTX 5060.
4. **Inference split for privacy & latency:** browser does MediaPipe (already does) → sends a 24–32-frame landmark window (not video) to FastAPI `/predict` → PyTorch model. Later export to ONNX and run in-browser (onnxruntime-web) so no camera data leaves the device.

```
Browser (MediaPipe Tasks: hands + pose + face)
   └─ landmark window [T × K × 3] + presence masks ──► FastAPI /predict
                                                        ├─ Landmark encoder (MLP/GCN per frame)
                                                        ├─ [optional] hand-crop CNN features
                                                        ├─ BiLSTM (baseline) → Transformer (comparison)
                                                        └─ logits → calibrated score, "Uncertain" below threshold
   ◄── {sign, score, top-k, uncertain} ──────────────────┘
SignSequenceMemory → Context Engine (later phases) → Confirmation UI for possible urgency
```

---

## 3. Datasets — what to use to maximise accuracy

### 3.1 Recommended stack (in order)

| Tier | Dataset | Size | Use | License | Notes |
|---|---|---|---|---|---|
| 1 | **INCLUDE** (AI4Bharat, ACM MM 2020) | 4,287 videos, 263 words, 15 categories, 7 signers | Main ISL training set | CC-BY-4.0 (Zenodo 4010759) | 56.8 GB RGB, **or 0.6 GB pose version via OpenHands**. Reported: 85.6 % (orig. paper), SL-GCN 93.5 % (OpenHands), HWGAT 97.67 % |
| 1 | **INCLUDE-50** | 50-word subset | Fast experiments/ablations | CC-BY-4.0 | 94.5 % in original paper |
| 1 | **Google ISLR "asl-signs"** (Kaggle 2023) | ~94k sequences, 250 signs, 21 signers | **Pretrain** landmark encoder — already MediaPipe Holistic format | Kaggle competition rules (check) | Different language → pretraining only |
| 2 | **Own 794 videos + 1,090 images** | — | Fine-tune on MUDRA vocabulary | yours | Must locate first |
| 2 | **Kaggle ISL alphabet/digit sets** (e.g. prathumarikeri "Indian Sign Language (ISL)", atharvadumbre "ISLRTC referred") | ~30–42k images, A–Z / 0–9 | Static fingerspelling classifier (extract landmarks) | Kaggle per-dataset | 1–3 signers, plain backgrounds → overfit risk |
| 3 | **FDMSE-ISL** (Patra et al. 2025) | 40,033 videos, 2,002 words, 20 deaf signers | Large ISL pretraining | Research use, on request | Best ISL-specific pretraining source if granted |
| 3 | **ISL-CSLTR** | 700 videos, 100 sentences, 7 signers | Sentence-level / continuous | CC-BY-4.0 (Mendeley) | For phase 6+ |
| 3 | **iSign / ISLTranslate / CISLR** | 118k / 31k pairs / 4.7k words (1-shot) | Sentence translation, SSL pretraining | **Non-commercial** (NC / NC-ND) | OK for research; **not** for a commercial startup build |
| — | WLASL, MS-ASL, AUTSL | 21k / 25k / 38k videos | Optional pretraining | WLASL C-UDA non-commercial | Lower priority than asl-signs |
| — | ISLRTC dictionary videos | ~10k signs | Reference / validation only | No published license — treat as copyrighted | Don't redistribute |

### 3.2 Own data collection (the real accuracy lever)

Public data won't contain every MUDRA word (NAMASTE, WATER, HELP may need own recordings). Signer diversity matters more than video count.

- Target per sign: **≥ 10 signers × ≥ 5 repetitions**, varied lighting/background/distance, both dominant hands.
- Build an in-app **Record mode** (consent screen → store landmarks only, optional video) to collect this quickly.
- Validate signs with an ISL instructor / Deaf community member; record `signer_id` in metadata for signer-independent splits.

### 3.3 Training recipe for top accuracy

1. Pretrain encoder on asl-signs (self-supervised masked-landmark or supervised), 2. train on INCLUDE, 3. fine-tune on MUDRA vocab.
2. Landmark augmentation: rotation ±15°, scale, shear, temporal resampling (0.8–1.2× speed), frame dropout, Gaussian jitter, mirroring **with handedness swap** (careful: only for signs that are symmetric).
3. Signer-independent split, class-weighted CE + label smoothing, AdamW, cosine LR, early stop on val macro-F1.
4. Ensemble 2–3 seeds/architectures for the final model; calibrate with temperature scaling.
5. Models to compare: Landmark-MLP+BiLSTM (spec baseline) → 1D-CNN+Transformer (Kaggle winner style) → SL-GCN → +hand-crop CNN.

**Realistic targets (to be measured, not claimed):** INCLUDE test ≥ 90 % top-1 (literature range 85–98 %); MUDRA vocab on *unseen signers* ≥ 85 % macro-F1; live latency < 150 ms.

---

## 4. Phased roadmap

Each phase has an exit criterion. Don't start the next until it's met.

### Phase 0 — Foundation & honesty (≈ 1 week)
- `git init`, merge with GitHub history, `.gitignore`, pre-commit (ruff, eslint/prettier).
- Replace fake Progress data with real local session tracking (or "No data yet").
- Rename emotion output to "non-manual cues (experimental)" or hide it behind a flag; remove "Angry/Sad" labels.
- Fix port/README mismatches, remove dead files, React Router for deep links.
- **Exit:** clean repo, app runs via `start_all.bat`, no fabricated numbers in UI.

### Phase 1 — Data pipeline (≈ 1–2 weeks)
- `training/src/preprocessing`: frame sampler, MediaPipe Tasks landmark extractor (hands + pose + face subset), normalisation (wrist-relative + shoulder-relative), presence masks, `.npz` per clip + `manifest.csv` (clip, label, signer, source, quality).
- Dataset audit script (counts/class, durations, corrupt files, detection rate).
- Signer-/video-level split generator. Unit tests for normalisation & sampling.
- Download INCLUDE (pose version first), extract own data.
- **Exit:** reproducible `data/processed` + audit report.

### Phase 2 — Baselines & hybrid model (≈ 2 weeks)
- PyTorch models: LandmarkMLP, BiLSTM classifier, Transformer classifier, (later) ResNet18/MobileNetV3 hand-crop encoder.
- Training loop (AMP on RTX 5060, checkpoints save weights + class map + preprocessing config), evaluation (macro-F1, confusion matrix, per-class, predictions CSV).
- Ablation runner for spec models A–E; results table auto-generated.
- **Exit:** measured ablation table on INCLUDE + MUDRA vocab.

### Phase 3 — Serve the model in the app (≈ 1 week)
- FastAPI `/predict` (landmark window in, top-k + score + uncertain out), `/labels`, `/health`, model registry folder.
- Frontend: replace rule classifier in Communicate with the model; keep rule engine only for Practice *coaching tips*; sliding window + majority smoothing; "Uncertain" state; latency display.
- Migrate `@mediapipe/hands` → `tasks-vision` HandLandmarker + PoseLandmarker.
- **Exit:** live demo of model recognition with measured latency and threshold chosen on validation data.

### Phase 4 — Sequence memory & non-manual cues (≈ 2 weeks)
- `SignSequenceMemory` (raw + smoothed predictions, timestamps, serialisation, tests).
- `DynamicsFeatureExtractor` & `NonManualCueExtractor` (eyes, brows, mouth, head yaw/pitch/roll + derivatives) — features only, no emotion labels.
- **Exit:** unit-tested extractors; ablation shows whether face/pose help sign accuracy.

### Phase 5 — Context engine & urgency (research, ≈ 3+ weeks)
- Requires an annotated context dataset (annotation protocol per spec §21).
- Multi-task model (context head + urgency head), calibration (Brier, reliability diagram), confirmation UI, no automatic emergency actions.
- **Exit:** urgency PR-AUC/F1 on held-out signers; calibrated scores.

### Phase 6 — Product & scale
- Learn: levels, categories, mastery tracking. Practice: model-based scoring + dynamic sign support.
- Expand avatar vocabulary (target 100+ words), continuous sentence recognition (ISL-CSLTR), ONNX in-browser inference, PWA/mobile, Docker, CI, pilot with Deaf users & ISL instructors.

---

## 5. Proposed repository layout (merge of both specs)

```
Mudra_Claude_Handoff/
├── app/
│   ├── frontend/                # existing React app (unchanged look & feel)
│   └── backend/
│       ├── main.py              # FastAPI app factory
│       ├── api/predict.py       # /predict, /labels
│       ├── inference/           # model loading, smoothing, calibration
│       └── requirements.txt
├── training/
│   ├── configs/                 # yaml per experiment
│   ├── src/mudra_ml/
│   │   ├── preprocessing/       # frame_sampler, landmark_extractor, normalization
│   │   ├── datasets/            # isl_dataset, augmentations
│   │   ├── models/              # landmark_mlp, cnn_encoder, temporal (bilstm/transformer), hybrid
│   │   ├── context/             # sequence_memory, dynamics, nonmanual, context_engine (later)
│   │   ├── training/            # train, losses, callbacks
│   │   └── evaluation/          # metrics, confusion_matrix, ablation report
│   ├── scripts/                 # audit_dataset, extract_landmarks, make_splits, train, evaluate
│   ├── tests/
│   └── assets/mediapipe/        # .task models (downloaded)
├── data/{raw,processed,metadata}/
├── checkpoints/  experiments/
└── docs/
```

---

## 6. Environment set up during this session

| Item | State |
|---|---|
| Machine | i7-13620H, 16 GB RAM, **RTX 5060 Laptop 8 GB** (needs CUDA 12.8+ PyTorch builds), 388 GB free |
| Python | 3.14.7 (only version installed). MediaPipe 1.0.1 provides universal wheels → works |
| Backend/ML venv | `app/backend/.venv` rebuilt (old one pointed to another PC's Python) |
| Frontend | `npm install` OK, production build OK |
| Frontend assets | `public/wasm`, `public/models/face_landmarker.task`, `public/assets/mudra-intro.mp4` merged from GitHub |
| MediaPipe models (Python) | `training/assets/mediapipe/`: hand, pose (lite/full), face, holistic |

---

## 7. Progress log

### 2026-10-04: Phase 0 done
- Progress page now uses real on-device practice sessions (no fabricated numbers); Practice records sessions.
- Classifier no longer gives signs without rules a default 77.5% score (that caused false GOODBYE detections in Communicate).
- Facial "emotion" labels replaced by descriptions of facial movement (experimental, uncalibrated).
- Python bridge pointed at FastAPI with a 24-frame window; port/README fixes; git initialised.

### 2026-10-04: Phase 1 done (public data); waiting on the team's own data
- `training/src/mudra_ml`: schema, frame sampler, MediaPipe Tasks extractor (hands + pose, anatomical hand slots),
  normalisation (shape + body-relative location, 162-dim frames), manifests, grouped splits. 28 unit tests pass.
- Scripts: `audit_dataset.py`, `extract_landmarks.py`, `make_splits.py`, `convert_include_pose.py`.
- INCLUDE pose (CC-BY-4.0) downloaded and converted: 263 classes, 4,284 clips, split 2,908 / 523 / 816 (official test kept).
  INCLUDE-50: 646 / 118 / 192.
- Found and corrected a scaling quirk in the OpenHands INCLUDE release (x and y multipliers swapped); without the fix
  bodies were stretched ~3x vertically and a model would not transfer to webcam input.
- Next: run audit + extraction on the original 794 videos / 1,090 images once their location is known, then Phase 2.

### 2026-10-04: Phase 2 results on public data (landmark models)
Official INCLUDE test sets, single seed, not signer-independent (INCLUDE has no signer IDs).

| Model | INCLUDE-50 acc / macro-F1 | INCLUDE (263) acc / macro-F1 | Params |
|---|---|---|---:|
| Landmark MLP + pooling | 97.9% / 0.974 | 96.5% / 0.968 | 150k |
| Landmark MLP + BiLSTM (spec default) | 96.4% / 0.951 | 96.6% / 0.964 | 2.6M |
| Landmark MLP + Transformer | 99.0% / 0.990 | 96.9% / 0.971 | 1.4M |
| BiLSTM without velocity features | 99.5% / 0.990 | 97.1% / 0.971 | 2.6M |
| BiLSTM without augmentation | 96.4% / 0.963 | 95.2% / 0.950 | 2.6M |

Published INCLUDE (263) references: 85.6% (original paper), 93.5% (OpenHands SL-GCN), 97.7% (HWGAT).
Findings: augmentation helps (+1.4 pts on INCLUDE); velocity features are not needed; temporal models
(BiLSTM / Transformer) are within ~0.5 pt of each other, which is inside single-seed noise.
INCLUDE-50 validation is too small to calibrate confidence; full-INCLUDE calibration is usable (ECE 0.01-0.02).
Tables: `experiments/ablations/include*_summary.md`. CNN ablations (A, D, E) still need RGB video.

Seed check (3 seeds each, full INCLUDE test): BiLSTM without velocity 96.73% ± 0.57 (macro-F1 0.967 ± 0.007, ECE 0.013);
Transformer 96.45% ± 0.75 (macro-F1 0.966 ± 0.007, ECE 0.018). The difference is inside run-to-run spread: a statistical tie.
Phase 3 candidate: BiLSTM without velocity (best mean, best calibration); MLP+pool (150k params, 96.5%) as the in-browser/ONNX option.

### 2026-10-05: Phase 3 done (model in the app, INCLUDE vocabulary)
- Exported `include_C_bilstm_no_velocity` (chosen on validation macro-F1 0.976) to `app/backend/models/isl_include_bilstm`
  with a model card. "Uncertain" threshold 0.95 chosen on validation: keeps 92.9% of clips at 98.6% accuracy.
- FastAPI `mudra_api`: `/health`, `/labels`, `/model`, `/predict`; reuses `mudra_ml` feature code. Through the API the
  816 INCLUDE test clips score 97.06% top-1 (identical to offline evaluation); CPU inference 15 ms median.
- Browser moved from legacy `@mediapipe/hands` to MediaPipe Tasks hands + pose (local models, GPU with CPU fallback).
- Communicate uses the model (rule engine only as offline fallback); shows Uncertain / no-hands states, latency, and
  commits a word after two consecutive confident windows. Removed a hard-coded "94% confidence" on manual chips.
- Streaming replay of 8 held-out clips through the browser client: 7/8 committed correctly, 0 wrong commits, 25 ms median round trip.
- Headless-browser check: Communicate, Practice, Progress load and track with no console errors.
- Not yet verified: live signing by a real person in front of a webcam (needs a human); expect lower accuracy than INCLUDE.

### 2026-10-05: Team data from C:\ISL processed and trained
- Inventory: 61 isolated words (1,210 recordings + 2 rotated copies each), 101 sentences (687 videos),
  ISLVT 78 sentences with Marathi (152 videos, not yet used), alphabet images (12,637, not yet used). No signer IDs anywhere.
- Unseen-signer check: INCLUDE-only model on the team's 9 shared words = 8.3% top-1 (sign variants / handedness differ).
- Pipeline fixes: rotated copies grouped with their original; byte-identical duplicates removed (3 pairs had leaked
  across splits); run_ablation ignored shared settings (invalid sentence runs deleted, test added); threshold floor 0.5.
- Combined model (INCLUDE + 61 words, 314 words): INCLUDE test 96.2%; team words held-out recording day 98.0%.
- Streaming evaluator added: the first combined model committed a wrong word on 89.5% of team clips (it read the
  start of a sign as STILL). Added a "no sign yet" background class (25% of training samples) and a 4 s window,
  both chosen on validation: team words 94.5% correct / 0.6% wrong; INCLUDE 92.6% / 2.3% (held-out test).
  Browser-client replay at 30 fps: 23/24 correct, 0 wrong.
- Sentence model (101 phrases, ~4.5 clips per class): 57% top-1, 76% top-5; transfer from the word model did not help
  (51.6%, within noise). Needs more recordings per sentence.

### 2026-10-05: Real-time Phase 1 done (sign start/end detection)
- `mudra_ml/streaming.py`: SignSegmenter (hands raised or moving -> resting / signing / ended, with hysteresis)
  classifies each complete sign once; shared by the API WebSocket `/stream` and the benchmark.
- `eval_continuous.py`: continuous streams of held-out signs with transitions and idle stretches; settings tuned on
  validation (raise 1.0 shoulder widths, speed 2.0/s, start 0.05 s, end 0.4 s, whole-sign threshold 0.8) ->
  `training/configs/streaming.json`.
- Held-out test streams, old sliding window -> new segmenter: INCLUDE correct 67.9% -> 83.3%, wrong 2.7% -> 1.6%,
  extra words 0.017 -> 0 per sign; team words correct 92.3% -> 95.0%, wrong 0% -> 0%, extra 0.006 -> 0;
  no false words during idle stretches.
- Browser client over WebSocket (replay at true frame rate): 21/24 correct, 0 wrong, 3 left uncertain.
- UI shows "Signing…" while a sign is in progress; a word is added once when the sign ends.

### 2026-10-05: Real-time Phase 2 done (smoothing, commit rules, idle robustness)
- Synthetic fidgets (hand to face / hair and back) added as "no sign" training samples and as benchmark distractors
  in idle stretches. They exposed 1.1-2.7 false words per idle minute with the Phase 1 model; the retrained model
  makes 0 on validation streams.
- Whole-sign smoothing: each sign classified on 3 slightly different cuts and averaged; margin rule available;
  same-word cooldown 1 s; tuned on validation (threshold 0.7, tta 3) -> training/configs/streaming.json.
- Held-out test streams (with fidgets): INCLUDE 85.2% correct / 1.8% wrong / 0 extra; team words 98.9% / 0% / 0;
  idle false words 0.10/min (INCLUDE) and 0 (team). Browser-client replay: 22/24 correct, 0 wrong.
- UI: live "Looks like X…" while signing (never committed), "Did you mean" top-3 buttons when uncertain.

### 2026-10-06: INCLUDE original videos added (C:\ISL\ISLTrainingData, 35 GB, 29 zips)
- 2,795 INCLUDE videos (180 words, 10 categories) re-extracted with MediaPipe Tasks, i.e. the same landmark pipeline
  the webcam uses. 109 clips set aside (hands visible in under half the frames), 14 had no twin in the pose release.
- `align_include_video.py`: each video takes the split and group of its pose-release twin (matched on
  category/word/file stem), so no recording crosses splits. New split set `combined_words_v2`: train 5,588 /
  val 1,040 / test 1,495.
- Domain gap found: the deployed model (trained on the OpenHands pose release) scored only 71.5% clip-level and
  41.8% correct / 7.0% wrong on continuous streams of the re-extracted videos. Expect this to have been the live
  webcam experience.
- Retrained with identical settings (`combined_v2_bg25_fidget_bilstm`): INCLUDE pose test 96.0% (was 96.2%),
  re-extracted video test 96.8% (was 71.5%), team words 99.4% (was 100%). Decision settings re-tuned on validation
  streams: threshold 0.8, tta 1.
- Held-out test streams, deployed -> new: INCLUDE pose 85.2% -> 82.0% correct (wrong 1.8% -> 2.0%);
  team words 98.9% -> 97.8% (wrong 0% -> 0%); re-extracted video 41.8% -> 78.5% correct, wrong 7.0% -> 2.6%;
  idle false words 0.10/min -> 0; extra words 0.
- Deployed as `isl_mudra_combined_v2_bilstm`; the previous model is kept in `app/backend/models/`.
- Still open: 18.9% of real-video signs are missed (left uncertain) on streams despite 96.8% clip accuracy, so the
  segment boundaries or the confidence threshold on real video are the next thing to look at.

### 2026-10-06: Real-time Phase 3, step 1: missed signs on real video
- Diagnosis of the 94 real-video signs the v2 model missed on test streams: 40 were called "no sign" (background
  samples included random mid-clip spans, which look like a short, quick sign), 27 were never segmented (15 of them
  the last sign of a stream with no rest after it: a benchmark flaw), 27 were left uncertain.
- Benchmark fix: every stream now ends with 1.5 s of rest. Corrected v2 baseline: INCLUDE pose 86.2%,
  real video 82.1%, team words 97.8% correct.
- Training fixes: background samples now come only from clip starts and ends; half of the training samples are cut
  the way the live segmenter cuts a sign (active span + padding, jittered by 0.15 s; `segment_crop_prob`).
- Model v3 (`combined_v3_segcrop_bilstm`), held-out test streams, v2 -> v3: INCLUDE pose 86.2% -> 91.3% correct
  (wrong 1.6% -> 1.7%); real video 82.1% -> 92.6% (wrong 2.4% -> 1.8%, idle false words 0.16 -> 0/min);
  team words 97.8% -> 97.8% (wrong 0%). Clip-level: INCLUDE pose 96.5%, real video 97.8%, team words 99.4%.
  Decision settings unchanged after re-tuning on validation (threshold 0.8, tta 1). Deployed as
  `isl_mudra_combined_v3_bilstm`.

### 2026-10-06: Real-time Phase 3, step 3: recording tool and few-shot new words
- Record page (frontend): name, word (the app's 8 missing words or any typed word), 3 s countdown with hands
  down, 2-5 s capture, quality feedback (too short, hands out of view, shoulders not visible), per-word counts
  with signers, delete bad takes. Landmarks only.
- Backend `/recordings` (GET / POST / DELETE): `.npz` in the training format + `data/metadata/manifest_app.csv`,
  `signer_id` = signer's name, group = signer + day. Words the model does not know become custom words at once.
- Few-shot (`mudra_ml/fewshot.py`): prototype = mean normalised embedding (pooled sequence representation) of a
  word's recordings; a sign is matched when cosine similarity >= 0.6 and the model's best known word is below 0.95
  confidence (both chosen on validation, `training/configs/fewshot.json`).
- Honest test: model trained with 25 team words held out completely (`combined_words_v2_fewshot`, known-word
  test accuracy 97.2%). Held-out test clips, k examples per new word, 5 draws: k=1 70.1% recognised / 12.0% wrong;
  k=3 79.5% / 11.5%; k=5 81.6% / 10.9%. Known words taken over by a custom word: 0.10-0.14%. Wrong words are
  mostly (10.1-10.7 points) the model confidently reading the new sign as a known look-alike, which happens for
  18.7% of new signs without custom words; retraining with the recordings is the fix.
- Not yet verified: the Record page with a real camera and person (frontend builds; API covered by tests).

### 2026-10-06: Real-time Phase 3, step 2: how well does it work on recording conditions it never saw?
- Public multi-signer ISL word data is not directly downloadable (FDMSE-ISL: email request; CISLR: form;
  iSign: Hugging Face login). The alphabet images in C:\ISL (100x100 px, one signer, MediaPipe finds a hand in
  25% even upscaled) are unusable for fingerspelling; letters can be taught through the Record page instead.
- INCLUDE has no signer IDs. The original videos were grouped into 30 recording-session clusters by appearance
  (file-number runs + first-frame clustering); matching people across sessions would need face recognition,
  which was not done (personal-data rule). Split `combined_words_v2_session`: 9 sessions test, 4 validation,
  pose-release and video twins share the session group; 63 INCLUDE words appear in the test sessions.
- Same recipe as the deployed v3 model, trained without those sessions: clip accuracy on unseen sessions 66.7%
  (video) / 66.8% (pose release), top-5 91%, vs 96.5-97.8% on the random split. Team words on a held-out day
  96.7%. Per word, accuracy follows the number of training sessions: 2 -> 64%, 3-4 -> 69%, 5+ -> 92% (n=12).
- Variants on the same split: mirror 60.1%, strong geometric augmentation 64.5%, pose dropout 62.8% (better on
  validation, 69.5%, but not on test). None beats the baseline; the gap is data coverage.
- Streams from unseen sessions (threshold 0.8): real video 48.4% correct / 9.5% wrong, team words 91.2% / 0%.
  Threshold sweep (video): 0.9 -> 39.3% / 5.3%; 0.95 -> 30.1% / 2.3%; 0.98 -> 44% correct on team words only.
  Kept 0.8 for the deployed model (which is trained on all sessions); a stricter "new user" setting is an
  option for the UI.
- Deployed model unchanged (v3, all sessions). New augmentation option `pose_dropout` kept in the code (off).

### 2026-10-06: Live-use fix: close-up webcams, missed signs, sentence flow
- User report: signs were not added to the sentence ("Scanning..."). Cause: a laptop webcam frames the signer from
  the chin to the chest, unlike any training video (waist up, standing back). Simulated close-up view
  (`datasets/camera.py`: virtual 640x480 crop around head and shoulders, hands mostly outside the frame are not
  detected, out-of-frame pose points get low visibility) dropped v3 on test streams from 92.6% to 71.3% correct
  (real video), 97.8% -> 72.4% (team words), almost all of it missed signs.
- v4 (`combined_v4_closeup_bilstm`): v3 recipe + close-up views for 40% of training samples
  (`augment.closeup_prob`). Threshold re-tuned on validation streams: 0.6, tta 3. Held-out test streams,
  normal framing: real video 92.0% / 2.4% wrong, pose release 91.9% / 2.5%, team words 98.9% / 0%.
  Close-up framing: real video 87.6% / 3.2%, pose release 89.0% / 2.7%, team words 90.6% / 1.7% (v3: 65-72%).
  Clip-level unchanged (96.3% / 97.0% / 99.4%). Deployed as `isl_mudra_combined_v4_bilstm`.
- Communicate page: "Didn't catch that" + top-3 choices when a real sign is classified as no sign; no more
  getting stuck on "Signing..." after a too-short movement; framing warning when the shoulders are not visible
  or the camera is too close; "What can I sign?" searchable list of the model's words; the 8 quick-add words are
  marked as not recognised from the camera yet; the sentence is spoken automatically 2.5 s after the last word
  (toggle).
- Backend logs one line per live sign (decision summary, never landmarks) to experiments/logs/stream_events.jsonl.

### 2026-10-06: First real live session analysed (27 signs from the stream log)
- 25 of 27 signs ended as "no sign" (background 0.69-0.998), 2 as uncertain; 20 of 27 hit the 6 s maximum
  (hands never rested), and the camera delivered about 6 frames/s (training videos: 25-30).
- Frame rate: the browser ran hand + pose + face landmarkers on every frame. Now pose runs every other frame, face
  cues at 5 fps (was 12), the camera asks for 30 fps, and the page shows the tracking rate with a warning
  below 15 fps. The sign log records fps per sign.
- "Hands held still" end-of-sign rule (`still_s`, `still_speed` in SegmenterConfig) added and tuned on validation
  streams in three framings (normal, close-up, close-up with hands resting in view) at 12 fps: chosen 0.8 s,
  but on held-out test streams it lowered correct words by 3-7 points (it splits signs that contain a pause); a
  1.2 s / 4 s-cap safety net also lost 1-5 points on validation. Left off. The simulations do not reproduce the
  6 s segments, so the user's own recordings are needed to find their cause.
- Velocity features (v5, v4 recipe + velocity): validation 96.6% vs 96.8%, test real video 95.4% vs 97.0%.
  Not deployed; v4 stays.
- Communicate page adds words fully automatically: a confident sign is added; an unsure one adds its best guess
  when the model gives it >= 30%, with the runner-ups as optional one-tap replacements. On held-out test
  streams this moves missed signs into correct ones (real video, close-up: correct 78.7% -> 85.1% with the
  still rule) at the cost of 1-2 points more wrong words.

### 2026-10-07: Sign-to-word check (user: "flat" shown as "Wednesday"), label audit, v6
- Live log: the user's "flat" got WEDNESDAY at 0.42, which the new auto-add rule (>= 0.30) added; raised to 0.50.
- Label audit (`experiments/reports/label_shift_*.json`): no video filed under two words; pose-release vs video
  copies agree (median wrist-trajectory correlation 0.96). Cross-session nearest-neighbour check: one INCLUDE
  session (Home, MVI_4896-4955) has folder boundaries off by one (third take of each word = next word's
  sign); a within-session check agrees. 20 clips relabelled in both copies, plus MVI_5138 HOT -> COLD:
  `data/metadata/splits/combined_words_v3` (`label_fixes.json`). The first attempt matched by file number
  only and hit Colours clips with the same numbers; redone matching category + word + file.
- Hand visibility: while the arm is raised, hands are found in 71% (INCLUDE videos) / 80% (pose release) of
  frames vs ~99% for webcam-like team recordings (motion blur). A zoomed upper-body hand search only raised it
  to 72-73%. Gap filling (interpolate hands over gaps <= 0.4 s) restores a median of 100%; trained as v7
  (`features.fill_gaps_s`), but it did not beat v6 on streams, so it is off.
- Models on the corrected labels, threshold tuned on validation streams (12 fps, normal + close-up framing):
  mean correct / wrong, validation: v4 91.1% / 1.1%, v6 93.7% / 0.8%, v7 93.3% / 1.3%; test: v4 89.5% / 1.1%,
  v6 92.4% / 1.6%, v7 91.7% / 1.6%. Deployed v6 (`isl_mudra_combined_v6_bilstm`, threshold 0.7, tta 1).
- New: `/reference/{sign}` + "How to sign it" viewer (one real training example per word as a skeleton,
  mirrored); per-word test accuracy in the model card and the word list.
