import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { sendCheckoutReminderEmail } from "@/backend/utils/checkoutReminderEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/send-checkout-reminders
 *
 * NOT the check-out module. `/api/send-checkout-email` is a separate, existing
 * thing that fires when an admin marks a booking "Checked Out". THIS route
 * sends the reminder 2 HOURS BEFORE check-out, while the guest is still in the
 * unit — check-out instructions plus the security-deposit refund request.
 *
 * Run every ~15 minutes; idempotent — a booking is stamped with
 * `checkout_reminder_email_sent_at` only after its email actually goes out.
 *
 * Send time (Asia/Manila): (check_out_date + check_out_time) - 2 hours.
 * Unlike the self check-in email there's no per-stay-type branch: every stay
 * gets reminded 2 hours before it ends.
 *
 * Protected by CRON_SECRET, and fails closed in production if it isn't set.
 */
const MANILA = "Asia/Manila";

interface DueBooking {
  id: string;
  booking_id: string;
  room_name: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  is_today: boolean;
  manila_hour: number;
  first_name: string;
  email: string;
  security_deposit: number | string | null;
  deposit_tier1_amount: number | string | null;
  deposit_tier2_amount: number | string | null;
  deposit_tier3_amount: number | string | null;
  deposit_tier4_amount: number | string | null;
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron/send-checkout-reminders] CRON_SECRET is not set — refusing to run in production.");
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
    // Live bookings only, main guest only (first row — the convention used in
    // bookingController), whose send time has arrived but whose check-out has
    // NOT yet passed. That upper bound matters: a reminder delivered after the
    // guest has already left is noise, so a long cron outage skips it instead
    // of sending something useless.
    const { rows } = await pool.query<DueBooking>(
      `
      SELECT
        b.id,
        b.booking_id,
        b.room_name,
        to_char(b.check_in_date,  'YYYY-MM-DD') AS check_in_date,
        to_char(b.check_in_time,  'HH12:MI AM') AS check_in_time,
        to_char(b.check_out_date, 'YYYY-MM-DD') AS check_out_date,
        to_char(b.check_out_time, 'HH12:MI AM') AS check_out_time,
        (b.check_out_date = (NOW() AT TIME ZONE $1)::date)                AS is_today,
        EXTRACT(HOUR FROM (NOW() AT TIME ZONE $1))::int                   AS manila_hour,
        bg.first_name,
        bg.email,
        h.security_deposit,
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
      LEFT JOIN havens h ON h.haven_name = b.room_name
      WHERE b.status IN ('approved', 'confirmed', 'checked-in')
        AND b.checkout_reminder_email_sent_at IS NULL
        AND bg.email IS NOT NULL
        AND bg.email <> ''
        -- send window opens 2 hours before check-out …
        AND (((b.check_out_date + b.check_out_time) - INTERVAL '2 hours') AT TIME ZONE $1) <= NOW()
        -- … and closes at check-out itself
        AND ((b.check_out_date + b.check_out_time) AT TIME ZONE $1) > NOW()
      ORDER BY b.check_out_date, b.check_out_time
      `,
      [MANILA],
    );

    let sent = 0;
    const failed: string[] = [];

    for (const b of rows) {
      try {
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
          securityDeposit: b.security_deposit != null ? Number(b.security_deposit) : undefined,
          depositTier1Amount: b.deposit_tier1_amount != null ? Number(b.deposit_tier1_amount) : undefined,
          depositTier2Amount: b.deposit_tier2_amount != null ? Number(b.deposit_tier2_amount) : undefined,
          depositTier3Amount: b.deposit_tier3_amount != null ? Number(b.deposit_tier3_amount) : undefined,
          depositTier4Amount: b.deposit_tier4_amount != null ? Number(b.deposit_tier4_amount) : undefined,
        });
        // Stamp only after a successful send, so a transient SMTP failure
        // retries on the next run rather than silently skipping a guest.
        await pool.query(`UPDATE booking SET checkout_reminder_email_sent_at = NOW() WHERE id = $1`, [b.id]);
        sent++;
      } catch (err) {
        console.error(`[cron/send-checkout-reminders] failed for ${b.booking_id}:`, err);
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
    console.error("[cron/send-checkout-reminders] error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
