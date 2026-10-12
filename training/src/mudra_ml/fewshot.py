"""Few-shot custom words: recognise a new sign from 1-5 recorded examples, without retraining.

Each example is passed through the trained model up to its pooled sequence representation
(``SequenceClassifier.encode``). A custom word's prototype is the mean of its examples'
normalised embeddings. A new sign matches a custom word when its cosine similarity to that
prototype is high enough AND the trained model itself is not confident about a known word;
both limits are chosen on validation data by ``training/scripts/eval_fewshot.py``.

When a custom word gets enough recordings it should be added to the training data and the
model retrained; prototypes are the bridge until then.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np


@dataclass
class FewShotConfig:
    min_similarity: float = 0.8  # cosine similarity to a prototype needed to accept a custom word
    max_model_confidence: float = 0.8  # the custom word wins only if the model's best known word is below this
    margin: float = 0.05  # best custom prototype must beat the second best by this much

    @classmethod
    def load(cls, path: Path | None) -> FewShotConfig:
        if path and Path(path).exists():
            return cls(**json.loads(Path(path).read_text(encoding="utf-8")))
        return cls()

    def to_dict(self) -> dict:
        return asdict(self)


def normalise(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-8)


class CustomWordBank:
    """Prototypes of custom words, built from embeddings of their recorded examples."""

    def __init__(self, cfg: FewShotConfig | None = None):
        self.cfg = cfg or FewShotConfig()
        self.labels: list[str] = []
        self.protos = np.zeros((0, 0), np.float32)
        self.counts: list[int] = []

    def __len__(self) -> int:
        return len(self.labels)

    def set_examples(self, examples: dict[str, np.ndarray]) -> None:
        """examples: label -> [n, D] embeddings (any n >= 1)."""
        items = [(k, v) for k, v in sorted(examples.items()) if len(v)]
        self.labels = [k for k, _ in items]
        self.counts = [len(v) for _, v in items]
        self.protos = (
            normalise(np.stack([normalise(np.asarray(v, np.float32)).mean(axis=0) for _, v in items]))
            if items else np.zeros((0, 0), np.float32)
        )

    def match(self, emb: np.ndarray) -> tuple[str | None, float, float]:
        """(best label, its similarity, runner-up similarity) for one embedding."""
        if not self.labels:
            return None, 0.0, 0.0
        sims = self.protos @ normalise(np.asarray(emb, np.float32))
        order = np.argsort(-sims)
        second = float(sims[order[1]]) if len(order) > 1 else -1.0
        return self.labels[int(order[0])], float(sims[order[0]]), second

    def decide(self, emb: np.ndarray, model_result: dict) -> dict | None:
        """A custom-word result that overrides ``model_result``, or None to keep the model's answer."""
        label, sim, second = self.match(emb)
        if label is None or sim < self.cfg.min_similarity or sim - second < self.cfg.margin:
            return None
        known = model_result["top_k"][0]["confidence"] if model_result.get("top_k") else 0.0
        if model_result.get("status") == "ok" and known >= self.cfg.max_model_confidence:
            return None
        top = [{"sign": label, "confidence": sim, "custom": True}] + list(model_result.get("top_k", []))[:2]
        return {"status": "ok", "sign": label, "confidence": sim, "custom": True, "top_k": top}
