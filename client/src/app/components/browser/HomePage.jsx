// The "nothing selected yet" landing view, shown until a year+term is
// picked from the sidebar. Deliberately just an institute header + a
// plain pointer to the sidebar -- the actual year/term list already lives
// there (and in the sidebar alone, not duplicated here), so this page's
// only job is to explain where to look, not to re-list the same data a
// second time.
export default function HomePage() {
  return (
    <div className="card category-page home-page no-print">
      <div className="category-page-header">
        <div className="category-page-eyebrow">MIT Academy of Engineering</div>
        <h2 className="category-page-title">Institutional Academic Calendar</h2>
        <p className="category-page-subtitle">Official term-wise academic calendars for every program.</p>
      </div>
      <p className="home-hint">Use the sidebar to browse academic years and view a calendar.</p>
    </div>
  );
}
