import { useEffect, useState } from "react";
import ChevronIcon from "../icons/ChevronIcon.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

const ALL_TERMS = ["Term I", "Term II"];

// Left-hand navigation: Academic Years, expandable to their terms only --
// no further nesting (categories render as cards in the main content area
// once a term is picked, not as a third sidebar level). Mostly
// presentational; calendar.jsx owns the actual selection state and the
// year/term discovery data (see useCalendarBrowser.js) -- this component
// only owns the small bits of local UI state for the admin-only add/
// remove forms below (which row's form is open, in-flight/error state).
export default function Sidebar({
  academicYears,
  loadingYears,
  yearsError,
  onRetryYears,
  termsByYear,
  termsErrorByYear,
  onExpandYear,
  selectedYear,
  selectedTerm,
  onSelectTerm,
  isAdmin,
  onAddYear,
  onRemoveYear,
  onAddTerm,
  onRemoveTerm,
}) {
  const [expandedYear, setExpandedYear] = useState(selectedYear);
  const [addingYear, setAddingYear] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [busyKey, setBusyKey] = useState(null); // which row's mutation is in flight, e.g. "year:2027-2028"
  const [rowError, setRowError] = useState({}); // keyed the same way as busyKey
  // Deleting a year/term is destructive (and, if it's the last thing
  // pointing at real calendar content, irreversible), so the × button
  // only queues it here -- the actual removeYear/removeTerm call only
  // happens once the admin confirms in the modal below.
  const [pendingDelete, setPendingDelete] = useState(null); // { type: "year", year } | { type: "term", year, term }

  // A direct visit to a /:year/:term URL (a shared link, a refresh) should
  // land with that year already expanded, not require re-clicking it.
  useEffect(() => {
    if (selectedYear && selectedYear !== expandedYear) {
      setExpandedYear(selectedYear);
      onExpandYear(selectedYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  function toggleYear(year) {
    const opening = expandedYear !== year;
    setExpandedYear(opening ? year : null);
    if (opening) onExpandYear(year);
  }

  async function runRowAction(key, action) {
    setBusyKey(key);
    setRowError((prev) => ({ ...prev, [key]: null }));
    try {
      await action();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [key]: err.message }));
    } finally {
      setBusyKey(null);
    }
  }

  function handleAddYear(e) {
    e.preventDefault();
    const year = newYear.trim();
    if (!year) return;
    runRowAction("add-year", async () => {
      await onAddYear(year);
      setNewYear("");
      setAddingYear(false);
    });
  }

  function confirmPendingDelete() {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.type === "year") {
      runRowAction(`year:${pending.year}`, () => onRemoveYear(pending.year));
    } else {
      runRowAction(`term:${pending.year}:${pending.term}`, () => onRemoveTerm(pending.year, pending.term));
    }
  }

  return (
    <>
      <nav className="calendar-sidebar no-print">
      <div className="sidebar-header">
        <h2>Academic Years</h2>
        {isAdmin && (
          <button
            type="button"
            className="sidebar-add-toggle"
            onClick={() => setAddingYear((v) => !v)}
            title="Add academic year"
            aria-label="Add academic year"
          >
            +
          </button>
        )}
      </div>

      {isAdmin && addingYear && (
        <form className="sidebar-add-form" onSubmit={handleAddYear}>
          <input
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            placeholder="e.g. 2027-2028"
            autoFocus
          />
          <button type="submit" className="btn btn-secondary" disabled={busyKey === "add-year" || !newYear.trim()}>
            Add
          </button>
        </form>
      )}
      {isAdmin && rowError["add-year"] && <div className="sidebar-row-error">{rowError["add-year"]}</div>}

      {loadingYears ? (
        <div className="sidebar-skeleton">
          <div className="skeleton skeleton-line skeleton-w-70" />
          <div className="skeleton skeleton-line skeleton-w-55" />
          <div className="skeleton skeleton-line skeleton-w-62" />
        </div>
      ) : yearsError ? (
        <div className="sidebar-fetch-error">
          <p>Couldn't load academic years.</p>
          <button className="btn btn-secondary" onClick={onRetryYears}>
            Retry
          </button>
        </div>
      ) : academicYears.length === 0 ? (
        <div className="sidebar-empty">No academic years found yet.</div>
      ) : (
        <ul className="sidebar-year-list">
          {academicYears.map((year) => {
            const expanded = expandedYear === year;
            const terms = termsByYear[year];
            const termsError = termsErrorByYear?.[year];
            const yearKey = `year:${year}`;
            const missingTerms = terms ? ALL_TERMS.filter((t) => !terms.includes(t)) : [];

            return (
              <li key={year}>
                <div className="sidebar-year-row">
                  <button
                    className={`sidebar-year-btn${expanded ? " expanded" : ""}`}
                    onClick={() => toggleYear(year)}
                    aria-expanded={expanded}
                  >
                    <ChevronIcon expanded={expanded} />
                    {year}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="sidebar-row-remove"
                      title="Remove academic year"
                      aria-label={`Remove ${year}`}
                      disabled={busyKey === yearKey}
                      onClick={() => setPendingDelete({ type: "year", year })}
                    >
                      ×
                    </button>
                  )}
                </div>
                {isAdmin && rowError[yearKey] && <div className="sidebar-row-error">{rowError[yearKey]}</div>}
                {expanded && (
                  <ul className="sidebar-term-list">
                    {termsError ? (
                      <li className="sidebar-fetch-error">
                        <p>Couldn't load terms.</p>
                        <button className="btn btn-secondary" onClick={() => onExpandYear(year)}>
                          Retry
                        </button>
                      </li>
                    ) : terms === undefined ? (
                      <li className="sidebar-skeleton">
                        <div className="skeleton skeleton-line skeleton-w-50" />
                        <div className="skeleton skeleton-line skeleton-w-40" />
                      </li>
                    ) : terms.length === 0 && !isAdmin ? (
                      <li className="sidebar-empty">No terms found.</li>
                    ) : (
                      terms.map((term) => {
                        const termKey = `term:${year}:${term}`;
                        return (
                          <li key={term}>
                            <div className="sidebar-term-row">
                              <button
                                className={`sidebar-term-btn${
                                  selectedYear === year && selectedTerm === term ? " active" : ""
                                }`}
                                onClick={() => onSelectTerm(year, term)}
                              >
                                {term}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="sidebar-row-remove"
                                  title={`Remove ${term}`}
                                  aria-label={`Remove ${term} from ${year}`}
                                  disabled={busyKey === termKey}
                                  onClick={() => setPendingDelete({ type: "term", year, term })}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            {isAdmin && rowError[termKey] && <div className="sidebar-row-error">{rowError[termKey]}</div>}
                          </li>
                        );
                      })
                    )}
                    {isAdmin &&
                      missingTerms.map((term) => {
                        const termKey = `add-term:${year}:${term}`;
                        return (
                          <li key={`add-${term}`} className="sidebar-add-term-row">
                            <button
                              type="button"
                              className="sidebar-add-term-btn"
                              disabled={busyKey === termKey}
                              onClick={() => runRowAction(termKey, () => onAddTerm(year, term))}
                            >
                              + Add {term}
                            </button>
                            {rowError[termKey] && <div className="sidebar-row-error">{rowError[termKey]}</div>}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </nav>
      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.type === "year" ? `Delete ${pendingDelete.year}?` : `Delete ${pendingDelete.term}?`}
          message={
            pendingDelete.type === "year"
              ? `This removes the entire academic year "${pendingDelete.year}" and everything under it. This action cannot be undone.`
              : `This removes "${pendingDelete.term}" from ${pendingDelete.year} and everything under it. This action cannot be undone.`
          }
          confirmLabel="Yes, delete"
          onConfirm={confirmPendingDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
