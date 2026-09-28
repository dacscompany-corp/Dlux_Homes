import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { upload_image_from_form } from "@/backend/utils/fileUpload";
import { requireChecklistAccess } from "@/backend/utils/requireAdmin";

// Photo proof for checklist tasks — one photo per task, required for every task
// before the room can be sent for inspection.
//
// Photos are now linked to the cleaning_tasks row they prove (task_id), and the
// upload is refused unless that task belongs to the checklist named in the same
// request. Before, the client sent the task's TEXT as `category`, which
// silently detached photos when admin edited a task's wording and let a photo
// be filed against any checklist id at all.

type ChecklistPhoto = { url: string; uploaded_at: string | null };

// GET → { data: { [taskId]: { url, uploaded_at } } }
export async function GET(req: NextRequest) {
  const checklistId = req.nextUrl.searchParams.get("checklist_id");
  if (!checklistId) {
    return NextResponse.json({ success: false, error: "checklist_id is required" }, { status: 400 });
  }

  const guard = await requireChecklistAccess({ checklistId });
  if (!guard.ok) return guard.response;

  try {
    const result = await pool.query(
      `SELECT p.task_id::text AS task_id, p.image_url, p.uploaded_at
         FROM cleaning_checklist_photos p
         JOIN cleaning_tasks t ON t.id = p.task_id AND t.checklist_id = p.checklist_id
        WHERE p.checklist_id = $1::uuid`,
      [checklistId],
    );

    const data: Record<string, ChecklistPhoto> = {};
    for (const row of result.rows) {
      data[row.task_id] = { url: row.image_url, uploaded_at: row.uploaded_at ?? null };
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST multipart { file, checklist_id, task_id } → { url, task_id }
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Expected a multipart upload" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const checklistId = formData.get("checklist_id") as string | null;
  const taskId = formData.get("task_id") as string | null;

  if (!file || !checklistId || !taskId) {
    return NextResponse.json(
      { success: false, error: "file, checklist_id, and task_id are required" },
      { status: 400 },
    );
  }

  // Uploading proof is part of doing the work, so the same rule as ticking a
  // task applies: your own room, while it is In Progress.
  const guard = await requireChecklistAccess({ checklistId }, { forWrite: true });
  if (!guard.ok) return guard.response;

  try {
    // The task must be on THIS checklist — the photo proves one specific task on
    // one specific assignment, never a stray id from somewhere else.
    const taskRes = await pool.query(
      `SELECT task_description FROM cleaning_tasks WHERE id = $1::uuid AND checklist_id = $2::uuid`,
      [taskId, checklistId],
    );
    if (taskRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "That task is not on this checklist." },
        { status: 400 },
      );
    }

    // Security: verify the upload is a real image (magic-byte check) before storing.
    let uploadResult;
    try {
      uploadResult = await upload_image_from_form(file, "dlux-homes/cleaning-checklist-photos");
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Only image files are allowed" },
        { status: 400 },
      );
    }

    // `category` is NOT NULL and part of the legacy unique key, so it carries the
    // task id too — unique per task, where the task text was not.
    const client = await pool.connect();
    let savedUrl: string | null = null;
    try {
      await client.query("BEGIN");
      // Drop a legacy text-keyed row for this task first. It was backfilled with
      // this task_id, so leaving it would collide with the new row on the
      // per-task unique index — and it's being replaced anyway.
      await client.query(
        `DELETE FROM cleaning_checklist_photos
          WHERE checklist_id = $1::uuid AND task_id = $2::uuid AND category <> $2::text`,
        [checklistId, taskId],
      );
      const saved = await client.query(
        `INSERT INTO cleaning_checklist_photos (checklist_id, task_id, category, image_url, cloudinary_public_id, uploaded_at)
         VALUES ($1::uuid, $2::uuid, $2::text, $3, $4, timezone('Asia/Manila', NOW()))
         ON CONFLICT (checklist_id, category)
         DO UPDATE SET
           task_id = EXCLUDED.task_id,
           image_url = EXCLUDED.image_url,
           cloudinary_public_id = EXCLUDED.cloudinary_public_id,
           uploaded_at = timezone('Asia/Manila', NOW())
         RETURNING image_url`,
        [checklistId, taskId, uploadResult.url, uploadResult.public_id],
      );
      await client.query("COMMIT");
      savedUrl = saved.rows[0]?.image_url ?? null;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Only report success once the row that proves the task is really there —
    // the portal treats this response as "photo proof recorded".
    if (!savedUrl) {
      return NextResponse.json({ success: false, error: "The photo could not be saved" }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: savedUrl, task_id: taskId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/cleaners/checklist-photos error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
