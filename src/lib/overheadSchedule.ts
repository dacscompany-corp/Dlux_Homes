// Pure date arithmetic for recurring overhead expenses.
//
// Everything here is value-in / value-out on 'YYYY-MM-DD' strings — no Date
// objects cross the boundary, no timezone can leak in, and the whole module is
// unit-testable without a database. Dates are manipulated through Date.UTC so
// the host machine's timezone never shifts a day.

export const DUE_SOON_DAYS = 7;

export type Frequency =
  | "one-time" | "daily" | "weekly" | "monthly"
  | "quarterly" | "semiannual" | "annual" | "custom";

export type IntervalUnit = "day" | "week" | "month";

export interface ScheduleDef {
  frequency: Frequency;
  start_date: string;
  end_date?: string | null;
  due_day?: number | null;
  interval_count?: number | null;
  interval_unit?: IntervalUnit | null;
}

export interface Occurrence {
  period_start: string;
  period_end: string;
  due_date: string;
}

// Months a frequency advances by. Absent = not month-based.
const MONTH_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
};

const DAY_STEP: Partial<Record<Frequency, number>> = {
  daily: 1, weekly: 7,
};

const PER_YEAR: Partial<Record<Frequency, number>> = {
  daily: 365, weekly: 52, monthly: 12,
  quarterly: 4, semiannual: 2, annual: 1, "one-time": 0,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month is the last day of this one. m is 1-based.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Adds months, clamping the day to the target month's length so Jan 31 + 1
// month is Feb 28 (or Feb 29), not Mar 3.
export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  const total = (y * 12) + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

function isMonthBased(def: ScheduleDef): boolean {
  return def.frequency in MONTH_STEP
    || (def.frequency === "custom" && def.interval_unit === "month");
}

export function dueDateFor(
  periodStart: string,
  dueDay: number | null | undefined,
  frequency: Frequency,
): string {
  const monthBased = frequency in MONTH_STEP;
  if (!dueDay || !monthBased) return periodStart;
  const { y, m } = parse(periodStart);
  return fmt(y, m, Math.min(dueDay, daysInMonth(y, m)));
}

// Advances one step from `iso` per the definition's frequency.
function step(def: ScheduleDef, iso: string): string {
  const months = MONTH_STEP[def.frequency];
  if (months) return addMonths(iso, months);

  const days = DAY_STEP[def.frequency];
  if (days) return addDays(iso, days);

  if (def.frequency === "custom") {
    const n = def.interval_count ?? 1;
    if (def.interval_unit === "month") return addMonths(iso, n);
    if (def.interval_unit === "week") return addDays(iso, n * 7);
    return addDays(iso, n);
  }

  // one-time: no next occurrence. Caller must stop after the first.
  return iso;
}

/**
 * Occurrences whose period_start falls within [from, through], bounded by the
 * definition's own start_date and end_date.
 *
 * period_end is the day before the next occurrence begins (for a one-time
 * expense it equals period_start).
 */
export function occurrencesBetween(
  def: ScheduleDef,
  from: string,
  through: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  const limit = def.end_date && def.end_date < through ? def.end_date : through;

  if (def.frequency === "one-time") {
    const s = def.start_date;
    if (s >= from && s <= limit) {
      out.push({
        period_start: s,
        period_end: s,
        due_date: dueDateFor(s, def.due_day, def.frequency),
      });
    }
    return out;
  }

  // Month-based frequencies compute each occurrence as N steps from the
  // original start_date (never from the previous, possibly clamped, cursor).
  // Otherwise Jan 31 -> Feb 28 -> (+1 month from Feb 28) -> Mar 28 would drift
  // away from the Jan-31 anchor instead of landing on Mar 31.
  const monthBased = isMonthBased(def);
  const monthsPerStep = monthBased
    ? (MONTH_STEP[def.frequency] ?? (def.interval_count ?? 1))
    : 0;

  // Guard against a malformed custom definition spinning forever.
  const MAX_ITERATIONS = 10_000;
  let cursor = def.start_date;

  for (let i = 0; i < MAX_ITERATIONS && cursor <= limit; i++) {
    const next = monthBased
      ? addMonths(def.start_date, monthsPerStep * (i + 1))
      : step(def, cursor);
    if (next === cursor) break; // no progress — malformed definition
    if (cursor >= from) {
      out.push({
        period_start: cursor,
        period_end: addDays(next, -1),
        due_date: dueDateFor(cursor, def.due_day, def.frequency),
      });
    }
    cursor = next;
  }

  return out;
}

export function occurrencesPerYear(def: ScheduleDef): number {
  const fixed = PER_YEAR[def.frequency];
  if (fixed !== undefined) return fixed;

  // custom
  const n = def.interval_count ?? 1;
  if (def.interval_unit === "month") return 12 / n;
  if (def.interval_unit === "week") return 52 / n;
  return 365 / n;
}

/** Amount smoothed to a per-month figure. One-time expenses smooth to 0. */
export function monthlyEquivalent(def: ScheduleDef, amount: number): number {
  const perYear = occurrencesPerYear(def);
  if (!perYear) return 0;
  return Math.round(((amount * perYear) / 12) * 100) / 100;
}

/** First day of the month a period accrues to, as 'YYYY-MM-01'. */
export function accrualMonthOf(periodStart: string): string {
  const { y, m } = parse(periodStart);
  return fmt(y, m, 1);
}

/** True when the definition bills on month boundaries (used by callers). */
export function monthBased(def: ScheduleDef): boolean {
  return isMonthBased(def);
}
