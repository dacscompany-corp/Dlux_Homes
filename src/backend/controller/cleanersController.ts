import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import type { PoolClient } from "pg";
import { createNotificationForUser, createNotificationsForRoles } from "@/backend/utils/notificationHelper";
import {
  CLEANING_STATUSES,
  actorForRole,
  checkTransition,
  isPerformed,
  type CleaningActor,
} from "@/lib/cleaning-workflow";
import {
  pickNextCleaner,
  UNASSIGNED_REASON,
  type RotationCandidate,
} from "@/lib/cleaning-rotation";

export interface CleaningTask {
  cleaning_id: string;
  booking_id: string;
  booking_uuid: string;
  /** The booking's own status — 'pending' means not confirmed yet. */
  booking_status: string;
  haven: string;
  haven_id: string | null;
  guest_first_name: string;
  guest_last_name: string;
  // Guest contact and payment figures are Owner/CSR-only — see VIEWER_SCOPED
  // columns below. They are absent (not null) from a Cleaner's response.
  guest_email?: string;
  guest_phone?: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  scheduled_for: string | null;
  cleaning_status: string;
  assigned_cleaner_id: string | null;
  assignment_method: "automatic" | "manual" | null;
  assigned_by_id: string | null;
  assigned_at: string | null;
  assigned_by_first_name: string | null;
  assigned_by_last_name: string | null;
  cleaner_first_name: string | null;
  cleaner_last_name: string | null;
  cleaner_employment_id: string | null;
  cleaning_time_in: string | null;
  cleaning_time_out: string | null;
  cleaned_at: string | null;
  inspected_at: string | null;
  inspection_note: string | null;
  unassigned_reason: string | null;
  deposit_status?: string | null;
  security_deposit?: number | null;
  deposit_proof_url?: string | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  down_payment?: number | null;
  remaining_balance?: number | null;
  open_issue_count: number;
}

/**
 * SQL for the moment a booking's cleaning is due: the guest's checkout, as a
 * real instant. Booking dates and times are Manila wall-clock (single property,
 * Quezon City), so the naive date+time is anchored with AT TIME ZONE — without
 * it, a TIMESTAMPTZ column interprets it in the SESSION zone (UTC on Supabase)
 * and a 12:00 checkout would land at 20:00 Manila. '00:00' means midnight at
 * the END of the checkout date, matching the rest of the booking code.
 */
export function checkoutAtSql(alias: string): string {
  return `((CASE WHEN ${alias}.check_out_time = '00:00'
                 THEN (${alias}.check_out_date::DATE + INTERVAL '1 day')
                 ELSE (${alias}.check_out_date::DATE + COALESCE(${alias}.check_out_time::TIME, '23:59'::TIME))
            END) AT TIME ZONE 'Asia/Manila')`;
}

/** Who is reading or writing. Both guards already resolve this. */
export type CleaningViewer = { id: string | null; role: string };

// Columns every cleaning-task response carries, whoever is asking.
const BASE_TASK_COLUMNS = `
  bc.id::text as cleaning_id,
  b.booking_id,
  b.id::text as booking_uuid,
  b.status as booking_status,
  b.room_name as haven,
  h.uuid_id::text as haven_id,
  bg.first_name as guest_first_name,
  bg.last_name as guest_last_name,
  b.check_in_date,
  b.check_in_time,
  b.check_out_date,
  b.check_out_time,
  b.adults,
  b.children,
  bc.scheduled_for,
  bc.cleaning_status,
  bc.assigned_to::text as assigned_cleaner_id,
  bc.assignment_method,
  bc.assigned_by::text as assigned_by_id,
  bc.assigned_at,
  ab.first_name as assigned_by_first_name,
  ab.last_name as assigned_by_last_name,
  e.first_name as cleaner_first_name,
  e.last_name as cleaner_last_name,
  e.employment_id as cleaner_employment_id,
  bc.cleaning_time_in,
  bc.cleaning_time_out,
  bc.cleaned_at,
  bc.inspected_at,
  bc.inspection_note,
  bc.unassigned_reason
`;

// Guest contact details and every money figure. A cleaner needs none of this to
// clean a room, so it is not selected for them at all — the response can't leak
// what was never fetched.
const ADMIN_ONLY_TASK_COLUMNS = `
  bg.email as guest_email,
  bg.phone as guest_phone,
  sd.deposit_status,
  sd.amount as security_deposit,
  sd.payment_proof_url as deposit_proof_url,
  bp.total_amount,
  bp.amount_paid,
  bp.down_payment,
  GREATEST(COALESCE(bp.total_amount, 0) - COALESCE(bp.amount_paid, 0), 0) AS remaining_balance
`;

