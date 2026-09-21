// D'Lux Homes pricing rules — single source of truth for weekday vs
// weekend/holiday rate selection. Matches the official rate card:
//   Overnight (21h): Weekday ₱1,899 · Weekend/Holiday ₱2,099
//   Daycation/Nightcation (10h): Weekday ₱1,499 · Weekend/Holiday ₱1,799
// "Weekend" = a Friday or Saturday check-in. "Holiday" = a PH holiday.
// Daycation is the exception: it is a DAYTIME session, so it follows the
// night BEFORE it — a Saturday or Sunday daycation is weekend, a Friday one is
// weekday (owner decision, 2026-09-19). See isWeekendOrHoliday().
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
//
// `weekendDays` are weekend NIGHTS (Fri/Sat). Overnight and Nightcation start
// on that night, so they read the check-in day directly. A Daycation
// (daycation=true) runs the day AFTER a night, so it reads the previous day:
// Fri/Sat nights → Sat/Sun daycations. A holiday is still judged on its own date.
export function isWeekendOrHoliday(
  dateISO: string,
  rules: CalendarRules = DEFAULT_CALENDAR_RULES,
  daycation = false,
): boolean {
  if (!dateISO) return false;
  if (rules.holidays.has(dateISO)) return true;
  const d = new Date(dateISO + "T00:00:00");
  const day = daycation ? (d.getDay() + 6) % 7 : d.getDay();
  return rules.weekendDays.has(day);
}

// Is this stay a Daycation — a 10h session that ends later on the clock than it
// starts (7AM → 5PM)? A Nightcation (7PM → 5AM) rolls past midnight instead.
// Takes any clock format the app uses ("07:00", "7:00 AM", "07:00:00").
export function isDaycation(stayType: string, checkIn: unknown, checkOut: unknown): boolean {
  if (stayType !== "10") return false;
  const a = clockMinutes(checkIn), b = clockMinutes(checkOut);
  return a != null && b != null && b > a;
}

function clockMinutes(value: unknown): number | null {
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?/);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === "P" && h !== 12) h += 12;
  if (ap === "A" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
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

// Seasonal rate (owner spec, "Seasonal Rate MVP Terms & Requirements"): an
// owner-set date range — Christmas, Holy Week, … — that REPLACES the haven's
// four regular rates for any date inside it, start and end both inclusive.
// Weekday vs weekend/holiday within a season is still decided by the same
// calendar rules as regular pricing. Only ACTIVE (switched ON) seasons may ever
// be passed in; an OFF season must not reach pricing at all. Active seasons
// never overlap (enforced by an exclusion constraint on seasonal_rates), so at
// most one season covers any date.
//
// allowPromos=false (the default) means no promo code or automatic promotion
// may be applied to a stay that touches this season — see promoBlockingSeason().
//
// longtermTier1..4 are optional flat nightly rates for long Overnight stays,
// on the same 3/11/18/26-night bands as the haven's long-term pricing. When a
// stay reaches a tier that the season has a rate for, its seasonal nights use
// that rate; left blank, seasonal nights use the season's nightly rates.
export type SeasonalRate = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string;   // YYYY-MM-DD, inclusive
  overnightWeekday: number;
  overnightWeekend: number;
  daynightWeekday: number;
  daynightWeekend: number;
  allowPromos: boolean;
  longtermTier1?: number | null;
  longtermTier2?: number | null;
  longtermTier3?: number | null;
  longtermTier4?: number | null;
};

// The active season covering a YYYY-MM-DD date, or undefined. Compares the ISO
// strings directly — they sort lexically, and a Date round trip would shift
// the day in PH (+08:00).
export function seasonFor(dateISO: string, seasons: readonly SeasonalRate[] = []): SeasonalRate | undefined {
  if (!dateISO) return undefined;
  return seasons.find((s) => s.startDate <= dateISO && dateISO <= s.endDate);
}

