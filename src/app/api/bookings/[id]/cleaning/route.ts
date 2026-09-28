import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { updateCleaningTask } from "@/backend/controller/cleanersController";
import { requireAdmin } from "@/backend/utils/requireAdmin";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// Legacy "set this booking's cleaning status" endpoint.
//
// It used to be requireEmployee() and wrote the status straight to
// booking_cleaning — so any cleaner could mark any booking's room 'inspected'
// and skip both the checklist and the inspection. It is now Owner/CSR only and
// goes through the same workflow check as every other status write
// (Assigned → In Progress → Awaiting Inspection → Ready). Ready itself is only
// reachable through /api/admin/cleaners/tasks/[id]/inspect/approve.
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const cleaningStatus = (body as { cleaning_status?: unknown }).cleaning_status;

  if (typeof cleaningStatus !== "string" || !cleaningStatus) {
    return NextResponse.json(
      { success: false, error: "cleaning_status is required" },
      { status: 400 }
    );
  }

  if (cleaningStatus === "ready" || cleaningStatus === "inspected" || cleaningStatus === "cleaned") {
    return NextResponse.json(
      {
        success: false,
        error: "Rooms become Ready only through inspection approval (/api/admin/cleaners/tasks/[id]/inspect/approve).",
      },
      { status: 400 }
    );
  }

  const taskRes = await pool.query(
    `SELECT bc.id::text AS id
       FROM booking_cleaning bc
       JOIN booking b ON b.id = bc.booking_id
      WHERE b.id::text = $1 OR b.booking_id = $1
      LIMIT 1`,
    [id]
  );
  const taskId: string | undefined = taskRes.rows[0]?.id;
  if (!taskId) {
    return NextResponse.json(
      { success: false, error: "Booking cleaning record not found" },
      { status: 404 }
    );
  }

  const actorId = (guard.session.user as { id?: string }).id ?? null;
  const url = new URL(`/api/admin/cleaners/tasks/${taskId}`, request.url);
  const forwarded = new Request(url, {
    method: "PUT",
    headers: request.headers,
    body: JSON.stringify({ cleaning_status: cleaningStatus, changed_by: actorId }),
  }) as NextRequest;

  return updateCleaningTask(forwarded, { id: actorId, role: guard.role });
}
