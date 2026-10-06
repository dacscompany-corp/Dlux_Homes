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
//   - /api/admin/cleaners/**         (cleaner dashboards). Per-task routes under
//     /api/admin/cleaners/tasks/[id]/** additionally use
//     requireCleaningTaskAccess() so a cleaner can only touch their OWN task;
//     assign/reassign and the inspection routes are requireAdmin() only.
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

  // A staff account deactivated in Team → Staff Management keeps its signed-in
  // JWT until it expires, so the session alone isn't enough: look the account
  // up and turn it away here, on every guarded route. Only an explicit
  // 'inactive' blocks — a lookup error falls through rather than locking every
  // employee out because of a transient DB hiccup.
  const employeeId = (session.user as { id?: string }).id;
  if (employeeId) {
    try {
      const r = await pool.query(`SELECT status FROM employees WHERE id::text = $1 LIMIT 1`, [String(employeeId)]);
      if (r.rows[0]?.status === "inactive") {
        return {
          ok: false,
          response: NextResponse.json(
            { success: false, error: "This staff account has been deactivated.", code: "ACCOUNT_DEACTIVATED" },
            { status: 403 },
          ),
        };
      }
    } catch (err) {
      console.error("requireRole: staff status lookup failed:", err);
    }
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
// decision). The guard only blocks unauthenticated users and guests — a route
// that needs ownership checked must layer its own, the way the cleaning task
// routes use requireCleaningTaskAccess() below.
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

// Per-task guard for the cleaning workflow (/api/admin/cleaners/tasks/[id]/**).
//
// requireEmployee() alone is not enough here: it lets ANY signed-in cleaner read
// and write ANY cleaning task, so one cleaner could start, complete or inspect
// another cleaner's room straight from the API. This narrows that:
//   - Owner/CSR → any task.
//   - Cleaner    → only a task whose booking_cleaning.assigned_to is them.
//     An unassigned task is NOT theirs; unassigned work is Owner/CSR's to place.
//   - Anyone else / unauthenticated → 401 or 403 as usual.
//
// A missing task returns 404 rather than 403, so a cleaner can tell "no such
// task" from "not yours" without that leaking anything: the id came from their
// own request either way.
export type CleaningTaskAccess =
  | { ok: true; session: AuthedSession; role: string; actorId: string | null; assignedTo: string | null; status: string }
  | { ok: false; response: NextResponse };

export async function requireCleaningTaskAccess(taskId: string): Promise<CleaningTaskAccess> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard;

  const actorId = (guard.session.user as { id?: string }).id ?? null;

  let task: { assigned_to: string | null; cleaning_status: string } | undefined;
  try {
    const result = await pool.query(
      `SELECT assigned_to::text AS assigned_to, cleaning_status
         FROM booking_cleaning WHERE id = $1::uuid LIMIT 1`,
      [taskId],
    );
    task = result.rows[0];
  } catch (err) {
    console.error("requireCleaningTaskAccess lookup failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Could not verify access to this cleaning task" },
        { status: 500 },
      ),
    };
  }

  if (!task) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Cleaning task not found" },
        { status: 404 },
      ),
    };
  }

  if (!ADMIN_ROLES.has(guard.role)) {
    if (!actorId || !task.assigned_to || String(task.assigned_to) !== String(actorId)) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "This cleaning task is not assigned to you." },
          { status: 403 },
        ),
      };
    }
  }

  return {
    ok: true,
    session: guard.session,
    role: guard.role,
    actorId,
    assignedTo: task.assigned_to,
    status: task.cleaning_status,
  };
}

// Checklist-level counterpart of requireCleaningTaskAccess — for the checklist
// read/tick/save/submit endpoints and photo uploads, which address a checklist
// (or one of its tasks, or its booking) rather than a cleaning task id.
//
// Resolves the target to its booking_cleaning row and applies the same rule:
// Owner/CSR anything; a Cleaner only the checklist of a task assigned to them.
// With `forWrite`, a cleaner additionally needs that task to be In Progress —
// ticking items or uploading proof before cleaning has started, or after the
// room was handed in for inspection, is not part of the sequence.
export type ChecklistTarget =
  | { checklistId: string }
  | { checklistTaskId: string }
  | { bookingId: string };

export type ChecklistAccess =
  | { ok: true; session: AuthedSession; role: string; actorId: string | null; isAdmin: boolean }
  | { ok: false; response: NextResponse };

export async function requireChecklistAccess(
  target: ChecklistTarget,
  opts: { forWrite?: boolean } = {},
): Promise<ChecklistAccess> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard;

  const actorId = (guard.session.user as { id?: string }).id ?? null;
  const isAdmin = ADMIN_ROLES.has(guard.role);
  if (isAdmin) return { ok: true, session: guard.session, role: guard.role, actorId, isAdmin };

  const deny = (status: number, error: string): ChecklistAccess => ({
    ok: false,
    response: NextResponse.json({ success: false, error }, { status }),
  });

  let sql: string;
  let param: string;
  if ("checklistId" in target) {
    sql = `SELECT bc.assigned_to::text AS assigned_to, bc.cleaning_status
             FROM cleaning_checklists cl
             JOIN booking_cleaning bc ON bc.booking_id = cl.booking_id
            WHERE cl.id = $1::uuid LIMIT 1`;
    param = target.checklistId;
  } else if ("checklistTaskId" in target) {
    sql = `SELECT bc.assigned_to::text AS assigned_to, bc.cleaning_status
             FROM cleaning_tasks t
             JOIN cleaning_checklists cl ON cl.id = t.checklist_id
             JOIN booking_cleaning bc ON bc.booking_id = cl.booking_id
            WHERE t.id = $1::uuid LIMIT 1`;
    param = target.checklistTaskId;
  } else {
    sql = `SELECT assigned_to::text AS assigned_to, cleaning_status
             FROM booking_cleaning WHERE booking_id = $1::uuid LIMIT 1`;
    param = target.bookingId;
  }

  let row: { assigned_to: string | null; cleaning_status: string } | undefined;
  try {
    row = (await pool.query(sql, [param])).rows[0];
  } catch (err) {
    console.error("requireChecklistAccess lookup failed:", err);
    return deny(400, "Invalid checklist reference");
  }

  // No cleaning assignment behind this checklist means it isn't anyone's work
  // yet — and certainly not this cleaner's.
  if (!row || !actorId || !row.assigned_to || String(row.assigned_to) !== String(actorId)) {
    return deny(403, "This checklist belongs to a room that is not assigned to you.");
  }

  if (opts.forWrite && row.cleaning_status !== "in-progress") {
    return deny(
      409,
      row.cleaning_status === "awaiting-inspection" || row.cleaning_status === "ready"
        ? "This room has already been sent for inspection, so its checklist is locked."
        : "Start cleaning this room first — the checklist opens once cleaning is In Progress.",
    );
  }

  return { ok: true, session: guard.session, role: guard.role, actorId, isAdmin };
}

// Backwards-compat alias kept in case anything imports the old type name.
export type AdminGuardResult = GuardResult;