// Pick the correct rate for a stay type + date. An active season covering the
// date wins over the haven's regular rates.
// stayType "10" = Daycation/Nightcation, anything else = Overnight (21h).
// daycation=true shifts the weekend check to the night before (see
// isWeekendOrHoliday); it only matters for stayType "10".
export function pickRate(
  stayType: string,
  dateISO: string,
  rates: Rates,
  rules: CalendarRules = DEFAULT_CALENDAR_RULES,
  seasons: readonly SeasonalRate[] = [],
  daycation = false,
): number {
  const weekend = isWeekendOrHoliday(dateISO, rules, stayType === "10" && daycation);
  const season = seasonFor(dateISO, seasons);
  if (season) {
    if (stayType === "10") return weekend ? season.daynightWeekend : season.daynightWeekday;
    return weekend ? season.overnightWeekend : season.overnightWeekday;
  }
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
  return tierRateFor(nights, [rates.longtermTier1Rate, rates.longtermTier2Rate, rates.longtermTier3Rate, rates.longtermTier4Rate]);
}

// The rate of the highest long-term tier this many nights reaches that has a
// rate configured (a blank higher tier falls through to the next one down).
function tierRateFor(nights: number, tiers: readonly (number | null | undefined)[]): number | undefined {
  const floors = [BUNDLE_TIER1_NIGHTS, BUNDLE_TIER2_NIGHTS, BUNDLE_TIER3_NIGHTS, BUNDLE_TIER4_NIGHTS];
  for (let i = floors.length - 1; i >= 0; i--) {
    if (nights >= floors[i] && tiers[i]) return tiers[i] as number;
  }
  return undefined;
}

