import { NextResponse } from "next/server";
import { getAllTimeTotals } from "@/backend/controller/overheadReportsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

// Lifetime revenue and overhead for Finance → Profitability's "All time" view.
// Owner only, like the rest of /api/admin/overhead.
export async function GET(): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getAllTimeTotals();
}
