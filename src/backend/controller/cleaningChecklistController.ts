import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import {
  evaluateChecklistGate,
  type GateResult,
  type GateTask,
} from "@/lib/cleaning-checklist-gate";

/**
 * Cleaning Checklist Controller
 *
 * Provides endpoints for:
 *  - GET  /api/admin/cleaners/checklist?haven_id=...
 *  - PATCH /api/admin/cleaners/checklist/tasks/[taskId]
 *  - POST  /api/admin/cleaners/checklist/save
 *  - POST  /api/admin/cleaners/checklist/submit
 */

/* ---------------------------
 * Default checklist template
 * --------------------------- */
const DEFAULT_CHECKLIST_TEMPLATE: { category: string; tasks: string[] }[] = [
  {
    category: "Bedroom",
    tasks: [
      "Make bed and change linens",
      "Dust furniture and surfaces",
      "Vacuum floor and rugs",
      "Clean mirrors and windows",
      "Empty trash bin",
    ],
  },
  {
    category: "Bathroom",
    tasks: [
      "Clean toilet, sink, and shower",
      "Replace towels and toiletries",
      "Mop floor",
      "Clean mirror",
      "Restock supplies",
    ],
  },
  {
    category: "Kitchen",
    tasks: [
      "Clean countertops and sink",
      "Wipe down appliances",
      "Clean microwave inside and out",
      "Mop floor",
      "Take out trash and recycling",
    ],
  },
  {
    category: "Living Room",
    tasks: [
      "Vacuum sofa and cushions",
      "Dust all surfaces",
      "Clean TV and entertainment center",
      "Vacuum or mop floor",
      "Arrange furniture and decor",
    ],
  },
  {
    category: "General",
    tasks: [
      "Check all light bulbs",
      "Wipe down door handles",
      "Check smoke detector",
      "Air out the unit",
      "Final walkthrough inspection",
    ],
  },
];

/* ---------------------------
 * Helper: group tasks by category
 * --------------------------- */

type TaskRow = {
  id: string;
  checklist_id: string;
  category: string;
  task_description: string;
  completed: boolean;
  display_order?: number;
  photo_url?: string | null;
};

function groupTasksByCategory(rows: TaskRow[]) {
  const categoriesMap: Record<
    string,
    {
      category: string;
      tasks: { id: string; task: string; completed: boolean; photo_url: string | null }[];
    }
  > = {};

  rows.forEach((row: TaskRow) => {
    if (!categoriesMap[row.category]) {
      categoriesMap[row.category] = { category: row.category, tasks: [] };
    }
    categoriesMap[row.category].tasks.push({
      id: String(row.id),
      task: String(row.task_description),
      completed: !!row.completed,
      // The proof photo for this exact task, so the portals can show what's
      // attached and gate submission without a second round trip.
      photo_url: row.photo_url ? String(row.photo_url) : null,
    });
  });

  // Preserve insertion order of categories as they appeared
  return Object.values(categoriesMap);
}

// One query for a checklist's tasks, photo proof included. Photos are joined on
// task_id (2026-09-28 migration) — before that they were matched by storing the
// task's text in a column called `category`, which broke whenever admin edited
// the wording.
const CHECKLIST_TASKS_QUERY = `
  SELECT t.id, t.checklist_id, t.category, t.task_description, t.completed, t.display_order,
         p.image_url AS photo_url
  FROM cleaning_tasks t
  LEFT JOIN cleaning_checklist_photos p
    ON p.task_id = t.id AND p.checklist_id = t.checklist_id
  WHERE t.checklist_id = $1
  ORDER BY t.display_order ASC, t.created_at ASC
`;

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: TaskRow[] }> };

async function fetchChecklistTasks(db: Queryable, checklistId: string): Promise<TaskRow[]> {
  const result = await db.query(CHECKLIST_TASKS_QUERY, [checklistId]);
  return result.rows;
}

/**
 * Turns a checklist's rows into the shape the shared gate reasons about.
 * Exported so the complete-cleaning route and the submit endpoint apply exactly
 * the same rule, rather than each re-implementing "is this checklist finished".
 */
