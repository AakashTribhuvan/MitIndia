# MUDRA Development Blueprint v1.0

## 1. Document control

| Field | Value |
|---|---|
| Project | MUDRA: Indian Sign Language (ISL) recognition to text and speech, and text/speech to a 3D signing avatar |
| Repository | this repository (`github.com/Addy-coder786/Mudra`); v1.0 is built here, not in a new repository |
| Blueprint version | 1.0 |
| Created | 2026-10-15 |
| Status | **Draft, pending review** |
| Baseline | tag `v0.9.0` (commit `b7cda89`): the state this blueprint starts from |
| Related | `HANDOVER.md` (current state, the source of truth for what exists), `docs/AUDIT_2026-10-13.md` (what the numbers mean), `AGENTS.md` (rules) |

**Purpose.** This blueprint defines what **MUDRA v1.0** is, the milestones that lead to it, and the
evidence needed to call each one done. It is guidance for planning. It is not proof that anything
works: what exists is recorded in `HANDOVER.md`, and claims are checked against code and test output.

**Change history**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-15 | First blueprint, written after the 2026-10-13 audit and the `v0.9.0` checkpoint |

**Versioning rules**
- **v1.x** (v1.1, v1.2, …): clarifications, updated status, changed targets or added tasks within the
  same milestone structure.
- **v2.0:** a change of goal, scope or milestone structure (for example adding sentence translation
  to the v1.0 release).
- Every version is a **new file** (`MUDRA_DEVELOPMENT_BLUEPRINT_v1.1.md`, …). Earlier versions are
  never edited after a newer one exists, except to fix a broken link. Each new version adds a row to
  its change history and to `docs/blueprints/README.md`.
- A blueprint version is "Approved" only when the project owner says so; the status line records it.

---

## 2. Project overview

**What exists at `v0.9.0`** (details and evidence: `HANDOVER.md`):
- A React web app: **Communicate** (live sign → word → sentence → speech, and voice/text → 3D avatar),
  **Learn**, **Practice** (rule-based coach for 8 signs), **Progress**, **Record** (teach new words).
- A FastAPI backend with a trained landmark model, **v8**: 314 words plus a "no sign" class
  (`app/backend/models/isl_mudra_combined_v8_desk_bilstm`). The browser runs MediaPipe and sends hand
  and body landmark coordinates, never video.
- Live sign segmentation (start/end detection, parked-hands rule), custom words from recordings,
  training and evaluation scripts, and 66 automated tests.

**What it is not, at `v0.9.0`:**
- Not a sentence translator. It recognises isolated words, one at a time, and joins them; sentences
  come from a fixed phrase table.
- Not proven on new people. Test clips share signers and sessions with training (97-99% there); about
  67% on recording sessions never seen in training; no measurement on people outside the data.
- Not reliable on the developer's laptop webcam yet. Last session (2026-10-13, v8): 1 word added out
  of 15 segments, with ground truth unknown.

**Relationship to MudraPhoneWebcam.** A separate prototype (phone camera via Camo, a still-pose
matcher, a video annotation tool) lives outside this repository and is not part of v1.0. Pieces of it
may be brought in later only through a reviewed change (Section 6, M3); it is never edited from here.

### 2.1 Definition of MUDRA v1.0

v1.0 is released when **all** of the following hold, each with recorded evidence (Section 7):

1. **Webcam:** the laptop's built-in webcam gives a stable live feed in the browser at ≥ 15 fps
   tracking on the development laptop, with a clear message when the camera is missing, blocked, black
   or slow.
2. **Vocabulary:** a fixed v1.0 word list (proposed size 20-50 everyday words), each word's sign
   reviewed by an ISL-fluent person, including the app's own words that are missing today (NAMASTE,
   WATER, HELP, YES, NO, GOODBYE, HOME, PERSON) if they are in the list.
