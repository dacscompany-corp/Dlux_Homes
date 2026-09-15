import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";
import { validateNewPassword } from "@/lib/password-policy";
import { rateLimit, clientIp, tooManyRequests } from "@/backend/utils/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/auth/change-password
 *
 * Lets a signed-in guest replace their own password. This is the action the
 * confirmation email asks for: guest accounts are created at confirmation on
 * the shared GUEST_DEFAULT_PASSWORD, and until the guest changes it, a password
 * printed in an email is all that guards their booking history.
 *
 * Only the guest (`users`) table is handled here — staff change theirs through
 * api/admin/change-password. An account with no password (Google sign-in) is
 * sent to the emailed reset link instead, which can set one from nothing.
 */
export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const client = await pool.connect();
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    if (!sessionEmail) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    const normalized = String(sessionEmail).trim().toLowerCase();

    // Verifying the current password makes this endpoint a password oracle for
    // anyone who gets hold of a session, so throttle it per account and per IP.
    const emailOk = rateLimit(`changepw:email:${normalized}`, 8, 15 * 60 * 1000);
    const ipOk = rateLimit(`changepw:ip:${clientIp(req)}`, 20, 15 * 60 * 1000);
    if (!emailOk.ok) return tooManyRequests(emailOk.retryAfterSec);
    if (!ipOk.ok) return tooManyRequests(ipOk.retryAfterSec);

    const { currentPassword, newPassword } = await req.json().catch(() => ({}));

    const found = await client.query(
      `SELECT user_id, password FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [normalized],
    );

    if (found.rows.length === 0) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    const { user_id: userId, password: storedHash } = found.rows[0];

    if (!storedHash) {
      return NextResponse.json(
        {
          error:
            "Your account signs in with Google, so there's no password to change. " +
            "To set one, use “Forgot?” on the sign-in page.",
        },
        { status: 400 },
      );
    }

    if (!currentPassword || !(await bcrypt.compare(String(currentPassword), storedHash))) {
      return NextResponse.json({ error: "That current password isn't right." }, { status: 400 });
    }

    const check = validateNewPassword(newPassword, {
      current: String(currentPassword),
      sharedPassword: process.env.GUEST_DEFAULT_PASSWORD?.trim() || null,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);

    await client.query("BEGIN");
    await client.query(
      `UPDATE users SET password = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, hashed],
    );
    // An emailed reset link outstanding from before this change could still
    // overwrite the password the guest just chose — retire those too.
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE LOWER(email) = $1 AND used_at IS NULL`,
      [normalized],
    );
    await client.query("COMMIT");

    console.log(`🔑 [ACCOUNT] password changed by guest ${normalized}`);

    return NextResponse.json({ ok: true, message: "Your password has been changed." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* nothing open */ }
    console.error("change-password error:", error);
    return NextResponse.json(
      { error: "Could not change your password. Please try again." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
