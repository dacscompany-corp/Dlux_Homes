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

// Long-term stay pricing for Overnight (21h) stays only — a flat per-night
// rate that replaces normal per-night pricing once a stay reaches 3 nights,
// stepping down further at 11/18/26. Flat regardless of weekday/weekend/
// holiday (unlike normal nightly pricing) — the owner's spec for long-term
// stays has no such split. Owner-editable per haven via System → Property →
// haven → Pricing (see 2026-08-18-add-longterm-stay-rates.sql). undefined =
// long-term pricing isn't configured/active for this haven, so the stay
// falls back to normal per-night pricing.
type BundleRates = {
  longtermTier1Rate?: number;
  longtermTier2Rate?: number;
  longtermTier3Rate?: number;
  longtermTier4Rate?: number;
  longtermActive?: boolean;
  longtermExtraPaxFee?: number;
};

type Rates = { price10hr: number; price10hrWeekend: number; price21hr: number; price21hrWeekend: number } & BundleRates;

// Minimum nights required to qualify for each long-term tier. The tiers are
// evaluated highest-first in bundleNightlyRate(), so these floors yield the
// owner's bands: 3–10 / 11–17 / 18–25 / 26+ nights.
export const BUNDLE_TIER1_NIGHTS = 3;
export const BUNDLE_TIER2_NIGHTS = 11;
export const BUNDLE_TIER3_NIGHTS = 18;
export const BUNDLE_TIER4_NIGHTS = 26;

// Default per-extra-pax-per-night charge for a long-term stay, used only if a
// haven has no `longterm_extra_pax_fee` value (should not happen post-
// migration — the column defaults to 100 — but keeps this module safe to call
// with partial data, e.g. mock rooms). This REPLACES the normal extraPaxFee()
// charge for long-term stays; the two do not stack (see bundleExtraPaxFee()).
export const BUNDLE_EXTRA_PAX_FEE_DEFAULT = 100;

// Human-readable night band per tier, derived from the constants above so the
// admin UI can never drift out of sync with the pricing logic.
export const BUNDLE_TIER1_LABEL = `${BUNDLE_TIER1_NIGHTS}–${BUNDLE_TIER2_NIGHTS - 1} nights`;
export const BUNDLE_TIER2_LABEL = `${BUNDLE_TIER2_NIGHTS}–${BUNDLE_TIER3_NIGHTS - 1} nights`;
export const BUNDLE_TIER3_LABEL = `${BUNDLE_TIER3_NIGHTS}–${BUNDLE_TIER4_NIGHTS - 1} nights`;
export const BUNDLE_TIER4_LABEL = `${BUNDLE_TIER4_NIGHTS}+ nights`;

// Pick the correct rate for a stay type + check-in date.
// stayType "10" = Daycation/Nightcation, anything else = Overnight (21h).
export function pickRate(stayType: string, dateISO: string, rates: Rates, rules: CalendarRules = DEFAULT_CALENDAR_RULES): number {
  const weekend = isWeekendOrHoliday(dateISO, rules);
  if (stayType === "10") return weekend ? rates.price10hrWeekend : rates.price10hr;
  return weekend ? rates.price21hrWeekend : rates.price21hr;
}

// Flat per-night long-term rate for a qualifying Overnight stay, or undefined
// if no tier applies (too short, this haven has long-term pricing switched
// off, or that tier isn't configured) — callers should fall back to normal
// per-night pricing. No weekday/weekend split, unlike normal nightly pricing —
// checkInISO/rules are accepted (unused) only to keep this call-compatible
// with pickRate()/stayTotal(), which callers invoke alongside this.
//
// Extra pax are NOT folded into this rate — long-term stays charge a
// dedicated per-pax-per-night fee instead (bundleExtraPaxFee()), which
// REPLACES the normal extraPaxFee() rather than stacking with it. Callers
// must branch on whichever fee function actually applied.
export function bundleNightlyRate(nights: number, _checkInISO: string, rates: Rates, _rules: CalendarRules = DEFAULT_CALENDAR_RULES): number | undefined {
  if (rates.longtermActive === false) return undefined;
  if (nights >= BUNDLE_TIER4_NIGHTS && rates.longtermTier4Rate) return rates.longtermTier4Rate;
  if (nights >= BUNDLE_TIER3_NIGHTS && rates.longtermTier3Rate) return rates.longtermTier3Rate;
  if (nights >= BUNDLE_TIER2_NIGHTS && rates.longtermTier2Rate) return rates.longtermTier2Rate;
  if (nights >= BUNDLE_TIER1_NIGHTS && rates.longtermTier1Rate) return rates.longtermTier1Rate;
  return undefined;
}

