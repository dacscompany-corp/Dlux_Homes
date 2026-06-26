import { NextRequest, NextResponse } from "next/server";
import { getBookingById, updateBookingDetails, updateBookingStatus, deleteBooking } from "@/backend/controller/bookingController";
import { requireAdmin, requireEmployee, requireBookingAccess } from "@/backend/utils/requireAdmin";
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

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  // Cleaning-status updates are staff-only (Owner/CSR/Cleaner).
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { cleaning_status, assigned_to, cleaned_at, inspected_at, cleaning_time_in } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking ID is required",
        },
        { status: 400 }
      );
    }

    // If cleaning_status is provided, validate it
    if (cleaning_status) {
      const validStatuses = ["pending", "in-progress", "cleaned", "inspected"];
      if (!validStatuses.includes(cleaning_status)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid cleaning status",
          },
          { status: 400 }
        );
      }
    }

    // Update the booking_cleaning table instead of bookings
    let query = `
      UPDATE booking_cleaning
      SET
    `;
    const updateFields: string[] = [];
    const params_arr: string[] = [];
    let paramCount = 1;

    if (cleaning_status !== undefined) {
      updateFields.push(`cleaning_status = $${paramCount}`);
      params_arr.push(cleaning_status);
      paramCount++;
    }

    if (assigned_to !== undefined) {
      updateFields.push(`assigned_to = $${paramCount}`);
      params_arr.push(assigned_to);
      paramCount++;
    }

    if (cleaning_time_in !== undefined) {
      updateFields.push(`cleaning_time_in = $${paramCount}`);
      params_arr.push(cleaning_time_in);
      paramCount++;
    }

    if (cleaned_at !== undefined) {
      updateFields.push(`cleaned_at = $${paramCount}`);
      params_arr.push(cleaned_at);
      paramCount++;
    }

    if (inspected_at !== undefined) {
      updateFields.push(`inspected_at = $${paramCount}`);
      params_arr.push(inspected_at);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No fields to update",
        },
        { status: 400 }
      );
    }

    query += updateFields.join(", ");
    query += ` WHERE booking_id = $${paramCount}
      RETURNING *
    `;
    params_arr.push(id);

    console.log("Executing query:", query);
    console.log("With params:", params_arr);

    const result = await pool.query(query, params_arr);

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cleaning record not found for this booking",
        },
        { status: 404 }
      );
    }

    console.log("Update successful:", result.rows[0]);

    return NextResponse.json(
      {
        success: true,
        data: result.rows[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating cleaning record:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update cleaning record",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  await params;
  // Admin-only — guests cannot delete bookings (no-cancellation policy).
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteBooking(request);
}
