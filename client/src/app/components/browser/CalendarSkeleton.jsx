// Shown while a selected calendar document is being fetched -- shaped like
// the real page (a header bar, two rows of month-grid blocks, a key-dates
// bar) instead of a plain "Loading..." line, so the layout doesn't jump
// once the real content arrives.
export default function CalendarSkeleton() {
  return (
    <div className="card no-print calendar-skeleton">
      <div className="skeleton skeleton-block calendar-skeleton-header" />
      <div className="calendar-row calendar-skeleton-row">
        <div className="skeleton skeleton-block calendar-skeleton-month" />
        <div className="skeleton skeleton-block calendar-skeleton-month" />
        <div className="skeleton skeleton-block calendar-skeleton-month" />
      </div>
      <div className="calendar-row calendar-skeleton-row calendar-skeleton-row-last">
        <div className="skeleton skeleton-block calendar-skeleton-month" />
        <div className="skeleton skeleton-block calendar-skeleton-month" />
        <div className="skeleton skeleton-block calendar-skeleton-month" />
      </div>
      <div className="skeleton skeleton-block calendar-skeleton-footer" />
    </div>
  );
}
