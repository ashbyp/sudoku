from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt

from app.core.db import get_db

SESSION_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    created_at = _now()
    expires_at = created_at + timedelta(days=SESSION_DAYS)

    with get_db() as db:
        db.execute(
            """
            INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, token_hash, created_at.isoformat(), expires_at.isoformat()),
        )

    return token


def delete_session(token: str) -> None:
    token_hash = _hash_token(token)
    with get_db() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def get_user_by_session(token: str | None) -> dict[str, object] | None:
    if not token:
        return None

    token_hash = _hash_token(token)
    with get_db() as db:
        row = db.execute(
            """
            SELECT users.id, users.email, users.is_admin, sessions.expires_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

        if not row:
            return None

        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at <= _now():
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            return None

        return {"id": row["id"], "email": row["email"], "is_admin": bool(row["is_admin"])}
