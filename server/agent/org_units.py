"""Org-unit hierarchy: department / cohort / division sub-admin accounts.

One generic concept reused at every level below the institute -- "an
account, created by the level above it, that can copy its parent's
published calendar and manage its own draft/publish cycle." Kept
storage-agnostic (pure permission/hashing logic only) the same way
event_agent.py/holiday_agent.py are -- routes/org_units.py owns the actual
persistence via db.py.
"""
import bcrypt

# Who may create a child at which level. `None` represents the institute
# admin (not itself an org unit). A department may create *either* a cohort
# or a division directly -- not just cohort -- to support the one
# documented edge case: "Humanities and Engineering Sciences (First Year)"
# has no SY/TY/B.Tech split at all, so its children are divisions directly.
# This is the only place that skip is allowed; a cohort may still only
# create a division, never skip further.
ALLOWED_CHILD_LEVELS: dict[str | None, set[str]] = {
    None: {"department"},
    "department": {"cohort", "division"},
    "cohort": {"division"},
    "division": set(),
}


def can_create(caller_level: str | None, child_level: str) -> bool:
    """Whether an org unit at `caller_level` (or the institute admin, if
    `None`) may create a child at `child_level`. Enforced server-side from
    the caller's own JWT-derived level -- never trust a client-supplied
    parent_id/level to imply permission."""
    return child_level in ALLOWED_CHILD_LEVELS.get(caller_level, set())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # A malformed/corrupt stored hash should read as "doesn't match",
        # not crash the login attempt.
        return False
