// Single source of truth for "which color family a category belongs to",
// shared by the calendar grid and the agenda list so they're always
// consistent. Color values themselves live in colorUtils.js.

// Every event category the scheduler can produce, grouped into a handful
// of families -- coloring each of the ~24 categories individually would be
// unmanageable for a coordinator to customize.
export const FAMILIES = [
  { key: "holiday", label: "Holiday" },
  { key: "non_instructional", label: "Non-Instructional Days" },
  { key: "mid_sem", label: "Mid-Sem Exam", categories: ["mid_sem_exam"] },
  { key: "practical", label: "Practical Exam", categories: ["practical_exam"] },
  { key: "end_sem", label: "End-Sem Exam", categories: ["end_sem_exam"] },
  { key: "project_exam", label: "Project Examination", categories: ["project_examination"] },
  {
    key: "review",
    label: "Reviews / Feedback / Detention",
    categories: ["project_review", "student_feedback", "detention_list"],
  },
  {
    key: "programs",
    label: "Programs (Value Addition, AMCAT, etc.)",
    categories: [
      "value_addition_program",
      "academic_audit",
      "amcat_assessment",
      "technical_cultural_events",
      "academic_awareness_activities",
      "makeup_remedial_sessions",
      "slip_mid_term_evaluation",
      "prototyping_phase",
      "summer_internship_review",
      "industry_practicum_evaluation",
    ],
  },
  {
    key: "summer",
    label: "Summer / Re-Exam",
    categories: [
      "summer_internship",
      "summer_term",
      "summer_term_registration",
      "summer_term_examination",
      "reexam_registration",
      "reexamination",
      "reexam_result",
      "slip_end_term_review",
      "term_commencement_next",
      "result_declaration",
    ],
  },
];

const CATEGORY_TO_FAMILY = FAMILIES.reduce((map, family) => {
  (family.categories || []).forEach((category) => {
    map[category] = family.key;
  });
  return map;
}, {});

export function familyKeyForCategory(category) {
  return CATEGORY_TO_FAMILY[category] || "review";
}

// Families that run concurrently with everything else in the background
// (Value Addition, AMCAT, Academic Audit, Summer Internship, ...) -- see
// rules_agent's own _EXAM_LIKE_CATEGORIES split. When a background event's
// window overlaps a foreground one (e.g. Academic Audit spanning the whole
// Practical Exam block), the foreground event should win the day's color.
export const BACKGROUND_FAMILIES = new Set(["programs", "summer"]);

// The color choices offered when marking a day as a holiday -- a real
// holiday and a non-instructional block (e.g. Diwali) are the two the
// institute's own calendars visibly color differently; "Custom" covers a
// one-off day/event that's neither (e.g. a Sports Day), letting the
// coordinator type their own category label instead of forcing it into
// either bucket. "Custom" isn't a customizable-color FAMILIES entry --
// it (and any coordinator-typed label) never gets a background fill in the
// grid at all (see COLORED_GRID_FAMILIES below); it only ever gets a color
// via the per-item color override (see Holiday.color/CalendarEvent.color).
export const HOLIDAY_FAMILY_OPTIONS = [
  ...FAMILIES.filter((f) => f.key === "holiday" || f.key === "non_instructional"),
  { key: "custom", label: "Custom" },
];

// Rows in the agenda list only get a background color for the core exam
// blocks and non-instructional days -- everything else (reviews, feedback,
// detention, holidays, background programs) prints as plain text, matching
// how the institute's own Key-Dates table only highlights these.
export const AGENDA_HIGHLIGHT_FAMILIES = new Set(["end_sem", "non_instructional", "project_exam", "mid_sem", "practical"]);

// Calendar-grid day-cells only get a solid background fill for these
// families -- everything else (Commencement, Term-End, Project Review/
// Feedback/Detention, a coordinator's typed Custom-category label) is
// de-emphasized instead: no fill, just the day number underlined in light
// grey, since it's a boundary marker or a one-off named entry rather than
// an actual exam/holiday block.
export const COLORED_GRID_FAMILIES = new Set([
  "holiday",
  "non_instructional",
  "mid_sem",
  "practical",
  "end_sem",
  "project_exam",
  "programs",
  "summer",
]);
