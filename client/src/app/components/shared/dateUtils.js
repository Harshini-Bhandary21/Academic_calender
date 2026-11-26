// Date helpers shared by the calendar components. Kept in one place so every
// component parses/compares dates the same way (local time, not UTC).

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseISO(iso) {
  return iso ? new Date(iso + "T00:00:00") : null;
}

export function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isInRange(date, startISO, endISO) {
  return date >= parseISO(startISO) && date <= parseISO(endISO);
}

const MONTH_ABBRS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// One display format everywhere -- "5 JAN", never "05 JAN" or "5th January" --
// so dates read consistently across the agenda, stats bar, and day editor.
export function formatDisplay(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTH_ABBRS[d.getMonth()]}`;
}

export function formatRange(startISO, endISO) {
  return startISO === endISO ? formatDisplay(startISO) : `${formatDisplay(startISO)} to ${formatDisplay(endISO)}`;
}

// List of {year, month} (month is 1-indexed) spanning [startISO, endISO] inclusive.
export function monthsBetween(startISO, endISO) {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const months = [];
  let year = start.getFullYear();
  let month = start.getMonth() + 1;
  while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth() + 1)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

// Exam blocks the "addition" figure below counts -- Mid-Sem is included even
// though it typically falls *before* teaching_end (and so mostly overlaps
// the `base` window), since each category here is now counted independently
// and summed, not deduped against `base` or against each other. This is a
// deliberate display-only choice, confirmed with the coordinator: a Mid-Sem
// week's own Saturday still counts as a real teaching day too (it's part of
// `base`'s Mon-Sat window), so it's fine for it to also be counted as part
// of Mid-Sem's own exam-day total -- the two figures aren't meant to be
// mutually exclusive, just two different lenses on the same term.
const EXTRA_INSTRUCTIONAL_CATEGORIES = ["mid_sem_exam", "end_sem_exam", "practical_exam", "project_examination"];

// Display-only breakdown for the "TOTAL (base+addition)" figure the
// published calendar shows -- NOT used for the backend's actual
// MIN_INSTRUCTIONAL_DAYS compliance check (see rules_helpers.py's own
// count_instructional_days, which intentionally stays a true deduped
// distinct-day count for that purpose and is not affected by this).
//
// base: every weekday (Mon-Sat) between commencement and teaching_end that
// isn't a holiday -- the "total teaching days" component.
//
// addition: each exam category's own distinct day count (Mon-Fri,
// non-holiday -- even past teaching_end), computed independently per
// category and summed. A day that's both a teaching day and an exam day
// (e.g. Mid-Sem week falling inside the term) is deliberately allowed to be
// counted in both `base` and `addition` -- see the constant comment above.
export function countInstructionalDays(commencementISO, teachingEndISO, holidays, events = []) {
  const holidayDates = new Set(holidays.map((h) => h.date));

  const teachingDays = new Set();
  const current = parseISO(commencementISO);
  const end = parseISO(teachingEndISO);
  while (current <= end) {
    const iso = formatISO(current);
    if (current.getDay() !== 0 && !holidayDates.has(iso)) teachingDays.add(iso);
    current.setDate(current.getDate() + 1);
  }
  const base = teachingDays.size;

  let addition = 0;
  for (const category of EXTRA_INSTRUCTIONAL_CATEGORIES) {
    const categoryDays = new Set();
    for (const event of events) {
      if (event.category !== category) continue;
      const cur = parseISO(event.start);
      const evEnd = parseISO(event.end);
      while (cur <= evEnd) {
        const iso = formatISO(cur);
        const dow = cur.getDay(); // 0=Sun ... 6=Sat
        if (dow !== 0 && dow !== 6 && !holidayDates.has(iso)) categoryDays.add(iso);
        cur.setDate(cur.getDate() + 1);
      }
    }
    addition += categoryDays.size;
  }

  return { base, addition, total: base + addition };
}

export function countWeeks(startISO, endISO) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((parseISO(endISO) - parseISO(startISO)) / msPerWeek);
}

// Whole days from one ISO date to another (positive if `toISO` is later) --
// used for "N days left" style displays (see todayStatus.js).
export function daysUntil(fromISO, toISO) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseISO(toISO) - parseISO(fromISO)) / msPerDay);
}

export function isNextDay(fromISO, toISO) {
  const next = parseISO(fromISO);
  next.setDate(next.getDate() + 1);
  return formatISO(next) === toISO;
}

// Collapses a flat, possibly-unsorted list of {date, name} entries into
// {start, end, name} runs wherever the same name appears on consecutive
// days -- e.g. nine daily "Diwali Holidays" entries become one
// 07 Nov - 15 Nov range, matching how the institute's own calendars print
// multi-day blocks as a single range instead of one line per day.
export function groupConsecutive(items) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.name && isNextDay(last.end, item.date)) {
      last.end = item.date;
      // A range is only ever editable/removable as a whole (see
      // HolidayColumn/MilestoneColumn's unmark-per-date loop), so if any
      // single day in it is inherited, the whole group is -- same
      // all-or-nothing rule the backend's _assert_no_inherited_holiday_on
      // enforces for a single date with 2+ coinciding holidays.
      if (item.origin === "inherited") last.origin = "inherited";
    } else {
      groups.push({ start: item.date, end: item.date, name: item.name, family: item.family, origin: item.origin || "own" });
    }
  }
  return groups;
}

// The inverse of groupConsecutive's ranges -- every individual date from
// startISO to endISO inclusive. Used wherever a grouped multi-day range
// (a holiday range, a non-instructional block) needs to be unmarked one
// day at a time, since the backend's unmark-holiday endpoint is per-date.
export function datesBetween(startISO, endISO) {
  const dates = [];
  const cur = parseISO(startISO);
  const end = parseISO(endISO);
  while (cur <= end) {
    dates.push(formatISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