const ADMIN_ONLY_JOINS = `
  LEFT JOIN booking_security_deposits sd ON sd.booking_id = b.id
  LEFT JOIN booking_payments bp ON bp.booking_id = b.id
`;

const BASE_JOINS = `
  FROM booking_cleaning bc
  INNER JOIN booking b ON bc.booking_id = b.id
  LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
  LEFT JOIN booking_guests bg ON bg.booking_id = b.id
  LEFT JOIN employees e ON bc.assigned_to = e.id
  LEFT JOIN employees ab ON bc.assigned_by = ab.id
`;

function taskProjection(actor: CleaningActor): string {
  return actor === "admin" ? `${BASE_TASK_COLUMNS},\n${ADMIN_ONLY_TASK_COLUMNS}` : BASE_TASK_COLUMNS;
}

function taskJoins(actor: CleaningActor): string {
  return actor === "admin" ? `${BASE_JOINS}${ADMIN_ONLY_JOINS}` : BASE_JOINS;
}

/**
 * GET all cleaning tasks.
 *
 * Two things changed from the original here, both deliberate:
 *   - it no longer INSERTs sample cleaning rows when the table looks empty;
 *     a read endpoint inventing work was the source of phantom assignments.
 *   - a Cleaner sees only the tasks assigned to THEM, and without guest contact
 *     or payment details. Unassigned tasks belong to Owner/CSR (who are notified
 *     about them), not to whichever cleaner happens to open the portal — which
 *     is also what makes the mobile and desktop views agree.
 */
export const getAllCleaningTasks = async (
  req: NextRequest,
  viewer: CleaningViewer,
): Promise<NextResponse> => {
  try {
    const actor = actorForRole(viewer.role);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const values: string[] = [];
    let where = `WHERE b.status NOT IN ('rejected', 'cancelled')`;

    if (actor === "cleaner") {
      if (!viewer.id) {
        // A signed-in cleaner with no resolvable id has no assignments to show.
        return NextResponse.json({ success: true, data: [], count: 0 });
      }
      values.push(viewer.id);
      where += ` AND bc.assigned_to = $${values.length}::uuid`;
    }

    if (status) {
      values.push(status);
      where += ` AND bc.cleaning_status = $${values.length}`;
    }

    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (bc.id)
          ${taskProjection(actor)},
          (
            SELECT COUNT(*)::int FROM report_issue ri
            WHERE ri.booking_cleaning_id = bc.id AND ri.status NOT IN ('Resolved', 'Closed')
          ) AS open_issue_count
        ${taskJoins(actor)}
        ${where}
        ORDER BY bc.id, bg.guest_index NULLS LAST, bg.id NULLS LAST
      ) AS tasks
      ORDER BY scheduled_for DESC NULLS LAST, check_out_date DESC, check_out_time DESC
    `;

    const result = await pool.query(query, values);

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("❌ Error getting cleaning tasks:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get cleaning tasks",
        data: [],
      },
      { status: 500 }
    );
  }
};

// GET Single Cleaning Task by ID
export const getCleaningTaskById = async (
  req: NextRequest,
  viewer: CleaningViewer,
): Promise<NextResponse> => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const id = segments.pop() || segments.pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Cleaning task ID is required" },
        { status: 400 }
      );
    }

    const actor = actorForRole(viewer.role);
    const result = await pool.query(
      `
      SELECT DISTINCT ON (bc.id)
        ${taskProjection(actor)}
      ${taskJoins(actor)}
      WHERE bc.id = $1::uuid
      ORDER BY bc.id, bg.guest_index NULLS LAST, bg.id NULLS LAST
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Error getting cleaning task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get cleaning task",
      },
      { status: 500 }
    );
  }
};

// Re-exported so the DB CHECK, this controller and every route validate against
// exactly one list. The sequence rules live in src/lib/cleaning-workflow.ts.
export const VALID_CLEANING_STATUSES: readonly string[] = CLEANING_STATUSES;

// Appends one row to booking_cleaning_history. Best-effort: a logging failure
// must never fail the status change it's recording, so callers fire-and-catch.
export async function logCleaningHistory(
  bookingCleaningId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string | null,
  note: string | null = null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO booking_cleaning_history (booking_cleaning_id, from_status, to_status, changed_by, note)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
      [bookingCleaningId, fromStatus, toStatus, changedBy, note]
    );
  } catch (err) {
    console.error("⚠️ Could not log cleaning history:", err);
  }
}

/**
 * Generic task update. Owner/CSR only at the route level — a cleaner's own
 * actions go through /start and /complete, which enforce the same sequence but
 * can't be used to set an arbitrary status.
 *
 * Any status change is checked against the workflow's sequence before it is
 * written, so this endpoint can no longer be used to jump a task straight to
 * Ready and skip inspection.
 */