export async function loadChecklistGateTasks(checklistId: string): Promise<GateTask[]> {
  const rows = await fetchChecklistTasks(pool, checklistId);
  return rows.map((row) => ({
    id: String(row.id),
    category: String(row.category ?? ""),
    task: String(row.task_description ?? ""),
    completed: !!row.completed,
    hasPhoto: !!row.photo_url,
  }));
}

/**
 * The checklist belonging to one cleaning assignment: matched on the
 * assignment's (haven, booking) pair, preferring an active checklist over a
 * completed one — the same lookup getChecklistByHaven does, so the gate always
 * verifies the checklist the cleaner was actually working in.
 */
export async function findAssignmentChecklist(
  cleaningTaskId: string,
): Promise<{ id: string; status: string } | null> {
  const taskRes = await pool.query(
    `SELECT b.id::text AS booking_uuid, h.uuid_id::text AS haven_id
     FROM booking_cleaning bc
     INNER JOIN booking b ON bc.booking_id = b.id
     LEFT JOIN havens h ON REPLACE(LOWER(h.haven_name), 'room', 'haven') = REPLACE(LOWER(b.room_name), 'room', 'haven')
     WHERE bc.id = $1::uuid`,
    [cleaningTaskId],
  );

  const task = taskRes.rows[0];
  if (!task?.haven_id || !task?.booking_uuid) return null;

  const checklistRes = await pool.query(
    `SELECT id::text AS id, status FROM cleaning_checklists
     WHERE haven_id = $1 AND booking_id = $2::uuid
     ORDER BY CASE WHEN status != 'completed' THEN 0 ELSE 1 END ASC, created_at DESC
     LIMIT 1`,
    [task.haven_id, task.booking_uuid],
  );

  return checklistRes.rows[0] ?? null;
}

/**
 * The single server-side answer to "may this assignment leave In Progress?".
 * Fails a missing checklist as loudly as an unfinished one — a room with no
 * checklist at all used to sail straight through to inspection.
 */
export async function verifyAssignmentChecklist(
  cleaningTaskId: string,
): Promise<{ checklistId: string | null; gate: GateResult }> {
  const checklist = await findAssignmentChecklist(cleaningTaskId);
  if (!checklist) {
    return { checklistId: null, gate: evaluateChecklistGate([]) };
  }
  const tasks = await loadChecklistGateTasks(checklist.id);
  return { checklistId: checklist.id, gate: evaluateChecklistGate(tasks) };
}

/* ---------------------------
 * GET: Get or create checklist for a haven
 * Endpoint: GET /api/admin/cleaners/checklist?haven_id=...
 * --------------------------- */
