import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserBookings } from "@/backend/controller/bookingController";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>
}

// A user's bookings expose guest PII (name, email, payment status, deposit).
// Only the user themselves — or staff (Owner/CSR) — may read them. Previously
// this route had NO auth at all: anyone who knew a user's UUID could dump their
// full booking history (IDOR). Cleaner is excluded: cleaners work off assigned
// cleaning tasks, not raw per-user booking lists.
const STAFF_ROLES = new Set(["Owner", "CSR"]);

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { userId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role ?? "";
  const callerId = (session.user as { id?: string }).id;
  const isStaff = STAFF_ROLES.has(role);

  if (!isStaff && String(callerId) !== String(userId)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return getUserBookings(request, { params: Promise.resolve({ userId }) });
}
