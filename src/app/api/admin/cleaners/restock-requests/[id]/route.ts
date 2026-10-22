import { NextRequest } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { updateRestockRequest } from "@/backend/controller/roomStockController";

// Owner/CSR: move a request Pending → Processing → Completed (completing tops
// the room's count back up). Body: { status?, admin_note? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const actorId = (guard.session.user as { id?: string }).id ?? null;
  return updateRestockRequest(id, body, actorId);
}
