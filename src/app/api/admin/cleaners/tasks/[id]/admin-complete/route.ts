import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { logCleaningHistory } from "@/backend/controller/cleanersController";
import { scheduleCleaningCalendarSync } from "@/backend/utils/cleaningCalendar";
import { logActivity } from "@/backend/utils/activityLogger";
import { describe } from "@/lib/cleaning-workflow";

// Admin override (Owner/CSR): close a task straight to Ready from any earlier
// status, skipping the cleaner's checklist/photo hand-in and the inspection
// step. For rooms the owner has confirmed are clean outside the app — e.g. old
// past-checkout tasks still sitting at Assigned. The normal sequence
// (Assigned → In Progress → Awaiting Inspection → Ready) is unchanged; this is
// a separate, explicitly logged path.
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
    const from: string = currentRes.rows[0].cleaning_status;
    if (from === "ready") {
      return NextResponse.json({ success: true, message: "This room is already Ready" });
    }

    // Only fill timestamps the real flow didn't record, so a task the cleaner
    // did start/hand in keeps its actual times.
    const updateRes = await pool.query(
      `UPDATE booking_cleaning
       SET cleaning_status = 'ready',
           cleaning_time_out = COALESCE(cleaning_time_out, NOW()),
           cleaned_at = COALESCE(cleaned_at, NOW()),
           inspected_at = NOW(),
           inspection_note = NULL
       WHERE id = $1::uuid
       RETURNING *`,
      [id]
    );

    await logCleaningHistory(id, from, "ready", currentUserId, `Marked complete by admin (override from ${describe(from)})`);

    scheduleCleaningCalendarSync(id);

    await logActivity({
      employeeId: currentUserId ?? "00000000-0000-0000-0000-000000000000",
      activityType: "ADMIN_COMPLETE_CLEANING",
      description: `Marked cleaning task ${id} complete (override from ${describe(from)}) — room marked Ready`,
      entityType: "cleaning_task",
      entityId: id,
      request: req,
    });

    return NextResponse.json({
      success: true,
      data: updateRes.rows[0],
      message: "Cleaning marked complete — room is Ready",
    });
  } catch (error) {
    console.error("❌ Error marking cleaning complete:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to mark cleaning complete" },
      { status: 500 }
    );
  }
}
