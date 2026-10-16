"""Fingerspelling letters A-Z from one frame of hand landmarks (shared by training and the API).

Letters are static hand shapes, so a letter is classified from single frames, not from a clip.
Features (FEATURE_DIM = 131), computed in pixel-proportional coordinates (x * width, y * height):

- each hand: 21 points relative to its wrist, divided by its palm size (wrist -> middle-finger base), 63 values;
- hands are ordered left to right in the image, so the features do not depend on MediaPipe's
  left/right labels (unreliable on mirrored and close-up images); a single hand goes in the first slot;
- the second wrist relative to the first, divided by the mean palm size (3), and two presence flags.

The classifier is a small MLP whose weights are stored as .npz, so the API needs only numpy.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

LETTERS = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
FEATURE_DIM = 131
FEATURE_VERSION = "letters-1"
WRIST, MIDDLE_MCP = 0, 9


def _palm(points: np.ndarray) -> float:
    return float(np.linalg.norm(points[MIDDLE_MCP, :2] - points[WRIST, :2])) or 1e-6


def order_hands(hands: list[np.ndarray]) -> list[np.ndarray]:
    """Left-to-right by wrist x (at most two hands)."""
    return sorted(hands[:2], key=lambda h: float(h[WRIST, 0]))


def letter_features(hands: list[np.ndarray], width: float = 1.0, height: float = 1.0) -> np.ndarray:
    """hands: 0-2 arrays [21, 3] in normalized image coordinates -> feature vector [FEATURE_DIM]."""
    scale = np.array([width, height, width], np.float32)
    pts = order_hands([np.asarray(h, np.float32)[:, :3] * scale for h in hands])
    out = np.zeros(FEATURE_DIM, np.float32)
    palms = [_palm(p) for p in pts]
    for i, (p, palm) in enumerate(zip(pts, palms)):
        out[i * 63:(i + 1) * 63] = ((p - p[WRIST]) / palm).reshape(-1)
    if len(pts) == 2:
        out[126:129] = (pts[1][WRIST] - pts[0][WRIST]) / (sum(palms) / 2)
    out[129] = len(pts) >= 1
    out[130] = len(pts) >= 2
    return out


def mirror(hands: list[np.ndarray]) -> list[np.ndarray]:
    """The same hand shape signed with the other hand dominant (x flipped in normalized coordinates)."""
    flipped = []
    for h in hands:
        f = np.array(h, np.float32, copy=True)
        f[:, 0] = 1.0 - f[:, 0]
        flipped.append(f)
    return flipped


class LetterModel:
    """numpy forward pass of the exported MLP (Linear -> ReLU blocks, then Linear)."""

    def __init__(self, model_dir: Path):
        model_dir = Path(model_dir)
        self.card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
        if self.card.get("feature_version") != FEATURE_VERSION:
            raise ValueError(f"letter model features {self.card.get('feature_version')} != {FEATURE_VERSION}")
        w = np.load(model_dir / "weights.npz")
        n = len([k for k in w.files if k.startswith("W")])
        self.layers = [(w[f"W{i}"], w[f"b{i}"]) for i in range(n)]
        self.mean, self.std = w["mean"], w["std"]
        self.classes: list[str] = self.card["classes"]
        self.threshold = float(self.card.get("threshold", 0.6))
        self.temperature = float(self.card.get("temperature", 1.0))

    def probabilities(self, feats: np.ndarray) -> np.ndarray:
        x = (np.atleast_2d(feats) - self.mean) / self.std
        for i, (W, b) in enumerate(self.layers):
            x = x @ W.T + b
            if i < len(self.layers) - 1:
                x = np.maximum(x, 0.0)
        x = x / self.temperature
        x = x - x.max(axis=1, keepdims=True)
        e = np.exp(x)
        return e / e.sum(axis=1, keepdims=True)

    def predict_frames(self, frames: list[list[np.ndarray]], width: float, height: float, top_k: int = 3) -> dict:
        """Average the probabilities over the given frames (each a list of 0-2 hands)."""
        usable = [f for f in frames if f]
        if not usable:
            return {"status": "no_hands", "letter": None, "confidence": 0.0, "top_k": []}
        probs = self.probabilities(np.stack([letter_features(f, width, height) for f in usable])).mean(axis=0)
        order = np.argsort(-probs)[:top_k]
        best = float(probs[order[0]])
        return {
            "status": "ok" if best >= self.threshold else "uncertain",
            "letter": self.classes[order[0]] if best >= self.threshold else None,
            "confidence": round(best, 4),
            "top_k": [{"letter": self.classes[i], "confidence": round(float(probs[i]), 4)} for i in order],
            "frames_used": len(usable),
        }
