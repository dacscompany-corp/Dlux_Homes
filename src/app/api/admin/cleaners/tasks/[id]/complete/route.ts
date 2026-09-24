import { NextRequest, NextResponse } from "next/server";
import { updateCleaningTask } from "@/backend/controller/cleanersController";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import pool from "@/backend/config/db";

// Completing a cleaning task does NOT make the room bookable again — it only
// moves the task to "awaiting-inspection". Only an admin's inspection
// approval (tasks/[id]/inspect/approve) can move it to "ready". This route
// also gates completion on the assignment's checklist actually being done,
// so "Completed" can't be pressed with required tasks still outstanding.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const changedBy = (guard.session.user as { id?: string })?.id ?? null;

    // Find this task's haven + booking, then its most recent checklist for
    // that (haven, booking) pair — same lookup getChecklistByHaven uses.
    const taskRes = await pool.query(
      `SELECT b.id::text AS booking_uuid, h.uuid_id::text AS haven_id
       FROM booking_cleaning bc
       INNER JOIN booking b ON bc.booking_id = b.id
       LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
       WHERE bc.id = $1::uuid`,
      [id]
    );

    if (taskRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    const { booking_uuid: bookingUuid, haven_id: havenId } = taskRes.rows[0];

    if (havenId) {
      const checklistRes = await pool.query(
        `SELECT id, status FROM cleaning_checklists
         WHERE haven_id = $1 AND booking_id = $2::uuid
         ORDER BY CASE WHEN status != 'completed' THEN 0 ELSE 1 END ASC, created_at DESC
         LIMIT 1`,
        [havenId, bookingUuid]
      );

      if (checklistRes.rows.length > 0 && checklistRes.rows[0].status !== "completed") {
        const incompleteRes = await pool.query(
          `SELECT COUNT(*)::int AS incomplete_count FROM cleaning_tasks WHERE checklist_id = $1 AND completed = false`,
          [checklistRes.rows[0].id]
        );
        const incompleteCount = incompleteRes.rows[0]?.incomplete_count ?? 0;
        if (incompleteCount > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Cannot mark complete: ${incompleteCount} checklist item(s) still incomplete`,
              incompleteCount,
            },
            { status: 400 }
          );
        }
      }
      // No checklist yet at all -> nothing to gate on (matches submitChecklist's
      // own behavior of only blocking when incomplete tasks actually exist).
    }

    // Mock the URL structure for the controller
    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const mockReq = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify({
        cleaning_status: "awaiting-inspection",
        cleaning_time_out: new Date().toISOString(),
        cleaned_at: new Date().toISOString(),
        changed_by: changedBy,
      }),
    }) as NextRequest;

    return updateCleaningTask(mockReq);
  } catch (error) {
    console.log("❌ Error completing cleaning:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete cleaning",
      },
      { status: 500 }
    );
  }
}
