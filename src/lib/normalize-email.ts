// One spelling of an email address, everywhere.
//
// The app already lowercased on write in half a dozen places (auth sign-in,
// forgot/change password, guest account creation) and the database enforces it
// for `users` via `users_email_lower_key`. What it did NOT have was a single
// function to call, so each caller re-derived the rule — and the one place that
// never got it, `booking_guests.email`, is stored raw to this day.
//
// Promo redemption now keys on the address a guest types at checkout, so
// "Maria@Gmail.com" and "maria@gmail.com " have to resolve to the same guest or
// the one-use-per-guest rule is trivially sidestepped by pressing shift.

/**
 * Trim and lowercase an email address for use as an identity key.
 *
 * Returns `null` for anything that cannot be one — empty, whitespace-only, or
 * missing an `@`. Callers treat `null` as "no email identity available" rather
 * than as an address, so a blank field can never match another blank field.
 *
 * Deliberately does NOT strip plus-tags or Gmail dots: `maria+1@gmail.com` is a
 * different address as far as this app is concerned. That gap is a known,
 * accepted one — stripping them wrongly merges people who legitimately use
 * tagged addresses, and only works for Gmail-shaped hosts anyway.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}
