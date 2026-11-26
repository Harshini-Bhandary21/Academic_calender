import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext.jsx";

// This app now serves the calendar section only, so there's no other
// section to switch to -- just the brand plus admin login/logout.
const LEVEL_LABELS = { department: "Department", cohort: "Cohort", division: "Division" };

export default function TopNav() {
  const { isAdmin, isOrgUnit, orgLevel, orgName, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loggedIn = isAdmin || isOrgUnit;
  const logoutLabel = isAdmin ? "Log Out (Admin)" : `Log Out (${LEVEL_LABELS[orgLevel] || "Coordinator"})`;
  // Confirms *whose* account is signed in -- every department/cohort/
  // division coordinator otherwise sees an identical screen after a
  // password-only login, with nothing else on screen saying which one they
  // are until whatever calendar loads gives it away.
  const identityLabel = isAdmin ? "Institute Admin" : isOrgUnit ? `${orgName} · ${LEVEL_LABELS[orgLevel] || "Coordinator"}` : null;
  // A division has nothing below it to manage -- only the institute admin
  // and department/cohort accounts ever see this link.
  const canManageChildren = isAdmin || (isOrgUnit && orgLevel !== "division");

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <nav className="section-nav no-print">
      <div className="section-nav-inner">
        <Link to="/" className="section-nav-brand">
          <span className="section-nav-mit">MIT</span>
          <span className="section-nav-divider" />
          <span className="section-nav-institute">
            Academy of Engineering
            <span className="section-nav-tagline">Academic Calendar</span>
          </span>
        </Link>
        <div className="section-nav-links">
          {identityLabel && <span className="section-nav-identity">{identityLabel}</span>}
          {canManageChildren && (
            <NavLink to="/manage" className={({ isActive }) => `section-nav-link${isActive ? " active" : ""}`}>
              Manage Accounts
            </NavLink>
          )}
          {loggedIn ? (
            <button className="section-nav-link section-nav-action" onClick={handleLogout}>
              {logoutLabel}
            </button>
          ) : (
            // Carries where the visitor actually was (see useCalendarApi.js's
            // 401 redirect, which does the same) so a normal, un-forced visit
            // to the login page still returns them to that exact page on
            // success -- not always the landing page, which is what
            // login.jsx's `returnTo` defaults to when no `from` is present.
            <NavLink
              to="/login"
              state={{ from: location.pathname }}
              className={({ isActive }) => `section-nav-link${isActive ? " active" : ""}`}
            >
              Admin Login
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
