import { NextRequest, NextResponse } from "next/server";
import {
  createBookingPayment,
  getAllBookingPayments,
} from "@/backend/controller/bookingPaymentsController";
import { requireAdmin } from "@/backend/utils/requireAdmin";

/**
 * Collection routes for booking payments
 *
 * GET  /api/booking-payments      -> getAllBookingPayments (supports ?status=... & ?q=...)
 * POST /api/booking-payments      -> createBookingPayment
 */

// Both collection routes are admin-only (Owner/CSR).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return getAllBookingPayments(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return createBookingPayment(request);
}
