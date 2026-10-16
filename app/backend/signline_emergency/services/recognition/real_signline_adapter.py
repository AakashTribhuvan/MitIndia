"""Adapter for the real SignLine recognition model (not enabled).

The existing model (app/backend, WebSocket /stream) already produces whole-sign results:
    {"event": "sign_ended", "result": {"status", "sign", "confidence", "top_k", ...},
     "stats": {...}, "t0": seconds, "t1": seconds}

`translate_stream_result` maps such a result onto the standardized `RecognitionEvent`. It is real and
unit-tested, but the provider is not switched on: the deployed model (v8, 314 words) does not know most
emergency signs (HELP, CHEST, PAIN, BREATHING, FIRE, SMOKE, ACCIDENT, UNSAFE, FOLLOWING ...; it does
know e.g. INJURY, SICK, DOCTOR, HOSPITAL, POLICE, FEVER). See README "Connecting the real model".

To connect it:
 1. Train / extend the model with the emergency vocabulary (demo_scenarios.json "vocabulary").
 2. In the browser, forward each /stream `sign_ended` message for the active emergency session to
    POST /api/v1/emergency/sessions/{id}/provider-events (payload = the message).
 3. Set SIGNLINE_EM_RECOGNITION_PROVIDER=real. Nothing else changes: the rule engine, questions,
    profiles and responder workflow only see RecognitionEvents.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .base import UNKNOWN_BELOW, ISLRecognitionProvider, RecognitionEvent


def translate_stream_result(session_id: str, message: dict, session_started: datetime | None = None) -> list[RecognitionEvent]:
    """One /stream `sign_ended` message -> 0 or 1 RecognitionEvent (no_sign / duplicate produce none)."""
    if message.get("event") != "sign_ended":
        return []
    result = message.get("result") or {}
    status = result.get("status")
    if status in ("no_sign", "duplicate"):
        return []
    top = (result.get("top_k") or [{}])[0]
    sign = result.get("sign") or top.get("sign")
    conf = float(result.get("confidence") or top.get("confidence") or 0.0)
    if not sign:
        return []
    base = session_started or datetime.now(timezone.utc)
    t0, t1 = float(message.get("t0", 0.0)), float(message.get("t1", 0.0))
    start, end = base + timedelta(seconds=t0), base + timedelta(seconds=max(t0, t1))
    uncertain = status != "ok" or conf < UNKNOWN_BELOW
    return [RecognitionEvent(event_type="UNKNOWN_SIGN" if uncertain and conf < UNKNOWN_BELOW else "SIGN_DETECTED",
                             session_id=session_id, sign=sign, confidence=min(max(conf, 0.0), 1.0),
                             start_time=start, end_time=end, source="REAL_MODEL")]


class RealSignLineRecognitionProvider(ISLRecognitionProvider):
    name = "REAL_MODEL"
    simulated = False

    async def start_session(self, session_id: str) -> None:
        return None

    async def stop_session(self, session_id: str) -> None:
        return None

    async def recognize(self, session_id: str, payload: dict) -> list[RecognitionEvent]:
        return translate_stream_result(session_id, payload)
