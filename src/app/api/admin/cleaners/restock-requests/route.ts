import { NextRequest } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { createRestockRequests, listRestockRequests } from "@/backend/controller/roomStockController";

// Restock requests. Cleaners see and send their own; Owner/CSR see everyone's.
export async function GET(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const isAdmin = guard.role === "Owner" || guard.role === "CSR";
  const actorId = (guard.session.user as { id?: string }).id ?? null;
  return listRestockRequests({
    status: req.nextUrl.searchParams.get("status"),
    onlyRequester: isAdmin ? null : actorId ?? "00000000-0000-0000-0000-000000000000",
  });
}

// Body: { haven_id?, note?, items: [{ room_supply_id? | item_name?, quantity }] }
export async function POST(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const user = guard.session.user as { id?: string; name?: string | null };
  return createRestockRequests(body, { id: user.id ?? null, name: user.name || guard.role });
}
