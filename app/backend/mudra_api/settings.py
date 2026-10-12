"""Runtime settings, read from environment variables (see .env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _origins() -> list[str]:
    raw = os.getenv("MUDRA_CORS_ORIGINS", "")
    extra = [o.strip() for o in raw.split(",") if o.strip()]
    return [*DEFAULT_ORIGINS, *extra]


def _optional_float(name: str) -> float | None:
    value = os.getenv(name)
    return float(value) if value else None


@dataclass
class Settings:
    model_dir: Path = field(
        default_factory=lambda: Path(os.getenv("MUDRA_MODEL_DIR", BACKEND_DIR / "models" / "isl_mudra_combined_v6_bilstm"))
    )
    device: str = field(default_factory=lambda: os.getenv("MUDRA_DEVICE", "cpu"))
    cors_origins: list[str] = field(default_factory=_origins)
    # Overrides the validation-chosen threshold from the model card when set.
    uncertain_threshold: float | None = field(default_factory=lambda: _optional_float("MUDRA_UNCERTAIN_THRESHOLD"))
    # Below this share of frames with a visible hand, the API reports "no_hands" instead of guessing.
    min_hand_rate: float = field(default_factory=lambda: float(os.getenv("MUDRA_MIN_HAND_RATE", "0.3")))
    # One line per finished live sign (decision summary only), for diagnosing live use
    events_log: Path = field(
        default_factory=lambda: Path(os.getenv("MUDRA_EVENTS_LOG", BACKEND_DIR.parents[1] / "experiments" / "logs" / "stream_events.jsonl"))
    )
    # Training split whose clips are shown as "how to sign it" examples
    reference_split: Path = field(
        default_factory=lambda: Path(os.getenv("MUDRA_REFERENCE_SPLIT", BACKEND_DIR.parents[1] / "data" / "metadata" / "splits" / "combined_words_v3" / "train.csv"))
    )
    # Signs recorded in the app (landmarks only): data/processed/landmarks/app + data/metadata/manifest_app.csv
    recordings_dir: Path = field(
        default_factory=lambda: Path(os.getenv("MUDRA_RECORDINGS_DIR", BACKEND_DIR.parents[1] / "data"))
    )
