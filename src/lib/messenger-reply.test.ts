import { describe, it, expect } from "vitest";
import {
  peso,
  quoteFor,
  availabilityReply,
  priceReply,
  openDatesReply,
  overCapacityReply,
  askForDatesReply,
  stayTimeReply,
  bookingTermsReply,
  type StayWindow,
} from "./messenger-reply";

const RATES = {
  price10hr: 1499,
  price10hrWeekend: 1799,
  price21hr: 1899,
  price21hrWeekend: 2099,
  longtermActive: false,
};

// Mirrors the LIVE owner config: pricing_settings.weekend_days is [5,6], so
// Fri/Sat price as weekend and SUNDAY DOES NOT. Passed explicitly rather than
// defaulted so these tests never depend on the database.
const RULES = {
  weekendDays: new Set([5, 6]),
  holidays: new Set(["2026-12-25"]),
};

// Same rates with long-term pricing switched ON, as the live haven has it.
// Tier floors are 3 / 11 / 18 / 26 nights (BUNDLE_TIER*_NIGHTS in pricing.ts).
const LONGTERM = {
  ...RATES,
  longtermActive: true,
  longtermTier1Rate: 1799,
  longtermTier2Rate: 1599,
  longtermTier3Rate: 1499,
  longtermTier4Rate: 1399,
  longtermExtraPaxFee: 100,
};

