import { NextRequest } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { deleteRoomSupply, updateRoomSupply } from "@/backend/controller/roomStockController";

// Owner/CSR only: change an item's name, unit or full-stock amount, or remove it.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return updateRoomSupply(id, body);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return deleteRoomSupply(id);
}
