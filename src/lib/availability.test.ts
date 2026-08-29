import { describe, it, expect } from "vitest";
import {
  openWindowsOn,
  isRangeOpen,
  openDatesAhead,
  loadCalendarRules,
  loadHavenContext,
  type Queryable,
  type HavenContext,
} from "./availability";
import type { StayWindow } from "./messenger-reply";

const WINDOWS: StayWindow[] = [
  { stayType: "10", label: "Daycation", checkIn: "07:00", checkOut: "17:00" },
  { stayType: "10", label: "Nightcation", checkIn: "19:00", checkOut: "05:00" },
  { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" },
];

const CTX: HavenContext = {
  roomName: "D’Lux Homes — Tower 4 Grass Residences",
  havenId: "9c49022d-8efd-41e8-bf39-98cb1a8beb29",
  windows: WINDOWS,
};

const AFTERNOON = new Date("2026-08-29T13:00:00+08:00");

/** Records every query and replies with canned rows. */
function stub(
  rowsFor: (sql: string, values: unknown[]) => Record<string, unknown>[],
): Queryable & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query(sql: string, values: unknown[] = []) {
      calls.push(sql);
      return { rows: rowsFor(sql, values) };
    },
  };
}

describe("openWindowsOn", () => {
  it("returns every window when nothing conflicts", async () => {
    const db = stub(() => []);
    const out = await openWindowsOn("2026-09-04", CTX, db, AFTERNOON);
    expect(out.map((w) => w.label)).toEqual(["Daycation", "Nightcation", "Overnight"]);
  });

  it("drops a window that has a conflicting booking", async () => {
    // values[2] is the window's check-in TIME, so this blocks both 7PM windows.
    const db = stub((_sql, values) => (String(values[2]) === "19:00" ? [{ conflict: 1 }] : []));
    const out = await openWindowsOn("2026-09-04", CTX, db, AFTERNOON);
    expect(out.map((w) => w.label)).toEqual(["Daycation"]);
  });

  it("drops a window whose start has already passed today", async () => {
    const db = stub(() => []);
    // 8PM Manila: the 7AM Daycation and both 7PM windows have all started.
    const out = await openWindowsOn("2026-08-29", CTX, db, new Date("2026-08-29T20:00:00+08:00"));
    expect(out).toEqual([]);
  });

  it("still offers this evening's windows when asked in the morning", async () => {
    const db = stub(() => []);
    const out = await openWindowsOn("2026-08-29", CTX, db, new Date("2026-08-29T09:00:00+08:00"));
    expect(out.map((w) => w.label)).toEqual(["Nightcation", "Overnight"]);
  });

  it("keeps future dates unaffected by the current time", async () => {
    const db = stub(() => []);
    const out = await openWindowsOn("2026-09-04", CTX, db, new Date("2026-08-29T20:00:00+08:00"));
    expect(out).toHaveLength(3);
  });

  it("applies the turnover buffer and checks blocked dates", async () => {
    const db = stub(() => []);
    await openWindowsOn("2026-09-04", CTX, db, AFTERNOON);
    expect(db.calls[0]).toContain("INTERVAL");
    expect(db.calls[0]).toContain("blocked_dates");
  });
});

describe("isRangeOpen", () => {
  const overnight = WINDOWS[2];

  it("is true when no conflict row comes back", async () => {
    const db = stub(() => []);
    expect(await isRangeOpen("2026-09-04", 2, overnight, CTX, db)).toBe(true);
  });

  it("is false when a conflict row comes back", async () => {
    const db = stub(() => [{ conflict: 1 }]);
    expect(await isRangeOpen("2026-09-04", 2, overnight, CTX, db)).toBe(false);
  });

  it("checks out `nights` days after check-in", async () => {
    let seen: unknown[] = [];
    const db: Queryable = {
      async query(_sql: string, values: unknown[] = []) {
        seen = values;
        return { rows: [] };
      },
    };
    await isRangeOpen("2026-09-04", 2, overnight, CTX, db);
    expect(seen).toContain("2026-09-06");
  });

  it("wraps a Nightcation onto the next calendar day", async () => {
    let seen: unknown[] = [];
    const db: Queryable = {
      async query(_sql: string, values: unknown[] = []) {
        seen = values;
        return { rows: [] };
      },
    };
    await isRangeOpen("2026-09-04", 1, WINDOWS[1], CTX, db);
    expect(seen).toContain("2026-09-05");
  });

  it("keeps a Daycation on the same calendar day", async () => {
    let seen: unknown[] = [];
    const db: Queryable = {
      async query(_sql: string, values: unknown[] = []) {
        seen = values;
        return { rows: [] };
      },
    };
    await isRangeOpen("2026-09-04", 1, WINDOWS[0], CTX, db);
    expect(seen.filter((v) => v === "2026-09-04")).toHaveLength(2);
  });
});

describe("openDatesAhead", () => {
  it("returns the dates the query reports as free", async () => {
    const db = stub(() => [{ d: "2026-08-30" }, { d: "2026-09-01" }]);
    expect(await openDatesAhead(14, CTX, db, AFTERNOON)).toEqual(["2026-08-30", "2026-09-01"]);
  });

  it("asks for the requested horizon in one query", async () => {
    const db = stub(() => []);
    await openDatesAhead(14, CTX, db, AFTERNOON);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toContain("generate_series");
  });
});

describe("loadCalendarRules", () => {
  it("reads owner-configured weekend days and holidays", async () => {
    const db = stub((sql) =>
      sql.includes("pricing_settings")
        ? [{ weekend_days: [5, 6] }]
        : [{ date: "2026-12-25" }, { date: "2026-01-01" }],
    );
    const rules = await loadCalendarRules(db);
    expect([...rules.weekendDays].sort()).toEqual([5, 6]);
    expect(rules.holidays.has("2026-12-25")).toBe(true);
  });

  it("falls back to Fri/Sat when no row is configured", async () => {
    const db = stub(() => []);
    const rules = await loadCalendarRules(db);
    expect([...rules.weekendDays].sort()).toEqual([5, 6]);
  });
});

describe("loadHavenContext", () => {
  it("maps the six_hour columns to the Nightcation window", async () => {
    const db = stub(() => [
      {
        id: "haven-uuid",
        haven_name: "D’Lux Homes",
        ten_hour_check_in: "07:00:00",
        ten_hour_check_out: "17:00:00",
        six_hour_check_in: "19:00:00",
        six_hour_check_out: "05:00:00",
        twenty_one_hour_check_in: "19:00:00",
        twenty_one_hour_check_out: "17:00:00",
      },
    ]);
    const ctx = await loadHavenContext(db);
    expect(ctx?.windows.map((w) => w.label)).toEqual(["Daycation", "Nightcation", "Overnight"]);
    expect(ctx?.windows[1]).toMatchObject({ checkIn: "19:00", checkOut: "05:00" });
  });

  it("drops a window whose times are not configured", async () => {
    const db = stub(() => [
      {
        id: "haven-uuid",
        haven_name: "D’Lux Homes",
        ten_hour_check_in: "07:00:00",
        ten_hour_check_out: "17:00:00",
        six_hour_check_in: null,
        six_hour_check_out: null,
        twenty_one_hour_check_in: "19:00:00",
        twenty_one_hour_check_out: "17:00:00",
      },
    ]);
    const ctx = await loadHavenContext(db);
    expect(ctx?.windows.map((w) => w.label)).toEqual(["Daycation", "Overnight"]);
  });

  it("returns null when there is no haven row", async () => {
    const db = stub(() => []);
    expect(await loadHavenContext(db)).toBeNull();
  });
});
