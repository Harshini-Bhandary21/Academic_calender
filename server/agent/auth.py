"""Shared-password admin + org-unit auth.

Two kinds of privileged role now: the single institute admin (still a
shared ADMIN_PASSWORD, no user table), and any number of org-unit accounts
(department/cohort/division sub-admins, see agent/org_units.py) each with
their own bcrypt-hashed password in the `org_units` collection. One login
endpoint, one password field -- issue_token() figures out which kind of
password it is: an exact match against ADMIN_PASSWORD wins first (unchanged
behavior), otherwise every stored org-unit hash is checked in turn. A
successful login gets a signed JWT (24h expiry) carrying either
`{role: "admin"}` or `{role: "org", org_id, level, name}`; require_admin()/
require_org_unit() are the FastAPI dependencies that verify each.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import list_all_org_units
from .org_units import verify_password

_bearer = HTTPBearer(auto_error=False)


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return secret


def issue_token(password: str) -> str:
    if password == os.getenv("ADMIN_PASSWORD"):
        payload = {"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=24)}
        return jwt.encode(payload, _secret(), algorithm="HS256")

    # Not the institute admin's password -- check every org unit's hash.
    # Linear scan is fine at the expected scale (departments/cohorts/
    # divisions number in the tens-to-hundreds, not millions), and a hash
    # check is the only safe way to test a candidate password against a
    # one-way stored hash -- there's no index to look it up by.
    for unit in list_all_org_units():
        if verify_password(password, unit["password_hash"]):
            payload = {
                "role": "org",
                "org_id": unit["id"],
                "level": unit["level"],
                "name": unit["name"],
                "exp": datetime.now(timezone.utc) + timedelta(hours=24),
            }
            return jwt.encode(payload, _secret(), algorithm="HS256")

    raise HTTPException(status_code=401, detail="Incorrect password")


def _decode(credentials: HTTPAuthorizationCredentials | None) -> Optional[dict]:
    if credentials is None:
        return None
    try:
        return jwt.decode(credentials.credentials, _secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def _payload_is_admin(credentials: HTTPAuthorizationCredentials | None) -> bool:
    payload = _decode(credentials)
    return payload is not None and payload.get("role") == "admin"


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> None:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing admin token")

    payload = _decode(credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def optional_admin(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> bool:
    """Like require_admin, but never raises -- True if a valid admin token
    was presented, False for a missing/invalid/expired one (a plain public
    viewer). Used by GET routes that serve different content by role (an
    admin's own in-progress draft vs. everyone else's published snapshot)
    instead of hard-requiring a token."""
    return _payload_is_admin(credentials)


def require_org_unit(level: Optional[str] = None):
    """Returns a FastAPI dependency that 401/403s unless the token is a
    valid org-unit token (and, if `level` is given, unless that token's own
    level matches) -- the dependency itself returns `(org_id, level)`,
    always read from the token, never trusted from a request body/URL/query
    param, so one org unit can never act as another or spoof a level it
    isn't. Usage: `Depends(require_org_unit())` for "any org unit",
    `Depends(require_org_unit(level="department"))` to restrict to exactly
    that level (e.g. only a department may create a cohort or division)."""

    def dependency(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> tuple[str, str]:
        if credentials is None:
            raise HTTPException(status_code=401, detail="Missing token")
        payload = _decode(credentials)
        if payload is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        if payload.get("role") != "org":
            raise HTTPException(status_code=403, detail="Org-unit access required")
        token_level = payload.get("level")
        if level is not None and token_level != level:
            raise HTTPException(status_code=403, detail=f"This action requires a {level}-level account")
        return payload["org_id"], token_level

    return dependency


def _identity_from_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    if payload.get("role") == "admin":
        return {"role": "admin", "org_id": None, "level": None}
    if payload.get("role") == "org":
        return {"role": "org", "org_id": payload.get("org_id"), "level": payload.get("level")}
    return None


def optional_role(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Like optional_admin, but distinguishes all three audiences a GET can
    now serve: the institute admin, a specific org unit, or a plain public
    viewer. Never raises -- an invalid/expired/missing token just reads as
    public. Returns `{"role": "public"|"admin"|"org", "org_id": str|None, "level": str|None}`."""
    return _identity_from_payload(_decode(credentials)) or {"role": "public", "org_id": None, "level": None}


def require_identity(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Like optional_role, but raises 401 unless there's *some* valid
    privileged identity (institute admin OR any org unit) -- used by
    endpoints that accept either kind, like creating a child org unit
    (the institute admin creates departments; a department/cohort org unit
    creates its own children), unlike require_admin/require_org_unit which
    each demand one specific kind."""
    identity = _identity_from_payload(_decode(credentials))
    if identity is None:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    return identity
