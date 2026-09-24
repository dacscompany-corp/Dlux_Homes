import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { createNotificationForUser, createNotificationsForRoles } from "@/backend/utils/notificationHelper";

export interface CleaningTask {
  cleaning_id: string;
  booking_id: string;
  booking_uuid: string;
  haven: string;
  haven_id: string | null;
  guest_first_name: string;
  guest_last_name: string;
  guest_email: string;
  guest_phone: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
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
  deposit_status: string | null;
  security_deposit: number | null;
  deposit_proof_url: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  down_payment: number | null;
  remaining_balance: number | null;
  open_issue_count: number;
}

// GET All Cleaning Tasks
export const getAllCleaningTasks = async (
  req: NextRequest
): Promise<NextResponse> => {
  try {
    console.error("🔍🔍🔍 CONTROLLER: getAllCleaningTasks called 🔍🔍🔍");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    console.error("📋 Status filter:", status);

    // First, let's check if tables exist and have data
    try {
      console.error("🗄️ Checking database tables...");
      
      // Check if booking table has data
      const bookingCount = await pool.query("SELECT COUNT(*) as count FROM booking");
      console.error("📊 Booking table count:", bookingCount.rows[0].count);
      
      // Check if booking_cleaning table has data
      const cleaningCount = await pool.query("SELECT COUNT(*) as count FROM booking_cleaning");
      console.error("🧹 Cleaning table count:", cleaningCount.rows[0].count);
      
      // Check if booking_guests table has data
      const guestsCount = await pool.query("SELECT COUNT(*) as count FROM booking_guests");
      console.error("👥 Guests table count:", guestsCount.rows[0].count);
      
      // Check if employees table has data
      const employeesCount = await pool.query("SELECT COUNT(*) as count FROM employees");
      console.error("👷 Employees table count:", employeesCount.rows[0].count);
      
      // If no cleaning tasks exist, create some sample data
      if (parseInt(cleaningCount.rows[0].count) === 0 && parseInt(bookingCount.rows[0].count) > 0) {
        console.error("📝 No cleaning tasks found, creating sample data...");
        
        // Get multiple sample bookings and create cleaning tasks for them
        const sampleBookings = await pool.query(`
          SELECT b.id, b.booking_id, b.room_name 
          FROM booking b 
          LEFT JOIN booking_cleaning bc ON b.id = bc.booking_id 
          WHERE bc.id IS NULL 
          LIMIT 5
        `);
        
        console.error("📋 Found sample bookings without cleaning tasks:", sampleBookings.rows.length);
        
        for (const booking of sampleBookings.rows) {
          console.error("📋 Creating cleaning task for booking:", booking);
          
          // Create a sample cleaning task
          const insertCleaning = await pool.query(
            `INSERT INTO booking_cleaning (booking_id, cleaning_status, assigned_to)
             VALUES ($1, 'pending', NULL)
             ON CONFLICT (booking_id) DO NOTHING
             RETURNING *`,
            [booking.id]
          );
          console.error("✅ Created sample cleaning task:", insertCleaning.rows[0]);
        }
      }
    } catch (dbCheckError) {
      console.error("❌ Error checking database:", dbCheckError);
    }

    let query = `
      SELECT * FROM (
        SELECT DISTINCT ON (bc.id)
          bc.id::text as cleaning_id,
          b.booking_id,
          b.id::text as booking_uuid,
          b.room_name as haven,
          h.uuid_id::text as haven_id,
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
          sd.deposit_status,
          sd.amount as security_deposit,
          sd.payment_proof_url as deposit_proof_url,
          bp.id::text as booking_payment_id,
          bp.total_amount,
          bp.amount_paid,
          bp.down_payment,
          GREATEST(COALESCE(bp.total_amount, 0) - COALESCE(bp.amount_paid, 0), 0) AS remaining_balance,
          (
            SELECT COUNT(*)::int FROM report_issue ri
            WHERE ri.booking_cleaning_id = bc.id AND ri.status NOT IN ('Resolved', 'Closed')
          ) AS open_issue_count
        FROM booking_cleaning bc
        INNER JOIN booking b ON bc.booking_id = b.id
        LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
        LEFT JOIN booking_guests bg ON bg.booking_id = b.id
        LEFT JOIN employees e ON bc.assigned_to::text = e.id::text
        LEFT JOIN employees ab ON bc.assigned_by = ab.id
        LEFT JOIN booking_security_deposits sd ON sd.booking_id = b.id
        LEFT JOIN booking_payments bp ON bp.booking_id = b.id
        WHERE b.status NOT IN ('rejected', 'cancelled')
    `;
    const values: string[] = [];

    if (status) {
      query += ` AND bc.cleaning_status = $1`;
      values.push(status);
    }

    query += " ORDER BY bc.id, bg.id NULLS LAST) AS tasks ORDER BY check_out_date DESC, check_out_time DESC";

    console.error("🗄️ Executing query...");
    console.error("📊 Query values:", values);

    const result = await pool.query(query, values);
    console.error(`✅ Retrieved ${result.rows.length} cleaning tasks`);
    console.error("📋 Sample data:", result.rows.slice(0, 2));

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("❌❌❌ Error getting cleaning tasks ❌❌❌:", error);
    console.error("🔍 Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get cleaning tasks",
        details: String(error)
      },
      { status: 500 }
    );
  }
};

