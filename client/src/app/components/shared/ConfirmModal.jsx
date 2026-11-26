// Generic "are you sure?" popup, reusing the same modal-overlay/
// modal-content/modal-actions shell as DayEditor (see styles/document.css)
// in a centered, icon-led layout since it only ever asks a single yes/no
// question. Two variants:
// - "danger" (default) -- an irrecoverable, destructive action (delete a
//   year/term/org unit): red warning-triangle icon, solid red confirm
//   button.
// - "commit" -- an irrecoverable but *not* destructive action (e.g. the
//   org-unit "copy from parent", which is one-time forever but is a
//   required, positive step, not something going wrong): a neutral navy
//   info icon and the ordinary primary-button color, so a routine action a
//   coordinator does every term doesn't read as alarming, while the modal
//   itself still forces a deliberate pause before something unrepeatable.
export default function ConfirmModal({ title, message, confirmLabel = "Delete", variant = "danger", onConfirm, onCancel }) {
  const isDanger = variant === "danger";
  return (
    <div className="modal-overlay no-print" onClick={onCancel}>
      <div
        className={`modal-content confirm-modal confirm-modal-${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="confirm-modal-icon" aria-hidden="true">
          {isDanger ? (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="11" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </span>
        <h2 id="confirm-modal-title">{title}</h2>
        <p id="confirm-modal-message" className="confirm-modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${isDanger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
