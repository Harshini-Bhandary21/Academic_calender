"""Event-editing agent.

Lets a coordinator move any scheduled event (mid-sem, end-sem, a project
review, ...) to new dates -- and optionally rename it -- after generation,
or add a brand-new event from scratch. Deliberately does not re-validate
here -- the caller (main.py) always re-validates through the same
to_draft() path every other edit uses, so a moved/added event that now
clashes with something else is caught the same way it would be anywhere else.
"""
from datetime import date
from typing import Optional

from .schema import CalendarEvent, NormalizedCalendar

# Distinguishes "the caller didn't pass a color at all" (leave whatever the
# event already has untouched -- e.g. InfoStrip's date/label-only edit,
# which never has a color to send) from "the caller explicitly passed
# color=None" (clear a previously-set custom color back to the family
# default -- e.g. unchecking MilestoneColumn's "Custom color" box). A plain
# `None` default can't tell these apart since both would look identical
# once they reach this function; routes/calendars.py resolves which one
# actually happened via `"color" in req.model_fields_set` and only forwards
# `color=req.color` when the field was really present in the request body.
_UNSET = object()


def reschedule_event(
    cal: NormalizedCalendar, event_id: str, start: date, end: date, label: Optional[str] = None,
    color=_UNSET,
) -> NormalizedCalendar:
    """Move the matching event to new dates, and rename it too if `label`
    is given -- `None` (the default) leaves the existing label untouched.
    `color` has three states: omitted entirely (leave the event's color
    untouched), explicitly `None` (clear a previously-set custom color),
    or a hex string (set it) -- see the `_UNSET` sentinel above.

    Raises ValueError if no event has this id -- the list comprehension
    below would otherwise silently return `cal` unchanged, making a stale
    event_id (e.g. another admin already deleted/replaced it) look like a
    successful move that just didn't do anything.
    """
    if not any(e.id == event_id for e in cal.events):
        raise ValueError(f"No event with id {event_id!r} on this calendar")

    events = [
        CalendarEvent(
            id=e.id, category=e.category, cohort=e.cohort, start=start, end=end,
            label=label if label is not None else e.label,
            color=e.color if color is _UNSET else color,
        )
        if e.id == event_id
        else e
        for e in cal.events
    ]
    return cal.model_copy(update={"events": events})


def add_event(
    cal: NormalizedCalendar, label: str, category: str, cohort: str, start: date, end: date,
    color: Optional[str] = None,
) -> NormalizedCalendar:
    """Append a brand-new event a coordinator created from scratch -- gets
    a fresh id the same way every scheduler-placed event does
    (CalendarEvent.id's default_factory), same pattern as holiday_agent's
    mark_holiday_range appending a new Holiday. `color` is only ever set
    for a Custom-category event with no predefined family to derive a
    color from -- omitted (None) for anything else."""
    new_event = CalendarEvent(category=category, cohort=cohort, start=start, end=end, label=label, color=color)
    return cal.model_copy(update={"events": cal.events + [new_event]})


def remove_event(cal: NormalizedCalendar, event_id: str) -> NormalizedCalendar:
    """Delete a single event by id -- the inverse of add_event.

    Raises ValueError if no event has this id, for the same reason
    reschedule_event does: a stale event_id (someone else already removed
    it) should read as a clear 404, not a silent no-op that looks like it
    worked.
    """
    if not any(e.id == event_id for e in cal.events):
        raise ValueError(f"No event with id {event_id!r} on this calendar")

    return cal.model_copy(update={"events": [e for e in cal.events if e.id != event_id]})


def set_day_color(cal: NormalizedCalendar, day: date, color: Optional[str]) -> NormalizedCalendar:
    """Override which color a specific date displays as in the calendar
    grid -- purely a display resolution for when 2+ holidays/events clash
    on one day (see MonthGrid's color lookup). Never changes any
    underlying holiday/event. `color=None` clears the override, reverting
    that date back to the normal automatic resolution."""
    overrides = dict(cal.day_color_overrides)
    iso = day.isoformat()
    if color is None:
        overrides.pop(iso, None)
    else:
        overrides[iso] = color
    return cal.model_copy(update={"day_color_overrides": overrides})
