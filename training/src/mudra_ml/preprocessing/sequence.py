"""Landmark sequence container and hand-slot assignment (numpy only).

Shared by offline extraction, training and the inference API, so live predictions
assign hands exactly as the training data did.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path

import numpy as np

from mudra_ml import schema


@dataclass
class LandmarkSequence:
    hands: np.ndarray
    hand_present: np.ndarray
    hand_score: np.ndarray
    pose: np.ndarray
    pose_present: np.ndarray
    timestamps_ms: np.ndarray
    meta: dict = field(default_factory=dict)

    @property
    def num_frames(self) -> int:
        return int(self.hands.shape[0])

    def detection_rates(self) -> dict[str, float]:
        if self.num_frames == 0:
            return {"any_hand": 0.0, "left_hand": 0.0, "right_hand": 0.0, "pose": 0.0}
        return {
            "any_hand": float(self.hand_present.any(axis=1).mean()),
            "left_hand": float(self.hand_present[:, schema.LEFT].mean()),
            "right_hand": float(self.hand_present[:, schema.RIGHT].mean()),
            "pose": float(self.pose_present.mean()),
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            path,
            hands=self.hands,
            hand_present=self.hand_present,
            hand_score=self.hand_score,
            pose=self.pose,
            pose_present=self.pose_present,
            timestamps_ms=self.timestamps_ms,
            meta=np.array(json.dumps(self.meta)),
        )


def load_sequence(path: Path) -> LandmarkSequence:
    with np.load(path, allow_pickle=False) as data:
        return LandmarkSequence(
            hands=data["hands"],
            hand_present=data["hand_present"],
            hand_score=data["hand_score"],
            pose=data["pose"],
            pose_present=data["pose_present"],
            timestamps_ms=data["timestamps_ms"],
            meta=json.loads(str(data["meta"])),
        )


def assign_hands(
    detected: list[np.ndarray],
    labels: list[str],
    scores: list[float],
    pose_frame: np.ndarray | None,
    mirrored_input: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Place detected hands into fixed [signer-left, signer-right] slots.

    Preferred: match each hand's wrist to the nearest pose wrist (anatomical labels).
    Fallback: MediaPipe handedness, which assumes a mirrored (selfie) image, so labels
    are swapped for ordinary, unmirrored video.
    """
    hands = np.zeros((2, schema.NUM_HAND_LANDMARKS, 3), dtype=np.float32)
    present = np.zeros(2, dtype=bool)
    score = np.zeros(2, dtype=np.float32)
    if not detected:
        return hands, present, score

    slots: list[int]
    if pose_frame is not None:
        pose_wrists = pose_frame[[schema.POSE_LEFT_WRIST, schema.POSE_RIGHT_WRIST], :2]
        dists = np.array([[np.linalg.norm(h[schema.WRIST, :2] - pw) for pw in pose_wrists] for h in detected])
        if len(detected) == 1:
            slots = [int(np.argmin(dists[0]))]
        else:
            straight = dists[0, 0] + dists[1, 1]
            crossed = dists[0, 1] + dists[1, 0]
            slots = [0, 1] if straight <= crossed else [1, 0]
    else:
        slots = []
        for label in labels:
            is_left_label = label.lower() == "left"
            signer_left = is_left_label if mirrored_input else not is_left_label
            slots.append(schema.LEFT if signer_left else schema.RIGHT)
        if len(slots) == 2 and slots[0] == slots[1]:
            slots[1] = 1 - slots[0]

    scores = list(scores) + [1.0] * (len(detected) - len(scores))  # missing scores must not drop hands
    for hand, slot, s in zip(detected[:2], slots, scores):
        if present[slot] and score[slot] >= s:
            continue
        hands[slot], present[slot], score[slot] = hand, True, s
    return hands, present, score


# MediaPipe Pose left/right landmark pairs (anatomical), swapped when an image is mirrored.
POSE_MIRROR_PAIRS = (
    (1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20),
    (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32),
)


def mirror_sequence(seq: LandmarkSequence) -> LandmarkSequence:
    """Horizontally flip a clip: x -> 1 - x, and swap signer-left / signer-right everywhere.

    Undoes selfie-mirrored recordings, or makes a left-handed version of a right-handed clip.
    """
    hands = seq.hands[:, ::-1].copy()
    present = seq.hand_present[:, ::-1].copy()
    score = seq.hand_score[:, ::-1].copy()
    hands[..., 0] = np.where(present[..., None], 1.0 - hands[..., 0], 0.0)
    pose = seq.pose.copy()
    pose[..., 0] = np.where(seq.pose_present[:, None], 1.0 - pose[..., 0], 0.0)
    for a, b in POSE_MIRROR_PAIRS:
        pose[:, [a, b]] = pose[:, [b, a]]
    return LandmarkSequence(
        hands=hands.astype(np.float32),
        hand_present=present,
        hand_score=score,
        pose=pose.astype(np.float32),
        pose_present=seq.pose_present.copy(),
        timestamps_ms=seq.timestamps_ms.copy(),
        meta={**seq.meta, "mirrored": not seq.meta.get("mirrored", False)},
    )


def fill_hand_gaps(seq: LandmarkSequence, max_gap_s: float = 0.4) -> LandmarkSequence:
    """Interpolate a hand across short detection gaps (motion blur), bounded by detections on both sides.

    Full-body videos lose the hands for a few frames during fast movement; a webcam close to the
    signer rarely does. Filling gaps up to ``max_gap_s`` makes both look alike, in training and live.
    """
    n = seq.num_frames
    if n < 3 or not seq.hand_present.any():
        return seq
    ts = np.asarray(seq.timestamps_ms, dtype=np.float64)
    step = float(np.median(np.diff(ts))) if n > 1 else 0.0
    if seq.meta.get("timestamps_are_frame_indices") or step <= 2:
        frame_s = 1.0 / (float(seq.meta.get("fps") or 0) or 25.0)
    else:
        frame_s = step / 1000.0
    max_gap = max(1, round(max_gap_s / frame_s))
    hands, present, score = seq.hands.copy(), seq.hand_present.copy(), seq.hand_score.copy()
    for h in range(2):
        idx = np.flatnonzero(seq.hand_present[:, h])
        for a, b in pairwise(idx):
            if 1 < b - a <= max_gap + 1:
                u = ((np.arange(a + 1, b) - a) / (b - a))[:, None, None]
                hands[a + 1:b, h] = (1 - u) * seq.hands[a, h] + u * seq.hands[b, h]
                present[a + 1:b, h] = True
                score[a + 1:b, h] = min(seq.hand_score[a, h], seq.hand_score[b, h])
    return LandmarkSequence(hands, present, score, seq.pose, seq.pose_present, seq.timestamps_ms, seq.meta)
