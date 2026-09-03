import { describe, it, expect } from "vitest";
import { toISODate, movedStayDates } from "./dateChange";

// The regression these guard: node-postgres hands back a DATE column as a JS
// Date, NOT a string. The date-change route did `booking.check_in_date +
// "T00:00:00"`, which stringifies the Date ("Fri Sep 04 2026 00:00:00 GMT…")
// and appends "T00:00:00" — an unparseable value. Every downstream step then
// produced NaN and .toISOString() threw RangeError, so approving a guest's
// date-change request always 500'd.

describe("toISODate", () => {
  it("passes a plain YYYY-MM-DD string through", () => {
    expect(toISODate("2026-09-05")).toBe("2026-09-05");
  });

  it("takes the date part of an ISO timestamp string", () => {
    expect(toISODate("2026-09-05T00:00:00.000Z")).toBe("2026-09-05");
  });

  it("reads a pg DATE (a UTC-midnight Date object) as that calendar day", () => {
    expect(toISODate(new Date("2026-09-05T00:00:00.000Z"))).toBe("2026-09-05");
  });

  it("does not shift the day when the process runs east of UTC", () => {
    // A Date built at LOCAL midnight in Manila is 2026-09-04T16:00Z. Reading it
    // back through toISOString() would say Sep 4 — the off-by-one this avoids.
    expect(toISODate(new Date(2026, 8, 5, 0, 0, 0))).toBe("2026-09-05");
  });

  it("returns '' for null/undefined rather than a bogus date", () => {
    expect(toISODate(null)).toBe("");
    expect(toISODate(undefined)).toBe("");
  });
});

describe("movedStayDates", () => {
  it("keeps a 1-night stay one night long", () => {
    expect(movedStayDates("2026-09-04", "2026-09-05", "2026-09-05")).toEqual({
      checkIn: "2026-09-05",
      checkOut: "2026-09-06",
    });
  });

  it("preserves the length of a multi-night stay", () => {
    expect(movedStayDates("2026-11-05", "2026-11-24", "2026-12-01")).toEqual({
      checkIn: "2026-12-01",
      checkOut: "2026-12-20",
    });
  });

  it("accepts pg Date objects on every input", () => {
    expect(
      movedStayDates(
        new Date("2026-09-04T00:00:00.000Z"),
        new Date("2026-09-05T00:00:00.000Z"),
        new Date("2026-09-05T00:00:00.000Z"),
      ),
    ).toEqual({ checkIn: "2026-09-05", checkOut: "2026-09-06" });
  });

  it("carries a stay across a month boundary", () => {
    expect(movedStayDates("2026-09-29", "2026-09-30", "2026-09-30")).toEqual({
      checkIn: "2026-09-30",
      checkOut: "2026-10-01",
    });
  });

  it("carries a stay across a year boundary", () => {
    expect(movedStayDates("2026-01-01", "2026-01-03", "2026-12-31")).toEqual({
      checkIn: "2026-12-31",
      checkOut: "2027-01-02",
    });
  });

  it("treats a same-day session (Daycation) as staying same-day", () => {
    expect(movedStayDates("2026-09-04", "2026-09-04", "2026-09-09")).toEqual({
      checkIn: "2026-09-09",
      checkOut: "2026-09-09",
    });
  });

  it("throws on an unusable date rather than silently moving the stay", () => {
    expect(() => movedStayDates("", "2026-09-05", "2026-09-05")).toThrow();
    expect(() => movedStayDates("2026-09-04", "2026-09-05", "nonsense")).toThrow();
  });
});
