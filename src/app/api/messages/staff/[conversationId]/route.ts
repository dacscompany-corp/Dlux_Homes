import { NextResponse } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import {
  getStaffThreadMessages,
  staffDisplayName,
  StaffMessageError,
} from "@/backend/controller/staffMessageController";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/messages/staff/[conversationId] — the thread's messages, oldest
// first. Opening it marks the other side's messages read for the viewer's side
// only. A cleaner can open only their own thread; Owner/CSR can open any.
export async function GET(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const u = guard.session.user as { id?: string; name?: string | null };
  if (!u.id) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  try {
    const { conversationId } = await params;
    const viewer = { id: u.id, role: guard.role, name: await staffDisplayName(u.id, u.name || guard.role) };
    return NextResponse.json({ success: true, data: await getStaffThreadMessages(viewer, conversationId) });
  } catch (error) {
    if (error instanceof StaffMessageError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("❌ Failed to load staff thread:", error);
    return NextResponse.json({ success: false, error: "Failed to load messages" }, { status: 500 });
  }
}
