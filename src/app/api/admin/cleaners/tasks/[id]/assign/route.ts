import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { logActivity } from "@/backend/utils/activityLogger";
import { createNotificationForUser } from "@/backend/utils/notificationHelper";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { logCleaningHistory, reassignCleaningTask } from "@/backend/controller/cleanersController";
import { checkTransition, isPerformed } from "@/lib/cleaning-workflow";

// Manual assign / reassign — Owner/CSR only.
//
// This used to be requireEmployee(), so any cleaner could hand any task to
// anyone (themselves included) straight from the API. Now:
//   - only Owner/CSR can call it;
//   - the target must be an ACTIVE Cleaner account;
//   - a task already approved Ready can't be reassigned;
//   - the fairness ledger moves with the task: unperformed work releases the
//     outgoing cleaner's opportunity (restoring it, with replacement priority)
//     and counts toward the incoming cleaner; performed work stays credited to
//     whoever performed it. See reassignCleaningTask().
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id: cleaningTaskId } = await params;
    const body = await req.json();
    const { assigned_to } = body;

    if (!assigned_to) {
      return NextResponse.json(
        { success: false, error: "Cleaner ID is required" },
        { status: 400 }
      );
    }

    const currentUserId = (guard.session.user as { id?: string })?.id ?? '00000000-0000-0000-0000-000000000000';

    // Get cleaner and task details for logging and notification. Also pull
    // the CURRENT assignee (before this update overwrites it) so a
    // reassignment can notify whoever is being taken off the task.
    const taskDetailsQuery = `
      SELECT
        bc.id::text as cleaning_id,
        bc.cleaning_status,
        bc.assigned_to::text as previous_cleaner_id,
        b.booking_id,
        b.room_name as haven,
        b.check_out_date,
        bc.scheduled_for,
        e.first_name as cleaner_first_name,
        e.last_name as cleaner_last_name,
        prev.first_name as previous_cleaner_first_name,
        prev.last_name as previous_cleaner_last_name
      FROM booking_cleaning bc
      INNER JOIN booking b ON bc.booking_id = b.id
      LEFT JOIN employees e ON e.id = $1::uuid
      LEFT JOIN employees prev ON prev.id = bc.assigned_to
      WHERE bc.id = $2::uuid
    `;

    const taskDetails = await pool.query(taskDetailsQuery, [assigned_to, cleaningTaskId]);

    if (taskDetails.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    const task = taskDetails.rows[0];

    if (task.cleaning_status === "ready") {
      return NextResponse.json(
        { success: false, error: "This room has already been approved Ready and can't be reassigned." },
        { status: 400 }
      );
    }
    // Re-sending the current assignee is a replay, not a change: no ledger
    // movement, no second "new assignment" notification, no history row.
    if (task.previous_cleaner_id && task.previous_cleaner_id === assigned_to) {
      return NextResponse.json({
        success: true,
        message: "That cleaner is already assigned to this task",
      });
    }

    // Awaiting Inspection is the one status reassignment may leave untouched
    // (the cleaning already happened); everything else must be allowed to
    // become Assigned under the sequence.
    if (task.cleaning_status !== "awaiting-inspection") {
      const move = checkTransition(task.cleaning_status, "assigned", "admin");
      if (!move.ok) {
        return NextResponse.json({ success: false, error: move.error }, { status: 400 });
      }
    }

    // Only an active Cleaner account can receive cleaning work.
    const cleanerCheck = await pool.query(
      `SELECT role, COALESCE(status, 'active') AS status FROM employees WHERE id = $1::uuid`,
      [assigned_to]
    );
    const target = cleanerCheck.rows[0];
    if (!target) {
      return NextResponse.json({ success: false, error: "Cleaner not found" }, { status: 404 });
    }
    if (target.role !== "Cleaner") {
      return NextResponse.json(
        { success: false, error: "Cleaning tasks can only be assigned to Cleaner accounts." },
        { status: 400 }
      );
    }
    if (target.status !== "active") {
      return NextResponse.json(
        { success: false, error: "That cleaner's account is inactive. Reactivate it or pick another cleaner." },
        { status: 400 }
      );
    }

    const cleanerName = `${task.cleaner_first_name || 'Unknown'} ${task.cleaner_last_name || ''}`.trim();
    const isReassignment = !!task.previous_cleaner_id && task.previous_cleaner_id !== assigned_to;

    // --- TIME CONFLICT CHECK ---
    // Block the assignment if the cleaner already has another active task
    // whose check-in/check-out window overlaps with this booking. Treat
    // '00:00' checkout as end-of-day midnight (start of next day).
    const conflictResult = await pool.query(
      `
      SELECT
        b2.booking_id AS conflicting_booking_id,
        b2.room_name  AS conflicting_haven,
        b2.check_in_date  AS c_in_date,
        b2.check_in_time  AS c_in_time,
        b2.check_out_date AS c_out_date,
        b2.check_out_time AS c_out_time
      FROM booking_cleaning bc_existing
      JOIN booking b_target ON b_target.id = (
        SELECT booking_id FROM booking_cleaning WHERE id = $1::uuid LIMIT 1
      )
      JOIN booking b2 ON b2.id = bc_existing.booking_id
      WHERE bc_existing.assigned_to = $2::uuid
        AND bc_existing.id <> $1::uuid
        AND b2.status NOT IN ('rejected', 'cancelled', 'declined')
        AND (b2.check_in_date::DATE + COALESCE(b2.check_in_time::TIME, '00:00'::TIME)) <
            CASE WHEN b_target.check_out_time = '00:00'
                 THEN (b_target.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP
                 ELSE (b_target.check_out_date::DATE + b_target.check_out_time::TIME)::TIMESTAMP
            END
        AND (
            CASE WHEN b2.check_out_time = '00:00'
                 THEN (b2.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP
                 ELSE (b2.check_out_date::DATE + b2.check_out_time::TIME)::TIMESTAMP
            END
        ) > (b_target.check_in_date::DATE + COALESCE(b_target.check_in_time::TIME, '00:00'::TIME))::TIMESTAMP
      LIMIT 1
      `,
      [cleaningTaskId, assigned_to]
    );

    if (conflictResult.rows.length > 0) {
      const c = conflictResult.rows[0];
      const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const fmtTime = (t: string | null) => {
        if (!t) return "";
        const [h, m] = t.substring(0, 5).split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const hr = h % 12 || 12;
        return ` ${hr}:${String(m).padStart(2, "0")} ${period}`;
      };
      const windowStr = `${fmtDate(c.c_in_date)}${fmtTime(c.c_in_time)} → ${fmtDate(c.c_out_date)}${fmtTime(c.c_out_time)}`;
      return NextResponse.json(
        {
          success: false,
          error: `${cleanerName} is already assigned to ${c.conflicting_haven} (Booking: ${c.conflicting_booking_id}) during ${windowStr}. Please pick another cleaner or reschedule.`,
        },
        { status: 409 }
      );
    }
    // --- END CONFLICT CHECK ---

    // Manual assignment, ledger included. A task sitting in Awaiting Inspection
    // keeps its status (the cleaning already happened); anything earlier becomes
    // or stays Assigned so the incoming cleaner starts from the top.
    const { releasedFrom, newStatus } = await reassignCleaningTask({
      cleaningTaskId,
      toEmployeeId: assigned_to,
      assignedBy: currentUserId,
      currentStatus: task.cleaning_status,
      currentAssigneeId: task.previous_cleaner_id ?? null,
    });

    await logCleaningHistory(
      cleaningTaskId,
      task.cleaning_status ?? null,
      newStatus,
      currentUserId,
      isReassignment
        ? `Reassigned from ${task.previous_cleaner_first_name ?? "previous cleaner"} to ${cleanerName}` +
            (releasedFrom
              ? " — unperformed, so the original cleaner's opportunity was restored"
              : isPerformed(task.cleaning_status)
                ? " — cleaning already performed, still credited to the original cleaner"
                : "")
        : `Manually assigned to ${cleanerName}`
    );

    // Log the activity
    await logActivity({
      employeeId: currentUserId,
      activityType: 'ASSIGN_CLEANER',
      description: `Assigned cleaner ${cleanerName} to clean ${task.haven} (Booking: ${task.booking_id})`,
      entityType: 'cleaning_task',
      entityId: cleaningTaskId,
      request: req
    });

    // Same wording as an automatic assignment, so every "New Cleaning
    // Assignment" tells the cleaner WHEN the room opens, not just that it exists.
    const due = task.scheduled_for ? new Date(task.scheduled_for) : task.check_out_date ? new Date(task.check_out_date) : null;
    const startsLine = due
      ? `Cleaning starts after the guest checks out on ${due.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}.`
      : "Please check your cleaning tasks.";

    // Notify the newly assigned cleaner, and — on a reassignment — the
    // outgoing cleaner too, so the task disappearing from their active
    // assignments doesn't happen silently.
    await createNotificationForUser(assigned_to, {
      title: 'New Cleaning Assignment',
      message: `You have been assigned to clean ${task.haven} for booking ${task.booking_id}. ${startsLine}`,
      notificationType: 'cleaning_assignment'
    });

    if (isReassignment && task.previous_cleaner_id) {
      await createNotificationForUser(task.previous_cleaner_id, {
        title: 'Cleaning Assignment Reassigned',
        message: `${task.haven} (Booking: ${task.booking_id}) has been reassigned to ${cleanerName}. It's no longer on your assignments.`,
        notificationType: 'cleaning_reassigned'
      });
    }

    // Get the updated task with cleaner name
    const selectQuery = `
      SELECT 
        bc.id::text as cleaning_id,
        b.booking_id,
        b.room_name as haven,
        bg.first_name as guest_first_name,
        bg.last_name as guest_last_name,
        bg.email as guest_email,
        bg.phone as guest_phone,
        b.check_in_date,
        b.check_in_time,
        b.check_out_date,
        b.check_out_time,
        bc.cleaning_status,
        bc.assigned_to::text as assigned_cleaner_id,
        bc.assignment_method,
        bc.assigned_by::text as assigned_by_id,
        bc.assigned_at,
        bc.scheduled_for,
        bc.unassigned_reason,
        e.first_name as cleaner_first_name,
        e.last_name as cleaner_last_name,
        e.employment_id as cleaner_employment_id,
        bc.cleaning_time_in,
        bc.cleaning_time_out,
        bc.cleaned_at,
        bc.inspected_at
      FROM booking_cleaning bc
      INNER JOIN booking b ON bc.booking_id = b.id
      LEFT JOIN booking_guests bg ON bg.booking_id = b.id
      LEFT JOIN employees e ON bc.assigned_to::text = e.id::text
      WHERE bc.id = $1::uuid
      ORDER BY bc.id
      LIMIT 1
    `;

    const selectResult = await pool.query(selectQuery, [cleaningTaskId]);

    console.log("✅ Cleaner assigned successfully:", selectResult.rows[0]);

    return NextResponse.json({
      success: true,
      data: selectResult.rows[0],
      message: "Cleaner assigned successfully",
    });
  } catch (error) {
    console.log("❌ Error assigning cleaner:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to assign cleaner",
      },
      { status: 500 }
    );
  }
}
