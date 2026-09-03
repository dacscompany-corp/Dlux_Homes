import { addDaysISO } from "./pricing";

// Moving a booking to new dates, without the timezone and type hazards that
// broke the admin approve path.
//
// TWO traps live here, and both have bitten this codebase:
//
//  1. node-postgres returns a DATE column as a JS Date, not a string. Any code
//     doing `row.check_in_date + "T00:00:00"` stringifies the Date and appends
//     "T00:00:00", producing an unparseable value — NaN downstream, and a
//     RangeError out of .toISOString().
//  2. .toISOString() reports UTC. A Date built from LOCAL parts east of UTC
//     (Manila is +8) reports the PREVIOUS day, so a stay silently moves back
//     one night. Same class of bug the storefront calendar already guards.
//
// Both are avoided by never round-tripping through a timezone-aware Date: the
// date portion of what Postgres gives us IS the calendar date it means, so
// normalize to "YYYY-MM-DD" first and do the arithmetic on that.

const ISO_DAY = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Normalize whatever a DATE column (or a client) hands us to "YYYY-MM-DD".
 * Returns "" for null/undefined/unusable input — callers decide whether that
 * is fatal, rather than getting a plausible-looking wrong date.
 */
export function toISODate(value: unknown): string {
  if (value == null) return "";

  // A Date object — from pg, this is midnight UTC on the intended day. Read the
  // UTC parts, never the local ones, or a +UTC process shifts the day.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // A Date built from local parts (new Date(2026, 8, 5)) is NOT UTC midnight,
    // so its UTC parts can name the previous day. Compare both readings and
    // prefer the local one when the value looks like a local-midnight Date.
    const local = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const isLocalMidnight =
      value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0;
    if (isLocalMidnight) return local;
    return value.toISOString().slice(0, 10);
  }

  const m = ISO_DAY.exec(String(value));
  return m ? m[1] : "";
}

/** Whole days between two calendar dates. Both must already be "YYYY-MM-DD". */
function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(
    Number(fromISO.slice(0, 4)),
    Number(fromISO.slice(5, 7)) - 1,
    Number(fromISO.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toISO.slice(0, 4)),
    Number(toISO.slice(5, 7)) - 1,
    Number(toISO.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Move a stay to `newCheckIn`, keeping its length. A 1-night booking stays 1
 * night; a same-day session (Daycation/Nightcation, where check-out is the same
 * calendar date) stays same-day.
 *
 * Throws on unusable input. A date change writes to a live booking that a guest
 * has already paid against, so a silent fallback here would move someone's stay
 * to a date nobody chose — far worse than a 4xx the operator can see.
 */
export function movedStayDates(
  currentCheckIn: unknown,
  currentCheckOut: unknown,
  newCheckIn: unknown,
): { checkIn: string; checkOut: string } {
  const fromISO = toISODate(currentCheckIn);
  const toISO = toISODate(currentCheckOut);
  const startISO = toISODate(newCheckIn);

  if (!fromISO || !toISO || !startISO) {
    throw new Error(
      `movedStayDates: unusable dates (checkIn=${String(currentCheckIn)}, checkOut=${String(currentCheckOut)}, newCheckIn=${String(newCheckIn)})`,
    );
  }

  const stayDays = daysBetween(fromISO, toISO);
  return { checkIn: startISO, checkOut: addDaysISO(startISO, stayDays) };
}
