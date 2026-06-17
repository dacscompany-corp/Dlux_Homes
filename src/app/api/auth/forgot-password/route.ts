import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { generateResetToken, hashResetToken, RESET_TTL_MS } from "@/backend/utils/resetToken";
import { sendPasswordResetEmail } from "@/backend/utils/mailer";

export const runtime = "nodejs";

// Always responds with a generic success message regardless of whether the
// account exists — this prevents account-enumeration. If the email belongs to a
// guest (users) or staff (employees) account, a single-use reset token is
// stored (hashed) and a link is emailed.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const generic = NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a password reset link has been sent.",
  });

  const client = await pool.connect();
  try {
    const { email } = await req.json().catch(() => ({}));
    const normalized = String(email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return generic;

    // Look the email up in both the guest (users) and staff (employees) tables.
    const found = await client.query(
      `SELECT email FROM users WHERE LOWER(email) = $1
       UNION SELECT email FROM employees WHERE LOWER(email) = $1
       LIMIT 1`,
      [normalized]
    );

    if (found.rows.length > 0) {
      const token = generateResetToken();
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);

      // Invalidate any earlier unused tokens for this email, then store the new one.
      await client.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE LOWER(email) = $1 AND used_at IS NULL`,
        [normalized]
      );
      await client.query(
        `INSERT INTO password_reset_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [normalized, tokenHash, expiresAt]
      );

      const resetUrl = `${req.nextUrl.origin}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail(normalized, resetUrl);
    }

    return generic;
  } catch (error) {
    console.error("forgot-password error:", error);
    return generic; // Still generic — don't reveal server state.
  } finally {
    client.release();
  }
}
