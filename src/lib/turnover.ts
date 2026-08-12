// Cleaning turnover — the single source of truth for how long the unit is
// unavailable after a stay ends, before the next guest can check in.
//
// This lived as duplicated magic numbers in three places (the room calendar,
// createBooking's SQL, and the availability test scripts). When they disagree
// the calendar and the server disagree, which shows up as a date the guest can
// select but not actually book. Change the rule HERE and nowhere else.
//
// Owner rule (2026-08-13): a full overnight needs a proper clean; a 10-hour
// session is a lighter turnover. The short buffer was 2h, which closed the
// daycation on any day an overnight checked in before 7PM — a 7AM–5PM
// daycation plus 2h reached 7PM, so a 6PM check-in swallowed the whole slot.
// Owner set it to 1h to keep those daycations sellable.
export const LONG_STAY_HOURS = 20;
export const TURNOVER_LONG_HOURS = 3;
export const TURNOVER_SHORT_HOURS = 1;

/** Turnover owed after a stay of `ms` milliseconds, in hours. */
export function turnoverHours(ms: number): number {
  return ms >= LONG_STAY_HOURS * 3_600_000 ? TURNOVER_LONG_HOURS : TURNOVER_SHORT_HOURS;
}

/** Turnover owed after a stay of `ms` milliseconds, in milliseconds. */
export function turnoverMs(ms: number): number {
  return turnoverHours(ms) * 3_600_000;
}

/**
 * SQL fragment giving the turnover INTERVAL owed after a stay running from the
 * timestamp expression `start` to `end`. Both are interpolated as raw SQL, so
 * pass column/CTE references only — never user input.
 */
export function turnoverSql(start: string, end: string): string {
  return `(CASE WHEN (${end} - ${start}) >= INTERVAL '${LONG_STAY_HOURS} hours'
                THEN INTERVAL '${TURNOVER_LONG_HOURS} hours'
                ELSE INTERVAL '${TURNOVER_SHORT_HOURS} hours' END)`;
}

/** Human-readable summary for guest-facing error copy. */
export const TURNOVER_BLURB = `${TURNOVER_LONG_HOURS} hrs after an overnight stay, ${TURNOVER_SHORT_HOURS} hr${TURNOVER_SHORT_HOURS === 1 ? "" : "s"} otherwise`;
