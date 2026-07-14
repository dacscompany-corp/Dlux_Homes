import { NextRequest, NextResponse } from "next/server";
import { updateCleaningStatus } from "@/backend/controller/bookingController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// Flipping a booking's cleaning status is staff-only. Was unauthenticated —
// anyone could PUT {cleaning_status:...} for any booking id.
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  await params;
  return updateCleaningStatus(request);
}
