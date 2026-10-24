import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { createNotificationForUser } from "@/backend/utils/notificationHelper";

const VALID_STATUSES = ["Open", "Pending", "In Progress", "Resolved", "Closed"];

// Dedicated status-change endpoint — separate from the general PATCH on
// [reportId] (which only edits report fields and explicitly refuses once a
// report leaves Open/Pending). Status transitions have no such restriction:
// admin needs to move a report through In Progress -> Resolved -> Closed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  // Owner/CSR move an issue Open → In progress → Fixed (was any staff account).
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { reportId } = await params;
    if (!reportId) {
      return NextResponse.json({ success: false, message: "Report ID is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { status } = body || {};

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const before = await pool.query<{ status: string }>(`SELECT status FROM report_issue WHERE report_id = $1`, [reportId]);
    const result = await pool.query(
      `UPDATE report_issue SET status = $1, updated_at = NOW() WHERE report_id = $2 RETURNING *`,
      [status, reportId]
    );
    // The person who reported it hears when it's fixed (once, on the change).
    const wasFixed = ["Resolved", "Closed"].includes(before.rows[0]?.status ?? "");
    const nowFixed = status === "Resolved" || status === "Closed";
    const row = result.rows[0];
    if (row && nowFixed && !wasFixed && row.user_id && String(row.user_id) !== String((guard.session.user as { id?: string }).id ?? "")) {
      await createNotificationForUser(String(row.user_id), {
        title: "Issue fixed ✓",
        message: `The ${String(row.issue_type).toLowerCase()} you reported at ${row.specific_location} has been fixed. Thank you!`,
        notificationType: "issue_fixed",
      }).catch((e) => console.error("issue fixed notify failed:", e));
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Status updated", data: result.rows[0] });
  } catch (error) {
    console.error("Error updating report status:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
