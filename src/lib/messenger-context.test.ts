import { describe, it, expect } from "vitest";
import { mergeContext, nextContext, followUpMessage } from "./messenger-context";
import type { Intent } from "./messenger-intent";

describe("mergeContext — continuing an enquiry", () => {
  it("answers a bare pax follow-up against the remembered date", () => {
    // "dec 1 is available?" then "4 pax po kami"
    const out = mergeContext({ kind: "price", pax: 4 }, { from: "2026-12-01" });
    expect(out).toEqual({ kind: "availability", from: "2026-12-01", pax: 4 });
  });

  it("answers a bare stay-type follow-up against the remembered date", () => {
    const out = mergeContext({ kind: "price", stay: "Overnight" }, { from: "2026-12-01", pax: 4 });
    expect(out).toEqual({
      kind: "availability",
      from: "2026-12-01",
      pax: 4,
      stay: "Overnight",
    });
  });

  it("turns a night count into an end date", () => {
    const out = mergeContext({ kind: "price", nights: 3 }, { from: "2026-12-01" });
    expect(out).toEqual({ kind: "availability", from: "2026-12-01", to: "2026-12-04" });
  });

  it("lets a newly named date replace the remembered one", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-12-05" },
      { from: "2026-12-01", pax: 4 },
    );
    expect(out).toEqual({ kind: "availability", from: "2026-12-05", pax: 4 });
  });

  it("lets newly parsed pax beat remembered pax", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-12-01", pax: 2 },
      { from: "2026-12-01", pax: 4 },
    );
    expect(out).toEqual({ kind: "availability", from: "2026-12-01", pax: 2 });
  });

  it("keeps a rate question a rate question when no date is remembered", () => {
    const out = mergeContext({ kind: "price", pax: 4 }, { stay: "Overnight" });
    expect(out).toEqual({ kind: "price", pax: 4, stay: "Overnight" });
  });

  it("passes through untouched with nothing remembered", () => {
    const intent: Intent = { kind: "price", pax: 4 };
    expect(mergeContext(intent, null)).toEqual(intent);
  });

  it("never lets context turn silence into a quote", () => {
    expect(mergeContext({ kind: "none" }, { from: "2026-12-01", pax: 4 })).toEqual({
      kind: "none",
    });
  });

  it("leaves a booking-ID lookup alone", () => {
    const intent: Intent = { kind: "bookingId", id: "DL-BK1762050261" };
    expect(mergeContext(intent, { from: "2026-12-01" })).toEqual(intent);
  });

  it("leaves an open-dates question alone", () => {
    expect(mergeContext({ kind: "openDates" }, { from: "2026-12-01" })).toEqual({
      kind: "openDates",
    });
  });

  it("leaves a stay-time question alone", () => {
    expect(mergeContext({ kind: "stayTime" }, { from: "2026-12-01" })).toEqual({
      kind: "stayTime",
    });
  });
});

describe("nextContext — what to remember", () => {
  it("records the date, pax and stay of an availability question", () => {
    const out = nextContext(
      { kind: "availability", from: "2026-12-01", pax: 4, stay: "Overnight" },
      null,
    );
    expect(out).toEqual({ from: "2026-12-01", to: undefined, pax: 4, stay: "Overnight" });
  });

  it("keeps a remembered pax when the new question omits it", () => {
    const out = nextContext({ kind: "availability", from: "2026-12-05" }, { pax: 4 });
    expect(out).toMatchObject({ from: "2026-12-05", pax: 4 });
  });

  it("records pax from a dateless rate question", () => {
    expect(nextContext({ kind: "price", pax: 4 }, null)).toEqual({ pax: 4 });
  });

  it("returns null when there is nothing worth keeping", () => {
    expect(nextContext({ kind: "price" }, null)).toBeNull();
  });

  it("leaves memory untouched for intents that teach nothing", () => {
    const had = { from: "2026-12-01", pax: 4 };
    expect(nextContext({ kind: "none" }, had)).toBe(had);
    expect(nextContext({ kind: "stayTime" }, had)).toBe(had);
  });
});

describe("followUpMessage", () => {
  it("greets by the Manila clock, not a hardcoded afternoon", () => {
    // 02:00 Manila
    expect(followUpMessage(new Date("2026-12-01T02:00:00+08:00"))).toContain("magandang umaga");
    // 14:00 Manila
    expect(followUpMessage(new Date("2026-12-01T14:00:00+08:00"))).toContain("magandang hapon");
    // 20:00 Manila
    expect(followUpMessage(new Date("2026-12-01T20:00:00+08:00"))).toContain("magandang gabi");
  });

  it("greets by Manila time even when the server clock is elsewhere", () => {
    // 23:00 UTC on Nov 30 is 07:00 Manila on Dec 1.
    expect(followUpMessage(new Date("2026-11-30T23:00:00Z"))).toContain("magandang umaga");
  });

  it("keeps the owner's wording", () => {
    const out = followUpMessage(new Date("2026-12-01T14:00:00+08:00"));
    expect(out).toContain("Hello Ma'am/Sir");
    expect(out).toContain("May we know po if interested pa po sila to book?");
  });
});
