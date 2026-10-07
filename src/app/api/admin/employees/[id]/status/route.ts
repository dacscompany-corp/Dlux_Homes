import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { logActivity } from "@/backend/utils/activityLogger";
import { checkStatusChange } from "@/lib/staff-accounts";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/employees/[id]/status  { status: "active" | "inactive" }
//
// Deactivate or reactivate a staff account (Owner/CSR, Team → Staff
// Management). The account is kept — its history, assignments and logs stay
// intact — but an inactive account can't sign in, its open sessions are turned
// away by requireEmployee(), and an inactive Cleaner is skipped by automatic
// cleaning assignment. The rules (not yourself, Owners only by an Owner, never
// the last active Owner) live in checkStatusChange.
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const callerId = String((guard.session.user as { id?: string }).id ?? "");
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };

  try {
    const found = await pool.query(
      `SELECT id::text AS id, role, status, first_name, last_name FROM employees WHERE id::text = $1 LIMIT 1`,
      [id],
    );
    const target = found.rows[0];
    if (!target) {
      return NextResponse.json({ success: false, error: "Staff member not found." }, { status: 404 });
    }

    const owners = await pool.query(`SELECT COUNT(*)::int AS n FROM employees WHERE role = 'Owner' AND status = 'active'`);
    const check = checkStatusChange(
      { id: callerId, role: guard.role },
      { id: target.id, role: target.role, status: target.status },
      body.status,
      owners.rows[0]?.n ?? 0,
    );
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    const next = body.status as "active" | "inactive";
    const updated = await pool.query(
      `UPDATE employees SET status = $1, updated_at = NOW() WHERE id::text = $2
        RETURNING id::text AS id, first_name, last_name, email, role, status`,
      [next, id],
    );

    const name = `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || "staff member";
    await logActivity({
      employeeId: callerId,
      activityType: next === "inactive" ? "DEACTIVATE_STAFF" : "REACTIVATE_STAFF",
      description: `${next === "inactive" ? "Deactivated" : "Reactivated"} ${target.role} account: ${name}`,
      entityType: "employee",
      entityId: target.id,
      request,
    });

    return NextResponse.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error("❌ Error changing staff status:", error);
    return NextResponse.json({ success: false, error: "Couldn't update this account. Try again." }, { status: 500 });
  }
}
