import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { sendCheckoutReminderEmail } from "@/backend/utils/checkoutReminderEmail";

export const runtime = "nodejs";

/**
 * POST /api/send-checkout-reminder-email  { booking_id: "DL-BK..." | "<uuid>" }
 *
 * Manual re-send of the check-out reminder. The scheduler
 * (/api/cron/send-checkout-reminders) handles the normal automatic send 2 hours
 * before check-out; this is the escape hatch for staff. Staff-only.
 *
 * Re-sending re-stamps `checkout_reminder_email_sent_at`, which also prevents
 * the cron from sending a duplicate afterwards.
 */
export async function POST(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  try {
    const { booking_id: bookingRef } = await request.json();
    if (!bookingRef) {
      return NextResponse.json({ success: false, error: "booking_id is required" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.booking_id,
        b.room_name,
        to_char(b.check_in_date,  'YYYY-MM-DD') AS check_in_date,
        to_char(b.check_in_time,  'HH12:MI AM') AS check_in_time,
        to_char(b.check_out_date, 'YYYY-MM-DD') AS check_out_date,
        to_char(b.check_out_time, 'HH12:MI AM') AS check_out_time,
        (b.check_out_date = (NOW() AT TIME ZONE 'Asia/Manila')::date) AS is_today,
        EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Manila'))::int    AS manila_hour,
        bg.first_name,
        bg.email
      FROM booking b
      JOIN LATERAL (
        SELECT first_name, email
        FROM booking_guests
        WHERE booking_id = b.id
        ORDER BY id
        LIMIT 1
      ) bg ON TRUE
      WHERE b.booking_id = $1 OR b.id::text = $1
      LIMIT 1
      `,
      [bookingRef],
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    const b = rows[0];
    if (!b.email) {
      return NextResponse.json({ success: false, error: "This booking has no guest email" }, { status: 400 });
    }

    await sendCheckoutReminderEmail({
      email: b.email,
      guestName: b.first_name,
      bookingId: b.booking_id,
      roomName: b.room_name,
      checkInDate: b.check_in_date,
      checkInTime: b.check_in_time,
      checkOutDate: b.check_out_date,
      checkOutTime: b.check_out_time,
      isToday: b.is_today,
      hour: b.manila_hour,
    });

    await pool.query(`UPDATE booking SET checkout_reminder_email_sent_at = NOW() WHERE id = $1`, [b.id]);

    return NextResponse.json({ success: true, message: "Check-out reminder sent" });
  } catch (error) {
    console.error("Check-out reminder email error:", error);
    return NextResponse.json({ success: false, error: "Failed to send check-out reminder" }, { status: 500 });
  }
}
