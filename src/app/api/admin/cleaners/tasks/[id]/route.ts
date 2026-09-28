import { NextRequest, NextResponse } from "next/server";
import { getCleaningTaskById, updateCleaningTask } from "@/backend/controller/cleanersController";
import { requireAdmin, requireCleaningTaskAccess } from "@/backend/utils/requireAdmin";

// GET one task. A cleaner may read only their own (requireCleaningTaskAccess),
// and the projection they get leaves out guest contact and payment details.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireCleaningTaskAccess(id);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const forwarded = new Request(url, { method: "GET", headers: req.headers }) as NextRequest;
    return await getCleaningTaskById(forwarded, {
      id: guard.actorId,
      role: guard.role,
    });
  } catch (error) {
    console.error("❌ Error in GET /tasks/[id]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get cleaning task",
      },
      { status: 500 }
    );
  }
}

// PUT is the generic "write these columns" endpoint. Owner/CSR only — this is
// the API a cleaner previously could have used to set any status on any task,
// inspection included. Cleaners use /start and /complete, which enforce the
// sequence and the checklist gate; the inspection outcomes are their own routes.
//
// The status itself is still validated against the workflow sequence inside the
// controller, so not even an admin can move a task straight to Ready.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const forwarded = new Request(url, {
      method: "PUT",
      headers: req.headers,
      body: JSON.stringify(body),
    }) as NextRequest;

    return await updateCleaningTask(forwarded, {
      id: (guard.session.user as { id?: string }).id ?? null,
      role: guard.role,
    });
  } catch (error) {
    console.error("❌ Error in PUT /tasks/[id]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update cleaning task",
      },
      { status: 500 }
    );
  }
}
