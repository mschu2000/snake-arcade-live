from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from typing import Any

from fastapi import Cookie, Depends, Header, HTTPException, status

from .models import User

COOKIE_NAME = "snake_session"
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 390_000


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = PASSWORD_HASH_ITERATIONS) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{PASSWORD_HASH_ALGORITHM}${iterations}${encoded_salt}${encoded_digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_str, encoded_salt, encoded_digest = stored_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        iterations = int(iterations_str)
        salt = base64.urlsafe_b64decode(encoded_salt + "=" * (-len(encoded_salt) % 4))
        expected = base64.urlsafe_b64decode(encoded_digest + "=" * (-len(encoded_digest) % 4))
    except (ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def parse_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def resolve_auth_token(
    authorization: str | None = Header(default=None),
    snake_session: str | None = Cookie(default=None),
) -> str | None:
    return parse_bearer_token(authorization) or snake_session


def build_require_user(store: Any):
    def require_user(token: str | None = Depends(resolve_auth_token)) -> User:
        user = store.user_from_session(token)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        return user

    return require_user


def attach_session_headers(response: Any, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        path="/",
    )
    response.headers["Authorization"] = f"Bearer {token}"

