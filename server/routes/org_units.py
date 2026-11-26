"""Department/cohort/division sub-admin accounts, and their own calendars.

One generic "org unit" concept reused at every level below the institute
(see agent/org_units.py + plan.md §3 for the full design) -- so unlike
routes/calendars.py (one specific institute calendar), every route here is
parametrized by whichever org unit the caller's token identifies, and reused
unchanged whether that's a department, a cohort, or a division.
"""
import os
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from agent.auth import require_identity, require_org_unit, optional_role
from agent.db import (
    create_org_unit,
    delete_org_unit,
    get_calendar,
    get_org_calendar,
    get_org_unit,
    list_all_org_units,
    list_org_units,
    list_org_units_with_publish_status,
    org_calendar_exists,
    publish_org_calendar,
    save_org_calendar_draft,
    unpublish_org_calendar,
    update_org_unit_password,
)
from agent.event_agent import add_event, remove_event, reschedule_event, set_day_color
from agent.holiday_agent import mark_holiday_range, remove_holiday, unmark_holiday
from agent.orchestrator import to_draft
from agent.org_units import can_create, hash_password, verify_password
from agent.schema import (
    AddEventRequest,
    CalendarDraft,
    CreateOrgUnitRequest,
    MarkHolidayRequest,
    NormalizedCalendar,
    OrgUnitCreated,
    OrgUnitSummary,
    RemoveEventRequest,
    RemoveHolidayRequest,
    ResetOrgUnitPasswordRequest,
    RescheduleEventRequest,
    SetDayColorRequest,
    UnmarkHolidayRequest,
)

router = APIRouter()


def _caller_org_id(identity: dict) -> str | None:
    """None for the institute admin (a department's parent), otherwise the
    caller's own org_id -- the value a child's `parent_id` must equal for
    that caller to manage it."""
    return None if identity["role"] == "admin" else identity["org_id"]


def _password_taken(password: str, exclude_org_id: str | None = None) -> bool:
    """Global uniqueness check across ADMIN_PASSWORD + every org unit's
    password -- login detects role/identity purely by which password
    matched, so any collision anywhere would be ambiguous."""
    if password == os.getenv("ADMIN_PASSWORD"):
        return True
    return any(
        unit["id"] != exclude_org_id and verify_password(password, unit["password_hash"])
        for unit in list_all_org_units()
    )


def _is_children_owner(identity: dict, parent_id: str | None) -> bool:
    """Whether `identity` is allowed to see every direct child of
    `parent_id` regardless of publish status -- always true for the
    institute admin (same blanket whole-hierarchy oversight it already
    gets from GET /org-units's unrestricted `parent_id`), or for the exact
    org unit that IS `parent_id`. Pulled out as a plain function (no Mongo/
    FastAPI involved) so the permission rule itself is unit-testable
    independent of persistence -- see list_org_calendar_children."""
    if identity["role"] == "admin":
        return True
    return identity["role"] == "org" and identity["org_id"] == parent_id


def _sibling_name_taken(name: str, parent_id: str | None, exclude_org_id: str | None = None) -> bool:
    """A duplicate name among direct siblings would make the parent's own
    child-listing UI ambiguous (which "Div A" is which?) -- cheap to check,
    not requested for security, purely for a sane admin experience."""
    return any(
        u["id"] != exclude_org_id and u["name"].strip().lower() == name.strip().lower()
        for u in list_org_units(parent_id)
    )


@router.post("/org-units", response_model=OrgUnitCreated)
def create_org_unit_endpoint(req: CreateOrgUnitRequest, identity: dict = Depends(require_identity)):
    """Create a child org unit one level below the caller -- the institute
    admin creates departments; a department may create a cohort *or* a
    division directly (the department -> division skip supports the one
    documented edge case, e.g. Humanities and Engineering Sciences (First
    Year), which has no cohort split at all); a cohort may only create a
    division. See agent/org_units.py's ALLOWED_CHILD_LEVELS."""
    caller_level = None if identity["role"] == "admin" else identity["level"]
    if not can_create(caller_level, req.level):
        raise HTTPException(status_code=403, detail=f"A {identity['role']} account may not create a {req.level!r} account")

    parent_id = _caller_org_id(identity)
    if _sibling_name_taken(req.name, parent_id):
        raise HTTPException(status_code=409, detail=f"{req.name!r} already exists here -- names must be unique among siblings")
    if _password_taken(req.password):
        raise HTTPException(status_code=409, detail="This password is already in use -- choose a different one")

    doc = create_org_unit(req.name, hash_password(req.password), req.level, parent_id)
    if doc is None:
        raise HTTPException(status_code=503, detail="Database not configured -- org units require persistence")
    return OrgUnitCreated(**doc, password=req.password)


