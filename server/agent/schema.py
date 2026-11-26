"""Shared data models passed between agents and returned by the API.

Every agent reads/writes these shapes so the pipeline stages stay
independent of each other and of whatever spreadsheet layout the data
originally came from.
"""
import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


def _short_id() -> str:
    return uuid.uuid4().hex[:8]


class Holiday(BaseModel):
    # Stable across edits so the frontend can key/dedup a specific holiday
    # row without relying on (date, name) staying unique.
    id: str = Field(default_factory=_short_id)
    date: date
    name: str
    # Which color family this displays as on the frontend (see
    # categoryColors.js FAMILIES) -- e.g. a real holiday vs. a
    # non-instructional day like the Diwali break, which the institute's
    # own calendars color differently from an actual holiday.
    family: str = "holiday"
    # An explicit per-range color override, chosen when editing (e.g. a
    # Non-Instructional range) -- takes precedence over the family-derived
    # color when set; None means "use whatever `family` normally renders as".
    color: Optional[str] = None
    # "own" (the default) for anything a coordinator added themselves;
    # "inherited" for anything that arrived via copy-from-parent (see
    # routes/org_units.py's copy_from_parent_endpoint, which stamps every
    # copied holiday with this regardless of what it was tagged as in the
    # parent's own document -- re-tagged fresh at each copy step). Only
    # meaningful for org-unit calendars, which are the only ones with a
    # parent to copy from at all; the institute's own calendar never sets
    # this to anything but the default. Enforced server-side against the
    # saved draft, never trusted from a client-submitted value -- see
    # routes/org_units.py's _assert_*_editable helpers.
    origin: str = "own"
    # Which org unit originally created this item -- None for the institute
    # itself, otherwise the org_id that had it as "own" at the moment it was
    # added. Unlike `origin` (which is relative to whoever is currently
    # looking -- "inherited" the instant it's copied even one level down),
    # this is stamped once at creation and never touched again, including
    # by copy-from-parent or cascade_publish_to_children, both of which
    # preserve it via a plain dict spread. This is what lets the frontend
    # render one "{org name} Calendar" block per ancestor level (department,
    # cohort, ...) instead of collapsing everything non-institute into one
    # anonymous "inherited" bucket -- see routes/org_units.py's
    # _reconcile_origin, the only place this is ever set/trusted server-side.
    owner_org_id: Optional[str] = None


class CalendarEvent(BaseModel):
    # Stable across edits so the frontend can target a specific event (e.g.
    # to reschedule it) without relying on category+cohort+label staying unique.
    id: str = Field(default_factory=_short_id)
    category: str  # e.g. "mid_sem_exam", "practical_exam", "project_review"
    cohort: str = "ALL"  # e.g. "SY", "TY", "BTech", "ALL"
    start: date
    end: date
    label: Optional[str] = None
    # Only ever set for a coordinator-typed Custom-category event -- every
    # other event derives its color from `category` (see the frontend's
    # familyKeyForCategory) and leaves this unset, so this is purely an
    # override for events that don't fit any predefined family.
    color: Optional[str] = None
    # Same "own" vs "inherited" distinction as Holiday.origin above -- see
    # that field's docstring.
    origin: str = "own"
    # Same as Holiday.owner_org_id above -- see that field's docstring.
    owner_org_id: Optional[str] = None


class TermMeta(BaseModel):
    academic_year: str  # e.g. "2026-2027"
    term: str  # "Term I" or "Term II"
    # Which calendar variant this is within its (academic_year, term) --
    # e.g. "UG Calendar", "PG Calendar", "FY Calendar". Defaults to the one
    # category that existed before this field was introduced.
    category: str = "UG Calendar"
    commencement: date
    teaching_end: date
    term_end: date


class NormalizedCalendar(BaseModel):
    """Common shape every historical calendar is converted into, regardless
    of its original spreadsheet layout."""

    meta: TermMeta
    events: list[CalendarEvent] = Field(default_factory=list)
    holidays: list[Holiday] = Field(default_factory=list)
    # Per-date display override, keyed by ISO date string -- only ever set
    # when an admin resolves a color clash (2+ holidays/events overlapping
    # one day) by explicitly picking which one's color should render for
    # that day in the calendar grid. Purely cosmetic: never changes any
    # underlying holiday/event, and the normal automatic resolution is
    # untouched for any date with no override.
    day_color_overrides: dict[str, str] = Field(default_factory=dict)


class HolidayInput(BaseModel):
    """A single holiday or non-instructional range a coordinator enters
    before generation -- start/end (a single day if end is omitted), a
    name, and which color family it should display as."""

    name: str
    start: date
    end: Optional[date] = None
    family: str = "holiday"


