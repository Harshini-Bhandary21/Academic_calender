"""Unit tests for db.py's draft/published-snapshot reshaping helpers
(_admin_view/_public_view) -- pure functions over plain dicts, no real
MongoDB connection needed. This is the logic behind the publish feature:
an admin always sees the live draft (plus publish-status flags); a public
visitor only ever sees the last-published snapshot, never in-progress
edits sitting on top of it.

Neither function looks at `meta` or the *content* of events/holidays at
all -- only `saved_at`/`published_at`/`published`'s presence -- so the
fixtures below deliberately use obviously-arbitrary placeholders (not a
real academic year) to make that clear, and simple sentinel event ids
(DRAFT_EVENT/PUBLISHED_EVENT) instead of realistic-looking dates.
"""
from agent.db import _admin_view, _public_view

PLACEHOLDER_META = {"academic_year": "some-year", "term": "some-term", "category": "some-category"}
DRAFT_EVENT = {"id": "draft-event"}
PUBLISHED_EVENT = {"id": "published-event"}

# Two arbitrary but comparable ISO-8601 timestamps -- only their relative
# order matters (has_unpublished_changes is a plain string comparison),
# not what they actually are.
EARLIER = "2000-01-01T00:00:00+00:00"
LATER = "2000-06-01T00:00:00+00:00"


def _draft_doc(**overrides):
    doc = {
        "meta": PLACEHOLDER_META,
        "events": [DRAFT_EVENT],
        "holidays": [],
        "issues": [],
        "saved_at": EARLIER,
        "published": None,
    }
    doc.update(overrides)
    return doc


def _published_snapshot(published_at):
    return {"meta": PLACEHOLDER_META, "events": [PUBLISHED_EVENT], "holidays": [], "issues": [], "published_at": published_at}


def test_admin_view_reports_unpublished_when_never_published():
    doc = _admin_view(_draft_doc())
    assert doc["is_published"] is False
    assert doc["published_at"] is None
    assert doc["has_unpublished_changes"] is True


def test_admin_view_reports_in_sync_right_after_publishing():
    # saved_at is not after published_at -- nothing has changed since publishing.
    doc = _admin_view(_draft_doc(saved_at=EARLIER, published=_published_snapshot(EARLIER)))
    assert doc["is_published"] is True
    assert doc["published_at"] == EARLIER
    assert doc["has_unpublished_changes"] is False


def test_admin_view_reports_unpublished_changes_after_editing_a_published_calendar():
    # saved_at is after published_at -- an edit happened since the last publish.
    doc = _admin_view(_draft_doc(saved_at=LATER, published=_published_snapshot(EARLIER)))
    assert doc["is_published"] is True
    assert doc["has_unpublished_changes"] is True


def test_public_view_is_none_for_a_draft_that_was_never_published():
    assert _public_view(_draft_doc()) is None


def test_public_view_is_none_for_a_nonexistent_document():
    assert _public_view(None) is None


def test_public_view_returns_only_the_published_snapshot_not_the_newer_draft():
    # The draft (top-level events) has since been edited to something else --
    # the public view must reflect the published snapshot, not this.
    doc = _draft_doc(events=[{"id": "some-newer-draft-event"}], published=_published_snapshot(EARLIER))
    result = _public_view(doc)
    assert result["events"] == [PUBLISHED_EVENT]
    assert result["is_published"] is True
    assert result["has_unpublished_changes"] is False
