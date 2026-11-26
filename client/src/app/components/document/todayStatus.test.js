import { describe, expect, it } from "vitest";
import { getTodayStatus } from "./todayStatus.js";

function draftWith({ holidays = [], events = [] }) {
  return { meta: {}, holidays, events };
}

describe("getTodayStatus", () => {
  it("returns an empty array when nothing is active today", () => {
    const draft = draftWith({
      events: [{ category: "mid_sem_exam", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams" }],
    });
    expect(getTodayStatus(draft, "2026-09-10")).toEqual([]);
  });

  it("reports an active foreground event with days left", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", cohort: "ALL", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams" },
      ],
    });
    expect(getTodayStatus(draft, "2026-09-25")).toEqual([{ label: "Mid-Sem Exams", daysLeftText: "3 days left" }]);
  });

  it("says 'ends today' on the last day of an event", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", cohort: "ALL", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams" },
      ],
    });
    expect(getTodayStatus(draft, "2026-09-28")).toEqual([{ label: "Mid-Sem Exams", daysLeftText: "ends today" }]);
  });

  it("says '1 day left' the day before an event ends", () => {
    const draft = draftWith({
      events: [
        { category: "mid_sem_exam", cohort: "ALL", start: "2026-09-21", end: "2026-09-28", label: "Mid-Sem Exams" },
      ],
    });
    expect(getTodayStatus(draft, "2026-09-27")).toEqual([{ label: "Mid-Sem Exams", daysLeftText: "1 day left" }]);
  });

  it("ignores background-only categories (e.g. Value Addition Program)", () => {
    const draft = draftWith({
      events: [
        { category: "value_addition_program", cohort: "ALL", start: "2026-07-20", end: "2026-08-22", label: "Value Addition Program" },
      ],
    });
    expect(getTodayStatus(draft, "2026-08-01")).toEqual([]);
  });

  it("reports a holiday alongside a concurrent background event", () => {
    const draft = draftWith({
      holidays: [{ date: "2026-08-01", name: "Independence Day" }],
      events: [
        { category: "value_addition_program", cohort: "ALL", start: "2026-07-20", end: "2026-08-22", label: "Value Addition Program" },
      ],
    });
    expect(getTodayStatus(draft, "2026-08-01")).toEqual([{ label: "Independence Day", daysLeftText: "ends today" }]);
  });

  it("groups a multi-day holiday range to compute the correct days left", () => {
    const draft = draftWith({
      holidays: [
        { date: "2026-11-07", name: "Diwali" },
        { date: "2026-11-08", name: "Diwali" },
        { date: "2026-11-09", name: "Diwali" },
      ],
    });
    expect(getTodayStatus(draft, "2026-11-07")).toEqual([{ label: "Diwali", daysLeftText: "2 days left" }]);
  });

  it("appends the cohort when the label doesn't already mention it", () => {
    const draft = draftWith({
      events: [{ category: "project_review", cohort: "SY", start: "2026-08-25", end: "2026-08-25", label: "Project Review II" }],
    });
    expect(getTodayStatus(draft, "2026-08-25")).toEqual([{ label: "Project Review II (SY)", daysLeftText: "ends today" }]);
  });

  it("reports multiple holidays that coincide on the same date", () => {
    const draft = draftWith({
      holidays: [
        { date: "2026-05-01", name: "Maharashtra Din" },
        { date: "2026-05-01", name: "Budha Pournima" },
      ],
    });
    expect(getTodayStatus(draft, "2026-05-01")).toEqual([
      { label: "Maharashtra Din", daysLeftText: "ends today" },
      { label: "Budha Pournima", daysLeftText: "ends today" },
    ]);
  });
});
