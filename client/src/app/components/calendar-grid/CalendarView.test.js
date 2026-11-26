import { describe, expect, it } from "vitest";
import { fullRange } from "./CalendarView.jsx";

// A spread of academic years across multiple decades -- the Jul-Dec /
// Jan-Jun capping logic has to keep working correctly for any future
// year, not just whatever happens to be current, so these tests
// deliberately don't anchor to one hardcoded example.
const ACADEMIC_YEARS = ["2024-2025", "2026-2027", "2030-2031", "2045-2046", "2099-2100"];

// Regression coverage for a real bug: adding an event/holiday dated
// outside the term used to widen the rendered month grid with no limit
// (e.g. a stray June-dated event pulled an extra month onto a July-start
// Term I page). fullRange() is now a hard rule driven purely by the term
// and its commencement year -- Term I is always exactly July-December,
// Term II is always exactly January-June, regardless of term_end or any
// holiday/event date. Those out-of-range dates still list correctly
// wherever they actually render (milestone sheet/info strip); they just
// never add an extra month-grid page here.
describe("fullRange", () => {
  it.each(ACADEMIC_YEARS)("Term I of %s is always July 1 to December 31", (academicYear) => {
    const [firstYear] = academicYear.split("-");
    const draft = {
      meta: { term: "Term I", commencement: `${firstYear}-07-27`, term_end: `${firstYear}-12-12` },
      holidays: [],
      events: [],
    };
    expect(fullRange(draft)).toEqual({ start: `${firstYear}-07-01`, end: `${firstYear}-12-31` });
  });

  it.each(ACADEMIC_YEARS)(
    "Term I of %s ignores an event/holiday dated well outside July-December",
    (academicYear) => {
      const [firstYear, secondYear] = academicYear.split("-");
      const draft = {
        meta: { term: "Term I", commencement: `${firstYear}-07-27`, term_end: `${firstYear}-12-12` },
        holidays: [{ date: `${firstYear}-06-10` }],
        events: [{ start: `${secondYear}-01-05`, end: `${secondYear}-01-10` }],
      };
      expect(fullRange(draft)).toEqual({ start: `${firstYear}-07-01`, end: `${firstYear}-12-31` });
    }
  );

  it.each(ACADEMIC_YEARS)("Term II of %s is always January 1 to June 30", (academicYear) => {
    const [, secondYear] = academicYear.split("-");
    const draft = {
      meta: { term: "Term II", commencement: `${secondYear}-01-04`, term_end: `${secondYear}-06-15` },
      holidays: [],
      events: [],
    };
    expect(fullRange(draft)).toEqual({ start: `${secondYear}-01-01`, end: `${secondYear}-06-30` });
  });

  it.each(ACADEMIC_YEARS)(
    "Term II of %s ignores an event/holiday dated well outside January-June",
    (academicYear) => {
      const [firstYear, secondYear] = academicYear.split("-");
      const draft = {
        meta: { term: "Term II", commencement: `${secondYear}-01-04`, term_end: `${secondYear}-06-15` },
        holidays: [{ date: `${firstYear}-12-28` }],
        events: [{ start: `${secondYear}-07-10`, end: `${secondYear}-07-12` }],
      };
      expect(fullRange(draft)).toEqual({ start: `${secondYear}-01-01`, end: `${secondYear}-06-30` });
    }
  );
});
