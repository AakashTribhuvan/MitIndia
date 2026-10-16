"""State machine, sequence editing, buttons, gestures, location, access control and responders."""

from datetime import datetime, timezone

import pytest

from signline_emergency.services import state_machine as sm
from signline_emergency.services.auth import (
    hash_password,
    issue_token,
    read_token,
    verify_password,
)
from signline_emergency.services.recognition import set_provider
from signline_emergency.services.recognition.base import (
    ISLRecognitionProvider,
    RecognitionEvent,
)
from signline_emergency.services.recognition.real_signline_adapter import (
    translate_stream_result,
)

API = "/api/v1/emergency"


# ------------------------------------------------------------------ state machine
def test_state_machine_rejects_skipping_steps():
    assert not sm.can_transition("COMMUNICATING", "SENT_TO_CONFIGURED_DESTINATION")
    assert not sm.can_transition("READY_TO_SHARE", "ACKNOWLEDGED")
    assert not sm.can_transition("RESOLVED", "COMMUNICATING")
    with pytest.raises(sm.InvalidTransition):
        sm.check("SESSION_CREATED", "RESOLVED")
    assert sm.path_to("SESSION_CREATED", "READY_TO_SHARE") == [
        "COMMUNICATING", "AWAITING_USER_CONFIRMATION", "USER_CONFIRMED", "READY_TO_SHARE"]
    assert set(sm.STATES) == set(sm.TRANSITIONS)


def test_confirm_requires_review_and_locks_report(em):
    s = em("A_MEDICAL")
    s.play()
    s.post("/confirm", expect=409)
    s.post("/review")
    s.post("/confirm")
    assert s.view["status"] == "READY_TO_SHARE" and not s.view["editable"]
    s.post("/mock-sign", {"sign": "FIRE"}, expect=409)
    s.post("/sequence/reset", expect=409)
    hist = [h["to"] for h in s.view["history"]]
    assert hist == ["SESSION_CREATED", "COMMUNICATING", "POSSIBLE_EMERGENCY_DETECTED", "AWAITING_USER_CONFIRMATION",
                    "USER_CONFIRMED", "READY_TO_SHARE"]


def test_cancel_and_no_cancel_after_sharing(em):
    s = em("C_FIRE")
    s.play()
    s.post("/cancel")
    assert s.view["status"] == "CANCELLED"
    t = em("C_FIRE")
    t.play()
    t.confirm_and_share()
    t.post("/cancel", expect=409)


# ------------------------------------------------------------------ sequence
def test_manual_signs_unknown_and_repeats(em):
    s = em()
    s.post("/mock-sign", {"sign": "pain", "confidence": 0.9})
    s.post("/mock-sign", {"sign": "pain", "confidence": 0.9})
    s.post("/mock-sign", {"sign": "BANANA", "confidence": 0.9})
    s.post("/mock-sign", {"sign": "CHEST", "confidence": 0.2})
    seq = s.view["sequence"]
    assert seq[1]["repeated"] is True  # flagged, not removed
    assert [e["event_type"] for e in seq] == ["SIGN_DETECTED", "SIGN_DETECTED", "UNKNOWN_SIGN", "UNKNOWN_SIGN"]
    assert {u["sign"] for u in s.view["context"]["uncertain"]} == {"BANANA", "CHEST"}
    assert s.view["context"]["summary"] == "You reported pain."  # low-confidence CHEST is not used


def test_remove_undo_reset(em):
    s = em("A_MEDICAL")
    s.play()
    breathing = s.view["sequence"][3]["event_id"]
    s.post("/sequence/remove", {"event_id": breathing})
    assert s.view["context"]["summary"] == "You reported chest pain."
    s.post("/sequence/undo")
    assert len(s.view["sequence"]) == 5
    s.post("/sequence/reset")
    assert s.view["sequence"] == [] and s.view["status"] == "COMMUNICATING"
    s.post("/sequence/undo")
    assert len(s.view["sequence"]) == 5
    s.post("/sequence/correct", {"event_id": "evt-missing", "sign": "X"}, expect=409)


def test_user_correction_of_category_wins(em):
    s = em("D_SAFETY")
    s.play()
    s.post("/review")
    s.post("/correction", {"category": "POLICE_SAFETY", "summary": "A man is following me near the bus stop."})
    ctx = s.view["context"]
    assert ctx["category"] == "POLICE_SAFETY" and ctx["user_corrected"]
    s.post("/confirm")
    assert s.view["incident"]["summary"] == "A man is following me near the bus stop."
    s2 = em()
    s2.post("/correction", {"category": "NOT_A_CATEGORY"}, expect=422)


