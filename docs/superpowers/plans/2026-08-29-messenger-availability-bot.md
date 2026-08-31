# Messenger Availability & Rates Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Messenger bot answer "is it available?" and "how much?" in Taglish, using the live calendar and the site's own pricing.

**Architecture:** Three new pure-ish modules — an intent parser (no I/O), a Taglish reply composer (no I/O), and an availability module that reuses the exact SQL fragments `createBooking` already uses. The webhook stays a thin dispatcher. Pricing is reused unchanged from `src/lib/pricing.ts` via `haven-adapter`.

**Tech Stack:** TypeScript, Next.js 16 App Router, raw `pg` SQL (no ORM), Vitest 4.

**Spec:** [docs/superpowers/specs/2026-08-29-messenger-availability-bot-design.md](../specs/2026-08-29-messenger-availability-bot-design.md)

## Global Constraints

- **Reply language is always Taglish**, with `po`. Never generate English-only guest copy.
- **Never hardcode rates, windows, capacity, or the extra-pax fee.** All come from the `havens` row via `havenToRoom()` in `src/lib/haven-adapter.ts`.
- **Never recompute pricing.** Use `stayTotal()`, `pickRate()`, `extraPaxFee()` from `src/lib/pricing.ts`.
- **Capacity is 4 counted pax**; over-capacity short-circuits before any DB query.
- **Do not change `src/lib/pricing.ts`.** Its known defects are inherited deliberately (spec §9).
- **Do not change `createBooking`'s behaviour.** Task 3 moves two SQL string constants out of it; the query text it runs must stay byte-identical.
- Stay-type codes: `"10"` = Daycation/Nightcation, `"21"` = Overnight.
- Tests are colocated: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Run with `npm run test`.
- DB-backed regression tests live in `scripts/*.mjs` and run against a `VALUES` fixture, never live tables. Follow `scripts/test-turnover.mjs`.
- **Do not run `git commit`.** The owner commits manually. Steps say "stage" and stop there.

---

### Task 1: Intent parser

Pure module, no I/O. Turns one guest message into a typed intent.

**Files:**
- Create: `src/lib/messenger-intent.ts`
- Test: `src/lib/messenger-intent.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Intent` type and `parseGuestMessage(text: string, now: Date): Intent`, used by Tasks 2, 4 and 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/messenger-intent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGuestMessage } from "./messenger-intent";

// Fixed reference point so month-day rollover is deterministic.
const NOW = new Date("2026-08-29T13:00:00+08:00");

