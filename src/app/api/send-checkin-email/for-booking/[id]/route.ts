import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";

// Send the house-rules / check-in email for one booking, on demand.
//
// This used to fire automatically when a booking's status became 'checked-in'.
// Check-in and payment are now separate steps: staff mark the guest arrived as
// soon as the check-in window opens, then collect the balance and deposit when
// the guest is actually in front of them. The house rules belong with that
// second step — that's the moment the guest is handed the keys — so the send is
// triggered from there instead of from the status change.
//
// Staff-only: it addresses the guest on the booking, so it must not be
// triggerable by an arbitrary caller with a booking id.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Booking ID is required" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT b.booking_id, b.room_name, b.check_in_date, b.check_in_time,
              b.check_out_date, b.check_out_time, b.adults, b.children, b.infants,
              bg.first_name, bg.last_name, bg.email
       FROM booking b
       JOIN booking_guests bg ON b.id = bg.booking_id
       WHERE (b.id::text = $1 OR b.booking_id = $1)
         AND bg.id = (
           SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1
         )
       LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    const b = rows[0];
    if (!b.email) {
      return NextResponse.json({ success: false, error: "This booking has no guest email" }, { status: 400 });
    }

    const emailResponse = await fetch(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/send-checkin-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: b.first_name,
          lastName: b.last_name,
          email: b.email,
          bookingId: b.booking_id,
          roomName: b.room_name,
          checkInDate: b.check_in_date ? new Date(b.check_in_date).toLocaleDateString() : "",
          checkInTime: b.check_in_time,
          checkOutDate: b.check_out_date ? new Date(b.check_out_date).toLocaleDateString() : "",
          checkOutTime: b.check_out_time,
          guests: `${b.adults} Adults, ${b.children} Young Adults, ${b.infants} Children`,
        }),
      },
    );

    if (!emailResponse.ok) {
      return NextResponse.json({ success: false, error: "Failed to send the check-in email" }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: "Check-in email sent" });
  } catch (error) {
    console.error("Error sending check-in email for booking:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
