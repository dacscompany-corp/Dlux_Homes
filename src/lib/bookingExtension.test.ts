import { describe, it, expect } from "vitest";
import { nightsBetweenISO, quoteExtension } from "./bookingExtension";
import type { CalendarRules } from "./pricing";

// Fri/Sat weekend, no holidays.
const RULES: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set<string>() };
const RATES = { price10hr: 1499, price10hrWeekend: 1799, price21hr: 1899, price21hrWeekend: 2099, basePax: 2, additionalPaxFee: 200 };
const base = { stayType: "21", checkInISO: "2026-11-02", rates: RATES, rules: RULES, feePax: 2 }; // Mon check-in

describe("nightsBetweenISO", () => {
  it("counts calendar nights, across months", () => {
    expect(nightsBetweenISO("2026-10-31", "2026-11-02")).toBe(2);
    expect(nightsBetweenISO("2026-11-02", "2026-11-02")).toBe(0);
    expect(nightsBetweenISO("bad", "2026-11-02")).toBeNaN();
  });
});

describe("quoteExtension", () => {
  it("prices the added nights by their own dates (weekday vs weekend)", () => {
    // Mon–Wed booked (2 nights); add Wed and Thu → both weekday.
    expect(quoteExtension(base, 2, 2).suggested).toBe(2 * 1899);
    // Add Wed → Sat: Wed, Thu weekday + Fri weekend.
    const q = quoteExtension(base, 2, 3);
    expect(q.addedNightPrices.map((n) => n.rate)).toEqual([1899, 1899, 2099]);
    expect(q.suggested).toBe(1899 * 2 + 2099);
  });

  it("adds the extra-pax fee for each added night", () => {
    const q = quoteExtension({ ...base, feePax: 3 }, 1, 1);
    expect(q.paxFeeAdded).toBe(200);
    expect(q.suggested).toBe(1899 + 200);
  });

  it("reprices the whole stay when the extension reaches a long-term tier", () => {
    const longTerm = { ...RATES, longtermActive: true, longtermTier1Rate: 1599 };
    // 2 nights booked at 1,899; extended to 3 → all 3 at 1,599 = 4,797, minus 3,798.
    const q = quoteExtension({ ...base, rates: longTerm }, 2, 1);
    expect(q.longTermNow).toBe(true);
    expect(q.suggested).toBe(3 * 1599 - 2 * 1899);
  });

  it("never suggests a negative price", () => {
    const steep = { ...RATES, longtermActive: true, longtermTier1Rate: 500 };
    expect(quoteExtension({ ...base, rates: steep }, 2, 1).suggested).toBe(0);
  });
});
