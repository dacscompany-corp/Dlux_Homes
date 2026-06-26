import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { createNotificationsForRoles } from "@/backend/utils/notificationHelper";
import { requireBookingAccess } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// D'Lux policy: NO cancellations, but a guest may request a ONE-TIME date change
// — only if requested at least 7 days before the scheduled check-in, and the new
// date is within 1 month of the original. This endpoint records the request and
// notifies Owner + CSR, who reschedule it (so availability + the one-time rule
// stay under staff control). It does not move the booking itself.
const ACTIVE = ["pending", "approved", "confirmed", "on-going"];
const DAY = 24 * 60 * 60 * 1000;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const { id } = await params;

    // Only the booking's owner (or Owner/CSR) may request a date change.
    const guard = await requireBookingAccess(id);
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const newDate = typeof body.new_date === "string" ? body.new_date : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!newDate) {
      return NextResponse.json({ error: "Please choose a new date." }, { status: 400 });
    }

    const found = await client.query(
      `SELECT b.id, b.booking_id, b.status, b.room_name, b.check_in_date, b.date_change_count,
              bg.first_name, bg.last_name
         FROM booking b
         LEFT JOIN booking_guests bg ON bg.booking_id = b.id
        WHERE b.id::text = $1 OR b.booking_id = $1
        LIMIT 1`,
      [id]
    );
    if (found.rows.length === 0) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    const booking = found.rows[0];
    if (!ACTIVE.includes(booking.status)) {
      return NextResponse.json({ error: "This booking can no longer be changed." }, { status: 409 });
    }
    // One-time rule: a booking may only ever have ONE date-change request.
    if (Number(booking.date_change_count) >= 1) {
      return NextResponse.json(
        { error: "You've already used your one-time date change. Please message us directly to arrange any further changes." },
        { status: 409 }
      );
    }

    // Policy checks.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const original = new Date(booking.check_in_date); original.setHours(0, 0, 0, 0);
    const requested = new Date(newDate + "T00:00:00");

    const daysUntilCheckIn = Math.floor((original.getTime() - today.getTime()) / DAY);
    if (daysUntilCheckIn < 7) {
      return NextResponse.json(
        { error: "Date changes must be requested at least 7 days before check-in." },
        { status: 422 }
      );
    }
    if (requested.getTime() < today.getTime()) {
      return NextResponse.json({ error: "Pick a future date." }, { status: 422 });
    }
    const maxDate = new Date(original.getTime() + 30 * DAY);
    if (requested.getTime() > maxDate.getTime()) {
      return NextResponse.json(
        { error: "The new date must be within 1 month of your original date." },
        { status: 422 }
      );
    }

    // Atomically record the request. The `date_change_count = 0` guard makes the
    // one-time rule race-safe: a concurrent second request updates zero rows.
    const recorded = await client.query(
      `UPDATE booking
          SET date_change_count = date_change_count + 1,
              date_change_requested_at = NOW(),
              requested_new_date = $2
        WHERE id = $1 AND date_change_count = 0
        RETURNING id`,
      [booking.id, newDate]
    );
    if (recorded.rows.length === 0) {
      return NextResponse.json(
        { error: "You've already used your one-time date change. Please message us directly to arrange any further changes." },
        { status: 409 }
      );
    }

    // Notify staff to action the reschedule.
    try {
      const guestName = `${booking.first_name || ""} ${booking.last_name || ""}`.trim() || "A guest";
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      await createNotificationsForRoles(["Owner", "CSR"], {
        title: "Date Change Requested",
        message: `${guestName} requested to move booking ${booking.booking_id} (${booking.room_name || "room"}) from ${fmt(original)} to ${fmt(requested)}.${reason ? ` Reason: ${reason}` : ""}`,
        notificationType: "Booking",
      });
    } catch (notifyError) {
      console.error("date-change notification failed:", notifyError);
    }

    return NextResponse.json({ ok: true, message: "Your date-change request has been sent. Our team will confirm it shortly." });
  } catch (error) {
    console.error("request-date-change error:", error);
    return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
