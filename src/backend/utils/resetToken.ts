import crypto from "crypto";

// Production-grade password reset tokens. We generate a high-entropy random
// token, email the RAW value to the user, and persist only its SHA-256 hash in
// password_reset_tokens. Verification hashes the incoming token and looks it up,
// so the database never holds anything usable to reset a password. Tokens are
// single-use (consumed on success) and expire after TTL_MS.

export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Raw token the user receives in their email link.
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Hash stored in / matched against the DB. Deterministic for a given token.
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
