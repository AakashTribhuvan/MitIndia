# Phone Webcam Prototype Architecture

## Scope

The current deliverable is a local camera-and-landmark prototype, not the full MUDRA app. It uses
the already-installed Camo phone app and Windows Studio to make the Galaxy A27 available through a
Windows virtual-camera device. The Python program reads that device and runs MediaPipe Pose
Landmarker Lite and Hand Landmarker.

## Live signal path

```mermaid
flowchart LR
    Phone[Galaxy A27 camera]
    App[Camo Camera on phone]
    Usb[USB connection with debugging authorization]
    Studio[Camo Studio on Windows]
    VCam[Camo Camera virtual video device]
    CV[OpenCV DirectShow / Media Foundation]
    Capture[Request 1920x1080; use negotiated native size by default]
    Resize[Optional resize with --max-width]
    Pose[MediaPipe Pose Landmarker Lite]
    Hands[MediaPipe Hand Landmarker, up to 2 hands]
    Draw[Draw pose and 21-point hand skeletons]
    Segment[Heuristic sign activity and start/stop debounce]
    Preview[OpenCV preview window]
    Dashboard[Responsive local web dashboard]
    Events[Print start/stop times and duration]

    Phone --> App --> Usb --> Studio --> VCam --> CV --> Capture --> Resize
    Resize --> Pose --> Draw --> Preview
    Resize --> Hands --> Draw --> Preview
    Hands --> Segment
    Pose --> Segment
    Segment --> Preview
    Segment --> Events
    Segment --> Dashboard
    Hands --> Dashboard
    Draw --> Dashboard
```

Camo Studio's preview is a monitor of the incoming phone source. It is distinct from the virtual
`Camo Camera` endpoint that other desktop applications open. The Python program must select that
endpoint; camera index numbers are assigned by OpenCV/backend enumeration and are not stable names.

## Runtime behavior

1. `test.py` tries the requested camera index with DirectShow and Media Foundation in `auto` mode.
   It samples frames and accepts the first backend with mean grayscale brightness of at least 5/255.
   Use `--backend dshow` or `--backend msmf` to isolate a backend.
2. `--list-cameras` reports readable index/backend pairs, dimensions and mean brightness. A
   near-zero value indicates black pixels; a successful `VideoCapture` open by itself is not proof
   of a usable camera feed.
3. Capture requests 1920x1080 by default; the driver may negotiate another size, reported at
   startup. Frames are not resized by default. `--max-width` opts into resizing before inference.
4. Hand Landmarker runs on every frame (up to two hands); Pose Landmarker Lite runs every second
   frame by default, reusing its last result on intervening frames. Both use monotonically increasing
   timestamps.
5. The preview draws shoulders, arms and torso plus all 21 detected hand landmarks and finger bones.
   `--show-clean-inset` adds an unannotated picture-in-picture of the same current frame for
   comparison; it is not a second camera stream.
6. A heuristic activity state machine uses hand visibility, wrist movement normalized by shoulder
   width, and wrist height relative to the shoulders. It debounces activity to report start and
   sustained rest to report stop. Raised, still hands count as active so static holds are retained.
   The preview shows the state, elapsed time, wrist speed and raised/rest cue; confirmed boundaries
   and duration are printed to the terminal. Boundary timestamps use the first qualifying activity
   and the onset of sustained rest; confirmation times are printed separately after each debounce.
7. During `starting`, `signing` or `ending`, the preview draws a padded rectangle around all detected
   hand landmarks. Candidate, active-motion, static-hold, and ending states use distinct labels and
   colors. The rectangle is a visual cue for the hands used by the heuristic, not a classified sign
   region.
8. Frames and landmarks stay in memory and are not written to disk; sign segments are not saved.
   With `--web-ui`, annotated frames are streamed as MJPEG to dashboard clients on the configured
   host and settings are served through a small HTTP API. Without that option, the preview remains
   in the local OpenCV window.

## Sign activity experiment

The state machine moves through `idle`, `starting`, `signing` and `ending`. `--start-hold` controls
the activity debounce; `--stop-hold` controls the sustained-rest debounce. Wrist speed is measured
from consecutive Hand Landmarker wrist points and divided by shoulder width (or a frame-width
fallback when shoulders are not visible). `--movement-threshold` sets the movement cue.
`--raised-below-shoulder` controls the relative wrist-height cue. Without usable shoulders, a fixed
image-height wrist position is used as a fallback.

