import { describe, it, expect } from "vitest";
import {
  isStartBookable,
  occupyingBookingSql,
  MIN_LEAD_MINUTES,
  EXISTING_START_SQL,
  EXISTING_END_SQL,
  stayTypeCodeFor,
} from "./bookingWindow";

const at = (iso: string) => new Date(iso).getTime();

describe("isStartBookable", () => {
  const now = at("2026-08-24T23:47:00");

  it("rejects a window whose check-in has already passed", () => {
    // The bug this exists for: a 7am daycation still offered at 11:47pm.
    expect(isStartBookable(at("2026-08-24T07:00:00"), now)).toBe(false);
  });

  it("rejects a window that started only a moment ago", () => {
    expect(isStartBookable(now - 1, now)).toBe(false);
  });

  it("accepts a window starting exactly now", () => {
    expect(isStartBookable(now, now)).toBe(true);
  });

  it("accepts a window later the same day", () => {
    expect(isStartBookable(at("2026-08-25T07:00:00"), now)).toBe(true);
  });

  it("accepts a window on a future date", () => {
    expect(isStartBookable(at("2026-09-05T19:00:00"), now)).toBe(true);
  });

  it("applies a lead time when one is given", () => {
    const start = at("2026-08-25T01:00:00"); // 73 minutes after now
    expect(isStartBookable(start, now, 60)).toBe(true);
    expect(isStartBookable(start, now, 120)).toBe(false);
  });

  it("defaults to no lead time", () => {
    expect(MIN_LEAD_MINUTES).toBe(0);
    expect(isStartBookable(now, now)).toBe(isStartBookable(now, now, MIN_LEAD_MINUTES));
  });

  it("refuses rather than throws on unusable input", () => {
    expect(isStartBookable(NaN, now)).toBe(false);
    expect(isStartBookable(now, NaN)).toBe(false);
  });
});

describe("occupyingBookingSql", () => {
  it("counts every live status", () => {
    const sql = occupyingBookingSql();
    for (const s of ["pending", "approved", "confirmed", "checked-in", "on-going"]) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  it("keeps a completed stay blocking until its scheduled end", () => {
    const sql = occupyingBookingSql();
    expect(sql).toContain("'completed'");
    expect(sql).toContain("check_out_date");
    expect(sql).toContain("check_out_time");
    expect(sql).toContain("Asia/Manila");
  });

  it("honours the alias so it can be dropped into any query", () => {
    expect(occupyingBookingSql("x")).toContain("x.status");
    expect(occupyingBookingSql("x")).not.toContain("b.status");
  });

  it("defaults to the b alias used by the booking queries", () => {
    expect(occupyingBookingSql()).toContain("b.status");
  });
});

describe("shared conflict SQL fragments", () => {
  it("expresses an existing booking's start from its check-in columns", () => {
    expect(EXISTING_START_SQL).toContain("b.check_in_date");
    expect(EXISTING_START_SQL).toContain("b.check_in_time");
  });

  it("treats a '00:00' checkout as the next day's midnight", () => {
    expect(EXISTING_END_SQL).toContain("'00:00'");
    expect(EXISTING_END_SQL).toContain("INTERVAL '1 day'");
  });
});

/**
 * createBooking checks an automatic promotion's applies_to scope against this.
 * Get it wrong and an overnight-only offer pays out on a daycation — which is
 * why it is derived here rather than read off the payload.
 */
describe("stayTypeCodeFor", () => {
  it("reads a same-day session as the 10-hour stay", () => {
    expect(stayTypeCodeFor("2026-09-20", "2026-09-20", "08:00", "18:00")).toBe("10");
  });

  it("still reads a session that crosses midnight as the 10-hour stay", () => {
    // An 8pm–6am Nightcation spans two dates but is one session, so the date
    // span alone cannot tell it apart from a one-night overnight.
    expect(stayTypeCodeFor("2026-09-20", "2026-09-21", "20:00", "06:00")).toBe("10");
  });

  it("reads a single overnight as the overnight stay", () => {
    expect(stayTypeCodeFor("2026-09-20", "2026-09-21", "14:00", "12:00")).toBe("21");
  });

  it("reads a multi-night stay as the overnight stay", () => {
    expect(stayTypeCodeFor("2026-09-20", "2026-09-24", "14:00", "12:00")).toBe("21");
  });

  it("falls back to the overnight stay when the input cannot be read", () => {
    // Matches the checkout's own default, and is the conservative direction:
    // a day-scoped offer is refused rather than quietly honoured.
    expect(stayTypeCodeFor(null, null, null, null)).toBe("21");
    expect(stayTypeCodeFor("not-a-date", "also-not", "08:00", "18:00")).toBe("21");
    expect(stayTypeCodeFor("2026-09-20", "2026-09-20", "18:00", "08:00")).toBe("21");
  });

  it("accepts full ISO timestamps, as Postgres returns them", () => {
    expect(stayTypeCodeFor("2026-09-20T00:00:00.000Z", "2026-09-20T00:00:00.000Z", "08:00", "18:00")).toBe("10");
  });
});
