// Stay-window helpers shared by the Haven wizard and the System → Settings
// rate cards. Both used to hardcode the window ("19:00 – 16:00") and its length
// ("21h") as literal strings, so editing a haven's check-out time changed
// neither — and the two screens could disagree with each other and with the
// database at the same time.
//
// The `six_hour_* / ten_hour_* / twenty_one_hour_*` column names are legacy from
// the Staycation port and no longer describe these windows: `six_hour_*` is the
// Nightcation and runs 10 hours. Always read the length from the times.

/**
 * "19:00" | "7:00 PM" | "1900-01-01T19:00:00Z" | Date → minutes past midnight.
 *
 * The 12-hour form is NOT optional: the admin stores 24-hour times but the
 * guest-facing windows are formatted "7:00 PM". Parsing those without the
 * meridiem read 7 PM as 07:00, which made a 7 AM → 5 PM Daycation measure 22
 * hours instead of 10.
 */
function toMinutes(value: unknown): number | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  // Matches a bare "HH:MM", the time portion of a timestamp, and "h:MM AM/PM".
  const m = /(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?/.exec(s) ?? /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === "P" && h !== 12) h += 12;
  if (meridiem === "A" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "19:00" — the clock part of whatever the DB hands back. */
export function fmtClock(value: unknown): string {
  const mins = toMinutes(value);
  if (mins == null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * Hours between two times. An end at or before the start rolls into the next
 * day — 19:00 → 05:00 is 10 hours, not −14 — which is how every overnight and
 * nightcation window here is expressed. Null when either side is missing, so
 * callers can omit the span rather than print a wrong one.
 */
export function spanHours(start: unknown, end: unknown): number | null {
  const a = toMinutes(start), b = toMinutes(end);
  if (a == null || b == null) return null;
  const span = b > a ? b - a : b + 1440 - a;
  return Math.round((span / 60) * 10) / 10;
}

/** "19:00 – 17:00", or "" when the haven has no window saved. */
export function fmtWindow(start: unknown, end: unknown): string {
  const a = fmtClock(start), b = fmtClock(end);
  return a && b ? `${a} – ${b}` : "";
}

/** "22h" for the card headings, or "" when the times aren't set. */
export function fmtSpan(start: unknown, end: unknown): string {
  const h = spanHours(start, end);
  return h == null ? "" : `${h}h`;
}