export const updateCleaningTask = async (
  req: NextRequest,
  viewer: CleaningViewer,
): Promise<NextResponse> => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const id = segments.pop() || segments.pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Cleaning task ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      cleaning_status,
      cleaning_time_in,
      cleaning_time_out,
      cleaned_at,
      inspected_at,
      inspection_note,
      changed_by,
    } = body;

    // `assigned_to` is deliberately NOT accepted here. Assignment goes through
    // /tasks/[id]/assign, which is the only path that keeps the fairness ledger
    // in step with who holds the task.
    if (body.assigned_to !== undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Use /tasks/[id]/assign to assign or reassign a cleaner.",
        },
        { status: 400 }
      );
    }

    const priorResult = await pool.query(
      `SELECT cleaning_status FROM booking_cleaning WHERE id = $1::uuid`,
      [id]
    );
    if (priorResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }
    const priorStatus: string = priorResult.rows[0].cleaning_status;

    if (cleaning_status !== undefined) {
      const check = checkTransition(priorStatus, cleaning_status, actorForRole(viewer.role));
      if (!check.ok) {
        return NextResponse.json({ success: false, error: check.error }, { status: 400 });
      }
    }

    const updateFields: string[] = [];
    const params: (string | null)[] = [];
    let paramCount = 1;

    const push = (column: string, value: string | null | undefined) => {
      if (value === undefined) return;
      updateFields.push(`${column} = $${paramCount}`);
      params.push(value);
      paramCount++;
    };

    push("cleaning_status", cleaning_status);
    push("cleaning_time_in", cleaning_time_in);
    push("cleaning_time_out", cleaning_time_out);
    push("cleaned_at", cleaned_at);
    push("inspected_at", inspected_at);
    push("inspection_note", inspection_note);

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    params.push(id);

    const updateResult = await pool.query(
      `UPDATE booking_cleaning SET ${updateFields.join(", ")} WHERE id = $${paramCount}::uuid RETURNING *`,
      params
    );

    if (updateResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    if (cleaning_status !== undefined && cleaning_status !== priorStatus) {
      // Reaching Awaiting Inspection is the moment the cleaning was actually
      // performed — the ledger locks the opportunity to whoever did it, so a
      // later reassignment can't move the credit away from them.
      if (isPerformed(cleaning_status) && !isPerformed(priorStatus)) {
        await recordCleaningPerformed(id);
      }
      await logCleaningHistory(
        id,
        priorStatus,
        cleaning_status,
        changed_by ?? viewer.id ?? null,
        inspection_note ?? null
      );
    }

    const actor = actorForRole(viewer.role);
    const selectResult = await pool.query(
      `
      SELECT DISTINCT ON (bc.id)
        ${taskProjection(actor)}
      ${taskJoins(actor)}
      WHERE bc.id = $1::uuid
      ORDER BY bc.id, bg.guest_index NULLS LAST, bg.id NULLS LAST
      LIMIT 1
      `,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: selectResult.rows[0] || updateResult.rows[0],
      message: "Cleaning task updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating cleaning task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update cleaning task",
      },
      { status: 500 }
    );
  }
};

/* ════════════════════════════════════════════════════════════════════════════
 * Fair automatic assignment
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The decision itself is pure (src/lib/cleaning-rotation.ts). Everything here
 * is the transaction around it: read the rotation pointer under a lock, gather
 * each cleaner's share and credits, write the assignment, advance the pointer.
 */

/** Which event asked for the assignment. Only used for logging and messages. */
export type CleaningAssignmentTrigger = "booking-confirmed" | "checkout";

export type CleaningAssignmentOutcome = {
  taskId: string | null;
  /** True only when this call created the booking_cleaning row. */
  created: boolean;
  assignedCleanerId: string | null;
  /** Set when the task was deliberately left for Owner/CSR to place by hand. */
  unassignedReason: string | null;
  /** Why nothing happened, when nothing happened. */
  skipped: "already-assigned" | "already-performed" | "booking-not-eligible" | "booking-missing" | null;
  /**
   * The task was already unassigned for this same reason, so Owner/CSR have
   * been told once — a retry (e.g. the catch-up sweep) doesn't notify again.
   */
  reasonAlreadyReported?: boolean;
};

// SQL fragment: does employee `e` have another live cleaning assignment whose
// stay window overlaps this booking's? Identical to the check the manual assign
// route runs for one candidate, so automatic and manual agree on who is free —
// otherwise the rotation would pick someone the assign endpoint would reject.
const AVAILABILITY_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM booking_cleaning bc_existing
    JOIN booking b_target ON b_target.id = $2::uuid
    JOIN booking b2 ON b2.id = bc_existing.booking_id
    WHERE bc_existing.assigned_to = e.id
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
  )
