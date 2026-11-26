import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgHierarchyChildren } from "../../useOrgHierarchyChildren.js";
import { buildOrgPathSegment } from "../../orgUrlSegment.js";
import OrgUnitIcon from "../icons/OrgUnitIcon.jsx";

const LEVEL_LABELS_PLURAL = { department: "Department", cohort: "Cohort", division: "Division" };

// Title reflects whichever level(s) actually came back -- usually uniform
// (a department's children are either all cohorts or all divisions), but
// the Humanities and Engineering Sciences (First Year) edge case means a
// department *could* mix cohort and division children, so this falls back
// to a generic label rather than assuming one level.
function titleFor(children) {
  const levels = new Set(children.map((c) => c.level));
  if (levels.size === 1) return `${LEVEL_LABELS_PLURAL[[...levels][0]]} Calendars`;
  return "Cohort & Division Calendars";
}

// The drill-down equivalent of CategoryCards, one level of the org
// hierarchy at a time -- reused unchanged whether this is the institute's
// own departments, a department's cohorts/divisions, or a cohort's
// divisions (see OrgHierarchySection, which instantiates this once per
// level). Previously rendered the whole card grid inline at the bottom of
// the page, which read as a stray trailing section; now it's a single
// compact banner button that opens the same content in a modal, with the
// same reveal-on-demand treatment at every level for free, since nothing
// here is level-specific.
export default function OrgHierarchyBrowser({ academicYear, term, category, parentId, isOwner, basePath }) {
  const navigate = useNavigate();
  const { children, error } = useOrgHierarchyChildren({ academicYear, term, category, parentId });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (error) {
    return (
      <div className="fetch-error no-print">
        <p>Couldn't load the calendars available here: {error}</p>
      </div>
    );
  }

  if (children === null) {
    return <div className="skeleton skeleton-block skeleton-h-140 no-print" />;
  }

  // A random visitor with nothing to browse into just sees nothing extra
  // (avoids clutter) -- only the owning parent gets a hint that this is
  // where its own children would show up once they publish something.
  if (children.length === 0) {
    return isOwner ? (
      <p className="org-hierarchy-empty no-print">
        Nothing published here yet by any linked account -- manage them from{" "}
        <a href="/manage">Manage Accounts</a>.
      </p>
    ) : null;
  }

  const title = titleFor(children);

  function goTo(child) {
    setOpen(false);
    navigate(`${basePath}/${encodeURIComponent(buildOrgPathSegment(child.id, child.name))}`);
  }

  return (
    <>
      {/* Just the one button, right-aligned -- a top-of-page action next
          to wherever else this page's primary actions sit (e.g. the
          institute admin's "Generate Other Calendar"), not a banner with
          its own icon/description. */}
      <div className="org-hierarchy-trigger-row no-print">
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          {title}
        </button>
      </div>

      {open && (
        <div className="modal-overlay no-print" onClick={() => setOpen(false)}>
          <div
            className="modal-content modal-content-wide category-page org-hierarchy-browser"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close-btn" onClick={() => setOpen(false)} aria-label="Close">
              &times;
            </button>
            <div className="category-page-header org-hierarchy-header">
              <div className="category-page-eyebrow">Also available</div>
              <h2 className="category-page-title org-hierarchy-title">{title}</h2>
              <p className="category-page-subtitle">Each one is that account's own customized version of this calendar.</p>
            </div>
            <div className="category-cards">
              {children.map((child, i) => (
                <button key={child.id} className="category-card" style={{ "--card-i": i }} onClick={() => goTo(child)}>
                  <span className="category-card-icon" aria-hidden="true">
                    <OrgUnitIcon />
                  </span>
                  <span className="category-card-title">
                    {child.name}
                    <span className="org-unit-level-tag org-hierarchy-level-tag">{LEVEL_LABELS_PLURAL[child.level]}</span>
                  </span>
                  <span className="category-card-cta">View calendar &rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
