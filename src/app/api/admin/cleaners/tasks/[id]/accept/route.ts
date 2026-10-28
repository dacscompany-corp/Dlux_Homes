import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { acceptCleaningTask } from "@/backend/controller/cleanersController";

// A cleaner accepts a room assigned to them (before starting). The office is
// told. Rejecting is /tasks/[id]/decline.
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const cleanerId = (guard.session.user as { id?: string }).id;
  if (!cleanerId) return NextResponse.json({ success: false, error: "Session not ready" }, { status: 401 });
  const result = await acceptCleaningTask({ cleaningTaskId: id, cleanerId });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, message: "Accepted" });
}
