"""Generic date-arithmetic helpers shared by the placement functions.

Nothing here knows about specific milestones -- just weekends, excluded
(non-instructional) dates, and building CalendarEvents from a template.
"""
from datetime import date, timedelta

from ..schema import CalendarEvent
from .templates import _CONFIGURABLE

_SATURDAY, _SUNDAY = 5, 6


def _skip_weekend_to_monday(d: date) -> date:
    """Push a Saturday/Sunday date to the following Monday -- an exam
    shouldn't be scheduled to start on a weekend."""
    if d.weekday() == _SATURDAY:
        return d + timedelta(days=2)
    if d.weekday() == _SUNDAY:
        return d + timedelta(days=1)
    return d


def _skip_excluded_days_block(start: date, count: int, excluded_dates: frozenset) -> date:
    """Push a `count`-day block forward, one day at a time, until none of
    its days fall on a coordinator-flagged non-instructional date -- nothing
    should be scheduled on those, and shifting only the individual excluded
    day would fracture a multi-day exam across a break."""
    while any((start + timedelta(days=i)) in excluded_dates for i in range(count)):
        start += timedelta(days=1)
    return start


def _finalize_gap_start(start: date, duration: int, non_instructional_dates: frozenset) -> date:
    """Resolve a gap-based candidate start into a final one that (a) doesn't
    itself land on a weekend and (b) whose full `duration`-day span doesn't
    touch a non-instructional day -- applied repeatedly since fixing one can
    reintroduce the other (e.g. skipping a weekend can land back inside a
    vacation that extends past it)."""
    while True:
        adjusted = _skip_excluded_days_block(_skip_weekend_to_monday(start), duration, non_instructional_dates)
        if adjusted == start:
            return start
        start = adjusted


def _skip_weekend_and_exclusions_block(start: date, count: int, non_instructional_dates: frozenset) -> date:
    """Push a `count`-day block of individual single-day exams (e.g. Project
    Examinations, one per cohort) forward until none of its days land on a
    weekend or a non-instructional date -- unlike a single multi-day exam
    block, each day here is its own full exam, so each one individually
    must avoid both."""
    while any(
        (start + timedelta(days=i)).weekday() in (_SATURDAY, _SUNDAY) or (start + timedelta(days=i)) in non_instructional_dates
        for i in range(count)
    ):
        start += timedelta(days=1)
    return start


def _last_instructional_day_before(day: date, non_instructional_dates: frozenset) -> date:
    """Walk backward from the day before `day` to the nearest date that is
    neither a Sunday nor a coordinator-flagged non-instructional date --
    e.g. Final Detention belongs on the last real teaching day before the
    Practical Exam, even when a vacation sits directly in between."""
    current = day - timedelta(days=1)
    while current.weekday() == _SUNDAY or current in non_instructional_dates:
        current -= timedelta(days=1)
    return current


def _build_events(commencement: date, template: list, configurable_days: dict) -> list[CalendarEvent]:
    events = []
    for offset, duration, category, cohort, label in template:
        start = commencement + timedelta(days=offset)
        days = configurable_days[category] if duration == _CONFIGURABLE else duration
        end = start + timedelta(days=days - 1)
        events.append(CalendarEvent(category=category, cohort=cohort, start=start, end=end, label=label))
    return events