3. **Accuracy on new people:** in live tests by signers who are in **no** training data, signing the
   v1.0 words with a short pause between signs: **proposed targets ≥ 80% correct, ≤ 5% wrong words,
   ≤ 1 false word per idle minute** (targets to be agreed by the project owner before testing; Section 7).
4. **Output:** recognised words become a sentence spoken in English; Hindi and Marathi for the phrase
   table; unsure words are visibly marked; "unknown" is shown instead of a guess.
5. **Honest product:** no invented numbers, testimonials or capability claims anywhere in the app or
   docs (the 2026-10-13 audit standard).
6. **Docs and release:** `HANDOVER.md` and this blueprint match the code; release tagged `v1.0.0`.

**Out of scope for v1.0:** continuous sentence recognition and translation, the 1,550-word
vocabulary, Zoom / Google Meet integration, mobile apps, fingerspelling recognition. These are
candidates for v1.1+ or v2.0.

---

## 3. Documentation reading order

Before changing anything:
1. `HANDOVER.md` Sections 0, 1, 2 and 16 (state and open problems), then the sections for the area you
   will touch (Section 0 has the mapping).
2. This blueprint: the milestone you are working on and its acceptance criteria.
3. `docs/AUDIT_2026-10-13.md` before quoting any number.
4. `AGENTS.md` and `CLAUDE.md` (rules).
5. The source code and tests of the area itself. **Documentation is guidance to verify, not proof that
   a feature exists.** If code and docs disagree, the code wins and the docs are corrected in the same
   change.

---

## 4. Repository safety rules

1. Work in this repository only. Never modify MudraPhoneWebcam or any other project without the
   owner's explicit permission.
2. Never delete or modify source videos or datasets (`C:\ISL\…`, `data/raw/`, `data/external/`,
   `data/processed/`, `data/metadata/`).
