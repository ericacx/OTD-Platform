import { describe, expect, it } from "vitest";

import { daysBetween, dueState, formatDate, formatDuration } from "./date";

const now = new Date(2026, 9, 21, 10, 0, 0);

describe("dueState", () => {
  it("reports overdue days for past dates", () => {
    expect(dueState("2026-10-17", now)).toEqual({ kind: "overdue", days: 4 });
  });

  it("reports today's cutoff time", () => {
    expect(dueState(new Date(2026, 9, 21, 18, 0), now)).toEqual({ kind: "today", time: "18:00" });
  });

  it("reports tomorrow and remaining days", () => {
    expect(dueState("2026-10-22", now)).toEqual({ kind: "tomorrow" });
    expect(dueState("2026-11-24", now)).toEqual({ kind: "remaining", days: 34 });
  });

  it("treats a passed time today as overdue by zero days", () => {
    expect(dueState(new Date(2026, 9, 21, 8, 0), now)).toEqual({ kind: "overdue", days: 0 });
  });
});

describe("formatters", () => {
  it("formats dates and datetimes", () => {
    expect(formatDate("2026-10-03")).toBe("2026-10-03");
    expect(formatDate(new Date(2026, 9, 3, 9, 5), true)).toBe("2026-10-03 09:05");
    expect(formatDate(null)).toBe("—");
  });

  it("computes day differences", () => {
    expect(daysBetween("2026-10-21", "2026-12-16")).toBe(56);
  });

  it("formats durations in hours or days", () => {
    expect(formatDuration(10)).toEqual({ value: 10, unit: "hour" });
    expect(formatDuration(67.2)).toEqual({ value: 2.8, unit: "day" });
  });
});
