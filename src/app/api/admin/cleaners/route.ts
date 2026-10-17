import { NextRequest, NextResponse } from "next/server";
import {
  getChecklistByHaven,
  saveChecklistProgress,
  submitChecklist,
  updateTask as controllerUpdateTask,
  addChecklistTask,
  editChecklistTask,
  removeChecklistTask,
} from "@/backend/controller/cleaningChecklistController";
import { requireAdmin, requireChecklistAccess } from "@/backend/utils/requireAdmin";
import { autoCompleteIfChecklistDone } from "@/backend/controller/cleanersController";
import pool from "@/backend/config/db";

// After a successful tick/save, the checklist may now be fully ticked and
// photographed — if so the room is handed in automatically, and the response
// says so (autoCompleted) so the portal can move to its "done" screen.
async function withAutoComplete(res: NextResponse, checklistId: string | null, actorId: string | null): Promise<NextResponse> {
  if (!res.ok || !checklistId) return res;
  if (!(await autoCompleteIfChecklistDone(checklistId, actorId))) return res;
  const body = await res.clone().json().catch(() => ({}));
  return NextResponse.json({ ...body, autoCompleted: true }, { status: res.status });
}

// Checklist endpoints. Every one of them now resolves the checklist to its
// cleaning assignment first: Owner/CSR may act on any, a Cleaner only on the
// checklist of a room assigned to them — and may only CHANGE it while that room
// is In Progress.

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("booking_id");

  if (bookingId) {
    const guard = await requireChecklistAccess({ bookingId });
    if (!guard.ok) return guard.response;
    return getChecklistByHaven(req);
  }

  // The haven-only lookup (no booking) is a legacy admin navigation path. It
  // isn't tied to any one assignment, so a cleaner can't be authorised for it.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return getChecklistByHaven(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body || {};

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Action is required (save|submit)" },
        { status: 400 },
      );
    }

    // Wrap the request so controllers can call `req.json()` and receive the
    // already-parsed body. This prevents "Body has already been read" when
    // the controller calls `req.json()` after the route already consumed it.
    const reqWithParsedBody = { ...req, json: async () => body } as NextRequest;

    switch (action) {
      case "save":
      case "submit": {
        if (!body.checklist_id) {
          return NextResponse.json(
            { success: false, error: "checklist_id is required" },
            { status: 400 },
          );
        }
        const guard = await requireChecklistAccess(
          { checklistId: String(body.checklist_id) },
          { forWrite: true },
        );
        if (!guard.ok) return guard.response;

        if (action === "save") {
          // Expect body: { checklist_id, tasks: [{ id, completed }, ...] }
          return withAutoComplete(await saveChecklistProgress(reqWithParsedBody), String(body.checklist_id), guard.actorId);
        }
        // The role comes from the session, never the body — a cleaner can't
        // claim to be admin to skip the gate.
        const reqWithRole = {
          ...req,
          json: async () => ({ ...body, role: guard.role }),
        } as NextRequest;
        return submitChecklist(reqWithRole);
      }
      case "add_task":
      case "edit_task":
      case "remove_task": {
        // Per-assignment checklist editing (add/edit/remove a task on one
        // already-created checklist) is Owner/CSR only — a cleaner completes
        // the checklist they're given, they don't redefine it.
        const adminGuard = await requireAdmin();
        if (!adminGuard.ok) return adminGuard.response;
        if (action === "add_task") return addChecklistTask(reqWithParsedBody);
        if (action === "edit_task") return editChecklistTask(reqWithParsedBody);
        return removeChecklistTask(reqWithParsedBody);
      }
      default:
        return NextResponse.json(
          { success: false, error: "Unknown action" },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/cleaners error:", message);
    return NextResponse.json(
      { success: false, error: message || "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Accept body with a task identifier and new completed value:
    // { task_id: string, completed: boolean }
    const body = await req.json().catch(() => null);
    const taskId = body?.task_id || body?.taskId || body?.id;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "task_id is required in the body" },
        { status: 400 },
      );
    }

    const guard = await requireChecklistAccess(
      { checklistTaskId: String(taskId) },
      { forWrite: true },
    );
    if (!guard.ok) return guard.response;

    // Wrap the request so controller can safely call req.json() without causing
    // "Body has already been read". The wrapped request returns the parsed
    // body when .json() is called.
    const reqWithParsedBody = { ...req, json: async () => body } as NextRequest;

    const res = await controllerUpdateTask(reqWithParsedBody, {
      params: Promise.resolve({ taskId }),
    });
    if (!res.ok || body?.completed !== true) return res;
    const owner = await pool.query(`SELECT checklist_id::text AS id FROM cleaning_tasks WHERE id = $1::uuid`, [String(taskId)]);
    return withAutoComplete(res, owner.rows[0]?.id ?? null, guard.actorId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PATCH /api/admin/cleaners error:", message);
    return NextResponse.json(
      { success: false, error: message || "Unexpected error" },
      { status: 500 },
    );
  }
}