export const getChecklistByHaven = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const havenId = searchParams.get("haven_id");
    const bookingId = searchParams.get("booking_id");

    if (!havenId) {
      return NextResponse.json(
        { success: false, error: "haven_id is required" },
        { status: 400 },
      );
    }

    // Ensure the haven exists
    const havenCheck = await pool.query(
      `SELECT uuid_id FROM havens WHERE uuid_id = $1`,
      [havenId],
    );
    if (havenCheck.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Haven not found" },
        { status: 404 },
      );
    }

    // Build query scoped to this booking when booking_id is provided,
    // otherwise fall back to the old haven-only lookup for direct tab navigation.
    // Include completed checklists so a completed checklist is returned rather
    // than creating a blank new one when all tasks have been checked off.
    // Prefer in-progress checklists over completed ones so active work is shown first.
    const checklistWhere = bookingId
      ? `WHERE haven_id = $1 AND booking_id = $2::uuid`
      : `WHERE haven_id = $1`;
    const checklistQueryParams: string[] = bookingId ? [havenId, bookingId] : [havenId];

    // Prefer an active (non-completed) checklist; fall back to the most recent
    // completed one so the page shows the right state instead of creating a new blank checklist.
    const checklistResult = await pool.query(
      `SELECT id, haven_id, booking_id, status, completed_at, created_at, updated_at
       FROM cleaning_checklists
       ${checklistWhere}
       ORDER BY
         CASE WHEN status != 'completed' THEN 0 ELSE 1 END ASC,
         created_at DESC
       LIMIT 1`,
      checklistQueryParams,
    );

    // If checklist exists, fetch tasks and return grouped result
    if (checklistResult.rows.length > 0) {
      const checklist = checklistResult.rows[0];
      const categories = groupTasksByCategory(await fetchChecklistTasks(pool, checklist.id));

      return NextResponse.json({
        success: true,
        data: {
          checklist: {
            id: checklist.id,
            haven_id: checklist.haven_id,
            status: checklist.status,
            completed_at: checklist.completed_at,
            categories,
          },
        },
      });
    }

    // No checklist found -> create a new one using default template
    // We serialize creation using an advisory lock on the haven to avoid races
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Acquire an advisory lock derived from the haven_id hash to serialize
      // checklist creation for the same haven. Using an xact lock ensures the
      // lock is released at transaction end.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
        havenId,
      ]);

      // Re-check if a checklist was created while we waited for the lock
      const recheckRes = await client.query(
        `SELECT id, haven_id, booking_id, status, completed_at, created_at, updated_at
         FROM cleaning_checklists
         ${checklistWhere}
         ORDER BY
           CASE WHEN status != 'completed' THEN 0 ELSE 1 END ASC,
           created_at DESC
         LIMIT 1`,
        checklistQueryParams,
      );

      if (recheckRes.rows.length > 0) {
        // Another request created it while we were waiting for the lock -
        // return that existing checklist.
        await client.query("COMMIT");

        const existing = recheckRes.rows[0];
        const categories = groupTasksByCategory(await fetchChecklistTasks(client, existing.id));

        return NextResponse.json({
          success: true,
          data: {
            checklist: {
              id: existing.id,
              haven_id: existing.haven_id,
              status: existing.status,
              completed_at: existing.completed_at,
              categories,
            },
          },
        });
      }

      // Insert a new checklist (we hold the lock so this should not conflict)
      const createChecklistRes = await client.query(
        `INSERT INTO cleaning_checklists (haven_id, booking_id, status, created_at, updated_at)
         VALUES ($1, $2::uuid, 'pending', timezone('Asia/Manila', NOW()), timezone('Asia/Manila', NOW()))
         RETURNING *`,
        [havenId, bookingId ?? null],
      );

      const checklistId = createChecklistRes.rows[0].id;

      // Insert tasks using display_order to preserve ordering
      let order = 1;
      for (const group of DEFAULT_CHECKLIST_TEMPLATE) {
        for (const taskText of group.tasks) {
          await client.query(
            `INSERT INTO cleaning_tasks (checklist_id, category, task_description, completed, display_order, created_at, updated_at)
             VALUES ($1, $2, $3, false, $4, timezone('Asia/Manila', NOW()), timezone('Asia/Manila', NOW()))`,
            [checklistId, group.category, taskText, order],
          );
          order++;
        }
      }

      await client.query("COMMIT");

      // Fetch inserted tasks to return
      const categories = groupTasksByCategory(await fetchChecklistTasks(client, checklistId));

      return NextResponse.json({
        success: true,
        data: {
          checklist: {
            id: checklistId,
            haven_id: havenId,
            status: "pending",
            categories,
          },
        },
      });
    } catch (err) {
      // If something unexpected still caused a unique-violation, attempt to
      // recover by returning the existing checklist instead of failing hard.
      await client.query("ROLLBACK");

      type PgError = { code?: string | number; constraint?: string };
      const pgErr = err as PgError;

      if (
        pgErr &&
        (String(pgErr.code) === "23505" ||
          pgErr.constraint === "uniq_active_checklist_per_haven" ||
          pgErr.constraint === "uniq_active_checklist_per_haven_booking" ||
          pgErr.constraint === "uniq_active_checklist_per_haven_legacy")
      ) {
        try {
          const existingRes = await client.query(
            `SELECT id, haven_id, booking_id, status, completed_at, created_at, updated_at
             FROM cleaning_checklists
             ${checklistWhere}
             ORDER BY
               CASE WHEN status != 'completed' THEN 0 ELSE 1 END ASC,
               created_at DESC
             LIMIT 1`,
            checklistQueryParams,
          );

          if (existingRes.rows.length > 0) {
            const existing = existingRes.rows[0];
            const categories = groupTasksByCategory(await fetchChecklistTasks(client, existing.id));

            return NextResponse.json({
              success: true,
              data: {
                checklist: {
                  id: existing.id,
                  haven_id: existing.haven_id,
                  status: existing.status,
                  completed_at: existing.completed_at,
                  categories,
                },
              },
            });
          }
        } catch (innerErr) {
          const innerMessage =
            innerErr instanceof Error ? innerErr.message : String(innerErr);
          console.error(
            "Error while resolving unique-violation race:",
            innerMessage,
          );
          // fall through to generic error below
        }
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error("Error creating default checklist:", message);
      return NextResponse.json(
        { success: false, error: message || "Failed to create checklist" },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error getting checklist:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to get checklist" },
      { status: 500 },
    );
  }
};

