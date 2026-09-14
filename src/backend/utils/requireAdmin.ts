// Guard for /api/admin/** routes. Returns either a NextResponse (401/403) that
// the route should return immediately, or the session for the authorized user.
//
// Usage:
//   const guard = await requireAdmin();
//   if (!guard.ok) return guard.response;
//   const session = guard.session;
//
// NOT YET APPLIED. Will be rolled out route-by-route in a follow-up commit
// after auth.ts + resend-otp were detangled from the /api/admin/send-email
// HTTP hop (so locking down send-email no longer breaks the lockout flow).
//
// Explicitly OUT of scope for this guard — these routes are public by design
// and must NOT call requireAdmin():
//   - /api/admin/login           (it IS the login endpoint)
//   - /api/admin/send-email      (called by unauthenticated OtpVerification UI)
//   - /api/admin/resend-otp      (called by locked-out user)
//   - /api/admin/verify-otp      (called by locked-out user)
//   - /api/admin/change-password (authenticates via old password in body)
//   - /api/admin/haven/[id]/times (called from public Checkout.tsx for guests)
//   - /api/payment-methods GET   (called from public Checkout.tsx for guests)
//   - /api/admin/pricing-calendar GET (called from public checkout/rooms pages
//     to price weekend/holiday stays — PUT/POST/DELETE remain admin-only)
//
// Routes with a CONDITIONAL public branch (read the route file for the carve-out):
//   - /api/admin/employees GET with ?role=CSR → minimal public projection
//     for Components/MessageButton.tsx (chat widget on the public marketplace).
//     All other GET shapes + POST are admin-only.
//   - /api/admin/blocked-dates GET with ?haven_id=<uuid> → minimal projection
//     (id, from_date, to_date, status) for Components/HeroSection/DateRangePicker
//     (guest checkout). No haven_id → admin-only management view.
//   - /api/admin/sync-sheets POST → valid CRON bearer OR admin session.
//
// Routes that use requireEmployee() instead (Owner+CSR+Cleaner):
//   - /api/admin/cleaners/**         (cleaner dashboards)
//   - /api/admin/employees/[id] GET, PUT (any role's own profile page)
//   - /api/admin/activity-logs POST  (self-logging from any role)
//   - /api/admin/employee-activity POST (same)
//
// Routes that use requireOwner() instead (Owner only):
//   - /api/admin/overhead/**   (financial: rent, dues, margins)

import { getServerSession, type Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";

const ADMIN_ROLES = new Set(["Owner", "CSR"]);
const EMPLOYEE_ROLES = new Set(["Owner", "CSR", "Cleaner"]);
const OWNER_ROLES = new Set(["Owner"]);

// On ok=true, session.user is guaranteed non-null (the guard rejects sessions
// without a user). Callers can read session.user.email directly — no `!` needed.
export type AuthedSession = Session & { user: NonNullable<Session["user"]> };
export type GuardResult =
  | { ok: true; session: AuthedSession; role: string }
  | { ok: false; response: NextResponse };

// Internal — actual session+role check. requireAdmin/requireEmployee wrap it.
async function requireRole(allowed: Set<string>): Promise<GuardResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const role = (session.user as { role?: string }).role;

  if (!role || !allowed.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: session as AuthedSession, role };
}

// Owner + CSR — for true admin routes (employee/partner mgmt, payouts, audit
// logs, discounts, etc.). Use this by default for /api/admin/** routes.
export async function requireAdmin(): Promise<GuardResult> {
  return requireRole(ADMIN_ROLES);
}

// Owner + CSR + Cleaner — for routes that any authenticated employee uses,
// regardless of admin-ness:
//   - /api/admin/cleaners/**         (cleaner dashboards)
//   - /api/admin/employees/[id]      (any role's own profile page)
// Self-vs-other access is intentionally NOT enforced here (per 2026-05-25
// decision). The guard only blocks unauthenticated users and guests.
export async function requireEmployee(): Promise<GuardResult> {
  return requireRole(EMPLOYEE_ROLES);
}

/**
 * Owner-only guard. Used by /api/admin/overhead/** — overhead records carry
 * rent, dues and margin figures that CSR accounts must not see.
 */
export async function requireOwner(): Promise<GuardResult> {
  return requireRole(OWNER_ROLES);
}

// Result of requireBookingAccess. Distinct from GuardResult because a guest
// booking is deliberately viewable with NO session at all — `session` on
// success is therefore nullable, unlike every other guard in this file.
export type BookingAccessResult =
  | { ok: true; session: AuthedSession | null; role: string }
  | { ok: false; response: NextResponse };

// Ownership-aware guard for per-booking routes (/api/bookings/[id]). Closes the
// IDOR where any signed-in user could read/modify ANY booking by id.
//   - Owner/CSR  → may access any booking.
//   - Regular user → only their OWN booking (booking.user_id === session id).
//   - Unauthenticated → allowed ONLY for guest bookings (booking.user_id IS
//     NULL — see Dual Booking Access / "Continue as Guest" at checkout).
//     The friendly booking_id (DL-BK…) is the shared secret here, the same
//     way it works in the booking-confirmation email; account-owned bookings
//     still require signing in.
//   - Mismatched owner → 403.
// `id` may be the booking UUID (booking.id) or the friendly booking_id.
export async function requireBookingAccess(id: string): Promise<BookingAccessResult> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";

  // Admins (Owner/CSR) may access any booking.
  if (session?.user && ADMIN_ROLES.has(role)) {
    return { ok: true, session: session as AuthedSession, role };
  }

  if (id) {
    try {
      // id::text avoids a UUID cast error when `id` is the friendly booking_id.
      const result = await pool.query(
        `SELECT user_id FROM booking WHERE booking_id = $1 OR id::text = $1 LIMIT 1`,
        [id],
      );
      if (result.rows.length > 0) {
        const ownerId = result.rows[0].user_id;
        // Guest booking (no account attached) — anyone holding the booking id may view it.
        if (ownerId == null) {
          return { ok: true, session: (session as AuthedSession) ?? null, role };
        }
        // Account-owned booking — the caller must be signed in as that owner.
        const userId = (session?.user as { id?: string } | undefined)?.id;
        if (userId && String(ownerId) === String(userId)) {
          return { ok: true, session: session as AuthedSession, role };
        }
      }
    } catch (err) {
      console.error("requireBookingAccess lookup failed:", err);
    }
  }

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: false,
    response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
}

// Backwards-compat alias kept in case anything imports the old type name.
export type AdminGuardResult = GuardResult;