# ------------------------------------------------------------------ buttons, questions
def test_buttons_are_user_reported(em):
    s = em(mode="BUTTONS")
    s.post("/selections", {"need": "MEDICAL", "detail": "CHEST_PAIN"})
    ctx = s.view["context"]
    assert ctx["category"] == "MEDICAL"
    assert ctx["interpretations"][0]["provenance"] == "USER_REPORTED"
    assert all(e["confidence"] is None and e["source"] == "BUTTONS" for e in s.view["sequence"])
    s.post("/selections", {"need": "NOPE"}, expect=422)


def test_question_validation_and_skip(em):
    s = em("F_HELP_ONLY")
    s.play()
    q = s.question("HELP_TYPE")
    s.post(f"/questions/{q['id']}/answer", {"value": "PIZZA"}, expect=409)
    s.post(f"/questions/{q['id']}/skip")
    s.post(f"/questions/{q['id']}/skip", expect=409)
    assert "HELP_TYPE" not in s.pending()  # never asked twice


def test_location_question_disappears_after_sharing_location(em):
    s = em("A_MEDICAL")
    s.play()
    assert "LOCATION" in s.pending()
    s.put("/location", {"source": "BROWSER", "lat": 19.07, "lon": 72.87, "accuracy_m": 25, "permission": "GRANTED"})
    assert "LOCATION" not in s.pending()
    assert s.question("LOCATION")["status"] == "SUPERSEDED"
    assert s.view["location"]["simulated"] is False


def test_location_validation(em):
    s = em()
    s.put("/location", {"source": "BROWSER", "lat": 19.0, "lon": 72.0}, expect=422)  # no permission
    s.put("/location", {"source": "BROWSER", "lat": 200, "lon": 72.0, "permission": "GRANTED"}, expect=422)
    s.put("/location", {"source": "MANUAL", "text": "  "}, expect=422)
    s.put("/location", {"source": "SIMULATED"})
    assert s.view["location"]["simulated"] is True and s.view["location"]["lat"] is None


# ------------------------------------------------------------------ gestures
def test_gesture_crud_trigger_and_cooldown(client, device, em):
    g = client.post(f"{API}/gestures", headers=device, json={
        "name": "Fire fist", "intent": "REQUEST_FIRE_ASSISTANCE", "message": "There is a fire.", "cooldown_s": 60}).json()
    assert g["category"] == "FIRE"
    assert client.post(f"{API}/gestures", headers=device, json={"name": "x", "intent": "BAD", "message": "m"}).status_code == 422
    test = client.post(f"{API}/gestures/{g['id']}/test", headers=device).json()
    assert test["sent"] is False and test["would_report"]["category"] == "FIRE"
    s = em()
    s.post(f"/gestures/{g['id']}/trigger")
    assert s.view["context"]["summary"] == "There is a fire."
    s.post(f"/gestures/{g['id']}/trigger", expect=429)  # cooldown
    client.patch(f"{API}/gestures/{g['id']}", headers=device, json={"enabled": False})
    other = {"X-Device-Key": "another-device-key-123456"}
    assert client.get(f"{API}/gestures", headers=other).json() == []
    assert client.delete(f"{API}/gestures/{g['id']}", headers=other).status_code == 404
    assert client.delete(f"{API}/gestures/{g['id']}", headers=device).status_code == 200


def test_preferences_flow_into_incident(client, device, em):
    client.put(f"{API}/preferences", headers=device, json={"communication_needs": ["Prefers text communication"]})
    s = em("C_FIRE")
    s.play()
    s.confirm_and_share()
    assert s.view["incident"]["communication_needs"] == ["Prefers text communication"]


# ------------------------------------------------------------------ access control
def test_session_needs_its_token(client, device, em):
    s = em()
    assert client.get(f"{API}/sessions/{s.id}").status_code == 404
    assert client.get(f"{API}/sessions/{s.id}", headers={"X-Session-Token": "wrong"}).status_code == 404
    assert client.get(f"{API}/sessions/{s.id}", headers=s.h).status_code == 200
    assert client.post(f"{API}/sessions", json={}).status_code == 401  # no device key
    assert client.post(f"{API}/sessions", json={}, headers={"X-Device-Key": "short"}).status_code == 401
    assert client.post(f"{API}/sessions", json={"scenario_id": "Z"}, headers=device).status_code == 422


