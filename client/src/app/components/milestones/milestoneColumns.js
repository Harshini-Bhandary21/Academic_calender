// Builds the key-dates table exactly the way MITAOE's published calendar
// document lays it out: three milestone columns + a red Holidays column.
// Programs that the document shows in the italic info strip above the table
// (Value Addition, Prototyping, AMCAT, Make-up, Summer Internship Review,
// Industry Practicum) are excluded here -- InfoStrip.jsx renders those.
import { countWeeks, groupConsecutive } from "../shared/dateUtils.js";
import { CATEGORY_OPTIONS } from "../admin/eventOptions.js";

export const INFO_STRIP_CATEGORIES = new Set([
  "value_addition_program",
  "makeup_remedial_sessions",
  "prototyping_phase",
  "amcat_assessment",
  "summer_internship_review",
  "industry_practicum_evaluation",
]);

export const COLUMN_1_CATEGORIES = new Set(["student_feedback", "project_review", "detention_list"]);
export const COLUMN_2_CATEGORIES = new Set([
  "mid_sem_exam",
  "practical_exam",
  "end_sem_exam",
  "project_examination",
  "academic_audit",
]);
// Everything else (Result Declaration, next-term commencement, Academic
// Awareness, Re-Exam cycle, Summer Term, ...) falls into column 3.

// Narrows the full <optgroup>-grouped CATEGORY_OPTIONS list down to just
// the categories that actually belong in a given milestone column, so the
// inline "+ Add Event" picker in each column only offers relevant choices
// instead of the whole ~24-category list -- empty optgroups are dropped.
function filterCategoryOptions(allowed) {
  return CATEGORY_OPTIONS.map((group) => ({
    ...group,
    categories: group.categories.filter((c) => allowed.has(c.value)),
  })).filter((group) => group.categories.length > 0);
}

const NOT_COLUMN_3 = new Set([...COLUMN_1_CATEGORIES, ...COLUMN_2_CATEGORIES, ...INFO_STRIP_CATEGORIES]);
const COLUMN_3_CATEGORIES = new Set(
  CATEGORY_OPTIONS.flatMap((group) => group.categories.map((c) => c.value)).filter((c) => !NOT_COLUMN_3.has(c))
);

export const CATEGORY_OPTIONS_BY_COLUMN = [
  filterCategoryOptions(COLUMN_1_CATEGORIES),
  filterCategoryOptions(COLUMN_2_CATEGORIES),
  filterCategoryOptions(COLUMN_3_CATEGORIES),
];

const byStart = (a, b) => a.start.localeCompare(b.start);

// The document's own labels already name the cohort ("SY Project Review I",
// "B.Tech Project Review III"), so only append "(COHORT)" when the label
// doesn't mention it -- dots stripped so "B.Tech" matches cohort "BTech".
export function displayLabel(event) {
  if (event.cohort === "ALL") return event.label;
  const label = event.label.toLowerCase().replace(/\./g, "");
  const mentionsCohort = event.cohort.split("_").some((token) => label.includes(token.toLowerCase()));
  return mentionsCohort ? event.label : `${event.label} (${event.cohort})`;
}

const metaRow = (label, start, end = null, family = null, origin = "own") => ({
  type: "meta",
  label,
  start,
  end: end || start,
  family,
  origin,
});
const eventRow = (event) => ({ type: "event", event, start: event.start });

