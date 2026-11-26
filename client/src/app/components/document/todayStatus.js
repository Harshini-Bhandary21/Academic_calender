// What's actively happening "right now" (today) on an open calendar -- every
// holiday coinciding on today's date (there can be more than one, e.g. two
// festivals landing together), plus the same single "foreground" event
// MonthGrid would color that day with. Background-only categories (Value
// Addition, AMCAT, Academic Audit, Summer Internship, ...) run concurrently
// with everything else and were never meant to read as "what's happening"
// (see categoryFamilies.js's BACKGROUND_FAMILIES), so they're excluded here
// too, same as the grid.
import { daysUntil, formatISO, groupConsecutive } from "../shared/dateUtils.js";
import { BACKGROUND_FAMILIES, familyKeyForCategory } from "../shared/categoryFamilies.js";
import { displayLabel } from "../milestones/milestoneColumns.js";

function daysLeftText(daysLeft) {
  if (daysLeft <= 0) return "ends today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

// `todayISO` defaults to the real current date but is overridable so this
// stays testable without mocking the system clock. Returns an array (empty
// if nothing's happening today) instead of a single entry, since multiple
// holidays can genuinely coincide.
export function getTodayStatus(draft, todayISO = formatISO(new Date())) {
  const { holidays, events } = draft;
  const statuses = [];

  for (const holidayToday of holidays.filter((h) => h.date === todayISO)) {
    // A multi-day holiday (e.g. Diwali week) is stored as one entry per
    // day sharing the same name -- group back into a range to know when
    // it actually ends, same as the milestone sheet's Holidays column.
    const sameName = holidays.filter((h) => h.name === holidayToday.name);
    const range = groupConsecutive(sameName).find((g) => todayISO >= g.start && todayISO <= g.end);
    const end = range ? range.end : todayISO;
    statuses.push({ label: holidayToday.name, daysLeftText: daysLeftText(daysUntil(todayISO, end)) });
  }

  const active = events.find(
    (e) => todayISO >= e.start && todayISO <= e.end && !BACKGROUND_FAMILIES.has(familyKeyForCategory(e.category))
  );
  if (active) {
    const label = active.label ? displayLabel(active) : active.category;
    statuses.push({ label, daysLeftText: daysLeftText(daysUntil(todayISO, active.end)) });
  }

  return statuses;
}
