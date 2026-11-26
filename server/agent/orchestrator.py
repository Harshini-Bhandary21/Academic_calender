"""Pipeline orchestrator.

Wires the narrow agents together: build a NormalizedCalendar by scheduling
from a coordinator's minimal inputs, attach the coordinator's own holidays
(no more backend guessing -- see expand_holidays), then validate the
result. Kept as plain function composition so each stage stays
independently testable and swappable (e.g. scheduler_agent becomes an LLM
call later without touching this file).
"""
from .holiday_agent import expand_holiday_range
from .rules_agent import validate
from .scheduler_agent import plan_calendar
from .schema import CalendarDraft, Holiday, HolidayInput, NormalizedCalendar


def to_draft(cal: NormalizedCalendar) -> CalendarDraft:
    """Wrap a NormalizedCalendar as a CalendarDraft with freshly computed
    validation issues. Shared by every endpoint that edits an existing
    draft (mark/unmark holiday, set a note) so they all re-validate the
    same way."""
    issues = validate(cal)
    return CalendarDraft(
        meta=cal.meta, events=cal.events, holidays=cal.holidays,
        day_color_overrides=cal.day_color_overrides, issues=issues,
    )


def expand_holidays(holiday_inputs: list[HolidayInput]) -> list[Holiday]:
    """Flatten every coordinator-entered holiday/non-instructional range
    into one Holiday per day, deduped by (date, name) across the whole
    list -- an overlapping range and an individually-added day shouldn't
    produce a duplicate row."""
    seen: set[tuple] = set()
    flat: list[Holiday] = []
    for item in holiday_inputs:
        for holiday in expand_holiday_range(item.start, item.end or item.start, item.name, item.family):
            key = (holiday.date, holiday.name)
            if key not in seen:
                seen.add(key)
                flat.append(holiday)
    return flat


def _finalize(draft: NormalizedCalendar, holidays: list[Holiday]) -> CalendarDraft:
    """Attach the coordinator's holidays that actually fall within this
    draft's span, and run rule validation.

    The holiday form pre-fills a whole calendar year of defaults, so a
    Jul-Dec Term I draft would otherwise show Jan-Jun festivals too. The
    span runs from the earliest event (Value Addition genuinely starts
    before commencement) through the latest event end (Term I's re-exam
    cycle runs into January), so nothing that belongs on the sheet is
    dropped."""
    span_start = min([draft.meta.commencement] + [e.start for e in draft.events])
    span_end = max([draft.meta.term_end] + [e.end for e in draft.events])
    draft.holidays = [h for h in holidays if span_start <= h.date <= span_end]
    return to_draft(draft)


def run_plan(
    academic_year: str,
    term: str,
    start,
    mid_sem_exam_days: int,
    end_sem_practical_days: int,
    end_sem_theory_days: int,
    holidays: list[HolidayInput],
    term_weeks: int = 20,
    category: str = "UG Calendar",
) -> CalendarDraft:
    """Produce a validated draft calendar from a coordinator's minimal inputs."""
    flat_holidays = expand_holidays(holidays)
    non_instructional_dates = frozenset(h.date for h in flat_holidays if h.family == "non_instructional")
    draft = plan_calendar(
        academic_year, term, start, mid_sem_exam_days, end_sem_practical_days, end_sem_theory_days,
        non_instructional_dates, term_weeks, category,
    )
    return _finalize(draft, flat_holidays)
