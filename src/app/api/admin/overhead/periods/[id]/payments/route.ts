import { NextRequest, NextResponse } from "next/server";
import { getPayments, recordPayment } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return getPayments(request, id);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return recordPayment(request, id, guard.session.user.email ?? "");
}
