import { useEffect, useState } from "react";
import FormField from "./FormField.jsx";
import HolidayListInput from "./HolidayListInput.jsx";
import NonInstructionalDaysInput from "./NonInstructionalDaysInput.jsx";
import { useCalendarApi } from "../../useCalendarApi.js";

// The "minimal fields" input: everything else about the term is derived by
// the backend scheduler agent from these values. Fields start blank -- no
// pre-filled example numbers -- so a coordinator always enters their own
// real values instead of accidentally submitting placeholder data.
const INITIAL = {
  academic_year: "",
  term: "",
  category: "",
  start_date: "", // required -- the coordinator's real term start date
  mid_sem_exam_days: "",
  end_sem_practical_days: "",
  end_sem_theory_days: "",
  term_weeks: "20", // varies year to year (2025-26 ran 21, 2026-27 runs 20)
};

// `lockedContext` (when given: {academic_year, term, category}) is set by
// calendar.jsx when this form is the *only* thing on the page -- an admin
// looking at a specific year/term/category that has no calendar yet. There's
// nothing to choose in that case (the URL already picked it), so those 3
// fields render as fixed context instead of editable inputs, and the
// category-options fetch (only needed to populate that dropdown) is
// skipped entirely.
export default function CoordinatorForm({ onGenerate, loading, lockedContext }) {
  const [values, setValues] = useState(() => ({ ...INITIAL, ...lockedContext }));
  const [holidays, setHolidays] = useState([]);
  const [nonInstructionalDays, setNonInstructionalDays] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryOptionsError, setCategoryOptionsError] = useState(null);
  const { getJSON } = useCalendarApi();

  // Which categories are valid depends on the term (Term I offers UG/PG/FY,
  // Term II offers UG/PG) -- fetched fresh whenever the coordinator picks a
  // term, never hardcoded here. A failed fetch is tracked separately from
  // "this term genuinely has no categories yet" so it doesn't silently
  // block calendar generation with no explanation. The route takes an
  // academic_year segment too (so a public visitor's request can be
  // filtered to that year's published calendars), but an admin always sees
  // every configured category regardless of it -- so a placeholder is fine
  // here whenever the coordinator hasn't typed a year yet.
  function fetchCategoryOptions(term) {
    setCategoryOptionsError(null);
    if (!term) {
      setCategoryOptions([]);
      return;
    }
    const year = values.academic_year || "unspecified";
    getJSON(`/calendar/categories/${encodeURIComponent(year)}/${encodeURIComponent(term)}`)
      .then(setCategoryOptions)
      .catch((err) => {
        setCategoryOptions([]);
        setCategoryOptionsError(err.message);
      });
  }

  useEffect(() => {
    if (lockedContext) return; // category is fixed, nothing to populate a dropdown for
    fetchCategoryOptions(values.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.term]);

  function update(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const holidayInputs = holidays
      .filter((h) => h.name && h.date)
      .map((h) => ({ name: h.name, start: h.date, family: "holiday" }));
    const nonInstructionalInputs = nonInstructionalDays
      .filter((p) => p.name && p.start)
      .map((p) => ({ name: p.name, start: p.start, end: p.end || null, family: "non_instructional" }));

    onGenerate({
      ...values,
      mid_sem_exam_days: Number(values.mid_sem_exam_days),
      end_sem_practical_days: Number(values.end_sem_practical_days),
      end_sem_theory_days: Number(values.end_sem_theory_days),
      term_weeks: Number(values.term_weeks),
      holidays: [...holidayInputs, ...nonInstructionalInputs],
    });
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Generate Calendar</h2>
      {lockedContext && (
        <p className="coordinator-form-context">
          Generating <strong>{lockedContext.academic_year} · {lockedContext.term} · {lockedContext.category}</strong>
        </p>
      )}
      <div className="form-grid">
        {!lockedContext && (
          <FormField label="Academic Year">
            <input
              value={values.academic_year}
              onChange={(e) => update("academic_year", e.target.value)}
              placeholder="e.g. 2026-2027"
              required
            />
          </FormField>
        )}
        {!lockedContext && (
          <FormField label="Term">
            <select
              value={values.term}
              onChange={(e) => setValues((prev) => ({ ...prev, term: e.target.value, category: "" }))}
              required
            >
              <option value="" disabled>
                Select term
              </option>
              <option>Term I</option>
              <option>Term II</option>
            </select>
          </FormField>
        )}
        {!lockedContext && (
          <FormField label="Category">
            <select
              value={values.category}
              onChange={(e) => update("category", e.target.value)}
              disabled={!values.term}
              required
            >
              <option value="" disabled>
                {values.term ? "Select category" : "Select a term first"}
              </option>
              {categoryOptions.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            {categoryOptionsError && (
              <div className="field-error">
                Couldn't load categories.{" "}
                <button type="button" className="field-error-retry" onClick={() => fetchCategoryOptions(values.term)}>
                  Retry
                </button>
              </div>
            )}
          </FormField>
        )}
        <FormField label="Term Start Date">
          <input
            type="date"
            value={values.start_date}
            onChange={(e) => update("start_date", e.target.value)}
            required
          />
        </FormField>
        <FormField label="No. of days for Mid-Sem Exam">
          <input
            type="number"
            min="1"
            value={values.mid_sem_exam_days}
            onChange={(e) => update("mid_sem_exam_days", e.target.value)}
            placeholder="e.g. 6"
            required
          />
        </FormField>
        <FormField label="No. of days for Practical Exam">
          <input
            type="number"
            min="1"
            value={values.end_sem_practical_days}
            onChange={(e) => update("end_sem_practical_days", e.target.value)}
            placeholder="e.g. 10"
            required
          />
        </FormField>
        <FormField label="No. of days for End Sem Exam">
          <input
            type="number"
            min="1"
            value={values.end_sem_theory_days}
            onChange={(e) => update("end_sem_theory_days", e.target.value)}
            placeholder="e.g. 10"
            required
          />
        </FormField>
        <FormField label="Total Weeks">
          <input
            type="number"
            min="1"
            value={values.term_weeks}
            onChange={(e) => update("term_weeks", e.target.value)}
            placeholder="e.g. 20"
            required
          />
        </FormField>
      </div>

      <HolidayListInput holidays={holidays} onChange={setHolidays} academicYear={values.academic_year} term={values.term} />
      <NonInstructionalDaysInput periods={nonInstructionalDays} onChange={setNonInstructionalDays} />

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Generating..." : "Generate Calendar"}
      </button>
    </form>
  );
}
