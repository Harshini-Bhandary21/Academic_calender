"""Reading, generating, and editing a specific (academic_year, term,
category) calendar document.

Registered in main.py *after* routes.taxonomy -- see that module's
docstring for why the generic /calendar/{academic_year}/{term}/{category}
pattern below must not be registered before taxonomy's literal-prefixed
paths.
"""
from fastapi import APIRouter, Depends, HTTPException

from agent.auth import optional_admin, require_admin
from agent.db import (
    delete_calendar,
    get_calendar,
    publish_calendar,
    save_calendar_draft,
    unpublish_calendar,
)
from agent.event_agent import add_event, remove_event, reschedule_event, set_day_color
from agent.holiday_agent import default_odd_sem_start, mark_holiday_range, remove_holiday, unmark_holiday
from agent.orchestrator import run_plan, to_draft
from agent.schema import (
    AddEventRequest,
    CalendarDraft,
    MarkHolidayRequest,
    NormalizedCalendar,
    PlanRequest,
    RemoveEventRequest,
    RemoveHolidayRequest,
    RescheduleEventRequest,
    SetDayColorRequest,
    UnmarkHolidayRequest,
)
from routes.org_units import cascade_publish_to_children

router = APIRouter()


def _after_save(draft: CalendarDraft) -> CalendarDraft | dict:
    """Every mutation endpoint below returns this instead of the bare
    `draft` it just built -- re-reads the admin view so the response
    carries accurate is_published/has_unpublished_changes/published_at
    (the in-memory `draft` object has no way to know those; only the
    stored document does). Falls back to the bare draft when persistence
    isn't configured, so the API still works statelessly."""
    saved = get_calendar(draft.meta.academic_year, draft.meta.term, draft.meta.category, admin=True)
    return saved if saved is not None else draft


@router.get("/calendar/{academic_year}/{term}/{category}", response_model=CalendarDraft)
def get_saved_calendar(academic_year: str, term: str, category: str, is_admin: bool = Depends(optional_admin)):
    """Fetch a specific saved calendar by its (academic_year, term,
    category) key. An admin (valid bearer token) always gets the live
    draft, whatever its publish state; anyone else only gets the last
    *published* snapshot -- a draft that's never been published (or has
    unpublished changes sitting on top of an older published version)
    looks identical to "doesn't exist" from here, which is exactly the
    404 -> EmptyCalendarState path the frontend already has."""
    doc = get_calendar(academic_year, term, category, admin=is_admin)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that year/term/category")
    return doc


@router.delete("/calendar/{academic_year}/{term}/{category}")
def delete_saved_calendar(academic_year: str, term: str, category: str, _: None = Depends(require_admin)):
    """Delete a saved calendar (draft and any published snapshot together)
    by its (academic_year, term, category) key. Use
    /calendar/{...}/unpublish instead to only pull it from public view."""
    deleted = delete_calendar(academic_year, term, category)
    if not deleted:
        raise HTTPException(status_code=404, detail="No saved calendar for that year/term/category")
    return {"status": "deleted"}


@router.post("/calendar/{academic_year}/{term}/{category}/publish", response_model=CalendarDraft)
def publish_saved_calendar(academic_year: str, term: str, category: str, _: None = Depends(require_admin)):
    """Snapshot the current draft into `published`, making it visible to
    public visitors for the first time (or updating what they see, if it
    was already published)."""
    doc = publish_calendar(academic_year, term, category)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that year/term/category")
    # None = the institute is the "parent" of every top-level department
    # (see routes/org_units.py's _caller_org_id) -- see
    # cascade_publish_to_children's docstring for the full rationale.
    cascade_publish_to_children(None, doc, academic_year, term, category)
    return doc


@router.post("/calendar/{academic_year}/{term}/{category}/unpublish", response_model=CalendarDraft)
def unpublish_saved_calendar(academic_year: str, term: str, category: str, _: None = Depends(require_admin)):
    """Pull a calendar back out of public view -- the draft itself (and
    any in-progress edits) is untouched, so it can be published again
    later without redoing anything."""
    doc = unpublish_calendar(academic_year, term, category)
    if doc is None:
        raise HTTPException(status_code=404, detail="No saved calendar for that year/term/category")
    return doc


