import { describe, expect, it } from "vitest";
import { isInTermWindow, yearForTerm } from "./HolidayListInput.jsx";

// A spread of academic years across multiple decades -- this app has to
// keep computing the right calendar year and term window for any future
// year, not just whatever happens to be current when this was written, so
// these tests deliberately don't anchor to one hardcoded example.
const ACADEMIC_YEARS = ["2024-2025", "2026-2027", "2030-2031", "2045-2046", "2099-2100"];

describe("yearForTerm", () => {
  it.each(ACADEMIC_YEARS)("uses the first calendar year for Term I of %s", (academicYear) => {
    const [firstYear] = academicYear.split("-").map(Number);
    expect(yearForTerm(academicYear, "Term I")).toBe(firstYear);
  });

  it.each(ACADEMIC_YEARS)(
    "uses the second calendar year for Term II of %s (runs the following Jan-Jun)",
    (academicYear) => {
      const [, secondYear] = academicYear.split("-").map(Number);
      expect(yearForTerm(academicYear, "Term II")).toBe(secondYear);
    }
  );
});

describe("isInTermWindow", () => {
  it.each(ACADEMIC_YEARS)("keeps a Jul-Dec date and excludes a Jan-Jun date for Term I of %s", (academicYear) => {
    const [firstYear] = academicYear.split("-");
    expect(isInTermWindow(`${firstYear}-08-15`, "Term I")).toBe(true);
    expect(isInTermWindow(`${firstYear}-01-26`, "Term I")).toBe(false);
  });

  it.each(ACADEMIC_YEARS)("keeps a Jan-Jun date and excludes a Jul-Dec date for Term II of %s", (academicYear) => {
    const [firstYear, secondYear] = academicYear.split("-");
    expect(isInTermWindow(`${secondYear}-01-26`, "Term II")).toBe(true);
    expect(isInTermWindow(`${firstYear}-12-25`, "Term II")).toBe(false);
  });

  it.each(ACADEMIC_YEARS)("treats the June/July boundary correctly for %s", (academicYear) => {
    const [firstYear, secondYear] = academicYear.split("-");
    expect(isInTermWindow(`${secondYear}-06-30`, "Term II")).toBe(true);
    expect(isInTermWindow(`${firstYear}-07-01`, "Term II")).toBe(false);
    expect(isInTermWindow(`${firstYear}-07-01`, "Term I")).toBe(true);
    expect(isInTermWindow(`${firstYear}-06-30`, "Term I")).toBe(false);
  });
});
