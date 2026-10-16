"""Data retention: delete ended sessions (and their incidents, events, answers) older than the retention period.

Run: python -m signline_emergency.retention [--days N] [--dry-run]
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import session_factory
from .models import AnalyticsEvent, EmergencySession


def purge(db: Session, days: int, dry_run: bool = False) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    old = list(db.scalars(select(EmergencySession).where(EmergencySession.ended_at.is_not(None),
                                                         EmergencySession.ended_at < cutoff)))
    analytics = db.scalars(select(AnalyticsEvent.id).where(AnalyticsEvent.created_at < cutoff)).all()
    if not dry_run:
        for s in old:
            db.delete(s)  # foreign keys cascade to events, questions, incident, facts, history
        db.execute(delete(AnalyticsEvent).where(AnalyticsEvent.created_at < cutoff))
        db.commit()
    return {"sessions": len(old), "analytics_events": len(analytics), "cutoff": cutoff.isoformat(), "dry_run": dry_run}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=get_settings().retention_days)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    with session_factory()() as db:
        print(purge(db, args.days, args.dry_run))


if __name__ == "__main__":
    main()