/* ---------------------------
 * PATCH: Update a single task (toggle completion)
 * Endpoint: PATCH /api/admin/cleaners/checklist/tasks/[taskId]
 * --------------------------- */
export const updateTask = async (
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> => {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "Task ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    if (typeof body.completed !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Field 'completed' (boolean) is required" },
        { status: 400 },
      );
    }

    // Update task
    const updateRes = await pool.query(
      `UPDATE cleaning_tasks
       SET completed = $1, updated_at = timezone('Asia/Manila', NOW())
       WHERE id = $2
       RETURNING id, checklist_id, category, task_description, completed`,
      [body.completed, taskId],
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 },
      );
    }

    const updatedTask = updateRes.rows[0];

    // Update checklist status accordingly:
    // - If no incomplete tasks remain -> completed (and set completed_at)
    // - Otherwise -> in_progress
    const incompleteCountRes = await pool.query(
      `SELECT COUNT(*)::int AS incomplete_count
       FROM cleaning_tasks
       WHERE checklist_id = $1
       AND completed = false`,
      [updatedTask.checklist_id],
    );

    let incompleteCount = parseInt(
      incompleteCountRes.rows[0]?.incomplete_count || "0",
      10,
    );

    // Helper: set checklist status safely and attempt recovery if a unique
    // constraint race is encountered (duplicate active checklists).
    async function setChecklistStatusSafely(
      checklistId: string,
      desiredStatus: "completed" | "in_progress",
    ) {
      try {
        if (desiredStatus === "completed") {
          await pool.query(
            `UPDATE cleaning_checklists
             SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW())
             WHERE id = $1`,
            [checklistId],
          );
        } else {
          await pool.query(
            `UPDATE cleaning_checklists
             SET status = 'in_progress', updated_at = timezone('Asia/Manila', NOW())
             WHERE id = $1`,
            [checklistId],
          );
        }
      } catch (err) {
        const pgErr = err as { code?: string | number; constraint?: string };
        const isUniqueViolation =
          String(pgErr?.code) === "23505" ||
          pgErr?.constraint === "uniq_active_checklist_per_haven" ||
          pgErr?.constraint === "uniq_active_checklist_per_haven_booking" ||
          pgErr?.constraint === "uniq_active_checklist_per_haven_legacy";

        if (!isUniqueViolation) {
          // Not the unique-violation we're handling here - surface the error
          throw err;
        }

        // Attempt to resolve the duplicate-active-checklist situation:
        // 1) Find haven for the checklist
        // 2) Find the latest active checklist for that haven
        // 3) Move the task to the latest active checklist (if different)
        // 4) Delete older duplicate active checklists
        // 5) Recompute incomplete count and set checklist status accordingly
        try {
          const havenRes = await pool.query(
            `SELECT haven_id FROM cleaning_checklists WHERE id = $1`,
            [checklistId],
          );
          const havenId = havenRes.rows[0]?.haven_id;
          if (!havenId) {
            // Can't resolve without haven context - rethrow original
            throw err;
          }

          const latestRes = await pool.query(
            `SELECT id FROM cleaning_checklists
             WHERE haven_id = $1
             AND status != 'completed'
             ORDER BY created_at DESC
             LIMIT 1`,
            [havenId],
          );
          const latestChecklistId = latestRes.rows[0]?.id;

          if (latestChecklistId && latestChecklistId !== checklistId) {
            // Move this task to the latest active checklist so the update
            // applies to the current active checklist.
            await pool.query(
              `UPDATE cleaning_tasks SET checklist_id = $1, updated_at = timezone('Asia/Manila', NOW()) WHERE id = $2`,
              [latestChecklistId, updatedTask.id],
            );
            updatedTask.checklist_id = latestChecklistId;
          }

          // Remove older duplicates, keeping only the most recent active checklist
          await pool.query(
            `WITH duplicates AS (
               SELECT id, ROW_NUMBER() OVER (PARTITION BY haven_id ORDER BY created_at DESC) rn
               FROM cleaning_checklists
               WHERE haven_id = $1 AND status != 'completed'
             )
             DELETE FROM cleaning_checklists WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)`,
            [havenId],
          );

          // Recompute incomplete count for the (possibly moved) checklist
          const recomputeRes = await pool.query(
            `SELECT COUNT(*)::int AS incomplete_count
             FROM cleaning_tasks
             WHERE checklist_id = $1
             AND completed = false`,
            [updatedTask.checklist_id],
          );

          incompleteCount = parseInt(
            recomputeRes.rows[0]?.incomplete_count || "0",
            10,
          );

          // Finally, set the checklist status according to the recomputed count
          if (incompleteCount === 0) {
            await pool.query(
              `UPDATE cleaning_checklists
               SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW())
               WHERE id = $1`,
              [updatedTask.checklist_id],
            );
          } else {
            await pool.query(
              `UPDATE cleaning_checklists
               SET status = 'in_progress', updated_at = timezone('Asia/Manila', NOW())
               WHERE id = $1`,
              [updatedTask.checklist_id],
            );
          }
        } catch (innerErr) {
          const innerMessage =
            innerErr instanceof Error ? innerErr.message : String(innerErr);
          console.error(
            "Error resolving unique-violation when updating checklist status:",
            innerMessage,
          );
          // Re-throw original (or inner) so outer handler returns a 500
          throw err;
        }
      }
    }

    if (incompleteCount === 0) {
      await setChecklistStatusSafely(updatedTask.checklist_id, "completed");
    } else {
      await setChecklistStatusSafely(updatedTask.checklist_id, "in_progress");
    }

    return NextResponse.json({
      success: true,
      data: { task: updatedTask, incompleteCount },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error updating task:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to update task" },
      { status: 500 },
    );
  }
};