`--mode-hold` (and the dashboard's **Mode change delay** slider) debounces changes between the
displayed static and dynamic mode. The dashboard settings API updates thresholds in memory, and the
capture loop reads those values while processing frames. A settings change therefore takes effect
without stopping the camera; settings reset to CLI values on the next run.

This is deliberately a tunable first-pass boundary aid. The boundary state machine does not classify
signs or guarantee that every ISL sign is bounded correctly. Static holds can remain active while
the hands are raised; a hand held low and still may be missed, and a long pause during a dynamic sign
can end a segment. Validate with real signing and adjust the timers/thresholds before collecting
labeled examples.

## Optional still-image static-pose demo

`static_sign_prototype.py prepare` extracts Pose/Hand features from five selected image folders
(`I_ME_MINE_MY`, `YOU`, `FOOD`, `HELP`, `WHAT`) and writes a review manifest, feature archive, and
contact sheets. When hip visibility is too low, the torso center is estimated from the shoulder
midpoint and shoulder width; this requires both shoulders to pass the visibility gate. Every source image is extracted unmirrored and horizontally
mirrored; both variants remain in one inferred filename-family split.
Training includes accepted variants, while validation/test scores use only accepted original
images. The live webcam matcher receives the horizontally mirrored frame convention. Detector handedness
labels are not passed into feature extraction or live prediction, are not classifier features, and
are not used as a tracking-quality gate. Hand detections are retained by detection index, then
placed in body-relative spatial order; hand count comes from the raw detection list.

`static_sign_prototype.py train` writes an exploratory nearest-medoid model and evaluation report.
With `test.py --static-demo`, the live path compares features only during a stabilized static hold.
The model stores one medoid/rejection threshold per label and exact tracked-hand count. The live
path never compares a one-hand input against a two-hand profile (or vice versa); `HELP` only trains
from two-hand examples. Detection counts come from the raw list, before landmarks are assigned to
body-relative spatial slots. The manifest has 11 one-hand and 13 two-hand `HELP` originals, but only
the 13 two-hand examples enter the `HELP` model profile. Other labels may have separate one- and
two-hand variants where the data supports them.
Raw detector counts can still vary: the unchanged `HELP (1).jpg` source is recorded as one hand in
the manifest but returned two hands in repeated still-image prediction runs. Exact-count matching
keeps incompatible prototype profiles separate, but it cannot correct an unstable detector count.
Schema v9 also uses Pose Landmarker head points as a lightweight face anchor: nose relative to the
ears, or the eyes when ears are not visible. Per-hand features include wrist-to-nose location in
face-width units and an index-finger direction dot product with the wrist-to-nose vector. The same
anchor is drawn in the live camera preview and its source is recorded in the manifest. This is not a
dense face mesh and does not encode facial expression.
The live/still recognizer rejects a nearest `FOOD` result when this anchor is unavailable; that
guard prevents a face-relative class from being accepted without its intended reference points.
Global translation/scale are normalized against the signer rather than the image frame; hand
location relative to torso/face remains because it can distinguish signs. This canonicalization is
the initial invariance layer; detector-side labels are absent, but bilateral pose geometry remains.
Horizontal mirror augmentation is intended to cover equivalent one-hand variants; verify this with
left- and right-handed signers before claiming side invariance, especially for asymmetric signs.
The live overlay draws an arrow along the index finger and a 2D cue relative to the visible face
anchor; this is an image-plane direction estimate, not a depth or camera-facing estimate.

The reviewed sign catalog is intended to own glosses and reference examples; the prototype matcher
is a retrieval/ranking aid and should return unknown when evidence is weak. The current model is an
experimental nearest-medoid baseline, not yet a reviewed multi-exemplar catalog matcher. Meaning,
variants, permissions, and provenance must be reviewed before catalog entries are treated as
authoritative.
The Studio and Learning tabs share one camera stream; Learning shows an accepted original still and
compares the target folder label to the live match. It displays the English folder label above the
reference and explicitly marks it unverified. The Learning camera overlays gold wrist-position
guides reconstructed from the selected label/count medoid's torso-relative wrist coordinates and
the live torso anchor. It expects the reference's detected hand count and gives an approximate
wrist location; it is not a learned attention map and does not render the prototype's finger
shape. A mirrored augmentation is rejected when it changes the extracted hand count from its
original, preventing a one-hand source from training a two-hand profile due to inconsistent
detection. The current run rejected 50 such mirrored views. When static demo mode is active,
reference examples are limited to label/count profiles with finite rejection thresholds; the
two-hand FOOD and WHAT profiles are withheld because their rejection thresholds are unavailable.
Neither folder labels nor the
assumption that horizontal mirrors preserve a sign's gloss are verified; movement-dependent signs
are outside this model's scope. The v9 run accepted 506 extracted variants and scored 51.3% (20/39)
on inferred-group-held-out original images; this is exploratory and not a new-signer estimate. The
source groups and labels are unverified, so it is not evidence of usable recognition.

## Why Camo can work in Studio but fail in OpenCV

Studio can display the incoming phone image while the Windows virtual-camera compatibility output
is missing, disabled or misconfigured. Camo's Windows setup documentation says a compatibility
add-on must be installed for video to be exposed to other applications. Also, OpenCV's index 1 may
not refer to Camo Camera. In the first run, the script accepted the first readable DirectShow frame
even if it was black; a successful `VideoCapture` open and 1920x1080 dimensions did not identify
the device or prove it contained live pixels. The updated probe compares DirectShow and Media
Foundation brightness and avoids accepting a near-black startup frame.

Camo Studio's preview is not, by itself, evidence that Studio has exclusively locked the camera.
Camo exposes a separate virtual `Camo Camera` device to desktop applications. A competing app might
still hold that virtual endpoint, but first verify Camo's compatibility add-on and test the named
`Camo Camera` in Windows Camera. Then compare the OpenCV index/backend pairs. If Windows Camera also
shows black, investigate Camo's published output; if it works there but not in OpenCV, investigate
OpenCV enumeration/backend compatibility.

The initial run reported 1920x1080 and about 1 FPS while using the heavier Hand Landmarker on CPU.
The current version uses Hand Landmarker plus Pose Landmarker Lite (pose every second frame), so
performance still needs a live measurement. It preserves the negotiated camera resolution by
default; native-resolution inference may be slow on CPU. `--max-width` lets the user trade detail
for speed. The requested size is not proof Camo delivered that mode: use the actual dimensions
reported at startup and set Camo Studio's output profile independently.

## Known-good camera recovery

The last recorded OpenCV probe found two indices, each tested through two backends (four
index/backend combinations, not necessarily four physical cameras):

| OpenCV index | Backend | Reported frame | Mean brightness | Result |
|---|---|---:|---:|---|
| 0 | DirectShow | 640x480 | 133.4/255 | video present |
| 0 | Media Foundation | 640x480 | 135.8/255 | video present |
| 1 | DirectShow | 1280x720 | 0.0/255 | black |
| 1 | Media Foundation | 1280x720 | 106.8/255 | video present; likely Camo |

Camera 1 + DirectShow is the bad pairing. The current `auto` mode should reject the black frames
and continue to Media Foundation; force `msmf` to take the reproducible route directly. Brightness
varies with scene/lighting; use the near-black vs live-video distinction rather than expecting the
exact brightness reading to repeat.

Known-good command from that probe:

```powershell
python test.py --camera 1 --backend msmf --capture-width 1920 --capture-height 1080 --show-clean-inset
```

The measured Camo feed was 1280x720; requesting 1920x1080 cannot add detail beyond the virtual
camera's actual output. If the setup breaks, keep the phone app and Camo Studio connected, confirm
the Camo Camera device is available, close other apps using that virtual camera, and run
`python test.py --list-cameras`. Then try index 1 with `--backend msmf`; if results changed, select
the currently measured live index/backend rather than relying on the old index. A Studio preview
alone does not prove its Windows virtual-camera output is live.

After adding Hand Landmarker, a 12-frame smoke loop on the live 1280x720 feed ran hand inference
every frame and pose every other frame at 25.7 frames/s. No signer was in view, so this validates
model loading and processing throughput only, not hand detection or sustained signing performance.

For tracking, use the highest stable Camo resolution profile, a stable phone mount, and bright,
even front lighting. Keep hands fully in frame and in focus; avoid digital zoom, portrait/background
blur, filters, and auto-framing while validating landmarks because these can crop or soften hands.
See Camo's [video adjustment guide](https://camo.com/support/camo/adjusting-video-settings) and
[optimization guide](https://camo.com/support/camo/optimizing-camo).

## Boundaries and non-goals for this milestone

- No custom Android application or custom USB camera protocol.
- No Windows virtual camera driver written by this project; Camo provides that device.
- No camera selector in the browser UI, Electron packaging, or FastAPI service.
- No audio capture, video recording, persistence or network upload.
- Optional still-image static-pose classification is experimental only; activity boundaries remain
  heuristic and neither has been validated with a signer.
- No saving of segmented video or landmark data yet.
- No authentication on the optional dashboard; keep it bound to localhost or use only on a trusted
  private network. Do not port-forward or expose it to the public internet.

## References

- [Camo setup and Windows compatibility add-on](https://camo.com/support/camo/camo-getting-started)
- [Using Camo in other apps](https://camo.com/support/camo/camo-virtual-camera-in-apps)
- [Camo interface/status and device state](https://camo.com/support/camo/how-to-use-camo)
- [Camo video adjustment settings](https://camo.com/support/camo/adjusting-video-settings)
- [Getting the best results from Camo](https://camo.com/support/camo/optimizing-camo)