// Returns { columns: [rows, rows, rows], holidayRows } -- each row is either
// {type:"meta", label, start, end} or {type:"event", event}, both carrying
// `start` so a column's real rows sort chronologically like the document.
// The 3 term-level meta rows (Commencement/Teaching-End/Term-End) always
// stay first in their column instead of sorting in with the real events --
// they mark the boundaries of the term, not a dated agenda item.
export function buildMilestoneSheet(draft) {
  const { meta, events, holidays } = draft;
  const metaRows = [
    metaRow("Commencement of Term", meta.commencement),
    // A term-boundary marker, always shown regardless of whether any real
    // event happens to land on the same date -- the actual Final Detention
    // List event (category detention_list) always gets its own row below
    // too, in column 1, like every other event. Never suppress an event
    // row just because its date coincides with a meta row's date: that
    // heuristic is exactly what caused Final Detention to silently vanish
    // whenever scheduling placed it on teaching_end (the common case).
    metaRow("Teaching End and Final Detention List", meta.teaching_end),
    metaRow(`Term End (${countWeeks(meta.commencement, meta.term_end)} weeks)`, meta.term_end),
  ];
  const columns = [[], [], []];

  for (const event of events) {
    if (INFO_STRIP_CATEGORIES.has(event.category)) continue;
    if (COLUMN_1_CATEGORIES.has(event.category)) columns[0].push(eventRow(event));
    else if (COLUMN_2_CATEGORIES.has(event.category)) columns[1].push(eventRow(event));
    else columns[2].push(eventRow(event));
  }

  // Non-instructional ranges print as dated rows in column 3 (the document
  // shows "Non Instructional 6 NOV to 15 NOV" there, not among the red
  // holidays). A coordinator's typed Custom-category label (e.g. "Sports
  // Day") reads more like a one-off named entry than an actual holiday, so
  // it joins column 1 alongside the reviews/feedback rows instead -- only a
  // literal "holiday" family goes to the red Holidays column.
  const nonInstructional = holidays.filter((h) => h.family === "non_instructional");
  for (const range of groupConsecutive(nonInstructional)) {
    columns[2].push(metaRow(range.name, range.start, range.end, "non_instructional", range.origin));
  }
  const customHolidays = holidays.filter((h) => h.family && h.family !== "holiday" && h.family !== "non_instructional");
  for (const range of groupConsecutive(customHolidays)) {
    columns[0].push(metaRow(range.name, range.start, range.end, "custom", range.origin));
  }
  const holidayRows = groupConsecutive(holidays.filter((h) => (h.family || "holiday") === "holiday"));

  return {
    columns: columns.map((column, i) => [metaRows[i], ...[...column].sort(byStart)]),
    holidayRows,
  };
}

// Splits a flat list into `numColumns` chunks, filling the first column
// completely before moving to the next -- e.g. 7 items across 3 columns
// becomes [3, 3, 1], not round-robin. Used by buildOwnEventsSheet below,
// where (unlike the institute's fixed category-routed columns) there's no
// semantic reason for one event to belong to column 1 vs column 3, so
// they're just balanced left-to-right instead.
function chunkColumnMajor(items, numColumns) {
  const size = Math.ceil(items.length / numColumns) || 0;
  const columns = [];
  for (let i = 0; i < numColumns; i++) {
    columns.push(items.slice(i * size, (i + 1) * size));
  }
  return columns;
}

// The org-unit equivalent of buildMilestoneSheet, scoped to a single org
// unit's own additions only (see OrgCalendarSection.jsx -- the institute-
// shaped sheet above this shows everything that org unit *inherited*,
// locked; this one shows only what it added itself, editable). Same
// 3-events-columns + 1-holiday-column shape, but with none of the
// category-based routing: an own event has no fixed column the way an
// institute event does (student_feedback always in column 1, exams always
// in column 2, ...), so events are simply balanced left-to-right instead,
// and no term-boundary meta rows are repeated here since those already
// appear once, in the sheet above. Holidays skip the family-based routing
// too (non_instructional/custom holidays land in other columns in the
// institute sheet) -- there's no other column here to route them into, so
// every own holiday, regardless of family, goes in the one holiday column.
export function buildOwnEventsSheet(events, holidays) {
  const columns = chunkColumnMajor([...events].sort(byStart), 3).map((column) => column.map(eventRow));
  const holidayRows = groupConsecutive(holidays);
  return { columns, holidayRows };
}