/* ---------------------------
 * Admin per-assignment checklist editing — add/edit/remove individual
 * checklist tasks on ONE already-created checklist. This is distinct from
 * DEFAULT_CHECKLIST_TEMPLATE (which only shapes brand-new checklists going
 * forward) — these mutate an existing cleaning_tasks row set directly, so
 * admin can e.g. add "deep clean the oven" to just this booking's checklist
 * without changing what every other room gets.
 * Endpoint: POST /api/admin/cleaners with action "add_task" | "edit_task" | "remove_task"
 * --------------------------- */

// Every category name in use anywhere — the 5 canonical template ones plus
// any custom category an admin has already created on some other checklist
// (e.g. via "Add Category"). Lets the "Add Category" picker offer what
// already exists instead of admin retyping "Bedroom" vs "bedroom" and
// fragmenting the same category under two spellings.
// Endpoint: GET /api/admin/cleaners/checklist/categories
export const getKnownCategories = async (): Promise<NextResponse> => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM cleaning_tasks ORDER BY category`,
    );
    const fromDb = result.rows.map((r) => r.category as string);
    const templateCategories = DEFAULT_CHECKLIST_TEMPLATE.map((c) => c.category);
    const merged = Array.from(new Set([...templateCategories, ...fromDb])).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching known categories:", message);
    return NextResponse.json({ success: false, error: message || "Failed to fetch categories" }, { status: 500 });
  }
};

// Add a new task to an existing checklist. Body: { checklist_id, category, task_description }
export const addChecklistTask = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { checklist_id, category, task_description } = body || {};

    if (!checklist_id || !category?.trim() || !task_description?.trim()) {
      return NextResponse.json(
        { success: false, error: "checklist_id, category, and task_description are required" },
        { status: 400 },
      );
    }

    const checklistRes = await pool.query(`SELECT status FROM cleaning_checklists WHERE id = $1`, [checklist_id]);
    if (checklistRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Checklist not found" }, { status: 404 });
    }

    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM cleaning_tasks WHERE checklist_id = $1`,
      [checklist_id],
    );

    const insertRes = await pool.query(
      `INSERT INTO cleaning_tasks (checklist_id, category, task_description, completed, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, false, $4, timezone('Asia/Manila', NOW()), timezone('Asia/Manila', NOW()))
       RETURNING id, checklist_id, category, task_description, completed, display_order`,
      [checklist_id, category.trim(), task_description.trim(), orderRes.rows[0].next_order],
    );

    // Adding an incomplete task to a checklist that had already been marked
    // completed reopens it — otherwise it's left in whatever state it was.
    if (checklistRes.rows[0].status === "completed") {
      await pool.query(
        `UPDATE cleaning_checklists SET status = 'in_progress', completed_at = NULL, updated_at = timezone('Asia/Manila', NOW()) WHERE id = $1`,
        [checklist_id],
      );
    }

    return NextResponse.json({ success: true, data: { task: insertRes.rows[0] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error adding checklist task:", message);
    return NextResponse.json({ success: false, error: message || "Failed to add task" }, { status: 500 });
  }
};

// Edit an existing task's category/description (not its completion state —
// that's still the cleaner-facing PATCH). Body: { task_id, category?, task_description? }
export const editChecklistTask = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { task_id, category, task_description } = body || {};

    if (!task_id) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }
    if (category === undefined && task_description === undefined) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const fields: string[] = [];
    const params: (string | null)[] = [];
    let n = 1;
    if (category !== undefined) { fields.push(`category = $${n++}`); params.push(String(category).trim()); }
    if (task_description !== undefined) { fields.push(`task_description = $${n++}`); params.push(String(task_description).trim()); }
    fields.push(`updated_at = timezone('Asia/Manila', NOW())`);
    params.push(task_id);

    const result = await pool.query(
      `UPDATE cleaning_tasks SET ${fields.join(", ")} WHERE id = $${n}
       RETURNING id, checklist_id, category, task_description, completed`,
      params,
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { task: result.rows[0] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error editing checklist task:", message);
    return NextResponse.json({ success: false, error: message || "Failed to edit task" }, { status: 500 });
  }
};

