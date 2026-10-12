"""Sequence classifiers built from: per-frame encoder -> temporal model -> classifier.

    temporal = "none"         Landmark MLP + mean pooling (ablation B, no temporal modelling)
    temporal = "bilstm"       Landmark MLP + BiLSTM (ablation C; spec's main architecture)
    temporal = "transformer"  Landmark MLP + Transformer encoder (comparison)

Logits are returned (no softmax) for use with CrossEntropyLoss.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import torch
from torch import nn

from mudra_ml.models.landmark_mlp import LandmarkMLP


@dataclass
class ModelConfig:
    input_dim: int
    num_classes: int
    temporal: str = "bilstm"
    mlp_hidden: int = 256
    mlp_out: int = 128
    lstm_hidden: int = 256
    lstm_layers: int = 2
    tf_dim: int = 192
    tf_layers: int = 4
    tf_heads: int = 4
    tf_ff: int = 384
    max_len: int = 128
    dropout: float = 0.3

    @classmethod
    def from_dict(cls, values: dict) -> ModelConfig:
        values = dict(values)
        values.pop("appearance_dim", None)  # older model cards; the RGB branch was never used
        return cls(**values)

    def to_dict(self) -> dict:
        return asdict(self)


class AttentionPool(nn.Module):
    """Learned weighted average over time (handles signs whose key moment is not the last frame)."""

    def __init__(self, dim: int):
        super().__init__()
        self.score = nn.Linear(dim, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        weights = torch.softmax(self.score(x).squeeze(-1), dim=1)
        return torch.einsum("bt,btd->bd", weights, x)


class SequenceClassifier(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.frame_encoder = LandmarkMLP(cfg.input_dim, cfg.mlp_hidden, cfg.mlp_out, dropout=cfg.dropout / 2)
        fused_dim = cfg.mlp_out

        if cfg.temporal == "none":
            self.temporal = None
            out_dim = fused_dim
        elif cfg.temporal == "bilstm":
            self.temporal = nn.LSTM(
                fused_dim,
                cfg.lstm_hidden,
                num_layers=cfg.lstm_layers,
                batch_first=True,
                bidirectional=True,
                dropout=cfg.dropout if cfg.lstm_layers > 1 else 0.0,
            )
            out_dim = cfg.lstm_hidden * 2
        elif cfg.temporal == "transformer":
            self.proj = nn.Linear(fused_dim, cfg.tf_dim)
            self.pos = nn.Parameter(torch.zeros(1, cfg.max_len, cfg.tf_dim))
            nn.init.trunc_normal_(self.pos, std=0.02)
            layer = nn.TransformerEncoderLayer(
                cfg.tf_dim, cfg.tf_heads, cfg.tf_ff, dropout=cfg.dropout, batch_first=True, norm_first=True
            )
            self.temporal = nn.TransformerEncoder(layer, cfg.tf_layers, enable_nested_tensor=False)
            out_dim = cfg.tf_dim
        else:
            raise ValueError(f"Unknown temporal model {cfg.temporal!r}")

        self.pool = AttentionPool(out_dim) if self.temporal is not None else None
        self.head = nn.Sequential(nn.LayerNorm(out_dim), nn.Dropout(cfg.dropout), nn.Linear(out_dim, cfg.num_classes))

    def encode(self, landmarks: torch.Tensor) -> torch.Tensor:
        """[B, T, D] -> pooled sequence representation [B, out_dim]."""
        x = self.frame_encoder(landmarks)

        if self.cfg.temporal == "none":
            return x.mean(dim=1)
        if self.cfg.temporal == "bilstm":
            x, _ = self.temporal(x)
        else:
            x = self.proj(x) + self.pos[:, : x.shape[1]]
            x = self.temporal(x)
        return self.pool(x)

    def forward(self, landmarks: torch.Tensor) -> torch.Tensor:
        return self.head(self.encode(landmarks))


def build_model(cfg: ModelConfig) -> SequenceClassifier:
    return SequenceClassifier(cfg)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
