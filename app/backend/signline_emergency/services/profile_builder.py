"""Builds the incident profile from a confirmed session. Every fact carries its provenance.

USER_REPORTED  - signed, selected, typed or answered by the user (signs keep their recognition confidence)
AI_INFERRED    - the system's interpretation (rule id, uncertain recognitions)
USER_CONFIRMED - what the user explicitly confirmed on the review screen (category, summary)
SYSTEM_GENERATED - ids, times, workflow facts
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    EmergencyIncident,
    EmergencySession,
    IncidentFact,
    Question,
    QuestionAnswer,
    UserPreference,
)
from .context_engine import category_label

# Priority is set only by these explicit answer rules; otherwise it stays "not assessed" (None)
HIGH_PRIORITY_ANSWERS = {("IMMEDIATE_DANGER", "YES"), ("ANYONE_UNCONSCIOUS", "YES"), ("PEOPLE_TRAPPED", "YES")}


def _answered(db: Session, session_id: str) -> list[tuple[Question, QuestionAnswer]]:
    return list(db.execute(select(Question, QuestionAnswer).join(QuestionAnswer, QuestionAnswer.question_id == Question.id)
                           .where(Question.session_id == session_id).order_by(QuestionAnswer.id)).all())


def _label(question: Question, value: object) -> str:
    labels = {o["value"]: o["label"] for o in question.options}
    if isinstance(value, list):
        return ", ".join(labels.get(v, str(v)) for v in value)
    return labels.get(value, str(value))


def build_incident(db: Session, session: EmergencySession, sequence: list[dict], context: dict,
                   category: str, summary: str, gesture_messages: dict[str, str] | None = None) -> EmergencyIncident:
    prefs = db.scalar(select(UserPreference).where(UserPreference.device_key == session.device_key))
    answered = _answered(db, session.id)
    priority = "HIGH" if any((q.key, a.value) in HIGH_PRIORITY_ANSWERS for q, a in answered) else None
    incident = EmergencyIncident(session=session, category=category, summary=summary, user_confirmed=True,
                                 status=session.status, communication_needs=list(prefs.communication_needs) if prefs else [],
                                 location=session.location, priority=priority, demo=session.demo)
    db.add(incident)
    db.flush()

    def fact(kind: str, key: str, value: str, provenance: str) -> None:
        db.add(IncidentFact(incident_id=incident.id, kind=kind, key=key, value=value, provenance=provenance))

    fact("CATEGORY", "category", category_label(category), "USER_CONFIRMED")
    fact("SUMMARY", "summary", summary, "USER_CONFIRMED")
    for i, e in enumerate(sequence, 1):
        if e["event_type"] == "BUTTON_SELECTED":
            fact("SELECTION", f"selection_{i}", e["sign"], "USER_REPORTED")
        elif e["event_type"] == "GESTURE_DETECTED":
            fact("SELECTION", f"gesture_{i}", e["sign"], "USER_REPORTED")
        else:
            conf = "" if e["confidence"] is None else f" (recognition confidence {e['confidence']:.2f})"
            note = f", corrected by the user from {e['original_sign']}" if e.get("corrected") else ""
            fact("SIGN", f"sign_{i}", f"{e['sign']}{conf}{note}", "USER_REPORTED")
    for item in context.get("uncertain", []):
        fact("UNCERTAINTY", item["event_id"], f"{item['sign']}: {item['reason'].lower()}", "AI_INFERRED")
    for interp in context.get("matched_rules", context.get("interpretations", [])):
        fact("INTERPRETATION", interp["rule_id"], f"{category_label(interp['category'])}: {interp['explanation']}",
             interp["provenance"])
    for q, a in answered:
        fact("ANSWER", q.key, f"{q.text} {_label(q, a.value)}", "USER_REPORTED")
    for intent, message in (gesture_messages or {}).items():
        fact("MESSAGE", intent.lower(), message, "USER_REPORTED")
    if session.location:
        loc = session.location
        where = loc.get("text") or f"{loc.get('lat')}, {loc.get('lon')} (±{loc.get('accuracy_m')} m)"
        fact("LOCATION", loc.get("source", "UNKNOWN").lower(), where,
             "SYSTEM_GENERATED" if loc.get("simulated") else "USER_REPORTED")
    for need in incident.communication_needs:
        fact("NEED", "communication_need", need, "USER_REPORTED")
    fact("SYSTEM", "session_id", session.id, "SYSTEM_GENERATED")
    if priority:
        fact("SYSTEM", "priority", "High (from the user's answers)", "SYSTEM_GENERATED")
    db.flush()
    return incident
