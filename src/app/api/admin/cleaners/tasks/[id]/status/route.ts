import { NextRequest, NextResponse } from "next/server";
import { updateCleaningTask } from "@/backend/controller/cleanersController";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { isCleaningStatus, CLEANING_STATUSES } from "@/lib/cleaning-workflow";

// Generic "set this status" endpoint — Owner/CSR only.
//
// This was the hole the MVP scope calls out: any signed-in employee could PUT
// { cleaning_status: "ready" } here and skip inspection entirely. It is now
// admin-only, and the controller still validates the move against the workflow
// sequence (Assigned → In Progress → Awaiting Inspection → Ready), so even an
// admin can't jump a task to Ready without it passing through inspection.
//
// Cleaners use /start and /complete; inspection outcomes use /inspect/approve
// and /inspect/reject.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { cleaning_status } = body as { cleaning_status?: unknown };

    if (!cleaning_status) {
      return NextResponse.json(
        { success: false, error: "Cleaning status is required" },
        { status: 400 }
      );
    }

    if (!isCleaningStatus(cleaning_status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid cleaning status. Must be one of: ${CLEANING_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Ready and the send-back carry side effects (timestamps, notes, cleaner
    // notification) that only the inspection routes apply.
    if (cleaning_status === "ready") {
      return NextResponse.json(
        { success: false, error: "Use /inspect/approve to approve a room after inspection." },
        { status: 400 }
      );
    }

    const url = new URL(`/api/admin/cleaners/tasks/${id}`, req.url);
    const forwarded = new Request(url, {
      method: "PUT",
      headers: req.headers,
      body: JSON.stringify({
        cleaning_status,
        changed_by: (guard.session.user as { id?: string }).id ?? null,
      }),
    }) as NextRequest;

    return await updateCleaningTask(forwarded, {
      id: (guard.session.user as { id?: string }).id ?? null,
      role: guard.role,
    });
  } catch (error) {
    console.error("❌ Error updating cleaning status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update cleaning status",
      },
      { status: 500 }
    );
  }
}
