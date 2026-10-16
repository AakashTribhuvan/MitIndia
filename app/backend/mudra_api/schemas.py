"""Request / response models for /predict.

Coordinates are exactly what MediaPipe Tasks returns in the browser: x and y normalised
to the image (0-1), z relative depth. Hands are sent as detected; the server assigns
signer-left / signer-right using the pose wrists, the same way the training data was built.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

MIN_FRAMES = 8
MAX_FRAMES = 256


class HandIn(BaseModel):
    landmarks: list[list[float]] = Field(description="21 points of [x, y, z]")
    handedness: str | None = Field(default=None, description="MediaPipe label 'Left' / 'Right' (optional)")
    score: float = 1.0

    @field_validator("landmarks")
    @classmethod
    def _check_points(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) != 21 or any(len(p) != 3 for p in v):
            raise ValueError("a hand needs exactly 21 points of [x, y, z]")
        return v


class FrameIn(BaseModel):
    hands: list[HandIn] = Field(default_factory=list, max_length=2)
    pose: list[list[float]] | None = Field(default=None, description="33 points of [x, y, z, visibility]")

    @field_validator("pose")
    @classmethod
    def _check_pose(cls, v: list[list[float]] | None) -> list[list[float]] | None:
        if v is not None and (len(v) != 33 or any(len(p) not in (3, 4) for p in v)):
            raise ValueError("pose needs exactly 33 points of [x, y, z] or [x, y, z, visibility]")
        return v


class PredictRequest(BaseModel):
    frames: list[FrameIn] = Field(min_length=MIN_FRAMES, max_length=MAX_FRAMES)
    width: int = Field(gt=0, description="video width in pixels")
    height: int = Field(gt=0, description="video height in pixels")
    mirrored: bool = Field(default=False, description="true only if the frames themselves are mirrored")
    top_k: int = Field(default=5, ge=1, le=10)


class LetterRequest(BaseModel):
    """A few recent frames of a held hand shape (fingerspelling); probabilities are averaged over them."""

    frames: list[FrameIn] = Field(min_length=1, max_length=30)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    top_k: int = Field(default=3, ge=1, le=10)


class Candidate(BaseModel):
    sign: str
    label: str
    confidence: float


class PredictResponse(BaseModel):
    status: Literal["ok", "uncertain", "no_hands", "no_sign"]
    sign: str | None
    label: str | None
    confidence: float
    top_k: list[Candidate]
    hand_rate: float
    frames_received: int
    threshold: float
    model: str
    inference_ms: float
