import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { checkoutAtSql, updateCleaningTask } from "@/backend/controller/cleanersController";
import { requireCleaningTaskAccess } from "@/backend/utils/requireAdmin";
import { actorForRole, checkTransition } from "@/lib/cleaning-workflow";
import { CHECKED_OUT_STATUSES } from "@/lib/cleaning-schedule";

// Assigned → In Progress.
//
// Two gates, both server-side so a direct API call can't skip them:
//   1. the task must be assigned to the caller (Owner/CSR may start any task);
//   2. cleaning cannot begin while the guest is still in the room. It opens
//      as soon as EITHER the booking has been marked checked out (so an early
//      checkout frees the room immediately) OR the scheduled checkout time has
//      arrived. Assignments are issued when the booking is CONFIRMED, days
//      ahead of the stay, so without this an advance assignment would let a
//      cleaner mark a room in-progress while the guest was still in it.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireCleaningTaskAccess(id);
  if (!guard.ok) return guard.response;

  try {
    const actor = actorForRole(guard.role);

    const transition = checkTransition(guard.status, "in-progress", actor);
    if (!transition.ok) {
      return NextResponse.json({ success: false, error: transition.error }, { status: 400 });
    }

    // Already in progress — nothing to do, and re-stamping cleaning_time_in
    // would throw away when the cleaner actually started.
    if (guard.status === "in-progress") {
      return NextResponse.json({
        success: true,
        message: "This task is already in progress",
      });
    }

    const scheduleRes = await pool.query(
      `SELECT
         COALESCE(bc.scheduled_for, ${checkoutAtSql("b")}) AS due_at,
         b.status AS booking_status,
         b.room_name
       FROM booking_cleaning bc
       INNER JOIN booking b ON b.id = bc.booking_id
       WHERE bc.id = $1::uuid`,
      [id]
    );

    const row = scheduleRes.rows[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    const dueAt = row.due_at ? new Date(row.due_at) : null;
    const checkedOut = CHECKED_OUT_STATUSES.includes(String(row.booking_status));
    if (!checkedOut && dueAt && Date.now() < dueAt.getTime()) {
      const when = dueAt.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return NextResponse.json(
        {
          success: false,
          error: `${row.room_name ?? "This room"} is still occupied. Cleaning can start once the guest is checked out, or from the scheduled checkout on ${when}.`,
          startsAt: dueAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const forwarded = new Request(url, {
      method: "PUT",
      headers: req.headers,
      body: JSON.stringify({
        cleaning_status: "in-progress",
        cleaning_time_in: new Date().toISOString(),
        // Only reached from 'assigned' (the in-progress case returned above), so
        // there is no inspection note worth keeping — a rejection's note is
        // cleared when the cleaner completes again, not when they start.
        inspection_note: null,
        changed_by: guard.actorId,
      }),
    }) as NextRequest;

    return await updateCleaningTask(forwarded, { id: guard.actorId, role: guard.role });
  } catch (error) {
    console.error("❌ Error starting cleaning:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start cleaning",
      },
      { status: 500 }
    );
  }
}
