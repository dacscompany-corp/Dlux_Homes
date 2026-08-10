// When a booking becomes checkable-in.
//
// The same rule already governs the self-check-in email (see
// api/cron/send-self-checkin-emails): the guest is told how to let themselves
// in at the moment the stay effectively opens, so staff shouldn't be able to
// mark them arrived before that. Keeping one definition means the email and the
// admin button can't drift apart.
//
// In Asia/Manila: 1 hour before check-in, for every stay type.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Parse "19:00:00" / "7:00 PM" into hours since midnight. Null if unreadable. */
function parseHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const t = String(time).trim();
  const h24 = t.match(/^(\d{1,2}):(\d{2})/);
  if (!h24) return null;
  let hour = Number(h24[1]);
  const minutes = Number(h24[2]);
  if (/pm/i.test(t) && hour < 12) hour += 12;
  if (/am/i.test(t) && hour === 12) hour = 0;
  if (!Number.isFinite(hour)) return null;
  return hour + minutes / 60;
}

/**
 * The instant check-in opens, as epoch ms. Returns null when the booking has no
 * usable check-in date — callers should treat that as "no restriction" rather
 * than blocking a booking they can't evaluate.
 */
export function checkInOpensAt(
  checkInDate: string | null | undefined,
  checkInTime: string | null | undefined,
): number | null {
  if (!checkInDate) return null;
  const day = String(checkInDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  // Midnight of the check-in date, in Manila, expressed as an absolute instant.
  const midnightManila = Date.parse(`${day}T00:00:00Z`) - MANILA_OFFSET_MS;
  if (Number.isNaN(midnightManila)) return null;

  const hour = parseHour(checkInTime);
  // Unknown time → the whole day is fair game.
  if (hour == null) return midnightManila;

  // One hour before the scheduled check-in time.
  return midnightManila + (hour - 1) * 60 * 60 * 1000;
}

/** Has check-in opened for this booking yet? Unknown dates are permissive. */
export function isCheckInOpen(
  checkInDate: string | null | undefined,
  checkInTime: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const opens = checkInOpensAt(checkInDate, checkInTime);
  return opens == null || now >= opens;
}

/** Human explanation for a disabled Check in button. */
export function checkInOpensLabel(
  checkInDate: string | null | undefined,
  checkInTime: string | null | undefined,
): string | null {
  const opens = checkInOpensAt(checkInDate, checkInTime);
  if (opens == null) return null;
  return new Date(opens).toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
