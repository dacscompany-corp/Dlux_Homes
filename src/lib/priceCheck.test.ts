import { describe, it, expect } from "vitest";
import { checkClaimedPrice } from "./priceCheck";
import { quoteStay, type CalendarRules, type SeasonalRate } from "./pricing";

const RATES = { price10hr: 1499, price10hrWeekend: 1699, price21hr: 1899, price21hrWeekend: 2099, basePax: 2, additionalPaxFee: 200 };
const RULES: CalendarRules = { weekendDays: new Set([5, 6]), holidays: new Set<string>() };
const XMAS: SeasonalRate = {
  id: "xmas", name: "Christmas Season 2026", startDate: "2026-12-05", endDate: "2026-12-31",
  overnightWeekday: 2300, overnightWeekend: 2500, daynightWeekday: 1800, daynightWeekend: 2000, allowPromos: false,
};

// Thu Dec 10 2026, 1 night, 3 counted guests, one senior.
const quote = quoteStay({ stayType: "21", checkInISO: "2026-12-10", nights: 1, rates: RATES, rules: RULES, seasons: [XMAS], feePax: 3, seniorCount: 1 });

// What the checkout would send for that quote with a ₱300 promo.
const honest = { total_amount: quote.subtotal - 300, discount_amount: 300, senior_discount: quote.seniorDiscount };

describe("checkClaimedPrice", () => {
  it("accepts exactly what the checkout computes", () => {
    expect(checkClaimedPrice(quote, honest)).toEqual({ ok: true });
  });

  it("rejects a booking priced at the regular rate on a seasonal date", () => {
    const regular = quoteStay({ stayType: "21", checkInISO: "2026-12-10", nights: 1, rates: RATES, rules: RULES, feePax: 3, seniorCount: 1 });
    const stale = { total_amount: regular.subtotal, senior_discount: regular.seniorDiscount };
    expect(checkClaimedPrice(quote, stale).ok).toBe(false);
  });

  it("rejects a lowered total_amount", () => {
    expect(checkClaimedPrice(quote, { ...honest, total_amount: 100 }).ok).toBe(false);
  });

  it("rejects an inflated senior discount even when the gross adds up", () => {
    const r = checkClaimedPrice(quote, { total_amount: quote.subtotal - 500, discount_amount: 300, senior_discount: quote.seniorDiscount + 500 });
    expect(r.ok).toBe(false);
  });

  it("tolerates a one-peso rounding difference", () => {
    expect(checkClaimedPrice(quote, { ...honest, total_amount: honest.total_amount - 1 }).ok).toBe(true);
  });

  it("accepts a total above the quote", () => {
    expect(checkClaimedPrice(quote, { ...honest, total_amount: honest.total_amount + 500 }).ok).toBe(true);
  });
});