@router.get("/org-units", response_model=list[OrgUnitSummary])
def list_org_units_endpoint(parent_id: str | None = None, identity: dict = Depends(require_identity)):
    """The caller's own direct children. An org-unit caller can only ever
    list its own children -- the `parent_id` query param is ignored/
    overridden for it, never trusted, so it can't browse a sibling's or
    another department's roster. The institute admin may pass any
    `parent_id` (including omitting it, for the top-level departments) for
    full oversight of the whole hierarchy."""
    if identity["role"] == "org":
        parent_id = identity["org_id"]
    return list_org_units(parent_id)


@router.patch("/org-units/{org_id}", response_model=OrgUnitCreated)
def reset_org_unit_password(org_id: str, req: ResetOrgUnitPasswordRequest, identity: dict = Depends(require_identity)):
    """Reset a direct child's password -- only that child's own direct
    parent (the institute admin for a department, or the owning org unit
    for a cohort/division) may do this."""
    unit = get_org_unit(org_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="No org unit with that id")
    if unit["parent_id"] != _caller_org_id(identity):
        raise HTTPException(status_code=403, detail="You may only manage your own direct children")
    if _password_taken(req.password, exclude_org_id=org_id):
        raise HTTPException(status_code=409, detail="This password is already in use -- choose a different one")

    update_org_unit_password(org_id, hash_password(req.password))
    return OrgUnitCreated(**{**unit, "password": req.password})


@router.delete("/org-units/{org_id}")
def delete_org_unit_endpoint(org_id: str, identity: dict = Depends(require_identity)):
    """Remove a direct child's account -- refuses (409) if it has any
    child of its own or owns any calendar data, per plan.md §5.1. No
    cascade-delete path exists."""
    unit = get_org_unit(org_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="No org unit with that id")
    if unit["parent_id"] != _caller_org_id(identity):
        raise HTTPException(status_code=403, detail="You may only manage your own direct children")

    ok, error = delete_org_unit(org_id)
    if not ok:
        raise HTTPException(status_code=409, detail=error or "Could not delete this account")
    return {"status": "deleted"}


@router.get("/org-units/{org_id}", response_model=OrgUnitSummary)
def get_org_unit_public(org_id: str):
    """Public, unauthenticated lookup of a single org unit's name/level --
    no password-adjacent data at all (same shape as the listing endpoint).
    Powers the hierarchy browser's breadcrumb: given a URL like
    /2026-2027/Term%20I/UG%20Calendar/dept-1/cohort-3, the frontend needs
    to resolve each id to a display name on a fresh page load / shared
    link, without needing to be logged in as anything."""
    unit = get_org_unit(org_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="No org unit with that id")
    return OrgUnitSummary(**unit)


def _after_save_org(org_id: str, draft: CalendarDraft):
    """Same reasoning as routes/calendars.py's _after_save -- re-reads the
    admin view so the response carries accurate publish-status flags."""
    saved = get_org_calendar(org_id, draft.meta.academic_year, draft.meta.term, draft.meta.category, admin=True)
    return saved if saved is not None else draft


def _get_saved_org_calendar(org_id: str, academic_year: str, term: str, category: str) -> dict:
    """The org unit's own currently-saved draft, read fresh from storage --
    the trusted source the _assert_*_editable checks below key off of.
    Every mutation endpoint still saves whatever `req.calendar` the client
    submits (same as every other edit in this app -- the client is the
    source of truth for calendar *content*), but permission-relevant origin
    flags are never trusted from that payload, only from this server-side
    read -- same reasoning as org_id always coming from the JWT, never the
    request body."""
    saved = get_org_calendar(org_id, academic_year, term, category, admin=True)
    if saved is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that org unit/year/term/category")
    return saved


def _assert_event_editable(saved: dict, event_id: str) -> None:
    """Refuses to reschedule/remove an event that arrived via copy-from-
    parent (see CalendarEvent.origin) -- a stale/unknown event_id is left
    to the pure event_agent function's own ValueError -> 404 handling,
    this only blocks a *found*, inherited one."""
    event = next((e for e in saved.get("events", []) if e.get("id") == event_id), None)
    if event is not None and event.get("origin") == "inherited":
        raise HTTPException(
            status_code=403,
            detail="This event was copied from the parent's calendar -- only events this account added itself can be edited or removed.",
        )


