// D'Lux Homes pricing rules — single source of truth for weekday vs
// weekend/holiday rate selection. Matches the official rate card:
//   Overnight (21h): Weekday ₱1,899 · Weekend/Holiday ₱2,099
//   Daycation/Nightcation (10h): Weekday ₱1,499 · Weekend/Holiday ₱1,799
// "Weekend" = a Friday or Saturday check-in. "Holiday" = a PH holiday.
//
// Both are now owner-editable via System → Settings → "Weekend & Holidays"
// in the admin portal (src/backend/controller/pricingSettingsController.ts,
// GET/PUT/POST/DELETE /api/admin/pricing-calendar), backed by the
// `pricing_settings` / `pricing_holidays` tables. The constants below are
// ONLY the built-in fallback — used if that endpoint can't be reached (see
// useCalendarRules() below) — so pricing never breaks if the DB is down.

// PH holidays — regular + common special non-working days. Update yearly
// (or just use the admin portal instead, which persists to the DB).
export const PH_HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-02-17", // Chinese New Year
  "2026-04-02", // Maundy Thursday
  "2026-04-03", // Good Friday
  "2026-04-04", // Black Saturday
  "2026-04-09", // Araw ng Kagitingan
  "2026-05-01", // Labor Day
  "2026-06-12", // Independence Day
  "2026-08-21", // Ninoy Aquino Day
  "2026-08-31", // National Heroes Day
  "2026-11-01", // All Saints' Day
  "2026-11-30", // Bonifacio Day
  "2026-12-08", // Immaculate Conception
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2026-12-30", // Rizal Day
  "2026-12-31", // New Year's Eve
  // 2027
  "2027-01-01", // New Year's Day
]);

export type CalendarRules = { weekendDays: Set<number>; holidays: Set<string> };

// Built-in fallback rules — Fri/Sat + the hardcoded PH_HOLIDAYS list above.
export const DEFAULT_CALENDAR_RULES: CalendarRules = {
  weekendDays: new Set([5, 6]), // 0 Sun .. 6 Sat
  holidays: PH_HOLIDAYS,
};

// True when a YYYY-MM-DD check-in date should use the weekend/holiday rate.
// Pass the live `rules` from useCalendarRules() (below) — omit only for
// server-side/offline callers that can't fetch the admin-configured values.
export function isWeekendOrHoliday(dateISO: string, rules: CalendarRules = DEFAULT_CALENDAR_RULES): boolean {
  if (!dateISO) return false;
  if (rules.holidays.has(dateISO)) return true;
  const d = new Date(dateISO + "T00:00:00");
  return rules.weekendDays.has(d.getDay());
}

// Length-of-stay bundle discounts for Overnight (21h) stays only — a flat
// per-night rate that replaces normal per-night pricing once a stay reaches
// 5/12/20 nights. Owner-editable per haven via System → Property → haven →
// Pricing (see 2026-07-07-add-haven-bundle-rates.sql). undefined = that tier
// isn't configured yet, so the stay falls back to normal per-night pricing.
type BundleRates = {
  weekdayWeekRate?: number;
  weekdayTwoWeekRate?: number;
  weekdayMonthRate?: number;
  weekendWeekRate?: number;
  weekendTwoWeekRate?: number;
  weekendMonthRate?: number;
};

type Rates = { price10hr: number; price10hrWeekend: number; price21hr: number; price21hrWeekend: number } & BundleRates;

// Minimum nights required to qualify for each bundle tier. The tiers are
// evaluated highest-first in bundleNightlyRate(), so these floors yield the
// owner's bands:
//   1 week   → 5–11 nights
//   2 weeks  → 12–19 nights
//   1 month  → 20+ nights (the owner's card says 20–30; longer stays keep the
//              monthly rate rather than falling back to a pricier tier)
export const BUNDLE_WEEK_NIGHTS = 5;
export const BUNDLE_TWOWEEK_NIGHTS = 12;
export const BUNDLE_MONTH_NIGHTS = 20;

// A stay on a bundle tier that also carries extra pax (3–4 counted guests) pays
// this much MORE per night — the bundle nightly rate itself steps up, e.g.
// weekday 1-week ₱1,799 → ₱1,899. Flat: 3 pax and 4 pax pay the same bump. This
// is ON TOP of the normal per-pax-per-night fee (`extraPaxFee`), not instead of
// it. Unlike that fee (owner-editable via `havens.extra_pax_fee`), this is a
// code constant — changing it needs a deploy.
export const BUNDLE_EXTRA_PAX_SURCHARGE = 100;

// Human-readable night band per tier, derived from the constants above so the
// admin UI can never drift out of sync with the pricing logic.
export const BUNDLE_WEEK_LABEL = `${BUNDLE_WEEK_NIGHTS}–${BUNDLE_TWOWEEK_NIGHTS - 1} nights`;
export const BUNDLE_TWOWEEK_LABEL = `${BUNDLE_TWOWEEK_NIGHTS}–${BUNDLE_MONTH_NIGHTS - 1} nights`;
export const BUNDLE_MONTH_LABEL = `${BUNDLE_MONTH_NIGHTS}+ nights`;

