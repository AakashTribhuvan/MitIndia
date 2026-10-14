# Phone webcam upper-body tracking check

This is a fresh prototype for using the Samsung Galaxy A27 as a camera source for MUDRA on Windows.
It currently uses Camo's existing USB transport and Camo Camera virtual device; it is not yet the
full MUDRA app or a custom USB webcam driver. `test.py` runs MediaPipe Pose Landmarker Lite and
Hand Landmarker at the camera's negotiated native frame size by default. It draws torso/arm pose
and all 21 landmarks on each detected hand, and runs a first-pass sign-activity boundary experiment.
It does not provide validated ISL recognition or save video; an optional experimental
still-pose matcher is documented below.

Read [HANDOVER.md](HANDOVER.md) for the current status and diagnosis, and
[docs/architecture.md](docs/architecture.md) for the signal path.

## Run

Open PowerShell in this folder and install the two Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

For a quick Windows launch, connect Camo Studio and double-click [`start.bat`](start.bat) in this
folder. It runs the static-pose demo with the known Camo Camera 1 / Media Foundation setup, using
the sibling `D:\College\MIT_Indian\.venv` environment. Keep the command window open while using the
camera and dashboard.

List the camera indices OpenCV can read, including frame brightness:

```powershell
python test.py --list-cameras
```

Then run the index that corresponds to Camo (`1` is only an initial guess). Auto mode tries
DirectShow and Media Foundation and rejects near-black frames; to force one backend, pass
`--backend dshow` or `--backend msmf`:

```powershell
python test.py --camera 1
```

The last probe found camera 1 + Media Foundation as the likely Camo feed at 1280x720; camera 1 +
DirectShow returned black frames. The known-good choice from that probe is:

```powershell
python test.py --camera 1 --backend msmf --capture-width 1920 --capture-height 1080 --show-clean-inset
```

Press **Q** or **Esc** while the preview window is focused to close it. The script requests
1920x1080 capture and, by default, uses the actual frame size returned by the camera for inference.
The startup output reports the negotiated size; camera drivers may choose another mode. Set Camo
Studio's phone-camera output quality to its highest option too. Native-resolution inference may
lower FPS; use `--max-width 1280` or `--max-width 640` to trade resolution for speed. Use
`--capture-width` and `--capture-height` to request another camera mode.
`--show-clean-inset` shows an unannotated picture-in-picture copy of the same current frame next to
the main image, which has the pose and finger landmarks overlaid.

Run the synthetic start/stop state-machine tests with:

```powershell
python -m unittest discover -s tests
```

## Experiment with sign start/stop

When the detector sees a sign candidate or active segment, the preview draws a padded box around the
detected hand(s): yellow for `SIGN CANDIDATE`, green for `SIGN IN ACTION`, cyan for `STATIC SIGN`,
and orange for `SIGN ENDING`. The box marks the hand area the detector is using as evidence; it is
not a box around the entire body or a recognized sign class.

The preview also labels activity as `STARTING`, `MOVING`, `STATIC HOLD`, or `ENDING`; the terminal
prints the detected start and end boundaries, their confirmation times, and segment duration. A
raised hand can keep a static sign active without motion. Wrist movement can start a dynamic sign,
and the stop is confirmed after the hands return to rest for a sustained interval. This is an
initial segmentation aid, not an ISL recognizer or a universal neutral-pose detector; test and tune
it with a signer. Repeating the same static sign after movement is not implemented.

```powershell
python test.py --camera 1 --backend msmf --start-hold 0.15 --stop-hold 0.7 --movement-threshold 1.0
```

- `--start-hold` sets how long activity must persist before a start is reported (seconds).
- `--stop-hold` sets how long activity must be absent before a stop is reported (seconds).
- `--movement-threshold` sets wrist speed in shoulder-widths per second.
- `--raised-below-shoulder` sets how far below the shoulder line a wrist may be while still counted
  as raised, in shoulder widths.

The preview shows measured wrist speed and whether a wrist is considered raised, to help tune those
values. Short fidgets can be rejected by increasing `--start-hold`; increase `--stop-hold` if pauses
within a sign split it too readily. Results still need real signing validation; this version does not
save segment video or landmark data.

## Browser dashboard and live tuning

Run the browser dashboard instead of the OpenCV preview:

```powershell
python test.py --camera 1 --backend msmf --web-ui --open-web-ui
```