// A season's own long-term rate for a stay of `nights`, or undefined when the
// stay is too short or the season has no rate for the tier it reaches. Set on
// the season itself, so it applies even if the haven's long-term pricing is off.
export function seasonLongTermRate(nights: number, season: SeasonalRate): number | undefined {
  return tierRateFor(nights, [season.longtermTier1, season.longtermTier2, season.longtermTier3, season.longtermTier4]);
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

// Refundable security deposit (owner spec, 2026-08-19): scales with how many
// nights are booked, independent of whether the stay actually lands on a
// long-term pricing tier — a 5-night Overnight owes the tier-1 deposit even
// on a haven with long-term pricing switched off. Shares the same 3/11/18/26
// night boundaries as the long-term rate tiers because the owner gave both
// schedules the same bands, not because the two concepts are the same thing;
// they're intentionally separate constants so one can change without the
// other silently drifting.
export const DEPOSIT_TIER1_NIGHTS = BUNDLE_TIER1_NIGHTS; // 3
export const DEPOSIT_TIER2_NIGHTS = BUNDLE_TIER2_NIGHTS; // 11
export const DEPOSIT_TIER3_NIGHTS = BUNDLE_TIER3_NIGHTS; // 18
export const DEPOSIT_TIER4_NIGHTS = BUNDLE_TIER4_NIGHTS; // 26

// Fallback amounts, used only when a haven has no configured value for that
// tier (or no haven/rates object is passed at all — see securityDepositFor()).
// Owner-editable per haven via System → Property → haven → Pricing (see
// 2026-08-20-add-deposit-tiers.sql): havens.security_deposit (1-2 nights,
// existing column) and deposit_tier1_amount..deposit_tier4_amount.
export const DEPOSIT_DEFAULT = 1000;   // 1-2 nights, and Daycation/Nightcation
export const DEPOSIT_TIER1_AMOUNT = 1500;
export const DEPOSIT_TIER2_AMOUNT = 2000;
export const DEPOSIT_TIER3_AMOUNT = 3000;
export const DEPOSIT_TIER4_AMOUNT = 5000;

type DepositRates = {
  securityDeposit?: number;
  depositTier1Amount?: number;
  depositTier2Amount?: number;
  depositTier3Amount?: number;
  depositTier4Amount?: number;
};

// Nights booked -> the refundable deposit owed. stayType "10" (Daycation/
// Nightcation) is always a single session, so it never reaches a tier and
// always returns the default — pass nights=1 (or omit stayType entirely) for
// that case rather than a computed night count. `rates`, when passed, is the
// haven's own owner-configured amounts; any tier left unconfigured (undefined
// or 0) falls back to the code default for that tier.
export function securityDepositFor(nights: number, stayType?: string, rates?: DepositRates): number {
  const base = rates?.securityDeposit || DEPOSIT_DEFAULT;
  if (stayType === "10") return base;
  const n = Math.max(1, Math.floor(nights || 1));
  if (n >= DEPOSIT_TIER4_NIGHTS) return rates?.depositTier4Amount || DEPOSIT_TIER4_AMOUNT;
  if (n >= DEPOSIT_TIER3_NIGHTS) return rates?.depositTier3Amount || DEPOSIT_TIER3_AMOUNT;
  if (n >= DEPOSIT_TIER2_NIGHTS) return rates?.depositTier2Amount || DEPOSIT_TIER2_AMOUNT;
  if (n >= DEPOSIT_TIER1_NIGHTS) return rates?.depositTier1Amount || DEPOSIT_TIER1_AMOUNT;
  return base;
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
// Seasons override BOTH of those per night: a night inside an active season is
// charged the seasonal rate, even within a long-term stay — only the nights
// outside the season keep the flat long-term rate (owner decision, 2026-09-16).
//
// Callers MUST check whether this stay landed on a bundle tier (e.g. via
// bundleNightlyRate() themselves) to decide which pax fee applies —
// extraPaxFee() for normal stays, bundleExtraPaxFee() for long-term ones. The
// two must never both be added; that double-charges the same extra guest.
export function stayTotal(
  stayType: string,
  checkInISO: string,
  nights: number,
  rates: Rates,
  rules: CalendarRules = DEFAULT_CALENDAR_RULES,
  seasons: readonly SeasonalRate[] = [],
  daycation = false,
): number {
  return stayBreakdown(stayType, checkInISO, nights, rates, rules, seasons, daycation).total;
}

// longTerm: priced by a long-term tier rate (the haven's, or the season's own).
export type NightPrice = { date: string; rate: number; season?: SeasonalRate; longTerm: boolean };

// stayTotal(), itemised: one entry per priced night (a single entry for a 10h
// session), each tagged with the season that priced it, plus the distinct
// seasons the stay touches — what the booking summary needs to show
// "Christmas Season Rate — Dec 10, 2026 — Overnight ₱2,300".
export function stayBreakdown(
  stayType: string,
  checkInISO: string,
  nights: number,
  rates: Rates,
  rules: CalendarRules = DEFAULT_CALENDAR_RULES,
  seasons: readonly SeasonalRate[] = [],
  daycation = false,
): { total: number; nights: NightPrice[]; seasons: SeasonalRate[] } {
  const items: NightPrice[] = [];
  if (stayType === "10" || !checkInISO) {
    items.push({ date: checkInISO, rate: pickRate(stayType, checkInISO, rates, rules, seasons, daycation), season: seasonFor(checkInISO, seasons), longTerm: false });
  } else {
    const n = Math.max(1, Math.floor(nights || 1));
    const bundleRate = bundleNightlyRate(n, checkInISO, rates, rules);
    for (let i = 0; i < n; i++) {
      const date = addDaysISO(checkInISO, i);
      const season = seasonFor(date, seasons);
      // Seasonal night: the season's long-term rate if it has one for this
      // stay length, else its nightly rate. Other nights: the haven's.
      const longRate = season ? seasonLongTermRate(n, season) : bundleRate;
      const rate = longRate ?? pickRate("21", date, rates, rules, seasons);
      items.push({ date, rate, season, longTerm: longRate != null });
    }
  }
  const touched: SeasonalRate[] = [];
  for (const it of items) if (it.season && !touched.includes(it.season)) touched.push(it.season);
  return { total: items.reduce((sum, it) => sum + it.rate, 0), nights: items, seasons: touched };
}

// Does this stay pay the long-term pax fee instead of the normal one? True
// when the haven's long-term tier applies OR any seasonal night was priced on
// the season's own long-term tier. Every caller that picks between
// bundleExtraPaxFee() and extraPaxFee() must use this, or the room page, bot
// and admin wizard drift from what createBooking accepts.
export function isLongTermStay(
  stayType: string,
  checkInISO: string,
  nights: number,
  rates: Rates,
  rules: CalendarRules = DEFAULT_CALENDAR_RULES,
  seasons: readonly SeasonalRate[] = [],
): boolean {
  if (stayType === "10") return false;
  const n = Math.max(1, Math.floor(nights || 1));
  if (bundleNightlyRate(n, checkInISO, rates, rules) != null) return true;
  return stayBreakdown(stayType, checkInISO, n, rates, rules, seasons).nights.some((night) => night.longTerm);
}

// The first season this stay touches that forbids promos, or undefined when
// promos may apply. Seasons don't stack with promos unless the owner switched
// "Allow promos" on for that season.
export function promoBlockingSeason(stayType: string, checkInISO: string, nights: number, seasons: readonly SeasonalRate[] = []): SeasonalRate | undefined {
  if (!checkInISO || seasons.length === 0) return undefined;
  const n = stayType === "10" ? 1 : Math.max(1, Math.floor(nights || 1));
  for (let i = 0; i < n; i++) {
    const s = seasonFor(addDaysISO(checkInISO, i), seasons);
    if (s && !s.allowPromos) return s;
  }
  return undefined;
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

// The whole pre-promo quote for a stay — room (with seasons), pax fee (normal
// or long-term, never both), senior/PWD discount — in ONE place, so the
// checkout that shows the price and createBooking that verifies it can't drift.
export type StayQuoteInput = {
  stayType: string;
  checkInISO: string;
  nights: number;
  rates: Rates & { basePax: number; additionalPaxFee: number };
  rules?: CalendarRules;
  seasons?: readonly SeasonalRate[];
  feePax: number;       // adults + young adults; 7-and-under excluded
  seniorCount?: number; // guests flagged senior/PWD
  daycation?: boolean;  // 10h daytime session — see isDaycation()
};

export type StayQuote = {
  roomTotal: number;
  nights: NightPrice[];
  seasons: SeasonalRate[];
  bundleRate: number | undefined;
  // The one flat nightly rate when EVERY night was priced long-term at the same
  // rate — what the summary shows as "₱X/night · Long-term rate". Undefined for
  // a stay that mixes rates.
  flatLongTermRate: number | undefined;
  paxFeeRate: number;
  paxFee: number;
  seniorDiscount: number;
  subtotal: number; // roomTotal + paxFee - seniorDiscount, before any promo
};

export function quoteStay(input: StayQuoteInput): StayQuote {
  const { stayType, checkInISO, rates, feePax } = input;
  const rules = input.rules ?? DEFAULT_CALENDAR_RULES;
  const nights = stayType === "10" ? 1 : Math.max(1, Math.floor(input.nights || 1));
  const breakdown = stayBreakdown(stayType, checkInISO, nights, rates, rules, input.seasons ?? [], input.daycation ?? false);
  const bundleRate = stayType === "10" ? undefined : bundleNightlyRate(nights, checkInISO, rates, rules);
  const allLongTerm = breakdown.nights.length > 0 && breakdown.nights.every((n) => n.longTerm);
  const flatLongTermRate = allLongTerm && breakdown.nights.every((n) => n.rate === breakdown.nights[0].rate)
    ? breakdown.nights[0].rate
    : undefined;
  // Long-term stays pay the long-term pax fee — whether the haven's tier or a
  // season's own tier made it one.
  const longTermStay = isLongTermStay(stayType, checkInISO, nights, rates, rules, input.seasons ?? []);
  const paxFeeRate = longTermStay ? (rates.longtermExtraPaxFee ?? BUNDLE_EXTRA_PAX_FEE_DEFAULT) : rates.additionalPaxFee;
  const paxFee = longTermStay
    ? bundleExtraPaxFee(feePax, rates.basePax, nights, rates)
    : extraPaxFee(feePax, rates.basePax, rates.additionalPaxFee, nights);
  const seniorDiscount = seniorPwdDiscount(breakdown.total, feePax, input.seniorCount ?? 0);
  return {
    roomTotal: breakdown.total,
    nights: breakdown.nights,
    seasons: breakdown.seasons,
    bundleRate,
    flatLongTermRate,
    paxFeeRate,
    paxFee,
    seniorDiscount,
    subtotal: Math.max(0, breakdown.total + paxFee - seniorDiscount),
  };
}
