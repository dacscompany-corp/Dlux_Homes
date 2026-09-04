import { describe, it, expect } from "vitest";
import {
  mergeContext,
  nextContext,
  followUpMessage,
  MESSENGER_FOLLOWUP_STAGES,
} from "./messenger-context";
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

describe("MESSENGER_FOLLOWUP_STAGES", () => {
  it("nudges at 10 minutes, 1 hour, then 23 hours", () => {
    expect(MESSENGER_FOLLOWUP_STAGES).toEqual([10, 60, 1380]);
  });

  // 1440 would fire at 24h00-24h15 with the 15-minute pinger, past Meta's
  // 24-hour standard messaging window, and Graph would reject every third
  // nudge. 23 hours still reads as "next day" and always sends.
  it("keeps the last nudge inside Meta's 24-hour messaging window", () => {
    const last = MESSENGER_FOLLOWUP_STAGES[MESSENGER_FOLLOWUP_STAGES.length - 1];
    expect(last).toBeLessThan(24 * 60);
    // Even after a full pinger cycle of slack, still inside the window.
    expect(last + 15).toBeLessThan(24 * 60);
  });
});

describe("followUpMessage — per stage", () => {
  const AFTERNOON = new Date("2026-12-01T14:00:00+08:00");
  const URL = "dlux-homes.vercel.app";

  it("stage 1 is the owner's original wording, with no link", () => {
    const out = followUpMessage(AFTERNOON, 1, URL);
    expect(out).toContain("May we know po if interested pa po sila to book?");
    expect(out).not.toContain(URL);
  });

  it("stage 2 invites questions and carries the booking link", () => {
    const out = followUpMessage(AFTERNOON, 2, URL);
    expect(out).toContain("Hello po ulit!");
    expect(out).toContain("tanong pa kayo tungkol sa rates o sa unit");
    expect(out).toContain("Kung interested pa rin po kayo");
    expect(out).toContain(URL);
  });

  it("stage 2 does not claim the date is being held", () => {
    // Owner's call: nothing is reserved yet, so a hold reminder would describe
    // a booking the guest never made.
    expect(followUpMessage(AFTERNOON, 2, URL)).not.toContain("naka-hold");
  });

  it("stage 3 signals it is the last message and offers another date", () => {
    const out = followUpMessage(AFTERNOON, 3, URL);
    expect(out).toContain("Last follow-up");
    expect(out).toContain("ibang date");
    expect(out).toContain(URL);
  });

  // Stage 2 opens "Hello po ulit!" by the owner's wording, so only the stages
  // that actually greet are checked for the Manila time-of-day word.
  it("greets by Manila time on the stages that greet", () => {
    const morning = new Date("2026-12-01T07:00:00+08:00");
    const evening = new Date("2026-12-01T20:00:00+08:00");
    for (const stage of [1, 3] as const) {
      expect(followUpMessage(morning, stage, URL)).toContain("magandang umaga");
      expect(followUpMessage(evening, stage, URL)).toContain("magandang gabi");
    }
    expect(followUpMessage(morning, 2, URL)).toContain("Hello po ulit!");
  });

  it("defaults to stage 1 so existing callers keep working", () => {
    expect(followUpMessage(AFTERNOON)).toContain("May we know po if interested");
  });
});

describe("mergeContext — a new date reopens the window choice", () => {
  // The live bug: after narrowing to Overnight for Sep 2, asking "December 1 is
  // available?" answered with Overnight alone, hiding a Daycation and a
  // Nightcation that were both free that day.
  it("drops the remembered stay when a different date is named", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-12-01" },
      { from: "2026-09-02", pax: 4, stay: "Overnight" },
    );
    expect(out).toEqual({ kind: "availability", from: "2026-12-01", pax: 4 });
  });

  it("keeps the remembered stay when the same date is asked again", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-09-02" },
      { from: "2026-09-02", pax: 4, stay: "Overnight" },
    );
    expect(out).toEqual({
      kind: "availability",
      from: "2026-09-02",
      pax: 4,
      stay: "Overnight",
    });
  });

  it("lets the guest re-narrow the new date in the same breath", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-12-01", stay: "Daycation" },
      { from: "2026-09-02", pax: 4, stay: "Overnight" },
    );
    expect(out).toMatchObject({ from: "2026-12-01", stay: "Daycation", pax: 4 });
  });

  it("still narrows a dateless fragment, which is the same enquiry continuing", () => {
    const out = mergeContext({ kind: "price", pax: 5 }, { from: "2026-09-02", stay: "Overnight" });
    expect(out).toEqual({
      kind: "availability",
      from: "2026-09-02",
      pax: 5,
      stay: "Overnight",
    });
  });

  it("carries pax across a date change, since the party did not change", () => {
    const out = mergeContext(
      { kind: "availability", from: "2026-12-05" },
      { from: "2026-12-01", pax: 4, stay: "Nightcation" },
    );
    expect(out).toEqual({ kind: "availability", from: "2026-12-05", pax: 4 });
  });
});

describe("nextContext — a new date forgets the old narrowing", () => {
  it("clears the remembered stay so it cannot resurface next message", () => {
    const out = nextContext(
      { kind: "availability", from: "2026-12-01", pax: 4 },
      { from: "2026-09-02", pax: 4, stay: "Overnight" },
    );
    expect(out).toEqual({ from: "2026-12-01", to: undefined, pax: 4 });
    expect(out).not.toHaveProperty("stay");
  });

  it("keeps the stay when the date did not change", () => {
    const out = nextContext(
      { kind: "availability", from: "2026-09-02", pax: 4 },
      { from: "2026-09-02", pax: 4, stay: "Overnight" },
    );
    expect(out).toMatchObject({ stay: "Overnight" });
  });

  it("records a stay named alongside a new date", () => {
    const out = nextContext(
      { kind: "availability", from: "2026-12-01", stay: "Daycation" },
      { from: "2026-09-02", stay: "Overnight" },
    );
    expect(out).toMatchObject({ from: "2026-12-01", stay: "Daycation" });
  });
});
