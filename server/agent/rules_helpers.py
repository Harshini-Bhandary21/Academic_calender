"""Small standalone helpers used by rules_agent.py's validate()."""
from datetime import timedelta

from .schema import NormalizedCalendar

_SUNDAY = 6

# Exam blocks that run past teaching_end (Practical/End-Sem-Theory/Project
# Examination) and are still real instructional days -- Mid-Sem is included
# too even though it typically falls *before* teaching_end (already counted
# by the loop below), since counting is set-based, not summed, so an
# already-counted date is never double-counted.
_EXTRA_INSTRUCTIONAL_CATEGORIES = ("mid_sem_exam", "end_sem_exam", "practical_exam", "project_examination")


def _cohorts_overlap(a: str, b: str) -> bool:
    return a == "ALL" or b == "ALL" or a == b


def _ranges_overlap(a_start, a_end, b_start, b_end) -> bool:
    return a_start <= b_end and b_start <= a_end


def count_instructional_days(cal: NormalizedCalendar) -> tuple[int, int, int]:
    """Count distinct instructional days, split into (base, addition, total)
    so the UI can display the published-calendar-style "TOTAL (base+addition)"
    breakdown instead of just one merged number.

    base: every weekday (Mon-Sat) between commencement and teaching_end that
    isn't a holiday -- the "total teaching days" component.

    addition: how many MORE distinct days the Mid-Sem/End-Sem-Theory/
    Practical/Project-Examination windows (Mon-Fri, non-holiday -- even past
    teaching_end) contribute beyond that base. Computed as total-base rather
    than summed independently, so a date already inside base (Mid-Sem
    typically is) is never counted twice.

    total: base + addition, the actual distinct instructional-day count.
    """
    holiday_dates = {h.date for h in cal.holidays}
    days = set()

    current = cal.meta.commencement
    while current <= cal.meta.teaching_end:
        if current.weekday() != _SUNDAY and current not in holiday_dates:
            days.add(current)
        current += timedelta(days=1)
    base = len(days)

    for event in cal.events:
        if event.category not in _EXTRA_INSTRUCTIONAL_CATEGORIES:
            continue
        current = event.start
        while current <= event.end:
            if current.weekday() < 5 and current not in holiday_dates:  # Mon-Fri only
                days.add(current)
            current += timedelta(days=1)

    total = len(days)
    return base, total - base, total
