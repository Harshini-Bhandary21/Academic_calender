import { buildOwnEventsSheet } from "./milestoneColumns.js";
import { CATEGORY_OPTIONS } from "../admin/eventOptions.js";
import MilestoneColumn from "./MilestoneColumn.jsx";
import HolidayColumn from "./HolidayColumn.jsx";

// The org-unit equivalent of MilestoneSheet, scoped to just one org unit's
// own additions (see OrgCalendarSection.jsx, which renders the institute-
// shaped MilestoneSheet above this -- locked, everything that org unit
// inherited -- and this block below it -- editable, everything it added
// itself). Reuses the exact same 4-column layout and the same
// MilestoneColumn/HolidayColumn components, just fed by
// buildOwnEventsSheet's plain left-to-right balancing instead of
// buildMilestoneSheet's category-routed columns, since an org unit's own
// events have no fixed semantic column to belong to the way the
// institute's do. Every event column gets the full, unfiltered category
// list (not the per-column subset the institute's columns use), for the
// same reason.
export default function OwnEventsSheet({
  title,
  events,
  holidays,
  colors,
  onReschedule,
  onAddEvent,
  onRemoveEvent,
  onMarkHoliday,
  onUnmarkHoliday,
  canEdit,
}) {
  const { columns, holidayRows } = buildOwnEventsSheet(events, holidays);

  return (
    <div className="own-events-sheet">
      <h2 className="own-events-heading">{title}</h2>
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
            categoryOptions={CATEGORY_OPTIONS}
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
    </div>
  );
}
