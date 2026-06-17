import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { createNotificationsForRoles } from "@/backend/utils/notificationHelper";

export const runtime = "nodejs";

// Guest-initiated cancellation. Narrow, least-privilege endpoint: it can only
// move an active booking to 'cancelled' (never any other status), and only
// while the booking is still cancellable. Owner + CSR are notified.
const CANCELLABLE = ["pending", "approved", "confirmed", "on-going"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    // Match on either the UUID or the friendly booking_id (BK-…).
    const found = await client.query(
      `SELECT b.id, b.booking_id, b.status, b.room_name,
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

    if (booking.status === "cancelled") {
      return NextResponse.json({ ok: true, message: "This booking is already cancelled.", status: "cancelled" });
    }
    if (!CANCELLABLE.includes(booking.status)) {
      return NextResponse.json(
        { error: "This booking can no longer be cancelled. Please contact support." },
        { status: 409 }
      );
    }

    await client.query(
      `UPDATE booking SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [booking.id]
    );

    // Notify staff (non-fatal).
    try {
      const guestName = `${booking.first_name || ""} ${booking.last_name || ""}`.trim() || "A guest";
      await createNotificationsForRoles(["Owner", "CSR"], {
        title: "Booking Cancellation Requested",
        message: `${guestName} cancelled booking ${booking.booking_id} (${booking.room_name || "room"}).${reason ? ` Reason: ${reason}` : ""}`,
        notificationType: "Booking",
      });
    } catch (notifyError) {
      console.error("cancel notification failed:", notifyError);
    }

    return NextResponse.json({ ok: true, message: "Your booking has been cancelled.", status: "cancelled" });
  } catch (error) {
    console.error("cancel booking error:", error);
    return NextResponse.json({ error: "Could not cancel the booking. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
