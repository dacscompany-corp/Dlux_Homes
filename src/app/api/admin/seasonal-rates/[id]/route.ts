import { NextRequest } from "next/server";
import { updateSeason, setSeasonActive, deleteSeason } from "@/backend/controller/seasonalRatesController";
import { requireOwner } from "@/backend/utils/requireAdmin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PUT — full edit. PATCH — ON/OFF toggle ({ active }). DELETE — remove.
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return updateSeason(req, id, guard.session.user.id ?? null);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return setSeasonActive(req, id, guard.session.user.id ?? null);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return deleteSeason(req, id, guard.session.user.id ?? null);
}
