import type { ActivePromotion, PromoStayType } from "@/redux/api/promotionsApi";

// Shared derivation for the guest offer card, used by both the rooms home page
// and the room detail page so the two never disagree on what a promo is worth.
//
// The old banner only ever showed "Save 20%", which left the guest to do the
// arithmetic. Everything here exists so the card can state the peso figure.

export type StayTypeCode = "10" | "21";

export const STAY_TYPE_LABELS: Record<PromoStayType, string> = {
  day: "Daycation",
  night: "Nightcation",
  overnight: "Full stay",
};

export const ALL_STAY_TYPES: PromoStayType[] = ["day", "night", "overnight"];

/** Canonical order + labels for the admin promotion form's scope picker. */
export const PROMO_STAY_TYPE_OPTIONS: { value: PromoStayType; label: string }[] =
  ALL_STAY_TYPES.map((value) => ({ value, label: STAY_TYPE_LABELS[value] }));

/**
 * Whether a promotion actually reduces what the guest is charged.
 *
 * Two delivery methods now do:
 *  - 'voucher'   → backed by a `discounts` code; checkout validates it via
 *                  /api/discounts/validate (and `?promo=` auto-applies it).
 *  - 'automatic' → no code; the storefront and checkout subtract the
 *                  promotion's own discount directly (see autoDiscountAmount).
 *
 * A promotion with no discount configured is an announcement either way, and
 * must not make a price claim.
 */
export function isEnforceable(promo: ActivePromotion): boolean {
  if (!promo.discount_type || !(Number(promo.discount_value) > 0)) return false;
  return promo.redemption === "voucher" ? !!promo.discount_code : true;
}

/** True when the guest has to type/redeem a code to get this offer. */
export function isVoucher(promo: ActivePromotion): boolean {
  return promo.redemption === "voucher" && !!promo.discount_code;
}

/**
 * Peso amount an automatic promotion takes off a given amount. Returns 0 for
 * voucher or announcement promotions — those are never applied implicitly.
 *
 * Percentage promos are rounded to the peso, matching offerPriceFor, so the
 * headline on the offer card and the checkout line agree.
 */
export function autoDiscountAmount(promo: ActivePromotion, amount: number, nights = 1): number {
  if (promo.redemption !== "automatic") return 0;
  return promoDiscountOn(promo, amount, nights);
}

/**
 * Peso amount a promotion takes off `amount`, regardless of how it's delivered.
 * Used where the delivery method has already been checked (a voucher whose code
 * is in play, say) and only the arithmetic is needed.
 *
 * `nights` only matters for a per-night fixed amount — a percentage is taken on
 * a total that already grew with the night count, so multiplying it again would
 * charge the stay length twice. Daycation/Nightcation is one session, i.e.
 * nights = 1, so the multiplication is a no-op there.
 *
 * MUST stay in step with validateDiscount() on the server, which prices the
 * voucher path from the `discounts` row: if this returns more than the server
 * does, createBooking rejects the whole booking as an overstated discount.
 */
export function promoDiscountOn(promo: ActivePromotion, amount: number, nights = 1): number {
  if (!isEnforceable(promo)) return 0;
  return capDiscount(
    promo.discount_type === "percentage"
      ? Math.round((amount * Number(promo.discount_value)) / 100)
      : fixedAmountOver(Number(promo.discount_value), promo.per_night, nights),
    promo.max_discount,
    amount,
  );
}

/**
 * A fixed peso amount spread over the stay: once for a whole-stay discount,
 * once per night for a per-night one.
 *
 * Shared with the server (validateDiscount imports it) so the two can't drift —
 * the client computing a larger figure than the server is precisely what turns
 * into a rejected booking at submit.
 */
export function fixedAmountOver(value: number, perNight: boolean, nights: number): number {
  return value * (perNight ? Math.max(1, Math.floor(nights || 1)) : 1);
}

/**
 * Apply the offer's ceiling, then clamp to what's actually being charged.
 * A per-night amount is unbounded by nature (₱200 × 30 nights), so the ceiling
 * is what keeps a long stay from giving away more than the owner intended.
 */
export function capDiscount(raw: number, maxDiscount: number | null | undefined, amount: number): number {
  const capped = maxDiscount != null && maxDiscount > 0 ? Math.min(raw, Number(maxDiscount)) : raw;
  return Math.max(0, Math.min(amount, capped));
}

/**
 * The single automatic promotion to apply to a stay, or null. First match wins
 * (the API returns newest first) — promotions never stack with each other, and
 * an automatic one never stacks with a voucher the guest entered.
 */
export function pickAutoPromo(
  promos: ActivePromotion[] | undefined,
  stayType: StayTypeCode,
): ActivePromotion | null {
  return (promos || []).find(
    (p) => p.redemption === "automatic" && isEnforceable(p) && promoCoversStay(p, stayType),
  ) ?? null;
}

