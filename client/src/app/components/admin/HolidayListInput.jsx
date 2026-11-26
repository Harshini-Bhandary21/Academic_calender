import { useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL;
let idCounter = 0;
const nextId = () => `holiday-row-${idCounter++}`;

// Term I runs Jul-Dec, Term II runs Jan-Jun (of the *following* calendar
// year -- academicYear "2026-2027" 's Term II happens in 2027, not 2026).
// Both which calendar year to fetch defaults for, and which of that year's
// dates are even relevant, depend on which term is being generated.
// Exported for direct unit testing -- see HolidayListInput.test.js.
export function yearForTerm(academicYear, term) {
  const [firstYear, secondYear] = (academicYear || "").split("-");
  return term === "Term II" ? parseInt(secondYear, 10) : parseInt(firstYear, 10);
}

export function isInTermWindow(dateISO, term) {
  const month = parseInt(dateISO.slice(5, 7), 10);
  return term === "Term II" ? month <= 6 : month >= 7;
}

// Repeatable name+date rows for the coordinator's upfront holiday list --
// pre-filled once from /calendar/holiday-defaults/{year} (real dates only;
// never a guess for years we haven't verified movable festivals for), then
// fully editable/addable/removable before generation. Only defaults that
// actually fall within the selected term's own months are kept -- a Jul-Dec
// Term I calendar has no use for a January holiday row, and vice versa.
export default function HolidayListInput({ holidays, onChange, academicYear, term }) {
  const fetchedFor = useRef(null);

  useEffect(() => {
    const year = yearForTerm(academicYear, term);
    if (!year || !term || holidays.length > 0) return;
    const key = `${year}-${term}`;
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;
    fetch(`${API_BASE}/calendar/holiday-defaults/${year}`)
      .then((res) => res.json())
      .then((defaults) =>
        onChange(
          defaults.filter((d) => isInTermWindow(d.start, term)).map((d) => ({ id: nextId(), name: d.name, date: d.start }))
        )
      )
      // A failed prefill isn't fatal -- the coordinator can still type
      // holidays in by hand -- so no error banner, just a console trace
      // for anyone debugging why the list came up empty.
      .catch((err) => console.warn("Couldn't load holiday defaults:", err));
  }, [academicYear, term, holidays.length, onChange]);

  function updateRow(id, field, value) {
    onChange(holidays.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }

  function addRow() {
    onChange([...holidays, { id: nextId(), name: "", date: "" }]);
  }

  function removeRow(id) {
    onChange(holidays.filter((h) => h.id !== id));
  }

  return (
    <div className="field">
      <label>Holidays</label>
      <div className="repeatable-list">
        {holidays.map((h) => (
          <div className="repeatable-row" key={h.id}>
            <input
              value={h.name}
              onChange={(e) => updateRow(h.id, "name", e.target.value)}
              placeholder="Holiday name"
            />
            <input type="date" value={h.date} onChange={(e) => updateRow(h.id, "date", e.target.value)} />
            <button type="button" className="repeatable-remove" onClick={() => removeRow(h.id)} title="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary repeatable-add" onClick={addRow}>
        + Add Holiday
      </button>
    </div>
  );
}
