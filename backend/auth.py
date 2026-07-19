"""
Auth0 JWT verification for the friends/leaderboard endpoints.

Only those endpoints require a login — the rest of the API (catalog,
weather, identify, gardens) stays open, matching the "local-first, backend
is an enhancement" philosophy used everywhere else in this app.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import httpx
from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import JWTError

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
# Prefer SPA client id (ID-token aud). Fall back to AUTH0_AUDIENCE for older API setup.
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "") or AUTH0_CLIENT_ID
ALGORITHMS = ["RS256"]

AUTH_CONFIGURED = bool(AUTH0_DOMAIN and AUTH0_AUDIENCE)


@lru_cache(maxsize=1)
def _jwks() -> dict[str, Any]:
    resp = httpx.get(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json", timeout=5.0)
    resp.raise_for_status()
    return resp.json()


def _signing_key(token: str) -> dict[str, Any]:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Malformed token") from exc

    for key in _jwks().get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return key
    # JWKS may have rotated: refresh once and retry.
    _jwks.cache_clear()
    for key in _jwks().get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return key
    raise HTTPException(status_code=401, detail="Signing key not found")


class CurrentUser:
    """Minimal identity extracted from a verified Auth0 ID token."""

    def __init__(self, sub: str, email: str | None = None) -> None:
        self.sub = sub
        self.email = email


def current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not AUTH_CONFIGURED:
        raise HTTPException(
            status_code=503,
            detail="AUTH0_DOMAIN / AUTH0_AUDIENCE are not configured on the server",
        )
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[len("Bearer ") :]

    key = _signing_key(token)
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing subject")
    return CurrentUser(sub=sub, email=payload.get("email"))
