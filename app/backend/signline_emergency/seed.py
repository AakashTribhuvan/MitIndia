"""Demo responder account.

The password comes from SIGNLINE_EM_DEMO_RESPONDER_PASSWORD; if unset, a random one is generated once and
written to app/backend/var/demo_responder_credentials.txt (git-ignored). No password is in the code.

Run: python -m signline_emergency.seed
"""

from __future__ import annotations

import os
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import VAR_DIR
from .db import session_factory
from .models import User
from .services.auth import hash_password

DEMO_USERNAME = "demo.responder"
CREDENTIALS_FILE = VAR_DIR / "demo_responder_credentials.txt"


def ensure_demo_responder(db: Session) -> User:
    user = db.scalar(select(User).where(User.username == DEMO_USERNAME))
    if user is not None:
        return user
    password = os.getenv("SIGNLINE_EM_DEMO_RESPONDER_PASSWORD")
    if not password:
        password = secrets.token_urlsafe(9)
        VAR_DIR.mkdir(parents=True, exist_ok=True)
        CREDENTIALS_FILE.write_text(
            f"SignLine Emergency demo responder (demo only)\nusername: {DEMO_USERNAME}\npassword: {password}\n",
            encoding="utf-8")
    user = User(username=DEMO_USERNAME, display_name="Demo responder desk", role="RESPONDER",
                password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


def main() -> None:
    with session_factory()() as db:
        user = ensure_demo_responder(db)
    where = "SIGNLINE_EM_DEMO_RESPONDER_PASSWORD" if os.getenv("SIGNLINE_EM_DEMO_RESPONDER_PASSWORD") else CREDENTIALS_FILE
    print(f"Demo responder: {user.username} (password: see {where})")


if __name__ == "__main__":
    main()
