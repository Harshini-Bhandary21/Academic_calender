// The institutional document header, recreated typographically from the
// published calendar (no logo image asset exists): institute brand block on
// the left, document title + cohort subtitle centered. Prints as-is -- this
// is the document's own header, unlike the web app's action header.
//
// `orgHeader` (from useOrgCalendarHeader.js), when given, overrides the
// title/subtitle for a department/cohort/division's own calendar page --
// e.g. {title: "DEPARTMENTAL ACADEMIC CALENDAR", subtitle: "SY-A Computer
// Engineering"} -- instead of the institute's own fixed copy, which only
// ever describes the institute-wide calendar.
export default function DocumentHeader({ term, orgHeader }) {
  return (
    <header className="document-header">
      <div className="document-brand">
        <span className="document-brand-mit">MIT</span>
        <span className="document-brand-divider" />
        <span className="document-brand-name">
          Academy of Engineering
          <span className="document-brand-affiliation">
            (An Autonomous Institute Affiliated to Savitribai Phule Pune University)
          </span>
        </span>
      </div>
      <div className="document-title">
        <h1>{orgHeader ? orgHeader.title : "INSTITUTIONAL ACADEMIC CALENDAR"}</h1>
        <div className="document-subtitle">
          {orgHeader ? orgHeader.subtitle : `Second, Third and Final Year B.Tech (${term}), Honor and Minor (${term})`}
        </div>
      </div>
    </header>
  );
}
