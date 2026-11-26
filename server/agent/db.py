"""MongoDB persistence for calendars.

A calendar is uniquely identified by (academic_year, term, category) --
category distinguishes multiple calendar variants within the same term (e.g.
"UG Calendar" vs "PG Calendar" vs "FY Calendar"). Each save upserts into a
single document per (year, term, category) instead of accumulating
duplicate copies. Connection is lazy and optional: if MONGODB_URI isn't set
yet, saves are skipped (and reads return nothing) with a warning instead of
crashing the API.

Draft vs. published: the document's top level (meta/events/holidays/issues/
saved_at) is always the current, freely-editable draft -- every mutation
endpoint writes here via save_calendar_draft(). A separate `published`
sub-document is a full snapshot taken only when an admin explicitly
publishes (see publish_calendar()); it's `None` until that first happens.
An admin's own GETs (_admin_view) always see the live draft, plus computed
publish-status fields; everyone else's GETs (_public_view) only ever see
the last-published snapshot, so in-progress edits never leak to a public
visitor until the admin chooses to publish them.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from pymongo import MongoClient
from pymongo.collection import Collection

from .schema import CalendarDraft

_client: MongoClient | None = None

# Terms only ever come in this fixed pair -- used to order list_terms()
# output consistently (Term I before Term II) rather than alphabetically,
# and as the definitive set worth ever looking up categories for.
_TERM_ORDER = ["Term I", "Term II"]


def _get_client() -> MongoClient | None:
    global _client

    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI not set -- skipping calendar persistence")
        return None

    if _client is None:
        _client = MongoClient(uri)
    return _client


def _get_collection() -> Collection | None:
    client = _get_client()
    if client is None:
        return None
    db_name = os.getenv("MONGODB_DB_NAME", "academic_calendar")
    return client[db_name]["calendars"]


def _get_categories_collection() -> Collection | None:
    client = _get_client()
    if client is None:
        return None
    db_name = os.getenv("MONGODB_DB_NAME", "academic_calendar")
    return client[db_name]["calendar_categories"]


def _get_academic_years_collection() -> Collection | None:
    client = _get_client()
    if client is None:
        return None
    db_name = os.getenv("MONGODB_DB_NAME", "academic_calendar")
    return client[db_name]["academic_years"]


def _merge_years(declared: set[str], from_calendars: set[str]) -> list[str]:
    """Union explicitly-declared years (admin scaffolding -- see
    add_academic_year) with years that actually have a calendar, newest
    first. Pure/dedup logic pulled out of list_academic_years() so it's
    unit-testable without a live MongoDB connection."""
    return sorted(declared | from_calendars, reverse=True)


def _merge_terms(declared: list[str], from_calendars: set[str]) -> list[str]:
    """Same idea as _merge_years, but for a single year's terms -- kept in
    the fixed Term I/Term II order rather than however Mongo happens to
    return them."""
    found = set(declared) | from_calendars
    return [t for t in _TERM_ORDER if t in found]


def _key(academic_year: str, term: str, category: str) -> dict:
    return {"meta.academic_year": academic_year, "meta.term": term, "meta.category": category}


def _admin_view(doc: dict) -> dict:
    """The live draft (doc's own top-level fields) plus computed
    publish-status flags -- what an admin always sees/edits, regardless of
    whether it's ever been published."""
    published = doc.get("published")
    doc["is_published"] = published is not None
    doc["published_at"] = published["published_at"] if published else None
    # No published snapshot yet -> there's obviously something unpublished.
    # Otherwise compare save timestamps -- both are ISO-8601 UTC strings,
    # so plain string comparison already sorts chronologically.
    doc["has_unpublished_changes"] = published is None or doc.get("saved_at", "") > published["published_at"]
    return doc


def _public_view(doc: dict | None) -> dict | None:
    """The published snapshot only, reshaped to the flat CalendarDraft
    shape -- None if this calendar has never been published (even if a
    draft exists), so it reads as "doesn't exist yet" to a public visitor."""
    if doc is None:
        return None
    published = doc.get("published")
    if published is None:
        return None
    return {
        "meta": published["meta"],
        "events": published["events"],
        "holidays": published["holidays"],
        "issues": published["issues"],
        "day_color_overrides": published.get("day_color_overrides", {}),
        "is_published": True,
        "published_at": published["published_at"],
        "has_unpublished_changes": False,
    }


def save_calendar_draft(draft: CalendarDraft) -> bool:
    """Upsert a draft keyed by its (academic_year, term, category). Returns
    False if persistence is unconfigured.

    Uses `$set` on just the draft's own fields (not replace_one) so an
    existing `published` snapshot is left untouched -- editing a draft
    must never silently wipe or change what's currently live."""
    collection = _get_collection()
    if collection is None:
        return False

    document = draft.model_dump(mode="json", exclude={"is_published", "published_at", "has_unpublished_changes"})
    document["saved_at"] = datetime.now(timezone.utc).isoformat()
    collection.update_one(
        _key(draft.meta.academic_year, draft.meta.term, draft.meta.category), {"$set": document}, upsert=True
    )
    return True


def get_calendar(academic_year: str, term: str, category: str, admin: bool = False) -> dict | None:
    collection = _get_collection()
    if collection is None:
        return None
    doc = collection.find_one(_key(academic_year, term, category), {"_id": 0})
    if doc is None:
        return None
    return _admin_view(doc) if admin else _public_view(doc)


def publish_calendar(academic_year: str, term: str, category: str) -> dict | None:
    """Snapshot the current draft into `published`, making it visible to
    public visitors. Returns the refreshed admin view, or None if no draft
    exists yet for this key (or persistence is unconfigured)."""
    collection = _get_collection()
    if collection is None:
        return None
    doc = collection.find_one(_key(academic_year, term, category), {"_id": 0})
    if doc is None:
        return None

    published = {
        "meta": doc["meta"],
        "events": doc["events"],
        "holidays": doc["holidays"],
        "issues": doc["issues"],
        "day_color_overrides": doc.get("day_color_overrides", {}),
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    collection.update_one(_key(academic_year, term, category), {"$set": {"published": published}})
    doc["published"] = published
    return _admin_view(doc)


def unpublish_calendar(academic_year: str, term: str, category: str) -> dict | None:
    """Pull a calendar back out of public view (the draft itself is
    untouched) -- returns the refreshed admin view, or None if it doesn't
    exist / persistence is unconfigured."""
    collection = _get_collection()
    if collection is None:
        return None
    doc = collection.find_one(_key(academic_year, term, category), {"_id": 0})
    if doc is None:
        return None

    collection.update_one(_key(academic_year, term, category), {"$set": {"published": None}})
    doc["published"] = None
    return _admin_view(doc)


def delete_calendar(academic_year: str, term: str, category: str) -> bool:
    """Deletes the whole document -- draft and any published snapshot
    together. Use unpublish_calendar() instead to only pull it from public
    view while keeping the draft."""
    collection = _get_collection()
    if collection is None:
        return False
    result = collection.delete_one(_key(academic_year, term, category))
    return result.deleted_count > 0


def add_academic_year(academic_year: str, terms: list[str] | None = None) -> bool:
    """Explicitly declare a new academic year (optionally scoped to only
    some terms) so it shows up in the sidebar before any calendar has been
    generated for it yet -- the same role calendar_categories plays for
    categories. Idempotent: re-adding an existing year just replaces its
    term list. Returns False if persistence is unconfigured."""
    collection = _get_academic_years_collection()
    if collection is None:
        return False
    valid_terms = [t for t in (terms or _TERM_ORDER) if t in _TERM_ORDER]
    collection.update_one({"academic_year": academic_year}, {"$set": {"terms": valid_terms or _TERM_ORDER}}, upsert=True)
    return True


def remove_academic_year(academic_year: str) -> tuple[bool, str | None]:
    """Removes a declared academic year -- refuses (returning an error
    message instead of raising) if any real calendar still exists under
    it, so this can never silently orphan actual content. Delete those
    calendars first via delete_calendar()."""
    years_collection = _get_academic_years_collection()
    calendars = _get_collection()
    if years_collection is None or calendars is None:
        return False, "Persistence is not configured"
    if calendars.count_documents({"meta.academic_year": academic_year}, limit=1) > 0:
        return False, "This academic year still has calendars saved under it -- delete those first"
    years_collection.delete_one({"academic_year": academic_year})
    return True, None


def add_term(academic_year: str, term: str) -> tuple[bool, str | None]:
    """Adds a term to a (possibly not-yet-declared) academic year."""
    if term not in _TERM_ORDER:
        return False, f"Unknown term {term!r}"
    collection = _get_academic_years_collection()
    if collection is None:
        return False, "Persistence is not configured"
    collection.update_one({"academic_year": academic_year}, {"$addToSet": {"terms": term}}, upsert=True)
    return True, None


def remove_term(academic_year: str, term: str) -> tuple[bool, str | None]:
    """Removes a term from a declared academic year -- refuses if any real
    calendar still exists for that (year, term)."""
    years_collection = _get_academic_years_collection()
    calendars = _get_collection()
    if years_collection is None or calendars is None:
        return False, "Persistence is not configured"
    if calendars.count_documents({"meta.academic_year": academic_year, "meta.term": term}, limit=1) > 0:
        return False, "This term still has calendars saved under it -- delete those first"
    years_collection.update_one({"academic_year": academic_year}, {"$pull": {"terms": term}})
    return True, None


def list_academic_years(admin: bool = False) -> list[str]:
    """Every academic year with at least one saved calendar, plus any year
    explicitly declared via add_academic_year even before it has one --
    newest first. Declared years are visible to *everyone*, admin or not
    (an admin setting up next year's structure ahead of time wants
    visitors to see it too) -- only actual calendar *content* is gated by
    publish status: a public visitor only ever sees years with at least
    one published calendar, never an unpublished draft's worth."""
    collection = _get_collection()
    if collection is None:
        return []
    filt = {} if admin else {"published": {"$ne": None}}
    from_calendars = set(collection.distinct("meta.academic_year", filt))

    declared: set[str] = set()
    years_collection = _get_academic_years_collection()
    if years_collection is not None:
        declared = {doc["academic_year"] for doc in years_collection.find({}, {"academic_year": 1})}
    return _merge_years(declared, from_calendars)


def list_terms(academic_year: str, admin: bool = False) -> list[str]:
    """Every term for a given academic year, in Term I/Term II order --
    same declared-vs-published distinction as list_academic_years (declared
    terms are visible to everyone; only actual calendar content is
    publish-gated for a public visitor)."""
    collection = _get_collection()
    if collection is None:
        return []
    filt = {"meta.academic_year": academic_year}
    if not admin:
        filt["published"] = {"$ne": None}
    from_calendars = set(collection.distinct("meta.term", filt))

    declared: list[str] = []
    years_collection = _get_academic_years_collection()
    if years_collection is not None:
        doc = years_collection.find_one({"academic_year": academic_year}, {"terms": 1})
        declared = doc["terms"] if doc else []
    return _merge_terms(declared, from_calendars)


def list_categories(academic_year: str, term: str, admin: bool = False) -> list[str]:
    """The calendar categories offered for a given (academic_year, term)
    (e.g. Term I -> UG/PG/FY), sourced from the calendar_categories
    collection so adding a new category later is a database edit, not a
    code change. Returns an empty list if the term is unknown or
    persistence is unconfigured.

    Same admin/public distinction as list_academic_years/list_terms: an
    admin sees every configured category regardless of content, so there's
    still a card to click into and generate a first calendar for; a public
    visitor only sees categories that actually have a published calendar
    for this specific (academic_year, term) -- a category with nothing
    published yet simply isn't shown at all, rather than being a dead card
    that leads to "doesn't exist yet".
    """
    collection = _get_categories_collection()
    if collection is None:
        return []
    doc = collection.find_one({"term": term}, {"_id": 0})
    configured = doc["categories"] if doc else []
    if admin:
        return configured

    calendars = _get_collection()
    if calendars is None:
        return []
    published = set(
        calendars.distinct(
            "meta.category",
            {"meta.academic_year": academic_year, "meta.term": term, "published": {"$ne": None}},
        )
    )
    return [c for c in configured if c in published]


# ---------------------------------------------------------------------------
# Org units (department / cohort / division sub-admin accounts) and their
# calendars. Kept as separate collections from `calendars`/the institute's
# own taxonomy so the existing, already-tested institute path above is
# completely undisturbed -- see plan.md §3.1 for the full design.
# ---------------------------------------------------------------------------


def _get_org_units_collection() -> Collection | None:
    client = _get_client()
    if client is None:
        return None
    db_name = os.getenv("MONGODB_DB_NAME", "academic_calendar")
    return client[db_name]["org_units"]


def _get_org_calendars_collection() -> Collection | None:
    client = _get_client()
    if client is None:
        return None
    db_name = os.getenv("MONGODB_DB_NAME", "academic_calendar")
    return client[db_name]["org_calendars"]


def create_org_unit(name: str, password_hash: str, level: str, parent_id: Optional[str]) -> Optional[dict]:
    """Insert a new department/cohort/division account. Caller (routes/org_units.py)
    already checked the creation permission rule and global password
    uniqueness before calling this -- this is pure persistence."""
    collection = _get_org_units_collection()
    if collection is None:
        return None
    doc = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "level": level,
        "parent_id": parent_id,
        "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc),
    }
    collection.insert_one(dict(doc))
    return doc


def get_org_unit(org_id: str) -> Optional[dict]:
    collection = _get_org_units_collection()
    if collection is None:
        return None
    return collection.find_one({"id": org_id}, {"_id": 0})


def list_org_units(parent_id: Optional[str]) -> list[dict]:
    """A caller's own direct children, oldest first -- deliberately excludes
    `password_hash` (nothing usable would come from it) so this is safe to
    shape straight into OrgUnitSummary without an extra strip step."""
    collection = _get_org_units_collection()
    if collection is None:
        return []
    return list(
        collection.find({"parent_id": parent_id}, {"_id": 0, "password_hash": 0}).sort("created_at", 1)
    )


def list_all_org_units() -> list[dict]:
    """Every org unit, password_hash included -- used only for login role
    detection (checking a submitted password against every stored hash) and
    the global password-uniqueness check at creation time. Never returned
    to a client as-is."""
    collection = _get_org_units_collection()
    if collection is None:
        return []
    return list(collection.find({}, {"_id": 0}))


def update_org_unit_password(org_id: str, password_hash: str) -> bool:
    collection = _get_org_units_collection()
    if collection is None:
        return False
    result = collection.update_one({"id": org_id}, {"$set": {"password_hash": password_hash}})
    return result.matched_count > 0


def org_unit_has_children(org_id: str) -> bool:
    collection = _get_org_units_collection()
    if collection is None:
        return False
    return collection.count_documents({"parent_id": org_id}, limit=1) > 0


def org_unit_owns_any_calendar(org_id: str) -> bool:
    collection = _get_org_calendars_collection()
    if collection is None:
        return False
    return collection.count_documents({"owner_org_id": org_id}, limit=1) > 0


def delete_org_unit(org_id: str) -> tuple[bool, Optional[str]]:
    """Refuses (rather than cascading) if there's any data below this org
    unit -- a child account, or a calendar it owns -- matching the same
    "refuse if real content exists" precedent as remove_academic_year/
    remove_term above. No cascade-delete path exists at all."""
    collection = _get_org_units_collection()
    if collection is None:
        return False, "Persistence is not configured"
    if org_unit_has_children(org_id):
        return False, "This account still has cohorts/divisions under it -- remove those first"
    if org_unit_owns_any_calendar(org_id):
        return False, "This account still owns calendar data -- it cannot be deleted while that exists"
    result = collection.delete_one({"id": org_id})
    if result.deleted_count == 0:
        return False, "No org unit with that id"
    return True, None


def list_org_units_with_publish_status(
    parent_id: Optional[str], academic_year: str, term: str, category: str, admin: bool = False
) -> list[dict]:
    """Direct children of `parent_id` (None = top-level departments) that
    have a customized calendar for this exact (academic_year, term,
    category) slot -- same admin/public split as list_categories: the
    matching parent (or the institute admin) sees every child regardless
    of publish status, so it can navigate into/manage an empty one; anyone
    else only sees children that have actually published something here.
    Powers the drill-down hierarchy browser (plan.md navigation plan)."""
    children = list_org_units(parent_id)
    if admin:
        return children
    if not children:
        return []

    calendars = _get_org_calendars_collection()
    if calendars is None:
        return []
    published_ids = set(
        calendars.distinct(
            "owner_org_id",
            {
                "owner_org_id": {"$in": [c["id"] for c in children]},
                "meta.academic_year": academic_year,
                "meta.term": term,
                "meta.category": category,
                "published": {"$ne": None},
            },
        )
    )
    return [c for c in children if c["id"] in published_ids]


def _org_key(owner_org_id: str, academic_year: str, term: str, category: str) -> dict:
    return {
        "owner_org_id": owner_org_id,
        "meta.academic_year": academic_year,
        "meta.term": term,
        "meta.category": category,
    }


def org_calendar_exists(owner_org_id: str, academic_year: str, term: str, category: str) -> bool:
    """Whether this org unit already has *any* saved calendar (draft or
    published) for this exact key -- used to enforce that copy-from-parent
    is strictly one-time, forever (see routes/org_units.py)."""
    collection = _get_org_calendars_collection()
    if collection is None:
        return False
    return collection.find_one(_org_key(owner_org_id, academic_year, term, category), {"_id": 0}) is not None


def save_org_calendar_draft(owner_org_id: str, draft: CalendarDraft) -> bool:
    """Same upsert-on-just-the-draft-fields shape as save_calendar_draft --
    keyed by (owner_org_id, academic_year, term, category) instead of just
    (academic_year, term, category), so an org unit's edits never touch the
    institute's own document or another org unit's."""
    collection = _get_org_calendars_collection()
    if collection is None:
        return False
    document = draft.model_dump(mode="json", exclude={"is_published", "published_at", "has_unpublished_changes"})
    document["owner_org_id"] = owner_org_id
    document["saved_at"] = datetime.now(timezone.utc).isoformat()
    collection.update_one(
        _org_key(owner_org_id, draft.meta.academic_year, draft.meta.term, draft.meta.category),
        {"$set": document},
        upsert=True,
    )
    return True


def get_org_calendar(owner_org_id: str, academic_year: str, term: str, category: str, admin: bool = False) -> Optional[dict]:
    collection = _get_org_calendars_collection()
    if collection is None:
        return None
    doc = collection.find_one(_org_key(owner_org_id, academic_year, term, category), {"_id": 0})
    if doc is None:
        return None
    return _admin_view(doc) if admin else _public_view(doc)


def publish_org_calendar(owner_org_id: str, academic_year: str, term: str, category: str) -> Optional[dict]:
    collection = _get_org_calendars_collection()
    if collection is None:
        return None
    doc = collection.find_one(_org_key(owner_org_id, academic_year, term, category), {"_id": 0})
    if doc is None:
        return None

    published = {
        "meta": doc["meta"],
        "events": doc["events"],
        "holidays": doc["holidays"],
        "issues": doc.get("issues", []),
        "day_color_overrides": doc.get("day_color_overrides", {}),
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    collection.update_one(_org_key(owner_org_id, academic_year, term, category), {"$set": {"published": published}})
    doc["published"] = published
    return _admin_view(doc)


def unpublish_org_calendar(owner_org_id: str, academic_year: str, term: str, category: str) -> Optional[dict]:
    collection = _get_org_calendars_collection()
    if collection is None:
        return None
    doc = collection.find_one(_org_key(owner_org_id, academic_year, term, category), {"_id": 0})
    if doc is None:
        return None

    collection.update_one(_org_key(owner_org_id, academic_year, term, category), {"$set": {"published": None}})
    doc["published"] = None
    return _admin_view(doc)
