import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/backend/controller/overheadReportsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getDashboard(request);
}
