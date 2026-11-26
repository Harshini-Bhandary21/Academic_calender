import { useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";
import { useCalendarMutations } from "./useCalendarMutations.js";

// Owns the saved calendar's state (draft/history/undo/delete) and composes
// useCalendarMutations for the rest (generate, mark/unmark holiday,
// reschedule) -- calendar.jsx stays focused on composing components/JSX
// around whatever this returns.
//
// `selection` is whatever the sidebar/category-cards navigation currently
// points at -- {academicYear, term, category}, all null until a category
// card is clicked. Nothing is fetched until all three are set; changing
// any of them re-fetches that specific document instead of always loading
// "the latest calendar" (there's no single "latest" anymore now that
// multiple categories can exist per year/term).
export function useCalendarDraft(selection) {
  const { academicYear, term, category } = selection;
  const { getJSON, postJSON, deleteJSON } = useCalendarApi();
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]); // snapshots of draft (or null) before each change, for undo
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(false); // in-flight load for the current selection
  const [error, setError] = useState(null);

  useEffect(() => {
    setHistory([]);
    setError(null);
    if (!academicYear || !term || !category) {
      setDraft(null);
      return;
    }
    setFetching(true);
    getJSON(`/calendar/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}`)
      .then(setDraft)
      .catch((err) => {
        setDraft(null);
        if (!err.notFound) setError(err.message);
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, term, category]);

  // Every mutation goes through here so the pre-change draft is always on
  // the undo stack.
  function updateDraft(newDraft) {
    setHistory((prev) => [...prev, draft]);
    setDraft(newDraft);
  }

  const mutations = useCalendarMutations(draft, updateDraft, setError);

  function handleUndo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setDraft(restored);
      // Keep the DB in sync with the undo, or the saved copy would drift
      // from what's back on screen.
      if (restored) {
        postJSON("/calendar/save", { meta: restored.meta, events: restored.events, holidays: restored.holidays }).catch(
          (err) => setError(err.message)
        );
      }
      return prev.slice(0, -1);
    });
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm(`Delete the saved ${draft.meta.academic_year} ${draft.meta.term} calendar? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteJSON(
        `/calendar/${encodeURIComponent(draft.meta.academic_year)}/${encodeURIComponent(draft.meta.term)}/${encodeURIComponent(draft.meta.category)}`
      );
      setDraft(null);
      setHistory([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return {
    draft,
    history,
    fetching,
    error,
    setError,
    handleUndo,
    handleDelete,
    ...mutations,
    loading: deleting || mutations.loading,
  };
}
