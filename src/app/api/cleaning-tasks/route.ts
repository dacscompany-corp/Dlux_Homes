import { NextRequest, NextResponse } from "next/server";
import { getAllCleaningTasks } from "@/backend/controller/cleanersController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// Cleaning tasks are staff-only (Owner/CSR/Cleaner). Was fully unauthenticated.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  return getAllCleaningTasks(request);
}
