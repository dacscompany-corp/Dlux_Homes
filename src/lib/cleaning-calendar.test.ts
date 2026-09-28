import { describe, it, expect } from "vitest";
import {
  buildCleaningEvent,
  cleaningWindow,
  googleCalendarAddUrl,
  statusLook,
  type CalendarTaskInput,
} from "./cleaning-calendar";

const checkout = new Date("2026-09-26T09:00:00Z"); // 5:00 PM Manila

function input(over: Partial<CalendarTaskInput> = {}): CalendarTaskInput {
  return {
    bookingRef: "DL-BK7311695998",
    room: "D'Lux Homes — Tower 4",
    cleaningStatus: "assigned",
    dueAt: checkout,
    check_in_date: "2026-09-25",
    check_in_time: "19:00:00",
    check_out_date: "2026-09-26",
    check_out_time: "17:00:00",
    guestFirstName: "Roycie",
    adults: 2,
    children: 1,
    portalUrl: "https://dlux-homes.vercel.app/admin/cleaners",
    ...over,
  };
}

describe("cleaningWindow", () => {
  it("runs from checkout to the next guest's check-in when that's the same day", () => {
    const next = new Date("2026-09-26T11:00:00Z"); // 7:00 PM Manila
    const w = cleaningWindow(checkout, next);
    expect(w).toEqual({ start: checkout, end: next, untilNextGuest: true });
  });

  it("uses a 2-hour block when there is no next guest", () => {
    const w = cleaningWindow(checkout, null);
    expect(w.end.toISOString()).toBe("2026-09-26T11:00:00.000Z");
    expect(w.untilNextGuest).toBe(false);
  });

  it("uses a 2-hour block when the next guest is days away", () => {
    const w = cleaningWindow(checkout, new Date("2026-10-01T11:00:00Z"));
    expect(w.untilNextGuest).toBe(false);
    expect(w.end.getTime() - w.start.getTime()).toBe(2 * 3_600_000);
  });

  it("ignores a 'next' check-in that isn't after checkout", () => {
    expect(cleaningWindow(checkout, checkout).untilNextGuest).toBe(false);
  });
});

describe("statusLook", () => {
  it("gives each status its own title prefix", () => {
    expect(statusLook("assigned").prefix).toBe("🧹 Clean");
    expect(statusLook("in-progress").prefix).toBe("🟡 Cleaning");
    expect(statusLook("awaiting-inspection").prefix).toBe("🟣 Awaiting inspection");
    expect(statusLook("ready").prefix).toBe("✅ Ready");
  });

  it("marks a task the office sent back", () => {
    expect(statusLook("in-progress", "Mirror streaky").prefix).toBe("🔁 Fix");
  });
});

describe("buildCleaningEvent", () => {
  it("puts status, booking and stay type in the title", () => {
    const e = buildCleaningEvent(input());
    expect(e.summary).toBe("🧹 Clean · DL-BK7311695998 · Overnight");
    expect(e.start).toEqual({ dateTime: "2026-09-26T09:00:00.000Z", timeZone: "Asia/Manila" });
  });

  it("carries the cleaner-safe booking details only", () => {
    const e = buildCleaningEvent(input({ nextCheckInAt: new Date("2026-09-26T11:00:00Z") }));
    expect(e.description).toContain("Booking: DL-BK7311695998");
    expect(e.description).toContain("Guest: Roycie");
    expect(e.description).toContain("Guests: 2 adults, 1 child");
    expect(e.description).toMatch(/Next guest checks in: .*7:00/);
    expect(e.description).toContain("https://dlux-homes.vercel.app/admin/cleaners");
  });

  it("includes the office's note when a task is sent back", () => {
    const e = buildCleaningEvent(input({ cleaningStatus: "in-progress", inspectionNote: "Bathroom mirror" }));
    expect(e.summary.startsWith("🔁 Fix")).toBe(true);
    expect(e.description).toContain("Office asked you to fix: Bathroom mirror");
  });

  it("names daycations and multi-night stays", () => {
    expect(buildCleaningEvent(input({ check_in_date: "2026-09-26", check_in_time: "07:00", check_out_date: "2026-09-26", check_out_time: "17:00" })).summary)
      .toContain("Daycation");
    expect(buildCleaningEvent(input({ check_in_date: "2026-11-05", check_out_date: "2026-11-24" })).summary)
      .toContain("19 nights");
  });
});

describe("googleCalendarAddUrl", () => {
  it("encodes the calendar id", () => {
    expect(googleCalendarAddUrl("abc@group.calendar.google.com"))
      .toBe("https://calendar.google.com/calendar/u/0/r?cid=abc%40group.calendar.google.com");
  });
});