const OVERNIGHT: StayWindow = { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" };
const DAYCATION: StayWindow = { stayType: "10", label: "Daycation", checkIn: "07:00", checkOut: "17:00" };
const NIGHTCATION: StayWindow = { stayType: "10", label: "Nightcation", checkIn: "19:00", checkOut: "05:00" };

describe("peso", () => {
  it("formats with a thousands separator and no decimals", () => {
    expect(peso(2099)).toBe("₱2,099");
    expect(peso(12500)).toBe("₱12,500");
  });
});

describe("quoteFor", () => {
  // 2026-08-29 is a Saturday -> weekend rate.
  it("prices a weekend overnight at the weekend rate", () => {
    expect(quoteFor(OVERNIGHT, "2026-08-29", 1, 2, RATES, 200, RULES)).toBe(2099);
  });

  // 2026-09-02 is a Wednesday -> weekday rate.
  it("prices a weekday overnight at the weekday rate", () => {
    expect(quoteFor(OVERNIGHT, "2026-09-02", 1, 2, RATES, 200, RULES)).toBe(1899);
  });

  // Guards the live Fri/Sat config: a Sunday is NOT a weekend day here, even
  // though agent_docs/business-rules.md describes weekends as Fri/Sat/Sun.
  // If the owner ever adds Sunday in the admin, this test flips — by design.
  it("prices a Sunday at the weekday rate under the live Fri/Sat rule", () => {
    expect(quoteFor(OVERNIGHT, "2026-08-30", 1, 2, RATES, 200, RULES)).toBe(1899);
  });

  it("prices a holiday at the weekend rate", () => {
    expect(quoteFor(OVERNIGHT, "2026-12-25", 1, 2, RATES, 200, RULES)).toBe(2099);
  });

  it("prices a weekend daycation at the 10-hour weekend rate", () => {
    expect(quoteFor(DAYCATION, "2026-08-29", 1, 2, RATES, 200, RULES)).toBe(1799);
  });

  it("adds the extra-pax fee per night", () => {
    // 2 nights weekday overnight = 1899*2, plus 1 extra pax * 200 * 2 nights.
    expect(quoteFor(OVERNIGHT, "2026-09-02", 2, 3, RATES, 200, RULES)).toBe(1899 * 2 + 400);
  });

  it("charges a 10-hour session's extra pax once, not per night", () => {
    expect(quoteFor(DAYCATION, "2026-09-02", 1, 3, RATES, 200, RULES)).toBe(1499 + 200);
  });

  it("prices each night of a range by that night's own day", () => {
    // Thu 2026-09-03 (weekday) + Fri 2026-09-04 (weekend).
    expect(quoteFor(OVERNIGHT, "2026-09-03", 2, 2, RATES, 200, RULES)).toBe(1899 + 2099);
  });
});

describe("quoteFor — long-term stays", () => {
  // The bug this exists for: the bot quoted ₱33,186 for Dec 1–15 / 4 pax while
  // the site's own checkout showed ₱25,186. quoteFor() was pricing every night
  // individually and never checking bundleNightlyRate(), so a stay that the
  // storefront reprices flat was overquoted by ₱8,000.
  it("reprices a 14-night stay at the flat tier-2 rate, matching checkout", () => {
    const room = 1599 * 14; // 22,386
    const pax = 2 * 100 * 14; // 2,800 — bundleExtraPaxFee, NOT extraPaxFee
    expect(quoteFor(OVERNIGHT, "2026-12-01", 14, 4, LONGTERM, 200, RULES)).toBe(room + pax);
    expect(quoteFor(OVERNIGHT, "2026-12-01", 14, 4, LONGTERM, 200, RULES)).toBe(25186);
  });

  it("uses the tier-1 rate at exactly 3 nights", () => {
    expect(quoteFor(OVERNIGHT, "2026-12-01", 3, 2, LONGTERM, 200, RULES)).toBe(1799 * 3);
  });

  it("stays on normal per-night pricing below the first tier", () => {
    // Tue 2026-12-01 + Wed 2026-12-02, both weekdays.
    expect(quoteFor(OVERNIGHT, "2026-12-01", 2, 2, LONGTERM, 200, RULES)).toBe(1899 * 2);
  });

  it("never stacks the normal extra-pax fee onto a bundled stay", () => {
    // A bundled stay owes bundleExtraPaxFee ONLY. Charging both would add
    // 2 x 200 x 14 = 5,600 on top and double-bill the same two guests.
    const bundled = quoteFor(OVERNIGHT, "2026-12-01", 14, 4, LONGTERM, 200, RULES);
    expect(bundled).toBeLessThan(1599 * 14 + 2 * 100 * 14 + 2 * 200 * 14);
  });

  it("ignores tiers when the owner has long-term pricing switched off", () => {
    const off = { ...LONGTERM, longtermActive: false };
    // Falls back to per-night: Dec 1-14 has Fri/Sat on the 4th, 5th, 11th, 12th.
    const expected = quoteFor(OVERNIGHT, "2026-12-01", 14, 2, RATES, 200, RULES);
    expect(quoteFor(OVERNIGHT, "2026-12-01", 14, 2, off, 200, RULES)).toBe(expected);
  });
});

describe("availabilityReply", () => {
  it("lists every open window with its price", () => {
    // Saturday, so every line carries the weekend rate.
    const msg = availabilityReply({
      from: "2026-08-29",
      nights: 1,
      pax: 2,
      windows: [OVERNIGHT, DAYCATION, NIGHTCATION],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
    });
    expect(msg).toContain("Available po kami");
    expect(msg).toContain("Overnight");
    expect(msg).toContain("₱2,099");
    expect(msg).toContain("Daycation");
    expect(msg).toContain("Nightcation");
    expect(msg).toContain("₱1,799");
    // The payment terms now travel in bookingTermsReply, as their own message.
    expect(msg).toContain("Weekend/holiday rate po ang date na 'yan.");
  });

  it("says fully booked when nothing is open", () => {
    const msg = availabilityReply({
      from: "2026-08-30",
      nights: 1,
      pax: 2,
      windows: [],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
    });
    expect(msg).toContain("fully booked");
    expect(msg).not.toContain("₱");
  });

  it("calls a bundled stay a long-term rate, not a weekday one", () => {
    const msg = availabilityReply({
      from: "2026-12-01",
      to: "2026-12-15",
      nights: 14,
      pax: 4,
      windows: [OVERNIGHT],
      rates: LONGTERM,
      extraPaxFee: 200,
      rules: RULES,
    });
    expect(msg).toContain("₱25,186");
    expect(msg).toContain("Long-term rate");
    expect(msg).not.toContain("Weekday rate");
  });

  it("states the night count for a multi-night range", () => {
    const msg = availabilityReply({
      from: "2026-09-04",
      to: "2026-09-06",
      nights: 2,
      pax: 2,
      windows: [OVERNIGHT],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
    });
    expect(msg).toContain("2 nights");
  });
});

describe("priceReply", () => {
  it("lists both weekday and weekend rates for every stay type", () => {
    const msg = priceReply({ rates: RATES, windows: [OVERNIGHT, DAYCATION, NIGHTCATION], extraPaxFee: 200 });
    expect(msg).toContain("₱1,899");
    expect(msg).toContain("₱2,099");
    expect(msg).toContain("₱1,499");
    expect(msg).toContain("₱1,799");
    expect(msg).toContain("₱200");
  });
});

describe("openDatesReply", () => {
  it("lists the open dates", () => {
    const msg = openDatesReply(["2026-08-30", "2026-09-01"], 14);
    expect(msg).toContain("Aug 30");
    expect(msg).toContain("Sep 1");
    expect(msg).toContain("Daycation");
  });

  it("says fully booked when the horizon has no open date", () => {
    expect(openDatesReply([], 14)).toContain("fully booked");
  });
});

describe("guard replies", () => {
  it("explains the 4-pax cap and hands off to staff", () => {
    const msg = overCapacityReply(6, 4);
    expect(msg).toContain("4");
    expect(msg).toContain("6");
  });

  it("asks for dates in Taglish", () => {
    expect(askForDatesReply()).toMatch(/dates/i);
  });
});

describe("stayTimeReply", () => {
  const ALL = [DAYCATION, NIGHTCATION, OVERNIGHT];

  it("states the fixed check-in and check-out of every window", () => {
    const out = stayTimeReply(ALL);
    expect(out).toContain("Daycation — Check-in 7AM · Check-out 5PM");
    expect(out).toContain("Nightcation — Check-in 7PM · Check-out 5AM");
    expect(out).toContain("Overnight — Check-in 7PM · Check-out 5PM");
  });

  it("shows each window's real length", () => {
    const out = stayTimeReply(ALL);
    expect(out).toContain("Check-out 5PM (10h)"); // Daycation 7AM-5PM
    expect(out).toContain("Check-out 5AM (10h)"); // Nightcation 7PM-5AM
    expect(out).toContain("Check-out 5PM (22h)"); // Overnight 7PM-5PM
  });

  it("says the check-out time and the rate are both fixed", () => {
    const out = stayTimeReply(ALL);
    expect(out).toContain("Fixed po ang check-out time at ang rate");
    expect(out).toContain("ganoon pa rin po ang bayad");
  });

  it("offers later check-in hours drawn from the Daycation window", () => {
    const out = stayTimeReply(ALL);
    expect(out).toContain("8AM, 9AM, 10AM, 11AM");
    expect(out).toContain("5PM pa rin po ang check-out ng Daycation");
  });

  it("follows an edited schedule instead of hardcoding 7AM-5PM", () => {
    const shifted: StayWindow[] = [
      { stayType: "10", label: "Daycation", checkIn: "08:00", checkOut: "18:00" },
    ];
    const out = stayTimeReply(shifted);
    expect(out).toContain("Daycation — Check-in 8AM · Check-out 6PM (10h)");
    expect(out).toContain("9AM, 10AM, 11AM, 12PM");
    expect(out).not.toContain("7AM");
  });

  it("still answers when the haven has no windows saved", () => {
    const out = stayTimeReply([]);
    expect(out).toContain("Fixed po ang check-out time");
  });
});

describe("availabilityReply — time note", () => {
  it("appends the fixed check-out rule when the guest asked about time", () => {
    const out = availabilityReply({
      from: "2026-09-02",
      nights: 1,
      pax: 2,
      windows: [DAYCATION],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
      timeAsk: true,
    });
    expect(out).toContain("Standard po ang schedule ng Daycation: 7AM check-in, 5PM check-out.");
    expect(out).toContain("Kahit ibang oras po ang gusto niyong dumating");
  });

  it("echoes an unambiguous arrival time back to the guest", () => {
    const out = availabilityReply({
      from: "2026-12-01",
      nights: 1,
      pax: 4,
      windows: [OVERNIGHT],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
      stay: "Overnight",
      timeAsk: true,
      requestedTime: "9PM",
    });
    expect(out).toContain("Standard po ang schedule ng Overnight: 7PM check-in, 5PM check-out.");
    expect(out).toContain("Kahit 9PM po kayo dumating, 5PM pa rin po ang check-out");
  });

  it("keeps the generic wording when several windows are quoted at once", () => {
    const out = availabilityReply({
      from: "2026-12-01",
      nights: 1,
      pax: 2,
      windows: [DAYCATION, NIGHTCATION, OVERNIGHT],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
      timeAsk: true,
    });
    expect(out).toContain("fixed po ang check-out time at ang rate");
    expect(out).not.toContain("Standard po ang schedule ng");
  });

  it("leaves the note out when no time was mentioned", () => {
    const out = availabilityReply({
      from: "2026-09-02",
      nights: 1,
      pax: 2,
      windows: [DAYCATION],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
    });
    expect(out).not.toContain("fixed po ang check-out");
  });
});

describe("availabilityReply — narrowed to the stay type the guest named", () => {
  const ALL = [DAYCATION, NIGHTCATION, OVERNIGHT];
  const base = {
    from: "2026-12-01", // a Tuesday -> weekday rate
    nights: 1,
    pax: 4,
    rates: RATES,
    extraPaxFee: 200,
    rules: RULES,
  };

  it("quotes only the window that was asked for", () => {
    const out = availabilityReply({ ...base, windows: ALL, stay: "Overnight" });
    expect(out).toContain("Overnight (7PM–5PM) — ₱2,299");
    expect(out).not.toContain("Daycation");
    expect(out).not.toContain("Nightcation");
  });

  it("still lists everything when no stay type was named", () => {
    const out = availabilityReply({ ...base, windows: ALL });
    expect(out).toContain("Daycation");
    expect(out).toContain("Nightcation");
    expect(out).toContain("Overnight");
  });

  it("says the requested window is taken and offers what is left", () => {
    const out = availabilityReply({ ...base, windows: [DAYCATION], stay: "Overnight" });
    expect(out).toContain("hindi po available ang Overnight");
    expect(out).toContain("Daycation (7AM–5PM) — ₱1,899");
  });

  it("falls back to the fully-booked reply when nothing is open", () => {
    const out = availabilityReply({ ...base, windows: [], stay: "Overnight" });
    expect(out).toContain("fully booked");
  });

  it("explains that a Daycation cannot span a date range", () => {
    const out = availabilityReply({
      ...base,
      to: "2026-12-04",
      nights: 3,
      windows: [OVERNIGHT],
      stay: "Daycation",
    });
    expect(out).toContain("Isang araw lang po ang Daycation");
    expect(out).toContain("Overnight");
  });
});

describe("priceReply — narrowed and pax-aware", () => {
  const ALL = [DAYCATION, NIGHTCATION, OVERNIGHT];

  it("shows only the named stay type", () => {
    const out = priceReply({ rates: RATES, windows: ALL, extraPaxFee: 200, stay: "Overnight" });
    expect(out).toContain("Overnight (7PM–5PM)");
    expect(out).not.toContain("Daycation");
  });

  it("quotes the rate for the pax the guest gave, not the 2-pax base", () => {
    const out = priceReply({
      rates: RATES,
      windows: ALL,
      extraPaxFee: 200,
      stay: "Overnight",
      pax: 4,
    });
    expect(out).toContain("for 4 pax");
    expect(out).toContain("Weekday ₱2,299 · Weekend/Holiday ₱2,499");
    expect(out).not.toContain("good for 2 pax");
  });

  it("keeps the 2-pax rate card when no larger group was named", () => {
    const out = priceReply({ rates: RATES, windows: ALL, extraPaxFee: 200, pax: 2 });
    expect(out).toContain("good for 2 pax");
    expect(out).toContain("Weekday ₱1,899 · Weekend/Holiday ₱2,099");
    expect(out).toContain("Extra pax po ₱200");
  });
});

describe("bookingTermsReply", () => {
  const out = bookingTermsReply("dlux-homes.vercel.app");

  it("covers the payment terms the owner wrote", () => {
    expect(out).toContain("PARAAN NG PAG BAYAD");
    expect(out).toContain("50% down payment po para ma-reserve ang date niyo.");
    expect(out).toContain("1,000 pesos na security deposit");
    expect(out).toContain("refundable once na ma check ang unit");
    expect(out).toContain("GCash or BPI");
  });

  it("covers the cancellation and date-change rules", () => {
    expect(out).toContain("No Cancellation/Refund");
    expect(out).toContain("forfeited po ang payment");
    expect(out).toContain("1 Free Date Change");
    expect(out).toContain("at least 7 days before check-in");
    expect(out).toContain("within 1 month ang bagong date");
  });

  // Owner's call (2026-09-04): this card was dropped from the bubble. The rule
  // still applies and still appears on the Terms page — asserting its absence
  // keeps the removal deliberate rather than letting it creep back unnoticed.
  it("omits the request-form card", () => {
    expect(out).not.toContain("REQUEST PA LANG ANG FORM");
  });

  it("closes with the ready prompt and the booking link", () => {
    expect(out).toContain("Kung ready na po kayo, book po kayo dito:\ndlux-homes.vercel.app");
  });

  it("separates each section with a blank line", () => {
    // Header, BAYAD, WALANG CANCELLATION, closing prompt.
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(4);
  });

  it("fits in a single Messenger message", () => {
    expect(out.length).toBeLessThan(2000);
  });
});

describe("availabilityReply — no longer carries the CTA", () => {
  it("ends on the rate note, leaving the link to the terms message", () => {
    const out = availabilityReply({
      from: "2026-12-01",
      nights: 1,
      pax: 2,
      windows: [OVERNIGHT],
      rates: RATES,
      extraPaxFee: 200,
      rules: RULES,
      stay: "Overnight",
    });
    expect(out).not.toContain("dlux-homes.vercel.app");
    expect(out.trimEnd().endsWith("Weekday rate po ang date na 'yan.")).toBe(true);
  });
});
