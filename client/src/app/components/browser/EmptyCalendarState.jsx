// Shown when a specific (academic_year, term, category) has no saved
// calendar document -- a deliberate, designed empty state rather than a
// blank viewer or a raw 404, so it never reads as broken.
export default function EmptyCalendarState() {
  return (
    <div className="card empty-calendar-state">
      <span className="empty-calendar-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M9 15h1M14 15h1" />
        </svg>
      </span>
      <h3 className="empty-calendar-title">Calendar Not Available Yet</h3>
      <p className="empty-calendar-text">Calendar does not exist. Please check again after some time.</p>
    </div>
  );
}
