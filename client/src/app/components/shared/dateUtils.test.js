import { describe, expect, it } from "vitest";
import {
  countInstructionalDays,
  countWeeks,
  daysUntil,
  formatDisplay,
  formatISO,
  formatRange,
  groupConsecutive,
  isInRange,
  isNextDay,
  monthsBetween,
  parseISO,
} from "./dateUtils.js";

describe("parseISO / formatISO", () => {
  it("round-trips a plain ISO date", () => {
    expect(formatISO(parseISO("2026-07-15"))).toBe("2026-07-15");
  });

  it("returns null for an empty/falsy input", () => {
    expect(parseISO("")).toBeNull();
    expect(parseISO(null)).toBeNull();
  });
});

describe("isInRange", () => {
  it("includes both endpoints", () => {
    const start = parseISO("2026-01-05");
    expect(isInRange(parseISO("2026-01-01"), "2026-01-01", "2026-01-10")).toBe(true);
    expect(isInRange(parseISO("2026-01-10"), "2026-01-01", "2026-01-10")).toBe(true);
    expect(isInRange(start, "2026-01-01", "2026-01-10")).toBe(true);
  });

  it("excludes dates outside the range", () => {
    expect(isInRange(parseISO("2025-12-31"), "2026-01-01", "2026-01-10")).toBe(false);
    expect(isInRange(parseISO("2026-01-11"), "2026-01-01", "2026-01-10")).toBe(false);
  });
});

describe("formatDisplay / formatRange", () => {
  it("formats a single date as 'D MON'", () => {
    expect(formatDisplay("2026-01-05")).toBe("5 JAN");
    expect(formatDisplay("2026-12-25")).toBe("25 DEC");
  });

  it("collapses a same-day range to one date", () => {
    expect(formatRange("2026-01-05", "2026-01-05")).toBe("5 JAN");
  });

  it("renders a multi-day range as 'X to Y'", () => {
    expect(formatRange("2026-01-05", "2026-01-08")).toBe("5 JAN to 8 JAN");
  });
});

