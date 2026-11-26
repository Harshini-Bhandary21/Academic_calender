import { useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";
import { getOrgUnit, peekOrgUnit } from "./orgUnitCache.js";

// Resolves each id in an org path (e.g. ["dept-1", "cohort-3"] from the
// URL) to its {id, name, level} via the public GET /org-units/{id}
// lookup -- needed for the breadcrumb on a fresh page load / shared link,
// where the frontend has no other way to know what a bare id is called.
// Each id's lookup goes through the shared orgUnitCache (also used by
// useOrgAncestry), so an id already resolved by one hook is never
// re-fetched by the other.
export function useOrgPathNames(orgPath) {
  const { getJSON } = useCalendarApi();
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(false);
  const key = orgPath.join("/");

  useEffect(() => {
    const missing = orgPath.filter((id) => peekOrgUnit(id) === undefined);
    if (missing.length === 0) {
      setNames(Object.fromEntries(orgPath.map((id) => [id, peekOrgUnit(id)])));
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(orgPath.map((id) => getOrgUnit(id, getJSON).then((unit) => [id, unit]))).then((entries) => {
      if (cancelled) return;
      setNames(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { names, loading };
}
