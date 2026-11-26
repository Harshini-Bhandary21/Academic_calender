// Builds the DocumentHeader's title/subtitle for a specific org unit's
// calendar, from its department/cohort/division ancestry chain (ordered
// top-to-bottom, see useOrgAncestry). Driven entirely by which levels are
// actually present in the chain -- not a fixed 3-deep assumption -- so it
// produces the right label whether a division's parent is a cohort
// ("SY-A Computer Engineering") or a department directly, per the
// Humanities and Engineering Sciences (First Year) edge case in
// plan.md §5.7 ("A Computer Engineering", no cohort segment at all).
export function buildOrgHeaderLabel(chain) {
  if (!chain || chain.length === 0) return null;

  const byLevel = Object.fromEntries(chain.map((unit) => [unit.level, unit.name]));
  const { department, cohort, division } = byLevel;

  const classLabel = cohort && division ? `${cohort}-${division}` : division || cohort || null;
  const subtitle = [classLabel, department].filter(Boolean).join(" ");

  return {
    title: "DEPARTMENTAL ACADEMIC CALENDAR",
    subtitle: subtitle || department || "",
  };
}

const LEVEL_TITLE_LABEL = { department: "Department", cohort: "Cohort", division: "Division" };

// Title for the per-ancestor "who added what" block (OwnEventsSheet, in
// OrgCalendarSection/OrgCalendarViewer) -- includes the org unit's level so
// e.g. a cohort named "SY" reads as "SY Cohort Calendar", not just "SY
// Calendar", which is ambiguous with a same-named division at a glance.
export function buildAncestorBlockTitle(unit) {
  const levelLabel = LEVEL_TITLE_LABEL[unit.level];
  return levelLabel ? `${unit.name} ${levelLabel} Calendar` : `${unit.name} Calendar`;
}
