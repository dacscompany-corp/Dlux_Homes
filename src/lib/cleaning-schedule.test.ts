import { describe, it, expect } from "vitest";
import { canStartCleaning, cleaningDueAt, groupByDueDay, stayKindFor } from "./cleaning-schedule";

// Booking times are Manila wall-clock (+08:00). Assertions use exact instants
// so they hold on any machine, whatever its local timezone.
describe("cleaningDueAt", () => {
  it("prefers the stored scheduled_for", () => {
    const due = cleaningDueAt({
      scheduled_for: "2026-10-02T04:00:00.000Z",
      check_out_date: "2026-10-05",
      check_out_time: "12:00",
    });
    expect(due?.toISOString()).toBe("2026-10-02T04:00:00.000Z");
  });

  it("falls back to the booking's checkout, read as Manila time", () => {
    const due = cleaningDueAt({ check_out_date: "2026-10-05", check_out_time: "12:00:00" });
    expect(due?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("treats a 00:00 checkout as midnight at the END of the checkout date", () => {
    const due = cleaningDueAt({ check_out_date: "2026-10-05", check_out_time: "00:00" });
    expect(due?.toISOString()).toBe("2026-10-05T16:00:00.000Z"); // Oct 6 00:00 Manila
  });

  it("uses end of day when there is no checkout time", () => {
    const due = cleaningDueAt({ check_out_date: "2026-10-05", check_out_time: null });
    expect(due?.toISOString()).toBe("2026-10-05T15:59:00.000Z"); // 23:59 Manila
  });

  it("pads a single-digit hour", () => {
    const due = cleaningDueAt({ check_out_date: "2026-10-05", check_out_time: "9:30" });
    expect(due?.toISOString()).toBe("2026-10-05T01:30:00.000Z");
  });

  it("reads a full ISO checkout date by its calendar day", () => {
    const due = cleaningDueAt({ check_out_date: "2026-10-05T00:00:00.000Z", check_out_time: "11:00" });
    expect(due?.toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });

  it("returns null when there's nothing to go on", () => {
    expect(cleaningDueAt({})).toBeNull();
    expect(cleaningDueAt({ scheduled_for: "not a date" })).toBeNull();
    expect(cleaningDueAt({ check_out_date: "garbage" })).toBeNull();
  });
});

describe("canStartCleaning", () => {
  const task = { check_out_date: "2026-10-05", check_out_time: "12:00" }; // 04:00Z

  it("refuses before the guest checks out", () => {
    expect(canStartCleaning(task, new Date("2026-10-05T03:59:00Z"))).toBe(false);
    expect(canStartCleaning(task, new Date("2026-10-04T07:00:00Z"))).toBe(false);
  });

  it("allows it from checkout onward", () => {
    expect(canStartCleaning(task, new Date("2026-10-05T04:00:00Z"))).toBe(true);
    expect(canStartCleaning(task, new Date("2026-10-06T01:00:00Z"))).toBe(true);
  });

  it("opens early once the guest is checked out, whatever the clock says", () => {
    const early = new Date("2026-10-05T01:00:00Z"); // 3 hours before checkout
    expect(canStartCleaning({ ...task, booking_status: "completed" }, early)).toBe(true);
    expect(canStartCleaning({ ...task, booking_status: "checked-out" }, early)).toBe(true);
  });

  it("stays closed for a guest still in the room before checkout time", () => {
    const early = new Date("2026-10-05T01:00:00Z");
    for (const status of ["approved", "checked-in", "on-going"]) {
      expect(canStartCleaning({ ...task, booking_status: status }, early)).toBe(false);
    }
  });

  it("doesn't block a task with no dates at all", () => {
    expect(canStartCleaning({}, new Date())).toBe(true);
  });
});

describe("stayKindFor", () => {
  it("reads the three stay types from the booking's own times", () => {
    expect(stayKindFor({ check_in_date: "2026-09-28", check_in_time: "07:00", check_out_date: "2026-09-28", check_out_time: "17:00" }))
      .toEqual({ kind: "day", nights: 0 });
    expect(stayKindFor({ check_in_date: "2026-09-27", check_in_time: "19:00", check_out_date: "2026-09-28", check_out_time: "05:00" }))
      .toEqual({ kind: "night", nights: 1 });
    expect(stayKindFor({ check_in_date: "2026-09-25", check_in_time: "19:00", check_out_date: "2026-09-26", check_out_time: "17:00" }))
      .toEqual({ kind: "overnight", nights: 1 });
  });

  it("counts nights on a multi-night stay", () => {
    expect(stayKindFor({ check_in_date: "2026-11-05", check_in_time: "19:00:00", check_out_date: "2026-11-24", check_out_time: "17:00:00" }))
      .toEqual({ kind: "overnight", nights: 19 });
  });
});

describe("groupByDueDay", () => {
  // Groups are by the viewing device's local day, so these build both the
  // inputs and "now" from local-time constructors — valid in any timezone.
  const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h).toISOString();
  const now = new Date(2026, 9, 5, 9, 0);

  it("groups by due day, earliest first, rooms in due-time order", () => {
    const days = groupByDueDay(
      [
        { id: "c", scheduled_for: at(2026, 9, 7, 11) },
        { id: "b", scheduled_for: at(2026, 9, 5, 14) },
        { id: "a", scheduled_for: at(2026, 9, 5, 10) },
        { id: "d", scheduled_for: at(2026, 9, 6, 12) },
      ],
      now,
    );
    expect(days.map((d) => d.day.getDate())).toEqual([5, 6, 7]);
    expect(days[0].tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("flags today and tomorrow", () => {
    const days = groupByDueDay(
      [
        { scheduled_for: at(2026, 9, 5, 10) },
        { scheduled_for: at(2026, 9, 6, 10) },
        { scheduled_for: at(2026, 9, 8, 10) },
      ],
      now,
    );
    expect(days.map((d) => [d.isToday, d.isTomorrow])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("drops rows with no usable date", () => {
    expect(groupByDueDay([{}], now)).toEqual([]);
  });
});
