"""Unit tests for event_agent's reschedule_event/remove_event/set_day_color
-- specifically that a stale/unknown event_id raises instead of silently
returning the calendar unchanged (which used to look like a successful
move/removal that did nothing)."""
from datetime import date

import pytest

from agent.event_agent import remove_event, reschedule_event, set_day_color
from agent.schema import CalendarEvent, NormalizedCalendar, TermMeta


def _calendar_with_one_event():
    meta = TermMeta(
        academic_year="2026-2027",
        term="Term I",
        commencement=date(2026, 7, 27),
        teaching_end=date(2026, 11, 5),
        term_end=date(2026, 12, 12),
    )
    event = CalendarEvent(id="real-event", category="mid_sem_exam", start=date(2026, 9, 21), end=date(2026, 9, 28), label="Mid-Sem Exams")
    return NormalizedCalendar(meta=meta, events=[event], holidays=[])


def test_reschedule_event_moves_the_matching_event():
    cal = _calendar_with_one_event()
    updated = reschedule_event(cal, "real-event", date(2026, 9, 22), date(2026, 9, 29))

    assert updated.events[0].start == date(2026, 9, 22)
    assert updated.events[0].end == date(2026, 9, 29)


def test_reschedule_event_raises_for_an_unknown_event_id():
    cal = _calendar_with_one_event()

    with pytest.raises(ValueError):
        reschedule_event(cal, "does-not-exist", date(2026, 9, 22), date(2026, 9, 29))


def test_reschedule_event_leaves_color_untouched_when_omitted():
    cal = _calendar_with_one_event()
    cal = cal.model_copy(update={"events": [cal.events[0].model_copy(update={"color": "#00ff00"})]})

    updated = reschedule_event(cal, "real-event", date(2026, 9, 22), date(2026, 9, 29))

    assert updated.events[0].color == "#00ff00"


def test_reschedule_event_sets_a_new_color_when_given_one():
    cal = _calendar_with_one_event()
    updated = reschedule_event(cal, "real-event", date(2026, 9, 22), date(2026, 9, 29), color="#00ff00")

    assert updated.events[0].color == "#00ff00"


def test_reschedule_event_clears_an_existing_color_when_explicitly_passed_none():
    cal = _calendar_with_one_event()
    cal = cal.model_copy(update={"events": [cal.events[0].model_copy(update={"color": "#00ff00"})]})

    updated = reschedule_event(cal, "real-event", date(2026, 9, 22), date(2026, 9, 29), color=None)

    assert updated.events[0].color is None


def test_remove_event_deletes_the_matching_event():
    cal = _calendar_with_one_event()
    updated = remove_event(cal, "real-event")

    assert updated.events == []


def test_remove_event_raises_for_an_unknown_event_id():
    cal = _calendar_with_one_event()

    with pytest.raises(ValueError):
        remove_event(cal, "does-not-exist")


def test_set_day_color_adds_an_override():
    cal = _calendar_with_one_event()
    updated = set_day_color(cal, date(2026, 9, 21), "#ff0000")

    assert updated.day_color_overrides == {"2026-09-21": "#ff0000"}


def test_set_day_color_with_none_clears_an_existing_override():
    cal = _calendar_with_one_event().model_copy(update={"day_color_overrides": {"2026-09-21": "#ff0000"}})
    updated = set_day_color(cal, date(2026, 9, 21), None)

    assert updated.day_color_overrides == {}


def test_set_day_color_with_none_is_a_no_op_when_nothing_was_overridden():
    cal = _calendar_with_one_event()
    updated = set_day_color(cal, date(2026, 9, 21), None)

    assert updated.day_color_overrides == {}
