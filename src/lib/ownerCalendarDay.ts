// Owner Booking Calendar — how one date resolves into its two sellable halves.
//
// Extracted from OwnerModules.tsx so the day-resolution rules can be unit
// tested; the component imports these and keeps only the rendering.
//
// Every cell is split along one diagonal: the DAYTIME half is 7AM–5PM, the
// NIGHT half is 7PM–5AM. A half is only filled when a booking actually holds
// it, so an open half stays white and the owner can see what's still sellable.

// Stay type from the booking's check-in/out clock times (business rules:
// Daycation 7AM–5PM, Nightcation 7PM–5AM, Overnight/Full-stay 7PM–4PM).
// The `booking` table has no stay_type column, so this is the only signal.
export type StayKind = "daycation" | "nightcation" | "overnight";

export function stayKind(checkInTime: string, checkOutTime: string): StayKind {
  const ci = parseInt(String(checkInTime || "").slice(0, 2), 10);
  const co = parseInt(String(checkOutTime || "").slice(0, 2), 10);
  if (ci >= 15) return co <= 6 ? "nightcation" : "overnight"; // 19:00 start
  return "daycation"; // 07:00 start
}

export const fmt12h = (t: string) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}${m[2] === "00" ? "" : ":" + m[2]}${ap}`;
};

// One reservation as it touches one date. The trailing fields exist only for
// the day-detail panel, which shows the whole booking behind a half.
export type DayBooking = {
  name: string; id: string; kind: StayKind; checkInTime: string; checkOutTime: string;
  isCheckIn: boolean; isCheckOut: boolean; isMiddle: boolean;
  haven: string; party: string; phone: string; stay: string; total: string; balance: string; status: string;
};

// Solid tan for Daycation, dark maroon-brown for Nightcation, slate for a full
// stay, lighter slate for a mid-stay (continuing) day.
export const COLOR = {
  blocked: "#F3C9C2",
  day: "#D9A857",        // Daycation — tan/gold
  night: "#3B2418",      // Nightcation — dark maroon-brown
  full: "#6E8A96",       // Full stay — slate blue
  continuing: "#A9D8B4", // Continuing (mid-stay) / fully booked all day — light green
  empty: "#ffffff",      // half is open / bookable
};

// The render model for one day: which half is held by what, plus the label,
// icons and marker the cell shows. `dayText`/`nightText` restate the same
// booking one half at a time, for the layouts that give each half its own row.
export type DayCell = {
  dayFill: string; nightFill: string; label: string; sub: string;
  sun?: boolean; moon?: boolean; asterisk?: boolean;
  dayText?: string; nightText?: string;
  // Which reservation actually holds each half — the day-detail panel shows
  // the booking behind a fill, so the fill alone isn't enough.
  dayBooking?: DayBooking | null; nightBooking?: DayBooking | null;
};

export const cell = (
  dayFill: string, nightFill: string, label: string, sub: string,
  extra: Omit<DayCell, "dayFill" | "nightFill" | "label" | "sub"> = {},
): DayCell => ({ dayFill, nightFill, label, sub, ...extra });

// Resolve one date's bookings into a DayCell: which half is held, by what, and
// what label/icon it shows.
export function resolveDayCell(list: DayBooking[]): DayCell | null {
  const overnightMiddle = list.find((x) => x.kind === "overnight" && x.isMiddle);
  const overnightCheckIn = list.find((x) => x.kind === "overnight" && x.isCheckIn);
  const overnightCheckOut = list.find((x) => x.kind === "overnight" && x.isCheckOut);
  const daycation = list.find((x) => x.kind === "daycation");
  const nightcation = list.find((x) => x.kind === "nightcation" && (x.isCheckIn || x.isMiddle));
  const nightcationOut = list.find((x) => x.kind === "nightcation" && x.isCheckOut && !x.isCheckIn);
  // Every cell reads the same way: the stay's name on the first line (the
  // same wording the legend uses), its timing on the second. The fills
  // already say which half is open, so the label never repeats that.
  const dayRange = daycation && fmt12h(daycation.checkInTime) && fmt12h(daycation.checkOutTime)
    ? `${fmt12h(daycation.checkInTime)}–${fmt12h(daycation.checkOutTime)}` : "";

  // Mid-stay day of a multi-night full stay — both halves held, but a lighter
  // slate so a pass-through day reads apart from the check-in day.
  if (overnightMiddle) return cell(COLOR.continuing, COLOR.continuing, "Full stay", "Continuing", { moon: true, dayText: "Guest in unit", nightText: "Guest in unit", dayBooking: overnightMiddle, nightBooking: overnightMiddle });

  // Handover day of two back-to-back full stays: yesterday's guest holds the
  // unit until the 5PM checkout and tonight's arrives 7PM, so BOTH halves are
  // gone to two different bookings. This has to be tested before the lone
  // check-in case below, which would otherwise return first and drop the
  // departing guest — leaving the daytime reading as sellable on a day the
  // unit is occupied until 5PM.
  if (overnightCheckIn && overnightCheckOut) {
    const outT = fmt12h(overnightCheckOut.checkOutTime);
    const inT = fmt12h(overnightCheckIn.checkInTime);
    const sub = [outT ? `Out ${outT}` : "", inT ? `In ${inT}` : ""].filter(Boolean).join(" · ");
    return cell(COLOR.full, COLOR.full, "Back-to-back", sub, {
      moon: true, asterisk: true,
      dayText: outT ? `Leaves ${outT}` : "Leaves",
      nightText: inT ? `Arrives ${inT}` : "Arrives",
      dayBooking: overnightCheckOut, nightBooking: overnightCheckIn,
    });
  }

  // Full-stay check-in: the guest only arrives 7PM, so the daytime is still
  // sellable as a Daycation — a 7AM–5PM stay plus its 2h turnover lands
  // exactly on 7PM, which the availability check in createBooking allows.
  // Only fill the day half when a Daycation has actually taken it.
  if (overnightCheckIn) {
    const t = fmt12h(overnightCheckIn.checkInTime);
    const arrives = t ? `Arrives ${t}` : "Arrives";
    if (daycation) return cell(COLOR.day, COLOR.full, "Day + Full", dayRange, { sun: true, moon: true, asterisk: true, dayText: "Daycation", nightText: arrives, dayBooking: daycation, nightBooking: overnightCheckIn });
    return cell(COLOR.empty, COLOR.full, "Full stay", t ? `In ${t}` : "", { moon: true, nightText: arrives, nightBooking: overnightCheckIn });
  }

  // Full-stay checkout (out 4PM): the daytime is held to checkout, the
  // evening is still sellable as a Nightcation — unless one already took it.
  if (overnightCheckOut) {
    const t = fmt12h(overnightCheckOut.checkOutTime);
    const sub = t ? `Out ${t}` : "Checkout";
    const leaves = t ? `Leaves ${t}` : "Leaves";
    if (nightcation) return cell(COLOR.full, COLOR.night, "Full + Night", sub, { moon: true, asterisk: true, dayText: leaves, nightText: "Nightcation", dayBooking: overnightCheckOut, nightBooking: nightcation });
    return cell(COLOR.full, COLOR.empty, "Full stay", sub, { dayText: leaves, dayBooking: overnightCheckOut });
  }

  // Two separate bookings sharing the date: Daycation by day, Nightcation at night.
  if (daycation && nightcation) return cell(COLOR.day, COLOR.night, "Day + Night", dayRange, { sun: true, moon: true, asterisk: true, dayText: "Daycation", nightText: "Nightcation", dayBooking: daycation, nightBooking: nightcation });

  // Daycation holds the morning; the evening stays open. A Nightcation that
  // ended 5AM that morning is only a note — it holds neither half of today.
  if (daycation) return cell(COLOR.day, COLOR.empty, "Daycation", dayRange, { sun: true, dayText: dayRange || "Daycation", dayBooking: daycation });

  if (nightcation) {
    const t = fmt12h(nightcation.checkInTime);
    return cell(COLOR.empty, COLOR.night, "Nightcation", t ? `In ${t}` : "", { moon: true, nightText: t ? `Arrives ${t}` : "Nightcation", nightBooking: nightcation });
  }

  // Nightcation checkout at 5AM — the whole date is back on the market, so
  // neither half is filled; the label is just a heads-up about the departure.
  if (nightcationOut) {
    const t = fmt12h(nightcationOut.checkOutTime);
    return cell(COLOR.empty, COLOR.empty, "Nightcation", t ? `Out ${t}` : "Checkout");
  }
  return null;
}
