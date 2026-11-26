import { useState } from "react";
import { datesBetween, formatRange } from "../shared/dateUtils.js";
import { AGENDA_HIGHLIGHT_FAMILIES, COLORED_GRID_FAMILIES, familyKeyForCategory } from "../shared/categoryFamilies.js";
import { contrastText } from "../shared/colorUtils.js";
import EditIcon from "../icons/EditIcon.jsx";
import MilestoneRow from "./MilestoneRow.jsx";

const ADD_INITIAL = {
  label: "",
  familyKey: "",
  category: "",
  customCategory: "",
  customColor: "#cccccc",
  cohort: "ALL",
  start: "",
  end: "",
  isRange: false,
};

// Turns a coordinator-typed custom label ("Sports Day") into a category
// string ("sports_day") -- same idea as a custom-family holiday, which
// stores whatever's typed as its own literal family/label rather than
// forcing it into one of the fixed scheduler categories.
function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// One column of the document-style key-dates table. Rows are either meta
// rows (commencement/teaching-end/term-end/non-instructional -- plain
// label + date, never editable) or event rows with inline start/end editing
// for at most one row per column at a time. Start and end dates are both
// freely editable for every event, including every exam category. A "+ Add
// Event" control at the bottom appends a brand-new event scoped to whatever
// categories belong in this column (categoryOptions). Style is chosen
// first, as a row of color swatches (one per family actually relevant to
// this column, same colors already used elsewhere in the document) --
// picking one infers the category too -- a family covering more than one
// category (e.g. "Reviews / Feedback / Detention") just takes its first one,
// since they share the same color/column placement anyway and the typed
// label is what actually conveys which one this is. "Custom" is the odd one
// out: it's an actual color picker (event.color),
// for a one-off event that doesn't fit any predefined family/color at all.
export default function MilestoneColumn({
  rows,
  colors,
  onReschedule,
  onAddEvent,
  onRemoveEvent,
  onMarkHoliday,
  onUnmarkHoliday,
  categoryOptions,
  canEdit,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editLabel, setEditLabel] = useState("");
  // Most events are single-day, so the end-date field only shows once this
  // is explicitly checked -- seeded from whether the event actually is a
  // range already, not just always shown alongside start.
  const [editIsRange, setEditIsRange] = useState(false);
  // Editing an event's color is opt-in: it starts off (the event keeps
  // whichever color it already renders with, family-derived or a prior
  // custom one) so admins who only move a date never touch color at all.
  // Checking the box surfaces a picker seeded with that same current color.
  const [editColorOverride, setEditColorOverride] = useState(false);
  const [editColor, setEditColor] = useState("#cccccc");

  // Editable meta rows (currently just "Non Instructional" ranges -- see
  // row.family below) have no event id to key off of, so this tracks by
  // row index instead. Separate from the event-row edit state above since
  // a meta row edit reschedules a holiday range (unmark old dates + mark
  // the new range), not an event.
  const [editingMetaIndex, setEditingMetaIndex] = useState(null);
  const [editMetaStart, setEditMetaStart] = useState("");
  const [editMetaEnd, setEditMetaEnd] = useState("");

  const [isAdding, setIsAdding] = useState(false);
  const [addValues, setAddValues] = useState(ADD_INITIAL);

  function startEditing(event) {
    setEditingId(event.id);
    setEditStart(event.start);
    setEditEnd(event.end);
    setEditLabel(event.label || "");
    setEditIsRange(event.start !== event.end);
    const family = familyKeyForCategory(event.category);
    setEditColorOverride(Boolean(event.color));
    setEditColor(event.color || colors[family] || "#cccccc");
  }

  function saveEdit() {
    const end = editIsRange ? editEnd || editStart : editStart;
    onReschedule(editingId, editStart, end, editLabel, editColorOverride ? editColor : null);
    setEditingId(null);
  }

  function startEditingMeta(i, row) {
    setEditingMetaIndex(i);
    setEditMetaStart(row.start);
    setEditMetaEnd(row.end);
  }

  async function saveMetaEdit(row) {
    for (const date of datesBetween(row.start, row.end)) {
      await onUnmarkHoliday(date);
    }
    await onMarkHoliday(editMetaStart, editMetaEnd, row.label, row.family);
    setEditingMetaIndex(null);
  }

  async function removeMetaRow(row) {
    for (const date of datesBetween(row.start, row.end)) {
      await onUnmarkHoliday(date);
    }
  }

  function updateAdd(field, value) {
    setAddValues((prev) => ({ ...prev, [field]: value }));
  }

  function chooseFamily(group) {
    // The specific category within a multi-category family (Reviews/
    // Feedback/Detention, ...) has no real behavioral difference an admin
    // needs to choose between here -- family/color and column placement
    // are the same for all of them, and the typed label already says what
    // the event actually is. Always take the group's first category so
    // there's nothing further to pick.
    setAddValues((prev) => ({ ...prev, familyKey: group.familyKey, category: group.categories[0].value, customCategory: "" }));
  }

  function chooseCustom() {
    setAddValues((prev) => ({ ...prev, familyKey: "custom", category: "" }));
  }

  // Style/color is meant to be a suggestion to change, not a gate that
  // blocks saving -- pre-select the first available one so an admin who
  // never touches the swatch row can still save with label+dates alone.
  function openAdd() {
    setIsAdding(true);
    if (categoryOptions.length > 0) chooseFamily(categoryOptions[0]);
  }

  function toggleAddIsRange(checked) {
    setAddValues((prev) => ({ ...prev, isRange: checked, end: checked && !prev.end ? prev.start : prev.end }));
  }

  function saveAdd() {
    const { label, familyKey, category, customCategory, customColor, cohort, start, end, isRange } = addValues;
    const resolvedCategory = familyKey === "custom" ? slugify(customCategory || label) : category;
    const color = familyKey === "custom" ? customColor : undefined;
    onAddEvent(label, resolvedCategory, cohort, start, isRange ? end || start : start, color);
    setAddValues(ADD_INITIAL);
    setIsAdding(false);
  }

  const canSaveAdd =
    addValues.label.trim() &&
    addValues.start &&
    (addValues.familyKey === "custom" ? true : Boolean(addValues.familyKey));

  return (
    <div className="milestone-column">
      {rows.map((row, i) => {
        if (row.type === "meta") {
          const bg = row.family && AGENDA_HIGHLIGHT_FAMILIES.has(row.family) ? colors[row.family] : null;
          const style = bg ? { "--row-bg": bg, "--row-fg": contrastText(bg) } : undefined;
          // Only "Non Instructional" ranges are actually editable here --
          // the term-boundary rows (Commencement/Teaching End/Term End)
          // have no `family` at all and always stay static; a coordinator-
          // typed "Custom" holiday range's real family/name isn't
          // recoverable from this row (it's collapsed to the literal
          // string "custom" for coloring purposes), so it's excluded too.
          const editableMeta = canEdit && row.family === "non_instructional" && row.origin !== "inherited";

          if (editableMeta && editingMetaIndex === i) {
            return (
              <div className="milestone-row-editing no-print" key={`meta-${i}`}>
                <span className="milestone-edit-label">{row.label}</span>
                <input type="date" value={editMetaStart} onChange={(e) => setEditMetaStart(e.target.value)} />
                <input type="date" value={editMetaEnd} onChange={(e) => setEditMetaEnd(e.target.value)} />
                <button className="btn btn-primary" onClick={() => saveMetaEdit(row)}>
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditingMetaIndex(null)}>
                  Cancel
                </button>
              </div>
            );
          }
          return (
            <div className={`milestone-row milestone-row-meta${bg ? " milestone-row-colored" : ""}`} style={style} key={`meta-${i}`}>
              <span className="milestone-label">{row.label}</span>
              <span className="milestone-date">{formatRange(row.start, row.end)}</span>
              {editableMeta && (
                <button
                  className="milestone-edit-btn no-print"
                  title="Move this range"
                  aria-label={`Move ${row.label}`}
                  onClick={() => startEditingMeta(i, row)}
                >
                  <EditIcon />
                </button>
              )}
              {editableMeta && (
                <button
                  type="button"
                  className="repeatable-remove no-print"
                  title="Remove this range"
                  aria-label={`Remove ${row.label}`}
                  onClick={() => removeMetaRow(row)}
                >
                  &times;
                </button>
              )}
            </div>
          );
        }
        return (
          <MilestoneRow
            key={row.event.id}
            event={row.event}
            colors={colors}
            canEdit={canEdit}
            isEditing={editingId === row.event.id}
            editStart={editStart}
            editEnd={editEnd}
            editLabel={editLabel}
            editIsRange={editIsRange}
            editColorOverride={editColorOverride}
            editColor={editColor}
            onChangeIsRange={(checked) => {
              setEditIsRange(checked);
              if (checked && !editEnd) setEditEnd(editStart);
            }}
            onChangeColorOverride={setEditColorOverride}
            onChangeColor={setEditColor}
            onStartEdit={() => startEditing(row.event)}
            onChangeStart={setEditStart}
            onChangeEnd={setEditEnd}
            onChangeLabel={setEditLabel}
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
            onRemove={() => onRemoveEvent(row.event.id)}
          />
        );
      })}

      {canEdit && isAdding && (
        <div className="milestone-row-adding no-print">
          <input
            type="text"
            className="milestone-edit-label"
            value={addValues.label}
            onChange={(e) => updateAdd("label", e.target.value)}
            placeholder="Event name"
          />

          <div className="swatch-picker">
            {categoryOptions.map((group) => {
              // Not every family actually gets a filled background in the
              // calendar grid -- "Reviews / Feedback / Detention" is
              // deliberately de-emphasized instead (no fill, just the day
              // underlined in grey -- see COLORED_GRID_FAMILIES), so its
              // swatch previews that same underline treatment rather than
              // a solid color that selecting it wouldn't actually produce.
              const muted = !COLORED_GRID_FAMILIES.has(group.familyKey);
              return (
                <button
                  type="button"
                  key={group.familyKey}
                  className={`swatch-btn${muted ? " swatch-btn-muted" : ""}${addValues.familyKey === group.familyKey ? " swatch-btn-active" : ""}`}
                  style={muted ? undefined : { "--swatch-bg": colors[group.familyKey] }}
                  title={group.familyLabel}
                  aria-label={group.familyLabel}
                  onClick={() => chooseFamily(group)}
                />
              );
            })}
            <button
              type="button"
              className={`swatch-btn swatch-btn-custom${addValues.familyKey === "custom" ? " swatch-btn-active" : ""}`}
              style={addValues.familyKey === "custom" ? { "--swatch-bg": addValues.customColor } : undefined}
              title="Custom color"
              aria-label="Custom color"
              onClick={chooseCustom}
            >
              {addValues.familyKey !== "custom" && "?"}
            </button>
          </div>

          {addValues.familyKey === "custom" && (
            <>
              <input
                type="color"
                value={addValues.customColor}
                onChange={(e) => updateAdd("customColor", e.target.value)}
                title="Pick a color"
              />
              <input
                type="text"
                value={addValues.customCategory}
                onChange={(e) => updateAdd("customCategory", e.target.value)}
                placeholder="Custom category (optional)"
              />
            </>
          )}

          <input type="date" value={addValues.start} onChange={(e) => updateAdd("start", e.target.value)} />
          <label className="milestone-edit-color">
            <input type="checkbox" checked={addValues.isRange} onChange={(e) => toggleAddIsRange(e.target.checked)} />
            Range
          </label>
          {addValues.isRange && (
            <input type="date" value={addValues.end} onChange={(e) => updateAdd("end", e.target.value)} />
          )}
          <button className="btn btn-primary" disabled={!canSaveAdd} onClick={saveAdd}>
            Save
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setIsAdding(false);
              setAddValues(ADD_INITIAL);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {canEdit && !isAdding && (
        <button className="milestone-add-btn no-print" onClick={openAdd}>
          + Add Event
        </button>
      )}
    </div>
  );
}
