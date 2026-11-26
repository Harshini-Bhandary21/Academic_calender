import { describe, expect, it } from "vitest";
import { buildOwnEventsSheet } from "./milestoneColumns.js";

function event(id, start) {
  return { id, category: "custom", cohort: "ALL", start, end: start, label: id, origin: "own" };
}

function holiday(id, date, name = "Test Holiday") {
  return { id, date, name, family: "holiday", origin: "own" };
}

describe("buildOwnEventsSheet", () => {
  it("fills the first column completely before moving to the next", () => {
    // 7 events across 3 columns -> [3, 3, 1], not round-robin.
    const events = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => event(id, `2026-08-0${i + 1}`));
    const { columns } = buildOwnEventsSheet(events, []);
    expect(columns.map((c) => c.length)).toEqual([3, 3, 1]);
    expect(columns[0].map((r) => r.event.id)).toEqual(["a", "b", "c"]);
    expect(columns[2].map((r) => r.event.id)).toEqual(["g"]);
  });

  it("returns 3 empty columns when there are no own events", () => {
    const { columns } = buildOwnEventsSheet([], []);
    expect(columns).toEqual([[], [], []]);
  });

  it("sorts events chronologically before distributing across columns", () => {
    const events = [event("late", "2026-09-01"), event("early", "2026-08-01")];
    const { columns } = buildOwnEventsSheet(events, []);
    expect(columns.flatMap((c) => c.map((r) => r.event.id))).toEqual(["early", "late"]);
  });

  it("groups all own holidays into the one holiday column regardless of family", () => {
    const holidays = [holiday("h1", "2026-08-15"), holiday("h2", "2026-08-20", "Non-Instructional")];
    const { holidayRows } = buildOwnEventsSheet([], holidays);
    expect(holidayRows).toHaveLength(2);
  });

  it("merges consecutive same-named holidays into one range, same as the institute sheet", () => {
    const holidays = [
      holiday("h1", "2026-08-15", "Diwali"),
      holiday("h2", "2026-08-16", "Diwali"),
      holiday("h3", "2026-08-17", "Diwali"),
    ];
    const { holidayRows } = buildOwnEventsSheet([], holidays);
    expect(holidayRows).toEqual([{ start: "2026-08-15", end: "2026-08-17", name: "Diwali", family: "holiday", origin: "own" }]);
  });
});
