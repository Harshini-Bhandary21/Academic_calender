// Shared glyph for a department/cohort/division account -- used by
// OrgUnitAdmin.jsx's row list and OrgHierarchyBrowser.jsx's drill-down
// cards, same "one icon per concept" pattern as CategoryIcon.jsx. Distinct
// per `level` (building / stacked layers / single tile) so a mixed list --
// e.g. a department that created both cohorts and divisions directly, per
// the Humanities and Engineering Sciences (First Year) edge case -- reads
// as a hierarchy at a glance, not identical rows differentiated only by
// their text tag.
const PATHS = {
  department: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </>
  ),
  cohort: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="M2 13l10 5 10-5" />
      <path d="M2 18l10 5 10-5" />
    </>
  ),
  division: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
};

export default function OrgUnitIcon({ level }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[level] || PATHS.department}
    </svg>
  );
}