class PlanRequest(BaseModel):
    """The minimal set of fields a coordinator fills in to get a first draft."""

    academic_year: str  # e.g. "2026-2027"
    term: str = "Term I"
    category: str = "UG Calendar"  # which calendar variant within this (academic_year, term)
    start_date: Optional[date] = None  # None -> default to the last Monday of July
    mid_sem_exam_days: int = 6
    end_sem_practical_days: int = 10
    end_sem_theory_days: int = 10
    # Total term length varies year to year (2025-26 ran 21 weeks, 2026-27
    # runs 20), so it's coordinator input, not a hardcoded constant.
    term_weeks: int = 20
    holidays: list[HolidayInput] = Field(default_factory=list)


class MarkHolidayRequest(BaseModel):
    """Mark a single day, or a whole date range (e.g. Diwali week), as a holiday on an existing draft."""

    calendar: NormalizedCalendar
    start: date
    end: Optional[date] = None  # None -> only `start` is marked
    name: str
    family: str = "holiday"
    color: Optional[str] = None


class UnmarkHolidayRequest(BaseModel):
    """Remove every holiday on a single date from an existing draft's
    holiday list -- use RemoveHolidayRequest instead to remove just one of
    several coinciding holidays."""

    calendar: NormalizedCalendar
    date: date


class RemoveHolidayRequest(BaseModel):
    """Delete a single holiday (identified by its id) from an existing draft."""

    calendar: NormalizedCalendar
    holiday_id: str


class SetDayColorRequest(BaseModel):
    """Override (or clear, if `color` is omitted) which color a specific
    calendar date displays as -- for resolving a clash when 2+ holidays/
    events overlap one day and the automatic pick isn't the one wanted."""

    calendar: NormalizedCalendar
    date: date
    color: Optional[str] = None


class RescheduleEventRequest(BaseModel):
    """Move a single event (identified by its id) to new dates, and
    optionally rename it -- omitting `label` leaves the existing one as-is."""

    calendar: NormalizedCalendar
    event_id: str
    start: date
    end: date
    label: Optional[str] = None
    # Same convention as label -- omitting this (None) leaves whatever
    # color the event already has untouched, rather than clearing it.
    color: Optional[str] = None


class AddEventRequest(BaseModel):
    """Create a brand-new event on an existing draft."""

    calendar: NormalizedCalendar
    label: str
    category: str
    cohort: str = "ALL"
    start: date
    end: date
    color: Optional[str] = None


class RemoveEventRequest(BaseModel):
    """Delete a single event (identified by its id) from an existing draft."""

    calendar: NormalizedCalendar
    event_id: str


class AddAcademicYearRequest(BaseModel):
    """Explicitly declare a new academic year (optionally scoped to only
    some terms) so it appears in the sidebar before any calendar has been
    generated for it -- see db.py's add_academic_year."""

    academic_year: str
    terms: list[str] = Field(default_factory=lambda: ["Term I", "Term II"])


class AddTermRequest(BaseModel):
    """Add a single term to a (possibly not-yet-declared) academic year."""

    term: str


class ValidationIssue(BaseModel):
    severity: str  # "error" | "warning"
    message: str


class CreateOrgUnitRequest(BaseModel):
    """Create a child org unit one level below the caller (institute admin
    creates a department; a department creates a cohort or a division --
    see org_units.py's ALLOWED_CHILD_LEVELS; a cohort creates a division).
    `level` is required here (not inferred) since a department is allowed
    to create either a cohort or a division directly -- see the
    Humanities and Engineering Sciences (First Year) edge case, which has
    no cohort split at all."""

    name: str
    password: str
    level: str  # "department" | "cohort" | "division"


class ResetOrgUnitPasswordRequest(BaseModel):
    password: str


class OrgUnitCreated(BaseModel):
    """Response for create/reset-password -- echoes the plaintext password
    the caller just typed (never re-derived from storage, which only ever
    holds a hash) so the admin UI can display/reveal it for this session."""

    id: str
    name: str
    level: str
    parent_id: Optional[str] = None
    created_at: datetime
    password: str


class OrgUnitSummary(BaseModel):
    """A child org unit as listed to its parent -- deliberately has no
    password field at all: the database only ever stores a hash, so there
    is nothing to return for something created in an earlier session (see
    OrgUnitCreated for the one place a real password value is ever sent).

    `parent_id` is included (unlike the password) because it's how the
    frontend walks a division/cohort up to its department to build the
    document header's "SY-A Computer Engineering"-style label (see
    useOrgAncestry.js) -- None means this unit's parent is the institute
    itself (i.e. it's a department)."""

    id: str
    name: str
    level: str
    parent_id: Optional[str] = None
    created_at: datetime


class CalendarDraft(NormalizedCalendar):
    """A generated calendar plus whatever the rules agent flagged on it.

    Publish status is read-only/computed by db.py from the stored
    document -- an admin always sees/edits the live draft (this shape),
    while a public visitor only ever receives the last-published snapshot
    (see db.py's _admin_view/_public_view). Editing an already-published
    calendar does NOT change what the public sees until it's published
    again.
    """

    issues: list[ValidationIssue] = Field(default_factory=list)
    is_published: bool = False
    published_at: Optional[datetime] = None
    has_unpublished_changes: bool = False
