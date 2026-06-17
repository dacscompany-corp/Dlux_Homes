import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import bcrypt from "bcryptjs";
import { hashResetToken } from "@/backend/utils/resetToken";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const { token, password } = await req.json().catch(() => ({}));

    if (!token) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    }
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const tokenHash = hashResetToken(String(token));

    await client.query("BEGIN");

    // Lock the matching unused, unexpired token row so it can't be consumed twice.
    const row = await client.query(
      `SELECT id, email FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash]
    );

    if (row.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    }

    const { id: tokenId, email } = row.rows[0];
    const hashed = await bcrypt.hash(String(password), 10);

    // Update whichever table holds the account (guest or staff).
    const userResult = await client.query(
      `UPDATE users SET password = $2 WHERE LOWER(email) = LOWER($1) RETURNING user_id`,
      [email, hashed]
    );
    if (userResult.rows.length === 0) {
      await client.query(
        `UPDATE employees SET password = $2 WHERE LOWER(email) = LOWER($1)`,
        [email, hashed]
      );
    }

    // Consume the token (single-use) and invalidate any other outstanding tokens.
    await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [tokenId]);
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE LOWER(email) = LOWER($1) AND used_at IS NULL`,
      [email]
    );

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("reset-password error:", error);
    return NextResponse.json({ error: "Could not reset password. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
