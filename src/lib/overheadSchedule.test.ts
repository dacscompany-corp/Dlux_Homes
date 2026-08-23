import { describe, it, expect } from "vitest";
import {
  occurrencesBetween,
  dueDateFor,
  occurrencesPerYear,
  monthlyEquivalent,
  DUE_SOON_DAYS,
  type ScheduleDef,
} from "./overheadSchedule";

const monthly: ScheduleDef = {
  frequency: "monthly",
  start_date: "2026-01-15",
  due_day: 15,
};

describe("dueDateFor", () => {
  it("uses the due day inside the period's month", () => {
    expect(dueDateFor("2026-03-01", 15, "monthly")).toBe("2026-03-15");
  });

  it("clamps day 31 to the last day of a short month", () => {
    expect(dueDateFor("2026-02-01", 31, "monthly")).toBe("2026-02-28");
    expect(dueDateFor("2028-02-01", 31, "monthly")).toBe("2028-02-29");
    expect(dueDateFor("2026-04-01", 31, "monthly")).toBe("2026-04-30");
  });

  it("falls back to the period start when no due day is set", () => {
    expect(dueDateFor("2026-03-09", null, "monthly")).toBe("2026-03-09");
  });

  it("ignores due_day for day- and week-based frequencies", () => {
    expect(dueDateFor("2026-03-09", 15, "weekly")).toBe("2026-03-09");
    expect(dueDateFor("2026-03-09", 15, "daily")).toBe("2026-03-09");
  });
});

describe("occurrencesBetween — monthly", () => {
  it("generates one occurrence per month within the window", () => {
    const out = occurrencesBetween(monthly, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("ends each period the day before the next starts", () => {
    const out = occurrencesBetween(monthly, "2026-01-01", "2026-02-28");
    expect(out[0].period_end).toBe("2026-02-14");
  });

  it("clamps a month-end start date in short months", () => {
    const jan31: ScheduleDef = { frequency: "monthly", start_date: "2026-01-31" };
    const out = occurrencesBetween(jan31, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("excludes occurrences before the window", () => {
    const out = occurrencesBetween(monthly, "2026-03-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual(["2026-03-15", "2026-04-15"]);
  });

  it("stops at end_date", () => {
    const ending: ScheduleDef = { ...monthly, end_date: "2026-03-20" };
    const out = occurrencesBetween(ending, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });

  it("is deterministic — the same window twice yields identical output", () => {
    const a = occurrencesBetween(monthly, "2026-01-01", "2026-06-30");
    const b = occurrencesBetween(monthly, "2026-01-01", "2026-06-30");
    expect(a).toEqual(b);
  });
});

describe("occurrencesBetween — other frequencies", () => {
  it("quarterly steps three months", () => {
    const def: ScheduleDef = { frequency: "quarterly", start_date: "2026-01-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01",
    ]);
  });

  it("semiannual steps six months", () => {
    const def: ScheduleDef = { frequency: "semiannual", start_date: "2026-02-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual(["2026-02-01", "2026-08-01"]);
  });

  it("annual yields one per year", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-03-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2028-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-03-01", "2027-03-01", "2028-03-01",
    ]);
  });

  it("weekly steps seven days across a month boundary", () => {
    const def: ScheduleDef = { frequency: "weekly", start_date: "2026-01-29" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-02-20");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-29", "2026-02-05", "2026-02-12", "2026-02-19",
    ]);
  });

  it("daily steps one day across a leap day", () => {
    const def: ScheduleDef = { frequency: "daily", start_date: "2028-02-27" };
    const out = occurrencesBetween(def, "2028-02-27", "2028-03-01");
    expect(out.map((o) => o.period_start)).toEqual([
      "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01",
    ]);
  });

  it("one-time yields exactly one occurrence ending on its start", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2026-05-04" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out).toHaveLength(1);
    expect(out[0].period_start).toBe("2026-05-04");
    expect(out[0].period_end).toBe("2026-05-04");
  });

  it("one-time outside the window yields nothing", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2025-05-04" };
    expect(occurrencesBetween(def, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("custom every 10 days", () => {
    const def: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-01",
      interval_count: 10, interval_unit: "day",
    };
    const out = occurrencesBetween(def, "2026-01-01", "2026-02-01");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-01", "2026-01-11", "2026-01-21", "2026-01-31",
    ]);
  });

  it("custom every 2 months", () => {
    const def: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-15",
      interval_count: 2, interval_unit: "month",
    };
    const out = occurrencesBetween(def, "2026-01-01", "2026-07-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15", "2026-03-15", "2026-05-15", "2026-07-15",
    ]);
  });
});

describe("occurrencesPerYear and monthlyEquivalent", () => {
  it("maps each fixed frequency", () => {
    const at = (f: ScheduleDef["frequency"]) =>
      occurrencesPerYear({ frequency: f, start_date: "2026-01-01" });
    expect(at("daily")).toBe(365);
    expect(at("weekly")).toBe(52);
    expect(at("monthly")).toBe(12);
    expect(at("quarterly")).toBe(4);
    expect(at("semiannual")).toBe(2);
    expect(at("annual")).toBe(1);
  });

  it("treats one-time as non-recurring", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2026-01-01" };
    expect(occurrencesPerYear(def)).toBe(0);
    expect(monthlyEquivalent(def, 6000)).toBe(0);
  });

  it("smooths a quarterly bill into a monthly figure", () => {
    const def: ScheduleDef = { frequency: "quarterly", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 6000)).toBe(2000);
  });

  it("smooths an annual bill into a monthly figure", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 6000)).toBe(500);
  });

  it("computes custom intervals", () => {
    const everyTwoMonths: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-01",
      interval_count: 2, interval_unit: "month",
    };
    expect(occurrencesPerYear(everyTwoMonths)).toBe(6);
    expect(monthlyEquivalent(everyTwoMonths, 1000)).toBe(500);
  });

  it("rounds to two decimals", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 1000)).toBe(83.33);
  });
});

describe("DUE_SOON_DAYS", () => {
  it("is the single tunable for the due-soon window", () => {
    expect(DUE_SOON_DAYS).toBe(7);
  });
});
