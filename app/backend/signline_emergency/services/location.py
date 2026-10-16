"""Location: shared only after the user chooses to share it.

Sources:
- BROWSER: coordinates from the browser Geolocation API after the user granted permission
  (the browser itself asks; this app never reads location silently).
- MANUAL: a place the user typed.
- SIMULATED: demo mode only; a clearly labelled placeholder with no coordinates (never a made-up real place).

Precise coordinates are kept only on the session / incident they were shared for, never in analytics or logs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator

SIMULATED_TEXT = "Simulated demo location (not a real place)"


class LocationIn(BaseModel):
    source: Literal["BROWSER", "MANUAL", "SIMULATED"]
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)
    text: str | None = Field(default=None, max_length=300)
    permission: Literal["GRANTED", "NOT_REQUIRED"] = "NOT_REQUIRED"

    @model_validator(mode="after")
    def _complete(self):
        if self.source == "BROWSER" and (self.lat is None or self.lon is None or self.permission != "GRANTED"):
            raise ValueError("browser location needs lat, lon and permission GRANTED")
        if self.source == "MANUAL" and not (self.text or "").strip():
            raise ValueError("manual location needs a text")
        return self


def to_record(loc: LocationIn, demo_mode: bool) -> dict:
    if loc.source == "SIMULATED":
        if not demo_mode:
            raise ValueError("simulated location is only available in demo mode")
        return {"source": "SIMULATED", "text": SIMULATED_TEXT, "lat": None, "lon": None, "accuracy_m": None,
                "simulated": True, "shared_at": datetime.now(timezone.utc).isoformat()}
    return {"source": loc.source, "lat": loc.lat, "lon": loc.lon,
            "accuracy_m": None if loc.accuracy_m is None else round(loc.accuracy_m),
            "text": (loc.text or "").strip() or None, "permission": loc.permission, "simulated": False,
            "shared_at": datetime.now(timezone.utc).isoformat()}
