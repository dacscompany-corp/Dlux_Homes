import { NextRequest, NextResponse } from "next/server";
import {
  getBookingPaymentById,
  updateBookingPayment,
  deleteBookingPayment,
} from "@/backend/controller/bookingPaymentsController";
import { requireAdmin } from "@/backend/utils/requireAdmin";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Item routes for booking payments
 *
 * GET    /api/booking-payments/:id   -> getBookingPaymentById
 * PUT    /api/booking-payments/:id   -> updateBookingPayment
 * PATCH  /api/booking-payments/:id   -> updateBookingPayment
 * DELETE /api/booking-payments/:id   -> deleteBookingPayment
 *
 * The controller functions parse the id from the request URL, so we simply
 * ensure `params` is awaited to conform with the route handler signature.
 */

// All booking-payment item routes are admin-only (Owner/CSR) — used solely by
// the CSR dashboard for payment review/collection. No guest flow touches these.
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await params;
  return getBookingPaymentById(request);
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await params;
  return updateBookingPayment(request);
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await params;
  return updateBookingPayment(request);
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await params;
  return deleteBookingPayment(request);
}
