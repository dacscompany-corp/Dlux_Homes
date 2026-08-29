import { describe, it, expect } from "vitest";
import { parseGuestMessage } from "./messenger-intent";

// Fixed reference point so month-day rollover is deterministic.
const NOW = new Date("2026-08-29T13:00:00+08:00");

describe("parseGuestMessage — real guest messages", () => {
  it("1: Taglish availability for today with pax", () => {
    const r = parseGuestMessage(
      "Ask ko lang kung may available unit po ba kayo for later and for 2 pax?Thankyouu",
      NOW,
    );
    expect(r).toEqual({ kind: "availability", from: "2026-08-29", pax: 2 });
  });

  it("2: bare Rates", () => {
    expect(parseGuestMessage("Rates", NOW)).toEqual({ kind: "price" });
  });

  it("3: pax + nights with no number filled in", () => {
    const r = parseGuestMessage("2 pax for (#) nights", NOW);
    expect(r).toEqual({ kind: "price", pax: 2 });
  });

  it("3b: pax + a real night count", () => {
    const r = parseGuestMessage("2 pax for 3 nights", NOW);
    expect(r).toEqual({ kind: "price", pax: 2, nights: 3 });
  });

  it("4: bare Available dates", () => {
    expect(parseGuestMessage("Available dates", NOW)).toEqual({ kind: "openDates" });
  });

  it("5: month-day with pax", () => {
    const r = parseGuestMessage("aug 30 for 2 pax", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-08-30", pax: 2 });
  });

  it("6: Taglish date range with pax", () => {
    const r = parseGuestMessage("available po sept 4-6? 2 pax", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-09-04", to: "2026-09-06", pax: 2 });
  });

  it("7: Hm and How much", () => {
    expect(parseGuestMessage("Hm", NOW)).toEqual({ kind: "price" });
    expect(parseGuestMessage("How much", NOW)).toEqual({ kind: "price" });
  });
});

describe("parseGuestMessage — other cases", () => {
  it("keeps booking-ID lookups ahead of the new intents", () => {
    const r = parseGuestMessage("rates for DL-BK1762050261", NOW);
    expect(r).toEqual({ kind: "bookingId", id: "DL-BK1762050261" });
  });

  it("rolls a past month-day forward to next year", () => {
    const r = parseGuestMessage("jan 5", NOW);
    expect(r).toEqual({ kind: "availability", from: "2027-01-05" });
  });

  it("reads bukas as tomorrow", () => {
    const r = parseGuestMessage("available po bukas?", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-08-30" });
  });

  it("reads magkano as a price question", () => {
    expect(parseGuestMessage("magkano po?", NOW)).toEqual({ kind: "price" });
  });

  it("reads Tagalog number words as pax", () => {
    const r = parseGuestMessage("available po sa sept 4 for dalawa", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-09-04", pax: 2 });
  });

  it("treats an availability question with no date as an open-dates question", () => {
    expect(parseGuestMessage("may available po kayo?", NOW)).toEqual({ kind: "openDates" });
  });

  it("returns none for unrelated chatter", () => {
    expect(parseGuestMessage("thank you po!", NOW)).toEqual({ kind: "none" });
  });

  it("returns none for an empty message", () => {
    expect(parseGuestMessage("   ", NOW)).toEqual({ kind: "none" });
  });
});
