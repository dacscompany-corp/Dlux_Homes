import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { updateCleaningTask } from "@/backend/controller/cleanersController";
import { verifyAssignmentChecklist } from "@/backend/controller/cleaningChecklistController";
import { requireCleaningTaskAccess } from "@/backend/utils/requireAdmin";
import { actorForRole, checkTransition } from "@/lib/cleaning-workflow";

// In Progress → Awaiting Inspection.
//
// Completing does NOT make the room bookable again — only an Owner/CSR
// inspection approval (tasks/[id]/inspect/approve) moves it to Ready.
//
// Server-side gates, so a direct API call can't skip any of them:
//   1. the task must be assigned to the caller;
//   2. it must be In Progress (the sequence can't be skipped);
//   3. its checklist must exist, every task on it must be ticked, and every
//      task must have a successfully uploaded photo linked to THIS checklist.
//
// Nothing here ticks anything on the cleaner's behalf. The old flow
// force-completed unticked tasks at submission and let a missing checklist
// pass; both are gone.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireCleaningTaskAccess(id);
  if (!guard.ok) return guard.response;

  try {
    const transition = checkTransition(guard.status, "awaiting-inspection", actorForRole(guard.role));
    if (!transition.ok) {
      return NextResponse.json({ success: false, error: transition.error }, { status: 400 });
    }

    if (guard.status === "awaiting-inspection") {
      return NextResponse.json({
        success: true,
        message: "This room is already awaiting inspection",
      });
    }

    const { checklistId, gate } = await verifyAssignmentChecklist(id);

    if (!gate.ok) {
      return NextResponse.json(
        {
          success: false,
          error: gate.error,
          incompleteCount: gate.incomplete.length,
          missingPhotoCount: gate.missingPhotos.length,
          incompleteTasks: gate.incomplete.map((t) => ({ id: t.id, category: t.category, task: t.task })),
          missingPhotoTasks: gate.missingPhotos.map((t) => ({ id: t.id, category: t.category, task: t.task })),
        },
        { status: 400 }
      );
    }

    // The checklist genuinely passed — record it as submitted alongside the
    // status change, so the two can't disagree.
    if (checklistId) {
      await pool.query(
        `UPDATE cleaning_checklists
         SET status = 'completed', completed_at = timezone('Asia/Manila', NOW()), updated_at = timezone('Asia/Manila', NOW())
         WHERE id = $1::uuid AND status <> 'completed'`,
        [checklistId]
      );
    }

    const now = new Date().toISOString();
    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const forwarded = new Request(url, {
      method: "PUT",
      headers: req.headers,
      body: JSON.stringify({
        cleaning_status: "awaiting-inspection",
        cleaning_time_out: now,
        cleaned_at: now,
        // A previous rejection's note has been acted on — clear it so the
        // inspector isn't shown a stale correction.
        inspection_note: null,
        changed_by: guard.actorId,
      }),
    }) as NextRequest;

    return await updateCleaningTask(forwarded, { id: guard.actorId, role: guard.role });
  } catch (error) {
    console.error("❌ Error completing cleaning:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete cleaning",
      },
      { status: 500 }
    );
  }
}
