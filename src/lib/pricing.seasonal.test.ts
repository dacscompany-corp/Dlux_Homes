import { describe, it, expect } from "vitest";
import {
  pickRate,
  stayTotal,
  stayBreakdown,
  seasonFor,
  promoBlockingSeason,
  quoteStay,
  type CalendarRules,
  type SeasonalRate,
} from "./pricing";

const ROOM = {
  price10hr: 1499,
  price10hrWeekend: 1699,
  price21hr: 1899,
  price21hrWeekend: 2099,
};

// Fri/Sat weekend, no holidays.
const RULES: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set<string>() };

// The PDF's own example.
const XMAS: SeasonalRate = {
  id: "xmas",
  name: "Christmas Season 2026",
  startDate: "2026-12-05",
  endDate: "2026-12-31",
  overnightWeekday: 2300,
  overnightWeekend: 2500,
  daynightWeekday: 1800,
  daynightWeekend: 2000,
  allowPromos: false,
};

describe("seasonFor", () => {
  it("includes both the start and the end date", () => {
    expect(seasonFor("2026-12-05", [XMAS])).toBe(XMAS);
    expect(seasonFor("2026-12-31", [XMAS])).toBe(XMAS);
  });

  it("excludes the days just outside the range", () => {
    expect(seasonFor("2026-12-04", [XMAS])).toBeUndefined();
    expect(seasonFor("2027-01-01", [XMAS])).toBeUndefined();
  });
});

describe("pickRate with a season", () => {
  it("uses the seasonal weekday rate (Thu Dec 10 2026)", () => {
    expect(pickRate("21", "2026-12-10", ROOM, RULES, [XMAS])).toBe(2300);
    expect(pickRate("10", "2026-12-10", ROOM, RULES, [XMAS])).toBe(1800);
  });

  it("uses the seasonal weekend rate (Fri Dec 11 2026)", () => {
    expect(pickRate("21", "2026-12-11", ROOM, RULES, [XMAS])).toBe(2500);
    expect(pickRate("10", "2026-12-11", ROOM, RULES, [XMAS])).toBe(2000);
  });

  it("uses the seasonal weekend rate on a declared holiday", () => {
    const rules: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set(["2026-12-24"]) }; // Thu
    expect(pickRate("21", "2026-12-24", ROOM, rules, [XMAS])).toBe(2500);
  });

  it("falls back to regular rates outside the season", () => {
    expect(pickRate("21", "2026-12-03", ROOM, RULES, [XMAS])).toBe(1899);
  });

  it("is unchanged when no seasons are passed", () => {
    expect(pickRate("21", "2026-12-10", ROOM, RULES)).toBe(1899);
    expect(pickRate("21", "2026-12-10", ROOM, RULES, [])).toBe(1899);
  });
});

describe("stayTotal across a season boundary", () => {
  it("prices Dec 4 regular and Dec 5 seasonal (Fri Dec 4, Sat Dec 5)", () => {
    expect(stayTotal("21", "2026-12-04", 2, ROOM, RULES, [XMAS])).toBe(2099 + 2500);
  });

  it("prices the last season night seasonal and the next regular", () => {
    // Thu Dec 31 (season weekday) + Fri Jan 1 (regular weekend)
    expect(stayTotal("21", "2026-12-31", 2, ROOM, RULES, [XMAS])).toBe(2300 + 2099);
  });

  it("prices a 10h session by its check-in date", () => {
    expect(stayTotal("10", "2026-12-10", 1, ROOM, RULES, [XMAS])).toBe(1800);
  });
});

describe("long-term stays partly inside a season", () => {
  const LONG = { ...ROOM, longtermActive: true, longtermTier1Rate: 1500 };

  it("keeps the flat long-term rate when no season applies", () => {
    expect(stayTotal("21", "2026-11-01", 3, LONG, RULES, [XMAS])).toBe(1500 * 3);
  });

  it("charges seasonal nights at the seasonal rate and the rest at the long-term rate", () => {
    // Thu Dec 3, Fri Dec 4 → long-term; Sat Dec 5 → season weekend
    expect(stayTotal("21", "2026-12-03", 3, LONG, RULES, [XMAS])).toBe(1500 + 1500 + 2500);
  });
});

describe("stayBreakdown", () => {
  it("tags each seasonal night and lists the seasons touched once", () => {
    const b = stayBreakdown("21", "2026-12-04", 3, ROOM, RULES, [XMAS]);
    expect(b.nights.map((n) => n.season?.id ?? null)).toEqual([null, "xmas", "xmas"]);
    expect(b.seasons).toEqual([XMAS]);
    expect(b.total).toBe(b.nights.reduce((s, n) => s + n.rate, 0));
  });
});