`;

/**
 * Every cleaner account with the three numbers the picker needs: their rotation
 * position, their share (opportunities retained or completed) and their
 * unconsumed replacement credits. Inactive and unavailable cleaners are included
 * so the "why unassigned" reason can be specific.
 */
async function loadRotationCandidates(
  client: PoolClient,
  cleaningTaskId: string,
  bookingId: string,
): Promise<RotationCandidate[]> {
  const res = await client.query(
    `
    SELECT
      e.id::text AS id,
      (COALESCE(e.status, 'active') = 'active') AS active,
      ${AVAILABILITY_SQL} AS available,
      COALESCE(share.n, 0)::int AS share,
      COALESCE(credit.n, 0)::int AS credits
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, COUNT(*) AS n
      FROM cleaning_opportunities
      WHERE state IN ('retained', 'completed')
      GROUP BY employee_id
    ) share ON share.employee_id = e.id
    LEFT JOIN (
      SELECT employee_id, COUNT(*) AS n
      FROM cleaning_opportunities
      WHERE state = 'released' AND credit_consumed = false
      GROUP BY employee_id
    ) credit ON credit.employee_id = e.id
    WHERE e.role = 'Cleaner'
    ORDER BY e.created_at ASC, e.id ASC
    `,
    [cleaningTaskId, bookingId]
  );

  return res.rows.map((row, index) => ({
    id: String(row.id),
    order: index,
    active: Boolean(row.active),
    available: Boolean(row.available),
    share: Number(row.share ?? 0),
    credits: Number(row.credits ?? 0),
  }));
}

/**
 * Records that `employeeId` now holds `cleaningTaskId`, and spends one of their
 * replacement credits if they have any. The partial unique index on
 * cleaning_opportunities (one retained row per task) is what makes a replayed
 * call a no-op rather than a second turn.
 */
async function openOpportunity(
  client: PoolClient,
  cleaningTaskId: string,
  employeeId: string,
  method: "automatic" | "manual",
  assignedBy: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO cleaning_opportunities (booking_cleaning_id, employee_id, assignment_method, assigned_by, state)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'retained')`,
    [cleaningTaskId, employeeId, method, assignedBy]
  );

  // Spend the oldest outstanding credit, if any — this assignment IS the
  // replacement it was owed.
  await client.query(
    `UPDATE cleaning_opportunities
     SET credit_consumed = true
     WHERE id = (
       SELECT id FROM cleaning_opportunities
       WHERE employee_id = $1::uuid AND state = 'released' AND credit_consumed = false
       ORDER BY released_at ASC, created_at ASC
       LIMIT 1
     )`,
    [employeeId]
  );
}

/**
 * Hands an unperformed assignment back: the cleaner stops carrying it against
 * their share and gains one replacement credit. Only 'retained' rows are
 * touched, so running this twice for the same cancellation or reassignment
 * restores the opportunity exactly once.
 */
async function releaseOpportunity(
  client: PoolClient,
  cleaningTaskId: string,
  reason: "cancelled" | "reassigned" | "unassigned",
): Promise<string | null> {
  const res = await client.query(
    `UPDATE cleaning_opportunities
     SET state = 'released', release_reason = $2, released_at = NOW()
     WHERE booking_cleaning_id = $1::uuid AND state = 'retained'
     RETURNING employee_id::text AS employee_id`,
    [cleaningTaskId, reason]
  );
  return res.rows[0]?.employee_id ?? null;
}

/**
 * Locks in the attribution for work that was actually performed. From here the
 * opportunity is permanent: reassigning the task afterwards creates a NEW
 * opportunity for the incoming cleaner and leaves this one alone.
 */