The responsive dashboard shows the annotated camera feed, detector state and activity measures.
Its sliders adjust start confirmation, rest confirmation, mode change delay, movement sensitivity,
and the raised-hand zone while tracking continues. The mode delay is the first setting to increase
if the `STATIC`/`DYNAMIC` label changes too quickly. The reset button returns to the recommended
thresholds. Values apply to the current run only; settings are not saved.

By default the dashboard listens on this computer only (`127.0.0.1`). To open the same dashboard
on a phone or tablet on the same trusted Wi-Fi network, start it with:

```powershell
python test.py --camera 1 --backend msmf --web-ui --web-host 0.0.0.0
```

Then browse to `http://<this-computer-LAN-IP>:8765/` from that device. Find the computer's LAN IPv4
address with `ipconfig`; allow the Python process through Windows Firewall for a **private** network
if prompted. Do not expose this unauthenticated tuning server to the public internet. The camera and
landmark processing stay on the Windows computer; the annotated preview is streamed to connected
dashboard clients on that network and is not recorded. Phone access controls the PC's current
session—it does not use the phone's browser camera.

This is a standalone, web-first UI in `web/`, served by the prototype itself using Python's standard
library. Its small-screen layout works in modern phone browsers and leaves an Electron wrapper as a
possible later packaging step. It does not edit or reuse the main MUDRA application's frontend.
The visual direction takes cues from pre-2020 editorial web layouts—strong typography, an illustrated
empty state, a short guided first-use sequence, precise spacing, geometric accents and restrained
motion—while using a warm ivory, deep blue, teal and saffron palette. Fonts are system-local; no
external assets are required.
The Awwwards 2018/2019 archive pages were checked, but their dynamic listings did not expose
individual winning projects in this environment; this is an era-inspired original layout, not a
recreation of a specific award winner.

## Review sentence videos and mark sign boundaries

Run the standalone, loopback-only video reviewer without opening the webcam tracker:

```powershell
python video_review.py
```

It opens `http://127.0.0.1:8766/`, lists videos under
`training_data/Videos_Sentence_Level/`, and serves their original bytes read-only with browser
seeking enabled. If a browser cannot play a source codec, the reviewer falls back to OpenCV-decoded
frame seeking and playback; this does not transcode or replace the source. Search by phrase folder
or filename, play/pause/scrub to set each sign's actual
start and end, enter the reviewer-confirmed gloss, and optionally mark meaningful motion phases at
the playhead. Add signer/session IDs only when known; the folder label is displayed as provisional
context and is never copied into the gloss automatically. Provenance, consent/license, acceptance
and notes fields are per segment. Existing annotations can be reopened and edited.

Saved rows go to `training_data/manifests/video_sign_segments.csv`; source videos are not modified.
Times are validated against decoded video duration and phase timestamps must be ordered within the
segment. The manifest records a source path ID and SHA-256 at save time. An `accepted` segment is
not eligible for training unless its gloss and provenance/consent are also reviewed; uncertain or
impermissible data must remain rejected/excluded. The app binds only to `127.0.0.1` and does not
upload videos or annotations.

This is currently a separate annotation/replay process, not a dashboard tab; keep its terminal open
while using it. No annotations have been saved, and there is no extracted temporal dataset or
trained dynamic-sign model yet. The approved next step is an integrated **Video Lab** tab in the
main dashboard for prerecorded-video testing, live-camera diagnostics/testing, and a Learning menu
of reviewed video examples. Until reviewed sequences and offline model gates are complete, Video
Lab must not claim dynamic recognition.

## Still-image static-pose prototype

The current image-only pilot uses ten candidate folders `I_ME_MINE_MY`, `YOU`, `FOOD`, `HELP`,
`WHAT`, `HOW`, `COLLEGE_SCHOOL`, `NICE`, `THANK`, and `DO` under
`training_data/Frames_Word_Level/`. The five additional folders were selected for having multiple
filename-derived groups as well as useful image counts. These are folder labels, not verified ISL
glosses; `I_ME_MINE_MY` may combine meanings. Manifest rows begin with `folder_label_unverified`
and `needs_review`. Extract torso-centered/body-scaled Pose and Hand landmarks, face-relative hand
position/orientation, quality information, a CSV index, and review contact sheets with:

```powershell
python static_sign_prototype.py prepare
```

