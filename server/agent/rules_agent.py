"""Rules / validation agent.

Deterministic checks only -- no LLM here. This is the gate that catches the
kind of mistake a human scheduler (or a generative model) can make: exams
landing on holidays, ranges that end before they start, too few
instructional days, or two exams double-booking the same students. Kept
separate from the generator so every draft is checked the same way
regardless of how it was produced.
"""
from itertools import combinations

from datetime import timedelta

from .rules_helpers import _cohorts_overlap, _ranges_overlap, count_instructional_days
from .schema import NormalizedCalendar, ValidationIssue

MIN_INSTRUCTIONAL_DAYS = 80  # institute/AICTE minimum expected per term
MIN_WEEKS_TO_MID_SEM = 7  # institute policy: Mid-Sem can't start any earlier than this
_EXAM_CATEGORIES = ("mid_sem_exam", "end_sem_exam", "practical_exam")

# Categories where a student could plausibly be double-booked. Other
# milestones (Value Addition Program, AMCAT, Academic Audit, ...) are
# expected to run concurrently with teaching and with each other -- that's
# normal, not a scheduling conflict.
_EXAM_LIKE_CATEGORIES = _EXAM_CATEGORIES + ("project_examination",)


def validate(cal: NormalizedCalendar) -> list[ValidationIssue]:
    """Run all rule checks and return the issues found (empty = clean)."""
    issues: list[ValidationIssue] = []

    if cal.meta.teaching_end < cal.meta.commencement:
        issues.append(ValidationIssue(severity="error", message="teaching_end is before commencement"))
    if cal.meta.term_end < cal.meta.teaching_end:
        issues.append(ValidationIssue(severity="error", message="term_end is before teaching_end"))

    if not cal.holidays:
        issues.append(
            ValidationIssue(
                severity="warning",
                message="No holidays were entered for this calendar -- confirm this is intentional.",
            )
        )

    _, _, inst_days = count_instructional_days(cal)
    if inst_days < MIN_INSTRUCTIONAL_DAYS:
        issues.append(
            ValidationIssue(
                severity="warning",
                message=f"Only {inst_days} instructional days (expected at least {MIN_INSTRUCTIONAL_DAYS})",
            )
        )

    holiday_dates = {h.date for h in cal.holidays}
    for event in cal.events:
        if event.end < event.start:
            issues.append(
                ValidationIssue(severity="error", message=f"{event.category} ({event.cohort}) ends before it starts")
            )
        if event.category in _EXAM_CATEGORIES and event.start in holiday_dates:
            issues.append(
                ValidationIssue(severity="error", message=f"{event.category} starts on a holiday ({event.start})")
            )
        # Only the 3 core exam blocks are required to fit inside term_end --
        # summer internship, re-exams, and the later SLIP review slots
        # genuinely run past it as part of the same academic-year cycle.
        if event.category in _EXAM_CATEGORIES and event.end > cal.meta.term_end:
            issues.append(
                ValidationIssue(
                    severity="error",
                    message=f"{event.category} ends ({event.end}) after term end ({cal.meta.term_end}) -- "
                    "chosen exam durations don't fit inside the fixed term length",
                )
            )

    # Mid-Sem can't start any earlier than 7 weeks after commencement --
    # today's templates already satisfy this (offsets 49/63 days), so this
    # is a safety net against a manual reschedule or future template drift,
    # not a scheduling change.
    min_mid_sem_start = cal.meta.commencement + timedelta(weeks=MIN_WEEKS_TO_MID_SEM)
    for event in cal.events:
        if event.category == "mid_sem_exam" and event.start < min_mid_sem_start:
            issues.append(
                ValidationIssue(
                    severity="error",
                    message=f"Mid-Semester Exam ({event.cohort}) starts ({event.start}) less than "
                    f"{MIN_WEEKS_TO_MID_SEM} weeks after commencement ({cal.meta.commencement})",
                )
            )

    # Final Detention must clear before the Practical Exam starts -- a
    # detained student shouldn't be allowed to sit an exam that's already
    # begun. Catches both a bad manual reschedule and any future drift in
    # the scheduler's day-offset templates.
    practical = next((e for e in cal.events if e.category == "practical_exam" and e.cohort == "ALL"), None)
    if practical is not None:
        for event in cal.events:
            if event.category == "detention_list" and "final" in (event.label or "").lower():
                if event.start >= practical.start:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            message=f"Final Detention ({event.start}) must be scheduled before the "
                            f"Practical Exam starts ({practical.start})",
                        )
                    )

    # Only cross-category overlaps are real clashes -- a sub-slot like the
    # "MDM TY & B.Tech Practical Exam" is *supposed* to fall inside the
    # broader practical_exam window, so same-category overlaps are ignored.
    exam_events = [e for e in cal.events if e.category in _EXAM_LIKE_CATEGORIES]
    for a, b in combinations(exam_events, 2):
        if a.category == b.category:
            continue
        if _cohorts_overlap(a.cohort, b.cohort) and _ranges_overlap(a.start, a.end, b.start, b.end):
            issues.append(
                ValidationIssue(
                    severity="error",
                    message=f"{a.category} ({a.cohort}) clashes with {b.category} ({b.cohort}): "
                    f"{a.start}-{a.end} overlaps {b.start}-{b.end}",
                )
            )

    return issues
