"""Holiday-sourcing agent.

This agent is the single place that decides "what are this year's holiday
dates" -- swap the tables in `data.py` for a real government-calendar API or
a verified LLM lookup without touching any other agent.
"""
from datetime import date, timedelta
from typing import Optional

from ..schema import Holiday, HolidayInput, NormalizedCalendar
from .data import FIXED_HOLIDAYS, VERIFIED_MOVABLE_HOLIDAYS


def fetch_holidays(year: int) -> list[Holiday]:
    """Return known holidays for `year`: fixed-date ones always, plus
    verified movable festivals for years we've cross-checked against a real
    institute calendar (see data.VERIFIED_MOVABLE_HOLIDAYS).

    Two distinct holidays can genuinely land on the same date (e.g.
    Maharashtra Din and Budha Pournima both fall on 1 May 2026), so
    de-duplication is keyed on (date, name), not date alone -- otherwise a
    coincidental overlap would silently drop a real holiday.
    """
    holidays = [Holiday(date=date(year, month, day), name=name) for month, day, name in FIXED_HOLIDAYS]

    seen = {(h.date, h.name) for h in holidays}
    for entry in VERIFIED_MOVABLE_HOLIDAYS.get(year, []):
        if len(entry) == 3:
            month, day, name = entry
            dates = [date(year, month, day)]
        else:
            start_month, start_day, end_month, end_day, name = entry
            start, end = date(year, start_month, start_day), date(year, end_month, end_day)
            dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        for holiday_date in dates:
            if (holiday_date, name) not in seen:
                holidays.append(Holiday(date=holiday_date, name=name))
                seen.add((holiday_date, name))

    return sorted(holidays, key=lambda h: h.date)


def default_odd_sem_start(year: int) -> date:
    """The last Monday of July `year` -- the institute's default odd-semester
    commencement date. The UI still lets a coordinator override this."""
    july_31 = date(year, 7, 31)
    days_since_monday = july_31.weekday()  # Monday == 0
    return july_31 - timedelta(days=days_since_monday)


def expand_holiday_range(
    start: date, end: date, name: str, family: str = "holiday", color: Optional[str] = None
) -> list[Holiday]:
    """Turn a [start, end] range into one Holiday per day -- a single date
    produces one entry, a week-long range (e.g. Diwali vacation) produces
    one per day. Pure expansion only; callers own their own dedup rules
    (mark_holiday_range and the upfront coordinator-input path need
    different ones -- see each caller)."""
    holidays = []
    day = start
    while day <= end:
        holidays.append(Holiday(date=day, name=name, family=family, color=color))
        day += timedelta(days=1)
    return holidays


def mark_holiday_range(
    cal: NormalizedCalendar, start: date, end: date, name: str, family: str = "holiday", color: Optional[str] = None
) -> NormalizedCalendar:
    """Add every day in [start, end] as a holiday -- a single date marks one
    day, a week-long range marks a whole week (e.g. Diwali vacation).

    `family` picks which color the frontend renders this as (see
    categoryColors.js FAMILIES) -- defaults to the ordinary "holiday" color,
    but a coordinator can mark a non-instructional block (e.g. Diwali) under
    a different family so it doesn't look like a real holiday. `color` is an
    explicit override on top of that, only ever set when a coordinator picks
    a specific color while editing (see MilestoneColumn's Non-Instructional
    range editor) rather than accepting whatever `family` normally renders as.

    Two distinct holidays can genuinely land on the same date (see
    fetch_holidays' own docstring) -- de-duplication is keyed on
    (date, name), not date alone, so marking a second, differently-named
    holiday on an already-used date isn't silently dropped. Re-marking the
    exact same (date, name) with an identical family/color is still a
    true no-op, matching upsert-style idempotency elsewhere in this app --
    but re-marking it with a *different* family/color updates that holiday
    in place (keeping its id) instead of being silently discarded. There's
    no separate "edit an existing holiday" endpoint, so re-marking the same
    name with a new color is how a coordinator actually recolors one from
    the UI (see MilestoneColumn/HolidayColumn's "+ Add"/color picker) --
    dropping it purely because the (date, name) key already existed used
    to make that edit vanish without any error.

    Term length is fixed at 21 weeks and already budgets for holidays, so
    this only ever edits `holidays`; term_end is never touched here.
    """
    holidays = list(cal.holidays)
    by_key = {(h.date, h.name): h for h in holidays}

    for candidate in expand_holiday_range(start, end, name, family, color):
        key = (candidate.date, candidate.name)
        existing = by_key.get(key)
        if existing is None:
            holidays.append(candidate)
            by_key[key] = candidate
        elif existing.family != family or existing.color != color:
            updated = existing.model_copy(update={"family": family, "color": color})
            holidays = [updated if h is existing else h for h in holidays]
            by_key[key] = updated

    return cal.model_copy(update={"holidays": holidays})


def suggested_holiday_defaults(year: int) -> list[HolidayInput]:
    """Suggested starting rows for the coordinator's upfront holiday-input
    form: fixed-date holidays with their real computed dates, plus
    movable-festival ranges for years we've actually verified (see
    data.VERIFIED_MOVABLE_HOLIDAYS) -- omitted entirely for other years
    rather than guessed. Returned in native range form (a Diwali week stays
    one row, not seven) so the form doesn't need to re-group expanded days.

    A handful of movable festivals (e.g. Republic Day in some years) can
    coincide with a fixed-date one -- deduped on (start, name), same as
    fetch_holidays(), so it doesn't show up twice.
    """
    suggestions = [HolidayInput(name=name, start=date(year, month, day)) for month, day, name in FIXED_HOLIDAYS]
    seen = {(h.start, h.name) for h in suggestions}

    for entry in VERIFIED_MOVABLE_HOLIDAYS.get(year, []):
        if len(entry) == 3:
            month, day, name = entry
            item = HolidayInput(name=name, start=date(year, month, day))
        else:
            start_month, start_day, end_month, end_day, name = entry
            item = HolidayInput(name=name, start=date(year, start_month, start_day), end=date(year, end_month, end_day))
        if (item.start, item.name) not in seen:
            seen.add((item.start, item.name))
            suggestions.append(item)

    return sorted(suggestions, key=lambda h: h.start)


def unmark_holiday(cal: NormalizedCalendar, day: date) -> NormalizedCalendar:
    """Remove every holiday entry on `day` (there can be more than one, e.g.
    two festivals coinciding) from an existing draft. Use remove_holiday()
    instead to remove just one of several coinciding holidays."""
    holidays = [h for h in cal.holidays if h.date != day]
    return cal.model_copy(update={"holidays": holidays})


def remove_holiday(cal: NormalizedCalendar, holiday_id: str) -> NormalizedCalendar:
    """Delete a single holiday by id -- the surgical alternative to
    unmark_holiday() when a date has more than one coinciding holiday and
    only one of them should go.

    Raises ValueError if no holiday has this id, same reasoning as
    event_agent.remove_event: a stale id should read as a clear 404, not a
    silent no-op that looks like it worked.
    """
    if not any(h.id == holiday_id for h in cal.holidays):
        raise ValueError(f"No holiday with id {holiday_id!r} on this calendar")

    return cal.model_copy(update={"holidays": [h for h in cal.holidays if h.id != holiday_id]})
