import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { createNotificationForUser } from "@/backend/utils/notificationHelper";
import { requireAdmin } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// PATCH /api/admin/bookings/:id/date-change
// Owner/CSR approve or reject a guest's pending one-time date-change request
// (created by /api/bookings/[id]/request-date-change).
//
// Body: { action: "approve" | "reject" }
const DAY = 24 * 60 * 60 * 1000;
const ACTIVE = ["pending", "approved", "confirmed", "on-going"];
// Postgres exclusion-violation code — raised by booking_no_double_book_active
// when the approved dates collide with another active booking for the room.
const EXCLUSION_VIOLATION = "23P01";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "";

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "`action` must be 'approve' or 'reject'." }, { status: 400 });
    }

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT id, booking_id, status, room_name, check_in_date, check_out_date,
              requested_new_date, user_id
         FROM booking
        WHERE id::text = $1 OR booking_id = $1
        FOR UPDATE`,
      [id]
    );

    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const booking = found.rows[0];

    if (!booking.requested_new_date) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This booking has no pending date-change request." }, { status: 409 });
    }
    if (action === "approve" && !ACTIVE.includes(booking.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This booking is no longer active; the date change can't be approved." }, { status: 409 });
    }

    let updated;
    if (action === "approve") {
      const oldCheckIn = new Date(booking.check_in_date + "T00:00:00");
      const oldCheckOut = new Date(booking.check_out_date + "T00:00:00");
      const stayDays = Math.round((oldCheckOut.getTime() - oldCheckIn.getTime()) / DAY);

      const newCheckIn = new Date(booking.requested_new_date + "T00:00:00");
      const newCheckOut = new Date(newCheckIn.getTime() + stayDays * DAY);
      const newCheckOutStr = newCheckOut.toISOString().slice(0, 10);

      updated = await client.query(
        `UPDATE booking
            SET check_in_date = $2,
                check_out_date = $3,
                requested_new_date = NULL,
                date_change_count = date_change_count + 1
          WHERE id = $1
          RETURNING id, booking_id, check_in_date, check_out_date`,
        [booking.id, booking.requested_new_date, newCheckOutStr]
      );
    } else {
      updated = await client.query(
        `UPDATE booking
            SET requested_new_date = NULL
          WHERE id = $1
          RETURNING id, booking_id, check_in_date, check_out_date`,
        [booking.id]
      );
    }

    await client.query("COMMIT");

    if (booking.user_id) {
      try {
        const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        const row = updated.rows[0];
        await createNotificationForUser(booking.user_id, {
          title: action === "approve" ? "Date Change Approved" : "Date Change Not Approved",
          message:
            action === "approve"
              ? `Your booking ${booking.booking_id} (${booking.room_name || "room"}) has been moved to ${fmt(row.check_in_date)} – ${fmt(row.check_out_date)}.`
              : `Your requested date change for booking ${booking.booking_id} could not be accommodated. Please message us if you have questions.`,
          notificationType: "Booking",
        });
      } catch (notifyError) {
        console.error("date-change decision notification failed:", notifyError);
      }
    }

    return NextResponse.json({ ok: true, data: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("admin date-change decision error:", error);
    if ((error as { code?: string })?.code === EXCLUSION_VIOLATION) {
      return NextResponse.json(
        { error: "Those dates are no longer available for this room. Reject the request or confirm different dates with the guest first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not process this request. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}