// Pool Pass money is not business revenue (owner, 2026-11-03).
//
// The pool fee a guest pays at checkout ("Swimming Pool", or "Pool Pass" /
// "poolPass" on older and admin-made bookings) is stored as a booking_add_ons
// row and folded into booking_payments.total_amount — and, because amenities
// are paid in full with the down payment, into down_payment too. So every
// revenue figure counted it. These SQL fragments are the one definition of
// "the booking's Pool Pass amount" and of revenue without it, shared by the
// analytics dashboard and the profitability report so they can't disagree.
// The fees themselves stay recorded on the booking, and are reported on their
// own as pool_pass_total for tracking.
//
// Every fragment is interpolated raw with table aliases only — never user input.

/** An add-on row (alias `a`) that is a Pool Pass. */
export const isPoolPassSql = (a: string) => `LOWER(${a}.name) LIKE '%pool%'`;

/** The booking's Pool Pass charge (price × guests), cancelled/refunded rows excluded. */
export const poolPassAmountSql = (b = "b") => `COALESCE((
    SELECT SUM(pa.price * pa.quantity)
      FROM booking_add_ons pa
     WHERE pa.booking_id = ${b}.id
       AND ${isPoolPassSql("pa")}
       AND COALESCE(pa.status, 'pending') NOT IN ('cancelled', 'refunded')
  ), 0)`;

const PAID = (bp: string) => `${bp}.payment_status IN ('approved_down_payment', 'approved_full_payment')`;

/** Money collected for the booking, before taking the pool fee out. */
const collectedSql = (bp: string) => `(CASE
    WHEN ${bp}.payment_status = 'approved_down_payment' THEN ${bp}.down_payment
    WHEN ${bp}.payment_status = 'approved_full_payment' THEN ${bp}.total_amount
    ELSE 0 END)`;

/**
 * Collected revenue for one booking: the approved down payment or full
 * payment, less its Pool Pass fee (paid in full with the down payment).
 */
export const collectedRevenueSql = (bp = "bp", b = "b") =>
  `GREATEST(0, ${collectedSql(bp)} - CASE WHEN ${PAID(bp)} THEN ${poolPassAmountSql(b)} ELSE 0 END)`;

/**
 * Gross (booked) revenue for one booking: the total less add-ons. Pool Pass is
 * an add-on, so it's normally inside add_ons_total already; GREATEST covers a
 * booking whose add_ons_total wasn't filled in but has a pool row.
 */
export const grossRevenueSql = (bp = "bp", b = "b") =>
  `GREATEST(0, ${bp}.total_amount - GREATEST(COALESCE(${bp}.add_ons_total, 0), ${poolPassAmountSql(b)}))`;

/** Pool Pass money collected for one booking (for tracking, not revenue). */
export const poolPassCollectedSql = (bp = "bp", b = "b") =>
  `(CASE WHEN ${PAID(bp)} THEN LEAST(${poolPassAmountSql(b)}, ${collectedSql(bp)}) ELSE 0 END)`;
