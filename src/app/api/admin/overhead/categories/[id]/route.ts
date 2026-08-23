import { NextRequest, NextResponse } from "next/server";
import { updateCategory, deleteCategory } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return updateCategory(request, id);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteCategory(request, id);
}
