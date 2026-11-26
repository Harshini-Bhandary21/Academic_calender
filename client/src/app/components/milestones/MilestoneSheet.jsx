import { buildMilestoneSheet, CATEGORY_OPTIONS_BY_COLUMN } from "./milestoneColumns.js";
import MilestoneColumn from "./MilestoneColumn.jsx";
import HolidayColumn from "./HolidayColumn.jsx";

// The key-dates table laid out exactly like MITAOE's published calendar
// document: three untitled milestone columns (commencement/feedback/reviews,
// exams, results/re-exams) plus the red Holidays column. Column contents and
// ordering come from buildMilestoneSheet; program-type events shown in the
// InfoStrip above are excluded there.
export default function MilestoneSheet({
  draft,
  colors,
  onReschedule,
  onAddEvent,
  onRemoveEvent,
  onMarkHoliday,
  onUnmarkHoliday,
  canEdit,
}) {
  const { columns, holidayRows } = buildMilestoneSheet(draft);

  return (
    <div className="milestone-sheet">
      {columns.map((rows, i) => (
        <MilestoneColumn
          key={i}
          rows={rows}
          colors={colors}
          onReschedule={onReschedule}
          onAddEvent={onAddEvent}
          onRemoveEvent={onRemoveEvent}
          onMarkHoliday={onMarkHoliday}
          onUnmarkHoliday={onUnmarkHoliday}
          categoryOptions={CATEGORY_OPTIONS_BY_COLUMN[i]}
          canEdit={canEdit}
        />
      ))}
      <HolidayColumn
        rows={holidayRows}
        colors={colors}
        onMarkHoliday={onMarkHoliday}
        onUnmarkHoliday={onUnmarkHoliday}
        canEdit={canEdit}
      />
    </div>
  );
}