Review `training_data/manifests/selected_static_samples.csv` and the sheets under
`training_data/review/`. Confirm each intended ISL gloss, whether its meaning requires motion,
source/video and signer/session IDs, and label/tracking status. Filename-family groups are guesses
to avoid splitting likely neighboring frames; they are not verified source-video identities.
The CSV is the review worksheet: correct `label` if a folder combines distinct glosses, fill in
`verified_gloss`, `sign_motion`, source clip/signer/session fields, and replace `source_group` with
the reviewed source ID when available. Set `annotation_status` and `review_status` explicitly.
`prepare` preserves these human-edited fields when it refreshes extraction, while recalculating
tracking metrics and splits.

Each source image is extracted in its original orientation and as a horizontal mirror. Both variants
stay in the same filename-family split; mirrored variants are used for training, while
validation/test scoring uses unaugmented originals. This prevents an image and its mirror from
leaking across splits. The live path uses the selfie-mirrored convention, but detector handedness is
not passed to the recognizer or used as a tracking-quality gate. Mirroring is an augmentation
assumption, not proof that a sign is equivalent when performed with either hand. Confirm this with
an ISL-fluent reviewer, especially for asymmetric signs.

If both hips are not visible enough, torso position is estimated from the shoulder midpoint and
shoulder width; reliable hips continue to anchor the normal path. The fallback estimates the hip
midpoint one shoulder-width below the shoulders, needs both shoulders clearly detected, and is only
a geometric estimate—not a replacement for framing the upper body. `torso_anchor_source` in the
manifest records which path was used.

Schema v10 uses the existing Pose Landmarker head points as a face anchor (nose plus ears, falling
back to eyes). It records each wrist relative to the nose in face-width units and the dot product between the index-finger direction and the
wrist-to-nose direction. This helps distinguish signs whose hand location/orientation is
face-relative, such as the candidate FOOD class. FOOD is rejected as unknown when no face anchor is
available. This is not a dense face mesh, does not model facial expression, and requires a visible
nose plus a usable eye or ear pair. `face_anchor_source` in the manifest identifies the anchor or
records `unavailable`.
Torso/shoulder and face normalization make global screen position and signer scale less important
while preserving hand position relative to the body/face, which can be linguistically meaningful.
No separate raw-screen-coordinate interpolation layer is used.

The model learns separate medoids and thresholds for each exact hand count, and matching only
compares the same count at inference. It never uses zero as a wildcard. `HELP` is constrained to
two tracked hands; the latest manifest has 11 accepted one-hand and 13 two-hand `HELP` originals,
but only its two-hand examples train the `HELP` profile. These folder labels and images remain
unverified, and the count separation alone cannot ensure the intended gloss is matched.
Raw hand counts are not fully stable: `HELP (1).jpg` is recorded as one detected hand during
preparation but was detected as two on repeated prediction runs. Exact-count matching does not
prevent this detector inconsistency from switching which profiles are eligible.
The general automatic gate also rejects samples with anchor visibility below 0.45 or a largest
detected hand smaller than 30 pixels or 1.5% of the image diagonal, whichever is greater. These
are screening thresholds, not proof that every finger is tracked correctly; review images and
landmarks before training.

The intended product is a reviewed sign catalog first, with the matcher as a secondary
similarity-based retrieval aid. For this small pilot, versioned landmark arrays plus the CSV
provenance/review manifest are sufficient; a vector database is unnecessary. Static signs can be
matched against reviewed pose exemplars, while movement-dependent signs need ordered landmark
sequences. Do not treat folder labels or unreviewed external datasets as verified ISL glosses.

Train and evaluate the nearest-medoid static-pose baseline, then predict a single still image:

```powershell
python static_sign_prototype.py train
python static_sign_prototype.py predict-image "training_data\Frames_Word_Level\YOU\YOU (1).jpg"
```

The baseline excludes images that fail the automatic pose/hand tracking gate and keeps inferred
filename families together during splitting. Run it alongside the live camera as an experimental
static-pose demo:

```powershell
python static_sign_prototype.py train
python test.py --camera 1 --backend msmf --static-demo --open-web-ui
```

`--static-demo` enables the dashboard automatically. It reports a label only for a tracked pose
that stays stable briefly; the UI can report unknown or check tracking instead. The demo estimates
class rejection thresholds by holding out inferred filename groups, rather than using the tiny
validation split. These groups are guesses, not verified clips or signers, so thresholds and every
live output are experimental—not reliable or validated ISL predictions.
`I_ME_MINE_MY` is also an unverified folder label that may combine distinct glosses. The model
updates from current pose landmarks; it does not recognize movement or sentence meaning. If
movement carries a sign's meaning, this still-pose matcher cannot recognize it. Outputs remain
under `training_data/derived/` and `training_data/models/`.
Add `--speak-recognized` to speak an accepted label once it remains stable for half a second;
`--speech-hold 0.4` changes that interval. Speech synthesis runs separately from the camera loop.

