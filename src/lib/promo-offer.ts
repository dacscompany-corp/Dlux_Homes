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
 * Only code-carrying promos do: checkout auto-applies `?promo=` against
 * /api/discounts/validate, which is the sole path that touches the amount.
 * `stayTotal()` in lib/pricing.ts has no notion of promotions, so a codeless
 * promotion is advertising with no mechanism behind it — quoting an offer price
 * for one would promise a discount the guest would never actually receive.
 *
 * If codeless promos should discount too, that belongs in the pricing/booking
 * path (and is an owner business-rules decision), not in this display layer.
 */
export function isEnforceable(promo: ActivePromotion): boolean {
  return !!promo.discount_code;
}

/**
 * Offer price for a base rate. Percentage promos round to the peso; fixed
 * promos subtract directly. Never returns below zero — a misconfigured
 * discount larger than the rate would otherwise render a negative price.
 */
export function offerPriceFor(base: number, promo: ActivePromotion): number {
  const value = promo.discount_value;
  if (value == null || !promo.discount_type) return base;
  const raw =
    promo.discount_type === "percentage"
      ? Math.round(base * (1 - value / 100))
      : base - value;
  return Math.max(0, raw);
}

/** Peso savings — always computed, including for percentage promos. */
export function savingsFor(base: number, promo: ActivePromotion): number {
  return Math.max(0, base - offerPriceFor(base, promo));
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
