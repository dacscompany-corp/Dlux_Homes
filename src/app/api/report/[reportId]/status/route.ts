import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";

const VALID_STATUSES = ["Open", "Pending", "In Progress", "Resolved", "Closed"];

// Dedicated status-change endpoint — separate from the general PATCH on
// [reportId] (which only edits report fields and explicitly refuses once a
// report leaves Open/Pending). Status transitions have no such restriction:
// admin needs to move a report through In Progress -> Resolved -> Closed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const guard = await requireEmployee();
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

    const result = await pool.query(
      `UPDATE report_issue SET status = $1, updated_at = NOW() WHERE report_id = $2 RETURNING *`,
      [status, reportId]
    );

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
