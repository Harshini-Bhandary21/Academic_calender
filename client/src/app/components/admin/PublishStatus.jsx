// Status banner + actions for the draft/publish split, shared by every
// level of the hierarchy that owns a calendar (the institute admin, and
// any department/cohort/division via OrgCalendarSection) -- a public
// visitor only ever sees the last-published snapshot (see
// server/agent/db.py's _public_view/get_org_calendar), never whatever's
// currently being edited here. Only ever mounted by the owner of a given
// calendar, never a public/other-role viewer, so it doesn't need to guard
// against that itself.
export default function PublishStatus({ draft, onPublish, onUnpublish, loading }) {
  const { is_published, has_unpublished_changes, published_at } = draft;

  return (
    <div className={`publish-status no-print${has_unpublished_changes ? " has-changes" : ""}`}>
      <span className={`publish-badge ${is_published ? "is-published" : "is-draft"}`}>
        {is_published ? "Published" : "Draft"}
      </span>
      <span className="publish-status-text">
        {is_published && !has_unpublished_changes && "This is what public visitors currently see."}
        {is_published && has_unpublished_changes && "You have unpublished changes — public visitors still see the last published version."}
        {!is_published && "Not visible to public visitors yet — publish to make it live."}
        {published_at && (
          <span className="publish-status-timestamp">
            {" "}
            (last published {new Date(published_at).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })})
          </span>
        )}
      </span>
      <div className="publish-actions">
        {has_unpublished_changes && (
          <button className="btn btn-primary" onClick={onPublish} disabled={loading}>
            {loading ? "Publishing…" : is_published ? "Publish Changes" : "Publish"}
          </button>
        )}
        {is_published && (
          <button className="btn btn-secondary" onClick={onUnpublish} disabled={loading}>
            Unpublish
          </button>
        )}
      </div>
    </div>
  );
}
