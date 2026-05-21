"""Supabase JWT validation for FastAPI endpoints.

Every protected endpoint should depend on `get_current_user_id`. The dependency
verifies the bearer token signed by Supabase's `JWT_SECRET` and returns the
caller's `auth.users.id` (UUID).

Internal-to-FastAPI endpoints (called by Next.js server actions) should use
`require_internal_secret` instead — they share a long random string out of
band rather than going through the auth flow.
"""
from __future__ import annotations

import hmac
from uuid import UUID

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from app.config import settings


_JWT_ALGORITHM = "HS256"
_JWT_AUDIENCE = "authenticated"


def _decode_supabase_jwt(token: str) -> dict:
    secret = settings.supabase_jwt_secret
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET is not configured",
        )

    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[_JWT_ALGORITHM],
            audience=_JWT_AUDIENCE,
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


def get_current_user_id(authorization: str | None = Header(default=None)) -> UUID:
    """Return the authenticated user's UUID, or raise 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_supabase_jwt(token)

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim",
        )

    try:
        return UUID(sub)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id in token",
        ) from exc


def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    """Allow only Next.js server-side callers that share INTERNAL_SECRET."""
    expected = settings.internal_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_SECRET is not configured",
        )
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal secret",
        )