/**
 * Price of ONE night/session under the offer — the advertising figure on the
 * banner, where the guest hasn't picked a stay length yet.
 *
 * Defined as the discount on a single unit so it can't drift from what checkout
 * charges: it used to round the *price* (`base × (1 − v/100)`) while every other
 * path rounded the *discount*, which put the card and the checkout line a peso
 * apart whenever the percentage landed on an exact half.
 *
 * Never returns below zero — a misconfigured discount larger than the rate would
 * otherwise render a negative price.
 */
export function offerPriceFor(base: number, promo: ActivePromotion): number {
  const value = promo.discount_value;
  if (value == null || !promo.discount_type) return base;
  return Math.max(0, base - promoDiscountOn(promo, base, 1));
}

/** Peso savings — always computed, including for percentage promos. */
export function savingsFor(base: number, promo: ActivePromotion): number {
  return Math.max(0, base - offerPriceFor(base, promo));
}

/**
 * The nightly price to headline once the guest HAS picked a stay, derived from
 * the discount actually applied to that stay so the headline and the total can
 * never tell different stories.
 *
 * The exception is a whole-stay peso amount on a multi-night booking: ₱200 off
 * the stay is not ₱67 off each of three nights, and showing it that way is the
 * mismatch this whole change exists to remove. Such an offer leaves the nightly
 * rate alone and appears only on the total line.
 */
export function headlineUnitPrice(
  base: number,
  promo: ActivePromotion | null | undefined,
  totalDiscount: number,
  nights: number,
): number {
  if (!promo || totalDiscount <= 0) return base;
  const n = Math.max(1, Math.floor(nights || 1));
  const wholeStayPeso = promo.discount_type === "fixed" && !promo.per_night;
  if (wholeStayPeso && n > 1) return base;
  return Math.max(0, base - Math.round(totalDiscount / n));
}

/**
 * Whole days until `end_date`, counted from local midnight to local midnight so
 * an offer ending tonight reads "Ends today" rather than "Ends in 0 days".
 * Returns null when the date is missing or unparseable.
 */
export function daysUntilEnd(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((endMidnight.getTime() - todayMidnight.getTime()) / 86_400_000);
}

/**
 * Expiry note copy. Only surfaces inside a 7-day window — beyond that the note
 * is noise, and the design calls for no live countdown.
 */
export function expiryNote(endDate: string | null | undefined): string | null {
  const days = daysUntilEnd(endDate);
  if (days == null || days < 0 || days > 7) return null;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}

/** Short form for tight spots on the room page, e.g. "Ends Sun". */
export function expiryNoteShort(endDate: string | null | undefined): string | null {
  const days = daysUntilEnd(endDate);
  if (days == null || days < 0 || days > 7) return null;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  const end = new Date(endDate as string);
  return `Ends ${end.toLocaleDateString("en-US", { weekday: "short" })}`;
}

/** Stay types the promo covers, or null when it's unscoped (renders no chips). */
export function scopedStayTypes(promo: ActivePromotion): PromoStayType[] | null {
  const list = promo.applies_to;
  if (!list || list.length === 0) return null;
  // Preserve the canonical order regardless of how the row was stored.
  return ALL_STAY_TYPES.filter((t) => list.includes(t));
}

/** Does this promo apply to the stay type the guest is currently looking at? */
export function promoCoversStay(promo: ActivePromotion, stayType: StayTypeCode): boolean {
  const scope = scopedStayTypes(promo);
  if (!scope) return true; // unscoped promos apply everywhere
  return stayType === "21"
    ? scope.includes("overnight")
    : scope.includes("day") || scope.includes("night");
}

/**
 * The rate the struck-through "usual price" should quote, chosen from the
 * promo's own scope rather than a constant — an overnight-only offer compared
 * against the Daycation rate would advertise a saving the guest can't get.
 * Unscoped promos quote the Daycation rate, matching the "from ₱…" the rest of
 * the storefront leads with.
 */
export function baseRateFor(
  promo: ActivePromotion,
  rates: { price10hr: number; price21hr: number },
): { base: number; unitLabel: string; stayType: StayTypeCode } {
  const scope = scopedStayTypes(promo);
  const overnightOnly = scope != null && scope.length === 1 && scope[0] === "overnight";
  return overnightOnly
    ? { base: rates.price21hr, unitLabel: "/ night", stayType: "21" }
    : { base: rates.price10hr, unitLabel: "/ session", stayType: "10" };
}

export const pesoAmount = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

/**
 * Headline discount badge, e.g. "20% off" / "₱500 off".
 *
 * Takes the raw fields rather than a promotion so the admin form's live preview
 * (which only has form state, not a saved row) renders the identical string the
 * guest card will — the two drifting is what made the preview misleading.
 * Returns null when there's no real discount, so callers can omit the badge.
 */
export function discountBadgeText(
  discountType: "percentage" | "fixed" | null | undefined,
  discountValue: number | string | null | undefined,
  perNight = false,
): string | null {
  const value = Number(discountValue);
  if (!discountType || !(value > 0)) return null;
  if (discountType === "percentage") return `${value}% off`;
  // "₱200 off" and "₱200 off per night" are different offers on a 3-night stay,
  // so the badge has to say which one it is.
  return perNight ? `${pesoAmount(value)} off per night` : `${pesoAmount(value)} off`;
}
