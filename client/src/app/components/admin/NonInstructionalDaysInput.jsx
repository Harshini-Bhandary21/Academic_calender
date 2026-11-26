let idCounter = 0;
const nextId = () => `non-instructional-row-${idCounter++}`;

// Repeatable name+start+end rows for non-instructional day ranges (e.g. a
// Diwali break) -- entered upfront alongside the holiday list, instead of
// marked one day at a time after generation. Starts empty; unlike
// HolidayListInput there's no known set of these to pre-fill from.
export default function NonInstructionalDaysInput({ periods, onChange }) {
  function updateRow(id, field, value) {
    onChange(periods.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  function addRow() {
    onChange([...periods, { id: nextId(), name: "", start: "", end: "" }]);
  }

  function removeRow(id) {
    onChange(periods.filter((p) => p.id !== id));
  }

  return (
    <div className="field">
      <label>Non-Instructional Days (e.g. Diwali break)</label>
      <div className="repeatable-list">
        {periods.map((p) => (
          <div className="repeatable-row" key={p.id}>
            <input
              value={p.name}
              onChange={(e) => updateRow(p.id, "name", e.target.value)}
              placeholder="e.g. Diwali Break"
            />
            <input type="date" value={p.start} onChange={(e) => updateRow(p.id, "start", e.target.value)} />
            <input
              type="date"
              value={p.end}
              onChange={(e) => updateRow(p.id, "end", e.target.value)}
              min={p.start || undefined}
            />
            <button type="button" className="repeatable-remove" onClick={() => removeRow(p.id)} title="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary repeatable-add" onClick={addRow}>
        + Add Period
      </button>
    </div>
  );
}