export async function recordCleaningPerformed(cleaningTaskId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE cleaning_opportunities
       SET state = 'completed', completed_at = NOW()
       WHERE booking_cleaning_id = $1::uuid AND state = 'retained'`,
      [cleaningTaskId]
    );
  } catch (err) {
    console.error(`⚠️ Could not record performed cleaning for task ${cleaningTaskId}:`, err);
  }
}

/**
 * Manual assign / reassign, ledger included. Used by
 * /api/admin/cleaners/tasks/[id]/assign.
 *
 * - Unperformed work moving to someone else releases the outgoing cleaner's
 *   opportunity (restoring it) and opens one for the incoming cleaner.
 * - Performed work keeps its completed opportunity with whoever did the
 *   cleaning; the incoming cleaner gets their own fresh one.
 * - Re-assigning to the cleaner who already holds it changes nothing.
 */
export async function reassignCleaningTask(params: {
  cleaningTaskId: string;
  toEmployeeId: string;
  assignedBy: string | null;
  currentStatus: string;
  currentAssigneeId: string | null;
}): Promise<{ releasedFrom: string | null; newStatus: string }> {
  const { cleaningTaskId, toEmployeeId, assignedBy, currentStatus, currentAssigneeId } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialized with automatic assignment and cancellations on the rotation
    // row (always taken first), so the picker never sees half a reassignment.
    await client.query(`SELECT 1 FROM cleaning_rotation_state WHERE id = 1 FOR UPDATE`);

    let releasedFrom: string | null = null;

    if (currentAssigneeId !== toEmployeeId) {
      if (!isPerformed(currentStatus)) {
        releasedFrom = await releaseOpportunity(client, cleaningTaskId, "reassigned");
      }
      await openOpportunity(client, cleaningTaskId, toEmployeeId, "manual", assignedBy);
    }

    // Right-hand sides see the OLD row, so `assigned_to IS DISTINCT FROM $1`
    // means "this is changing hands". In-progress work that changes hands
    // restarts as Assigned under the new cleaner; work already performed
    // (Awaiting Inspection) keeps its status.
    const updated = await client.query(
      `UPDATE booking_cleaning
       SET cleaning_status = CASE
             WHEN cleaning_status = 'pending' THEN 'assigned'
             WHEN cleaning_status = 'in-progress' AND assigned_to IS DISTINCT FROM $1::uuid THEN 'assigned'
             ELSE cleaning_status
           END,
           cleaning_time_in = CASE
             WHEN cleaning_status = 'in-progress' AND assigned_to IS DISTINCT FROM $1::uuid THEN NULL
             ELSE cleaning_time_in
           END,
           assigned_to = $1::uuid,
           assignment_method = 'manual',
           assigned_by = $3::uuid,
           assigned_at = NOW(),
           unassigned_reason = NULL
       WHERE id = $2::uuid
       RETURNING cleaning_status`,
      [toEmployeeId, cleaningTaskId, assignedBy]
    );

    await client.query("COMMIT");
    return { releasedFrom, newStatus: updated.rows[0]?.cleaning_status ?? currentStatus };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A booking was cancelled (or rejected) before its cleaning was performed. The
 * assigned cleaner should not lose the opportunity over it, so it is released
 * and they go to the front of the queue for a replacement.
 *
 * Idempotent — a replayed cancellation finds nothing 'retained' to release.
 */
export async function releaseCleaningForCancelledBooking(bookingId: string): Promise<void> {
  let released: { employeeId: string; taskId: string; status: string; bookingRef: string; room: string | null } | null = null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Same lock, same order, as ensureCleaningAssignment — so a cancellation
    // and a confirmation landing together are serialized, and the picker never
    // reads a share count that is halfway through changing.
    await client.query(`SELECT 1 FROM cleaning_rotation_state WHERE id = 1 FOR UPDATE`);

    const taskRes = await client.query(
      `SELECT bc.id::text AS id, bc.cleaning_status, b.booking_id, b.room_name
       FROM booking_cleaning bc
       INNER JOIN booking b ON b.id = bc.booking_id
       WHERE bc.booking_id = $1::uuid
       FOR UPDATE OF bc`,
      [bookingId]
    );

    const task = taskRes.rows[0];

    // Cleaning that was already performed stays credited to whoever performed
    // it — a late cancellation doesn't erase finished work.
    if (task && !isPerformed(task.cleaning_status)) {
      const releasedFrom = await releaseOpportunity(client, task.id, "cancelled");
      if (releasedFrom) {
        released = {
          employeeId: releasedFrom,
          taskId: task.id,
          status: task.cleaning_status,
          bookingRef: task.booking_id,
          room: task.room_name ?? null,
        };
      }
      // Vacate the seat too. The ledger keeps who held it (the released row);
      // leaving assigned_to set would mean a booking re-approved later still
      // "belongs" to a cleaner whose opportunity no longer counts — instead it
      // goes back through the fair rotation like any new confirmation.
      await client.query(
        `UPDATE booking_cleaning
         SET assigned_to = NULL, cleaning_status = 'pending', assignment_method = NULL,
             assigned_by = NULL, assigned_at = NULL, cleaning_time_in = NULL,
             unassigned_reason = 'Booking cancelled before cleaning.'
         WHERE id = $1::uuid`,
        [task.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`⚠️ releaseCleaningForCancelledBooking failed for ${bookingId}:`, err);
    return;
  } finally {
    client.release();
  }

  if (!released) return;

  // Best-effort, after the connection is back in the pool.
  await logCleaningHistory(
    released.taskId,
    released.status,
    "pending",
    null,
    `Booking ${released.bookingRef} cancelled before cleaning — opportunity restored, replacement priority given`
  );

  await createNotificationForUser(released.employeeId, {
    title: "Cleaning Cancelled",
    message: `${released.room ?? "A room"} (Booking: ${released.bookingRef}) was cancelled before you cleaned it. You keep your place in the rotation and get the next available room.`,
    notificationType: "cleaning_cancelled",
  }).catch((err) => console.error("⚠️ Cancellation notice failed:", err));
}

/**
 * Creates (or reuses) the cleaning task for a booking and gives it to the next
 * cleaner in the fair rotation.
 *
 * Called when a booking is CONFIRMED — `approved` is the status this codebase
 * stores for a confirmed booking — so the cleaner sees the work coming instead
 * of it materialising at checkout. Also called again at checkout as a safety
 * net, where it only has anything to do if the confirmation never ran or left
 * the task unassigned.
 *
 * What makes it safe to call repeatedly:
 *   - booking_cleaning has UNIQUE(booking_id), so the row is created at most once;
 *   - a task that already has a live opportunity is left completely alone —
 *     manual assignment, work in progress and rotation position all survive;
 *   - the rotation pointer row is locked FOR UPDATE for the whole transaction,
 *     so two confirmations landing together serialize instead of both reading
 *     the same "next" cleaner.
 *
 * The task's `scheduled_for` is the guest's checkout, and /tasks/[id]/start
 * refuses to begin before it — an assignment issued at confirmation cannot turn
 * into cleaning while the guest is still in the room.
 */
export async function ensureCleaningAssignment(
  bookingId: string,
  trigger: CleaningAssignmentTrigger,
): Promise<CleaningAssignmentOutcome> {
  const outcome: CleaningAssignmentOutcome = {
    taskId: null,
    created: false,
    assignedCleanerId: null,
    unassignedReason: null,
    skipped: null,
  };

  let previousReason: string | null = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locked first, always, so concurrent confirmations queue here rather than
    // deadlocking against each other further down.
    const rotationRes = await client.query(
      `SELECT last_assigned_employee_id::text AS last_id FROM cleaning_rotation_state WHERE id = 1 FOR UPDATE`
    );
    const lastAssignedId: string | null = rotationRes.rows[0]?.last_id ?? null;

    const bookingRes = await client.query(
      `SELECT b.id::text AS id, b.status, b.booking_id, b.room_name,
              ${checkoutAtSql("b")} AS scheduled_for
       FROM booking b WHERE b.id = $1::uuid`,
      [bookingId]
    );

    if (bookingRes.rows.length === 0) {
      outcome.skipped = "booking-missing";
      await client.query("COMMIT");
      return outcome;
    }

    const booking = bookingRes.rows[0];
    if (["cancelled", "rejected", "declined"].includes(String(booking.status))) {
      outcome.skipped = "booking-not-eligible";
      await client.query("COMMIT");
      return outcome;
    }

    const insertRes = await client.query(
      `INSERT INTO booking_cleaning (booking_id, cleaning_status, scheduled_for, confirmed_processed_at, checkout_processed_at)
       VALUES ($1::uuid, 'pending', $2, $3, $4)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id::text AS id`,
      [
        bookingId,
        booking.scheduled_for,
        trigger === "booking-confirmed" ? new Date() : null,
        trigger === "checkout" ? new Date() : null,
      ]
    );

    if (insertRes.rows.length > 0) {
      outcome.taskId = insertRes.rows[0].id;
      outcome.created = true;
    } else {
      // A record already exists — created at booking time, by the confirmation,
      // or by a previous run of this same function. Reuse it; never replace it.
      const existing = await client.query(
        `SELECT bc.id::text AS id, bc.cleaning_status, bc.assigned_to::text AS assigned_to,
                bc.unassigned_reason,
                EXISTS (
                  SELECT 1 FROM cleaning_opportunities o
                  WHERE o.booking_cleaning_id = bc.id AND o.state <> 'released'
                ) AS has_opportunity
         FROM booking_cleaning bc
         WHERE bc.booking_id = $1::uuid
         FOR UPDATE OF bc`,
        [bookingId]
      );

      if (existing.rows.length === 0) {
        // Neither inserted nor found: another transaction is mid-flight on the
        // same booking. It holds the rotation lock we're behind, so by the time
        // we get here it has committed — but if it somehow hasn't, doing nothing
        // is correct: the task is that transaction's to place.
        outcome.skipped = "already-assigned";
        await client.query("COMMIT");
        return outcome;
      }

      const row = existing.rows[0];
      outcome.taskId = row.id;
      previousReason = row.unassigned_reason ?? null;

      // The cleaning was already done (including legacy 'cleaned'/'inspected'
      // rows that never had an assignee) — there is nothing to hand out, and
      // re-assigning it would send a cleaner back to a finished room.
      if (isPerformed(String(row.cleaning_status))) {
        outcome.skipped = "already-performed";
        await client.query("COMMIT");
        return outcome;
      }

      // Already placed — leave manual assignments, in-flight work and finished
      // work exactly as they are, and don't spend a rotation turn.
      if (row.assigned_to || row.has_opportunity) {
        outcome.skipped = "already-assigned";
        outcome.assignedCleanerId = row.assigned_to ?? null;
        await client.query("COMMIT");
        return outcome;
      }

      await client.query(
        `UPDATE booking_cleaning
         SET scheduled_for = COALESCE(scheduled_for, $2),
             confirmed_processed_at = COALESCE(confirmed_processed_at, $3),
             checkout_processed_at = COALESCE(checkout_processed_at, $4)
         WHERE id = $1::uuid`,
        [
          row.id,
          booking.scheduled_for,
          trigger === "booking-confirmed" ? new Date() : null,
          trigger === "checkout" ? new Date() : null,
        ]
      );
    }

    const taskId = outcome.taskId as string;
    const candidates = await loadRotationCandidates(client, taskId, bookingId);
    const pick = pickNextCleaner(candidates, lastAssignedId);

    if (!pick.cleaner) {
      // Left for Owner/CSR, with the reason recorded on the task. No early
      // return: the notification below is how they find out, and it must fire.
      outcome.unassignedReason = pick.reason;
      outcome.reasonAlreadyReported = previousReason === pick.reason;
      await client.query(
        `UPDATE booking_cleaning SET unassigned_reason = $2 WHERE id = $1::uuid`,
        [taskId, pick.reason]
      );
    } else {
      outcome.assignedCleanerId = pick.cleaner.id;

      await client.query(
        `UPDATE booking_cleaning
         SET assigned_to = $1::uuid, cleaning_status = 'assigned',
             assignment_method = 'automatic', assigned_by = NULL, assigned_at = NOW(),
             unassigned_reason = NULL
         WHERE id = $2::uuid`,
        [pick.cleaner.id, taskId]
      );

      await openOpportunity(client, taskId, pick.cleaner.id, "automatic", null);

      // The pointer advances only on a successful automatic assignment — a
      // manual assign or a "nobody eligible" outcome never moves it, so no
      // turn is lost.
      await client.query(
        `UPDATE cleaning_rotation_state SET last_assigned_employee_id = $1::uuid, updated_at = NOW() WHERE id = 1`,
        [pick.cleaner.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`⚠️ ensureCleaningAssignment failed for booking ${bookingId} (${trigger}):`, err);
    return outcome;
  } finally {
    client.release();
  }

  // Notifications and history are best-effort and outside the transaction — a
  // failure here must not undo a committed assignment.
  await notifyAssignmentOutcome(bookingId, trigger, outcome).catch((err) =>
    console.error(`⚠️ Assignment notification failed for booking ${bookingId}:`, err)
  );

  return outcome;
}

async function notifyAssignmentOutcome(
  bookingId: string,
  trigger: CleaningAssignmentTrigger,
  outcome: CleaningAssignmentOutcome,
): Promise<void> {
  if (!outcome.taskId || outcome.skipped) return;

  const bookingRes = await pool.query(
    `SELECT booking_id, room_name, check_out_date FROM booking WHERE id = $1::uuid`,
    [bookingId]
  );
  const haven = bookingRes.rows[0]?.room_name ?? "a room";
  const friendlyBookingId = bookingRes.rows[0]?.booking_id ?? bookingId;
  const checkoutDate = bookingRes.rows[0]?.check_out_date
    ? new Date(bookingRes.rows[0].check_out_date).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
      })
    : "checkout";

  const triggerLabel = trigger === "booking-confirmed" ? "booking confirmed" : "guest checked out";

  if (outcome.unassignedReason) {
    if (outcome.reasonAlreadyReported) return;
    await logCleaningHistory(
      outcome.taskId,
      "pending",
      "pending",
      null,
      `Left unassigned (${triggerLabel}): ${outcome.unassignedReason}`
    );
    await createNotificationsForRoles(["Owner", "CSR"], {
      title: "Cleaning Task Needs Manual Assignment",
      message: `${haven} (Booking: ${friendlyBookingId}, cleaning due ${checkoutDate}) could not be auto-assigned. ${outcome.unassignedReason} Please assign a cleaner manually.`,
      notificationType: "cleaning_unassigned",
    });
    return;
  }

  if (outcome.assignedCleanerId) {
    await logCleaningHistory(
      outcome.taskId,
      "pending",
      "assigned",
      null,
      `Auto-assigned by fair rotation (${triggerLabel})`
    );
    await createNotificationForUser(outcome.assignedCleanerId, {
      title: "New Cleaning Assignment",
      message: `You have been assigned to clean ${haven} for booking ${friendlyBookingId}. Cleaning starts after the guest checks out on ${checkoutDate}.`,
      notificationType: "cleaning_assignment",
    });
  }
}

/**
 * Catch-up sweep, run by /api/cron/assign-cleaning every ~15 minutes.
 *
 * Automatic assignment normally fires the moment a booking becomes Confirmed.
 * This picks up everything that moment missed:
 *   - bookings confirmed before automatic assignment existed;
 *   - tasks left unassigned because no cleaner was eligible at the time (a
 *     cleaner reactivated since, or a clashing stay was cancelled);
 *   - a confirmation whose after-response hook didn't complete.
 *
 * Only live stays are considered (confirmed / on-going / checked-in), never
 * past completed ones — handing cleaners weeks-old history would be noise.
 * Earliest checkout first, so the most urgent room takes the next turn. Each
 * booking goes through ensureCleaningAssignment, so the same fair rotation,
 * idempotency and locking apply as at confirmation.
 */
export async function sweepUnassignedCleaning(limit = 50): Promise<{
  checked: number;
  assigned: number;
  stillUnassigned: number;
}> {
  const res = await pool.query(
    `SELECT b.id::text AS id
     FROM booking b
     LEFT JOIN booking_cleaning bc ON bc.booking_id = b.id
     WHERE b.status IN ('approved', 'confirmed', 'on-going', 'checked-in')
       AND (bc.id IS NULL
            OR (bc.assigned_to IS NULL
                AND bc.cleaning_status NOT IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')))
     ORDER BY ${checkoutAtSql("b")} ASC
     LIMIT $1`,
    [limit]
  );

  let assigned = 0;
  let stillUnassigned = 0;
  for (const row of res.rows) {
    const outcome = await ensureCleaningAssignment(row.id, "booking-confirmed");
    if (outcome.assignedCleanerId && !outcome.skipped) assigned++;
    else if (outcome.unassignedReason) stillUnassigned++;
  }
  return { checked: res.rows.length, assigned, stillUnassigned };
}

/**
 * Checkout safety net. The assignment normally happens when the booking is
 * confirmed; this only has work to do if that never ran, or if it left the task
 * unassigned because no cleaner was eligible at the time.
 */
export async function processCheckoutCleaning(bookingId: string): Promise<void> {
  await ensureCleaningAssignment(bookingId, "checkout");
}

/**
 * Keeps the cleaning task's due time in step with the booking after a date
 * change. Work that has already started is left alone — moving its due time
 * would only confuse the record of when it actually happened.
 */
export async function syncCleaningSchedule(bookingId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE booking_cleaning bc
       SET scheduled_for = ${checkoutAtSql("b")}
       FROM booking b
       WHERE b.id = bc.booking_id
         AND bc.booking_id = $1::uuid
         AND bc.cleaning_status IN ('pending', 'assigned')`,
      [bookingId]
    );
  } catch (err) {
    console.error(`⚠️ syncCleaningSchedule failed for booking ${bookingId}:`, err);
  }
}

