// Amenity fees are not business revenue (owner, 2026-11-03 for the pool,
// 2026-11-05 for the court too).
//
// The checkout amenities — Swimming Pool and Basketball Court ("Pool Pass" /
// "poolPass" on older and admin-made bookings) — are paid by the guest per
// person but aren't the business's earnings. Each is stored as a
// booking_add_ons row and folded into booking_payments.total_amount and,
// because amenities are paid in full with the down payment, into down_payment
// too — so every revenue figure (and therefore profit) used to count them.
//
// These SQL fragments are the one definition of "the booking's amenity fees"
// and of revenue without them, shared by the analytics dashboard and the
// profitability report so they can't disagree. The fees stay recorded on the
// booking and are reported on their own as amenity_fees_total for tracking.
//
// Every fragment is interpolated raw with table aliases only — never user input.

/** An add-on row (alias `a`) that is a checkout amenity: the pool or the court. */
export const isAmenitySql = (a: string) =>
  `(LOWER(${a}.name) LIKE '%pool%' OR LOWER(${a}.name) LIKE '%basketball%' OR LOWER(${a}.name) LIKE '%court%')`;

/** The booking's amenity fees (price × guests), cancelled/refunded rows excluded. */
export const amenityAmountSql = (b = "b") => `COALESCE((
    SELECT SUM(am.price * am.quantity)
      FROM booking_add_ons am
     WHERE am.booking_id = ${b}.id
       AND ${isAmenitySql("am")}
       AND COALESCE(am.status, 'pending') NOT IN ('cancelled', 'refunded')
  ), 0)`;

const PAID = (bp: string) => `${bp}.payment_status IN ('approved_down_payment', 'approved_full_payment')`;

/** Money collected for the booking, before taking the amenity fees out. */
const collectedSql = (bp: string) => `(CASE
    WHEN ${bp}.payment_status = 'approved_down_payment' THEN ${bp}.down_payment
    WHEN ${bp}.payment_status = 'approved_full_payment' THEN ${bp}.total_amount
    ELSE 0 END)`;

/**
 * Collected revenue for one booking: the approved down payment or full
 * payment, less its amenity fees (paid in full with the down payment).
 */
export const collectedRevenueSql = (bp = "bp", b = "b") =>
  `GREATEST(0, ${collectedSql(bp)} - CASE WHEN ${PAID(bp)} THEN ${amenityAmountSql(b)} ELSE 0 END)`;

/**
 * Gross (booked) revenue for one booking: the total less add-ons. Amenities
 * are add-ons, so they're normally inside add_ons_total already; GREATEST
 * covers a booking whose add_ons_total wasn't filled in but has amenity rows.
 */
export const grossRevenueSql = (bp = "bp", b = "b") =>
  `GREATEST(0, ${bp}.total_amount - GREATEST(COALESCE(${bp}.add_ons_total, 0), ${amenityAmountSql(b)}))`;

/** Amenity fees collected for one booking (for tracking, not revenue). */
export const amenityCollectedSql = (bp = "bp", b = "b") =>
  `(CASE WHEN ${PAID(bp)} THEN LEAST(${amenityAmountSql(b)}, ${collectedSql(bp)}) ELSE 0 END)`;
