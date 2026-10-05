import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { validateNewPassword } from "@/lib/password-policy";
import { rateLimit, clientIp, tooManyRequests } from "@/backend/utils/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/admin/me/password
 *
 * Lets a signed-in employee replace their own password. Staff accounts are
 * created by an admin with a starting password (sent in the welcome email);
 * this is how the employee makes the account theirs and later rotates it.
 *
 * Unlike the older public /api/admin/change-password (which takes an email in
 * the body), the account here is the session's, so it can't be aimed at
 * another employee, and attempts are throttled the same way the guest
 * change-password route throttles them.
 */
export async function POST(req: Request): Promise<NextResponse | Response> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const id = String((guard.session.user as { id?: string }).id ?? "");

  // Checking the current password makes this a password oracle for anyone
  // holding a session, so limit attempts per account and per IP.
  const acctOk = rateLimit(`staffpw:id:${id}`, 8, 15 * 60 * 1000);
  const ipOk = rateLimit(`staffpw:ip:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (!acctOk.ok) return tooManyRequests(acctOk.retryAfterSec);
  if (!ipOk.ok) return tooManyRequests(ipOk.retryAfterSec);

  const { currentPassword, newPassword } = (await req.json().catch(() => ({}))) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ success: false, error: "Enter your current password." }, { status: 400 });
  }
  const check = validateNewPassword(newPassword, { current: currentPassword });
  if (!check.ok) {
    return NextResponse.json({ success: false, error: check.error }, { status: 400 });
  }

  try {
    const found = await pool.query(`SELECT password FROM employees WHERE id::text = $1 LIMIT 1`, [id]);
    const storedHash: string | null = found.rows[0]?.password ?? null;
    if (!storedHash) {
      return NextResponse.json({ success: false, error: "Account not found. Please sign in again." }, { status: 404 });
    }

    if (!(await bcrypt.compare(currentPassword, storedHash))) {
      return NextResponse.json({ success: false, error: "Current password is incorrect." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword as string, 10);
    await pool.query(`UPDATE employees SET password = $1, updated_at = NOW() WHERE id::text = $2`, [hashed, id]);

    return NextResponse.json({ success: true, message: "Password changed." });
  } catch (error) {
    console.error("❌ Error changing staff password:", error);
    return NextResponse.json({ success: false, error: "Couldn't change your password. Try again." }, { status: 500 });
  }
}
