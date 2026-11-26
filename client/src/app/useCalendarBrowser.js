import { useCallback, useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";

// Owns the sidebar's discovery data -- academic years, each year's terms
// (loaded lazily on expand), and each term's calendar categories (loaded
// lazily once a term is selected) -- plus the admin-only add/remove
// mutations for years and terms themselves. A year/term shows up either
// because it already has a calendar, or because an admin explicitly
// declared it via addYear/addTerm (see server/agent/db.py's
// add_academic_year/add_term) -- letting the sidebar's structure be set up
// before any calendar exists for it, not just derived after the fact.
//
// A failed fetch is tracked separately from "genuinely empty" (an error
// message, not just an empty array) -- silently treating a backend outage
// the same as "there's nothing here yet" would hide a real problem from
// whoever's looking at the sidebar. On error the year/term/list stays
// undefined (not cached as []), so calling load*() again retries instead
// of being permanently stuck on the failed empty result.
export function useCalendarBrowser() {
  const { getJSON, postJSON, deleteJSON } = useCalendarApi();
  const [academicYears, setAcademicYears] = useState([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [yearsError, setYearsError] = useState(null);
  const [termsByYear, setTermsByYear] = useState({});
  const [termsErrorByYear, setTermsErrorByYear] = useState({});
  const [categoriesByTerm, setCategoriesByTerm] = useState({});
  const [categoriesErrorByTerm, setCategoriesErrorByTerm] = useState({});

  const refreshYears = useCallback(() => {
    setLoadingYears(true);
    setYearsError(null);
    return getJSON("/calendar/academic-years")
      .then(setAcademicYears)
      .catch((err) => setYearsError(err.message))
      .finally(() => setLoadingYears(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshYears();
  }, [refreshYears]);

  // Always re-fetches (unlike loadTerms below) -- used after add/remove-term
  // mutations, which need fresh data even if this year's terms were
  // already cached.
  function fetchTerms(year) {
    setTermsErrorByYear((prev) => ({ ...prev, [year]: null }));
    return getJSON(`/calendar/academic-years/${encodeURIComponent(year)}/terms`)
      .then((terms) => setTermsByYear((prev) => ({ ...prev, [year]: terms })))
      .catch((err) => setTermsErrorByYear((prev) => ({ ...prev, [year]: err.message })));
  }

  function loadTerms(year) {
    if (termsByYear[year]) return; // already cached
    fetchTerms(year);
  }

  // Which categories actually show up now depends on the specific academic
  // year too (a public visitor only sees ones with a published calendar
  // for *this* year), not just the term -- so the cache is keyed by year,
  // then by term within it, instead of by term alone.
  function loadCategories(academicYear, term) {
    if (categoriesByTerm[academicYear]?.[term]) return; // already cached
    setCategoriesErrorByTerm((prev) => ({ ...prev, [academicYear]: { ...prev[academicYear], [term]: null } }));
    getJSON(`/calendar/categories/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}`)
      .then((categories) =>
        setCategoriesByTerm((prev) => ({ ...prev, [academicYear]: { ...prev[academicYear], [term]: categories } }))
      )
      .catch((err) =>
        setCategoriesErrorByTerm((prev) => ({
          ...prev,
          [academicYear]: { ...prev[academicYear], [term]: err.message },
        }))
      );
  }

  // Errors (e.g. "still has calendars saved under it") are deliberately
  // left to propagate -- Sidebar.jsx owns showing them next to whatever
  // row the admin just tried to act on, rather than a global error state.
  async function addYear(academicYear, terms) {
    await postJSON("/calendar/academic-years", { academic_year: academicYear, terms });
    await refreshYears();
  }

  async function removeYear(academicYear) {
    await deleteJSON(`/calendar/academic-years/${encodeURIComponent(academicYear)}`);
    setTermsByYear((prev) => {
      const next = { ...prev };
      delete next[academicYear];
      return next;
    });
    await refreshYears();
  }

  async function addTerm(academicYear, term) {
    await postJSON(`/calendar/academic-years/${encodeURIComponent(academicYear)}/terms`, { term });
    await fetchTerms(academicYear);
    await refreshYears(); // a brand-new year might have just gotten its first term
  }

  async function removeTerm(academicYear, term) {
    await deleteJSON(`/calendar/academic-years/${encodeURIComponent(academicYear)}/terms/${encodeURIComponent(term)}`);
    await fetchTerms(academicYear);
  }

  return {
    academicYears,
    loadingYears,
    yearsError,
    refreshYears,
    termsByYear,
    termsErrorByYear,
    loadTerms,
    categoriesByTerm,
    categoriesErrorByTerm,
    loadCategories,
    addYear,
    removeYear,
    addTerm,
    removeTerm,
  };
}
