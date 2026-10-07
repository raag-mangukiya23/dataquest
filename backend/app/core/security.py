"""Password hashing (argon2id) and JWT access tokens; refresh tokens are random and stored hashed."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    s = get_settings()
    ttl = s.access_token_ttl_min * 60
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": user_id, "role": role, "iat": now, "exp": now + timedelta(seconds=ttl), "typ": "access"},
        s.jwt_secret,
        algorithm=ALGORITHM,
    )
    return token, ttl


def decode_access_token(token: str) -> dict:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise AppError(ErrorCode.UNAUTHORIZED, "Access token expired") from e
    except jwt.PyJWTError as e:
        raise AppError(ErrorCode.UNAUTHORIZED, "Invalid access token") from e
    if claims.get("typ") != "access":
        raise AppError(ErrorCode.UNAUTHORIZED, "Wrong token type")
    return claims


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def new_invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid misreading
    return "".join(secrets.choice(alphabet) for _ in range(8))
