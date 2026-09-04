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
import {
  stayTotal,
  bundleNightlyRate,
  bundleExtraPaxFee,
  extraPaxFee,
  isWeekendOrHoliday,
  type CalendarRules,
} from "./pricing";
import { spanHours } from "./stay-window";
import type { StayLabel } from "./messenger-intent";

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

/** Windows that are a single session and so cannot cover more than one night. */
const SHORT_STAYS = new Set<StayLabel>(["Daycation", "Nightcation"]);

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
 * Total for one stay window — the same number the storefront's checkout shows.
 *
 * Delegates the room total to stayTotal() rather than looping over pickRate(),
 * because a long Overnight stay does NOT price night-by-night: once it reaches
 * 3 / 11 / 18 / 26 nights the WHOLE stay reprices at a flat long-term rate.
 * Quoting per-night on a bundled stay overcharged a 14-night booking by ₱8,000.
 *
 * The extra-pax fee then has to follow the same fork. pricing.ts is explicit
 * that bundleExtraPaxFee() REPLACES extraPaxFee() on a bundled stay — adding
 * both double-bills the same guest — so the tier decides which one applies.
 *
 * A 10-hour Daycation/Nightcation is a single session: one "night" for pricing,
 * and its extra-pax fee is charged once rather than per night.
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
  const room = stayTotal(w.stayType, checkInISO, sessions, rates, rules);

  // Only an Overnight can reach a tier; a 10-hour session never does.
  const bundled =
    w.stayType === "21" && bundleNightlyRate(sessions, checkInISO, rates, rules) != null;

  const paxFee = bundled
    ? bundleExtraPaxFee(pax, BASE_PAX, sessions, rates)
    : extraPaxFee(pax, BASE_PAX, feePerPax, sessions);

  return room + paxFee;
}

/**
 * The house rule, for a guest who asked about a date and a time in the same
 * message. The full schedule block would bury the quote they came for, so the
 * date reply gets this instead.
 *
 * Naming the window's real check-in and check-out beats a vague "fixed po ang
 * check-out": a guest who asked to arrive at 9 wants to see 7PM–5PM spelled out
 * before being told it does not move. `requestedTime` is echoed only when the
 * guest wrote an unambiguous one; see parseRequestedTime in messenger-intent.
 */
export function timeNote(w?: StayWindow, requestedTime?: string): string {
  if (!w) {
    return (
      `Pwede po kayong mag-check in nang mas huli, pero fixed po ang check-out ` +
      `time at ang rate.`
    );
  }
  const schedule =
    `Standard po ang schedule ng ${w.label}: ${t12(w.checkIn)} check-in, ` +
    `${t12(w.checkOut)} check-out.`;
  const flexible = requestedTime
    ? `Kahit ${requestedTime} po kayo dumating, ${t12(w.checkOut)} pa rin po ang ` +
      `check-out at ganoon pa rin ang rate.`
    : `Kahit ibang oras po ang gusto niyong dumating, hindi po nagbabago ang ` +
      `check-out time at ang rate.`;
  return `${schedule} ${flexible}`;
}

/** The `count` whole hours after `hhmm`, as "8AM, 9AM, 10AM, 11AM". */
function laterHours(hhmm: string, count: number): string {
  const m = hhmm.match(/^(\d{1,2}):/);
  if (!m) return "";
  const start = Number(m[1]);
  return Array.from({ length: count }, (_, i) =>
    t12(`${String((start + i + 1) % 24).padStart(2, "0")}:00`),
  ).join(", ");
}

/**
 * "Anong oras ang check-in?" — and the rule behind the answer.
 *
 * Check-in is the only flexible part: a guest may arrive later than the
 * scheduled hour, but the check-out time and the rate never move with them. A
 * noon arrival on a Daycation still leaves at the posted check-out and still
 * pays the full rate, so the reply states both times outright before explaining
 * that a late arrival only shortens the stay.
 *
 * Every time comes from the haven's own windows, so editing the schedule in the
 * admin changes this reply too — the old copy's literal "7AM–5PM" would have
 * gone stale silently.
 */
