import { NextRequest, NextResponse } from "next/server";
import {
  createBooking,
  getAllBookings,
  updateBookingStatus,
  deleteBooking,
} from "@/backend/controller/bookingController";
import { notifyAdminOfBooking } from "@/backend/utils/messengerNotify";

// GET /api/bookings
export async function GET(req: NextRequest) {
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

// PUT /api/bookings - THIS WAS MISSING!
export async function PUT(req: NextRequest) {
  return updateBookingStatus(req);
}

// DELETE /api/bookings
export async function DELETE(req: NextRequest) {
  return deleteBooking(req);
}