import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { createRoomSupplies, listRoomSupplies } from "@/backend/controller/roomStockController";

// Room Stock — the supplies kept in the unit.
// GET: any staff (cleaners count them). POST: any staff adds an item; only
// Owner/CSR add the starter list. A cleaner's addition is reported to the office.
export async function GET(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  return listRoomSupplies(req.nextUrl.searchParams.get("haven_id"));
}

export async function POST(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const isAdmin = guard.role === "Owner" || guard.role === "CSR";
  if (!isAdmin && body.starter) {
    return NextResponse.json({ success: false, error: "Only the office can add the starter list." }, { status: 403 });
  }
  const name = (guard.session.user as { name?: string | null }).name || "A cleaner";
  return createRoomSupplies(body, isAdmin ? null : name);
}
