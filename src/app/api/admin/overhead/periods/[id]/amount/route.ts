import { NextRequest, NextResponse } from "next/server";
import { updatePeriodAmount } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return updatePeriodAmount(request, id, guard.session.user.email ?? "");
}
