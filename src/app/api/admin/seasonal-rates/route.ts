import { NextRequest } from "next/server";
import { listSeasons, createSeason } from "@/backend/controller/seasonalRatesController";
import { requireOwner } from "@/backend/utils/requireAdmin";

// Owner-only: seasonal rates change what every guest is charged.
export async function GET() {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return listSeasons();
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createSeason(req, guard.session.user.id ?? null);
}
