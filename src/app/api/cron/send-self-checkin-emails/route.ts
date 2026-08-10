import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { sendSelfCheckinEmail, loadPaymentChannels } from "@/backend/utils/selfCheckinEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/send-self-checkin-emails
 *
 * NOT the check-in module. `/api/send-checkin-email` is a separate, existing
 * thing: it fires when an admin marks a booking "Checked In" and confirms an
 * arrival that already happened. THIS route sends the PRE-ARRIVAL self
 * check-in instructions — where the key is, the unit number, the house rules —
 * so the guest can let themselves in before anyone marks them arrived.
 *
 * Run this every ~15 minutes; it is idempotent — a booking is stamped with
 * `self_checkin_email_sent_at` only after its email actually goes out.
 *
 * Send time, in Asia/Manila: 1 hour before check-in, for every stay type
 * (Daycation, Nightcation, Overnight all share this rule).
 *
 * Protected by CRON_SECRET, and fails closed in production if it isn't set.
 */
const MANILA = "Asia/Manila";

interface DueBooking {
  id: string;
  booking_id: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  first_name: string;
  email: string;
  remaining_balance: string | number | null;
  security_deposit: string | number | null;
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron/send-self-checkin-emails] CRON_SECRET is not set — refusing to run in production.");
      return NextResponse.json({ success: false, error: "Cron not configured" }, { status: 503 });
    }
    // Non-production: allow unauthenticated local triggering for testing.
  } else {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Only live bookings, only the main guest (first row — same convention as
    // bookingController), only ones whose send time has arrived, and never
    // backfill a stay whose check-in date has already passed.
    //
    // 'checked-in' belongs in the status list: an owner may mark a guest
    // arrived days ahead, which deliberately does NOT send the instructions
    // early (see handleCheckInOnly in admin/owners). Those rows are still
    // waiting on this cron to release the mail at the normal moment, so
    // excluding them would mean the guest never gets it at all.
    const { rows } = await pool.query<DueBooking>(
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
      WHERE b.status IN ('approved', 'confirmed', 'checked-in')
        AND b.self_checkin_email_sent_at IS NULL
        AND bg.email IS NOT NULL
        AND bg.email <> ''
        AND b.check_in_date >= (NOW() AT TIME ZONE $1)::date
        AND ((b.check_in_date + b.check_in_time) - INTERVAL '1 hour') AT TIME ZONE $1 <= NOW()
      ORDER BY b.check_in_date, b.check_in_time
      `,
      [MANILA],
    );

    let sent = 0;
    const failed: string[] = [];

    // One lookup for the whole run — the GCash/bank details are the same for
    // every booking in it.
    const channels = await loadPaymentChannels();

    for (const b of rows) {
      try {
        await sendSelfCheckinEmail({
          email: b.email,
          guestName: b.first_name,
          bookingId: b.booking_id,
          balanceAmount: Number(b.remaining_balance ?? 0),
          // No deposit row yet means it hasn't been collected, not that it is
          // waived — fall back to the standard amount so the guest still knows
          // to bring it.
          depositAmount: b.security_deposit == null ? undefined : Number(b.security_deposit),
          channels,
          checkInDate: b.check_in_date,
          checkInTime: b.check_in_time,
          checkOutDate: b.check_out_date,
          checkOutTime: b.check_out_time,
        });
        // Stamp only after a successful send, so a transient SMTP failure
        // simply retries on the next run rather than silently skipping a guest.
        await pool.query(`UPDATE booking SET self_checkin_email_sent_at = NOW() WHERE id = $1`, [b.id]);
        sent++;
      } catch (err) {
        console.error(`[cron/send-self-checkin-emails] failed for ${b.booking_id}:`, err);
        failed.push(b.booking_id);
      }
    }

    return NextResponse.json({
      success: true,
      summary: { due: rows.length, sent, failed: failed.length },
      failed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("[cron/send-self-checkin-emails] error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
