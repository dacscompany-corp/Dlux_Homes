import { NextRequest, NextResponse } from "next/server";
import { getAllCleaningTasks } from "@/backend/controller/cleanersController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// The task list, scoped to whoever is asking: Owner/CSR see every task with the
// guest and payment columns; a Cleaner sees only the tasks assigned to them, and
// without guest contact or money figures.
//
// This route used to create sample cleaning rows when booking_cleaning looked
// empty. It doesn't any more — a list endpoint inventing assignments is exactly
// how phantom work appeared in the portal.
export async function GET(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  try {
    return await getAllCleaningTasks(req, {
      id: (guard.session.user as { id?: string }).id ?? null,
      role: guard.role,
    });
  } catch (error) {
    console.error("❌ Error in cleaners tasks route:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get cleaning tasks",
        data: [],
      },
      { status: 500 }
    );
  }
}
