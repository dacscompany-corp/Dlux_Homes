import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { logCleaningHistory } from "@/backend/controller/cleanersController";
import { logActivity } from "@/backend/utils/activityLogger";
import { createNotificationForUser } from "@/backend/utils/notificationHelper";

// Admin (Owner/CSR) fails an inspection: awaiting-inspection -> in-progress,
// with a required note explaining what needs fixing. The cleaner is notified
// so they know to go back and address it before completing again.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const currentUserId = (guard.session.user as { id?: string })?.id ?? null;
    const body = await req.json().catch(() => ({}));
    const note: string = typeof body.note === "string" ? body.note.trim() : "";

    if (!note) {
      return NextResponse.json(
        { success: false, error: "A note explaining what needs to be fixed is required" },
        { status: 400 }
      );
    }

    const currentRes = await pool.query(
      `SELECT bc.cleaning_status, bc.assigned_to::text AS assigned_to, b.room_name AS haven, b.booking_id
       FROM booking_cleaning bc
       INNER JOIN booking b ON bc.booking_id = b.id
       WHERE bc.id = $1::uuid`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Cleaning task not found" }, { status: 404 });
    }
    const task = currentRes.rows[0];
    if (task.cleaning_status !== "awaiting-inspection") {
      return NextResponse.json(
        { success: false, error: "Only a task Awaiting Inspection can be sent back" },
        { status: 400 }
      );
    }

    const updateRes = await pool.query(
      `UPDATE booking_cleaning
       SET cleaning_status = 'in-progress', inspection_note = $2, inspected_at = NULL
       WHERE id = $1::uuid
       RETURNING *`,
      [id, note]
    );

    await logCleaningHistory(id, "awaiting-inspection", "in-progress", currentUserId, note);

    await logActivity({
      employeeId: currentUserId ?? "00000000-0000-0000-0000-000000000000",
      activityType: "REJECT_INSPECTION",
      description: `Sent cleaning task ${id} back to In Progress: ${note}`,
      entityType: "cleaning_task",
      entityId: id,
      request: req,
    });

    if (task.assigned_to) {
      await createNotificationForUser(task.assigned_to, {
        title: "Cleaning Task Sent Back",
        message: `${task.haven} (Booking: ${task.booking_id}) needs more work before inspection: ${note}`,
        notificationType: "cleaning_rejected",
      });
    }

    return NextResponse.json({
      success: true,
      data: updateRes.rows[0],
      message: "Task returned to In Progress",
    });
  } catch (error) {
    console.error("❌ Error rejecting inspection:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reject inspection" },
      { status: 500 }
    );
  }
}
