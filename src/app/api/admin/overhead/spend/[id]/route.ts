import { NextRequest, NextResponse } from "next/server";
import { deleteSpend } from "@/backend/controller/overheadSpendController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteSpend(request, id, guard.session.user.email ?? "");
}
