"""Deterministic mock recognition: scripted scenarios and manual sign emission.

SIMULATED. It does not look at a camera and recognises nothing; it replays fixed sign sequences with
fixed confidence values so demos and tests are repeatable.
"""

from __future__ import annotations

import json
from functools import lru_cache

from ...config import CONFIG_DIR
from .base import UNKNOWN_BELOW, ISLRecognitionProvider, RecognitionEvent, boundaries


@lru_cache
def scenario_config() -> dict:
    return json.loads((CONFIG_DIR / "demo_scenarios.json").read_text(encoding="utf-8"))


def scenario(scenario_id: str) -> dict | None:
    return next((s for s in scenario_config()["scenarios"] if s["id"] == scenario_id), None)


class MockISLRecognitionProvider(ISLRecognitionProvider):
    name = "MOCK_PROVIDER"
    simulated = True

    async def start_session(self, session_id: str) -> None:  # stateless: playback state lives in the session row
        return None

    async def stop_session(self, session_id: str) -> None:
        return None

    async def recognize(self, session_id: str, payload: dict) -> list[RecognitionEvent]:
        """payload: {"scenario_id", "cursor"} to emit a scenario's next sign, or {"sign", "confidence"}
        to emit one sign manually. Signs outside the vocabulary or below UNKNOWN_BELOW are UNKNOWN_SIGN."""
        if "scenario_id" in payload:
            sc = scenario(payload["scenario_id"])
            if sc is None or "events" not in sc:
                return []
            cursor = int(payload.get("cursor", 0))
            if cursor >= len(sc["events"]):
                return []
            sign, conf = sc["events"][cursor]
        else:
            sign, conf = payload["sign"], float(payload.get("confidence", 0.9))
        sign = str(sign).strip().upper().replace(" ", "_")
        known = sign in scenario_config()["vocabulary"]
        start, end = boundaries(float(payload.get("duration_s", 1.0)))
        return [RecognitionEvent(
            event_type="SIGN_DETECTED" if known and conf >= UNKNOWN_BELOW else "UNKNOWN_SIGN",
            session_id=session_id, sign=sign if known else (sign or "UNKNOWN"), confidence=conf,
            start_time=start, end_time=end, source="MOCK_PROVIDER",
        )]