3. Never commit or push datasets, landmark files of real people, `data/metadata/manifest_app.csv`
   (contains recorders' names) or saved live sessions. The repository holds code, configs, docs and
   deployed models only (`.gitignore` enforces most of this; check `git status` before every commit).
4. Commit and push only when the owner asks. Every push updates `HANDOVER.md` (pre-push hook).
5. Camera processing stays local: video never leaves the browser; landmarks go only to the MUDRA
   server the user runs.
6. No new frame recording, uploads or persistent storage without the owner's explicit request. The
   existing opt-in session saving (`MUDRA_SESSION_DIR`) needs the signer's consent each time.
7. Never identify people from faces (the personal-data rule in `HANDOVER.md`).
8. Never invent, round up or tune on test numbers (`AGENTS.md`).

---

## 5. Hardware and webcam configuration

**Current development hardware:** the laptop's built-in webcam. No phone, Camo or phone-to-PC link
is required or assumed.

**How the camera is opened today** (verified in `app/frontend/src/services/handTracker.js`):
`navigator.mediaDevices.getUserMedia` with `width: ideal 640, height: ideal 480, frameRate: ideal 30,
facingMode: 'user'`. The browser chooses the default camera; there is **no camera picker** and no
resolution setting in the UI. OpenCV camera indices do not apply to this app (they belong to the
Python extraction scripts and the separate prototype).

**What has been observed** (from the backend log; the device identity is not recorded):
- 2026-10-06/07: about 6-8 fps tracking in live sessions.
- 2026-10-13 (v8): about 8-14 fps, hands and shoulders tracked; the browser connected and frames
  arrived. GPU vs CPU delegate: not recorded (the diagnostics added on 2026-10-12 report it on screen
  from now on).

**Tasks for M1:** camera picker and resolution choice (stored per browser), clear errors for
denied / missing / black / frozen camera, delegate and camera-fps display verified on the laptop.
Every device-specific result stays **Unverified** until it is observed on the actual laptop and
written down with date, browser and settings. Do not claim the camera works before such a test.

---

## 6. Milestone roadmap

These are planned stages. **None is complete** unless Section 10 says so with evidence.

### M0: Repository and code audit
- **Goal:** know what the code really does and what the numbers really mean.
- **Status:** done for this repository on 2026-10-13 (`docs/AUDIT_2026-10-13.md`), checkpoint
  `v0.9.0`. Repeat a short audit at the start of each later milestone for the code it touches.
- **Evidence:** the audit report; 66 tests passing at `v0.9.0`.

### M1: Laptop webcam reliability
- **Goal:** the Communicate page gets a stable, responsive feed from the built-in webcam and fails
  clearly when it cannot.
- **Depends on:** M0.
- **Tasks:** camera picker + resolution setting; error states (permission denied, no camera, black
  frames, frozen stream); verify GPU delegate and tracking fps on the laptop; check that stopping the
  camera releases it (light off) and the page can restart it; keep the slow-camera / slow-tracking
  banners accurate.
- **Acceptance:** on the development laptop, in normal room light: tracking ≥ 15 fps sustained for
  5 minutes; camera released on stop; each error state shown correctly when provoked.
- **Evidence:** a test note in `HANDOVER.md` (date, browser, camera, fps readings, screenshots or the
  backend log), plus automated tests for the error handling where possible.

### M2: Landmark visualisation and live segmentation
- **Goal:** hands and upper body are tracked reliably while signing, and the stream is cut into whole
  signs correctly.
- **Depends on:** M1.
- **Tasks:** labelled live recordings (Record page, 5 known words × 3 takes) replayed through the live
  recognizer; diagnose the over-cutting seen on 2026-10-13 (segments of 0.5-0.8 s); fix it (stillness
  timing, `still_keep_s`, joining fragments) on validation data; live retest.
- **Acceptance:** on labelled live recordings: hand detected in ≥ 90% of signing frames; ≥ 90% of signs
  cut as exactly one segment; no regression > 1 point on the validation streams.
- **Evidence:** replay output (`training/scripts/replay_session.py` or `eval_continuous.py` on the
  recordings), the settings chosen and on which split.

### M3: Data audit and annotation
- **Goal:** know exactly what data v1.0 is trained and tested on, and that it may be used.
- **Depends on:** M0; can run in parallel with M1-M2.
- **Tasks:** choose the v1.0 word list; check each word's sign with an ISL-fluent reviewer (and the
  ISLRTC dictionary); confirm licence / consent for team recordings; record **signer IDs**
  (pseudonymous) for every new recording; collect recordings from several people per word (Record
  page; FDMSE-ISL or other datasets if access is granted); decide which external data (INCLUDE, ISLVT
  sentence videos as a test set) is used and how.
- **Acceptance:** a manifest for every v1.0 word with source, signer ID, session, licence/consent
  status and review status; no word in the list without a reviewed sign; licence of the team data
  confirmed in writing.
- **Evidence:** the manifest and its summary in `HANDOVER.md` Section 12 (counts per word / signer).

### M4: Baseline recognition experiments
- **Goal:** a leakage-safe, reproducible measurement of the current model on the v1.0 words.
- **Depends on:** M3.
- **Tasks:** build a **signer-disjoint** split (test signers appear in no training data); freeze it
  before any tuning; evaluate v8 on it (clip level and streams); record per-word accuracy and
  confusions.
- **Acceptance:** split frozen with a leakage check that includes signer IDs; baseline numbers
  recorded with model, split hash and script.
- **Evidence:** run outputs under `experiments/` and their summary in `HANDOVER.md` Section 13.

### M5: Limited recognition pilot (the v1.0 release candidate)
- **Goal:** meet the v1.0 targets (Section 2.1) on the v1.0 vocabulary.
- **Depends on:** M2 and M4.
- **Tasks:** train on the v1.0 data (keeping the model architecture unless a measured reason says
  otherwise); a "v1.0 words" vocabulary setting so the app chooses only among the listed words;
  thresholds on validation only; live test sessions with new signers.
