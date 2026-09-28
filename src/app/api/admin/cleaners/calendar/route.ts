import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";
import {
  cleaningCalendarConfigured,
  ensureCleanerCalendar,
  reshareCleanerCalendar,
  syncCleaningCalendarEvent,
} from "@/backend/utils/cleaningCalendar";
import { googleCalendarAddUrl } from "@/lib/cleaning-calendar";

export const runtime = "nodejs";

// A cleaner's own Google Calendar: its status (GET), and "set it up / resend
// the invite" (POST). A cleaner only ever acts on their own; Owner/CSR may
// pass ?employee_id= to act for one.

async function resolveTarget(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return { guard, employeeId: null as string | null };
  const self = (guard.session.user as { id?: string }).id ?? null;
  const asked = req.nextUrl.searchParams.get("employee_id");
  const isAdmin = guard.role === "Owner" || guard.role === "CSR";
  return { guard, employeeId: asked && isAdmin ? asked : self };
}

async function status(employeeId: string) {
  const r = await pool.query(
    `SELECT email, role, cleaning_calendar_id, cleaning_calendar_shared_to FROM employees WHERE id = $1::uuid`,
    [employeeId],
  );
  const e = r.rows[0];
  return {
    configured: cleaningCalendarConfigured(),
    isCleaner: e?.role === "Cleaner",
    email: e?.email ?? null,
    calendarId: e?.cleaning_calendar_id ?? null,
    sharedTo: e?.cleaning_calendar_shared_to ?? null,
    addUrl: e?.cleaning_calendar_id ? googleCalendarAddUrl(e.cleaning_calendar_id) : null,
  };
}

export async function GET(req: NextRequest) {
  const { guard, employeeId } = await resolveTarget(req);
  if (!guard.ok) return guard.response;
  if (!employeeId) return NextResponse.json({ success: false, error: "No account" }, { status: 400 });
  return NextResponse.json({ success: true, data: await status(employeeId) });
}

export async function POST(req: NextRequest) {
  const { guard, employeeId } = await resolveTarget(req);
  if (!guard.ok) return guard.response;
  if (!employeeId) return NextResponse.json({ success: false, error: "No account" }, { status: 400 });
  if (!cleaningCalendarConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google Calendar isn't set up on this server yet." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const resend = (body as { action?: string }).action === "resend";
    const calendarId = resend ? await reshareCleanerCalendar(employeeId) : await ensureCleanerCalendar(employeeId);
    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: "Only cleaner accounts with an email get a cleaning calendar." },
        { status: 400 },
      );
    }

    // Fill it with everything they already hold, so a brand-new calendar isn't
    // empty until the next assignment.
    const tasks = await pool.query(
      `SELECT bc.id::text AS id FROM booking_cleaning bc
       JOIN booking b ON b.id = bc.booking_id
       WHERE bc.assigned_to = $1::uuid AND b.status NOT IN ('cancelled', 'rejected')`,
      [employeeId],
    );
    for (const t of tasks.rows) await syncCleaningCalendarEvent(t.id);

    return NextResponse.json({ success: true, data: await status(employeeId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not set up the calendar";
    console.error("POST /api/admin/cleaners/calendar:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
