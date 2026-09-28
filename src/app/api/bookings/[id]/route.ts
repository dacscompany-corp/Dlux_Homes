import { NextRequest, NextResponse } from "next/server";
import { getBookingById, updateBookingDetails, updateBookingStatus, deleteBooking } from "@/backend/controller/bookingController";
import { requireAdmin, requireBookingAccess } from "@/backend/utils/requireAdmin";
import { updateCleaningTask } from "@/backend/controller/cleanersController";
import pool from "@/backend/config/db";

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  // Owner/CSR can read any booking; a guest only their own (closes IDOR / PII leak).
  const guard = await requireBookingAccess(id);
  if (!guard.ok) return guard.response;
  return getBookingById(request);
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;
  const peek = await request.clone().json().catch(() => ({} as any));
  const has = (k: string) => !!peek && typeof peek === "object" && k in peek;

  // The ONLY guest-facing use of this route is submitting payment proof for
  // their own booking ({ payment_method, payment_proof }). Anything else —
  // editing dates/room/guests or changing status — is admin-only.
  const isPaymentSubmission =
    (has("payment_method") || has("payment_proof")) &&
    !has("room_name") && !has("check_in_date") && !has("check_out_date") &&
    !has("guest_first_name") && !has("guest_last_name") && !has("guest_email") &&
    !has("guest_phone") && !has("add_ons") && !has("status");

  if (isPaymentSubmission) {
    const guard = await requireBookingAccess(id);
    if (!guard.ok) return guard.response;
    return updateBookingDetails(request);
  }

  // All other detail edits and every status change require admin (Owner/CSR).
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const isDetailsUpdate =
    has("room_name") || has("check_in_date") || has("check_out_date") ||
    has("guest_first_name") || has("guest_last_name") || has("guest_email") ||
    has("guest_phone") || has("payment_method") || has("add_ons");

  return isDetailsUpdate ? updateBookingDetails(request) : updateBookingStatus(request);
}

// Cleaning-status updates addressed by booking id. This used to be
// requireEmployee() writing cleaning_status / assigned_to straight into
// booking_cleaning — so any cleaner could mark any room 'inspected', or hand a
// task to anyone, and skip checklist, photos and inspection alike. It now takes
// the same path as every other status write: Owner/CSR only, validated against
// the workflow sequence, and never to Ready (that's inspection approval's job).
// Assignment goes through /api/admin/cleaners/tasks/[id]/assign so the fairness
// ledger stays correct.
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { cleaning_status, assigned_to } = (body ?? {}) as { cleaning_status?: unknown; assigned_to?: unknown };

  if (assigned_to !== undefined) {
    return NextResponse.json(
      { success: false, error: "Use /api/admin/cleaners/tasks/[id]/assign to assign or reassign a cleaner." },
      { status: 400 }
    );
  }
  if (typeof cleaning_status !== "string" || !cleaning_status) {
    return NextResponse.json({ success: false, error: "cleaning_status is required" }, { status: 400 });
  }
  if (cleaning_status === "ready" || cleaning_status === "inspected" || cleaning_status === "cleaned") {
    return NextResponse.json(
      { success: false, error: "Rooms become Ready only through inspection approval." },
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
      { success: false, error: "Cleaning record not found for this booking" },
      { status: 404 }
    );
  }

  const actorId = (guard.session.user as { id?: string }).id ?? null;
  const url = new URL(`/api/admin/cleaners/tasks/${taskId}`, request.url);
  const forwarded = new Request(url, {
    method: "PUT",
    headers: request.headers,
    body: JSON.stringify({ cleaning_status, changed_by: actorId }),
  }) as NextRequest;

  return updateCleaningTask(forwarded, { id: actorId, role: guard.role });
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  await params;
  // Admin-only — guests cannot delete bookings (no-cancellation policy).
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteBooking(request);
}
