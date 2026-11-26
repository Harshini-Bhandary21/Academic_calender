import { formatISO, parseISO, isInRange } from "../shared/dateUtils.js";
import { familyKeyForCategory, BACKGROUND_FAMILIES, COLORED_GRID_FAMILIES } from "../shared/categoryFamilies.js";

// Works out which color family a single day falls into: the start day, a
// holiday, inside an event, outside the term, or a plain instructional day.
// Priority order matters -- a holiday or event always wins, even outside
// [commencement, term_end], so a holiday like Christmas that falls after a
// short term_end still shows up colored instead of silently disappearing;
// only a genuinely empty day outside the term falls back to "outside".
// Returns null for plain in-term days, which get no color at all.
export function familyFor(date, draft) {
  const iso = formatISO(date);
  const { meta, events, holidays } = draft;

  if (iso === meta.commencement) return "start";
  if (iso === meta.term_end) return "term_end";
  const holiday = holidays.find((h) => h.date === iso);
  if (holiday) return holiday.family || "holiday";

  // Multiple events can legitimately overlap a single day (e.g. Academic
  // Audit runs the whole month the Practical Exam sits inside) -- a
  // foreground one (an actual exam/review/etc.) should win the color over
  // a background one, not just whichever happens to appear first. Background
  // categories (Value Addition, AMCAT, Academic Audit, Summer Internship,
  // ...) run concurrently with everything else and MITAOE's own calendars
  // never grid-highlight them either -- they're informational (see the
  // agenda list and this day's tooltip), not a day-occupying color block.
  const foreground = events.find(
    (e) => isInRange(date, e.start, e.end) && !BACKGROUND_FAMILIES.has(familyKeyForCategory(e.category))
  );
  if (foreground) return familyKeyForCategory(foreground.category);

  // parseISO (not a bare `new Date(str)`) matters here: a plain "YYYY-MM-DD"
  // string parses as UTC midnight, while `date` is built in local time --
  // for timezones ahead of UTC that mismatch pushed the real commencement
  // day into "outside", making the term look like it started a day late.
  if (date < parseISO(meta.commencement) || date > parseISO(meta.term_end)) return "outside";

  return null;
}

export function tooltipFor(date, draft) {
  const iso = formatISO(date);
  const tips = [];
  if (iso === draft.meta.commencement) tips.push("Term commencement");
  if (iso === draft.meta.term_end) tips.push("Term end");
  draft.holidays.filter((h) => h.date === iso).forEach((h) => tips.push(h.name));
  draft.events.filter((e) => isInRange(date, e.start, e.end)).forEach((e) => tips.push(e.label));
  return tips.join(" | ");
}

// The color a day-cell actually renders as -- an explicit per-date
// override (see set-day-color, used to resolve a clash) always wins.
// Otherwise mirrors colorCandidatesFor()'s own per-item resolution: the
// winning holiday/event's own `color` override (if an admin set one via
// the edit form) wins over the family default -- picking a custom color
// for e.g. a Project Review or Final Detention (a de-emphasized "review"
// family that normally never gets a grid fill) now actually shows it,
// since MonthGrid's `isMuted` check already backs off whenever
// resolvedColor is truthy. Follows the exact same priority order as
// familyFor() (commencement/term_end > holiday > foreground event) so a
// holiday/event still wins over "outside" the same way.
export function resolvedColorFor(date, draft, colors) {
  const iso = formatISO(date);
  const override = draft.day_color_overrides && draft.day_color_overrides[iso];
  if (override) return override;

  const { meta, events, holidays } = draft;
  if (iso === meta.commencement || iso === meta.term_end) return null;

  const holiday = holidays.find((h) => h.date === iso);
  if (holiday) {
    const family = holiday.family || "holiday";
    return holiday.color || (COLORED_GRID_FAMILIES.has(family) ? colors[family] : null);
  }

  const foreground = events.find(
    (e) => isInRange(date, e.start, e.end) && !BACKGROUND_FAMILIES.has(familyKeyForCategory(e.category))
  );
  if (foreground) {
    const family = familyKeyForCategory(foreground.category);
    return foreground.color || (COLORED_GRID_FAMILIES.has(family) ? colors[family] : null);
  }

  return null;
}

// Every holiday (there can be several coinciding) plus the winning
// foreground event on this date, each with its own actually-resolved
// color -- but only ones that would really render a fill (see
// COLORED_GRID_FAMILIES), since there's no color to choose *between* for
// something that's normally unfilled. Used to offer a pick when 2+ of
// these have different colors -- a "clash" -- via DayEditor; a single
// candidate (or none) means there's nothing to resolve.
export function colorCandidatesFor(date, draft, colors) {
  const iso = formatISO(date);
  const candidates = [];

  for (const h of draft.holidays) {
    if (h.date !== iso) continue;
    const family = h.family || "holiday";
    const color = h.color || (COLORED_GRID_FAMILIES.has(family) ? colors[family] : null);
    if (color) candidates.push({ label: h.name, color });
  }

  const foreground = draft.events.find(
    (e) => isInRange(date, e.start, e.end) && !BACKGROUND_FAMILIES.has(familyKeyForCategory(e.category))
  );
  if (foreground) {
    const family = familyKeyForCategory(foreground.category);
    const color = foreground.color || (COLORED_GRID_FAMILIES.has(family) ? colors[family] : null);
    if (color) candidates.push({ label: foreground.label, color });
  }

  return candidates;
}
