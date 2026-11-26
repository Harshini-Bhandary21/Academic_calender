import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext.jsx";
import { useDocumentTitle } from "../app/useDocumentTitle.js";
import { lastVisitedCalendarPath } from "../app/lastVisitedCalendar.js";
import OrgUnitAdmin from "../app/components/admin/OrgUnitAdmin.jsx";
import ArrowLeftIcon from "../app/components/icons/ArrowLeftIcon.jsx";

const SITE_TITLE = "MIT Academy of Engineering";
const LEVEL_LABELS = { department: "Department", cohort: "Cohort", division: "Division" };

// Standalone dashboard page for managing the org-unit hierarchy one level
// down from whoever's logged in -- the institute admin manages
// departments here; a department/cohort visiting this same route manages
// its own cohorts/divisions instead (OrgUnitAdmin scopes itself entirely
// off useAuth(), same component reused at every level). A division has
// nothing below it to manage, so OrgUnitAdmin renders nothing for it.
//
// Deliberately its own minimal chrome (see main.jsx's AppShell hiding the
// usual TopNav/Footer here) instead of the calendar app's navbar -- a
// settings page doesn't need year/term navigation, and the one thing it
// does need -- a way back to the calendar that isn't a browser Back
// button -- is the top-left shortcut below.
export default function ManageOrgUnitsPage() {
  useDocumentTitle(`Manage Accounts | ${SITE_TITLE}`);
  const { isAdmin, isOrgUnit, orgId, orgLevel, orgName, logout } = useAuth();
  const navigate = useNavigate();
  const loggedIn = isAdmin || isOrgUnit;

  // No (academicYear, term, category) of its own to build a link with --
  // falls back to wherever this browser last actually looked at a real
  // calendar (see lastVisitedCalendar.js), or "/" if nothing has been yet.
  const calendarHref = isOrgUnit ? lastVisitedCalendarPath(orgId) || "/" : lastVisitedCalendarPath() || "/";
  const calendarLabel = isAdmin
    ? "Go to Institute Calendar"
    : isOrgUnit
    ? `Go to ${LEVEL_LABELS[orgLevel] || "My"} Calendar`
    : "Back to Calendar";
  const identityLabel = isAdmin ? "Institute Admin" : isOrgUnit ? `${orgName} · ${LEVEL_LABELS[orgLevel] || "Coordinator"}` : null;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar no-print">
        <Link to={calendarHref} className="dashboard-back-link">
          <ArrowLeftIcon />
          {calendarLabel}
        </Link>
        <div className="dashboard-topbar-right">
          {identityLabel && <span className="dashboard-identity">{identityLabel}</span>}
          {loggedIn && (
            <button className="dashboard-logout-btn" onClick={handleLogout}>
              Log Out
            </button>
          )}
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-content-inner">
          {loggedIn ? (
            <OrgUnitAdmin />
          ) : (
            <div className="card">
              <h2>Sign in required</h2>
              <p>Log in as an institute admin, department, or cohort account to manage accounts here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