// Remove a task admin added by mistake, or one no longer relevant to this
// booking. Body: { task_id }
export const removeChecklistTask = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { task_id } = body || {};

    if (!task_id) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    const deleteRes = await pool.query(
      `DELETE FROM cleaning_tasks WHERE id = $1 RETURNING checklist_id`,
      [task_id],
    );

    if (deleteRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const checklistId = deleteRes.rows[0].checklist_id;

    // Recompute checklist status — removing the last incomplete task can
    // complete the checklist; removing the only task leaves it 'pending'.
    const incompleteRes = await pool.query(
      `SELECT COUNT(*)::int AS incomplete_count FROM cleaning_tasks WHERE checklist_id = $1 AND completed = false`,
      [checklistId],
    );
    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM cleaning_tasks WHERE checklist_id = $1`,
      [checklistId],
    );
    const incompleteCount = incompleteRes.rows[0]?.incomplete_count ?? 0;
    const total = totalRes.rows[0]?.total ?? 0;

    if (total === 0) {
      await pool.query(
        `UPDATE cleaning_checklists SET status = 'pending', completed_at = NULL, updated_at = timezone('Asia/Manila', NOW()) WHERE id = $1`,
        [checklistId],
      );
    } else if (incompleteCount === 0) {
      await pool.query(
        `UPDATE cleaning_checklists SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW()) WHERE id = $1`,
        [checklistId],
      );
    }

    return NextResponse.json({ success: true, data: { checklist_id: checklistId, incompleteCount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error removing checklist task:", message);
    return NextResponse.json({ success: false, error: message || "Failed to remove task" }, { status: 500 });
  }
};

/* ---------------------------
 * POST: Save checklist progress (bulk update)
 * Endpoint: POST /api/admin/cleaners/checklist/save
 * Body: { checklist_id: string, tasks: [{ id: string, completed: boolean }] }
 * --------------------------- */
export const saveChecklistProgress = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { checklist_id, tasks } = body || {};

    if (!checklist_id || !Array.isArray(tasks)) {
      return NextResponse.json(
        { success: false, error: "checklist_id and tasks array are required" },
        { status: 400 },
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const t of tasks) {
        if (!t || !t.id || typeof t.completed !== "boolean") continue;
        // Scoped to THIS checklist: access was authorised for checklist_id, so a
        // task id from some other checklist in the same payload is ignored
        // rather than written.
        await client.query(
          `UPDATE cleaning_tasks
           SET completed = $1, updated_at = timezone('Asia/Manila', NOW())
           WHERE id = $2 AND checklist_id = $3`,
          [t.completed, t.id, checklist_id],
        );
      }

      // Recompute checklist status
      const incompleteCountRes = await client.query(
        `SELECT COUNT(*)::int AS incomplete_count
         FROM cleaning_tasks
         WHERE checklist_id = $1
         AND completed = false`,
        [checklist_id],
      );

      let incompleteCount = parseInt(
        incompleteCountRes.rows[0]?.incomplete_count || "0",
        10,
      );

      // Attempt status update, with dedupe & migration fallback for unique-violation races.
      // If a unique constraint on active checklists is triggered (possible when
      // pre-existing duplicates exist), we try to recover by:
      //  - finding the haven for the checklist,
      //  - moving tasks from the current checklist into the latest active checklist (if different),
      //  - removing older duplicate active checklists,
      //  - recomputing the incomplete count and finally setting status on the
      //    appropriate checklist.
      const attemptStatusUpdate = async (id: string) => {
        // Helper to apply a status to a given checklist id inside the transaction.
        const applyStatus = async (
          status: "completed" | "in_progress",
          targetId: string,
        ) => {
          if (status === "completed") {
            await client.query(
              `UPDATE cleaning_checklists
               SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW())
               WHERE id = $1`,
              [targetId],
            );
          } else {
            await client.query(
              `UPDATE cleaning_checklists
               SET status = 'in_progress', updated_at = timezone('Asia/Manila', NOW())
               WHERE id = $1`,
              [targetId],
            );
          }
        };

        try {
          // Normal path: try to set status on the given checklist id.
          if (incompleteCount === 0) {
            await applyStatus("completed", id);
          } else {
            await applyStatus("in_progress", id);
          }
        } catch (err) {
          // Detect Postgres unique-violation (duplicate active checklist)
          const pgErr = err as { code?: string | number; constraint?: string };
          const isUniqueViolation =
            String(pgErr?.code) === "23505" ||
            pgErr?.constraint === "uniq_active_checklist_per_haven" ||
          pgErr?.constraint === "uniq_active_checklist_per_haven_booking" ||
          pgErr?.constraint === "uniq_active_checklist_per_haven_legacy";

          if (!isUniqueViolation) throw err;

          // Recovery path: attempt to dedupe & merge changes into the latest active checklist.
          try {
            const havenRes = await client.query(
              `SELECT haven_id FROM cleaning_checklists WHERE id = $1 LIMIT 1`,
              [id],
            );
            const havenId = havenRes.rows[0]?.haven_id;
            if (!havenId) throw err;

            // Find the latest active (non-completed) checklist for the haven
            const latestRes = await client.query(
              `SELECT id FROM cleaning_checklists
               WHERE haven_id = $1 AND status != 'completed'
               ORDER BY created_at DESC
               LIMIT 1`,
              [havenId],
            );
            const latestId = latestRes.rows[0]?.id;

            let targetId = id;

            if (latestId && latestId !== id) {
              // Move all tasks from the current checklist to the latest active checklist
              await client.query(
                `UPDATE cleaning_tasks
                 SET checklist_id = $1, updated_at = timezone('Asia/Manila', NOW())
                 WHERE checklist_id = $2`,
                [latestId, id],
              );
              targetId = latestId;
            }

            // Remove older active duplicates, keeping only the most recent per haven
            await client.query(
              `WITH duplicates AS (
                 SELECT id, ROW_NUMBER() OVER (PARTITION BY haven_id ORDER BY created_at DESC) rn
                 FROM cleaning_checklists
                 WHERE haven_id = $1 AND status != 'completed'
               )
               DELETE FROM cleaning_checklists
               WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)`,
              [havenId],
            );

            // Recompute incomplete count for the (possibly moved) checklist
            const recompute = await client.query(
              `SELECT COUNT(*)::int AS incomplete_count
               FROM cleaning_tasks
               WHERE checklist_id = $1
               AND completed = false`,
              [targetId],
            );

            incompleteCount = parseInt(
              recompute.rows[0]?.incomplete_count || "0",
              10,
            );

            // Finally, set status on the resolved checklist (targetId)
            if (incompleteCount === 0) {
              await applyStatus("completed", targetId);
            } else {
              await applyStatus("in_progress", targetId);
            }
          } catch (innerErr) {
            console.error(
              "Error while resolving unique-violation in saveChecklistProgress:",
              innerErr,
            );
            // Re-throw the original to let the outer handler rollback and notify the client
            throw err;
          }
        }
      };

      await attemptStatusUpdate(checklist_id);

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Checklist progress saved",
        data: { incompleteCount },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error saving checklist progress:", message);
      return NextResponse.json(
        {
          success: false,
          error: message || "Failed to save checklist progress",
        },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in saveChecklistProgress:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to save checklist progress" },
      { status: 500 },
    );
  }
};

/* ---------------------------
 * POST: Submit checklist (finalize)
 * Endpoint: POST /api/admin/cleaners/checklist/submit
 * Body: { checklist_id: string }
 *
 * Every task must be ticked AND have a successfully uploaded photo. Three things
 * this used to do, and no longer does:
 *   - let a cleaner through when only the "General" category was ticked, on the
 *     theory that other categories were covered by photos (they weren't checked
 *     either);
 *   - force-complete every unticked task on the way out, so submitting was
 *     itself what "finished" the checklist;
 *   - accept a checklist with no tasks at all as complete.
 *
 * Owner/CSR keep an override — they inspect the room themselves — but it is now
 * explicit in the response rather than a silent bypass.
 * --------------------------- */
export const submitChecklist = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { checklist_id, role } = body || {};

    if (!checklist_id) {
      return NextResponse.json(
        { success: false, error: "checklist_id is required" },
        { status: 400 },
      );
    }

    const exists = await pool.query(
      `SELECT id FROM cleaning_checklists WHERE id = $1`,
      [checklist_id],
    );
    if (exists.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Checklist not found" },
        { status: 404 },
      );
    }

    const isPrivilegedRole = role === "Owner" || role === "CSR" || role === "csr" || role === "admin";

    const gate = evaluateChecklistGate(await loadChecklistGateTasks(checklist_id));

    if (!gate.ok && !isPrivilegedRole) {
      return NextResponse.json(
        {
          success: false,
          error: gate.error,
          // Named, not just counted, so the portal can point at the exact rows.
          incompleteCount: gate.incomplete.length,
          missingPhotoCount: gate.missingPhotos.length,
          incompleteTasks: gate.incomplete.map((t) => ({ id: t.id, category: t.category, task: t.task })),
          missingPhotoTasks: gate.missingPhotos.map((t) => ({ id: t.id, category: t.category, task: t.task })),
        },
        { status: 400 },
      );
    }

    // Only a checklist that genuinely passed is marked completed. An Owner/CSR
    // override records the completion without pretending the tasks were ticked —
    // nothing here writes to cleaning_tasks.
    const updateRes = await pool.query(
      `UPDATE cleaning_checklists
       SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW())
       WHERE id = $1
       RETURNING id, haven_id, status, completed_at, created_at, updated_at`,
      [checklist_id],
    );

    return NextResponse.json({
      success: true,
      message: gate.ok
        ? "Checklist submitted successfully"
        : "Checklist closed by Owner/CSR override",
      data: { checklist: updateRes.rows[0], overridden: !gate.ok },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error submitting checklist:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to submit checklist" },
      { status: 500 },
    );
  }
};
