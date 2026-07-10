import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { sendSelfCheckinEmail } from "@/backend/utils/selfCheckinEmail";

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
 * Send time, in Asia/Manila:
 *   Daycation  (check-in before noon) → 12:00 AM on the check-in date
 *   Nightcation / Overnight (evening) → 2 hours before check-in
 *
 * Daycation is detected by its morning check-in time (07:00). Nightcation and
 * Overnight both check in at 19:00 and share the same "2 hours before" rule, so
 * they don't need to be told apart.
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
  adults: number;
  children: number;
  infants: number;
  first_name: string;
  email: string;
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
    const { rows } = await pool.query<DueBooking>(
      `
      SELECT
        b.id,
        b.booking_id,
        b.room_name,
        to_char(b.check_in_date,  'YYYY-MM-DD')  AS check_in_date,
        to_char(b.check_in_time,  'HH12:MI AM')  AS check_in_time,
        to_char(b.check_out_date, 'YYYY-MM-DD')  AS check_out_date,
        to_char(b.check_out_time, 'HH12:MI AM')  AS check_out_time,
        b.adults, b.children, b.infants,
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
      WHERE b.status IN ('approved', 'confirmed')
        AND b.self_checkin_email_sent_at IS NULL
        AND bg.email IS NOT NULL
        AND bg.email <> ''
        AND b.check_in_date >= (NOW() AT TIME ZONE $1)::date
        AND (
          CASE
            WHEN b.check_in_time < TIME '12:00'
              THEN b.check_in_date::timestamp                              -- midnight, day of check-in
            ELSE (b.check_in_date + b.check_in_time) - INTERVAL '2 hours'  -- 2h before check-in
          END
        ) AT TIME ZONE $1 <= NOW()
      ORDER BY b.check_in_date, b.check_in_time
      `,
      [MANILA],
    );

    let sent = 0;
    const failed: string[] = [];

    for (const b of rows) {
      const guests = `${b.adults} Adult${b.adults === 1 ? "" : "s"}, ${b.children} Young Adult${b.children === 1 ? "" : "s"}, ${b.infants} Child${b.infants === 1 ? "" : "ren"}`;
      try {
        await sendSelfCheckinEmail({
          email: b.email,
          guestName: b.first_name,
          bookingId: b.booking_id,
          roomName: b.room_name,
          checkInDate: b.check_in_date,
          checkInTime: b.check_in_time,
          checkOutDate: b.check_out_date,
          checkOutTime: b.check_out_time,
          guests,
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