/**
 * The single entry point every booking-status writer calls after it commits,
 * so the cleaning workflow reacts the same way whichever screen changed the
 * booking (admin status change, full booking edit, payment approval, guest
 * cancellation):
 *   approved             → create/reuse the task and assign it fairly
 *   completed            → checkout safety net (assign only if still unplaced)
 *   cancelled / rejected → release the unperformed opportunity, with priority
 *
 * `bookingId` may be the UUID or the friendly booking_id. Never throws.
 */
export async function onBookingStatusChanged(bookingId: string, status: string | null | undefined): Promise<void> {
  if (!status) return;
  try {
    const res = await pool.query(
      `SELECT id::text AS id FROM booking WHERE id::text = $1 OR booking_id = $1 LIMIT 1`,
      [bookingId]
    );
    const uuid: string | undefined = res.rows[0]?.id;
    if (!uuid) return;

    if (status === "approved") {
      await ensureCleaningAssignment(uuid, "booking-confirmed");
    } else if (status === "completed") {
      await ensureCleaningAssignment(uuid, "checkout");
    } else if (status === "cancelled" || status === "rejected") {
      await releaseCleaningForCancelledBooking(uuid);
    }
  } catch (err) {
    console.error(`⚠️ onBookingStatusChanged(${bookingId}, ${status}) failed:`, err);
  }
}

// Exported for the "why is this unassigned" copy on the admin task list, so the
// UI and the stored reason can't drift apart.
export { UNASSIGNED_REASON };