// Extra-pax charge for a long-term (bundled) stay: `feePerExtraPax` per extra
// counted guest, per night — e.g. 3 guests = +₱100/night, 4 guests =
// +₱200/night, matching the owner's spec exactly. This REPLACES extraPaxFee()
// for stays priced on a long-term tier; callers must call one or the other,
// never both, or guests get double-charged for the same extra guest.
export function bundleExtraPaxFee(totalPax: number, basePax: number, nights: number, rates: Rates): number {
  const extra = Math.max(0, Math.floor(totalPax || 0) - Math.floor(basePax || 0));
  const n = Math.max(1, Math.floor(nights || 1));
  const feePerPax = rates.longtermExtraPaxFee ?? BUNDLE_EXTRA_PAX_FEE_DEFAULT;
  return extra * Math.max(0, feePerPax) * n;
}

export function addDaysISO(iso: string, n: number): string {
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  // Build from LOCAL parts — toISOString() would shift the date in +UTC zones (PH).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Total for a stay's ROOM ONLY (never the pax fee — see extraPaxFee() /
// bundleExtraPaxFee()). Daycation/Nightcation (10h) is a single session.
// Overnight (21h) can span multiple nights — each night is normally priced by
// its OWN date (a weekend night charges the weekend rate even within a
// mostly-weekday stay), UNLESS the stay reaches a long-term tier (3/11/18/26+
// nights), in which case the whole stay is priced at that flat nightly rate
// (no weekday/weekend split) instead of mixing per-night rates.
//
// Callers MUST check whether this stay landed on a bundle tier (e.g. via
// bundleNightlyRate() themselves) to decide which pax fee applies —
// extraPaxFee() for normal stays, bundleExtraPaxFee() for long-term ones. The
// two must never both be added; that double-charges the same extra guest.
export function stayTotal(stayType: string, checkInISO: string, nights: number, rates: Rates, rules: CalendarRules = DEFAULT_CALENDAR_RULES): number {
  if (stayType === "10" || !checkInISO) return pickRate(stayType, checkInISO, rates, rules);
  const n = Math.max(1, Math.floor(nights || 1));
  const bundleRate = bundleNightlyRate(n, checkInISO, rates, rules);
  if (bundleRate != null) return bundleRate * n;
  let total = 0;
  for (let i = 0; i < n; i++) total += pickRate("21", addDaysISO(checkInISO, i), rates, rules);
  return total;
}

// Senior citizen / PWD discount (RA 9994, RA 10754): 20% off a qualifying
// guest's OWN share of the room, not off the whole bill. Each guest's share is
// the room total split evenly across counted pax (adults + young adults;
// 7-and-under are free and never priced, so they can't dilute a share).
//
// `roomTotal` is the room only — the extra-pax fee and the bundle surcharge are
// neither divided nor discounted. Rounded to whole pesos so the quote, the
// payload and the 50% down payment never carry centavos.
//
//   ₱1,899, 2 pax, 1 qualifying → 1899/2 = 949.50 → ×20% = ₱190 → total ₱1,709
export const SENIOR_PWD_RATE = 0.2;

export function seniorPwdDiscount(roomTotal: number, countedPax: number, qualifying: number): number {
  const pax = Math.floor(countedPax || 0);
  const n = Math.floor(qualifying || 0);
  if (!(roomTotal > 0) || pax <= 0 || n <= 0) return 0;
  // Clamp: more flagged guests than priced pax must never discount past 20%
  // of the whole room total.
  return Math.round((roomTotal / pax) * SENIOR_PWD_RATE * Math.min(n, pax));
}

// Extra-pax surcharge. The base rate covers `basePax` guests (2 for D'Lux);
// each additional guest up to the max adds `feePerPax` PER NIGHT — a 3-night
// stay with one extra guest pays the fee three times. 10-hour stays are a
// single session, so their night count is 1 and the multiply is a no-op.
//
// Does NOT apply to a stay priced on a long-term tier — those use
// bundleExtraPaxFee() instead (a different per-pax rate). Call one or the
// other based on whether bundleNightlyRate() returned a rate, never both.
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
