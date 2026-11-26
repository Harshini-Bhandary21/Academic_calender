"""Day-offset template used to build a term's milestones.

Each entry: (day_offset_from_commencement, duration_days, category,
cohort, label). Offsets/durations were read directly off MITAOE's own
published 2026-27 Term I calendar (commencement Monday 27 Jul 2026, Format
No. ACAD/DI/02) -- the same template now builds Term II too, computed from
Term II's own commencement date, since the institute runs both terms to
this same milestone structure.
"""

# Marks a template entry whose duration comes from the coordinator's input
# (keyed by category) instead of a fixed number of days.
_CONFIGURABLE = "configurable"
# Value Addition genuinely starts a week BEFORE commencement (20 Jul) --
# a negative offset is real, not a bug. Entries marked "placeholder" below
# are always repositioned dynamically (see the sequence note in
# `placement.py`).
TERM_TEMPLATE = [
    (-7, 34, "value_addition_program", "ALL", "Value Addition Program"),
    (0, 48, "prototyping_phase", "ALL", "Prototyping Phase 1"),
    (11, 1, "summer_internship_review", "ALL", "Summer Internship Review"),
    (18, 1, "project_review", "TY_BTECH", "TY and B.Tech Project Review I"),
    (25, 1, "project_review", "SY", "SY Project Review I"),
    (31, 1, "student_feedback", "ALL", "Student's Feedback I"),
    (36, 30, "academic_audit", "ALL", "Academic Audit"),
    (49, 53, "prototyping_phase", "ALL", "Prototyping Phase 2"),
    (53, 1, "project_review", "ALL", "SY, TY and B.Tech Project Review II"),
    (53, 1, "academic_awareness_activities", "ALL", "Academic Awareness Activities"),
    # One combined Mid-Sem block for all cohorts, per the 2026-27 document
    # (the older 2025-26 calendar split TY/BTech and SY into separate weeks).
    (56, _CONFIGURABLE, "mid_sem_exam", "ALL", "Mid-Sem Exams"),
    (56, 6, "amcat_assessment", "TY", "AMCAT Assessment (TY)"),
    (70, 6, "amcat_assessment", "SY", "AMCAT Assessment (SY)"),
    (70, 6, "industry_practicum_evaluation", "ALL", "Industry Practicum Mid-term Evaluation"),
    (81, 1, "project_review", "SY", "SY Project Review III"),
    (88, 1, "project_review", "TY", "TY Project Review III"),
    (91, 1, "detention_list", "ALL", "Provisional Detention List"),
    # placeholder -- repositioned to end on the Final Detention day
    (91, 11, "makeup_remedial_sessions", "ALL", "Make-up/Remedial Sessions"),
    (95, 1, "project_review", "BTech", "B.Tech Project Review III"),
    (100, 1, "student_feedback", "ALL", "Student's Feedback II"),
    # placeholder -- repositioned to the last instructional day before Practical
    (101, 1, "detention_list", "ALL", "Final Detention"),
    # placeholder -- repositioned by _place_practical_after_mid_sem
    (112, _CONFIGURABLE, "practical_exam", "ALL", "Practical Examination"),
    # placeholder -- repositioned by _sequence_practical_and_theory
    (123, _CONFIGURABLE, "end_sem_exam", "ALL", "End-Semester Examination"),
    (127, 5, "industry_practicum_evaluation", "ALL", "Industry Practicum End-term Review (Slot 1)"),
    (140, 5, "industry_practicum_evaluation", "ALL", "Industry Practicum End-term Review (Slot 2)"),
    (156, 1, "result_declaration", "ALL", "Result Declaration"),
    (161, 1, "term_commencement_next", "ALL", "Commencement of Term Next Academic Year"),
    (161, 2, "reexam_registration", "ALL", "Re-Exam Registration"),
    (164, 10, "reexamination", "ALL", "Re-Examination"),
    (178, 1, "reexam_result", "ALL", "Re-Exam Result Declaration"),
]
# Project Examinations aren't in the template above -- they're placed
# dynamically the day after the End-Semester Exam's actual end (see
# _place_project_examinations), one day per cohort in this order, so they
# track wherever end_sem_exam's real end lands instead of a fixed offset
# going stale.
PROJECT_EXAM_COHORTS = ["SY", "TY", "BTech"]
# The MDM TY & B.Tech Practical Exam isn't in the template above -- it's
# placed dynamically on the main practical block's final day (see
# _place_mdm_practical), matching the published calendar, so it can't drift
# outside that window if the coordinator's practical-exam duration changes.
