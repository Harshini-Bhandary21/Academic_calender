import { useState } from "react";
import { countInstructionalDays, countWeeks, formatRange } from "../shared/dateUtils.js";
import EditIcon from "../icons/EditIcon.jsx";

// The italic summary band the published calendar prints between the month
// grids and the key-dates table: long-running programs, AMCAT windows, the
// industry-practicum schedule, and the term totals. Entirely data-driven --
// cells only render when the draft actually contains their events, so a
// calendar generated without some of these programs simply shows fewer
// cells rather than an empty placeholder. `event` is only set for real
// event-backed lines (not the two computed Total Weeks/Instructional Days
// lines), which is what makes a line editable.
const line = (label, text, event = null) => ({ label, text, event });

function cellLines(events, category, textFor) {
  return events.filter((e) => e.category === category).map(textFor);
}

const ADD_INITIAL = { label: "", category: "", cohort: "ALL", start: "", end: "", isRange: false };

// Only the one cell that spans two categories needs human-readable labels
// for its category picker -- every other cell's category is implicit.
const CATEGORY_LABELS = {
  value_addition_program: "Value Addition Program",
  makeup_remedial_sessions: "Make-up/Remedial Sessions",
};

export default function InfoStrip({ draft, onReschedule, onAddEvent, onRemoveEvent, canEdit }) {
  const { meta, events, holidays } = draft;
  const asRange = (e) => line(e.label, formatRange(e.start, e.end), e);

  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editLabel, setEditLabel] = useState("");
  // Most of these entries are single-day, so the end-date field stays
  // hidden unless this is checked -- seeded from whether the event is
  // already a real range when editing starts.
  const [editIsRange, setEditIsRange] = useState(false);

  const [addingCell, setAddingCell] = useState(null);
  const [addValues, setAddValues] = useState(ADD_INITIAL);

  function startEditing(event) {
    setEditingId(event.id);
    setEditStart(event.start);
    setEditEnd(event.end);
    setEditLabel(event.label || "");
    setEditIsRange(event.start !== event.end);
  }

  function saveEdit() {
    const end = editIsRange ? editEnd || editStart : editStart;
    onReschedule(editingId, editStart, end, editLabel);
    setEditingId(null);
  }

  function toggleEditIsRange(checked) {
    setEditIsRange(checked);
    if (checked && !editEnd) setEditEnd(editStart);
  }

  function startAdding(cellIndex, defaultCategory) {
    setAddingCell(cellIndex);
    setAddValues({ ...ADD_INITIAL, category: defaultCategory });
  }

  function updateAdd(field, value) {
    setAddValues((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAddIsRange(checked) {
    setAddValues((prev) => ({ ...prev, isRange: checked, end: checked && !prev.end ? prev.start : prev.end }));
  }

  function saveAdd() {
    const { label, category, cohort, start, end, isRange } = addValues;
    onAddEvent(label, category, cohort, start, isRange ? end || start : start);
    setAddingCell(null);
    setAddValues(ADD_INITIAL);
  }

  const instDays = countInstructionalDays(meta.commencement, meta.teaching_end, holidays, events);

  // Each cell's `categories` is what a new event added from that cell can
  // be filed under -- empty for the two computed Total Weeks/Instructional
  // Days lines, which aren't backed by a real event at all.
  const cellDefs = [
    {
      categories: ["value_addition_program", "makeup_remedial_sessions"],
      lines: [
        ...cellLines(events, "value_addition_program", asRange),
        ...cellLines(events, "makeup_remedial_sessions", asRange),
      ],
    },
    { categories: ["prototyping_phase"], lines: cellLines(events, "prototyping_phase", asRange) },
    {
      categories: [],
      lines: [
        line("Total Weeks", `${countWeeks(meta.commencement, meta.term_end)} WEEKS`),
        line(
          "Total Instructional Days",
          `${instDays.total} DAYS (${instDays.base} teaching + ${instDays.addition} exam)`
        ),
      ],
    },
    {
      categories: ["amcat_assessment"],
      lines: cellLines(events, "amcat_assessment", (e) => line(`AMCAT Assessment ${e.cohort}`, formatRange(e.start, e.end), e)),
    },
    { categories: ["summer_internship_review"], lines: cellLines(events, "summer_internship_review", asRange) },
    {
      categories: ["industry_practicum_evaluation"],
      lines: cellLines(events, "industry_practicum_evaluation", asRange),
    },
  ].filter((cell) => cell.lines.length > 0 || cell.categories.length > 0);

  return (
    <div className="info-strip">
      {cellDefs.map((cell, i) => (
        <div className="info-strip-cell" key={i}>
          {cell.lines.map((l, j) => {
            if (l.event && canEdit && editingId === l.event.id) {
              return (
                <div className="info-strip-row-editing no-print" key={j}>
                  <input
                    type="text"
                    className="info-strip-edit-label"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Label"
                  />
                  <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                  <label className="milestone-edit-color">
                    <input type="checkbox" checked={editIsRange} onChange={(e) => toggleEditIsRange(e.target.checked)} />
                    Range
                  </label>
                  {editIsRange && (
                    <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                  )}
                  <button className="btn btn-primary" onClick={saveEdit}>
                    Save
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              );
            }
            const editable = l.event && canEdit && l.event.origin !== "inherited";
            return (
              <div key={j}>
                {l.label}: <span className="info-strip-value">{l.text}</span>
                {l.event && canEdit && !editable && (
                  <span className="milestone-inherited-tag no-print" title="Copied from the parent's calendar -- only they can edit or remove it">
                    &#128274;
                  </span>
                )}
                {editable && (
                  <button
                    className="milestone-edit-btn no-print"
                    title="Edit this entry"
                    aria-label={`Edit ${l.label}`}
                    onClick={() => startEditing(l.event)}
                  >
                    <EditIcon />
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    className="repeatable-remove no-print"
                    title="Remove this entry"
                    aria-label={`Remove ${l.label}`}
                    onClick={() => onRemoveEvent(l.event.id)}
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}

          {canEdit && cell.categories.length > 0 && addingCell === i && (
            <div className="info-strip-row-adding no-print">
              <input
                type="text"
                className="info-strip-edit-label"
                value={addValues.label}
                onChange={(e) => updateAdd("label", e.target.value)}
                placeholder="Label"
              />
              {cell.categories.length > 1 && (
                <select value={addValues.category} onChange={(e) => updateAdd("category", e.target.value)}>
                  {cell.categories.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] || c}
                    </option>
                  ))}
                </select>
              )}
              <input type="date" value={addValues.start} onChange={(e) => updateAdd("start", e.target.value)} />
              <label className="milestone-edit-color">
                <input type="checkbox" checked={addValues.isRange} onChange={(e) => toggleAddIsRange(e.target.checked)} />
                Range
              </label>
              {addValues.isRange && (
                <input type="date" value={addValues.end} onChange={(e) => updateAdd("end", e.target.value)} />
              )}
              <button className="btn btn-primary" disabled={!addValues.label.trim() || !addValues.start} onClick={saveAdd}>
                Save
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setAddingCell(null);
                  setAddValues(ADD_INITIAL);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {canEdit && cell.categories.length > 0 && addingCell !== i && (
            <button className="info-strip-add-btn no-print" onClick={() => startAdding(i, cell.categories[0])}>
              + Add
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
