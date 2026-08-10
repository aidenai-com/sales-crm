import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]

# bcrypt silently truncates at 72 bytes, which would make a long password's tail
# meaningless. Reject rather than mislead.
MAX_PASSWORD_BYTES = 72


class InvalidToken(Exception):
    """Raised when a token is missing, malformed, expired, or of the wrong type."""


def hash_password(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    """
    Constant-time check that also tolerates users with no local password (SSO-only), and
    never raises on a malformed stored hash.
    """
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:MAX_PASSWORD_BYTES], password_hash.encode("utf-8"))
    except ValueError:
        return False


def _create_token(subject: uuid.UUID, token_type: TokenType, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        # A unique id per token, so a future revocation list has something to key on.
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, "access", timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.refresh_token_expire_days))


def decode_token(token: str, expected_type: TokenType) -> uuid.UUID:
    """
    Returns the user id from a valid token of the expected type.

    The type check matters: without it a refresh token would be accepted as an access
    token, quietly extending its lifetime to the refresh window.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidToken("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise InvalidToken("Token could not be validated") from exc

    if payload.get("type") != expected_type:
        raise InvalidToken(f"Expected a {expected_type} token")

    subject = payload.get("sub")
    if not subject:
        raise InvalidToken("Token is missing a subject")

    try:
        return uuid.UUID(subject)
    except ValueError as exc:
        raise InvalidToken("Token subject is not a valid id") from exc
