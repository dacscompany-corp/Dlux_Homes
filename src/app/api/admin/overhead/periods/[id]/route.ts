import { NextRequest, NextResponse } from "next/server";
import { cancelPeriod } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return cancelPeriod(request, id);
}
