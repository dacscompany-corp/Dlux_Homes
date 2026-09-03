import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { pushCalendarUpdate } from "@/backend/controller/bookingController";
import { dispatchTransactionalEmail } from "@/backend/utils/dispatchEmail";
import { movedStayDates } from "@/lib/dateChange";
import { requireAdmin } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// PATCH /api/admin/bookings/:id/date-change
// Owner/CSR approve or reject a guest's pending one-time date-change request
// (created by /api/bookings/[id]/request-date-change).
//
// Body: { action: "approve" | "reject" }
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

    // DATE/TIME columns are cast to ::text here on purpose. node-postgres
    // returns them as JS Date objects, and the string arithmetic below (and the
    // email formatting after it) needs the calendar date Postgres actually
    // means, not a timezone-aware Date that can report the neighbouring day.
    // FOR UPDATE only locks `booking`, so the guest join is a separate read.
    const found = await client.query(
      `SELECT id, booking_id, status, room_name, user_id,
              check_in_date::text  AS check_in_date,
              check_out_date::text AS check_out_date,
              check_in_time::text  AS check_in_time,
              check_out_time::text AS check_out_time,
              requested_new_date::text AS requested_new_date
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
      // Keep the stay the same LENGTH, just start it on the requested day.
      // movedStayDates throws rather than guessing on unusable input — this
      // writes to a paid booking, so a silent fallback would move a real
      // guest's stay to a date nobody picked.
      let newCheckOutStr: string;
      try {
        newCheckOutStr = movedStayDates(
          booking.check_in_date,
          booking.check_out_date,
          booking.requested_new_date,
        ).checkOut;
      } catch (dateError) {
        await client.query("ROLLBACK");
        console.error("date-change: bad stored dates", dateError);
        return NextResponse.json(
          { error: "This booking's dates are unreadable, so it can't be moved automatically. Please check the record." },
          { status: 422 }
        );
      }

      updated = await client.query(
        `UPDATE booking
            SET check_in_date = $2,
                check_out_date = $3,
                requested_new_date = NULL,
                date_change_count = date_change_count + 1
          WHERE id = $1
          RETURNING id, booking_id, check_in_date::text AS check_in_date, check_out_date::text AS check_out_date`,
        [booking.id, booking.requested_new_date, newCheckOutStr]
      );
    } else {
      updated = await client.query(
        `UPDATE booking
            SET requested_new_date = NULL
          WHERE id = $1
          RETURNING id, booking_id, check_in_date::text AS check_in_date, check_out_date::text AS check_out_date`,
        [booking.id]
      );
    }

    await client.query("COMMIT");

    // Move the Google Calendar event to match. Without this the DB says one
    // thing and the host's calendar says another — the host prepares the unit
    // for the wrong night, which is the whole failure this feature exists to
    // avoid. Only on approve: a rejection leaves the booking exactly as it was.
    // pushCalendarUpdate never throws and never blocks, so a calendar outage
    // cannot undo a date change that is already committed.
    if (action === "approve") {
      await pushCalendarUpdate(booking.id);
    }

    // Tell the guest. This used to write a `notifications` row, which could
    // NEVER work for a guest: that table's FK targets employees(id) and its read
    // route inner-joins employees, so it is a staff inbox. Every guest insert
    // failed the FK and was swallowed by the catch below it — the change went
    // through and nobody told them. Email is the only channel a guest has.
    //
    // A send failure must not fail the decision (the dates are already
    // committed), so the status is reported back instead of thrown — the caller
    // can tell the operator to follow up by hand.
    const row = updated.rows[0];
    const guest = await client
      .query(
        `SELECT first_name, last_name, email
           FROM booking_guests
          WHERE booking_id = $1
          ORDER BY guest_index ASC NULLS LAST
          LIMIT 1`,
        [booking.id]
      )
      .catch(() => ({ rows: [] as Array<{ first_name?: string; last_name?: string; email?: string }> }));

    const recipient = guest.rows[0];
    let emailStatus;
    if (recipient?.email) {
      emailStatus = await dispatchTransactionalEmail(
        action === "approve" ? "date-change approved" : "date-change rejected",
        "/api/send-date-change-email",
        {
          decision: action === "approve" ? "approved" : "rejected",
          email: recipient.email,
          firstName: recipient.first_name,
          lastName: recipient.last_name,
          bookingId: booking.booking_id,
          roomName: booking.room_name,
          // `booking` holds the pre-decision values, `row` the post-decision
          // ones — on a rejection the two are identical, which is the point.
          oldCheckInDate: booking.check_in_date,
          oldCheckOutDate: booking.check_out_date,
          newCheckInDate: row.check_in_date,
          newCheckOutDate: row.check_out_date,
          checkInTime: booking.check_in_time,
          checkOutTime: booking.check_out_time,
        },
      );
    } else {
      const detail = `No guest email on booking ${booking.booking_id} — the guest was NOT notified of this date change.`;
      console.error(`❌ ${detail}`);
      emailStatus = { kind: "date-change", ok: false, detail };
    }

    return NextResponse.json({ ok: true, data: row, emailStatus });
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