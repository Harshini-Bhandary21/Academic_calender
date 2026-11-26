"""Unit tests for agent/org_units.py -- the creation-permission matrix
(who may create a child at which level) and the password hash/verify
helpers. Both are pure, storage-agnostic logic, same testing philosophy as
test_holiday_agent.py/test_event_agent.py -- no real MongoDB needed.
"""
from agent.org_units import can_create, hash_password, verify_password


def test_institute_admin_may_create_a_department():
    assert can_create(None, "department") is True


def test_institute_admin_may_not_create_a_cohort_or_division_directly():
    assert can_create(None, "cohort") is False
    assert can_create(None, "division") is False


def test_department_may_create_a_cohort():
    assert can_create("department", "cohort") is True


def test_department_may_create_a_division_directly():
    # The one documented edge case -- e.g. Humanities and Engineering
    # Sciences (First Year), which has no SY/TY/B.Tech split at all.
    assert can_create("department", "division") is True


def test_department_may_not_create_another_department():
    assert can_create("department", "department") is False


def test_cohort_may_create_a_division():
    assert can_create("cohort", "division") is True


def test_cohort_may_not_create_a_cohort_or_department():
    assert can_create("cohort", "cohort") is False
    assert can_create("cohort", "department") is False


def test_division_may_not_create_anything():
    assert can_create("division", "department") is False
    assert can_create("division", "cohort") is False
    assert can_create("division", "division") is False


def test_password_hash_roundtrips():
    hashed = hash_password("correct-horse-battery-staple")
    assert verify_password("correct-horse-battery-staple", hashed) is True


def test_wrong_password_does_not_verify():
    hashed = hash_password("correct-horse-battery-staple")
    assert verify_password("something-else", hashed) is False


def test_verify_password_against_a_malformed_hash_is_false_not_a_crash():
    assert verify_password("anything", "not-a-real-bcrypt-hash") is False


def test_hash_is_never_the_plaintext_itself():
    hashed = hash_password("some-password")
    assert hashed != "some-password"
