"""QuestionManager: only questions that change the report or the next action.

A question is offered when the current interpretation suggests it, its condition holds (e.g. no location
yet) and it was never asked before in this session. At most `max_pending` are pending at once; questions
that no longer apply after a change are SUPERSEDED. Every question can be skipped.
"""

from __future__ import annotations

import json
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import CONFIG_DIR
from ..models import EmergencySession, Question, QuestionAnswer
from .audit import track


@lru_cache
def question_config() -> dict:
    return json.loads((CONFIG_DIR / "emergency_questions.json").read_text(encoding="utf-8"))


class AnswerError(ValueError):
    pass


def answers_of(db: Session, session_id: str) -> dict[str, object]:
    rows = db.execute(select(Question.key, QuestionAnswer.value).join(QuestionAnswer, QuestionAnswer.question_id == Question.id)
                      .where(Question.session_id == session_id).order_by(QuestionAnswer.id)).all()
    return {k: v for k, v in rows}


def _applies(spec: dict, session: EmergencySession, answers: dict, signals: set[str]) -> bool:
    for cond in spec.get("only_if", []):
        if cond == "no_location" and session.location:
            return False
        if cond.startswith("answer:"):
            key, value = cond[len("answer:"):].split("=", 1)
            if answers.get(key) != value:
                return False
        if cond.startswith("missing_signal:") and cond.split(":", 1)[1] in signals:
            return False
    return True


def refresh(db: Session, session: EmergencySession, context: dict) -> list[Question]:
    cfg = question_config()
    specs = cfg["questions"]
    existing = list(db.scalars(select(Question).where(Question.session_id == session.id)))
    asked = {q.key for q in existing}
    answers = answers_of(db, session.id)
    signals = set(context.get("signals", []))
    wanted = [k for k in context.get("questions", []) if k in specs and _applies(specs[k], session, answers, signals)]
    if session.user_category:  # the user chose the category: do not ask what kind of help again
        wanted = [k for k in wanted if k != "HELP_TYPE"]

    for q in existing:
        if q.status == "PENDING" and q.key not in wanted:
            q.status = "SUPERSEDED"
    pending = [q for q in existing if q.status == "PENDING"]
    for key in sorted(wanted, key=lambda k: -specs[k]["priority"]):
        if len(pending) >= cfg["max_pending"]:
            break
        if key in asked:
            continue
        spec = specs[key]
        q = Question(session_id=session.id, key=key, text=spec["text"], answer_type=spec["answer_type"],
                     options=[{"value": v, "label": label} for v, label in spec["options"]],
                     priority=spec["priority"], reason=spec["reason"])
        db.add(q)
        pending.append(q)
        track(db, "QUESTION_CREATED", session.id, answer_type=spec["answer_type"])
    db.flush()
    return sorted(pending, key=lambda q: -q.priority)


def answer(db: Session, question: Question, value: object) -> QuestionAnswer:
    if question.status != "PENDING":
        raise AnswerError(f"question is {question.status.lower()}")
    allowed = [o["value"] for o in question.options]
    kind = question.answer_type
    if kind == "MULTIPLE_CHOICE":
        ok, rule = isinstance(value, list) and bool(value) and all(v in allowed for v in value), f"a list drawn from {allowed}"
    elif kind == "SHORT_TEXT":
        ok, rule = isinstance(value, str) and bool(value.strip()) and len(value) <= 500, "a short text (1-500 characters)"
    else:  # YES_NO, YES_NO_NOT_SURE, SINGLE_CHOICE, CONFIRM_OR_CORRECT
        ok, rule = value in allowed, f"one of {allowed}"
    if not ok:
        raise AnswerError(f"answer must be {rule}")
    row = QuestionAnswer(question_id=question.id, session_id=question.session_id, value=value, provenance="USER_REPORTED")
    question.status = "ANSWERED"
    db.add(row)
    track(db, "QUESTION_ANSWERED", question.session_id, answer_type=question.answer_type)
    return row


def skip(db: Session, question: Question) -> None:
    if question.status != "PENDING":
        raise AnswerError(f"question is {question.status.lower()}")
    question.status = "SKIPPED"
    track(db, "QUESTION_SKIPPED", question.session_id)