// Pick the correct rate for a stay type + check-in date.
// stayType "10" = Daycation/Nightcation, anything else = Overnight (21h).
export function pickRate(stayType: string, dateISO: string, rates: Rates, rules: CalendarRules = DEFAULT_CALENDAR_RULES): number {
  const weekend = isWeekendOrHoliday(dateISO, rules);
  if (stayType === "10") return weekend ? rates.price10hrWeekend : rates.price10hr;
  return weekend ? rates.price21hrWeekend : rates.price21hr;
}

// Flat per-night bundle rate for a qualifying Overnight stay, or undefined if
// no tier applies (too short, or that tier isn't configured for this haven) —
// callers should fall back to normal per-night pricing. Weekday vs weekend
// tier is decided by the CHECK-IN date, same as the normal nightly split (NOT
// by whether every night in the stay falls on a weekend).
//
// `hasExtraPax` (3–4 counted guests) steps the rate up by
// BUNDLE_EXTRA_PAX_SURCHARGE. The bump lives HERE rather than on the extra-pax
// line because it is part of the nightly rate: it belongs in the booking's
// `room_rate`, and keeping it here means the rate we display is the rate we
// charge. Callers still add extraPaxFee() separately — the two stack.
export function bundleNightlyRate(nights: number, checkInISO: string, rates: Rates, rules: CalendarRules = DEFAULT_CALENDAR_RULES, hasExtraPax = false): number | undefined {
  const weekend = isWeekendOrHoliday(checkInISO, rules);
  const month = weekend ? rates.weekendMonthRate : rates.weekdayMonthRate;
  const twoWeek = weekend ? rates.weekendTwoWeekRate : rates.weekdayTwoWeekRate;
  const week = weekend ? rates.weekendWeekRate : rates.weekdayWeekRate;
  const bump = hasExtraPax ? BUNDLE_EXTRA_PAX_SURCHARGE : 0;
  if (nights >= BUNDLE_MONTH_NIGHTS && month) return month + bump;
  if (nights >= BUNDLE_TWOWEEK_NIGHTS && twoWeek) return twoWeek + bump;
  if (nights >= BUNDLE_WEEK_NIGHTS && week) return week + bump;
  return undefined;
}

export function addDaysISO(iso: string, n: number): string {
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  // Build from LOCAL parts — toISOString() would shift the date in +UTC zones (PH).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Total for a stay. Daycation/Nightcation (10h) is a single session. Overnight
// (21h) can span multiple nights — each night is normally priced by its OWN
// date (a weekend night charges the weekend rate even within a mostly-weekday
// stay), UNLESS the stay qualifies for a length-of-stay bundle discount (5/12/
// 20+ nights), in which case the whole stay is priced at that flat nightly
// rate instead of mixing per-night rates.
//
// `hasExtraPax` only matters for stays that actually reach a bundle tier — it
// raises that flat rate by BUNDLE_EXTRA_PAX_SURCHARGE. Stays priced night-by-
// night are unaffected by it; their extra guests are billed solely through
// extraPaxFee().
export function stayTotal(stayType: string, checkInISO: string, nights: number, rates: Rates, rules: CalendarRules = DEFAULT_CALENDAR_RULES, hasExtraPax = false): number {
  if (stayType === "10" || !checkInISO) return pickRate(stayType, checkInISO, rates, rules);
  const n = Math.max(1, Math.floor(nights || 1));
  const bundleRate = bundleNightlyRate(n, checkInISO, rates, rules, hasExtraPax);
  if (bundleRate != null) return bundleRate * n;
  let total = 0;
  for (let i = 0; i < n; i++) total += pickRate("21", addDaysISO(checkInISO, i), rates, rules);
  return total;
}

// Extra-pax surcharge. The base rate covers `basePax` guests (2 for D'Lux);
// each additional guest up to the max adds `feePerPax` PER NIGHT — a 3-night
// stay with one extra guest pays the fee three times. Applies to every stay
// length, including ones discounted by a length-of-stay bundle. 10-hour stays
// are a single session, so their night count is 1 and the multiply is a no-op.
//
// `nights` defaults to 1 so a caller that hasn't been updated keeps the old
// once-per-booking behaviour instead of throwing, and the Math.max(1, …) floor
// absorbs a 0/NaN arriving from a URL param.
//
// Returns 0 within the allowance or when no fee is configured.
export function extraPaxFee(totalPax: number, basePax: number, feePerPax: number, nights = 1): number {
  const extra = Math.max(0, Math.floor(totalPax || 0) - Math.floor(basePax || 0));
  const n = Math.max(1, Math.floor(nights || 1));
  return extra * Math.max(0, feePerPax || 0) * n;
}
