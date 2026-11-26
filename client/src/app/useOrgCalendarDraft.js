import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useCalendarApi } from "./useCalendarApi.js";
import { useOrgCalendarMutations } from "./useOrgCalendarMutations.js";

// The org-unit equivalent of useCalendarDraft.js -- owns the logged-in org
// unit's own calendar for a given (academicYear, term, category), plus the
// one-time copy-from-parent action and its own publish/unpublish. No
// undo/delete here (not asked for at this level) -- just copy, edit,
// publish, matching plan.md's scope for a coordinator account.
export function useOrgCalendarDraft(selection) {
  const { academicYear, term, category } = selection;
  const { orgId } = useAuth();
  const { getJSON, postJSON } = useCalendarApi();
  const [draft, setDraft] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [copying, setCopying] = useState(false);
  // True only once a fetch has confirmed there's genuinely nothing here
  // yet for this org unit -- distinct from a real error (network/500),
  // which stays in `error` instead.
  const [notCopiedYet, setNotCopiedYet] = useState(false);

  function basePath() {
    return `/org-calendar/${encodeURIComponent(academicYear)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}`;
  }

  useEffect(() => {
    setError(null);
    setNotCopiedYet(false);
    if (!academicYear || !term || !category || !orgId) {
      setDraft(null);
      return;
    }
    setFetching(true);
    getJSON(`${basePath()}?org_id=${encodeURIComponent(orgId)}`)
      .then((d) => {
        setDraft(d);
        setNotCopiedYet(false);
      })
      .catch((err) => {
        setDraft(null);
        if (err.notFound) setNotCopiedYet(true);
        else setError(err.message);
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, term, category, orgId]);

  function updateDraft(newDraft) {
    setDraft(newDraft);
  }

  const mutations = useOrgCalendarMutations(draft, updateDraft, setError);

  async function handleCopyFromParent() {
    setCopying(true);
    setError(null);
    try {
      const copied = await postJSON(`${basePath()}/copy-from-parent`, {});
      setDraft(copied);
      setNotCopiedYet(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCopying(false);
    }
  }

  async function handlePublish() {
    if (!draft) return;
    try {
      setDraft(await postJSON(`${basePath()}/publish`, {}));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUnpublish() {
    if (!draft) return;
    try {
      setDraft(await postJSON(`${basePath()}/unpublish`, {}));
    } catch (err) {
      setError(err.message);
    }
  }

  return {
    draft,
    fetching,
    error,
    setError,
    copying,
    notCopiedYet,
    handleCopyFromParent,
    handlePublish,
    handleUnpublish,
    ...mutations,
  };
}
