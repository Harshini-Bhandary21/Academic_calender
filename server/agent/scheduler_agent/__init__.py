"""Scheduler agent.

Turns the coordinator's minimal inputs (term, start date, exam durations,
term length) into a full draft calendar -- not just the exam blocks, but
every milestone type MITAOE's real calendars track (feedback, per-cohort
project reviews, prototyping phases, AMCAT, industry practicum, detention
lists, academic audit, re-exams, ...).

Placement is a deterministic heuristic: each milestone's offset (days from
commencement) and duration were read directly off MITAOE's published
2026-27 Term I calendar (commencement Mon 27 Jul 2026, Format No.
ACAD/DI/02) -- Term II now uses the exact same template/structure, just
computed from Term II's own commencement date, since the institute runs
both terms to the same milestone structure. The exam blocks use whatever
duration the coordinator entered instead of the template's original one,
and the core exam chain (Mid-Sem -> Practical -> End-Sem -> Project Exams)
is re-anchored dynamically -- see `placement.py`.
The rules agent -- not this file -- is what catches it if those durations
don't fit inside the coordinator's chosen term length.

Split into sibling modules: `templates.py` (the day-offset template),
`date_helpers.py` (generic weekend/exclusion date arithmetic), and
`placement.py` (the exam-chain repositioning functions) -- this file only
keeps the top-level `plan_calendar()` that wires them together.
"""
from datetime import date, timedelta

from ..schema import NormalizedCalendar, TermMeta
from .date_helpers import _build_events
from .placement import (
    _place_detention_and_makeup_before_practical,
    _place_mdm_practical,
    _place_practical_after_mid_sem,
    _place_project_examinations,
    _sequence_practical_and_theory,
)
from .templates import PROJECT_EXAM_COHORTS, TERM_TEMPLATE


def plan_calendar(
    academic_year: str,
    term: str,
    start: date,
    mid_sem_exam_days: int,
    end_sem_practical_days: int,
    end_sem_theory_days: int,
    non_instructional_dates: frozenset = frozenset(),
    term_weeks: int = 20,
    category: str = "UG Calendar",
) -> NormalizedCalendar:
    """Lay out a full term from a commencement date, exam durations, and the
    coordinator's chosen term length (it varies year to year -- 2025-26 ran
    21 weeks, 2026-27 runs 20). Term I and Term II follow the identical
    milestone structure/sequence -- only the actual commencement date (and
    therefore every date computed from it) differs between them."""
    configurable_days = {
        "mid_sem_exam": mid_sem_exam_days,
        "practical_exam": end_sem_practical_days,
        "end_sem_exam": end_sem_theory_days,
    }

    events = _build_events(start, TERM_TEMPLATE, configurable_days)
    events = _place_practical_after_mid_sem(events, end_sem_practical_days, non_instructional_dates)
    events = _place_detention_and_makeup_before_practical(events, non_instructional_dates)
    events = _sequence_practical_and_theory(events, end_sem_theory_days, non_instructional_dates)
    events = _place_mdm_practical(events)
    events += _place_project_examinations(events, PROJECT_EXAM_COHORTS, non_instructional_dates)

    # The published calendar merges "Teaching End" and "Final Detention
    # List" into one date, so teaching_end follows wherever Final Detention
    # dynamically landed -- the template always includes this entry.
    final_detention = next(e for e in events if e.category == "detention_list" and "final" in (e.label or "").lower())
    teaching_end = final_detention.start

    # -2 for the same Saturday-not-Monday reason: "N weeks" on the published
    # calendar means the term closes on the Saturday of week N (27 Jul 2026
    # + 20 weeks - 2 days = 12 Dec 2026, matching the real document).
    term_end = start + timedelta(weeks=term_weeks) - timedelta(days=2)

    meta = TermMeta(
        academic_year=academic_year,
        term=term,
        category=category,
        commencement=start,
        teaching_end=teaching_end,
        term_end=term_end,
    )

    return NormalizedCalendar(meta=meta, events=events, holidays=[])
