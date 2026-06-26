import { NextRequest, NextResponse } from "next/server";
import {
  createBooking,
  getAllBookings,
  updateBookingStatus,
  deleteBooking,
} from "@/backend/controller/bookingController";
import { notifyAdminOfBooking } from "@/backend/utils/messengerNotify";
import { requireAdmin } from "@/backend/utils/requireAdmin";

// GET /api/bookings — admin-only list of ALL bookings (Owner/CSR).
// Guests read their own via /api/bookings/user/[id] and /api/bookings/[id].
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return getAllBookings(req);
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  // Read the body up-front (for the admin alert) before the controller consumes it.
  const body = await req.clone().json().catch(() => null);
  const res = await createBooking(req);
  // On success, ping the admin's Messenger that a new request arrived (best-effort).
  try {
    const json = await res.clone().json();
    if (body && json?.success !== false) {
      notifyAdminOfBooking(body).catch(() => {});
    }
  } catch { /* ignore — never block the booking response */ }
  return res;
}

// PUT /api/bookings — admin-only: approve / reject / check-in / check-out.
export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return updateBookingStatus(req);
}

// DELETE /api/bookings — admin-only.
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteBooking(req);
}