import { useAuth } from "../../AuthContext.jsx";
import { useOrgPathNames } from "../../useOrgPathNames.js";
import { extractOrgId } from "../../orgUrlSegment.js";
import OrgHierarchyBrowser from "./OrgHierarchyBrowser.jsx";
import OrgCalendarSection from "./OrgCalendarSection.jsx";
import OrgCalendarViewer from "./OrgCalendarViewer.jsx";

// Orchestrates one "current node" of the department/cohort/division
// hierarchy for a given (academicYear, term, category): resolves `orgPath`
// (the URL's trailing segments, e.g. ["dept-1", "cohort-3"]) down to
// whichever org unit is currently being viewed, shows that node's
// calendar -- the full edit experience if the logged-in identity IS that
// org unit (OrgCalendarSection), otherwise a read-only view
// (OrgCalendarViewer) -- and always offers the next level down via
// OrgHierarchyBrowser. At the bare URL (orgPath empty), this only ever
// renders the browser for the top-level departments; the institute's own
// calendar above it is CalendarPage's existing, untouched render block.
// The "go to my own calendar" shortcut used to live here too, but it's now
// OrgSelfLinkBanner, rendered at the top of the page instead (see
// calendar.jsx) -- a coordinator needs to see that immediately, not after
// scrolling past the whole institute calendar this section sits below.
// Likewise the org-path breadcrumb used to render here (only once
// orgPath was non-empty); it's now GlobalBreadcrumb, rendered once at the
// top of the page for every year/term/category/org combination, not just
// after drilling into a department.
// `toolbarLeft` -- whatever page-specific action(s) belong on the left of
// the same row as the hierarchy trigger (calendar.jsx's admin generate-
// controls at the institute root, or just an "Export as PDF" button at
// every other level) -- rendered *inside* the one shared toolbar row this
// owns, never wrapping the calendar content below it. Keeping that
// wrapping in here (not in calendar.jsx) matters: OrgHierarchyBrowser and
// the calendar content are siblings in one fragment, so a caller wrapping
// the *whole* <OrgHierarchySection> in its own row div would sweep the
// entire document (DocumentHeader, month grids, everything) into that
// flex row right alongside the buttons.
export default function OrgHierarchySection({ academicYear, term, category, orgPath, toolbarLeft }) {
  const { isAdmin, isOrgUnit, orgId: myOrgId } = useAuth();
  // orgPath holds the URL's own segments verbatim (each one a readable
  // "name-id" slug, or a bare id from an older/shared link -- see
  // orgUrlSegment.js) -- everywhere an actual org unit id is needed
  // (API calls, ownership checks), it has to be extracted first.
  const orgIds = orgPath.map(extractOrgId);
  const { names } = useOrgPathNames(orgIds);

  const currentOrgId = orgIds.length > 0 ? orgIds[orgIds.length - 1] : null;
  const isOwnerOfCurrent = Boolean(currentOrgId) && isOrgUnit && myOrgId === currentOrgId;
  // Whether the logged-in identity should see the "manage from /manage"
  // empty-state hint for the *next* level down -- the institute admin
  // owns every level (same blanket oversight it gets everywhere else in
  // this hierarchy), an org unit only owns its own node's children.
  const ownsNextLevel = isAdmin || isOwnerOfCurrent;

  const basePath = `/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}${orgPath
    .map((id) => `/${encodeURIComponent(id)}`)
    .join("")}`;

  return (
    <>
      {/* Above the calendar content, not below -- so it reads as a
          primary top-of-page action row, not a trailing section
          discovered only after scrolling past everything else. */}
      <div className="page-toolbar-row no-print">
        {toolbarLeft}
        <OrgHierarchyBrowser
          academicYear={academicYear}
          term={term}
          category={category}
          parentId={currentOrgId}
          isOwner={ownsNextLevel}
          basePath={basePath}
        />
      </div>

      {currentOrgId &&
        (isOwnerOfCurrent ? (
          <OrgCalendarSection academicYear={academicYear} term={term} category={category} />
        ) : (
          <OrgCalendarViewer
            academicYear={academicYear}
            term={term}
            category={category}
            orgId={currentOrgId}
            name={names[currentOrgId]?.name}
            level={names[currentOrgId]?.level}
          />
        ))}
    </>
  );
}
