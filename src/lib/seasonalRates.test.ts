import { describe, it, expect } from "vitest";
import {
  parseSeasonInput,
  seasonFromRow,
  findActiveOverlap,
  seasonStatus,
  formatSeasonRange,
  type SeasonalRateRecord,
} from "./seasonalRates";

const VALID = {
  name: "Christmas Season 2026",
  startDate: "2026-12-05",
  endDate: "2026-12-31",
  overnightWeekday: 2300,
  overnightWeekend: "2500",
  daynightWeekday: 1800,
  daynightWeekend: 2000,
  allowPromos: false,
  active: true,
};

const record = (over: Partial<SeasonalRateRecord>): SeasonalRateRecord => ({
  id: "a",
  name: "A",
  startDate: "2026-12-05",
  endDate: "2026-12-31",
  overnightWeekday: 1,
  overnightWeekend: 1,
  daynightWeekday: 1,
  daynightWeekend: 1,
  allowPromos: false,
  active: true,
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("parseSeasonInput", () => {
  it("accepts the PDF example and coerces numeric strings", () => {
    const r = parseSeasonInput(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.overnightWeekend).toBe(2500);
  });

  it("allows a one-day season (start = end)", () => {
    expect(parseSeasonInput({ ...VALID, endDate: "2026-12-05" }).ok).toBe(true);
  });

  it("rejects a start date later than the end date", () => {
    const r = parseSeasonInput({ ...VALID, startDate: "2027-01-01" });
    expect(r).toEqual({ ok: false, error: "Start date cannot be later than end date." });
  });

  it("rejects a blank name, a missing date, and a zero rate", () => {
    expect(parseSeasonInput({ ...VALID, name: "  " }).ok).toBe(false);
    expect(parseSeasonInput({ ...VALID, endDate: "" }).ok).toBe(false);
    expect(parseSeasonInput({ ...VALID, daynightWeekday: 0 }).ok).toBe(false);
  });

  it("treats anything but literal true as OFF / promos not allowed", () => {
    const r = parseSeasonInput({ ...VALID, active: "true", allowPromos: 1 });
    expect(r.ok && r.value.active).toBe(false);
    expect(r.ok && r.value.allowPromos).toBe(false);
  });
});

describe("seasonFromRow", () => {
  it("maps pg NUMERIC strings and DATE objects", () => {
    const s = seasonFromRow({
      id: "x", name: "N", start_date: new Date(2026, 11, 5), end_date: "2026-12-31",
      overnight_weekday_rate: "2300.00", overnight_weekend_rate: "2500.00",
      daynight_weekday_rate: "1800.00", daynight_weekend_rate: "2000.00",
      allow_promos: false, active: true,
    });
    expect(s.startDate).toBe("2026-12-05");
    expect(s.endDate).toBe("2026-12-31");
    expect(s.overnightWeekday).toBe(2300);
  });
});

describe("findActiveOverlap", () => {
  const xmas = record({ id: "xmas" });

  it("finds an active season sharing even one day (inclusive ends)", () => {
    expect(findActiveOverlap({ startDate: "2026-12-31", endDate: "2027-01-02" }, [xmas])).toBe(xmas);
  });

  it("ignores OFF seasons and the season being edited", () => {
    expect(findActiveOverlap({ startDate: "2026-12-10", endDate: "2026-12-12" }, [record({ active: false })])).toBeUndefined();
    expect(findActiveOverlap({ startDate: "2026-12-10", endDate: "2026-12-12" }, [xmas], "xmas")).toBeUndefined();
  });

  it("does not flag an adjacent range", () => {
    expect(findActiveOverlap({ startDate: "2027-01-01", endDate: "2027-01-05" }, [xmas])).toBeUndefined();
  });
});

describe("seasonStatus", () => {
  const s = { active: true, startDate: "2026-12-05", endDate: "2026-12-31" };
  it("reports upcoming / active / ended / off", () => {
    expect(seasonStatus(s, "2026-09-16")).toBe("upcoming");
    expect(seasonStatus(s, "2026-12-31")).toBe("active");
    expect(seasonStatus(s, "2027-01-01")).toBe("ended");
    expect(seasonStatus({ ...s, active: false }, "2026-12-10")).toBe("off");
  });
});

describe("formatSeasonRange", () => {
  it("shows the year once for a same-year range and twice across years", () => {
    expect(formatSeasonRange("2026-12-05", "2026-12-31")).toBe("Dec 5 – Dec 31, 2026");
    expect(formatSeasonRange("2026-12-20", "2027-01-02")).toBe("Dec 20, 2026 – Jan 2, 2027");
  });
});

describe("parseSeasonInput long-term tiers", () => {
  it("treats blank tiers as not set and keeps filled ones", () => {
    const r = parseSeasonInput({ ...VALID, longtermTier1: "2100", longtermTier2: "", longtermTier3: null });
    expect(r.ok && [r.value.longtermTier1, r.value.longtermTier2, r.value.longtermTier3, r.value.longtermTier4]).toEqual([2100, null, null, null]);
  });

  it("rejects a zero or negative tier", () => {
    expect(parseSeasonInput({ ...VALID, longtermTier4: "0" }).ok).toBe(false);
  });
});
