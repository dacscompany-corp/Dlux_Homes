/**
 * What a guest's Messenger message is asking for.
 *
 * Pure and I/O-free on purpose: the real messages this was built from run as
 * fast unit tests, and the calendar/pricing layers stay swappable.
 * Dates are Manila calendar dates as "YYYY-MM-DD" — the bot never reasons in
 * UTC, because a guest saying "aug 30" means the Manila day.
 */
/** The stay windows a guest can name, spelled as `havens` labels them. */
export type StayLabel = "Daycation" | "Nightcation" | "Overnight";

export type Intent =
  | {
      kind: "availability";
      from: string;
      to?: string;
      pax?: number;
      stay?: StayLabel;
      timeAsk?: true;
      /** The arrival time the guest named, e.g. "9PM". Only set when unambiguous. */
      requestedTime?: string;
    }
  | { kind: "price"; nights?: number; pax?: number; stay?: StayLabel }
  | { kind: "openDates" }
  | { kind: "stayTime" }
  | { kind: "bookingId"; id: string }
  | { kind: "none" };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const TAGALOG_NUMBERS: Record<string, number> = {
  isa: 1, dalawa: 2, tatlo: 3, apat: 4,
};

const BOOKING_ID = /DL-BK\d{6,}/i;
const OPEN_DATES = /\b(available|open)\s+(dates|days)\b|\banong\s+dates\b/i;
const AVAILABILITY = /\b(available|availability|meron|bakante|vacant|open)\b|\bmay\s+available\b/i;
const PRICE = /\brates?\b|\bhow\s+much\b|\bhm\b|\bmagkano\b|\bpresyo\b|\bprice\b/i;
const NIGHTS = /(\d+)\s*(?:nights?|gabi)\b/i;
const PAX_NUMERIC = /(\d+)\s*(?:pax|persons?|people|adults?|guests?|tao)\b|\bfor\s+(\d+)\b/i;

// "what time do we check in", asked in either language. `late` carries a word
// boundary so it cannot swallow "later", which parseDates reads as a date.
// `gabi` is deliberately absent from CLOCK: NIGHTS already claims it, so
// "3 gabi" must stay a count of nights rather than become 3 o'clock.
const TIME_ASK =
  /\bcheck[\s-]?(?:in|out|time)\b|\bcheckin\b|\bcheckout\b|\bpasok\b|\btime\b|\boras\b|\bearly\b|\blate\b|\bextend\b/i;
const CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|nn)\b/i;

/**
 * An arrival time only counts as named when the guest wrote a meridiem. In
 * "overnight 4 pax check time is 9" three numbers compete and none says morning
 * or evening, so echoing one back would risk confidently repeating a time the
 * guest never meant — the reply falls back to "kahit ibang oras" instead.
 */
const CLOCK_EXACT = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|nn)\b/i;

// A guest who names one window wants that window quoted, not the whole card.
// Ordered longest-first so "nightcation" cannot be read as "overnight", and
// anchored on `over`/`day`/`night` + a suffix so a bare "2 nights" stays a
// night count.
const STAY_TYPE =
  /\bnight\s?cation\b|\bnight\s?tour\b|\bover\s?night\b|\bday\s?cation\b|\bday\s?tour\b/i;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Manila calendar date of `now`, as YYYY-MM-DD. */
function manilaToday(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d };
}

function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * A bare month-day carries no year. Resolve it to the NEXT occurrence: "jan 5"
 * asked in August means next January, not one seven months gone.
 */
function resolveYear(month: number, day: number, today: { y: number; m: number; d: number }): string {
  const candidate = iso(today.y, month, day);
  const todayISO = iso(today.y, today.m, today.d);
  return candidate >= todayISO ? candidate : iso(today.y + 1, month, day);
}

// "sept 4-6", "aug 30", "sep 4 to 6". Global so a rejected "may" can be skipped
// and a genuine date further along the message still found.
const MONTH_DAY =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(?:\s*(?:-|–|to|hanggang)\s*(\d{1,2}))?/gi;

/**
 * What can follow "may <number>" and prove the guest meant Tagalog "there is"
 * rather than the month. Without this, "may 5pm check out ba?" quoted May 5 of
 * next year and "may 4 pax available ba?" quoted May 4 — both dates the guest
 * never typed. Only "may" needs the guard; no other month name doubles as a
 * common Tagalog word.
 */
const MAY_IS_NOT_MONTH =
  /^\s*(?::|am|pm|nn|pax|tao|persons?|people|guests?|adults?|nights?|gabi|oras|available|bakante|vacant)\b/i;