def test_responder_auth_and_visibility(client, em, responder_headers):
    assert client.get(f"{API}/responder/incidents").status_code == 401
    assert client.get(f"{API}/responder/incidents", headers={"Authorization": "Bearer forged.token"}).status_code == 401
    bad = client.post(f"{API}/responder/login", json={"username": "demo.responder", "password": "nope"})
    assert bad.status_code == 401
    prepared = em("A_MEDICAL")
    prepared.play()
    prepared.post("/review")
    prepared.post("/confirm")  # prepared but not shared: not visible to responders
    shared = em("C_FIRE")
    shared.play()
    shared.confirm_and_share()
    rows = client.get(f"{API}/responder/incidents", headers=responder_headers).json()
    assert [r["category"] for r in rows] == ["FIRE"]
    inc_id = rows[0]["id"]
    assert client.get(f"{API}/responder/incidents/{prepared.view['incident']['id']}", headers=responder_headers).status_code == 404
    assert client.post(f"{API}/responder/incidents/{inc_id}/resolve", headers=responder_headers).status_code == 409
    ack = client.post(f"{API}/responder/incidents/{inc_id}/acknowledge", headers=responder_headers).json()
    assert ack["status"] == "ACKNOWLEDGED"
    note = client.post(f"{API}/responder/incidents/{inc_id}/notes", headers=responder_headers, json={"text": "On our way (demo)."}).json()
    assert note["notes"][0]["text"] == "On our way (demo)."
    client.post(f"{API}/responder/incidents/{inc_id}/resolve", headers=responder_headers)
    view = client.get(f"{API}/sessions/{shared.id}", headers=shared.h).json()
    assert view["status"] == "RESOLVED"  # the user sees the responder's status
    assert "notes" not in view["incident"]  # responder notes stay with responders
    stats = client.get(f"{API}/responder/analytics", headers=responder_headers).json()
    assert stats["events"]["SESSION_STARTED"] == 2


def test_tokens_and_passwords():
    stored = hash_password("s3cret")
    assert stored.startswith("scrypt$") and "s3cret" not in stored
    assert verify_password("s3cret", stored) and not verify_password("other", stored)
    token = issue_token("usr-1")
    assert read_token(token) == "usr-1"
    body, sig = token.split(".")
    assert read_token(f"{body}.{sig[:-2]}xx") is None


def test_login_rate_limited(client):
    codes = [client.post(f"{API}/responder/login", json={"username": "x", "password": "y"}).status_code for _ in range(12)]
    assert codes[:10] == [401] * 10 and codes[-1] == 429


def test_analytics_never_store_content(client, em):
    s = em("A_MEDICAL")
    s.play()
    s.put("/location", {"source": "MANUAL", "text": "Flat 4, Example Street"})
    from signline_emergency.db import session_factory
    from signline_emergency.models import AnalyticsEvent

    with session_factory()() as db:
        blob = repr([(a.event_type, a.meta) for a in db.query(AnalyticsEvent).all()])
    for secret in ("CHEST", "PAIN", "Example Street", "chest pain"):
        assert secret not in blob


# ------------------------------------------------------------------ providers
class FixedProvider(ISLRecognitionProvider):
    name, simulated = "TEST", True

    async def start_session(self, session_id):
        return None

    async def stop_session(self, session_id):
        return None

    async def recognize(self, session_id, payload):
        now = datetime.now(timezone.utc)
        return [RecognitionEvent(event_type="SIGN_DETECTED", session_id=session_id, sign=s, confidence=0.8,
                                 start_time=now, end_time=now, source="REAL_MODEL") for s in ("FIRE", "SMOKE")]


def test_provider_swap_needs_no_other_change(em):
    set_provider(FixedProvider())
    try:
        s = em()
        s.post("/provider-events", {"anything": True})
        assert s.view["context"]["category"] == "FIRE"
    finally:
        set_provider(None)


def test_real_adapter_translation():
    started = datetime(2026, 10, 16, tzinfo=timezone.utc)
    msg = {"event": "sign_ended", "t0": 1.0, "t1": 2.5,
           "result": {"status": "ok", "sign": "doctor", "confidence": 0.81, "top_k": []}}
    [e] = translate_stream_result("ses-1", msg, started)
    assert e.sign == "DOCTOR" and e.source == "REAL_MODEL" and e.event_type == "SIGN_DETECTED"
    assert (e.end_time - e.start_time).total_seconds() == 1.5
    assert translate_stream_result("ses-1", {"event": "sign_ended", "result": {"status": "no_sign"}}) == []
    low = translate_stream_result("ses-1", {"event": "sign_ended", "result": {"status": "uncertain", "sign": "X", "confidence": 0.2}})
    assert low[0].event_type == "UNKNOWN_SIGN"
