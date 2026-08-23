import { NextRequest, NextResponse } from "next/server";
import { getCategories, createCategory } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getCategories();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createCategory(request);
}
