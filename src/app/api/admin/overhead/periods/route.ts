import { NextRequest, NextResponse } from "next/server";
import { getPeriods } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getPeriods(request);
}