// GET Single Cleaning Task by ID
export const getCleaningTaskById = async (
  req: NextRequest
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

    const query = `
      SELECT DISTINCT ON (bc.id)
        bc.id::text as cleaning_id,
        b.booking_id,
        b.room_name as haven,
        h.uuid_id::text as haven_id,
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
        ab.first_name as assigned_by_first_name,
        ab.last_name as assigned_by_last_name,
        e.first_name as cleaner_first_name,
        e.last_name as cleaner_last_name,
        e.employment_id as cleaner_employment_id,
        bc.cleaning_time_in,
        bc.cleaning_time_out,
        bc.cleaned_at,
        bc.inspected_at,
        bc.inspection_note
      FROM booking_cleaning bc
      INNER JOIN booking b ON bc.booking_id = b.id
      LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
      LEFT JOIN booking_guests bg ON bg.booking_id = b.id
      LEFT JOIN employees e ON bc.assigned_to::text = e.id::text
      LEFT JOIN employees ab ON bc.assigned_by = ab.id
      WHERE bc.id = $1::uuid
      ORDER BY bc.id
      LIMIT 1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.log("❌ Error getting cleaning task:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get cleaning task",
      },
      { status: 500 }
    );
  }
};

// Update Cleaning Task (assign cleaner, update status, etc.)
// Every status this workflow (and the legacy pre-inspection flow it grew out
// of) can write. Kept in one place so the DB CHECK, this validator, and the
// status/route.ts validator can all be checked against the same list.
export const VALID_CLEANING_STATUSES = [
  "pending",
  "assigned",
  "in-progress",
  "cleaned",
  "inspected",
  "awaiting-inspection",
  "ready",
];

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

export const updateCleaningTask = async (
  req: NextRequest
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
      assigned_to,
      cleaning_time_in,
      cleaning_time_out,
      cleaned_at,
      inspected_at,
      inspection_note,
      changed_by,
    } = body;

    // Validate cleaning status if provided
    if (cleaning_status) {
      if (!VALID_CLEANING_STATUSES.includes(cleaning_status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid cleaning status. Must be one of: ${VALID_CLEANING_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Read the current status before the update so the history row can
    // record the transition, not just the destination.
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

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: (string | null)[] = [];
    let paramCount = 1;

    if (cleaning_status !== undefined) {
      updateFields.push(`cleaning_status = $${paramCount}`);
      params.push(cleaning_status);
      paramCount++;
    }

    if (assigned_to !== undefined) {
      updateFields.push(`assigned_to = $${paramCount}`);
      params.push(assigned_to);
      paramCount++;
    }

    if (cleaning_time_in !== undefined) {
      updateFields.push(`cleaning_time_in = $${paramCount}`);
      params.push(cleaning_time_in);
      paramCount++;
    }

    if (cleaning_time_out !== undefined) {
      updateFields.push(`cleaning_time_out = $${paramCount}`);
      params.push(cleaning_time_out);
      paramCount++;
    }

    if (cleaned_at !== undefined) {
      updateFields.push(`cleaned_at = $${paramCount}`);
      params.push(cleaned_at);
      paramCount++;
    }

    if (inspected_at !== undefined) {
      updateFields.push(`inspected_at = $${paramCount}`);
      params.push(inspected_at);
      paramCount++;
    }

    if (inspection_note !== undefined) {
      updateFields.push(`inspection_note = $${paramCount}`);
      params.push(inspection_note);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    params.push(id);

    const updateQuery = `
      UPDATE booking_cleaning
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}::uuid
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, params);

    if (updateResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 }
      );
    }

    if (cleaning_status !== undefined && cleaning_status !== priorStatus) {
      await logCleaningHistory(
        id,
        priorStatus,
        cleaning_status,
        changed_by ?? null,
        inspection_note ?? null
      );
    }

    // Get the complete cleaning task data for response
    const selectQuery = `
      SELECT DISTINCT ON (bc.id)
        bc.id::text as cleaning_id,
        b.booking_id,
        b.id::text as booking_uuid,
        b.room_name as haven,
        h.uuid_id::text as haven_id,
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
        ab.first_name as assigned_by_first_name,
        ab.last_name as assigned_by_last_name,
        e.first_name as cleaner_first_name,
        e.last_name as cleaner_last_name,
        e.employment_id as cleaner_employment_id,
        bc.cleaning_time_in,
        bc.cleaning_time_out,
        bc.cleaned_at,
        bc.inspected_at,
        bc.inspection_note
      FROM booking_cleaning bc
      INNER JOIN booking b ON bc.booking_id = b.id
      LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
      LEFT JOIN booking_guests bg ON bg.booking_id = b.id
      LEFT JOIN employees e ON bc.assigned_to::text = e.id::text
      LEFT JOIN employees ab ON bc.assigned_by = ab.id
      WHERE bc.id = $1::uuid
      ORDER BY bc.id
      LIMIT 1
    `;

    const selectResult = await pool.query(selectQuery, [id]);

    console.log("✅ Cleaning task updated:", updateResult.rows[0]);

    return NextResponse.json({
      success: true,
      data: selectResult.rows[0] || updateResult.rows[0],
      message: "Cleaning task updated successfully",
    });
  } catch (error) {
    console.log("❌ Error updating cleaning task:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update cleaning task",
      },
      { status: 500 }
    );
  }
};

