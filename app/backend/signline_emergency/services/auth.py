"""Responder authentication, session access tokens and rate limiting (standard library only).

Passwords: scrypt with a random salt. Responder tokens: HMAC-SHA256 signed, with expiry; the role is read
from the database on every request, so a token cannot grant a role the account does not have.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from collections import defaultdict, deque

from ..config import get_settings

_N, _R, _P = 2**14, 8, 1
DEVICE_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        test = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(test.hex(), digest)
    except (ValueError, TypeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(get_settings().secret_key.encode(), body.encode(), hashlib.sha256).digest())


def issue_token(user_id: str) -> str:
    body = _b64(json.dumps({"sub": user_id, "exp": int(time.time()) + get_settings().token_ttl_s}).encode())
    return f"{body}.{_sign(body)}"


def read_token(token: str) -> str | None:
    """The user id of a valid, unexpired token, else None."""
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        claims = json.loads(_unb64(body))
        return claims["sub"] if claims["exp"] > time.time() else None
    except (ValueError, KeyError, json.JSONDecodeError):
        return None


def new_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(24)
    return token, hash_session_token(token)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def session_token_ok(token: str | None, stored_hash: str) -> bool:
    return bool(token) and hmac.compare_digest(hash_session_token(token), stored_hash)


class RateLimiter:
    """Sliding one-minute window per key (in memory: per server process)."""

    def __init__(self):
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, limit: int | None = None) -> bool:
        limit = limit or get_settings().rate_limit_per_min
        now, q = time.monotonic(), self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    def reset(self) -> None:
        self.hits.clear()


limiter = RateLimiter()
