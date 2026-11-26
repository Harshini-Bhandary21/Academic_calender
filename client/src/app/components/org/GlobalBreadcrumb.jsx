import { Link } from "react-router-dom";
import { useOrgAncestry } from "../../useOrgAncestry.js";
import { extractOrgId, buildOrgPathSegment } from "../../orgUrlSegment.js";
import HomeIcon from "../icons/HomeIcon.jsx";
import ChevronIcon from "../icons/ChevronIcon.jsx";

// Always-visible "where am I, and how do I jump" bar: Year -> Term ->
// Category -> Department -> Cohort -> Division, every already-known
// segment clickable straight back to that partial path. Replaces
// OrgBreadcrumb (which only ever covered the org-unit segments, and only
// rendered once you'd already drilled into one) -- this renders from the
// moment a year is selected, so switching term/category or jumping back
// up the org hierarchy never requires scrolling back to the sidebar or
// down to the hierarchy browser to find a link.
export default function GlobalBreadcrumb({ academicYear, term, category, orgPath }) {
  // orgPath holds the URL's own segments verbatim (each one a readable
  // "name-id" slug, or a bare id from an older/shared link -- see
  // orgUrlSegment.js); useOrgAncestry needs the real id.
  const currentOrgId = orgPath.length > 0 ? extractOrgId(orgPath[orgPath.length - 1]) : null;
  // The *actual* ancestor chain (department -> cohort -> ...), resolved via
  // parent_id -- not just orgPath's own URL segments. This matters because
  // a URL can legitimately name just one org unit with no ancestors
  // spelled out (e.g. OrgSelfLinkBanner's "go to my calendar" shortcut is
  // always a single segment, /.../<myOrgId>, regardless of how deep
  // myOrgId actually sits) -- building crumbs straight from orgPath would
  // then silently skip every ancestor in between (a cohort's own page
  // would show ". > SY" with no department crumb at all).
  const chain = useOrgAncestry(currentOrgId) || [];
  if (!academicYear) return null;

  const yearPath = `/${encodeURIComponent(academicYear)}`;
  const termPath = term ? `${yearPath}/${encodeURIComponent(term)}` : null;
  const categoryPath = term && category ? `${termPath}/${encodeURIComponent(category)}` : null;

  const crumbs = [{ key: "year", label: academicYear, href: yearPath }];
  if (term) crumbs.push({ key: "term", label: term, href: termPath });
  if (category) crumbs.push({ key: "category", label: category, href: categoryPath });
  chain.forEach((unit, i) => {
    crumbs.push({
      key: unit.id,
      label: unit.name,
      href: `${categoryPath}/${chain
        .slice(0, i + 1)
        .map((u) => encodeURIComponent(buildOrgPathSegment(u.id, u.name)))
        .join("/")}`,
    });
  });

  return (
    <nav className="org-breadcrumb no-print" aria-label="Calendar navigation">
      <Link to="/" className="org-breadcrumb-crumb org-breadcrumb-home">
        <HomeIcon />
        Institute
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.key} className="org-breadcrumb-segment">
            <span className="org-breadcrumb-sep" aria-hidden="true">
              <ChevronIcon />
            </span>
            {isLast ? (
              <span className="org-breadcrumb-crumb org-breadcrumb-current">{crumb.label}</span>
            ) : (
              <Link to={crumb.href} className="org-breadcrumb-crumb">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
