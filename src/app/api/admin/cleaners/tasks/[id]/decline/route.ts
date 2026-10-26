import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { declineCleaningTask } from "@/backend/controller/cleanersController";

// A cleaner says they're not available for a room assigned to them. The room
// is released back to the office (Owner/CSR are notified to reassign it).
// Body: { reason?: string }. Only the assigned cleaner, only before starting.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const cleanerId = (guard.session.user as { id?: string }).id;
  if (!cleanerId) return NextResponse.json({ success: false, error: "Session not ready" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await declineCleaningTask({ cleaningTaskId: id, cleanerId, reason: String(body?.reason ?? "") });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, message: "The office has been told — they'll assign someone else." });
}
