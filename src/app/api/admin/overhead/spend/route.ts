import { NextRequest, NextResponse } from "next/server";
import { createSpend } from "@/backend/controller/overheadSpendController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createSpend(request, guard.session.user.email ?? "");
}