def _assert_holiday_editable(saved: dict, holiday_id: str) -> None:
    """Same as _assert_event_editable, for a single holiday by id."""
    holiday = next((h for h in saved.get("holidays", []) if h.get("id") == holiday_id), None)
    if holiday is not None and holiday.get("origin") == "inherited":
        raise HTTPException(
            status_code=403,
            detail="This holiday was copied from the parent's calendar -- only holidays this account added itself can be edited or removed.",
        )


def _assert_no_inherited_holiday_on(saved: dict, day: date) -> None:
    """unmark-holiday clears *every* holiday on a date at once -- refused
    entirely if any of them is inherited, rather than silently only
    clearing the "own" ones, so the outcome is never a surprise."""
    day_iso = day.isoformat()
    if any(h.get("origin") == "inherited" for h in saved.get("holidays", []) if str(h.get("date")) == day_iso):
        raise HTTPException(
            status_code=403,
            detail="This date has a holiday copied from the parent's calendar -- it can't be cleared here; remove your own holidays individually instead.",
        )


def _stamp_inherited(items: list[dict]) -> list[dict]:
    """Marks every event/holiday in `items` (whatever a parent's published
    calendar contains) as "inherited" for whichever org unit is about to
    copy it -- regardless of what each item was tagged as in the parent's
    *own* document (its own "own" additions and anything it in turn
    inherited alike). Re-stamped fresh at every copy step, which is what
    makes the origin rule cascade correctly through an arbitrary-depth
    hierarchy with no per-level special-casing: from the copying org
    unit's perspective, everything that just arrived is equally not
    theirs, however many generations up it originally came from."""
    return [{**item, "origin": "inherited"} for item in items]


def _assert_no_inherited_conflict(saved: dict, start: date, end: date, name: str) -> None:
    """mark-holiday upserts in place (recolors) when a (date, name) pair
    already exists (see holiday_agent.mark_holiday_range) -- refused if
    that would silently rewrite an inherited holiday's family/color."""
    existing_by_key = {(h.get("date"), h.get("name")): h for h in saved.get("holidays", [])}
    day = start
    while day <= end:
        existing = existing_by_key.get((day.isoformat(), name))
        if existing is not None and existing.get("origin") == "inherited":
            raise HTTPException(
                status_code=403,
                detail=f"{name!r} on {day.isoformat()} was copied from the parent's calendar -- it can't be edited here.",
            )
        day += timedelta(days=1)


def _reconcile_origin(saved: dict, calendar: NormalizedCalendar, org_id: str) -> None:
    """Forces every event/holiday's `origin` AND `owner_org_id` in `calendar`
    to match whatever the trusted, freshly-read `saved` draft already says
    for that same id -- regardless of what the client's submitted
    `req.calendar` claims for it.

    The _assert_*_editable checks above only ever validate the ONE item a
    given mutation targets; every OTHER item in the submitted calendar
    still gets persisted as part of the same save (the client stays the
    source of truth for calendar *content*, per _get_saved_org_calendar's
    docstring). Without this, a stale client -- one that fetched this
    calendar before its origin tags were ever correct, or simply one built
    to lie -- could silently launder an inherited item into "own" (or vice
    versa) just by carrying a different tag on any unrelated mutation call,
    e.g. adding one brand-new event ends up re-saving every *other* event
    with whatever origin the client happened to hold for them. Call this
    right before every save, on every org-calendar mutation endpoint, no
    exceptions.

    An id with no match in `saved` at all (a just-created item) always
    becomes origin="own", owner_org_id=`org_id` -- nothing but
    copy-from-parent is ever allowed to produce an "inherited" item, and
    anything freshly added by this org unit is, by definition, owned by it."""
    trusted_events = {e.get("id"): e for e in saved.get("events", [])}
    trusted_holidays = {h.get("id"): h for h in saved.get("holidays", [])}
    for event in calendar.events:
        trusted = trusted_events.get(event.id)
        event.origin = trusted.get("origin") if trusted else "own"
        event.owner_org_id = trusted.get("owner_org_id") if trusted else org_id
    for holiday in calendar.holidays:
        trusted = trusted_holidays.get(holiday.id)
        holiday.origin = trusted.get("origin") if trusted else "own"
        holiday.owner_org_id = trusted.get("owner_org_id") if trusted else org_id


