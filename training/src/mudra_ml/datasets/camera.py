"""Simulated close-up webcam framing.

Training videos show signers standing back with the whole upper body in view. A laptop webcam
sees the head and shoulders large, with the frame ending around the chest: hands appear only
when raised, and the shoulders may touch the frame edge. ``closeup_view`` re-frames a clip that
way (a virtual camera crop around the head and shoulders) and drops what such a camera would
not see: a hand mostly outside the frame is not detected, and pose points outside it get low
visibility, as MediaPipe reports them.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from mudra_ml import schema
from mudra_ml.preprocessing.sequence import LandmarkSequence

NOSE = 0
MIN_HAND_INSIDE = 0.6  # share of a hand's 21 points that must be in the frame for it to be detected


WEBCAM = (640, 480)  # the virtual camera is 4:3, like a laptop webcam


@dataclass
class CloseupParams:
    above_nose: float  # frame top, shoulder widths above the nose
    below_shoulders: float  # frame bottom, shoulder widths below the shoulder line
    shift: float  # horizontal offset of the frame centre, shoulder widths

    @classmethod
    def sample(cls, rng: np.random.Generator) -> CloseupParams:
        # 0.3 below the shoulders = hands visible only at the face; 1.3 = most of the signing space
        return cls(rng.uniform(0.3, 0.9), rng.uniform(0.3, 1.3), rng.uniform(-0.15, 0.15))


def closeup_view(seq: LandmarkSequence, params: CloseupParams) -> LandmarkSequence | None:
    """The clip as a close-up webcam would see it, or None when the clip has no usable shoulders."""
    w, h = int(seq.meta.get("width", 0)) or 1, int(seq.meta.get("height", 0)) or 1
    frames = np.flatnonzero(seq.pose_present)
    if not len(frames):
        return None
    px = seq.pose[frames, :, :2] * [w, h]
    ls, rs = px[:, schema.POSE_LEFT_SHOULDER], px[:, schema.POSE_RIGHT_SHOULDER]
    sw = float(np.median(np.linalg.norm(ls - rs, axis=1)))
    if sw < 1:
        return None
    centre = np.median((ls + rs) / 2, axis=0)
    nose_y = float(np.median(px[:, NOSE, 1]))
    y0 = nose_y - params.above_nose * sw
    y1 = centre[1] + params.below_shoulders * sw
    half_w = (y1 - y0) * WEBCAM[0] / WEBCAM[1] / 2
    x0 = centre[0] + params.shift * sw - half_w
    x1 = centre[0] + params.shift * sw + half_w
    if y1 - y0 < 1 or x1 - x0 < 1:
        return None

    def reframe(xy: np.ndarray) -> np.ndarray:
        out = xy.copy()
        out[..., 0] = (xy[..., 0] * w - x0) / (x1 - x0)
        out[..., 1] = (xy[..., 1] * h - y0) / (y1 - y0)
        return out

    def inside(xy: np.ndarray) -> np.ndarray:
        return (xy[..., 0] >= 0) & (xy[..., 0] <= 1) & (xy[..., 1] >= 0) & (xy[..., 1] <= 1)

    hands = seq.hands.copy()
    hands[..., :2] = reframe(seq.hands[..., :2])
    present = seq.hand_present & (inside(hands[..., :2]).mean(axis=-1) >= MIN_HAND_INSIDE)
    hands[~present] = 0.0
    pose = seq.pose.copy()
    pose[..., :2] = reframe(seq.pose[..., :2])
    pose[..., 3] = np.where(inside(pose[..., :2]), pose[..., 3], np.minimum(pose[..., 3], 0.2))
    meta = {**seq.meta, "width": WEBCAM[0], "height": WEBCAM[1]}
    return LandmarkSequence(hands.astype(np.float32), present, present.astype(np.float32), pose.astype(np.float32),
                            seq.pose_present.copy(), seq.timestamps_ms, meta)
