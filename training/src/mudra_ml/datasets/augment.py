"""Training-time augmentation applied to raw landmarks before normalisation.

Only physically plausible changes: small camera roll/zoom/shear, landmark jitter,
temporal cropping (speed / start-end variation) and occasional missed hand
detections. Horizontal flipping (``mirror_prob``) is off by default because handedness can
carry meaning; enable it when signers in the data use different dominant hands.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class AugmentConfig:
    rotation_deg: float = 10.0
    scale: float = 0.10
    shear: float = 0.10
    shift: float = 0.05
    jitter: float = 0.003
    hand_dropout: float = 0.05  # per-frame probability of dropping a detected hand
    temporal_crop_min: float = 0.8  # keep at least this fraction of the clip
    mirror_prob: float = 0.0  # flip clip and swap hands: teaches both dominant hands (off by default)
    # Segment-style crop: with this probability the clip is cut the way the live segmenter cuts a sign
    # (active span + its padding, jittered), so training samples look like what the app classifies.
    segment_crop_prob: float = 0.0
    segment_config: str = "training/configs/streaming.json"  # segmenter settings used for the crop
    segment_jitter_s: float = 0.15
    closeup_prob: float = 0.0  # view the clip through a simulated close-up webcam (datasets/camera.py)

    @classmethod
    def from_dict(cls, values: dict | None) -> AugmentConfig:
        return cls(**(values or {}))


def affine_jitter(
    hands: np.ndarray,
    hand_present: np.ndarray,
    pose: np.ndarray,
    width: int,
    height: int,
    cfg: AugmentConfig,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Apply one random 2D affine transform to the whole clip, plus per-point jitter.

    Works in aspect-corrected space so rotations do not distort the body on wide frames.
    Returns new (hands, hand_present, pose) arrays; inputs are not modified.
    """
    aspect = width / height if width > 0 and height > 0 else 1.0
    angle = np.deg2rad(rng.uniform(-cfg.rotation_deg, cfg.rotation_deg))
    scale = rng.uniform(1 - cfg.scale, 1 + cfg.scale)
    shear = rng.uniform(-cfg.shear, cfg.shear)
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    matrix = scale * rot @ np.array([[1.0, shear], [0.0, 1.0]])
    shift = rng.uniform(-cfg.shift, cfg.shift, size=2)
    center = np.array([aspect * 0.5, 0.5])

    def transform(points: np.ndarray) -> np.ndarray:
        out = points.copy()
        xy = out[..., :2].astype(np.float64)
        xy[..., 0] *= aspect
        xy = (xy - center) @ matrix.T + center + shift
        if cfg.jitter > 0:
            xy += rng.normal(0.0, cfg.jitter, size=xy.shape)
        xy[..., 0] /= aspect
        out[..., :2] = xy
        return out

    new_hands = transform(hands)
    new_pose = transform(pose)
    new_present = hand_present.copy()
    if cfg.hand_dropout > 0:
        new_present &= rng.random(hand_present.shape) >= cfg.hand_dropout
    return new_hands.astype(np.float32), new_present, new_pose.astype(np.float32)


def temporal_window(num_frames: int, cfg: AugmentConfig, rng: np.random.Generator) -> tuple[int, int]:
    """Random contiguous window [start, start + length) covering most of the clip."""
    length = max(1, round(num_frames * rng.uniform(cfg.temporal_crop_min, 1.0)))
    start = int(rng.integers(0, num_frames - length + 1))
    return start, length