export function stayTimeReply(windows: StayWindow[]): string {
  if (windows.length === 0) {
    return (
      `Fixed po ang check-out time at ang rate namin — hindi po nagbabago kahit ` +
      `mas huli kayo mag-check in. Mag-message lang po kayo dito para sa exact schedule.`
    );
  }

  const lines = windows.map((w) => {
    const span = spanHours(w.checkIn, w.checkOut);
    return (
      `• ${w.label} — Check-in ${t12(w.checkIn)} · Check-out ${t12(w.checkOut)}` +
      (span == null ? "" : ` (${span}h)`)
    );
  });

  // Name a real window in the example so it cannot contradict the list above.
  const sample = windows.find((w) => w.label === "Daycation") ?? windows[0];

  return (
    `Standard po ang schedule namin:\n\n` +
    `${lines.join("\n")}\n\n` +
    `Fixed po ang check-out time at ang rate. Pwede po kayong mag-check in nang ` +
    `mas huli — ${laterHours(sample.checkIn, 4)} — pero ${t12(sample.checkOut)} pa rin ` +
    `po ang check-out ng ${sample.label}, at ganoon pa rin po ang bayad.\n\n` +
    `Kaya mas maaga po kayo mag-check in, mas sulit po ang stay niyo. 🙂`
  );
}

export function availabilityReply(args: {
  from: string;
  to?: string;
  nights: number;
  pax: number;
  windows: StayWindow[];
  rates: RateFields;
  extraPaxFee: number;
  rules: CalendarRules;
  stay?: StayLabel;
  timeAsk?: boolean;
  requestedTime?: string;
}): string {
  const { from, to, nights, pax, windows, rates, rules, stay } = args;
  const span = to
    ? `${shortDate(from)}–${shortDate(to)} (${nights} nights)`
    : `${shortDate(from)} (${dayName(from)})`;

  if (windows.length === 0) {
    return (
      `Pasensya na po, fully booked po kami sa ${span}. ` +
      `Pwede po kayong magtanong ng ibang date — i-che-check ko po agad.`
    );
  }

  const price = (w: StayWindow) =>
    `• ${windowLine(w)} — ${peso(quoteFor(w, from, nights, pax, rates, args.extraPaxFee, rules))}`;

  // A guest who named one window gets that window, not the whole card. Two
  // things can still make the narrowed list empty, and each needs its own
  // answer — silence would read as "fully booked", which is not what happened.
  let quoted: StayWindow[];
  let lead = `Available po kami sa ${span} for ${pax} pax:`;

  if (stay && SHORT_STAYS.has(stay) && nights > 1) {
    // A 10-hour session is one day; the route has already narrowed `windows` to
    // Overnight, so quote that rather than answering a question with nothing.
    lead =
      `Isang araw lang po ang ${stay} — hindi po ito pwedeng pang-${nights} nights. ` +
      `Para po sa ${span}, Overnight po ang available:`;
    quoted = windows;
  } else if (stay && !windows.some((w) => w.label === stay)) {
    lead = `Pasensya na po, hindi po available ang ${stay} sa ${span}. Pero open pa po ang:`;
    quoted = windows;
  } else {
    quoted = stay ? windows.filter((w) => w.label === stay) : windows;
  }
  const lines = quoted.map(price);
  // A stay that reached a long-term tier is priced flat across the whole stay,
  // so naming a weekday/weekend rate would describe pricing that did not apply.
  const bundled =
    quoted.some((w) => w.stayType === "21") &&
    bundleNightlyRate(nights, from, rates, rules) != null;

  const rateNote = bundled
    ? `Long-term rate po ito para sa ${nights} nights.`
    : isWeekendOrHoliday(from, rules)
      ? "Weekend/holiday rate po ang date na 'yan."
      : "Weekday rate po ang date na 'yan.";

  return (
    `${lead}\n\n` +
    `${lines.join("\n")}\n\n` +
    // Only a single quoted window can have its times named; with several on
    // offer the generic wording stands, and each line already shows its own.
    (args.timeAsk
      ? `${timeNote(quoted.length === 1 ? quoted[0] : undefined, args.requestedTime)}\n\n`
      : "") +
    rateNote
  );
}

