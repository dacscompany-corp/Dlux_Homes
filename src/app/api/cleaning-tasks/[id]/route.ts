import { NextRequest, NextResponse } from "next/server";
import {
  getCleaningTaskById,
  updateCleaningTask,
} from "@/backend/controller/cleanersController";
import { requireAdmin, requireCleaningTaskAccess } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// Alias of /api/admin/cleaners/tasks/[id], kept for older callers, with the
// same rules. It used to let ANY employee PUT/PATCH any status onto any task —
// a direct way around inspection. Now:
//   GET        — Owner/CSR any task; a Cleaner only their own.
//   PUT/PATCH  — Owner/CSR only, and still validated against the workflow
//                sequence. Cleaners use /api/admin/cleaners/tasks/[id]/start
//                and /complete.
export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params;
  const guard = await requireCleaningTaskAccess(id);
  if (!guard.ok) return guard.response;
  return getCleaningTaskById(request, { id: guard.actorId, role: guard.role });
}

async function adminUpdate(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return updateCleaningTask(request, {
    id: (guard.session.user as { id?: string }).id ?? null,
    role: guard.role,
  });
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  await params;
  return adminUpdate(request);
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  await params;
  return adminUpdate(request);
}
