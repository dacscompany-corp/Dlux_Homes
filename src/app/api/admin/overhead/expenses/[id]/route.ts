import { NextRequest, NextResponse } from "next/server";
import {
  getExpense, updateExpense, deleteExpense,
} from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return getExpense(request, id);
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return updateExpense(request, id, guard.session.user.email ?? "");
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteExpense(request, id);
}