describe("parseGuestMessage — real guest messages", () => {
  it("1: Taglish availability for today with pax", () => {
    const r = parseGuestMessage(
      "Ask ko lang kung may available unit po ba kayo for later and for 2 pax?Thankyouu",
      NOW,
    );
    expect(r).toEqual({ kind: "availability", from: "2026-08-29", pax: 2 });
  });

  it("2: bare Rates", () => {
    expect(parseGuestMessage("Rates", NOW)).toEqual({ kind: "price" });
  });

  it("3: pax + nights with no number filled in", () => {
    const r = parseGuestMessage("2 pax for (#) nights", NOW);
    expect(r).toEqual({ kind: "price", pax: 2 });
  });

  it("3b: pax + a real night count", () => {
    const r = parseGuestMessage("2 pax for 3 nights", NOW);
    expect(r).toEqual({ kind: "price", pax: 2, nights: 3 });
  });

  it("4: bare Available dates", () => {
    expect(parseGuestMessage("Available dates", NOW)).toEqual({ kind: "openDates" });
  });

  it("5: month-day with pax", () => {
    const r = parseGuestMessage("aug 30 for 2 pax", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-08-30", pax: 2 });
  });

  it("6: Taglish date range with pax", () => {
    const r = parseGuestMessage("available po sept 4-6? 2 pax", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-09-04", to: "2026-09-06", pax: 2 });
  });

  it("7: Hm and How much", () => {
    expect(parseGuestMessage("Hm", NOW)).toEqual({ kind: "price" });
    expect(parseGuestMessage("How much", NOW)).toEqual({ kind: "price" });
  });
});

describe("parseGuestMessage — other cases", () => {
  it("keeps booking-ID lookups ahead of the new intents", () => {
    const r = parseGuestMessage("rates for DL-BK1762050261", NOW);
    expect(r).toEqual({ kind: "bookingId", id: "DL-BK1762050261" });
  });

  it("rolls a past month-day forward to next year", () => {
    const r = parseGuestMessage("jan 5", NOW);
    expect(r).toEqual({ kind: "availability", from: "2027-01-05" });
  });

  it("reads bukas as tomorrow", () => {
    const r = parseGuestMessage("available po bukas?", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-08-30" });
  });

  it("reads magkano as a price question", () => {
    expect(parseGuestMessage("magkano po?", NOW)).toEqual({ kind: "price" });
  });

  it("reads Tagalog number words as pax", () => {
    const r = parseGuestMessage("available po sa sept 4 for dalawa", NOW);
    expect(r).toEqual({ kind: "availability", from: "2026-09-04", pax: 2 });
  });

  it("returns none for unrelated chatter", () => {
    expect(parseGuestMessage("thank you po!", NOW)).toEqual({ kind: "none" });
  });

  it("returns none for an empty message", () => {
    expect(parseGuestMessage("   ", NOW)).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/messenger-intent.test.ts`
Expected: FAIL — `Failed to resolve import "./messenger-intent"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/messenger-intent.ts`:

```ts
/**
 * What a guest's Messenger message is asking for.
 *
 * Pure and I/O-free on purpose: the seven real messages this was built from
 * run as fast unit tests, and the calendar/pricing layers stay swappable.
 * Dates are Manila calendar dates as "YYYY-MM-DD" — the bot never reasons in
 * UTC, because a guest saying "aug 30" means the Manila day.
 */
export type Intent =
  | { kind: "availability"; from: string; to?: string; pax?: number }
  | { kind: "price"; nights?: number; pax?: number }
  | { kind: "openDates" }
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

function parseDates(text: string, today: { y: number; m: number; d: number }):
  { from: string; to?: string } | undefined {
  // "sept 4-6", "aug 30", "sep 4 to 6"
  const named = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(?:\s*(?:-|–|to|hanggang)\s*(\d{1,2}))?/i,
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const from = resolveYear(month, Number(named[2]), today);
    if (named[3]) {
      const [y] = from.split("-").map(Number);
      return { from, to: iso(y, month, Number(named[3])) };
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
  if (/\b(later|mamaya|today|ngayon|tonight|mamayang gabi)\b/i.test(text)) return { from: todayISO };
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

function parseNights(text: string): number | undefined {
  const m = text.match(NIGHTS);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Precedence: bookingId → openDates → availability → price → none.
 * A concrete date outranks a bare price keyword, so "rates for sept 4" is
 * treated as an availability question about Sept 4 (the reply quotes prices
 * anyway, so the guest loses nothing).
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

  if (dates || AVAILABILITY.test(t)) {
    if (!dates) {
      // "may available po kayo?" with no date at all is really "when are you open?"
      return { kind: "openDates" };
    }
    const out: Intent = { kind: "availability", from: dates.from };
    if (dates.to) out.to = dates.to;
    if (pax !== undefined) out.pax = pax;
    return out;
  }

  // A bare pax/night count with no keyword at all — "2 pax for 3 nights" — is a
  // quote request. Guests routinely send only these numbers, expecting a price
  // back, so requiring the word "rate" here would drop a common real message.
  if (PRICE.test(t) || pax !== undefined || nights !== undefined) {
    const out: Intent = { kind: "price" };
    if (nights !== undefined) out.nights = nights;
    if (pax !== undefined) out.pax = pax;
    return out;
  }

  return { kind: "none" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/messenger-intent.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Lint and stage**

```bash
npm run lint
git add src/lib/messenger-intent.ts src/lib/messenger-intent.test.ts
```

Do not commit — the owner commits manually.

---

### Task 2: Taglish reply composer

Pure module. Turns resolved availability plus quotes into the exact strings guests receive.

**Files:**
- Create: `src/lib/messenger-reply.ts`
- Test: `src/lib/messenger-reply.test.ts`

**Interfaces:**
- Consumes: `StayWindow` (defined here in Step 3, re-exported by Task 3 so both modules agree), `pickRate()`/`extraPaxFee()` from `src/lib/pricing.ts`.
- Produces: `peso()`, `quoteFor()`, `availabilityReply()`, `priceReply()`, `openDatesReply()`, `overCapacityReply()`, `askForDatesReply()` — all used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/messenger-reply.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  peso,
  quoteFor,
  availabilityReply,
  priceReply,
  openDatesReply,
  overCapacityReply,
  askForDatesReply,
  type StayWindow,
} from "./messenger-reply";

const RATES = {
  price10hr: 1499,
  price10hrWeekend: 1799,
  price21hr: 1899,
  price21hrWeekend: 2099,
  longtermActive: false,
};

const OVERNIGHT: StayWindow = { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" };
const DAYCATION: StayWindow = { stayType: "10", label: "Daycation", checkIn: "07:00", checkOut: "17:00" };
const NIGHTCATION: StayWindow = { stayType: "10", label: "Nightcation", checkIn: "19:00", checkOut: "05:00" };

describe("peso", () => {
  it("formats with a thousands separator and no decimals", () => {
    expect(peso(2099)).toBe("₱2,099");
    expect(peso(12500)).toBe("₱12,500");
  });
});

describe("quoteFor", () => {
  // 2026-08-30 is a Sunday -> weekend rate.
  it("prices a weekend overnight at the weekend rate", () => {
    expect(quoteFor(OVERNIGHT, "2026-08-30", 1, 2, RATES, 200)).toBe(2099);
  });

  // 2026-09-02 is a Wednesday -> weekday rate.
  it("prices a weekday overnight at the weekday rate", () => {
    expect(quoteFor(OVERNIGHT, "2026-09-02", 1, 2, RATES, 200)).toBe(1899);
  });

  it("prices a weekend daycation at the 10-hour weekend rate", () => {
    expect(quoteFor(DAYCATION, "2026-08-30", 1, 2, RATES, 200)).toBe(1799);
  });

  it("adds the extra-pax fee per night", () => {
    // 2 nights weekday overnight = 1899*2, plus 1 extra pax * 200 * 2 nights.
    expect(quoteFor(OVERNIGHT, "2026-09-02", 2, 3, RATES, 200)).toBe(1899 * 2 + 400);
  });

  it("charges a 10-hour session's extra pax once, not per night", () => {
    expect(quoteFor(DAYCATION, "2026-09-02", 1, 3, RATES, 200)).toBe(1499 + 200);
  });
});

describe("availabilityReply", () => {
  it("lists every open window with its price", () => {
    const msg = availabilityReply({
      from: "2026-08-30",
      nights: 1,
      pax: 2,
      windows: [OVERNIGHT, DAYCATION, NIGHTCATION],
      rates: RATES,
      extraPaxFee: 200,
      bookingUrl: "dlux-homes.vercel.app",
    });
    expect(msg).toContain("Available po kami");
    expect(msg).toContain("Overnight");
    expect(msg).toContain("₱2,099");
    expect(msg).toContain("Daycation");
    expect(msg).toContain("Nightcation");
    expect(msg).toContain("₱1,799");
    expect(msg).toContain("50%");
  });

  it("says fully booked when nothing is open", () => {
    const msg = availabilityReply({
      from: "2026-08-30",
      nights: 1,
      pax: 2,
      windows: [],
      rates: RATES,
      extraPaxFee: 200,
      bookingUrl: "dlux-homes.vercel.app",
    });
    expect(msg).toContain("fully booked");
    expect(msg).not.toContain("₱");
  });

  it("states the night count for a multi-night range", () => {
    const msg = availabilityReply({
      from: "2026-09-04",
      to: "2026-09-06",
      nights: 2,
      pax: 2,
      windows: [OVERNIGHT],
      rates: RATES,
      extraPaxFee: 200,
      bookingUrl: "dlux-homes.vercel.app",
    });
    expect(msg).toContain("2 nights");
  });
});

describe("priceReply", () => {
  it("lists both weekday and weekend rates for every stay type", () => {
    const msg = priceReply({ rates: RATES, windows: [OVERNIGHT, DAYCATION, NIGHTCATION], extraPaxFee: 200 });
    expect(msg).toContain("₱1,899");
    expect(msg).toContain("₱2,099");
    expect(msg).toContain("₱1,499");
    expect(msg).toContain("₱1,799");
    expect(msg).toContain("₱200");
  });
});

describe("openDatesReply", () => {
  it("lists the open dates", () => {
    const msg = openDatesReply(["2026-08-30", "2026-09-01"], 14);
    expect(msg).toContain("Aug 30");
    expect(msg).toContain("Sep 1");
    expect(msg).toContain("Daycation");
  });

  it("says fully booked when the horizon has no open date", () => {
    expect(openDatesReply([], 14)).toContain("fully booked");
  });
});

describe("guard replies", () => {
  it("explains the 4-pax cap and hands off to staff", () => {
    const msg = overCapacityReply(6, 4);
    expect(msg).toContain("4");
    expect(msg).toContain("6");
  });

  it("asks for dates in Taglish", () => {
    expect(askForDatesReply()).toMatch(/dates/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/messenger-reply.test.ts`
Expected: FAIL — `Failed to resolve import "./messenger-reply"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/messenger-reply.ts`:

```ts
/**
 * Taglish guest-facing copy for the Messenger bot.
 *
 * Pure: no DB, no Graph calls. Kept apart from availability and parsing so the
 * wording can be revised without touching calendar logic — the copy is the part
 * the owner will want to tune.
 *
 * Every reply is Taglish with `po` regardless of the language the guest wrote
 * in (spec §3, decision 2). Prices come from src/lib/pricing.ts and are never
 * recomputed here.
 */
import { pickRate, extraPaxFee, isWeekendOrHoliday } from "./pricing";

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
  checkIn: string;  // "HH:MM"
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
): number {
  const sessions = w.stayType === "10" ? 1 : Math.max(1, nights);
  let room = 0;
  for (let i = 0; i < sessions; i++) {
    const d = addDays(checkInISO, i);
    room += pickRate(w.stayType, d, rates);
  }
  return room + extraPaxFee(pax, BASE_PAX, feePerPax, sessions);
}

function addDays(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
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
}): string {
  const { from, to, nights, pax, windows, rates, bookingUrl } = args;
  const span = to ? `${shortDate(from)}–${shortDate(to)} (${nights} nights)` : `${shortDate(from)} (${dayName(from)})`;

  if (windows.length === 0) {
    return (
      `Pasensya na po, fully booked po kami sa ${span}. ` +
      `Pwede po kayong magtanong ng ibang date — i-che-check ko po agad.`
    );
  }

  const lines = windows.map(
    (w) => `• ${windowLine(w)} — ${peso(quoteFor(w, from, nights, pax, rates, args.extraPaxFee))}`,
  );
  const rateNote = isWeekendOrHoliday(from)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/messenger-reply.test.ts`
Expected: PASS.

If `quoteFor`'s multi-night overnight case fails, check `pickRate` is being called per night with that night's own date — normal pricing prices each night by its own weekday/weekend status.

- [ ] **Step 5: Lint and stage**

```bash
npm run lint
git add src/lib/messenger-reply.ts src/lib/messenger-reply.test.ts
```

---

### Task 3: Share the conflict SQL fragments

Moves two private string constants out of `bookingController` so the availability module can reuse the exact same SQL text. Behaviour-neutral by construction.

**Files:**
- Modify: `src/lib/bookingWindow.ts` (add two exports)
- Modify: `src/backend/controller/bookingController.ts:17-20` (delete the local consts, import instead)
- Test: `src/lib/bookingWindow.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `EXISTING_START_SQL` and `EXISTING_END_SQL` exported from `src/lib/bookingWindow.ts`, consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/bookingWindow.test.ts`:

```ts
import { EXISTING_START_SQL, EXISTING_END_SQL } from "./bookingWindow";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/bookingWindow.test.ts`
Expected: FAIL — the two names are not exported.

- [ ] **Step 3: Add the exports**

Append to `src/lib/bookingWindow.ts`:

```ts
/**
 * SQL for an existing booking's start and end timestamps.
 *
 * These lived as private constants in bookingController, which meant anything
 * else needing the same conflict test had to retype them — and a retyped copy
 * is a copy that drifts. They sit here beside occupyingBookingSql() because
 * they answer the same question: which span of time does this booking hold?
 *
 * '00:00' checkout means end-of-day midnight, so it belongs to the NEXT day.
 * Both are interpolated raw and reference the alias `b` — never pass user input.
 */
export const EXISTING_START_SQL = `(b.check_in_date::DATE + b.check_in_time::TIME)::TIMESTAMP`;
export const EXISTING_END_SQL = `(CASE WHEN b.check_out_time = '00:00'
        THEN (b.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP
        ELSE (b.check_out_date::DATE + b.check_out_time::TIME)::TIMESTAMP END)`;
```

- [ ] **Step 4: Point bookingController at them**

In `src/backend/controller/bookingController.ts`, delete lines 17-20 (the two local `const` declarations and the comment above them that says "spelled out once here because the expression appears three times in the query"), and add the names to the existing import from `@/lib/bookingWindow`:

```ts
import { occupyingBookingSql, EXISTING_START_SQL, EXISTING_END_SQL } from "@/lib/bookingWindow";
```

The constant VALUES must not change — `createBooking`'s query text stays byte-identical.

- [ ] **Step 5: Run the full suite and build**

Run: `npm run test`
Expected: PASS, including the existing turnover and booking-window tests.

Run: `npm run build`
Expected: no TS errors. This is the check that the import rewrite is correct.

- [ ] **Step 6: Confirm the SQL really is unchanged**

Run: `node --env-file=.env scripts/test-turnover.mjs`
Expected: same ALLOWED/BLOCKED results as before the change. If any case flipped, the constants were altered — revert and redo Step 3 verbatim.

- [ ] **Step 7: Lint and stage**

```bash
npm run lint
git add src/lib/bookingWindow.ts src/lib/bookingWindow.test.ts src/backend/controller/bookingController.ts
```

---

### Task 4: Availability module

**Files:**
- Create: `src/lib/availability.ts`
- Test: `src/lib/availability.test.ts`
- Create: `scripts/test-messenger-availability.mjs`

**Interfaces:**
- Consumes: `EXISTING_START_SQL`, `EXISTING_END_SQL`, `occupyingBookingSql` (Task 3); `turnoverSql` from `src/lib/turnover.ts`; `StayWindow` from Task 2.
- Produces: `loadHavenContext()`, `openWindowsOn()`, `isRangeOpen()`, `openDatesAhead()`, type `Queryable` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/availability.test.ts`. These tests inject a stub `Queryable`, so they assert query composition and result interpretation without a database — the real-SQL behaviour is covered by the script in Step 6.

```ts
import { describe, it, expect } from "vitest";
import { openWindowsOn, isRangeOpen, openDatesAhead, type Queryable } from "./availability";

const WINDOWS = [
  { stayType: "10", label: "Daycation", checkIn: "07:00", checkOut: "17:00" },
  { stayType: "10", label: "Nightcation", checkIn: "19:00", checkOut: "05:00" },
  { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" },
] as const;

const CTX = {
  roomName: "D’Lux Homes — Tower 4 Grass Residences",
  havenId: "9c49022d-8efd-41e8-bf39-98cb1a8beb29",
  windows: WINDOWS.map((w) => ({ ...w })),
};

/** Records every query and replies with canned rows. */
function stub(rowsFor: (sql: string, values: unknown[]) => unknown[]): Queryable & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query(sql: string, values: unknown[] = []) {
      calls.push(sql);
      return { rows: rowsFor(sql, values) };
    },
  };
}

describe("openWindowsOn", () => {
  it("returns every window when nothing conflicts", async () => {
    const db = stub(() => []);
    const out = await openWindowsOn("2026-09-04", CTX, db, new Date("2026-08-29T13:00:00+08:00"));
    expect(out.map((w) => w.label)).toEqual(["Daycation", "Nightcation", "Overnight"]);
  });

  it("drops a window that has a conflicting booking", async () => {
    const db = stub((_sql, values) => (String(values[1]) === "19:00" ? [{ ok: 1 }] : []));
    const out = await openWindowsOn("2026-09-04", CTX, db, new Date("2026-08-29T13:00:00+08:00"));
    expect(out.map((w) => w.label)).toEqual(["Daycation"]);
  });

  it("drops a window whose start has already passed today", async () => {
    const db = stub(() => []);
    // 8PM Manila: the 7AM Daycation and the 7PM windows have all started.
    const out = await openWindowsOn("2026-08-29", CTX, db, new Date("2026-08-29T20:00:00+08:00"));
    expect(out).toEqual([]);
  });

  it("keeps future dates unaffected by the current time", async () => {
    const db = stub(() => []);
    const out = await openWindowsOn("2026-09-04", CTX, db, new Date("2026-08-29T20:00:00+08:00"));
    expect(out).toHaveLength(3);
  });

  it("applies the turnover buffer inside the conflict query", async () => {
    const db = stub(() => []);
    await openWindowsOn("2026-09-04", CTX, db, new Date("2026-08-29T13:00:00+08:00"));
    expect(db.calls[0]).toContain("INTERVAL");
    expect(db.calls[0]).toContain("blocked_dates");
  });
});

describe("isRangeOpen", () => {
  it("is true when no conflict row comes back", async () => {
    const db = stub(() => []);
    const w = { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" } as const;
    expect(await isRangeOpen("2026-09-04", 2, { ...w }, CTX, db)).toBe(true);
  });

  it("is false when a conflict row comes back", async () => {
    const db = stub(() => [{ ok: 1 }]);
    const w = { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" } as const;
    expect(await isRangeOpen("2026-09-04", 2, { ...w }, CTX, db)).toBe(false);
  });

  it("checks out `nights` days after check-in", async () => {
    let seen: unknown[] = [];
    const db: Queryable = {
      async query(_sql: string, values: unknown[] = []) {
        seen = values;
        return { rows: [] };
      },
    };
    const w = { stayType: "21", label: "Overnight", checkIn: "19:00", checkOut: "17:00" } as const;
    await isRangeOpen("2026-09-04", 2, { ...w }, CTX, db);
    expect(seen).toContain("2026-09-06");
  });
});

describe("openDatesAhead", () => {
  it("returns the dates the query reports as free", async () => {
    const db = stub(() => [{ d: "2026-08-30" }, { d: "2026-09-01" }]);
    expect(await openDatesAhead(14, CTX, db, new Date("2026-08-29T13:00:00+08:00")))
      .toEqual(["2026-08-30", "2026-09-01"]);
  });

  it("asks for the requested horizon", async () => {
    const db = stub(() => []);
    await openDatesAhead(14, CTX, db, new Date("2026-08-29T13:00:00+08:00"));
    expect(db.calls[0]).toContain("generate_series");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/availability.test.ts`
Expected: FAIL — `Failed to resolve import "./availability"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/availability.ts`:

```ts
/**
 * Is the unit free? — the server-side answer, shared by anything that needs it.
 *
 * This exists because availability lived in two places that could not be called
 * from a webhook: the conflict query inside createBooking, and a client-side
 * reconstruction in the room page. A third copy would have drifted from both.
 * The SQL fragments here are the SAME constants createBooking uses
 * (EXISTING_START_SQL / EXISTING_END_SQL / occupyingBookingSql / turnoverSql),
 * so the two can only disagree in composition — which is what
 * scripts/test-messenger-availability.mjs pins down.
 *
 * Every date is a Manila calendar date, "YYYY-MM-DD".
 */
import pool from "@/backend/config/db";
import { occupyingBookingSql, isStartBookable, EXISTING_START_SQL, EXISTING_END_SQL } from "./bookingWindow";
import { turnoverSql } from "./turnover";
import type { StayWindow } from "./messenger-reply";

/** Anything that can run a parameterised query — the pool, a client, or a test stub. */
export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type HavenContext = {
  havenId: string;
  roomName: string;
  windows: StayWindow[];
};

/**
 * The one haven row, mapped the way the storefront maps it.
 *
 * Goes through the same column convention as haven-adapter: six_hour_check_in/out
 * is the NIGHTCATION window, not a six-hour stay. Reading those columns directly
 * would invent a fourth stay type that does not exist.
 */
export async function loadHavenContext(db: Queryable = pool): Promise<HavenContext | null> {
  const r = await db.query(
    `SELECT uuid_id::text AS id, haven_name,
            ten_hour_check_in, ten_hour_check_out,
            six_hour_check_in, six_hour_check_out,
            twenty_one_hour_check_in, twenty_one_hour_check_out
       FROM havens
      LIMIT 1`,
  );
  const h = r.rows[0];
  if (!h) return null;

  const hhmm = (v: unknown) => (v ? String(v).slice(0, 5) : "");
  const candidates: StayWindow[] = [
    { stayType: "10", label: "Daycation",   checkIn: hhmm(h.ten_hour_check_in),        checkOut: hhmm(h.ten_hour_check_out) },
    { stayType: "10", label: "Nightcation", checkIn: hhmm(h.six_hour_check_in),        checkOut: hhmm(h.six_hour_check_out) },
    { stayType: "21", label: "Overnight",   checkIn: hhmm(h.twenty_one_hour_check_in), checkOut: hhmm(h.twenty_one_hour_check_out) },
  ];

  return {
    havenId: String(h.id),
    roomName: String(h.haven_name),
    windows: candidates.filter((w) => w.checkIn && w.checkOut),
  };
}

/** Manila "YYYY-MM-DD" for an instant. */
function manilaDateISO(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * A stay's check-out DATE. A window whose end time is at or before its start
 * time wraps past midnight (Nightcation 19:00 -> 05:00), so it lands on the
 * next day; an Overnight adds its night count.
 */
function checkOutDate(checkInISO: string, nights: number, w: StayWindow): string {
  if (w.stayType === "10") {
    return w.checkOut <= w.checkIn ? addDaysISO(checkInISO, 1) : checkInISO;
  }
  return addDaysISO(checkInISO, Math.max(1, nights));
}

/**
 * One conflict test, identical in shape to createBooking's availabilityCheckQuery,
 * plus a blocked_dates overlap. Returns true when the span is free.
 */
const CONFLICT_SQL = `
  WITH n AS (
    SELECT ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
           (CASE WHEN $5 = '00:00'
                 THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP
                 ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne
  )
  SELECT 1 AS conflict
  FROM booking b, n
  WHERE b.room_name = $1
    AND ${occupyingBookingSql("b")}
    AND ${EXISTING_START_SQL} < n.ne + ${turnoverSql("n.ns", "n.ne")}
    AND (${EXISTING_END_SQL} + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}) > n.ns
  UNION ALL
  SELECT 1
  FROM blocked_dates bd
  WHERE bd.haven_id = $6
    AND bd.from_date <= $4::DATE
    AND bd.to_date   >= $2::DATE
  LIMIT 1
`;

async function spanIsFree(
  checkInISO: string,
  nights: number,
  w: StayWindow,
  ctx: HavenContext,
  db: Queryable,
): Promise<boolean> {
  const r = await db.query(CONFLICT_SQL, [
    ctx.roomName,
    checkInISO,
    w.checkIn,
    checkOutDate(checkInISO, nights, w),
    w.checkOut,
    ctx.havenId,
  ]);
  return r.rows.length === 0;
}

/** Which stay windows are open on `dateISO`. */
export async function openWindowsOn(
  dateISO: string,
  ctx: HavenContext,
  db: Queryable = pool,
  now: Date = new Date(),
): Promise<StayWindow[]> {
  const todayISO = manilaDateISO(now);
  const open: StayWindow[] = [];
  for (const w of ctx.windows) {
    // A window whose check-in has already passed cannot be sold, however empty
    // the unit is. Only today's windows can be elapsed.
    if (dateISO === todayISO) {
      const startMs = Date.parse(`${dateISO}T${w.checkIn}:00+08:00`);
      if (!isStartBookable(startMs, now.getTime())) continue;
    }
    if (await spanIsFree(dateISO, 1, w, ctx, db)) open.push(w);
  }
  return open;
}

/** Is a multi-night stay in this window free end to end? */
export async function isRangeOpen(
  checkInISO: string,
  nights: number,
  w: StayWindow,
  ctx: HavenContext,
  db: Queryable = pool,
): Promise<boolean> {
  return spanIsFree(checkInISO, nights, w, ctx, db);
}

/**
 * Open Overnight dates within the next `days`, as one query rather than N.
 * Today is excluded when its check-in has already passed.
 */
export async function openDatesAhead(
  days: number,
  ctx: HavenContext,
  db: Queryable = pool,
  now: Date = new Date(),
): Promise<string[]> {
  const overnight = ctx.windows.find((w) => w.stayType === "21");
  if (!overnight) return [];

  const todayISO = manilaDateISO(now);
  const startMs = Date.parse(`${todayISO}T${overnight.checkIn}:00+08:00`);
  const firstISO = isStartBookable(startMs, now.getTime()) ? todayISO : addDaysISO(todayISO, 1);

  const sql = `
    WITH d AS (
      SELECT generate_series($2::DATE, $2::DATE + ($3::INT - 1), INTERVAL '1 day')::DATE AS day
    ),
    n AS (
      SELECT d.day,
             (d.day + $4::TIME)::TIMESTAMP AS ns,
             (d.day + 1 + $5::TIME)::TIMESTAMP AS ne
      FROM d
    )
    SELECT to_char(n.day, 'YYYY-MM-DD') AS d
    FROM n
    WHERE NOT EXISTS (
      SELECT 1 FROM booking b
      WHERE b.room_name = $1
        AND ${occupyingBookingSql("b")}
        AND ${EXISTING_START_SQL} < n.ne + ${turnoverSql("n.ns", "n.ne")}
        AND (${EXISTING_END_SQL} + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}) > n.ns
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocked_dates bd
      WHERE bd.haven_id = $6
        AND bd.from_date <= n.day
        AND bd.to_date   >= n.day
    )
    ORDER BY n.day
  `;
  const r = await db.query(sql, [
    ctx.roomName,
    firstISO,
    days,
    overnight.checkIn,
    overnight.checkOut,
    ctx.havenId,
  ]);
  return r.rows.map((row) => String(row.d));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the real-SQL parity script**

Create `scripts/test-messenger-availability.mjs`. Like `scripts/test-turnover.mjs`, it runs the predicate against a `VALUES` fixture, so results never drift as real bookings come and go.

```js
// Parity test: the availability module's conflict predicate vs createBooking's.
//
// Approach A's whole risk is that src/lib/availability.ts drifts from the query
// that actually guards the booking table. Both compose the same fragments, so
// this asserts the COMPOSITION agrees: for each fixture, the two predicates must
// return the same verdict. A disagreement means a guest is told "available" and
// then refused at checkout — the exact failure this bot must not produce.
//
// Run:  node --env-file=.env scripts/test-messenger-availability.mjs
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "1" },
});

// Kept in sync with src/lib/turnover.ts and src/lib/bookingWindow.ts. If those
// change, this file's copies must change with them — the assertions below are
// what tell you the behaviour moved.
const TURNOVER = `(CASE WHEN (%END% - %START%) >= INTERVAL '20 hours'
                        THEN INTERVAL '1 hours' ELSE INTERVAL '1 hours' END)`;
const t = (start, end) => TURNOVER.replaceAll("%START%", start).replaceAll("%END%", end);

const EX_START = `(f.bs)`;
const EX_END = `(f.be)`;

const sql = `
  WITH f AS (
    SELECT ($1::DATE + $2::TIME)::TIMESTAMP AS bs,
           ($3::DATE + $4::TIME)::TIMESTAMP AS be,
           ($5::DATE + $6::TIME)::TIMESTAMP AS ns,
           ($7::DATE + $8::TIME)::TIMESTAMP AS ne
  )
  SELECT (
    ${EX_START} < f.ne + ${t("f.ns", "f.ne")}
    AND (${EX_END} + ${t(EX_START, EX_END)}) > f.ns
  ) AS blocked
  FROM f
`;

// existing stay          | proposed stay          | expected
const cases = [
  ["Daycation then Overnight same day (1h turnover clears 6PM)",
    ["2026-09-04", "07:00", "2026-09-04", "17:00"], ["2026-09-04", "19:00", "2026-09-05", "17:00"], false],
  ["Overnight then Nightcation same evening (both start 7PM)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"], ["2026-09-04", "19:00", "2026-09-05", "05:00"], true],
  ["Overnight then next-day Daycation (checkout 5PM + 1h > 7AM)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"], ["2026-09-05", "07:00", "2026-09-05", "17:00"], true],
  ["Overnight then Daycation two days later",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"], ["2026-09-06", "07:00", "2026-09-06", "17:00"], false],
  ["Back-to-back overnights (checkout 5PM + 1h clears 7PM check-in)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"], ["2026-09-05", "19:00", "2026-09-06", "17:00"], false],
];

let failed = 0;
for (const [name, existing, proposed, expected] of cases) {
  const r = await pool.query(sql, [...existing, ...proposed]);
  const got = r.rows[0].blocked;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (blocked=${got}, expected=${expected})`);
}

await pool.end();
console.log(failed === 0 ? "\nAll parity cases passed." : `\n${failed} case(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 6: Run the parity script**

Run: `node --env-file=.env scripts/test-messenger-availability.mjs`
Expected: all five cases PASS, exit 0.

If "Daycation then Overnight same day" reports blocked, the turnover buffer is being applied wrongly — that pair is the case the owner explicitly lowered the buffer to 1h to keep sellable.

- [ ] **Step 7: Lint and stage**

```bash
npm run lint
git add src/lib/availability.ts src/lib/availability.test.ts scripts/test-messenger-availability.mjs
```

---

### Task 5: Wire the webhook

Turns the three modules into replies. The existing `myid` and `DL-BK…` paths keep working unchanged.

**Files:**
- Modify: `src/app/api/messenger/webhook/route.ts` (the `handleMessage` function and its `ASKS_ABOUT_BOOKING` constant)

**Interfaces:**
- Consumes: `parseGuestMessage` (Task 1); `availabilityReply`, `priceReply`, `openDatesReply`, `overCapacityReply`, `askForDatesReply` (Task 2); `loadHavenContext`, `openWindowsOn`, `isRangeOpen`, `openDatesAhead` (Task 4); `havenToRoom` from `src/lib/haven-adapter.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace handleMessage**

In `src/app/api/messenger/webhook/route.ts`, add the imports:

```ts
import { parseGuestMessage } from "@/lib/messenger-intent";
import {
  availabilityReply, priceReply, openDatesReply,
  overCapacityReply, askForDatesReply,
} from "@/lib/messenger-reply";
import { loadHavenContext, openWindowsOn, isRangeOpen, openDatesAhead } from "@/lib/availability";
import { havenToRoom } from "@/lib/haven-adapter";
```

Replace the whole `handleMessage` function and delete the now-unused `ASKS_ABOUT_BOOKING` constant:

```ts
const OPEN_DATES_HORIZON = 14;
const CAPACITY = 4;
const BOOKING_URL = "dlux-homes.vercel.app";

async function handleMessage(senderId: string, text: string): Promise<void> {
  // Owner helper: DM "myid" to discover your PSID for MESSENGER_ADMIN_PSID.
  if (/^\s*(my ?id|psid)\s*$/i.test(text)) {
    await send(senderId, `Your Messenger PSID is:\n${senderId}\n\nSet this as MESSENGER_ADMIN_PSID to receive booking alerts here.`);
    return;
  }

  const intent = parseGuestMessage(text, new Date());

  if (intent.kind === "bookingId") {
    await send(senderId, await lookupReply(intent.id));
    return;
  }
  // Rates, availability and general chatter used to be left entirely to the
  // page inbox. The bot now answers the first two; anything it cannot read is
  // still left alone rather than guessed at.
  if (intent.kind === "none") return;

  const pax = "pax" in intent && intent.pax ? intent.pax : 2;
  if (pax > CAPACITY) {
    await send(senderId, overCapacityReply(pax, CAPACITY));
    return;
  }

  try {
    const ctx = await loadHavenContext();
    if (!ctx) return;
    const room = await loadRoom();
    if (!room) return;

    if (intent.kind === "openDates") {
      const dates = await openDatesAhead(OPEN_DATES_HORIZON, ctx);
      await send(senderId, openDatesReply(dates, OPEN_DATES_HORIZON));
      return;
    }

    if (intent.kind === "price") {
      await send(senderId, priceReply({ rates: room, windows: ctx.windows, extraPaxFee: room.additionalPaxFee }));
      return;
    }

    // availability
    const nights = intent.to ? nightsBetween(intent.from, intent.to) : 1;
    const open = nights > 1
      ? (await Promise.all(
          ctx.windows.map(async (w) =>
            w.stayType === "21" && (await isRangeOpen(intent.from, nights, w, ctx)) ? w : null,
          ),
        )).filter((w): w is NonNullable<typeof w> => w !== null)
      : await openWindowsOn(intent.from, ctx);

    await send(senderId, availabilityReply({
      from: intent.from,
      to: intent.to,
      nights,
      pax,
      windows: open,
      rates: room,
      extraPaxFee: room.additionalPaxFee,
      bookingUrl: BOOKING_URL,
    }));
  } catch (e) {
    console.error("[messenger] availability error", e);
    await send(senderId, askForDatesReply());
  }
}

/** Whole nights between two Manila calendar dates. */
function nightsBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** The single haven, mapped to storefront rate fields. */
async function loadRoom() {
  const r = await pool.query(`SELECT * FROM havens LIMIT 1`);
  return r.rows[0] ? havenToRoom(r.rows[0]) : null;
}
```

Note: a multi-night request only offers Overnight — a 10-hour session cannot span nights.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no TS errors. If `havenToRoom`'s return type does not structurally satisfy `RateFields`, pass the four rate fields explicitly rather than widening the type.

- [ ] **Step 3: Run the full suite**

Run: `npm run test`
Expected: PASS, all suites.

- [ ] **Step 4: Exercise it against the deployed bot**

After the owner deploys, DM the page each of these and confirm a sensible Taglish reply:

| Send | Expect |
|---|---|
| `Rates` | all three stay types, weekday + weekend, extra-pax line |
| `Available dates` | up to 14 open Overnight dates |
| `aug 30 for 2 pax` | open windows for Aug 30 with weekend prices |
| `available po sept 4-6? 2 pax` | Overnight only, 2 nights, total |
| `6 pax po` | the max-4 message |
| `thank you po!` | no reply at all |

- [ ] **Step 5: Lint and stage**

```bash
npm run lint
git add src/app/api/messenger/webhook/route.ts
```

---

## Self-Review

**Spec coverage:** §2 fixtures → Task 1. §3 decisions 2/3/4 → Task 2. §4 window/rate config → Task 4 `loadHavenContext`. §5 availability module → Tasks 3+4. §6 parser → Task 1. §7 templates → Task 2. §8 tests → Tasks 1, 2, 4 plus the parity script. §9 out-of-scope items appear in no task, as intended. §10 rollout is a note, not work.

**Placeholders:** none — every code step carries real code.

**Type consistency:** `StayWindow` is declared once in `messenger-reply.ts` and imported by `availability.ts`; `Queryable` and `HavenContext` are declared in `availability.ts` and used in its own tests and Task 5. `quoteFor` takes `feePerPax` and Task 5 passes `room.additionalPaxFee`.

**Known follow-ups, deliberately not in this plan:** migrating `createBooking` onto `availability.ts`; Meta handover protocol; App Review for `pages_messaging`.
