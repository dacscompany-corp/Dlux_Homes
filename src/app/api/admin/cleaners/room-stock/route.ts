import { NextRequest } from "next/server";
import { requireAdmin, requireEmployee } from "@/backend/utils/requireAdmin";
import { createRoomSupplies, listRoomSupplies } from "@/backend/controller/roomStockController";

// Room Stock — the supplies kept in the unit.
// GET: any staff (cleaners count them). POST: Owner/CSR add items or the starter list.
export async function GET(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  return listRoomSupplies(req.nextUrl.searchParams.get("haven_id"));
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  return createRoomSupplies(body);
}
