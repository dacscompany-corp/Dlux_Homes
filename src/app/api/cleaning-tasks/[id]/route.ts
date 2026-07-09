import { NextRequest, NextResponse } from "next/server";
import {
  getCleaningTaskById,
  updateCleaningTask,
} from "@/backend/controller/cleanersController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// Staff-only (Owner/CSR/Cleaner). Was fully unauthenticated — anyone could read
// or flip the status of any cleaning task by id.
export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  await params;
  return getCleaningTaskById(request);
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  await params;
  return updateCleaningTask(request);
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  await params;
  return updateCleaningTask(request);
}
