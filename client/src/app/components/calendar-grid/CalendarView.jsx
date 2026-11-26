import MonthGrid from "./MonthGrid.jsx";
import { monthsBetween } from "../shared/dateUtils.js";

// The calendar grid is strictly clipped to the term's own calendar-month
// bounds -- Term I is always July-December, Term II is always
// January-June, full stop, regardless of what any individual holiday or
// event is dated. A stray/incorrectly-dated event (or a genuinely early
// milestone like Value Addition Program starting a week before
// commencement) never spills the grid into an extra month; it still lists
// correctly wherever it actually renders (the milestone sheet/info strip),
// just not as its own month-grid page here.
// Exported (in addition to being used internally below) so the Term I/
// Term II month-capping logic can be unit-tested directly without needing
// to render the component -- see CalendarView.test.js.
export function fullRange(draft) {
  const { meta } = draft;
  const year = meta.commencement.slice(0, 4);
  if (meta.term === "Term II") {
    return { start: `${year}-01-01`, end: `${year}-06-30` };
  }
  return { start: `${year}-07-01`, end: `${year}-12-31` };
}

// Lays out every month spanning the term (plus any out-of-range holiday/
// event dates), three per row.
export default function CalendarView({ draft, colors, onSelectDay }) {
  const { start, end } = fullRange(draft);
  const months = monthsBetween(start, end);
  const rows = [];
  for (let i = 0; i < months.length; i += 3) rows.push(months.slice(i, i + 3));

  return (
    <div className="calendar-rows">
      {rows.map((row, i) => (
        <div className="calendar-row" key={i}>
          {row.map(({ year, month }) => (
            <MonthGrid
              key={`${year}-${month}`}
              year={year}
              month={month}
              draft={draft}
              colors={colors}
              onSelectDay={onSelectDay}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
