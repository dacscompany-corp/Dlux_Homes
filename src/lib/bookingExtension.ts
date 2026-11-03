// Extend Booking (admin-only, owner spec 2026-10-31) — the pure parts: how many
// nights an extension adds, and the price the Haven Management rules suggest.
//
// The suggestion is "the longer stay, priced as one stay, minus the stay as
// booked", both through quoteStay() — the same function checkout and
// createBooking use. That way every rule follows automatically: weekend and
// holiday nights, seasonal rates, the extra-pax fee per night, and the
// long-term tiers that reprice the WHOLE stay once it reaches 3+ nights. The
// admin can still change the amount before confirming; this is only the start.

import { quoteStay, type NightPrice, type StayQuoteInput } from "./pricing";

/** An extension longer than this is a new booking, not an extension. */
export const MAX_EXTENSION_NIGHTS = 60;

/** Booking statuses that can be extended: confirmed, paid-down, or staying now. */
export const EXTENDABLE_STATUSES = ["approved", "on-going", "checked-in"] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Whole nights from one calendar date to a later one ("YYYY-MM-DD"); NaN if unreadable. */
export function nightsBetweenISO(fromISO: string, toISO: string): number {
  if (!ISO.test(fromISO) || !ISO.test(toISO)) return NaN;
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type ExtensionQuote = {
  addedNights: number;
  /** Suggested extra charge, whole pesos, never below 0. */
  suggested: number;
  /** The price of each added night, as the longer stay prices it. */
  addedNightPrices: NightPrice[];
  /** Extra-pax fee the added nights bring. */
  paxFeeAdded: number;
  /** The longer stay reached a long-term tier the original didn't. */
  longTermNow: boolean;
  originalSubtotal: number;
  extendedSubtotal: number;
};

/**
 * Price an extension of a stay of `originalNights` by `addedNights`.
 * `base` is everything quoteStay needs except the night count.
 */
export function quoteExtension(
  base: Omit<StayQuoteInput, "nights">,
  originalNights: number,
  addedNights: number,
): ExtensionQuote {
  const original = quoteStay({ ...base, nights: originalNights });
  const extended = quoteStay({ ...base, nights: originalNights + addedNights });
  return {
    addedNights,
    suggested: Math.max(0, Math.round(extended.subtotal - original.subtotal)),
    addedNightPrices: extended.nights.slice(originalNights),
    paxFeeAdded: Math.max(0, extended.paxFee - original.paxFee),
    longTermNow: extended.nights.some((n) => n.longTerm) && !original.nights.some((n) => n.longTerm),
    originalSubtotal: original.subtotal,
    extendedSubtotal: extended.subtotal,
  };
}
