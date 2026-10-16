"""SignSequenceManager: raw sequence (sign_events, never edited) + normalized sequence with revisions.

Every change to the normalized sequence is a SequenceRevision holding the full sequence after it, so the
history can be audited and undone. Repetitions are kept and flagged, never silently removed.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import EmergencySession, SequenceRevision, SignEvent
from .recognition.base import RecognitionEvent

MAX_EVENTS_PER_SESSION = 500


class SequenceError(ValueError):
    pass


def _entry(e: SignEvent) -> dict:
    return {"event_id": e.id, "sign": e.sign, "confidence": e.confidence, "event_type": e.event_type,
            "source": e.source, "gesture_id": e.gesture_id}


class SignSequenceManager:
    def __init__(self, db: Session, session: EmergencySession):
        self.db, self.session = db, session

    # ---------------------------------------------------------------- reading
    def raw(self) -> list[SignEvent]:
        return list(self.db.scalars(select(SignEvent).where(SignEvent.session_id == self.session.id)
                                    .order_by(SignEvent.seq_index)))

    def revisions(self) -> list[SequenceRevision]:
        return list(self.db.scalars(select(SequenceRevision).where(SequenceRevision.session_id == self.session.id)
                                    .order_by(SequenceRevision.revision)))

    def _last(self) -> SequenceRevision | None:
        return self.db.scalars(select(SequenceRevision).where(SequenceRevision.session_id == self.session.id)
                               .order_by(SequenceRevision.revision.desc()).limit(1)).first()

    def normalized(self) -> list[dict]:
        last = self._last()
        seq = [dict(e) for e in (last.normalized if last else [])]
        for i, e in enumerate(seq):  # flag (do not remove) immediate repetitions
            e["repeated"] = i > 0 and seq[i - 1]["sign"] == e["sign"]
        return seq

    # ---------------------------------------------------------------- writing
    def _revise(self, action: str, normalized: list[dict], actor: str, event_id: str | None = None, **detail) -> SequenceRevision:
        last = self._last()
        number = (last.revision + 1) if last else 1
        current = self._effective(last) if last else 0
        if action != "UNDO":
            detail["parent"] = current
        clean = [{k: v for k, v in e.items() if k != "repeated"} for e in normalized]
        rev = SequenceRevision(session_id=self.session.id, revision=number, action=action, event_id=event_id,
                               detail=detail, normalized=clean, actor=actor)
        self.db.add(rev)
        self.db.flush()
        return rev

    @staticmethod
    def _effective(rev: SequenceRevision) -> int:
        return rev.detail.get("effective", rev.revision) if rev.action == "UNDO" else rev.revision

    def add(self, event: RecognitionEvent) -> SignEvent:
        if event.session_id != self.session.id:
            raise SequenceError("event belongs to another session")
        if self.db.get(SignEvent, event.event_id) is not None:
            raise SequenceError("duplicate event_id")
        count = self.db.scalar(select(func.count()).select_from(SignEvent).where(SignEvent.session_id == self.session.id))
        if count >= MAX_EVENTS_PER_SESSION:
            raise SequenceError("too many events in this session")
        raw = self.raw()
        if raw and event.end_time < raw[-1].start_time:
            raise SequenceError("event is older than the previous sign (out of order)")
        row = SignEvent(id=event.event_id, session_id=self.session.id, seq_index=len(raw), event_type=event.event_type,
                        sign=event.sign, confidence=event.confidence, start_time=event.start_time,
                        end_time=event.end_time, source=event.source, gesture_id=event.gesture_id)
        self.db.add(row)
        self.db.flush()
        self._revise("ADD", [*self.normalized(), _entry(row)], "SYSTEM", row.id)
        return row

    def correct(self, event_id: str, new_sign: str) -> SequenceRevision:
        seq = self.normalized()
        target = next((e for e in seq if e["event_id"] == event_id), None)
        if target is None:
            raise SequenceError("sign not in the current sequence")
        new_sign = new_sign.strip().upper().replace(" ", "_")
        if not new_sign:
            raise SequenceError("empty sign")
        old = target["sign"]
        target["original_sign"] = target.get("original_sign", old)
        target["sign"], target["corrected"], target["event_type"] = new_sign, True, "SIGN_DETECTED"
        return self._revise("CORRECT", seq, "USER", event_id, **{"from": old, "to": new_sign})

    def remove(self, event_id: str) -> SequenceRevision:
        seq = self.normalized()
        if not any(e["event_id"] == event_id for e in seq):
            raise SequenceError("sign not in the current sequence")
        return self._revise("REMOVE", [e for e in seq if e["event_id"] != event_id], "USER", event_id)

    def _revision(self, number: int) -> SequenceRevision | None:
        return self.db.scalar(select(SequenceRevision).where(SequenceRevision.session_id == self.session.id,
                                                             SequenceRevision.revision == number))

    def undo(self) -> SequenceRevision:
        """Return to the state before the change currently in effect (repeatable, step by step)."""
        last = self._last()
        effective = self._effective(last) if last else 0
        if effective == 0:
            raise SequenceError("nothing to undo")
        parent = self._revision(effective).detail.get("parent", 0)
        restored = self._revision(parent).normalized if parent else []
        return self._revise("UNDO", restored, "USER", None, effective=parent, undid=effective)

    def reset(self) -> SequenceRevision:
        return self._revise("RESET", [], "USER")
