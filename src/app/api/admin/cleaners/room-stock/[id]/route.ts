import { NextRequest } from "next/server";
import { requireAdmin, requireEmployee } from "@/backend/utils/requireAdmin";
import { deleteRoomSupply, updateRoomSupply } from "@/backend/controller/roomStockController";

// PUT (Owner/CSR only): change an item's name, unit or full-stock amount.
// DELETE: any staff removes an item; a cleaner's removal is reported to the office.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return updateRoomSupply(id, body);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const isAdmin = guard.role === "Owner" || guard.role === "CSR";
  const name = (guard.session.user as { name?: string | null }).name || "A cleaner";
  return deleteRoomSupply(id, isAdmin ? null : name);
}
