import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import {
  listStaffThreads,
  sendStaffMessage,
  staffDisplayName,
  StaffMessageError,
  type StaffViewer,
} from "@/backend/controller/staffMessageController";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function viewerFrom(guard: { session: { user: unknown }; role: string }): Promise<StaffViewer | null> {
  const u = guard.session.user as { id?: string; name?: string | null; email?: string | null };
  if (!u.id) return null;
  return { id: u.id, role: guard.role, name: await staffDisplayName(u.id, u.name || u.email || guard.role) };
}

function fail(error: unknown, fallback: string) {
  if (error instanceof StaffMessageError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(`❌ ${fallback}:`, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

// GET /api/messages/staff — the cleaner's office thread, or (Owner/CSR) one
// row per cleaner with their latest message and unread count.
export async function GET() {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const viewer = await viewerFrom(guard);
  if (!viewer) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await listStaffThreads(viewer) });
  } catch (error) {
    return fail(error, "Failed to load conversations");
  }
}

// POST /api/messages/staff — send a message. Body:
//   { conversation_id?: string, cleaner_id?: string, message_text: string }
// A cleaner needs neither id (it goes to their office thread). Owner/CSR pass
// the conversation, or a cleaner_id to start the first conversation with them.
export async function POST(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const viewer = await viewerFrom(guard);
  if (!viewer) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { conversation_id?: string; cleaner_id?: string; message_text?: unknown };
  try {
    const message = await sendStaffMessage(
      viewer,
      { conversationId: body.conversation_id ?? null, cleanerId: body.cleaner_id ?? null },
      body.message_text,
    );
    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    return fail(error, "Failed to send message");
  }
}
