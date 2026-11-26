import { useState } from "react";
import { datesBetween, formatRange } from "../shared/dateUtils.js";
import { HOLIDAY_FAMILY_OPTIONS } from "../shared/categoryFamilies.js";

const ADD_INITIAL = { name: "", family: "holiday", start: "", end: "", isRange: false, colorOverride: false, color: "#cccccc" };

// The red holidays column of the document's key-dates table -- pre-grouped
// into ranges by buildMilestoneSheet so a multi-day festival prints as one
// row. Holiday edits normally go through DayEditor (click a day on the
// calendar grid); this adds the same mark/unmark actions directly here too.
export default function HolidayColumn({ rows, colors, onMarkHoliday, onUnmarkHoliday, canEdit }) {
  const [isAdding, setIsAdding] = useState(false);
  const [addValues, setAddValues] = useState(ADD_INITIAL);

  function updateAdd(field, value) {
    setAddValues((prev) => ({ ...prev, [field]: value }));
  }

  // The family select already picks a sensible default color -- checking
  // this box just seeds the picker with that same color to override, so
  // an admin who never touches it still gets the ordinary family color.
  function toggleColorOverride(checked) {
    setAddValues((prev) => ({ ...prev, colorOverride: checked, color: colors[prev.family] || prev.color }));
  }

  function toggleIsRange(checked) {
    setAddValues((prev) => ({ ...prev, isRange: checked, end: checked && !prev.end ? prev.start : prev.end }));
  }

  function saveAdd() {
    const { name, family, start, end, isRange, colorOverride, color } = addValues;
    onMarkHoliday(start, isRange ? end || start : start, name, family, colorOverride ? color : undefined);
    setAddValues(ADD_INITIAL);
    setIsAdding(false);
  }

  // A grouped range (e.g. a 5-day Diwali block) has no per-day ids to
  // target individually -- unmark is a per-date backend call, so removing
  // a whole range just calls it once for every date in the range.
  async function removeRow(row) {
    for (const date of datesBetween(row.start, row.end)) {
      await onUnmarkHoliday(date);
    }
  }

  return (
    <div className="milestone-column holiday-column">
      {rows.map((row, i) => {
        const editable = canEdit && row.origin !== "inherited";
        return (
          <div className="milestone-row" key={i}>
            <span className="milestone-label">{row.name}</span>
            <span className="milestone-date">{formatRange(row.start, row.end)}</span>
            {canEdit && !editable && (
              <span className="milestone-inherited-tag no-print" title="Copied from the parent's calendar -- only they can edit or remove it">
                &#128274;
              </span>
            )}
            {editable && (
              <button
                type="button"
                className="repeatable-remove no-print"
                title="Remove this holiday"
                aria-label={`Remove ${row.name}`}
                onClick={() => removeRow(row)}
              >
                &times;
              </button>
            )}
          </div>
        );
      })}

      {canEdit && isAdding && (
        <div className="milestone-row-adding no-print">
          <input
            type="text"
            className="milestone-edit-label"
            value={addValues.name}
            onChange={(e) => updateAdd("name", e.target.value)}
            placeholder="Holiday name"
          />
          <select value={addValues.family} onChange={(e) => updateAdd("family", e.target.value)}>
            {HOLIDAY_FAMILY_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <input type="date" value={addValues.start} onChange={(e) => updateAdd("start", e.target.value)} />
          <label className="milestone-edit-color">
            <input type="checkbox" checked={addValues.isRange} onChange={(e) => toggleIsRange(e.target.checked)} />
            Range
          </label>
          {addValues.isRange && (
            <input type="date" value={addValues.end} onChange={(e) => updateAdd("end", e.target.value)} />
          )}
          <label className="milestone-edit-color">
            <input type="checkbox" checked={addValues.colorOverride} onChange={(e) => toggleColorOverride(e.target.checked)} />
            Custom color
          </label>
          {addValues.colorOverride && (
            <input type="color" value={addValues.color} onChange={(e) => updateAdd("color", e.target.value)} title="Pick a color" />
          )}
          <button className="btn btn-primary" disabled={!addValues.name.trim() || !addValues.start} onClick={saveAdd}>
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
        <button className="milestone-add-btn no-print" onClick={() => setIsAdding(true)}>
          + Add Holiday
        </button>
      )}
    </div>
  );
}
