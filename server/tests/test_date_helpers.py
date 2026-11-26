"""Unit tests for the pure date-arithmetic helpers in scheduler_agent --
weekend/exclusion-skipping and event-building logic that every exam/
milestone placement in placement.py relies on.

Run from calendar/server: `python -m pytest tests/`
"""
from datetime import date

from agent.scheduler_agent.date_helpers import (
    _build_events,
    _finalize_gap_start,
    _last_instructional_day_before,
    _skip_excluded_days_block,
    _skip_weekend_and_exclusions_block,
    _skip_weekend_to_monday,
)
from agent.scheduler_agent.templates import _CONFIGURABLE


def test_skip_weekend_to_monday_pushes_saturday_and_sunday():
    saturday = date(2026, 1, 3)
    sunday = date(2026, 1, 4)
    assert _skip_weekend_to_monday(saturday) == date(2026, 1, 5)
    assert _skip_weekend_to_monday(sunday) == date(2026, 1, 5)


def test_skip_weekend_to_monday_leaves_weekdays_alone():
    wednesday = date(2026, 1, 7)
    assert _skip_weekend_to_monday(wednesday) == wednesday


def test_skip_excluded_days_block_leaves_clear_block_alone():
    start = date(2026, 1, 5)
    assert _skip_excluded_days_block(start, 2, frozenset()) == start


def test_skip_excluded_days_block_pushes_past_an_excluded_day():
    start = date(2026, 1, 5)  # Monday
    excluded = frozenset({date(2026, 1, 5)})
    # A 1-day block starting on an excluded day pushes forward one day at a
    # time until the block no longer touches an excluded date.
    assert _skip_excluded_days_block(start, 1, excluded) == date(2026, 1, 6)


def test_finalize_gap_start_combines_weekend_and_exclusion_skips():
    # Friday 2026-01-02 is itself excluded -> pushes to Saturday (still
    # excluded-block-clear but now a weekend) -> weekend-skip to Monday.
    friday = date(2026, 1, 2)
    non_instructional = frozenset({friday})
    assert _finalize_gap_start(friday, 1, non_instructional) == date(2026, 1, 5)


def test_finalize_gap_start_is_a_no_op_when_already_valid():
    monday = date(2026, 1, 5)
    assert _finalize_gap_start(monday, 1, frozenset()) == monday


def test_skip_weekend_and_exclusions_block_single_day():
    saturday = date(2026, 1, 3)
    assert _skip_weekend_and_exclusions_block(saturday, 1, frozenset()) == date(2026, 1, 5)


def test_skip_weekend_and_exclusions_block_multi_day_spanning_weekend():
    friday = date(2026, 1, 2)
    # A 2-day block starting Friday touches Saturday -> pushed all the way
    # to the next Mon/Tue, the first 2-day stretch with no weekend day.
    assert _skip_weekend_and_exclusions_block(friday, 2, frozenset()) == date(2026, 1, 5)


def test_last_instructional_day_before_skips_sunday():
    monday = date(2026, 1, 5)
    assert _last_instructional_day_before(monday, frozenset()) == date(2026, 1, 3)


def test_last_instructional_day_before_also_skips_non_instructional_dates():
    monday = date(2026, 1, 5)
    non_instructional = frozenset({date(2026, 1, 3)})
    assert _last_instructional_day_before(monday, non_instructional) == date(2026, 1, 2)


def test_build_events_applies_offsets_and_fixed_durations():
    commencement = date(2026, 7, 27)
    template = [(0, 5, "prototyping_phase", "ALL", "Prototyping Phase 1")]
    events = _build_events(commencement, template, configurable_days={})

    assert len(events) == 1
    event = events[0]
    assert event.start == date(2026, 7, 27)
    assert event.end == date(2026, 7, 31)  # 5-day block: day 0 through day 4
    assert event.category == "prototyping_phase"
    assert event.cohort == "ALL"
    assert event.label == "Prototyping Phase 1"


def test_build_events_uses_configurable_days_for_configurable_entries():
    commencement = date(2026, 7, 27)
    template = [(10, _CONFIGURABLE, "mid_sem_exam", "ALL", "Mid-Sem Exams")]
    events = _build_events(commencement, template, configurable_days={"mid_sem_exam": 6})

    event = events[0]
    assert event.start == date(2026, 8, 6)  # commencement + 10 days
    assert event.end == date(2026, 8, 11)  # 6-day block
