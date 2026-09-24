import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { logCleaningHistory } from "@/backend/controller/cleanersController";
import { logActivity } from "@/backend/utils/activityLogger";

// Admin (Owner/CSR) approves an inspection: awaiting-inspection -> ready.
// This is the ONLY path that can make a room Ready — the cleaner's own
// Completed action stops at awaiting-inspection and cannot skip this step.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const currentUserId = (guard.session.user as { id?: string })?.id ?? null;

    const currentRes = await pool.query(
      `SELECT cleaning_status FROM booking_cleaning WHERE id = $1::uuid`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Cleaning task not found" }, { status: 404 });
    }
    if (currentRes.rows[0].cleaning_status !== "awaiting-inspection") {
      return NextResponse.json(
        { success: false, error: "Only a task Awaiting Inspection can be approved" },
        { status: 400 }
      );
    }

    const updateRes = await pool.query(
      `UPDATE booking_cleaning
       SET cleaning_status = 'ready', inspected_at = NOW(), inspection_note = NULL
       WHERE id = $1::uuid
       RETURNING *`,
      [id]
    );

    await logCleaningHistory(id, "awaiting-inspection", "ready", currentUserId);

    await logActivity({
      employeeId: currentUserId ?? "00000000-0000-0000-0000-000000000000",
      activityType: "APPROVE_INSPECTION",
      description: `Approved inspection for cleaning task ${id} — room marked Ready`,
      entityType: "cleaning_task",
      entityId: id,
      request: req,
    });

    return NextResponse.json({
      success: true,
      data: updateRes.rows[0],
      message: "Inspection approved — room is Ready",
    });
  } catch (error) {
    console.error("❌ Error approving inspection:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to approve inspection" },
      { status: 500 }
    );
  }
}
