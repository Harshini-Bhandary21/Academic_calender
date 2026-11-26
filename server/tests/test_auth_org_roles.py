"""Unit tests for auth.py's org-unit role detection and dependencies --
issue_token()'s "which password is this" logic, require_org_unit(),
require_identity(), and optional_role(). Mirrors test_auth.py's pattern
(fake JWTs, no real server) -- list_all_org_units() is monkeypatched
instead of needing a real MongoDB connection, same reasoning db.py's own
docstrings give for why _merge_years/_merge_terms are pulled out as pure,
independently-testable functions.
"""
import os
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-32-bytes-plus")
os.environ.setdefault("ADMIN_PASSWORD", "the-institute-admin-password")

import agent.auth as auth  # noqa: E402
from agent.org_units import hash_password  # noqa: E402


def _credentials_for(payload: dict) -> HTTPAuthorizationCredentials:
    token = jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])


FAKE_DEPARTMENT = {
    "id": "dept-1",
    "name": "Computer Engineering",
    "level": "department",
    "parent_id": None,
    "password_hash": hash_password("dept-secret"),
}


@pytest.fixture
def one_department(monkeypatch):
    monkeypatch.setattr(auth, "list_all_org_units", lambda: [FAKE_DEPARTMENT])


def test_issue_token_with_admin_password_gets_admin_role():
    token = auth.issue_token(os.environ["ADMIN_PASSWORD"])
    assert _decode_token(token)["role"] == "admin"


def test_issue_token_with_an_org_units_password_gets_org_role(one_department):
    token = auth.issue_token("dept-secret")
    payload = _decode_token(token)
    assert payload["role"] == "org"
    assert payload["org_id"] == "dept-1"
    assert payload["level"] == "department"


def test_issue_token_with_no_matching_password_raises_401(one_department):
    with pytest.raises(HTTPException) as exc:
        auth.issue_token("nothing-matches-this")
    assert exc.value.status_code == 401


def test_issue_token_with_no_org_units_at_all_still_401s(monkeypatch):
    monkeypatch.setattr(auth, "list_all_org_units", lambda: [])
    with pytest.raises(HTTPException):
        auth.issue_token("anything")


def test_require_org_unit_accepts_a_valid_org_token():
    dependency = auth.require_org_unit()
    payload = {"role": "org", "org_id": "dept-1", "level": "department", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    org_id, level = dependency(_credentials_for(payload))
    assert (org_id, level) == ("dept-1", "department")


def test_require_org_unit_rejects_an_admin_token():
    dependency = auth.require_org_unit()
    payload = {"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    with pytest.raises(HTTPException) as exc:
        dependency(_credentials_for(payload))
    assert exc.value.status_code == 403


def test_require_org_unit_with_a_specific_level_rejects_a_different_level():
    dependency = auth.require_org_unit(level="cohort")
    payload = {"role": "org", "org_id": "dept-1", "level": "department", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    with pytest.raises(HTTPException) as exc:
        dependency(_credentials_for(payload))
    assert exc.value.status_code == 403


def test_require_org_unit_with_a_specific_level_accepts_a_matching_level():
    dependency = auth.require_org_unit(level="department")
    payload = {"role": "org", "org_id": "dept-1", "level": "department", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    assert dependency(_credentials_for(payload)) == ("dept-1", "department")


def test_require_org_unit_rejects_missing_credentials():
    dependency = auth.require_org_unit()
    with pytest.raises(HTTPException) as exc:
        dependency(None)
    assert exc.value.status_code == 401


def test_require_identity_accepts_admin():
    payload = {"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    identity = auth.require_identity(_credentials_for(payload))
    assert identity == {"role": "admin", "org_id": None, "level": None}


def test_require_identity_accepts_org():
    payload = {"role": "org", "org_id": "dept-1", "level": "department", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    identity = auth.require_identity(_credentials_for(payload))
    assert identity == {"role": "org", "org_id": "dept-1", "level": "department"}


def test_require_identity_rejects_missing_credentials():
    with pytest.raises(HTTPException) as exc:
        auth.require_identity(None)
    assert exc.value.status_code == 401


def test_optional_role_never_raises_for_missing_credentials():
    assert auth.optional_role(None) == {"role": "public", "org_id": None, "level": None}


def test_optional_role_never_raises_for_garbage_token():
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-real-jwt")
    assert auth.optional_role(creds) == {"role": "public", "org_id": None, "level": None}


def test_optional_role_identifies_org_token():
    payload = {"role": "org", "org_id": "dept-1", "level": "department", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    assert auth.optional_role(_credentials_for(payload)) == {"role": "org", "org_id": "dept-1", "level": "department"}
