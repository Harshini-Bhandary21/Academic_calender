"""Unit tests for auth.py's optional_admin -- the non-raising counterpart
to require_admin, used by GET routes that serve different content by role
(an admin's own draft vs. everyone else's published snapshot) instead of
hard-requiring a token.
"""
import os
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.security import HTTPAuthorizationCredentials

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-32-bytes-plus")

from agent.auth import _payload_is_admin  # noqa: E402


def _credentials_for(payload: dict) -> HTTPAuthorizationCredentials:
    token = jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_no_credentials_is_not_admin():
    assert _payload_is_admin(None) is False


def test_valid_admin_token_is_admin():
    payload = {"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    assert _payload_is_admin(_credentials_for(payload)) is True


def test_expired_token_is_not_admin():
    payload = {"role": "admin", "exp": datetime.now(timezone.utc) - timedelta(hours=1)}
    assert _payload_is_admin(_credentials_for(payload)) is False


def test_wrong_role_is_not_admin():
    payload = {"role": "viewer", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    assert _payload_is_admin(_credentials_for(payload)) is False


def test_garbage_token_is_not_admin():
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-real-jwt")
    assert _payload_is_admin(creds) is False
