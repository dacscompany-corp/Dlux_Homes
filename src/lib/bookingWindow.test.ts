import { describe, it, expect } from "vitest";
import { isStartBookable, occupyingBookingSql, MIN_LEAD_MINUTES } from "./bookingWindow";

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
