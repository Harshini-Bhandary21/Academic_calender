import { formatRange } from "../shared/dateUtils.js";
import { familyKeyForCategory, AGENDA_HIGHLIGHT_FAMILIES } from "../shared/categoryFamilies.js";
import { contrastText } from "../shared/colorUtils.js";
import { displayLabel } from "./milestoneColumns.js";
import EditIcon from "../icons/EditIcon.jsx";

// A single label + date-range row -- either the plain display form, or (if
// this row is the one currently being edited within its column) an inline
// start/end editor. Purely presentational; MilestoneColumn owns the
// editing state and callbacks.
export default function MilestoneRow({
  event,
  colors,
  canEdit,
  isEditing,
  editStart,
  editEnd,
  editLabel,
  editIsRange,
  editColorOverride,
  editColor,
  onChangeIsRange,
  onChangeColorOverride,
  onChangeColor,
  onStartEdit,
  onChangeStart,
  onChangeEnd,
  onChangeLabel,
  onSave,
  onCancel,
  onRemove,
}) {
  const family = familyKeyForCategory(event.category);
  // A custom color (only ever set for a Custom-category event with no
  // predefined family) always wins over the usual family-derived lookup,
  // which otherwise only highlights a fixed set of families at all.
  const bg = event.color || (AGENDA_HIGHLIGHT_FAMILIES.has(family) ? colors[family] : null);
  const style = bg ? { "--row-bg": bg, "--row-fg": contrastText(bg) } : undefined;
  const label = displayLabel(event);
  // Copied from a parent org unit's calendar (see schema.py's
  // CalendarEvent.origin) -- only the org unit that actually owns this
  // event can move or remove it, enforced server-side regardless of what
  // this button does; hiding it here just keeps the UI honest.
  const editable = canEdit && event.origin !== "inherited";

  if (isEditing) {
    return (
      <div className="milestone-row-editing no-print">
        <input
          type="text"
          className="milestone-edit-label"
          value={editLabel}
          onChange={(e) => onChangeLabel(e.target.value)}
          placeholder="Event name"
        />
        <input type="date" value={editStart} onChange={(e) => onChangeStart(e.target.value)} />
        <label className="milestone-edit-color">
          <input type="checkbox" checked={editIsRange} onChange={(e) => onChangeIsRange(e.target.checked)} />
          Range
        </label>
        {editIsRange && (
          <input type="date" value={editEnd} onChange={(e) => onChangeEnd(e.target.value)} />
        )}
        <label className="milestone-edit-color">
          <input
            type="checkbox"
            checked={editColorOverride}
            onChange={(e) => onChangeColorOverride(e.target.checked)}
          />
          Custom color
        </label>
        {editColorOverride && (
          <input type="color" value={editColor} onChange={(e) => onChangeColor(e.target.value)} title="Pick a color" />
        )}
        <button className="btn btn-primary" onClick={onSave}>
          Save
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={`milestone-row${bg ? " milestone-row-colored" : ""}`} style={style}>
      <span className="milestone-label">{label}</span>
      <span className="milestone-date">{formatRange(event.start, event.end)}</span>
      {canEdit && !editable && (
        <span className="milestone-inherited-tag no-print" title="Copied from the parent's calendar -- only they can edit or remove it">
          &#128274;
        </span>
      )}
      {editable && (
        <button
          className="milestone-edit-btn no-print"
          title="Move this event"
          aria-label={`Move ${label}`}
          onClick={onStartEdit}
        >
          <EditIcon />
        </button>
      )}
      {editable && (
        <button
          type="button"
          className="repeatable-remove no-print"
          title="Remove this event"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          &times;
        </button>
      )}
    </div>
  );
}
