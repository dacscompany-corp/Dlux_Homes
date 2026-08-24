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
        bd.amount AS security_deposit,
        h.security_deposit AS haven_security_deposit,
        h.deposit_tier1_amount,
        h.deposit_tier2_amount,
        h.deposit_tier3_amount,
        h.deposit_tier4_amount
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
      -- The haven's own deposit tiers. Without these a re-send quoted the
      -- ₱1,000 default even for a long stay owing a higher tier.
      LEFT JOIN havens h ON TRIM(h.haven_name) = TRIM(b.room_name)
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
      // A zero here means "not collected yet", not "waived" — there is no
      // waiver feature. Treating it as authoritative told the guest to bring
      // only the balance. Same `> 0` rule the collection flow already uses.
      depositAmount: Number(b.security_deposit) > 0 ? Number(b.security_deposit) : undefined,
      securityDeposit: b.haven_security_deposit != null ? Number(b.haven_security_deposit) : undefined,
      depositTier1Amount: b.deposit_tier1_amount != null ? Number(b.deposit_tier1_amount) : undefined,
      depositTier2Amount: b.deposit_tier2_amount != null ? Number(b.deposit_tier2_amount) : undefined,
      depositTier3Amount: b.deposit_tier3_amount != null ? Number(b.deposit_tier3_amount) : undefined,
      depositTier4Amount: b.deposit_tier4_amount != null ? Number(b.deposit_tier4_amount) : undefined,
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
