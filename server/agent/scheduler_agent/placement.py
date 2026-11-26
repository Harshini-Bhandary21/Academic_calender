"""The core exam chain: Mid-Sem -> Practical -> End-Sem -> Project Exams.

Both terms follow the same fixed sequence -- Mid-Sem, then Practical Exam,
then End-Semester Exam, then Project Examinations -- each anchored to the
previous block's *actual* end (or, for Practical, Mid-Sem's actual end)
rather than a template offset, so a shorter/longer coordinator-chosen
duration -- or a coordinator-entered vacation -- never leaves a stale gap
behind. Final Detention and Make-up/Remedial anchor *backward* from
Practical's actual start (see _place_detention_and_makeup_before_practical).
"""
from datetime import timedelta

from ..schema import CalendarEvent
from .date_helpers import (
    _finalize_gap_start,
    _last_instructional_day_before,
    _skip_weekend_and_exclusions_block,
)

_PRACTICAL_TO_THEORY_GAP_DAYS = 1
_THEORY_TO_PROJECT_EXAM_GAP_DAYS = 1
# Practical Exam starts exactly this many weeks after the latest Mid-Sem
# exam ends (institute policy) -- a coordinator-flagged non-instructional
# block (e.g. a Diwali break) that the raw 7-week mark lands inside isn't
# routed around first; the weekend/exclusion push applied to the resulting
# candidate (_finalize_gap_start) already carries it past the block.
_MID_SEM_TO_PRACTICAL_WEEKS = 7


def _place_practical_after_mid_sem(
    events: list[CalendarEvent], practical_days: int, non_instructional_dates: frozenset
) -> list[CalendarEvent]:
    """Practical Exam starts _MID_SEM_TO_PRACTICAL_WEEKS weeks after the
    latest Mid-Sem exam ends, replacing the template's fixed offset -- which
    otherwise has no idea where Mid-Sem or a coordinator-entered vacation
    actually landed. Nothing should be scheduled on a non-instructional day,
    so the whole practical_days span (not just its start) is checked and
    pushed clear of both weekends and non-instructional dates -- see
    _finalize_gap_start. A non-instructional block that the raw 7-week mark
    lands inside (e.g. a Diwali break) isn't a delay to route around first;
    the same weekend/exclusion push that clears the block's start also
    carries it past the break, matching the published calendar.
    """
    mid_sem_ends = [e.end for e in events if e.category == "mid_sem_exam"]
    practical = next((e for e in events if e.category == "practical_exam" and e.cohort == "ALL"), None)
    if not mid_sem_ends or practical is None:
        return events

    candidate = max(mid_sem_ends) + timedelta(weeks=_MID_SEM_TO_PRACTICAL_WEEKS)
    new_start = _finalize_gap_start(candidate, practical_days, non_instructional_dates)
    replacement = CalendarEvent(
        category="practical_exam", cohort="ALL", start=new_start,
        end=new_start + timedelta(days=practical_days - 1), label=practical.label,
    )
    return [replacement if (e.category == "practical_exam" and e.cohort == "ALL") else e for e in events]


def _place_detention_and_makeup_before_practical(
    events: list[CalendarEvent], non_instructional_dates: frozenset
) -> list[CalendarEvent]:
    """Both terms (the same template builds both now): Final Detention lands
    on the *last instructional day* before the Practical Exam starts --
    walking backward over Sundays and
    any coordinator-entered vacation in between, exactly like the published
    calendar (Final Detention 5 Nov | vacation 6-15 Nov | Practical 16 Nov).
    Make-up/Remedial Sessions keeps its template duration and ends on that
    same Final Detention day. Both anchor to Practical's *actual* start
    instead of fixed template offsets, which have no idea where Practical
    really landed."""
    practical = next((e for e in events if e.category == "practical_exam" and e.cohort == "ALL"), None)
    final_detention = next((e for e in events if e.category == "detention_list" and "final" in (e.label or "").lower()), None)
    makeup = next((e for e in events if e.category == "makeup_remedial_sessions"), None)
    if practical is None or final_detention is None or makeup is None:
        return events

    detention_day = _last_instructional_day_before(practical.start, non_instructional_dates)
    makeup_days = (makeup.end - makeup.start).days + 1
    makeup_start = detention_day - timedelta(days=makeup_days - 1)

    def replace(event):
        if event is final_detention:
            return CalendarEvent(
                id=event.id, category=event.category, cohort=event.cohort,
                start=detention_day, end=detention_day, label=event.label,
            )
        if event is makeup:
            return CalendarEvent(
                id=event.id, category=event.category, cohort=event.cohort,
                start=makeup_start, end=detention_day, label=event.label,
            )
        return event

    return [replace(event) for event in events]