@router.post("/calendar/save", response_model=CalendarDraft)
def save_calendar(cal: NormalizedCalendar, _: None = Depends(require_admin)):
    """Re-validate and persist an already-built calendar as-is (e.g. restoring an undo snapshot)."""
    draft = to_draft(cal)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/plan", response_model=CalendarDraft)
def plan_calendar_endpoint(req: PlanRequest, _: None = Depends(require_admin)):
    """Build a first draft from a coordinator's minimal inputs: a start date
    (default: last Monday of July) plus the three exam block durations."""
    start = req.start_date or default_odd_sem_start(int(req.academic_year.split("-")[0]))
    draft = run_plan(
        req.academic_year,
        req.term,
        start,
        req.mid_sem_exam_days,
        req.end_sem_practical_days,
        req.end_sem_theory_days,
        req.holidays,
        req.term_weeks,
        req.category,
    )
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/mark-holiday", response_model=CalendarDraft)
def mark_holiday(req: MarkHolidayRequest, _: None = Depends(require_admin)):
    """Mark a day or date range as a holiday on an existing draft and re-validate.

    Term length is fixed at 21 weeks and already budgets for holidays, so
    this never moves term_end -- it only edits the holiday list and
    recomputes derived stats/issues.
    """
    updated = mark_holiday_range(req.calendar, req.start, req.end or req.start, req.name, req.family, req.color)
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/unmark-holiday", response_model=CalendarDraft)
def unmark_holiday_endpoint(req: UnmarkHolidayRequest, _: None = Depends(require_admin)):
    """Remove every holiday on a date from an existing draft's holiday list
    and re-validate. Use /calendar/remove-holiday instead to remove just
    one of several holidays coinciding on the same date."""
    updated = unmark_holiday(req.calendar, req.date)
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/remove-holiday", response_model=CalendarDraft)
def remove_holiday_endpoint(req: RemoveHolidayRequest, _: None = Depends(require_admin)):
    """Delete a single holiday from an existing draft and re-validate --
    same shape as /calendar/remove-event, 404s on an unknown holiday_id."""
    try:
        updated = remove_holiday(req.calendar, req.holiday_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/reschedule-event", response_model=CalendarDraft)
def reschedule_event_endpoint(req: RescheduleEventRequest, _: None = Depends(require_admin)):
    """Move a single event to new dates (and rename it, if `label` is
    given) and re-validate -- if the new dates clash with something else,
    the same rules_agent check that catches any other clash catches this one too.

    `color` is only forwarded when the request body actually included it --
    distinguishing "field omitted" (leave the event's color untouched) from
    "field explicitly null" (clear a previously-set custom color) is what
    reschedule_event's `_UNSET` sentinel default relies on; passing
    `req.color` unconditionally would collapse both cases into "leave
    untouched" and make an admin unable to ever clear a color once set."""
    color_kwargs = {"color": req.color} if "color" in req.model_fields_set else {}
    try:
        updated = reschedule_event(req.calendar, req.event_id, req.start, req.end, req.label, **color_kwargs)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/add-event", response_model=CalendarDraft)
def add_event_endpoint(req: AddEventRequest, _: None = Depends(require_admin)):
    """Create a brand-new event on an existing draft and re-validate --
    same append-then-revalidate-then-persist shape as /calendar/mark-holiday."""
    updated = add_event(req.calendar, req.label, req.category, req.cohort, req.start, req.end, req.color)
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/remove-event", response_model=CalendarDraft)
def remove_event_endpoint(req: RemoveEventRequest, _: None = Depends(require_admin)):
    """Delete a single event from an existing draft and re-validate --
    same shape as /calendar/reschedule-event, 404s on an unknown event_id."""
    try:
        updated = remove_event(req.calendar, req.event_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)


@router.post("/calendar/set-day-color", response_model=CalendarDraft)
def set_day_color_endpoint(req: SetDayColorRequest, _: None = Depends(require_admin)):
    """Override (or, if `color` is omitted, clear) which color a specific
    date displays as -- for resolving a clash when 2+ holidays/events
    overlap one day. Never changes any underlying holiday/event."""
    updated = set_day_color(req.calendar, req.date, req.color)
    draft = to_draft(updated)
    save_calendar_draft(draft)
    return _after_save(draft)
