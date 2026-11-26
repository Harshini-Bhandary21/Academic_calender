"""Unit tests for holiday_agent's remove_holiday and mark_holiday_range's
(date, name) dedup -- specifically that two distinct holidays can coexist
on the same date, and that a stale/unknown holiday_id raises instead of
silently no-op-ing."""
from datetime import date

import pytest

from agent.holiday_agent import mark_holiday_range, remove_holiday
from agent.schema import Holiday, NormalizedCalendar, TermMeta


def _calendar_with_one_holiday():
    meta = TermMeta(
        academic_year="2026-2027",
        term="Term I",
        commencement=date(2026, 7, 27),
        teaching_end=date(2026, 11, 5),
        term_end=date(2026, 12, 12),
    )
    holiday = Holiday(id="real-holiday", date=date(2026, 8, 15), name="Independence Day")
    return NormalizedCalendar(meta=meta, events=[], holidays=[holiday])


def test_remove_holiday_deletes_the_matching_holiday():
    cal = _calendar_with_one_holiday()
    updated = remove_holiday(cal, "real-holiday")

    assert updated.holidays == []


def test_remove_holiday_raises_for_an_unknown_holiday_id():
    cal = _calendar_with_one_holiday()

    with pytest.raises(ValueError):
        remove_holiday(cal, "does-not-exist")


def test_mark_holiday_range_allows_a_second_differently_named_holiday_on_the_same_date():
    cal = _calendar_with_one_holiday()
    updated = mark_holiday_range(cal, date(2026, 8, 15), date(2026, 8, 15), "Parsi New Year")

    names = {h.name for h in updated.holidays}
    assert names == {"Independence Day", "Parsi New Year"}


def test_mark_holiday_range_is_idempotent_for_the_exact_same_date_and_name():
    cal = _calendar_with_one_holiday()
    updated = mark_holiday_range(cal, date(2026, 8, 15), date(2026, 8, 15), "Independence Day")

    assert len(updated.holidays) == 1


def test_mark_holiday_range_updates_color_for_an_already_marked_date_and_name():
    cal = _calendar_with_one_holiday()
    updated = mark_holiday_range(cal, date(2026, 8, 15), date(2026, 8, 15), "Independence Day", color="#ff0000")

    assert len(updated.holidays) == 1
    assert updated.holidays[0].color == "#ff0000"
    assert updated.holidays[0].id == "real-holiday"


def test_mark_holiday_range_updates_family_for_an_already_marked_date_and_name():
    cal = _calendar_with_one_holiday()
    updated = mark_holiday_range(
        cal, date(2026, 8, 15), date(2026, 8, 15), "Independence Day", family="non_instructional"
    )

    assert len(updated.holidays) == 1
    assert updated.holidays[0].family == "non_instructional"
