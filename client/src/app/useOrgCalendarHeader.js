import { useOrgAncestry } from "./useOrgAncestry.js";
import { buildOrgHeaderLabel } from "./orgHeaderLabel.js";

// Shared by OrgCalendarSection (the owner's own edit view, which already
// knows its own name/level from AuthContext with no fetch) and
// OrgCalendarViewer (a read-only view of someone else's calendar, which
// gets its leaf name/level from useOrgPathNames/breadcrumb data) -- both
// need the DocumentHeader's title/subtitle to reflect the full
// department/cohort/division ancestry, not just the one org unit being
// viewed. Falls back to a single-node label (just the org unit's own
// name) until the ancestry chain finishes resolving, so the header never
// flashes the institute's own title for an org unit's page even briefly.
export function useOrgCalendarHeader(orgId, fallbackName, fallbackLevel) {
  const chain = useOrgAncestry(orgId);
  const resolved = buildOrgHeaderLabel(chain);
  if (resolved) return resolved;
  if (!fallbackName) return null;
  return buildOrgHeaderLabel([{ level: fallbackLevel, name: fallbackName }]);
}
