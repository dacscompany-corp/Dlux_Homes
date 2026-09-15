// Which story the post-checkout page's hero should tell.
//
// my-bookings/confirmed has three designs: a confirmed one, a stay-complete
// one, and a fallback for everything still in motion. The fallback used one set
// of words — "You're in. Rest is coming." / "Confirmation emailed to …" — for
// every state it covers, so a booking still awaiting the owner's review told
// the guest it was confirmed, directly under a card asking them to message us
// for a faster review. These are the states that fallback actually sees; the
// page picks its words from them.

export type BookingHeroStage =
  /** Submitted; the owner hasn't reviewed the documents yet. */
  | "pending"
  /** Documents pre-approved; waiting for the guest's down payment. */
  | "awaiting-payment"
  /** Down payment proof uploaded; waiting for the owner to verify it. */
  | "verifying"
  /** Owner cancelled the booking. */
  | "cancelled"
  /** Owner turned the request down. */
  | "rejected"
  /** Never completed in time, or the dates passed while unconfirmed. */
  | "lapsed";

export interface BookingHeroStageInput {
  status: string;
  /** The guest has uploaded down payment proof (pay.proofUrl). */
  hasPaymentProof: boolean;
  /** The page's own `lapsed` flag: expired-unpaid, or the stay ended unconfirmed. */
  lapsed: boolean;
}

export function bookingHeroStage({
  status,
  hasPaymentProof,
  lapsed,
}: BookingHeroStageInput): BookingHeroStage {
  // A decision the owner made outranks "time ran out" — it says more about why
  // the booking stopped. (The two can't collide today: `lapsed` only counts
  // statuses that are still live.)
  if (status === "cancelled") return "cancelled";
  if (status === "rejected") return "rejected";
  if (lapsed) return "lapsed";

  if (status === "approved" || status === "awaiting-payment") {
    return hasPaymentProof ? "verifying" : "awaiting-payment";
  }

  // "pending" and anything unrecognised: the booking is in, nothing is promised.
  return "pending";
}