def _sequence_practical_and_theory(
    events: list[CalendarEvent], theory_days: int, non_instructional_dates: frozenset
) -> list[CalendarEvent]:
    """Place the End-Semester (theory) Exam starting the day after the
    Practical Exam's actual end (_PRACTICAL_TO_THEORY_GAP_DAYS) -- not just
    "at least" this many, so a shorter/longer coordinator-chosen practical
    duration doesn't leave a growing/shrinking gap. The whole theory_days
    span is then pushed clear of weekends (at the start) and
    non-instructional dates (throughout) -- see _finalize_gap_start.
    """
    practical = next((e for e in events if e.category == "practical_exam" and e.cohort == "ALL"), None)
    theory = next((e for e in events if e.category == "end_sem_exam"), None)
    if practical is None or theory is None:
        return events

    candidate = practical.end + timedelta(days=_PRACTICAL_TO_THEORY_GAP_DAYS)
    new_start = _finalize_gap_start(candidate, theory_days, non_instructional_dates)
    replacement = CalendarEvent(
        category="end_sem_exam", cohort=theory.cohort, start=new_start,
        end=new_start + timedelta(days=theory_days - 1), label=theory.label,
    )
    return [replacement if e.category == "end_sem_exam" else e for e in events]


def _place_mdm_practical(events: list[CalendarEvent]) -> list[CalendarEvent]:
    """Both terms have an MDM TY & B.Tech Practical Exam: a single day on
    the main practical block's *final* day, matching the published calendar
    (Practical 16-26 Nov, MDM 26 Nov) -- anchored to the block's actual
    dates so it can't drift outside the window the coordinator configured.
    """
    practical = next((e for e in events if e.category == "practical_exam" and e.cohort == "ALL"), None)
    if practical is None:
        return events
    return events + [
        CalendarEvent(
            category="practical_exam", cohort="TY_BTECH",
            start=practical.end, end=practical.end, label="MDM TY and B.Tech Practical Exam",
        )
    ]


def _place_project_examinations(
    events: list[CalendarEvent], cohorts: list[str], non_instructional_dates: frozenset
) -> list[CalendarEvent]:
    """Project Examinations run one day per cohort, starting the day after
    the End-Semester Exam's actual end (_THEORY_TO_PROJECT_EXAM_GAP_DAYS) --
    anchored dynamically so a longer/shorter coordinator-chosen theory
    duration doesn't leave a stale fixed date behind. Each cohort's
    day is its own full exam, so each individually must avoid landing on a
    weekend or a non-instructional date -- if any does, the whole block
    shifts forward together (see _skip_weekend_and_exclusions_block)."""
    theory = next((e for e in events if e.category == "end_sem_exam"), None)
    if theory is None:
        return events
    first_start = theory.end + timedelta(days=_THEORY_TO_PROJECT_EXAM_GAP_DAYS)
    first_start = _skip_weekend_and_exclusions_block(first_start, len(cohorts), non_instructional_dates)
    return [
        CalendarEvent(
            category="project_examination",
            cohort=cohort,
            start=first_start + timedelta(days=i),
            end=first_start + timedelta(days=i),
            label=f"{cohort} Project Examination",
        )
        for i, cohort in enumerate(cohorts)
    ]
