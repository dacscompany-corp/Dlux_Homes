import { NextRequest, NextResponse } from "next/server";
import { getAllCleaningTasks } from "@/backend/controller/cleanersController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// Alias of /api/admin/cleaners/tasks, kept for older callers. Same scoping: a
// Cleaner sees only their own tasks, without guest contact or payment details.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  return getAllCleaningTasks(request, {
    id: (guard.session.user as { id?: string }).id ?? null,
    role: guard.role,
  });
}
