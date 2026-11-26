const KEY = "calendar_last_visited";

// Remembers the most recent (academicYear, term, category) triple a
// visitor actually looked at a real calendar for -- used by the /manage
// dashboard's "Go to my calendar" shortcut, which otherwise has no
// (academicYear, term, category) context of its own to build a link with,
// unlike OrgSelfLinkBanner, which always renders from inside an
// already-selected calendar page. Best-effort only: a private-browsing
// tab or a full localStorage quota just means the shortcut falls back to
// the institute root ("/") instead.
export function rememberVisitedCalendar(academicYear, term, category) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ academicYear, term, category }));
  } catch {
    // ignore -- shortcut just falls back to "/" next time
  }
}

// Builds a path back to the last-remembered calendar slot, optionally
// with an org unit id appended (that coordinator's own calendar within
// that slot, same shape as OrgSelfLinkBanner's link) -- or null if nothing
// has been visited yet this browser.
export function lastVisitedCalendarPath(orgId) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved?.academicYear || !saved?.term || !saved?.category) return null;
  const base = `/${encodeURIComponent(saved.academicYear)}/${encodeURIComponent(saved.term)}/${encodeURIComponent(saved.category)}`;
  return orgId ? `${base}/${encodeURIComponent(orgId)}` : base;
}
