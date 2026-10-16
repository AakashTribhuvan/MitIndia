"""Recognition-provider contract.

Everything downstream (sequence manager, rule engine, questions, profiles, responder workflow) consumes
only `RecognitionEvent`s. A provider turns its own input (a mock scenario step, a model result, a
gesture trigger) into these events, so providers can be swapped without touching any other code.
"""

from __future__ import annotations

import abc
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EventType = Literal["SIGN_DETECTED", "UNKNOWN_SIGN", "GESTURE_DETECTED", "BUTTON_SELECTED"]
EventSource = Literal["MOCK_PROVIDER", "REAL_MODEL", "BUTTONS", "CUSTOM_GESTURE"]

UNKNOWN_BELOW = 0.35  # a sign this uncertain is reported as UNKNOWN_SIGN (kept, never dropped)


class RecognitionEvent(BaseModel):
    """The standardized event contract (JSON field names are the contract)."""

    event_id: str = Field(default_factory=lambda: f"evt-{uuid.uuid4().hex[:12]}")
    event_type: EventType
    session_id: str
    sign: str = Field(min_length=1, max_length=80)
    confidence: float | None = None  # None = not a recognition (button / gesture selection)
    start_time: datetime
    end_time: datetime
    source: EventSource
    gesture_id: str | None = None

    @field_validator("confidence")
    @classmethod
    def _confidence_range(cls, v: float | None) -> float | None:
        if v is not None and not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return v

    @field_validator("sign")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return v.strip().upper().replace(" ", "_")

    @field_validator("end_time")
    @classmethod
    def _ordered(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start is not None and v < start:
            raise ValueError("end_time must not be before start_time")
        return v


def boundaries(duration_s: float = 1.0, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Simulated sign start/end: a sign that just ended after `duration_s`."""
    end = now or datetime.now(timezone.utc)
    return end - timedelta(seconds=duration_s), end


class ISLRecognitionProvider(abc.ABC):
    """A source of recognition events for one emergency session."""

    name: str = "ABSTRACT"
    simulated: bool = True

    @abc.abstractmethod
    async def start_session(self, session_id: str) -> None: ...

    @abc.abstractmethod
    async def stop_session(self, session_id: str) -> None: ...

    @abc.abstractmethod
    async def recognize(self, session_id: str, payload: dict) -> list[RecognitionEvent]:
        """Turn one provider-specific payload into zero or more standardized events."""