def _resolve_parent_published(unit: dict, academic_year: str, term: str, category: str) -> dict | None:
    """The generic "copy from parent" rule (plan.md §3.1): if this org
    unit's parent_id is None, its parent is the institute itself; otherwise
    its parent is whatever org unit that id refers to -- this never
    inspects the parent's *level*, which is exactly what makes the
    department -> division skip (no cohort in between) work with no
    special-casing at all."""
    parent_id = unit["parent_id"]
    if parent_id is None:
        return get_calendar(academic_year, term, category, admin=False)
    return get_org_calendar(parent_id, academic_year, term, category, admin=False)


@router.get("/org-calendar/{academic_year}/{term}/{category}", response_model=CalendarDraft)
def get_org_calendar_endpoint(
    academic_year: str, term: str, category: str, org_id: str, identity: dict = Depends(optional_role)
):
    """Fetch a specific org unit's calendar. Only that exact org unit
    (authenticated as itself) ever sees its own live draft -- not the
    institute admin, not its parent, not a sibling, nobody else -- everyone
    else only ever gets the last-published snapshot, exactly like the
    institute's own /calendar/{...} route."""
    is_own_draft = identity["role"] == "org" and identity["org_id"] == org_id
    doc = get_org_calendar(org_id, academic_year, term, category, admin=is_own_draft)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that org unit/year/term/category")
    return doc


@router.get("/org-calendar/{academic_year}/{term}/{category}/children", response_model=list[OrgUnitSummary])
def list_org_calendar_children(
    academic_year: str,
    term: str,
    category: str,
    parent_id: str | None = None,
    identity: dict = Depends(optional_role),
):
    """Which org units directly under `parent_id` (omitted/None = the
    institute's own top-level departments) have a customized version of
    this exact calendar slot -- powers the drill-down hierarchy browser.
    Same admin/public split as list_org_calendar_children's sibling
    taxonomy endpoints: the institute admin, or the org unit that IS
    `parent_id`, sees every direct child regardless of publish status (so
    it can navigate into/manage an empty one); everyone else only sees
    ones with something actually published here."""
    return list_org_units_with_publish_status(
        parent_id, academic_year, term, category, admin=_is_children_owner(identity, parent_id)
    )


@router.post("/org-calendar/{academic_year}/{term}/{category}/copy-from-parent", response_model=CalendarDraft)
def copy_from_parent_endpoint(
    academic_year: str, term: str, category: str, org=Depends(require_org_unit())
):
    """Seed a brand-new draft from the parent's published calendar, as-is.
    The copy action itself is strictly one-time, forever (plan.md §5.2):
    409s if this org unit already has *any* saved calendar for this key --
    there is no re-copy or manual overwrite path. What it copied in does
    keep itself in sync afterwards, though: see cascade_publish_to_children,
    which re-stamps and republishes this org unit's inherited items
    automatically every time the parent (or any of *its* ancestors)
    publishes again."""
    org_id, _level = org
    if org_calendar_exists(org_id, academic_year, term, category):
        raise HTTPException(status_code=409, detail="This calendar has already been copied -- copying again is not allowed")

    unit = get_org_unit(org_id)
    parent_view = _resolve_parent_published(unit, academic_year, term, category)
    if parent_view is None:
        raise HTTPException(status_code=404, detail="The parent calendar for that year/term/category hasn't been published yet")

    # See _stamp_inherited's docstring -- this is what the _assert_*
    # helpers above refuse to let this org unit edit/remove, while
    # add-event/mark-holiday still produce fresh "own" entries it can
    # freely edit or delete.
    normalized = NormalizedCalendar(
        meta=parent_view["meta"],
        events=_stamp_inherited(parent_view["events"]),
        holidays=_stamp_inherited(parent_view["holidays"]),
        day_color_overrides=parent_view.get("day_color_overrides", {}),
    )
    draft = to_draft(normalized)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


