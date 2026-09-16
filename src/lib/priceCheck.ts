import type { StayQuote } from "./pricing";

// Rounding slack. Every figure the checkout sends is whole pesos, but the
// senior discount rounds per guest share, so allow a peso either way.
const TOLERANCE = 1;

export type ClaimedPrice = {
  total_amount: unknown;
  discount_amount?: unknown;
  senior_discount?: unknown;
};

export type PriceCheck =
  | { ok: true }
  | { ok: false; reason: string };

// Does a submitted booking's price cover what the server's own quote says the
// stay costs? The browser used to be the only thing pricing a booking, so an
// edited payload — or a page loaded before a season was switched ON — was
// stored exactly as sent.
//
// The checkout's figures satisfy total + promo discount + senior discount =
// room + pax fee (see quoteStay), so that sum is what's compared. A claim
// ABOVE the quote is accepted: it overcharges nobody but the guest who chose
// it, and refusing it would turn a harmless stale page into a failed booking.
// Promo amounts are verified separately (validateDiscount / promoDiscountOn).
export function checkClaimedPrice(quote: StayQuote, claimed: ClaimedPrice): PriceCheck {
  const total = Number(claimed.total_amount) || 0;
  const promo = Math.max(0, Number(claimed.discount_amount) || 0);
  const senior = Math.max(0, Number(claimed.senior_discount) || 0);

  if (senior > quote.seniorDiscount + TOLERANCE) {
    return { ok: false, reason: `senior discount overstated: ${senior} > ${quote.seniorDiscount}` };
  }
  const expected = quote.roomTotal + quote.paxFee;
  const claimedGross = total + promo + senior;
  if (claimedGross < expected - TOLERANCE) {
    return { ok: false, reason: `price below quote: ${claimedGross} < ${expected}` };
  }
  return { ok: true };
}
