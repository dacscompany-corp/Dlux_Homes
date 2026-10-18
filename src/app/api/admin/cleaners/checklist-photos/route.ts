import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { upload_image_from_form } from "@/backend/utils/fileUpload";
import { requireChecklistAccess } from "@/backend/utils/requireAdmin";
import { autoCompleteIfChecklistDone } from "@/backend/controller/cleanersController";

// Photo proof for a checklist — ONE photo per category, showing the finished
// result of that area (owner request, 2026-10-18). Tasks themselves are plain
// tick-boxes. Every category needs its photo before the room can be sent for
// inspection.
//
// Stored with task_id NULL and the category name in `category`, on the
// table's original (checklist_id, category) key, so an upload replaces that
// category's photo. The category must exist on the checklist named in the same
// request. Older per-task photos (task_id set) are left alone and ignored.

type ChecklistPhoto = { url: string; uploaded_at: string | null };

// GET → { data: { [category]: { url, uploaded_at } } }
export async function GET(req: NextRequest) {
  const checklistId = req.nextUrl.searchParams.get("checklist_id");
  if (!checklistId) {
    return NextResponse.json({ success: false, error: "checklist_id is required" }, { status: 400 });
  }

  const guard = await requireChecklistAccess({ checklistId });
  if (!guard.ok) return guard.response;

  try {
    const result = await pool.query(
      `SELECT p.category, p.image_url, p.uploaded_at
         FROM cleaning_checklist_photos p
        WHERE p.checklist_id = $1::uuid AND p.task_id IS NULL`,
      [checklistId],
    );

    const data: Record<string, ChecklistPhoto> = {};
    for (const row of result.rows) {
      data[row.category] = { url: row.image_url, uploaded_at: row.uploaded_at ?? null };
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Expected a multipart upload" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const checklistId = formData.get("checklist_id") as string | null;
  const category = (formData.get("category") as string | null)?.trim() || null;

  if (!file || !checklistId || !category) {
    return NextResponse.json(
      { success: false, error: "file, checklist_id, and category are required" },
      { status: 400 },
    );
  }

  // Uploading proof is part of doing the work, so the same rule as ticking a
  // task applies: your own room, while it is In Progress.
  const guard = await requireChecklistAccess({ checklistId }, { forWrite: true });
  if (!guard.ok) return guard.response;

  try {
    // The category must be on THIS checklist.
    const catRes = await pool.query(
      `SELECT 1 FROM cleaning_tasks WHERE checklist_id = $1::uuid AND category = $2 LIMIT 1`,
      [checklistId, category],
    );
    if (catRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "That area is not on this checklist." },
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

    const saved = await pool.query(
      `INSERT INTO cleaning_checklist_photos (checklist_id, task_id, category, image_url, cloudinary_public_id, uploaded_at)
       VALUES ($1::uuid, NULL, $2, $3, $4, timezone('Asia/Manila', NOW()))
       ON CONFLICT (checklist_id, category)
       DO UPDATE SET
         task_id = NULL,
         image_url = EXCLUDED.image_url,
         cloudinary_public_id = EXCLUDED.cloudinary_public_id,
         uploaded_at = timezone('Asia/Manila', NOW())
       RETURNING image_url`,
      [checklistId, category, uploadResult.url, uploadResult.public_id],
    );
    await pool.query(
      `UPDATE cleaning_checklists
       SET status = 'in_progress', updated_at = timezone('Asia/Manila', NOW())
       WHERE id = $1::uuid AND status = 'pending'`,
      [checklistId],
    );

    // Only report success once the row that proves the area is really there —
    // the portal treats this response as "photo proof recorded".
    const savedUrl: string | null = saved.rows[0]?.image_url ?? null;
    if (!savedUrl) {
      return NextResponse.json({ success: false, error: "The photo could not be saved" }, { status: 500 });
    }

    // The last photo can be what finishes the checklist — hand the room in.
    const autoCompleted = await autoCompleteIfChecklistDone(checklistId, guard.actorId);

    return NextResponse.json({ success: true, url: savedUrl, category, autoCompleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/cleaners/checklist-photos error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
