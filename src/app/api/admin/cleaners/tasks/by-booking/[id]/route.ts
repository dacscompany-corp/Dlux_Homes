import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";

// Owner/CSR lookup of a booking's cleaning task by its friendly booking id.
//
// Read-only. It used to INSERT a bare 'pending' cleaning row whenever none
// existed — bypassing the fair rotation, the checkout schedule and the
// duplicate guard, and doing it from a GET. Cleaning tasks are now created only
// by the booking-confirmation / checkout processing in cleanersController.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id: bookingId } = await params;
    const result = await pool.query(
      `
      SELECT DISTINCT ON (bc.id)
        bc.id::text as cleaning_id,
        b.booking_id,
        b.id::text as booking_uuid,
        b.room_name as haven,
        bg.first_name as guest_first_name,
        bg.last_name as guest_last_name,
        bg.email as guest_email,
        bg.phone as guest_phone,
        b.check_in_date,
        b.check_in_time,
        b.check_out_date,
        b.check_out_time,
        bc.scheduled_for,
        bc.cleaning_status,
        bc.assigned_to::text as assigned_cleaner_id,
        bc.assignment_method,
        bc.unassigned_reason,
        e.first_name as cleaner_first_name,
        e.last_name as cleaner_last_name,
        e.employment_id as cleaner_employment_id,
        bc.cleaning_time_in,
        bc.cleaning_time_out,
        bc.cleaned_at,
        bc.inspected_at,
        bc.inspection_note
      FROM booking_cleaning bc
      INNER JOIN booking b ON bc.booking_id = b.id
      LEFT JOIN booking_guests bg ON bg.booking_id = b.id
      LEFT JOIN employees e ON bc.assigned_to = e.id
      WHERE b.booking_id = $1
      ORDER BY bc.id, bg.guest_index NULLS LAST, bg.id NULLS LAST
      LIMIT 1
      `,
      [bookingId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No cleaning task exists for this booking yet. One is created automatically when the booking is confirmed.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Error getting cleaning task by booking ID:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get cleaning task",
      },
      { status: 500 }
    );
  }
}
