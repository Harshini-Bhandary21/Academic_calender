import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext.jsx";
import { extractOrgId, buildOrgPathSegment } from "../../orgUrlSegment.js";

const LEVEL_LABELS = { department: "department", cohort: "cohort", division: "division" };

// Always-available shortcut to a logged-in org unit's own calendar page --
// pulled out of OrgHierarchySection and rendered at the very TOP of
// CalendarPage (see calendar.jsx) rather than at the bottom, since it's a
// call-to-action a coordinator needs to see immediately on landing, not
// after scrolling past the entire institute calendar below it.
//
// The hierarchy browser only ever lists org units that have *already
// published* something, so before a department/cohort/division has
// published anything for this exact slot, it wouldn't appear there at all
// -- leaving no way to reach the one place it can copy/edit/publish from
// in the first place. This direct link sidesteps that entirely: always
// available, regardless of publish status or which org node (if any) the
// URL currently points at.
export default function OrgSelfLinkBanner({ academicYear, term, category, orgPath }) {
  const { isOrgUnit, orgId: myOrgId, orgLevel: myOrgLevel, orgName: myOrgName } = useAuth();

  if (!isOrgUnit || !myOrgId) return null;

  // orgPath holds the URL's own segments verbatim (a readable "name-id"
  // slug, or a bare id from an older/shared link -- see orgUrlSegment.js),
  // so the last segment has to be extracted down to the real id before
  // comparing it against myOrgId (always a real id, from the JWT).
  const currentOrgId = orgPath.length > 0 ? extractOrgId(orgPath[orgPath.length - 1]) : null;
  if (currentOrgId === myOrgId) return null; // already there -- nothing to link to

  const myOwnPath = `/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}/${encodeURIComponent(
    buildOrgPathSegment(myOrgId, myOrgName)
  )}`;

  return (
    <div className="org-self-link-banner no-print">
      <span className="org-self-link-text">
        Signed in as <strong>{myOrgName}</strong> ({LEVEL_LABELS[myOrgLevel] || "coordinator"})
      </span>
      <Link to={myOwnPath} className="btn btn-primary">
        Go to my calendar
      </Link>
    </div>
  );
}