- **Acceptance:** the v1.0 targets met in live tests by signers outside the training data, each test
  logged with ground truth.
- **Evidence:** live test logs with the words actually signed, per-signer results, and the final
  model card. Then tag `v1.0.0`.

### M6: Continuous signing and sentence translation (after v1.0)
- **Goal:** recognise signs without pauses and translate sentences.
- **Depends on:** v1.0 released; sentence-level data with per-sign time boundaries and reviewed gloss
  sequences (the ISLVT and sentence videos need annotation first); a temporal model and evaluation
  plan agreed in a later blueprint (v2.0).
- **Acceptance and evidence:** defined in that blueprint. Not started.

---

## 7. Testing and acceptance

Every milestone result records: the **command** run, **environment** (machine, OS, browser, Python /
Node versions, model, settings file), the **result**, and **unresolved issues**.

Kinds of test, always named as such:

| Kind | Example | Counts as live evidence? |
|---|---|---|
| Automated | `pytest training app/backend/tests`, `npx vite build` | no |
| Offline on recorded data | clip accuracy, `eval_continuous.py`, replay of recordings | no |
| Simulated | stitched streams, close-up / desk / low-fps simulations | no |
| Manual live | a person signing in front of the laptop webcam, with the signed words written down | **yes** |

Rules:
- A milestone is never complete because code was written; only when its acceptance criteria are met
  with evidence.
- Live tests record the ground truth (which words were signed, in order) and the signer's ID; without
  ground truth a live session is diagnostics only.
- Targets are agreed **before** a test run and not changed after seeing results.
- The test split is used once per decision, never for tuning; `eval_continuous.py --tune` refuses test
  splits.
- Report per-word and per-signer results, not only an average.

---

## 8. Privacy and data governance

- Camera processing stays local by default; only landmark coordinates go to the MUDRA server.
- Recording, storage or upload of anything new needs the owner's explicit approval and the signer's
  informed consent.
- Before training on any dataset: licence, provenance, consent, label quality and leakage risk are
  checked and written down (M3).
- Original datasets stay untouched; derived data (landmarks, manifests, splits) is traceable to its
  source through manifests with content hashes.
- Signer IDs in shared files are pseudonymous; real names stay out of the repository.

---

## 9. Documentation maintenance

- `HANDOVER.md`, `docs/architecture.md`, this blueprint and the code are kept in step: every push
  updates `HANDOVER.md`; a milestone's status changes only with evidence.
- Write what the code does and what was measured, not plans presented as facts.
- Known limitations and open decisions go in `HANDOVER.md` Section 16.
- A new blueprint version (Section 1) is created when a milestone's scope, order or targets change;
  the old file stays as it was.

---

## 10. Current status and next actions (2026-10-15)

**Verified (with evidence in `HANDOVER.md` / the audit):**
- `v0.9.0` pushed and tagged (`b7cda89`); 66 automated tests pass; the frontend builds.
- v8 is deployed; its reported test numbers reproduce; the laptop webcam streams landmarks to the
  backend (live log of 2026-10-13, 8-14 fps).
- M0 is done for this repository.

**Unverified or unknown:**
- Accuracy for people outside the training data (best proxy: about 67% on unseen sessions).
- Why live segments were 0.5-0.8 s on 2026-10-13 (over-cutting, fidgets or sign variants).
- GPU vs CPU tracking on the laptop; sustained fps.
- Licence of the team recordings.

**Blockers:**
- No labelled live recordings yet (needed for M2).
- No signer IDs in any dataset (needed for M4).
- No ISL-fluent reviewer named yet (needed for M3).

**Next recommended milestone: M1, then M2.** Immediate tasks: verify the webcam behaviour on the
laptop (fps, delegate, error states), then record 5 known words × 3 takes on the Record page and
replay them to diagnose the live cutting.

**Reminder:** a working camera and good landmark tracking are not ISL recognition. Recognition counts
only when Section 2.1 is met with live evidence from new signers.