def cascade_publish_to_children(parent_org_id: str | None, parent_published: dict | None, academic_year: str, term: str, category: str) -> None:
    """After `parent_org_id`'s calendar (None = the institute itself) is
    published, walk every direct child that has already copied a draft for
    this exact (academic_year, term, category) and refresh its inherited
    events/holidays to match what was just published -- each child's own
    items (origin != "inherited") are left untouched, but the old inherited
    set is fully *replaced* rather than merged, so a parent's edit, removal,
    or reschedule all show up correctly instead of just an appended diff
    (same _stamp_inherited re-tagging copy-from-parent already does). The
    refreshed child is then published too, and the same thing repeats for
    its own children -- so a single institute publish can ripple all the
    way down department -> cohort -> division with no manual step at any
    level (accepted tradeoff: if a child's own draft had unrelated
    unpublished edits sitting on it, those get published as a side effect
    too, same as any ordinary manual publish already does today).

    A child that never called copy-from-parent in the first place is
    skipped entirely: there's nothing stored there to refresh, and it'll
    pick up the current parent state whenever it does eventually copy."""
    if parent_published is None:
        return
    for child in list_org_units(parent_org_id):
        child_id = child["id"]
        if not org_calendar_exists(child_id, academic_year, term, category):
            continue
        saved = get_org_calendar(child_id, academic_year, term, category, admin=True)
        own_events = [e for e in saved.get("events", []) if e.get("origin") != "inherited"]
        own_holidays = [h for h in saved.get("holidays", []) if h.get("origin") != "inherited"]
        normalized = NormalizedCalendar(
            meta=parent_published["meta"],
            events=own_events + _stamp_inherited(parent_published["events"]),
            holidays=own_holidays + _stamp_inherited(parent_published["holidays"]),
            day_color_overrides=saved.get("day_color_overrides", {}),
        )
        draft = to_draft(normalized)
        save_org_calendar_draft(child_id, draft)
        child_published = publish_org_calendar(child_id, academic_year, term, category)
        cascade_publish_to_children(child_id, child_published, academic_year, term, category)


@router.post("/org-calendar/{academic_year}/{term}/{category}/publish", response_model=CalendarDraft)
def publish_org_calendar_endpoint(academic_year: str, term: str, category: str, org=Depends(require_org_unit())):
    org_id, _level = org
    doc = publish_org_calendar(org_id, academic_year, term, category)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that org unit/year/term/category")
    cascade_publish_to_children(org_id, doc, academic_year, term, category)
    return doc


@router.post("/org-calendar/{academic_year}/{term}/{category}/unpublish", response_model=CalendarDraft)
def unpublish_org_calendar_endpoint(academic_year: str, term: str, category: str, org=Depends(require_org_unit())):
    org_id, _level = org
    doc = unpublish_org_calendar(org_id, academic_year, term, category)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that org unit/year/term/category")
    return doc


@router.post("/org-calendar/mark-holiday", response_model=CalendarDraft)
def org_mark_holiday(req: MarkHolidayRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    _assert_no_inherited_conflict(saved, req.start, req.end or req.start, req.name)
    updated = mark_holiday_range(req.calendar, req.start, req.end or req.start, req.name, req.family, req.color)
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/unmark-holiday", response_model=CalendarDraft)
def org_unmark_holiday(req: UnmarkHolidayRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    _assert_no_inherited_holiday_on(saved, req.date)
    updated = unmark_holiday(req.calendar, req.date)
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/remove-holiday", response_model=CalendarDraft)
def org_remove_holiday(req: RemoveHolidayRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    _assert_holiday_editable(saved, req.holiday_id)
    try:
        updated = remove_holiday(req.calendar, req.holiday_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/reschedule-event", response_model=CalendarDraft)
def org_reschedule_event(req: RescheduleEventRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    _assert_event_editable(saved, req.event_id)
    # Same _UNSET-sentinel reasoning as routes/calendars.py's reschedule
    # endpoint -- only forward `color` when the request body actually
    # included it, so "field omitted" (leave untouched) and "field
    # explicitly null" (clear it) stay distinguishable.
    color_kwargs = {"color": req.color} if "color" in req.model_fields_set else {}
    try:
        updated = reschedule_event(req.calendar, req.event_id, req.start, req.end, req.label, **color_kwargs)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/add-event", response_model=CalendarDraft)
def org_add_event(req: AddEventRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    updated = add_event(req.calendar, req.label, req.category, req.cohort, req.start, req.end, req.color)
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/remove-event", response_model=CalendarDraft)
def org_remove_event(req: RemoveEventRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    _assert_event_editable(saved, req.event_id)
    try:
        updated = remove_event(req.calendar, req.event_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)


@router.post("/org-calendar/set-day-color", response_model=CalendarDraft)
def org_set_day_color(req: SetDayColorRequest, org=Depends(require_org_unit())):
    org_id, _level = org
    saved = _get_saved_org_calendar(
        org_id, req.calendar.meta.academic_year, req.calendar.meta.term, req.calendar.meta.category
    )
    updated = set_day_color(req.calendar, req.date, req.color)
    _reconcile_origin(saved, updated, org_id)
    draft = to_draft(updated)
    save_org_calendar_draft(org_id, draft)
    return _after_save_org(org_id, draft)
