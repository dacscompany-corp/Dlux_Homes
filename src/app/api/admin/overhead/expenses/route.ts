import { NextRequest, NextResponse } from "next/server";
import { getExpenses, createExpense } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getExpenses(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createExpense(request, guard.session.user.email ?? "");
}