describe("monthsBetween", () => {
  it("lists every month within a single year", () => {
    expect(monthsBetween("2026-07-15", "2026-09-02")).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it("carries over into the next year", () => {
    expect(monthsBetween("2026-12-15", "2027-01-10")).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it("returns a single month when start and end fall in the same month", () => {
    expect(monthsBetween("2026-03-01", "2026-03-20")).toEqual([{ year: 2026, month: 3 }]);
  });
});

describe("daysUntil", () => {
  it("counts whole days forward", () => {
    expect(daysUntil("2026-09-25", "2026-09-28")).toBe(3);
  });

  it("is 0 for the same date", () => {
    expect(daysUntil("2026-09-28", "2026-09-28")).toBe(0);
  });

  it("is negative when `toISO` is earlier", () => {
    expect(daysUntil("2026-09-28", "2026-09-25")).toBe(-3);
  });
});

describe("countWeeks", () => {
  it("rounds to the nearest whole week", () => {
    expect(countWeeks("2026-01-01", "2026-01-15")).toBe(2);
  });
});

describe("isNextDay", () => {
  it("is true for consecutive calendar days", () => {
    expect(isNextDay("2026-01-01", "2026-01-02")).toBe(true);
  });

  it("is false when a day is skipped", () => {
    expect(isNextDay("2026-01-01", "2026-01-03")).toBe(false);
  });

  it("is true across a month boundary", () => {
    expect(isNextDay("2026-01-31", "2026-02-01")).toBe(true);
  });
});

describe("groupConsecutive", () => {
  it("merges consecutive same-named days into one range", () => {
    const items = [
      { date: "2026-11-07", name: "Diwali" },
      { date: "2026-11-08", name: "Diwali" },
      { date: "2026-11-09", name: "Diwali" },
    ];
    expect(groupConsecutive(items)).toEqual([
      { start: "2026-11-07", end: "2026-11-09", name: "Diwali", family: undefined, origin: "own" },
    ]);
  });

  it("keeps a gap in the same name as separate ranges", () => {
    const items = [
      { date: "2026-11-07", name: "Diwali" },
      { date: "2026-11-09", name: "Diwali" },
    ];
    expect(groupConsecutive(items)).toEqual([
      { start: "2026-11-07", end: "2026-11-07", name: "Diwali", family: undefined, origin: "own" },
      { start: "2026-11-09", end: "2026-11-09", name: "Diwali", family: undefined, origin: "own" },
    ]);
  });

  it("keeps different names on consecutive days as separate ranges", () => {
    const items = [
      { date: "2026-11-07", name: "Diwali" },
      { date: "2026-11-08", name: "Bhai Dooj" },
    ];
    expect(groupConsecutive(items)).toEqual([
      { start: "2026-11-07", end: "2026-11-07", name: "Diwali", family: undefined, origin: "own" },
      { start: "2026-11-08", end: "2026-11-08", name: "Bhai Dooj", family: undefined, origin: "own" },
    ]);
  });

  it("marks the whole range inherited if any single day in it is", () => {
    const items = [
      { date: "2026-11-07", name: "Diwali", origin: "own" },
      { date: "2026-11-08", name: "Diwali", origin: "inherited" },
    ];
    expect(groupConsecutive(items)).toEqual([
      { start: "2026-11-07", end: "2026-11-08", name: "Diwali", family: undefined, origin: "inherited" },
    ]);
  });
});

describe("countInstructionalDays", () => {
  // 2026-01-05 is a Monday, 2026-01-11 is the following Sunday.
  it("counts Mon-Sat between commencement and teaching_end, excluding Sundays and holidays", () => {
    const result = countInstructionalDays("2026-01-05", "2026-01-11", [], []);
    expect(result).toEqual({ base: 6, addition: 0, total: 6 });
  });

  it("excludes a holiday from the base count", () => {
    const result = countInstructionalDays("2026-01-05", "2026-01-11", [{ date: "2026-01-07" }], []);
    expect(result).toEqual({ base: 5, addition: 0, total: 5 });
  });

  it("counts an exam category's own Mon-Fri, non-holiday days independently of base", () => {
    const holidays = [{ date: "2026-01-07" }];
    const events = [{ category: "mid_sem_exam", start: "2026-01-10", end: "2026-01-12" }];
    // base = 5 (Jan 5,6,8,9,10 -- Jan 7 is a holiday, Jan 11 is Sunday).
    // Mid-Sem's own count: Jan 10 (Sat, excluded), 11 (Sun, excluded), 12 (Mon) -> 1.
    const result = countInstructionalDays("2026-01-05", "2026-01-11", holidays, events);
    expect(result).toEqual({ base: 5, addition: 1, total: 6 });
  });

  it("counts an exam category's days even where they overlap base's window (not deduped)", () => {
    // Mid-Sem entirely inside [commencement, teaching_end] -- its own
    // Mon-Fri, non-holiday days are still added to `addition`, even though
    // the same calendar dates are also already part of `base`.
    const events = [{ category: "mid_sem_exam", start: "2026-01-05", end: "2026-01-09" }];
    // base = 6 (Jan 5,6,7,8,9,10 -- Jan 11 is Sunday, excluded).
    // Mid-Sem (Jan 5 Mon - Jan 9 Fri, all weekdays, no Sat/Sun in range) -> 5 days, fully overlapping base.
    const result = countInstructionalDays("2026-01-05", "2026-01-11", [], events);
    expect(result).toEqual({ base: 6, addition: 5, total: 11 });
  });

  it("ignores event categories that aren't instructional-day-eligible", () => {
    const events = [{ category: "value_addition_program", start: "2026-01-12", end: "2026-01-14" }];
    const result = countInstructionalDays("2026-01-05", "2026-01-11", [], events);
    expect(result).toEqual({ base: 6, addition: 0, total: 6 });
  });

  // Regression test for a real 2026-27 Term I calendar -- a holiday
  // (Anant Chaturdashi, 25 Sep) falls right inside the Mid-Sem window
  // alongside its own weekend, dropping it to 5 days rather than the
  // naive 7-calendar-day span. Mid-Sem's days also fall inside `base`
  // (confirmed with the coordinator that this double-count is intentional
  // for this display-only figure), so total = 82 + 25 = 107, not 102.
  it("matches a real term's exam-day breakdown (Mid-Sem 5 + Practical 9 + End-Sem 8 + Project Exam 3 = 25)", () => {
    const holidays = [
      { date: "2026-08-15" }, // Independence Day
      { date: "2026-08-26" }, // Eid-e-Milad
      { date: "2026-09-14" }, // Ganesh Chaturthi
      { date: "2026-09-25" }, // Anant Chaturdashi -- inside the Mid-Sem window
      { date: "2026-10-02" }, // Gandhi Jayanti
      { date: "2026-10-20" }, // Dusshera
    ];
    const events = [
      { category: "mid_sem_exam", start: "2026-09-21", end: "2026-09-28" },
      { category: "practical_exam", start: "2026-11-16", end: "2026-11-26" },
      { category: "practical_exam", start: "2026-11-26", end: "2026-11-26" }, // MDM, same day as Practical's last day
      { category: "end_sem_exam", start: "2026-11-27", end: "2026-12-08" },
      { category: "project_examination", start: "2026-12-09", end: "2026-12-09" },
      { category: "project_examination", start: "2026-12-10", end: "2026-12-10" },
      { category: "project_examination", start: "2026-12-11", end: "2026-12-11" },
    ];
    const result = countInstructionalDays("2026-07-27", "2026-11-05", holidays, events);
    expect(result).toEqual({ base: 82, addition: 25, total: 107 });
  });
});