// Picks the next eligible cleaner after `afterEmployeeId` in `ordered`,
// wrapping around (A -> B -> C -> A). `ordered` is every active-role Cleaner
// in a fixed, deterministic order (by created_at, id) — NOT just the
// eligible ones — so the walk always resumes from the right point even if
// the last-assigned cleaner has since gone inactive or the eligible set has
// changed shape. Returns null if none of `ordered` is in `eligibleIds`.
function nextInRotation<T extends { id: string }>(
  ordered: T[],
  eligibleIds: Set<string>,
  afterEmployeeId: string | null
): T | null {
  if (ordered.length === 0) return null;
  const startIdx = afterEmployeeId ? ordered.findIndex((e) => e.id === afterEmployeeId) : -1;
  for (let step = 1; step <= ordered.length; step++) {
    const idx = (startIdx + step + ordered.length) % ordered.length;
    if (eligibleIds.has(ordered[idx].id)) return ordered[idx];
  }
  return null;
}

// Fires when a booking's status is set to "completed" (guest checked out).
// Idempotent: booking_cleaning has a UNIQUE(booking_id), so re-processing the
// same checkout (e.g. an admin re-saving the same status) is a no-op — it
// never touches an existing task, whether that task already has a manual
// assignment or is mid-rotation.
//
// Automatic assignment only ever fires for a BRAND NEW task (the INSERT
// below either creates the row or no-ops). An admin's manual assign/reassign
// (tasks/[id]/assign/route.ts) writes assignment_method='manual' and never
// touches the rotation pointer — so once a task is manually assigned,
// nothing here can ever overwrite it, because this function only acts on
// rows it itself just inserted.
//
// Concurrency: the rotation pointer (cleaning_rotation_state, single row) is
// locked with SELECT ... FOR UPDATE inside this same transaction, so two
// checkouts landing at the same instant serialize on that row instead of
// both picking the same "next" cleaner — the second one waits for the first
// to commit its advanced pointer, then reads the up-to-date position.
export async function processCheckoutCleaning(bookingId: string): Promise<void> {
  const client = await pool.connect();
  let cleaningTaskId: string | null = null;
  let assignedCleanerId: string | null = null;
  let noEligibleCleaner = false;

  try {
    await client.query("BEGIN");

    const insertResult = await client.query(
      `INSERT INTO booking_cleaning (booking_id, cleaning_status, checkout_processed_at)
       VALUES ($1::uuid, 'pending', NOW())
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id::text`,
      [bookingId]
    );

    if (insertResult.rows.length === 0) {
      // A cleaning record already existed for this booking (created at
      // booking time, or a prior checkout run) — leave it exactly as-is,
      // manual or automatic, and don't touch the rotation pointer.
      await client.query("COMMIT");
      return;
    }

    cleaningTaskId = insertResult.rows[0].id;

    // Lock the rotation pointer for the rest of this transaction.
    const rotationRes = await client.query(
      `SELECT last_assigned_employee_id::text FROM cleaning_rotation_state WHERE id = 1 FOR UPDATE`
    );
    const lastAssignedId: string | null = rotationRes.rows[0]?.last_assigned_employee_id ?? null;

    // Every active Cleaner, in a fixed order, plus which ones have no
    // time-conflicting assignment against THIS booking's window (mirrors the
    // overlap check tasks/[id]/assign/route.ts uses for one candidate).
    const cleanersRes = await client.query(
      `
      SELECT
        e.id::text AS id,
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
        ) AS eligible
      FROM employees e
      WHERE e.role = 'Cleaner' AND e.status = 'active'
      ORDER BY e.created_at ASC, e.id ASC
      `,
      [cleaningTaskId, bookingId]
    );

    const ordered: { id: string }[] = cleanersRes.rows.map((r) => ({ id: r.id }));
    const eligibleIds = new Set<string>(cleanersRes.rows.filter((r) => r.eligible).map((r) => r.id));
    const picked = nextInRotation(ordered, eligibleIds, lastAssignedId);

    if (!picked) {
      noEligibleCleaner = true;
      await client.query("COMMIT");
      return;
    }

    assignedCleanerId = picked.id;

    await client.query(
      `UPDATE booking_cleaning
       SET assigned_to = $1::uuid, cleaning_status = 'assigned',
           assignment_method = 'automatic', assigned_by = NULL, assigned_at = NOW()
       WHERE id = $2::uuid`,
      [assignedCleanerId, cleaningTaskId]
    );

    // Advance the pointer only now that the automatic assignment succeeded —
    // a manual assign or a "no eligible cleaner" outcome never reaches here.
    await client.query(
      `UPDATE cleaning_rotation_state SET last_assigned_employee_id = $1::uuid, updated_at = NOW() WHERE id = 1`,
      [assignedCleanerId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`⚠️ processCheckoutCleaning failed for booking ${bookingId}:`, err);
    return;
  } finally {
    client.release();
  }

  // Everything below is best-effort notification, outside the transaction —
  // a failure here must not undo the committed assignment.
  if (!cleaningTaskId) return;

  try {
    await logCleaningHistory(
      cleaningTaskId,
      "pending",
      noEligibleCleaner ? "pending" : "assigned",
      null,
      noEligibleCleaner ? "No eligible cleaner in rotation — left unassigned" : "Auto-assigned via round-robin"
    );

    const bookingRes = await pool.query(
      `SELECT booking_id, room_name FROM booking WHERE id = $1::uuid`,
      [bookingId]
    );
    const haven = bookingRes.rows[0]?.room_name ?? "a room";
    const friendlyBookingId = bookingRes.rows[0]?.booking_id ?? bookingId;

    if (noEligibleCleaner) {
      console.warn(`⚠️ No eligible cleaner for checkout cleaning task ${cleaningTaskId} — left unassigned for manual assignment`);
      await createNotificationsForRoles(["Owner", "CSR"], {
        title: "Cleaning Task Needs Manual Assignment",
        message: `No eligible cleaner was available to auto-assign ${haven} (Booking: ${friendlyBookingId}). Please assign a cleaner manually.`,
        notificationType: "cleaning_unassigned",
      });
      return;
    }

    if (assignedCleanerId) {
      await createNotificationForUser(assignedCleanerId, {
        title: "New Cleaning Assignment",
        message: `You have been assigned to clean ${haven} for booking ${friendlyBookingId}. Please check your cleaning tasks.`,
        notificationType: "cleaning_assignment",
      });
    }
  } catch (err) {
    console.error(`⚠️ Post-assignment notification failed for cleaning task ${cleaningTaskId}:`, err);
  }
}
