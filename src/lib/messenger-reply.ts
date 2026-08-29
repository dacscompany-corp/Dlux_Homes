/**
 * Taglish guest-facing copy for the Messenger bot.
 *
 * Pure: no DB, no Graph calls. Kept apart from availability and parsing so the
 * wording can be revised without touching calendar logic — the copy is the part
 * the owner will want to tune.
 *
 * Every reply is Taglish with `po` regardless of the language the guest wrote
 * in. Prices come from src/lib/pricing.ts and are never recomputed here.
 */
import { pickRate, extraPaxFee, isWeekendOrHoliday, type CalendarRules } from "./pricing";

/**
 * The rate fields pricing.ts needs. Declared here rather than imported because
 * pricing.ts keeps its `Rates` type unexported; TypeScript is structural, so a
 * matching shape satisfies pickRate() without touching that file. The optional
 * long-term fields are carried through so a bundled stay prices correctly.
 */
export type RateFields = {
  price10hr: number;
  price10hrWeekend: number;
  price21hr: number;
  price21hrWeekend: number;
  longtermTier1Rate?: number;
  longtermTier2Rate?: number;
  longtermTier3Rate?: number;
  longtermTier4Rate?: number;
  longtermActive?: boolean;
  longtermExtraPaxFee?: number;
};

export type StayWindow = {
  stayType: "10" | "21";
  label: "Daycation" | "Nightcation" | "Overnight";
  checkIn: string; // "HH:MM"
  checkOut: string; // "HH:MM"
};

const BASE_PAX = 2;

export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

function t12(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m[2] === "00" ? `${h}${ap}` : `${h}:${m[2]}${ap}`;
}

function addDays(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function shortDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const month = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d}`;
}

function dayName(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function windowLine(w: StayWindow): string {
  return `${w.label} (${t12(w.checkIn)}–${t12(w.checkOut)})`;
}

/**
 * Total for one stay window. A 10-hour Daycation/Nightcation is a single
 * session, so it is always one "night" for pricing and its extra-pax fee is
 * charged once — matching stayTotal()'s own treatment.
 */
export function quoteFor(
  w: StayWindow,
  checkInISO: string,
  nights: number,
  pax: number,
  rates: RateFields,
  feePerPax: number,
  rules: CalendarRules,
): number {
  const sessions = w.stayType === "10" ? 1 : Math.max(1, nights);
  let room = 0;
  for (let i = 0; i < sessions; i++) {
    room += pickRate(w.stayType, addDays(checkInISO, i), rates, rules);
  }
  return room + extraPaxFee(pax, BASE_PAX, feePerPax, sessions);
}

export function availabilityReply(args: {
  from: string;
  to?: string;
  nights: number;
  pax: number;
  windows: StayWindow[];
  rates: RateFields;
  extraPaxFee: number;
  bookingUrl: string;
  rules: CalendarRules;
}): string {
  const { from, to, nights, pax, windows, rates, bookingUrl, rules } = args;
  const span = to
    ? `${shortDate(from)}–${shortDate(to)} (${nights} nights)`
    : `${shortDate(from)} (${dayName(from)})`;

  if (windows.length === 0) {
    return (
      `Pasensya na po, fully booked po kami sa ${span}. ` +
      `Pwede po kayong magtanong ng ibang date — i-che-check ko po agad.`
    );
  }

  const lines = windows.map(
    (w) => `• ${windowLine(w)} — ${peso(quoteFor(w, from, nights, pax, rates, args.extraPaxFee, rules))}`,
  );
  const rateNote = isWeekendOrHoliday(from, rules)
    ? "Weekend/holiday rate po ang date na 'yan."
    : "Weekday rate po ang date na 'yan.";

  return (
    `Available po kami sa ${span} for ${pax} pax:\n\n` +
    `${lines.join("\n")}\n\n` +
    `${rateNote} 50% down payment po para ma-reserve. ` +
    `Book po kayo dito: ${bookingUrl}`
  );
}

export function priceReply(args: {
  rates: RateFields;
  windows: StayWindow[];
  extraPaxFee: number;
}): string {
  const { rates, windows, extraPaxFee: fee } = args;
  const lines = windows.map((w) => {
    const weekday = w.stayType === "10" ? rates.price10hr : rates.price21hr;
    const weekend = w.stayType === "10" ? rates.price10hrWeekend : rates.price21hrWeekend;
    return `• ${windowLine(w)}\n   Weekday ${peso(weekday)} · Weekend/Holiday ${peso(weekend)}`;
  });
  return (
    `Rates po namin (good for 2 pax):\n\n` +
    `${lines.join("\n")}\n\n` +
    `Extra pax po ${peso(fee)} each per night, max 4 pax. ` +
    `50% down payment po para ma-reserve.\n\n` +
    `Anong date po ang balak niyo? I-che-check ko po agad kung available.`
  );
}

export function openDatesReply(dates: string[], days: number): string {
  if (dates.length === 0) {
    return (
      `Pasensya na po, fully booked po kami sa susunod na ${days} araw. ` +
      `Pwede po kayong magtanong ng date na mas malayo — i-che-check ko po.`
    );
  }
  return (
    `Open po ang mga date na ito for Overnight sa susunod na ${days} araw:\n\n` +
    `${dates.map(shortDate).join(" · ")}\n\n` +
    `May Daycation (7AM–5PM) at Nightcation (7PM–5AM) din po kami. ` +
    `Sabihin niyo lang po ang date at pax, i-che-check ko agad.`
  );
}

export function overCapacityReply(asked: number, capacity: number): string {
  return (
    `Pasensya na po — ${capacity} pax po ang max namin, hindi po kasya ang ${asked}. ` +
    `Mag-message lang po kayo dito at tutulungan po kayo ng team namin.`
  );
}

export function askForDatesReply(): string {
  return `Sure po! 👋 Anong dates po at ilang pax? I-che-check ko po agad kung available.`;
}