The schema-v10 model accepted 656 augmented rows (351 originals and 305 mirrors); 55 mirror views
were rejected because the tracker changed the detected hand count. Its 55-image inferred-group
test split scored 36.4% (20/55). Treat this as a weak experiment, not expected live accuracy:
labels and filename-derived groups remain unverified, and a held-out original is not a substitute
for a new signer/session. Several new label/count profiles have no usable rejection threshold, so
they remain unavailable in Learning. The Learning camera overlays labeled gold targets for the
selected count-specific medoid's expected wrist positions, projected through the live
shoulder/torso anchor; live tracking landmarks remain visible beneath them. The model-guide badge
stays visible while waiting for pose tracking. This is an approximate positional guide, not a
complete expected-hand skeleton. Expected wrists projected outside the camera frame are marked at
the nearest visible edge with a direction label. Dynamic-sign recognition remains out of scope.
Known live-demo limitation (observed 2026-10-14): THANK has worked for the left hand, while the
right-hand attempt was repeatedly classified as FOOD. Handedness is not an explicit model feature,
but the geometric features and current mirror augmentation have not made recognition hand-invariant;
this is an unresolved asymmetric confusion, not validated behavior.

Future sentence-context idea: after dynamic signs and reviewed gloss sequences are available, test a
small language model or constrained next-gloss predictor as a separate contextual reranker. It must
not override weak/unknown visual evidence or be described as recognizing signs; evaluate whether it
improves sentence-level results without hiding vision errors.

Open `http://127.0.0.1:8765/images` while the dashboard is running to browse all 1,036 JPGs in the
dataset folder. Search by filename or folder and filter by label; thumbnails load as you scroll.
This index includes images outside the ten model folders.

The Studio stats are arranged in a high-contrast column beside the camera, with tuning controls
below. Learning displays the provisional English folder label above its reference image; it is not
an ISL-fluent-verified dictionary definition.

The dashboard has **Studio** and **Learning** tabs. Learning cycles through accepted original
reference images (not mirrored augmentations) and compares a held live pose with the practice
folder label. The enlarged camera stage is shared by both tabs. Learning is still a reference-image
exercise, not an authoritative dictionary or dynamic-sign tutor; it requires prepared manifest
data and the same optional `--static-demo` live matcher.

Keep Camo Studio connected and ready, then open this preview. Camo Studio's preview is not the
device Python opens: Python should open the separate **Camo Camera** virtual output. On Windows,
Camo's compatibility add-on must be installed for other apps to receive its video. If the preview
is black, `--list-cameras` reports brightness for each index/backend pair. OpenCV camera indices can
change; use a pair showing live, non-black video. If Camo Studio still shows the phone, check
whether **Camo Camera** works in Windows Camera, then retry the matching index/backend. See the
[Camo setup guide](https://camo.com/support/camo/camo-getting-started).

This script does not read Android's camera directly over USB. Camo carries the phone feed and
publishes a separate Windows **Camo Camera** virtual device for OpenCV. Bypassing Camo would require
a phone-side streaming app/protocol and a matching PC receiver, which this prototype does not yet
implement.

## Camera setup for tracking

- Use a stable phone mount and frame the upper body with both hands fully visible, including around
  the face and chest.
- Mount near shoulder/upper-chest height and tilt slightly downward rather than aiming steeply from
  above; the shoulder-only fallback helps when hips leave frame but cannot correct perspective
  distortion.
- Use bright, even light from in front of the signer; avoid a bright window behind them.
- Select the rear/main lens if practical. Keep autofocus on unless it hunts; if it does, lock focus
  on the signing area.
- Choose the highest stable Camo resolution profile. Avoid digital zoom, portrait/background blur,
  filters, retouching and auto-framing while testing because they can crop or soften hands.
- The measured Camo feed was 1280x720. Requesting 1920x1080 cannot add detail if Camo's virtual
  camera is only delivering 1280x720.

Camo controls differ by version and device. See Camo's
[video adjustment guide](https://camo.com/support/camo/adjusting-video-settings) and
[best-results guide](https://camo.com/support/camo/optimizing-camo).
