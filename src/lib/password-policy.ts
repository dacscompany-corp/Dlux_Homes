// The rules a guest-chosen password has to satisfy, in one place so every path
// that sets a password agrees: the emailed reset link
// (api/auth/reset-password) and the signed-in form (api/auth/change-password).
//
// Guest accounts are created for the guest at confirmation and start on the
// shared GUEST_DEFAULT_PASSWORD, which is printed in the confirmation email —
// so "change your password" is the one action that makes the account actually
// theirs, and setting it BACK to the shared value would undo that. That's the
// non-obvious rule here; the rest is length.

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt hashes only the first 72 bytes and silently ignores the rest — a
// longer password would appear to work while the tail did nothing, so refuse
// it outright rather than accept input we don't fully use.
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export interface PasswordPolicyContext {
  /** The password being replaced, when the caller knows it (the signed-in form does). */
  current?: string | null;
  /** GUEST_DEFAULT_PASSWORD — the shared starting password, when configured. */
  sharedPassword?: string | null;
}

/**
 * Validate a password a guest just typed. Messages are written for the guest:
 * they say what's wrong and what to do about it.
 */
export function validateNewPassword(
  next: unknown,
  { current, sharedPassword }: PasswordPolicyContext = {},
): PasswordCheck {
  if (typeof next !== "string" || next.length === 0) {
    return { ok: false, error: "Enter a new password." };
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  // Byte length, not character count — one emoji is four bytes of the 72.
  if (new TextEncoder().encode(next).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` };
  }
  if (next.trim().length === 0) {
    return { ok: false, error: "Password can't be only spaces." };
  }
  if (current && next === current) {
    return { ok: false, error: "That's the password you're already using. Choose a different one." };
  }
  if (sharedPassword && next === sharedPassword) {
    return {
      ok: false,
      error: "That's the starting password we emailed you. Choose a password only you know.",
    };
  }
  return { ok: true };
}
