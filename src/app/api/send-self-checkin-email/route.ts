import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import { sendSelfCheckinEmail, loadPaymentChannels } from "@/backend/utils/selfCheckinEmail";

export const runtime = "nodejs";

/**
 * POST /api/send-self-checkin-email  { booking_id: "DL-BK..." | "<uuid>" }
 *
 * Manual re-send of the self check-in email. The scheduler
 * (/api/cron/send-checkin-emails) handles the normal automatic send; this is
 * the escape hatch for staff when a guest never received it. Staff-only.
 *
 * Re-sending re-stamps `self_checkin_email_sent_at`, which also prevents the
 * cron from sending a duplicate afterwards.
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
        to_char(b.check_in_date,  'YYYY-MM-DD')  AS check_in_date,
        to_char(b.check_in_time,  'HH12:MI AM')  AS check_in_time,
        to_char(b.check_out_date, 'YYYY-MM-DD')  AS check_out_date,
        to_char(b.check_out_time, 'HH12:MI AM')  AS check_out_time,
        bg.first_name,
        bg.email,
        bp.remaining_balance,
        bd.amount AS security_deposit
      FROM booking b
      JOIN LATERAL (
        SELECT first_name, email
        FROM booking_guests
        WHERE booking_id = b.id
        ORDER BY id
        LIMIT 1
      ) bg ON TRUE
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      LEFT JOIN booking_security_deposits bd ON b.id = bd.booking_id
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

    await sendSelfCheckinEmail({
      email: b.email,
      guestName: b.first_name,
      bookingId: b.booking_id,
      balanceAmount: Number(b.remaining_balance ?? 0),
      depositAmount: b.security_deposit == null ? undefined : Number(b.security_deposit),
      channels: await loadPaymentChannels(),
      checkInDate: b.check_in_date,
      checkInTime: b.check_in_time,
      checkOutDate: b.check_out_date,
      checkOutTime: b.check_out_time,
    });

    await pool.query(`UPDATE booking SET self_checkin_email_sent_at = NOW() WHERE id = $1`, [b.id]);

    return NextResponse.json({ success: true, message: "Self check-in email sent" });
  } catch (error) {
    console.error("Self check-in email error:", error);
    return NextResponse.json({ success: false, error: "Failed to send self check-in email" }, { status: 500 });
  }
}