function parseDates(
  text: string,
  today: { y: number; m: number; d: number },
): { from: string; to?: string } | undefined {
  for (const m of text.matchAll(MONTH_DAY)) {
    const word = m[1].toLowerCase();
    if (word === "may" && MAY_IS_NOT_MONTH.test(text.slice(m.index + m[0].length))) continue;
    const month = MONTHS[word];
    const from = resolveYear(month, Number(m[2]), today);
    if (m[3]) {
      const [y] = from.split("-").map(Number);
      return { from, to: iso(y, month, Number(m[3])) };
    }
    return { from };
  }
  // "8/30"
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (numeric) {
    return { from: resolveYear(Number(numeric[1]), Number(numeric[2]), today) };
  }
  const todayISO = iso(today.y, today.m, today.d);
  if (/\b(bukas|tomorrow)\b/i.test(text)) return { from: addDaysISO(todayISO, 1) };
  if (/\b(later|mamaya|today|ngayon|tonight)\b/i.test(text)) return { from: todayISO };
  return undefined;
}

function parsePax(text: string): number | undefined {
  const m = text.match(PAX_NUMERIC);
  if (m) {
    const n = Number(m[1] ?? m[2]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  for (const [word, n] of Object.entries(TAGALOG_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return n;
  }
  return undefined;
}

/** "9pm" → "9PM", "11:30 am" → "11:30AM", "12nn" → "12NN". */
function parseRequestedTime(text: string): string | undefined {
  const m = text.match(CLOCK_EXACT);
  if (!m) return undefined;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return undefined;
  const meridiem = m[3].toUpperCase();
  if (meridiem === "NN") return "12NN";
  const minutes = m[2] && m[2] !== "00" ? `:${m[2]}` : "";
  return `${hour}${minutes}${meridiem}`;
}

function parseStay(text: string): StayLabel | undefined {
  const m = text.match(STAY_TYPE);
  if (!m) return undefined;
  const word = m[0].toLowerCase().replace(/\s+/g, "");
  if (word === "nightcation" || word === "nighttour") return "Nightcation";
  if (word === "overnight") return "Overnight";
  return "Daycation";
}

function parseNights(text: string): number | undefined {
  const m = text.match(NIGHTS);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Precedence: bookingId → openDates → availability → stayTime → price → none.
 *
 * A concrete date outranks a bare price keyword, so "rates for sept 4" is read
 * as an availability question about Sept 4 — the reply quotes prices anyway, so
 * the guest loses nothing by that choice.
 */
export function parseGuestMessage(text: string, now: Date): Intent {
  const t = String(text || "").trim();
  if (!t) return { kind: "none" };

  const id = t.match(BOOKING_ID);
  if (id) return { kind: "bookingId", id: id[0].toUpperCase() };

  if (OPEN_DATES.test(t)) return { kind: "openDates" };

  const today = manilaToday(now);
  const dates = parseDates(t, today);
  const pax = parsePax(t);
  const nights = parseNights(t);
  const stay = parseStay(t);

  // A time question stands alone only when no date came with it. A guest who
  // names both wants the date quoted AND the schedule rule, so the flag rides
  // along on the availability intent rather than replacing it.
  const timeAsk = TIME_ASK.test(t) || CLOCK.test(t);

  if (dates) {
    const out: Intent = { kind: "availability", from: dates.from };
    if (dates.to) out.to = dates.to;
    if (pax !== undefined) out.pax = pax;
    if (stay !== undefined) out.stay = stay;
    if (timeAsk) {
      out.timeAsk = true;
      const at = parseRequestedTime(t);
      if (at) out.requestedTime = at;
    }
    return out;
  }

  if (timeAsk) return { kind: "stayTime" };

  // "may available po kayo?" with no date at all is really "when are you open?"
  if (AVAILABILITY.test(t)) return { kind: "openDates" };

  // A bare pax/night count with no keyword at all — "2 pax for 3 nights" — is a
  // quote request. Guests routinely send only these numbers, expecting a price
  // back, so requiring the word "rate" here would drop a common real message.
  // A bare window name ("overnight") is the same kind of message.
  if (PRICE.test(t) || pax !== undefined || nights !== undefined || stay !== undefined) {
    const out: Intent = { kind: "price" };
    if (nights !== undefined) out.nights = nights;
    if (pax !== undefined) out.pax = pax;
    if (stay !== undefined) out.stay = stay;
    return out;
  }

  return { kind: "none" };
}
