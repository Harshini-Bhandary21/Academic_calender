import CategoryIcon from "../icons/CategoryIcon.jsx";

// Shown once a year+term is selected but no category has been clicked yet.
// Categories are whatever the backend's /calendar/categories/{academic_year}/
// {term} returns (see useCalendarBrowser.js) -- nothing here is a hardcoded
// label. For a public visitor this is already filtered down to categories
// with an actual published calendar for this year, so an empty list here
// genuinely means nothing to show yet, not just an unfetched/unconfigured
// term.
export default function CategoryCards({ academicYear, term, categories, error, onRetry, onSelectCategory }) {
  return (
    <div className="card category-page">
      <div className="category-page-header">
        <div className="category-page-eyebrow">Academic Calendar</div>
        <h2 className="category-page-title">
          {academicYear} <span className="dot">&middot;</span> {term}
        </h2>
        <p className="category-page-subtitle">Choose a calendar to view its full academic schedule.</p>
      </div>
      {error ? (
        <div className="fetch-error">
          <p>Couldn't load calendar categories: {error}</p>
          <button className="btn btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : categories.length === 0 ? (
        <div className="category-page-placeholder">No calendar is available for this term yet.</div>
      ) : (
        <div className="category-cards">
          {categories.map((category, i) => (
            <button
              key={category}
              className="category-card"
              style={{ "--card-i": i }}
              onClick={() => onSelectCategory(category)}
            >
              <span className="category-card-icon" aria-hidden="true">
                <CategoryIcon category={category} />
              </span>
              <span className="category-card-title">{category}</span>
              <span className="category-card-cta">View calendar &rarr;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
