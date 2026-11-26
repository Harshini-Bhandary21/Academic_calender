import { useState } from "react";
import { formatDisplay } from "../shared/dateUtils.js";
import { HOLIDAY_FAMILY_OPTIONS } from "../shared/categoryFamilies.js";

// Popup shown when a coordinator clicks a single day: see what's already
// scheduled on it, mark a new holiday alongside any that already exist
// (two festivals can genuinely coincide on one date), remove any one of
// them individually, and -- if this date has a real color clash between
// its holidays/events -- pick which color should actually render for it.
// Purely presentational -- the page performs the actual API calls and
// passes the current state in.
export default function DayEditor({
  date,
  holidays,
  scheduledEvents,
  colorCandidates,
  colors,
  onMarkHoliday,
  onRemoveHoliday,
  onSetDayColor,
  onClose,
}) {
  const [holidayName, setHolidayName] = useState("");
  const [holidayFamily, setHolidayFamily] = useState("holiday");
  const [customLabel, setCustomLabel] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [rangeEnd, setRangeEnd] = useState("");
  // Off by default so the family select's own color keeps winning unless
  // an admin deliberately wants a one-off shade for this holiday.
  const [colorOverride, setColorOverride] = useState(false);
  const [holidayColor, setHolidayColor] = useState("#cccccc");

  // "Custom" is a coordinator-typed category (e.g. "Sports Day") rather
  // than one of the two fixed Holiday/Non-Instructional buckets -- an
  // empty label just falls back to the literal "custom" family/color.
  const resolvedFamily =
    holidayFamily === "custom" && customLabel.trim() ? customLabel.trim() : holidayFamily;

  // A clash only exists when 2+ distinct colors are actually present --
  // a single candidate (or none at all) means there's nothing to pick
  // between, so this section stays hidden on an ordinary day.
  const distinctColors = new Set(colorCandidates.map((c) => c.color));
  const hasClash = distinctColors.size > 1;

  function handleMark() {
    onMarkHoliday(holidayName, isRange ? rangeEnd : null, resolvedFamily, colorOverride ? holidayColor : undefined);
    setHolidayName("");
    setHolidayFamily("holiday");
    setCustomLabel("");
    setIsRange(false);
    setRangeEnd("");
    setColorOverride(false);
  }

  function toggleColorOverride(checked) {
    setColorOverride(checked);
    if (checked) setHolidayColor(colors[holidayFamily] || holidayColor);
  }

  return (
    <div className="modal-overlay no-print" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="day-editor-title">{formatDisplay(date)}</h2>

        {scheduledEvents.length > 0 && (
          <div className="field">
            <label>Scheduled on this date</label>
            <ul className="scheduled-list">
              {scheduledEvents.map((e, i) => (
                <li key={i}>
                  {e.label}
                  {e.cohort !== "ALL" ? ` (${e.cohort})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {holidays.length > 0 && (
          <div className="field">
            <label>Holidays on this date</label>
            <ul className="scheduled-list">
              {holidays.map((h) => (
                <li key={h.id}>
                  {h.name}
                  <button
                    type="button"
                    className="repeatable-remove no-print"
                    title="Remove this holiday"
                    aria-label={`Remove ${h.name}`}
                    onClick={() => onRemoveHoliday(h.id)}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasClash && (
          <div className="field">
            <label>This date has more than one color -- pick which one to show</label>
            <div className="swatch-picker">
              {colorCandidates.map((c, i) => (
                <button
                  type="button"
                  key={i}
                  className="swatch-btn"
                  style={{ "--swatch-bg": c.color }}
                  title={c.label}
                  aria-label={`Use ${c.label}'s color`}
                  onClick={() => onSetDayColor(c.color)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Add a Holiday</label>
          <input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="e.g. Diwali"
          />
        </div>
        <div className="field">
          <label>Color</label>
          <select value={holidayFamily} onChange={(e) => setHolidayFamily(e.target.value)}>
            {HOLIDAY_FAMILY_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        {holidayFamily === "custom" && (
          <div className="field">
            <label>Category Label</label>
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Sports Day"
            />
          </div>
        )}
        <div className="field field-checkbox">
          <input type="checkbox" checked={isRange} onChange={(e) => setIsRange(e.target.checked)} id="day-editor-range-toggle" />
          <label htmlFor="day-editor-range-toggle">Extend through a range (e.g. Diwali week)</label>
        </div>
        <div className="field field-checkbox">
          <input
            type="checkbox"
            checked={colorOverride}
            onChange={(e) => toggleColorOverride(e.target.checked)}
            id="day-editor-color-toggle"
          />
          <label htmlFor="day-editor-color-toggle">Custom color</label>
          {colorOverride && (
            <input type="color" value={holidayColor} onChange={(e) => setHolidayColor(e.target.value)} title="Pick a color" />
          )}
        </div>
        {isRange && (
          <div className="field">
            <label htmlFor="day-editor-range-end">Through (end date)</label>
            <input
              id="day-editor-range-end"
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              min={date}
            />
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-primary"
            disabled={!holidayName.trim() || (isRange && !rangeEnd)}
            onClick={handleMark}
          >
            Create Event
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
