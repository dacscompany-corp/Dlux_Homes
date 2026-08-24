/**
 * When a stay window can still be sold, and which bookings occupy the unit.
 *
 * These two rules lived nowhere and were implied in three places, which is how
 * the storefront came to offer a 7am–5pm daycation at 11pm the same evening,
 * and how an early Check Out reopened a window the guest's booking still
 * covered. Change the rules HERE and nowhere else.
 */

/**
 * Minimum notice before a check-in, in minutes. Zero today: the owner takes
 * same-moment bookings. Raise it to close the "booked at 6:55pm for a 7pm
 * arrival" case — every caller reads this constant, so one edit does it.
 */
export const MIN_LEAD_MINUTES = 0;

/**
 * Can a window whose check-in falls at `startMs` still be booked at `nowMs`?
 *
 * The test is the START, not the end: you cannot check a guest in at 7am once
 * it is 10am, and selling the remaining hours of a part-elapsed window at the
 * full rate is a support problem rather than a sale. Both arguments are plain
 * epoch milliseconds so the caller owns the timezone — the browser compares in
 * the viewer's own zone, and the server compares in Manila via SQL.
 */
export function isStartBookable(
  startMs: number,
  nowMs: number,
  leadMinutes: number = MIN_LEAD_MINUTES,
): boolean {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return false;
  return startMs >= nowMs + leadMinutes * 60_000;
}

/**
 * SQL predicate for "this booking still occupies the unit".
 *
 * A live booking always occupies. A completed one occupies until its SCHEDULED
 * end — marking a guest out at 10am on a stay booked to 5pm must not reopen
 * that afternoon, because the booking still covers it. Once the scheduled end
 * passes, a completed stay stops blocking anything.
 *
 * Manila because that is the wall clock `check_out_time` is written in. Pass a
 * table alias only — this is interpolated raw, never given user input.
 */
export function occupyingBookingSql(alias = "b"): string {
  return `(
    ${alias}.status IN ('pending', 'approved', 'confirmed', 'checked-in', 'on-going')
    OR (
      ${alias}.status = 'completed'
      AND (${alias}.check_out_date + ${alias}.check_out_time)
          > (NOW() AT TIME ZONE 'Asia/Manila')
    )
  )`;
}