describe("promoBlockingSeason", () => {
  it("blocks promos for a stay touching a season that disallows them", () => {
    expect(promoBlockingSeason("21", "2026-12-04", 2, [XMAS])).toBe(XMAS);
  });

  it("allows promos when the stay ends before the season starts", () => {
    // 1 night on Dec 4 checks out Dec 5 — the Dec 5 night is not booked.
    expect(promoBlockingSeason("21", "2026-12-04", 1, [XMAS])).toBeUndefined();
  });

  it("allows promos when the season has Allow promos switched on", () => {
    expect(promoBlockingSeason("21", "2026-12-10", 1, [{ ...XMAS, allowPromos: true }])).toBeUndefined();
  });
});

describe("quoteStay", () => {
  const RATES = { ...ROOM, basePax: 2, additionalPaxFee: 200 };

  it("matches stayTotal plus the normal pax fee inside a season", () => {
    const q = quoteStay({ stayType: "21", checkInISO: "2026-12-10", nights: 2, rates: RATES, rules: RULES, seasons: [XMAS], feePax: 3 });
    expect(q.roomTotal).toBe(2300 + 2500);
    expect(q.paxFee).toBe(200 * 2);
    expect(q.subtotal).toBe(2300 + 2500 + 400);
  });

  it("applies the senior discount to the seasonal room total", () => {
    const q = quoteStay({ stayType: "21", checkInISO: "2026-12-10", nights: 1, rates: RATES, rules: RULES, seasons: [XMAS], feePax: 2, seniorCount: 1 });
    expect(q.seniorDiscount).toBe(Math.round((2300 / 2) * 0.2));
    expect(q.subtotal).toBe(2300 - q.seniorDiscount);
  });
});

describe("seasonal long-term tiers", () => {
  const XMAS_LONG: SeasonalRate = { ...XMAS, longtermTier1: 2100, longtermTier2: 2000, longtermTier3: null, longtermTier4: null };
  const LONG = { ...ROOM, longtermActive: true, longtermTier1Rate: 1699, longtermTier2Rate: 1599 };

  it("charges every seasonal night the season's tier-1 rate on a 6-night stay", () => {
    // Fri Dec 4 (regular long-term) + Dec 5–9 (season tier 1)
    const b = stayBreakdown("21", "2026-12-04", 6, LONG, RULES, [XMAS_LONG]);
    expect(b.nights.map((n) => n.rate)).toEqual([1699, 2100, 2100, 2100, 2100, 2100]);
    expect(b.nights.every((n) => n.longTerm)).toBe(true);
  });

  it("uses the higher tier the stay reaches", () => {
    expect(stayTotal("21", "2026-12-06", 11, LONG, RULES, [XMAS_LONG])).toBe(2000 * 11);
  });

  it("falls through a blank higher tier to the next one down", () => {
    // 18 nights reaches tier 3, which the season left blank → tier 2 (₱2,000).
    expect(stayTotal("21", "2026-12-06", 18, LONG, RULES, [{ ...XMAS_LONG, endDate: "2026-12-31" }])).toBe(2000 * 18);
  });

  it("keeps the season's nightly rates when no tier is set", () => {
    const b = stayBreakdown("21", "2026-12-07", 3, LONG, RULES, [XMAS]); // Mon–Wed
    expect(b.nights.map((n) => n.rate)).toEqual([2300, 2300, 2300]);
    expect(b.nights.some((n) => n.longTerm)).toBe(false);
  });

  it("applies season tiers even when the haven's long-term pricing is off", () => {
    expect(stayTotal("21", "2026-12-07", 3, { ...ROOM, longtermActive: false }, RULES, [XMAS_LONG])).toBe(2100 * 3);
  });

  it("does not apply tiers to a short stay or a 10h session", () => {
    expect(stayTotal("21", "2026-12-07", 2, ROOM, RULES, [XMAS_LONG])).toBe(2300 * 2);
    expect(stayTotal("10", "2026-12-07", 1, ROOM, RULES, [XMAS_LONG])).toBe(1800);
  });

  it("quotes a flat long-term rate and the long-term pax fee", () => {
    const rates = { ...ROOM, basePax: 2, additionalPaxFee: 200, longtermExtraPaxFee: 100 };
    const q = quoteStay({ stayType: "21", checkInISO: "2026-12-07", nights: 3, rates, rules: RULES, seasons: [XMAS_LONG], feePax: 3 });
    expect(q.flatLongTermRate).toBe(2100);
    expect(q.paxFee).toBe(100 * 3);
  });

  it("has no flat rate for a stay that mixes long-term rates", () => {
    const rates = { ...LONG, basePax: 2, additionalPaxFee: 200 };
    const q = quoteStay({ stayType: "21", checkInISO: "2026-12-04", nights: 6, rates, rules: RULES, seasons: [XMAS_LONG], feePax: 2 });
    expect(q.flatLongTermRate).toBeUndefined();
  });
});
