import { describe, expect, it } from "vitest";
import { resolvedColorFor } from "./monthGridHelpers.js";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

function draftWith({ events = [], holidays = [], overrides = {} }) {
  return {
    meta: { commencement: "2026-07-27", term_end: "2026-12-12" },
    events,
    holidays,
    day_color_overrides: overrides,
  };
}

describe("resolvedColorFor", () => {
  it("returns the family default color for a normal colored-grid event (Mid-Sem)", () => {
    const draft = draftWith({
      events: [{ category: "mid_sem_exam", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams" }],
    });
    expect(resolvedColorFor(new Date(2026, 8, 22), draft, DEFAULT_COLORS)).toBe(DEFAULT_COLORS.mid_sem);
  });

  it("prefers an event's own custom color over the family default", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams", color: "#ff0000" },
      ],
    });
    expect(resolvedColorFor(new Date(2026, 8, 22), draft, DEFAULT_COLORS)).toBe("#ff0000");
  });

  // Regression test: Project Review/Feedback/Detention ("review" family)
  // never gets a family-default fill (COLORED_GRID_FAMILIES excludes it),
  // but a custom color explicitly set on one of these events must still
  // show up on the grid -- this was silently ignored before the fix.
  it("shows a custom color on an otherwise-unfilled 'review' family event (e.g. Final Detention)", () => {
    const draft = draftWith({
      events: [{ category: "detention_list", start: "2026-11-05", end: "2026-11-05", label: "Final Detention", color: "#00ff00" }],
    });
    expect(resolvedColorFor(new Date(2026, 10, 5), draft, DEFAULT_COLORS)).toBe("#00ff00");
  });

  it("still renders no fill for a 'review' family event with no custom color", () => {
    const draft = draftWith({
      events: [{ category: "project_review", start: "2026-08-14", end: "2026-08-14", label: "TY and B.Tech Project Review I" }],
    });
    expect(resolvedColorFor(new Date(2026, 7, 14), draft, DEFAULT_COLORS)).toBeNull();
  });

  it("prefers a holiday's own custom color over its family default", () => {
    const draft = draftWith({
      holidays: [{ date: "2026-08-15", name: "Independence Day", family: "holiday", color: "#123456" }],
    });
    expect(resolvedColorFor(new Date(2026, 7, 15), draft, DEFAULT_COLORS)).toBe("#123456");
  });

  it("a per-date day_color_overrides entry still wins over everything else", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams", color: "#ff0000" },
      ],
      overrides: { "2026-09-22": "#abcdef" },
    });
    expect(resolvedColorFor(new Date(2026, 8, 22), draft, DEFAULT_COLORS)).toBe("#abcdef");
  });

  it("never fills the commencement or term_end day even if a colored event coincides", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", start: "2026-07-27", end: "2026-07-27", label: "Mid-Sem Exams", color: "#ff0000" },
      ],
    });
    expect(resolvedColorFor(new Date(2026, 6, 27), draft, DEFAULT_COLORS)).toBeNull();
  });
});
