import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import CalendarPage from "./pages/calendar.jsx";
import LoginPage from "./pages/login.jsx";
import ManageOrgUnitsPage from "./pages/manageOrgUnits.jsx";
import NotFoundPage from "./pages/notFound.jsx";
import TopNav from "./app/components/layout/TopNav.jsx";
import Footer from "./app/components/layout/Footer.jsx";
import { AuthProvider } from "./app/AuthContext.jsx";
import "./globals.css";

// /manage is its own self-contained dashboard (see manageOrgUnits.jsx) --
// deliberately no .section-nav/.app-footer chrome around it, so it reads
// as a focused settings page rather than the calendar-browsing app shell
// with a form dropped inside it.
const BARE_SHELL_ROUTES = new Set(["/manage"]);

function AppShell() {
  const location = useLocation();
  const isBareShell = BARE_SHELL_ROUTES.has(location.pathname);

  return (
    // app-shell/app-main fill the viewport exactly and let overflow
    // (if any) scroll inside app-main rather than the whole document.
    <div className="app-shell">
      {!isBareShell && <TopNav />}
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/manage" element={<ManageOrgUnitsPage />} />
          {/* Deep-linkable: /:academicYear alone (e.g. the breadcrumb's
              own year crumb -- see GlobalBreadcrumb.jsx) auto-expands
              that year in the sidebar (Sidebar.jsx already does this off
              selectedYear) with the landing page as content; /:academicYear/:term
              shows that term's category cards, /:academicYear/:term/:category
              shows the actual calendar -- CalendarPage reads whichever
              params are present via useParams(). The trailing splat on
              the last route captures an optional department/cohort/
              division drill-down path (e.g. /dept-1/cohort-3) as
              params['*'] -- CalendarPage splits it into an org-id array;
              omitted entirely, it's just the institute's own calendar as
              before. */}
          <Route path="/:academicYear" element={<CalendarPage />} />
          <Route path="/:academicYear/:term" element={<CalendarPage />} />
          <Route path="/:academicYear/:term/:category" element={<CalendarPage />} />
          <Route path="/:academicYear/:term/:category/*" element={<CalendarPage />} />
          {/* Catches anything with the wrong number of segments (e.g.
              a typo'd single-segment path) -- a 2-3 segment path with a
              bogus year/term still matches the routes above and shows
              CategoryCards' own "no categories configured" empty state,
              which is already a graceful non-broken result. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      {!isBareShell && <Footer />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