/**
 * The two "before you pay" terms, sent as its own message after a quote.
 *
 * A guest used to see only the down payment before being handed a booking
 * link, with the no-refund rule unmentioned until the checkout page. Sending
 * this separately keeps the quote scannable: Messenger renders consecutive
 * sends as their own bubbles, which separates the two far better than blank
 * lines inside one wall of text.
 *
 * Owner's call (2026-09-04): the date-change window and the "the form is only a
 * request" card were dropped from this bubble to keep it short. Both rules still
 * APPLY and still appear on the Terms page — HERO_CARDS in app/terms/page.tsx,
 * summarising §2, §7 and §8, which remains the authority. This message is an
 * early warning, not the full policy, so it is deliberately narrower than that
 * card set; do not treat the two as needing to match card-for-card.
 */
export function bookingTermsReply(bookingUrl: string): string {
  return (
    `📌 BASAHIN PO BAGO MAG-BOOK\n\n` +
    `💳 BAYAD\n` +
    `50% down payment po para ma-reserve ang date niyo. Ang natitirang 50% at ` +
    `ang ₱1,000 refundable deposit ay babayaran po sa check-in. GCash o BPI po.\n\n` +
    `🚫 WALANG CANCELLATION AT REFUND\n` +
    `Kapag confirmed na po ang booking, hindi na po ito pwedeng i-cancel at hindi ` +
    `na po maibabalik ang bayad — down payment man o balance. Kapag hindi po kayo ` +
    `dumating, mawawala po ang binayad niyo.\n\n` +
    `Kung ready na po kayo, book po kayo dito:\n${bookingUrl}`
  );
}

/**
 * The rate card, narrowed to what the guest actually asked about.
 *
 * Naming a window ("overnight") drops the other two, and naming a group larger
 * than the base pax folds the extra-pax fee into the figures shown. A guest who
 * asked "overnight 4 pax how much?" should not have to add ₱200 × 2 themselves
 * to find out.
 */
export function priceReply(args: {
  rates: RateFields;
  windows: StayWindow[];
  extraPaxFee: number;
  stay?: StayLabel;
  pax?: number;
}): string {
  const { rates, windows, extraPaxFee: fee, stay, pax } = args;

  // An unknown label would otherwise blank the card; fall back to all windows.
  const narrowed = stay ? windows.filter((w) => w.label === stay) : windows;
  const shown = narrowed.length > 0 ? narrowed : windows;

  // A 10-hour session charges the fee once, an Overnight once per night — but
  // this card quotes a single night either way, so one session covers both.
  const surcharge = pax && pax > BASE_PAX ? extraPaxFee(pax, BASE_PAX, fee, 1) : 0;

  const lines = shown.map((w) => {
    const weekday = (w.stayType === "10" ? rates.price10hr : rates.price21hr) + surcharge;
    const weekend =
      (w.stayType === "10" ? rates.price10hrWeekend : rates.price21hrWeekend) + surcharge;
    return `• ${windowLine(w)}\n   Weekday ${peso(weekday)} · Weekend/Holiday ${peso(weekend)}`;
  });

  const head = surcharge > 0 ? `Rates po namin for ${pax} pax:` : `Rates po namin (good for 2 pax):`;
  const terms =
    surcharge > 0
      ? `Kasama na po ang extra pax dito. Max 4 pax po. `
      : `Extra pax po ${peso(fee)} each per night, max 4 pax. `;

  return (
    `${head}\n\n` +
    `${lines.join("\n")}\n\n` +
    `${terms}50% down payment po para ma-reserve.\n\n` +
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
