import { useEffect, useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";

// Which org units directly under `parentId` (null = the institute's own
// top-level departments) have a customized version of this exact
// (academicYear, term, category) slot -- see GET .../children on the
// backend for the admin/public split (the owning org unit or the
// institute admin sees every child regardless of publish status).
export function useOrgHierarchyChildren({ academicYear, term, category, parentId }) {
  const { getJSON } = useCalendarApi();
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!academicYear || !term || !category) {
      setChildren(null);
      return;
    }
    let cancelled = false;
    setError(null);
    const path = `/org-calendar/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}/children`;
    const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : "";
    getJSON(`${path}${query}`)
      .then((data) => {
        if (!cancelled) setChildren(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, term, category, parentId]);

  return { children, error };
}
