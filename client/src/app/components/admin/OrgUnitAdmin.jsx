import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { useCalendarApi } from "../../useCalendarApi.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import OrgUnitIcon from "../icons/OrgUnitIcon.jsx";

const LEVEL_LABELS = { department: "Department", cohort: "Cohort", division: "Division" };
const LEVEL_LABELS_PLURAL = { department: "Departments", cohort: "Cohorts", division: "Divisions" };

// Which child level(s) the current caller may create, and whether a level
// picker is even needed -- a department is the one case with a real choice
// (cohort *or* division directly, see the Humanities and Engineering
// Sciences (First Year) edge case in plan.md); everyone else who can
// create anything at all only ever creates exactly one fixed level.
function childLevelOptionsFor({ isAdmin, orgLevel }) {
  if (isAdmin) return ["department"];
  if (orgLevel === "department") return ["cohort", "division"];
  if (orgLevel === "cohort") return ["division"];
  return []; // a division has nothing below it
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

const EyeIcon = ({ open }) =>
  open ? (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.3M6.6 6.6C4 8.4 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 3.4-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );

// Reused unchanged at every level below the institute admin: the admin
// sees this to manage departments; a department sees the exact same
// component to manage its cohorts/divisions; a cohort sees it to manage
// its divisions. A division renders nothing (childLevelOptionsFor returns
// []) since nothing can be created under it.
export default function OrgUnitAdmin() {
  const { isAdmin, orgLevel } = useAuth();
  const { getJSON, postJSON, patchJSON, deleteJSON } = useCalendarApi();

  const childLevels = childLevelOptionsFor({ isAdmin, orgLevel });
  const [children, setChildren] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // Only ever populated for an id created/reset in this session -- the
  // server can never return a real password for anything fetched fresh
  // (see plan.md §5.4: only a hash is ever stored), so there's nothing to
  // reveal for a pre-existing row until its password is reset.
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [visiblePasswordFor, setVisiblePasswordFor] = useState({});

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState(childLevels[0] || "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});
  const [resettingId, setResettingId] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name }

  useEffect(() => {
    if (childLevels.length === 0) return;
    let cancelled = false;
    getJSON("/org-units")
      .then((data) => {
        if (!cancelled) setChildren(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (childLevels.length === 0) return null;

  const childNounPlural = childLevels.length > 1 ? "cohorts or divisions" : LEVEL_LABELS_PLURAL[childLevels[0]].toLowerCase();
  const panelTitle = isAdmin ? "Departments" : childLevels.length > 1 ? "Cohorts & Divisions" : LEVEL_LABELS_PLURAL[childLevels[0]];
  const eyebrow = isAdmin ? "Institute Admin" : `${LEVEL_LABELS[orgLevel]} Account`;
  const subtitle = isAdmin
    ? "Create a department account and set its password. Departments manage their own cohorts and divisions from here on."
    : `Create ${childNounPlural} under your ${LEVEL_LABELS[orgLevel].toLowerCase()}, each with its own name and password.`;

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const created = await postJSON("/org-units", { name: name.trim(), password, level });
      setChildren((prev) => [...(prev || []), created]);
      setRevealedPasswords((prev) => ({ ...prev, [created.id]: created.password }));
      setVisiblePasswordFor((prev) => ({ ...prev, [created.id]: true }));
      setName("");
      setPassword("");
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(id) {
    setBusyId(id);
    setRowError((prev) => ({ ...prev, [id]: null }));
    try {
      const updated = await patchJSON(`/org-units/${id}`, { password: resetPassword });
      setRevealedPasswords((prev) => ({ ...prev, [id]: updated.password }));
      setVisiblePasswordFor((prev) => ({ ...prev, [id]: true }));
      setResettingId(null);
      setResetPassword("");
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setBusyId(target.id);
    setRowError((prev) => ({ ...prev, [target.id]: null }));
    try {
      await deleteJSON(`/org-units/${target.id}`);
      setChildren((prev) => prev.filter((c) => c.id !== target.id));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [target.id]: err.message }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card org-unit-admin no-print">
      <div className="org-unit-admin-header">
        <span className="org-unit-admin-header-icon" aria-hidden="true">
          <OrgUnitIcon level={isAdmin ? "department" : childLevels[0]} />
        </span>
        <div className="org-unit-admin-header-text">
          <div className="org-unit-admin-eyebrow">{eyebrow}</div>
          <h2 className="org-unit-admin-title">{panelTitle}</h2>
          <p className="org-unit-admin-subtitle">{subtitle}</p>
        </div>
        {children && children.length > 0 && (
          <span className="org-unit-admin-count">{children.length} total</span>
        )}
      </div>

      <h3 className="org-unit-section-label">Add new</h3>
      <form className="org-unit-create-form" onSubmit={handleCreate}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="org-unit-name">Name</label>
            <input
              id="org-unit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={childLevels.includes("department") && childLevels.length === 1 ? "e.g. Computer Engineering" : "e.g. SY, Div A"}
              required
            />
          </div>
          {childLevels.length > 1 && (
            <div className="field">
              <label id="org-unit-level-label">Type</label>
              <div className="org-unit-level-toggle" role="radiogroup" aria-labelledby="org-unit-level-label">
                {childLevels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={level === l}
                    className={`org-unit-level-toggle-btn${level === l ? " active" : ""}`}
                    onClick={() => setLevel(l)}
                  >
                    <OrgUnitIcon level={l} />
                    {LEVEL_LABELS[l]}
                  </button>
                ))}
              </div>
              {/* "Cohort"/"Division" are this app's own vocabulary, not
                  something a department's admin staff necessarily already
                  know -- spell out the distinction with a concrete example
                  right where the choice is made. */}
              <p className="field-hint">
                Cohort = a year-group with its own sub-divisions (e.g. SY, TY, B.Tech). Division = a single class with
                no further split (e.g. Div A). Choose Division directly if this department has no year-group split.
              </p>
            </div>
          )}
          <div className="field">
            <label htmlFor="org-unit-password">Password</label>
            <input
              id="org-unit-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a password"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating || !name.trim() || !password}>
            {creating ? "Adding..." : "Add"}
          </button>
        </div>
        {createError && <div className="field-error">{createError}</div>}
      </form>

      <h3 className="org-unit-section-label">Existing accounts</h3>

      {loadError && <div className="field-error">Couldn't load the list: {loadError}</div>}

      {children === null && !loadError && (
        <div className="org-unit-list">
          <div className="skeleton skeleton-block skeleton-h-52" />
          <div className="skeleton skeleton-block skeleton-h-52" />
        </div>
      )}

      {children && children.length === 0 && (
        <div className="org-unit-empty">
          <span className="org-unit-empty-icon" aria-hidden="true">
            <OrgUnitIcon level={childLevels[0]} />
          </span>
          <p>None yet &mdash; add one above to get started.</p>
        </div>
      )}

      {children && children.length > 0 && (
        <ul className="org-unit-list">
          {children.map((child, i) => {
            const hasRevealable = Object.prototype.hasOwnProperty.call(revealedPasswords, child.id);
            const visible = visiblePasswordFor[child.id];
            return (
              <li key={child.id} className="org-unit-row" style={{ "--row-i": i }}>
                <div className="org-unit-row-main">
                  <span className={`org-unit-row-icon org-unit-row-icon-${child.level}`} aria-hidden="true">
                    <OrgUnitIcon level={child.level} />
                  </span>

                  <div className="org-unit-row-info">
                    <div className="org-unit-row-title">
                      <span className="org-unit-name">{child.name}</span>
                      {childLevels.length > 1 && (
                        <span className={`org-unit-level-tag org-unit-level-tag-${child.level}`}>{LEVEL_LABELS[child.level]}</span>
                      )}
                      <span className="org-unit-created-at">
                        Added {new Date(child.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="org-unit-password-line">
                      {hasRevealable ? (
                        <>
                          <span className="org-unit-password-value">{visible ? revealedPasswords[child.id] : "••••••••"}</span>
                          <button
                            type="button"
                            className="org-unit-reveal-btn"
                            aria-label={visible ? "Hide password" : "Show password"}
                            onClick={() => setVisiblePasswordFor((prev) => ({ ...prev, [child.id]: !prev[child.id] }))}
                          >
                            <EyeIcon open={visible} />
                          </button>
                        </>
                      ) : (
                        <span className="org-unit-password-badge" title="Only a one-way hash is stored, so even the account that set it can't be shown here again -- use Reset password to set a new one.">
                          Set by whoever created this account &middot; not recoverable, reset to set a new one
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="org-unit-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary org-unit-reset-btn"
                      disabled={busyId === child.id}
                      onClick={() => {
                        setResettingId(resettingId === child.id ? null : child.id);
                        setResetPassword("");
                      }}
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="org-unit-delete-btn"
                      title={`Remove ${child.name}`}
                      aria-label={`Remove ${child.name}`}
                      disabled={busyId === child.id}
                      onClick={() => setPendingDelete({ id: child.id, name: child.name })}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {resettingId === child.id && (
                  <div className="org-unit-reset-row">
                    <input
                      type="text"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="New password"
                      autoFocus
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busyId === child.id || !resetPassword}
                      onClick={() => handleResetPassword(child.id)}
                    >
                      Save
                    </button>
                    <button className="btn btn-secondary" onClick={() => setResettingId(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {rowError[child.id] && <div className="field-error">{rowError[child.id]}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${pendingDelete.name}?`}
          message={`This removes "${pendingDelete.name}"'s login entirely. This is refused if it still has any cohorts/divisions or calendar data of its own -- remove those first.`}
          confirmLabel="Yes, delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
