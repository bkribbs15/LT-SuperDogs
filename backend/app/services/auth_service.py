from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from app.config import settings
from app.schemas.user import TokenData
from uuid import UUID
import bcrypt
import secrets

# The only endpoints a must_change_password account may call (enforced by the
# get_current_user dependency). /me lets the frontend restore its session;
# change-password is the way out of the lock.
PASSWORD_GATE_ALLOWED_PATHS = {
    "/api/auth/change-password",
    "/api/auth/me",
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return TokenData(user_id=UUID(user_id), email=payload.get("email"), is_admin=payload.get("is_admin", False))
    except (JWTError, ValueError):
        return None


# ── Password reset requests (admin-resolved; no email is sent) ───────────────

def create_password_reset_token(session, user_id: str, email: str, expires_hours: int = 168) -> str:
    token = secrets.token_urlsafe(32)
    created_at = datetime.utcnow()
    expires_at = created_at + timedelta(hours=expires_hours)
    session.execute(
        "INSERT INTO password_reset_tokens (token, user_id, email, created_at, expires_at, is_used) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (token, user_id, email, created_at.isoformat(), expires_at.isoformat()),
    )
    session.commit()
    return token


def clear_pending_reset_tokens(session, user_id: str):
    """Only the newest request per user is ever pending."""
    session.execute(
        "UPDATE password_reset_tokens SET is_used = 1 WHERE user_id = ? AND is_used = 0",
        (str(user_id),))
    session.commit()


def mark_token_as_used(session, token: str):
    session.execute("UPDATE password_reset_tokens SET is_used = 1 WHERE token = ?", (token,))
    session.commit()


def get_reset_token(session, token: str) -> Optional[dict]:
    row = session.execute(
        "SELECT token, user_id, email, created_at, expires_at, is_used FROM password_reset_tokens WHERE token = ?",
        (token,)).fetchone()
    if not row or row['is_used']:
        return None
    if datetime.fromisoformat(row['expires_at']) < datetime.utcnow():
        return None
    return dict(row)


def list_pending_reset_tokens(session) -> list:
    """Pending (unused, unexpired) reset requests, newest first."""
    now = datetime.utcnow()
    rows = session.execute(
        "SELECT t.token, t.user_id, t.email, t.created_at, t.expires_at, u.username "
        "FROM password_reset_tokens t LEFT JOIN users u ON u.user_id = t.user_id "
        "WHERE t.is_used = 0").fetchall()
    pending = [dict(r) for r in rows if datetime.fromisoformat(r['expires_at']) >= now]
    pending.sort(key=lambda r: r['created_at'], reverse=True)
    return pending
