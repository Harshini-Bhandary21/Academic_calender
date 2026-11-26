import { MONTH_NAMES, DAY_ABBRS, formatISO } from "../shared/dateUtils.js";
import { contrastText } from "../shared/colorUtils.js";
import { familyFor, resolvedColorFor, tooltipFor } from "./monthGridHelpers.js";
import { COLORED_GRID_FAMILIES } from "../shared/categoryFamilies.js";

export default function MonthGrid({ year, month, draft, colors, onSelectDay }) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();
  const trailing = (7 - ((startDow + daysInMonth) % 7)) % 7;
  const todayISO = formatISO(new Date());

  const cells = [];
  // Leading/trailing days belong to adjacent months -- left as blank white
  // cells rather than showing the neighboring month's numbers, since that
  // date already appears once in its own month's grid.
  for (let i = 0; i < startDow; i += 1) cells.push({ key: `lead-${i}`, empty: true });
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month - 1, d);
    const iso = formatISO(date);
    cells.push({
      key: iso,
      day: d,
      iso,
      family: familyFor(date, draft),
      resolvedColor: resolvedColorFor(date, draft, colors),
      title: tooltipFor(date, draft),
    });
  }
  for (let i = 0; i < trailing; i += 1) cells.push({ key: `trail-${i}`, empty: true });

  return (
    <div className="month-block">
      <div className="month-header">
        <span>{MONTH_NAMES[month - 1]}</span>
        <span>{year}</span>
      </div>
      <div className="day-names">
        {DAY_ABBRS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="days-grid">
        {cells.map((cell) => {
          if (cell.empty) return <div key={cell.key} className="day-cell empty" />;

          // Project Review/Feedback/Detention, a coordinator's typed
          // Custom-category label, and the Term-End marker -- no solid
          // background fill, just the day number underlined in light grey,
          // less prominent than an actual exam/holiday block. Excludes
          // "outside" explicitly -- that already gets its own grey/dimmed
          // treatment below and shouldn't also pick up the underline.
          const isMuted = cell.family && cell.family !== "outside" && !COLORED_GRID_FAMILIES.has(cell.family) && !cell.resolvedColor;
          const style = cell.resolvedColor
            ? { "--cell-bg": cell.resolvedColor, "--cell-fg": contrastText(cell.resolvedColor) }
            : undefined;
          const isToday = cell.iso === todayISO;

          return (
            <div
              key={cell.key}
              className={`day-cell clickable${cell.resolvedColor ? " day-cell-colored" : ""}${cell.family === "outside" ? " outside" : ""}${isMuted ? " day-cell-review" : ""}${isToday ? " day-cell-today" : ""}`}
              style={style}
              title={cell.title || undefined}
              // Every real day is clickable, including a plain "outside" day
              // beyond the term's weeks -- an admin needs to be able to mark
              // a holiday or add an event there too, not just on days
              // already inside the term.
              onClick={() => onSelectDay(cell.iso)}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
