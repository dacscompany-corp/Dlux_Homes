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

describe("occurrencesBetween — annual-window boundary", () => {
  // Guards the estimatedAnnual fix in overheadReportsController: `through` is
  // INCLUSIVE, so a window running to the same date next year counts the
  // anniversary as a thirteenth occurrence and inflates the annual estimate by
  // one period for every recurring expense — a 25,000 monthly bill read as
  // 325,000 a year instead of 300,000. The controller ends the day before;
  // these tests are why.
  const fromToday: ScheduleDef = { frequency: "monthly", start_date: "2026-08-24" };

  it("counts thirteen when the window includes the anniversary", () => {
    expect(occurrencesBetween(fromToday, "2026-08-24", "2027-08-24")).toHaveLength(13);
  });

  it("counts twelve when the window ends the day before", () => {
    expect(occurrencesBetween(fromToday, "2026-08-24", "2027-08-23")).toHaveLength(12);
  });

  it("still counts twelve when today falls between occurrences", () => {
    const fromFifth: ScheduleDef = { frequency: "monthly", start_date: "2026-08-05" };
    expect(occurrencesBetween(fromFifth, "2026-08-25", "2027-08-24")).toHaveLength(12);
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

// Fix round 1, Finding 1: occurrencesBetween must seek forward to `from`
// rather than always walking one step at a time from start_date — otherwise
// a long-lived schedule with a far-past start_date silently returns zero
// occurrences once the walk exhausts the iteration guard before reaching
// the requested window.
describe("occurrencesBetween — seeking forward past a far-past start_date", () => {
  it("returns the correct occurrences for a daily schedule decades after its start_date", () => {
    const def: ScheduleDef = { frequency: "daily", start_date: "2000-01-01" };
    const out = occurrencesBetween(def, "2029-01-01", "2029-01-10");
    expect(out.map((o) => o.period_start)).toEqual([
      "2029-01-01", "2029-01-02", "2029-01-03", "2029-01-04", "2029-01-05",
      "2029-01-06", "2029-01-07", "2029-01-08", "2029-01-09", "2029-01-10",
    ]);
  });

  it("returns the correct occurrences for a monthly schedule decades after its start_date", () => {
    const def: ScheduleDef = { frequency: "monthly", start_date: "1999-01-31", due_day: 31 };
    const out = occurrencesBetween(def, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
  });

  it("agrees with a full walk-from-the-beginning on every occurrence at or after a later `from`", () => {
    const def: ScheduleDef = { frequency: "monthly", start_date: "2000-01-01", due_day: 5 };
    const full = occurrencesBetween(def, "2000-01-01", "2026-06-30");
    const resumed = occurrencesBetween(def, "2026-01-01", "2026-06-30");
    const tailOfFull = full.filter((o) => o.period_start >= "2026-01-01");
    expect(resumed).toEqual(tailOfFull);
  });

  it("fails loudly instead of silently truncating when a window genuinely exceeds the iteration guard", () => {
    const def: ScheduleDef = { frequency: "daily", start_date: "2000-01-01" };
    expect(() => occurrencesBetween(def, "2000-01-01", "2030-01-01")).toThrow(
      /occurrencesBetween/,
    );
  });
});

// Fix round 1, Finding 2: dueDateFor's month-based check must agree with the
// module's own isMonthBased() helper, which also treats `custom` +
// `interval_unit: "month"` as month-based — otherwise a custom bi-monthly
// expense's due_day is silently ignored.
describe("dueDateFor — custom month-based frequency", () => {
  it("ignores due_day for custom frequency without an explicit month interval_unit", () => {
    expect(dueDateFor("2026-01-01", 20, "custom")).toBe("2026-01-01");
  });

  it("honors due_day for custom + month interval_unit", () => {
    expect(dueDateFor("2026-01-01", 20, "custom", "month")).toBe("2026-01-20");
  });

  it("clamps a custom + month due_day to the month's last day", () => {
    expect(dueDateFor("2026-02-01", 31, "custom", "month")).toBe("2026-02-28");
  });
});

describe("occurrencesBetween — custom bi-monthly honors due_day", () => {
  it("carries due_day through to each occurrence's due_date", () => {
    const def: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-01",
      interval_count: 2, interval_unit: "month", due_day: 20,
    };
    const out = occurrencesBetween(def, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.due_date)).toEqual(["2026-01-20", "2026-03-20"]);
  });
});
