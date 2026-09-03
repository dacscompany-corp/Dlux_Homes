import { describe, it, expect } from "vitest";
import { COLOR, resolveDayCell, stayKind, type DayBooking } from "./ownerCalendarDay";

// Minimal DayBooking factory — only the fields the resolution rules read
// matter; the rest exist for the day-detail panel.
function bk(over: Partial<DayBooking> & Pick<DayBooking, "kind">): DayBooking {
  return {
    name: "Guest", id: "DL-BK0000000000",
    checkInTime: "19:00:00", checkOutTime: "17:00:00",
    isCheckIn: false, isCheckOut: false, isMiddle: false,
    haven: "Tower 4", party: "2 adults", phone: "—", stay: "",
    total: "₱0", balance: "Fully paid", status: "Approved",
    ...over,
  };
}

const overnightIn = () => bk({ kind: "overnight", isCheckIn: true });
const overnightOut = () => bk({ kind: "overnight", isCheckOut: true });

describe("stayKind", () => {
  it("reads a 7PM–5PM booking as a full-stay overnight", () => {
    expect(stayKind("19:00:00", "17:00:00")).toBe("overnight");
  });
  it("reads a 7PM–5AM booking as a Nightcation", () => {
    expect(stayKind("19:00:00", "05:00:00")).toBe("nightcation");
  });
  it("reads a 7AM–5PM booking as a Daycation", () => {
    expect(stayKind("07:00:00", "17:00:00")).toBe("daycation");
  });
});

describe("resolveDayCell", () => {
  it("leaves the daytime open on a lone full-stay check-in", () => {
    const c = resolveDayCell([overnightIn()])!;
    expect(c.dayFill).toBe(COLOR.empty);
    expect(c.nightFill).toBe(COLOR.full);
    expect(c.dayBooking ?? null).toBeNull();
  });

  it("holds the daytime to checkout on a lone full-stay checkout", () => {
    const c = resolveDayCell([overnightOut()])!;
    expect(c.dayFill).toBe(COLOR.full);
    expect(c.nightFill).toBe(COLOR.empty);
    expect(c.dayBooking?.kind).toBe("overnight");
  });

  // The handover day of two back-to-back full stays: yesterday's guest holds
  // the unit until the 5PM checkout, tonight's guest arrives 7PM. Both halves
  // are gone, so the daytime must never read as sellable.
  it("holds BOTH halves when one full stay checks out and another checks in", () => {
    const leaving = overnightOut();
    const arriving = overnightIn();
    const c = resolveDayCell([leaving, arriving])!;

    expect(c.dayBooking).toBe(leaving);
    expect(c.nightBooking).toBe(arriving);
    expect(c.dayFill).not.toBe(COLOR.empty);
    expect(c.nightFill).not.toBe(COLOR.empty);
  });

  it("is order-independent on that handover day", () => {
    const leaving = overnightOut();
    const arriving = overnightIn();
    const c = resolveDayCell([arriving, leaving])!;

    expect(c.dayBooking).toBe(leaving);
    expect(c.nightBooking).toBe(arriving);
  });

  it("still pairs a Daycation with an arriving full stay", () => {
    const day = bk({ kind: "daycation", isCheckIn: true, checkInTime: "07:00:00", checkOutTime: "17:00:00" });
    const c = resolveDayCell([day, overnightIn()])!;
    expect(c.dayBooking).toBe(day);
    expect(c.nightBooking?.kind).toBe("overnight");
  });

  it("returns null for a date nothing touches", () => {
    expect(resolveDayCell([])).toBeNull();
  });
});
