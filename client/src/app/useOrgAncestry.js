import { useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";
import { getOrgUnit } from "./orgUnitCache.js";

// Resolves an org unit id up through its parent_id chain to the full
// department [/ cohort] [/ division] ancestry needed for the document
// header's title line (see orgHeaderLabel.js) -- e.g. a division's chain
// is [department, cohort, division], or [department, division] when a
// department skips the cohort level entirely (plan.md §5.7). Each id's
// lookup goes through the shared orgUnitCache (also used by
// useOrgPathNames), so resolving the same id from two different hooks
// never fires two requests for it.
async function resolveChain(orgId, getJSON) {
  const chain = [];
  let currentId = orgId;
  while (currentId) {
    const unit = await getOrgUnit(currentId, getJSON);
    chain.unshift(unit);
    currentId = unit.parent_id;
  }
  return chain;
}

// Returns null while loading, [] for the institute itself (orgId falsy),
// or the ordered top-to-bottom ancestry chain otherwise.
export function useOrgAncestry(orgId) {
  const { getJSON } = useCalendarApi();
  const [chain, setChain] = useState(orgId ? null : []);

  useEffect(() => {
    if (!orgId) {
      setChain([]);
      return;
    }
    let cancelled = false;
    setChain(null);
    resolveChain(orgId, getJSON).then((result) => {
      if (!cancelled) setChain(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return chain;
}
