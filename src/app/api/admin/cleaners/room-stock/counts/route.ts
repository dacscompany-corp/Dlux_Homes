import { NextRequest } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { saveSupplyCounts } from "@/backend/controller/roomStockController";

// Any staff: save how many of each supply are left in the room.
// Body: { counts: [{ id, current_quantity }] }
export async function PATCH(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const actorId = (guard.session.user as { id?: string }).id ?? null;
  return saveSupplyCounts(body?.counts, actorId);
}
