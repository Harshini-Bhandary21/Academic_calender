import { useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";

// Read-only fetch of a specific org unit's calendar by id -- used when the
// viewer is NOT that org unit (a public visitor, the institute admin
// browsing, or a different org unit), so this only ever surfaces the
// published snapshot: GET /org-calendar/{...}?org_id=... only grants the
// live-draft view to that exact org unit's own token (see
// get_org_calendar_endpoint), so no role-check is needed here at all.
export function usePublicOrgCalendar({ academicYear, term, category, orgId }) {
  const { getJSON } = useCalendarApi();
  const [draft, setDraft] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!academicYear || !term || !category || !orgId) {
      setDraft(null);
      return;
    }
    setFetching(true);
    setError(null);
    setNotPublished(false);
    getJSON(
      `/org-calendar/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}?org_id=${encodeURIComponent(orgId)}`
    )
      .then(setDraft)
      .catch((err) => {
        setDraft(null);
        if (err.notFound) setNotPublished(true);
        else setError(err.message);
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, term, category, orgId]);

  return { draft, fetching, notPublished, error };
}
