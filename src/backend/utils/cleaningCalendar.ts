// Cleaner Google Calendar sync.
//
// Every cleaner gets their own "D'Lux Cleaning – Name" calendar, created and
// owned by the Calendar service account the booking calendar already uses, and
// shared read-only to the cleaner's login email (they accept once in Google
// Calendar). Each cleaning task assigned to them is one event in it.
//
// The core is RECONCILE, not "react to event X": syncCleaningCalendarEvent
// looks at a task as it is now and makes Google match — create, update, move
// to another cleaner's calendar, or delete. Calling it twice changes nothing,
// calling it after any change is always correct, and the 15-minute cron can
// sweep upcoming tasks to heal anything a failed call missed (e.g. a new
// booking that shortened someone's cleaning window).
//
// Everything here is best-effort: a Google outage must never fail a cleaning
// action. Errors are logged and recorded on booking_cleaning.gcal_error.

import { after } from "next/server";
import { google } from "googleapis";
import pool from "@/backend/config/db";
import { parsePrivateKey } from "@/backend/utils/googleCalendar";
import { buildCleaningEvent, type CalendarEventBody } from "@/lib/cleaning-calendar";

// ── Google client (injectable for tests) ─────────────────────────────────────

/** The slice of the Calendar API this module uses. */
export type CleaningCalendarApi = {
  createCalendar(summary: string, description: string): Promise<string>;
  shareCalendar(calendarId: string, email: string): Promise<void>;
  insertEvent(calendarId: string, body: CalendarEventBody): Promise<string>;
  updateEvent(calendarId: string, eventId: string, body: CalendarEventBody): Promise<void>;
  /** Resolves quietly if the event is already gone (404/410). */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
};

let injected: CleaningCalendarApi | null = null;
let real: CleaningCalendarApi | null = null;

/** Tests swap in a fake; production never calls this. */
export function __setCleaningCalendarApiForTests(api: CleaningCalendarApi | null): void {
  injected = api;
}

export function cleaningCalendarConfigured(): boolean {
  if (injected) return true;
  return !!(process.env.GOOGLE_CLIENT_EMAIL_CALENDAR && process.env.GOOGLE_PRIVATE_KEY_CALENDAR);
}

function isGone(err: unknown): boolean {
  const code = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
  return code === 404 || code === 410;
}

function api(): CleaningCalendarApi {
  if (injected) return injected;
  if (real) return real;

  // Full calendar scope: creating calendars and sharing them needs more than
  // the events-only scope the booking calendar uses. A service account grants
  // itself scopes over calendars it owns — no user consent involved.
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL_CALENDAR,
      private_key: parsePrivateKey(process.env.GOOGLE_PRIVATE_KEY_CALENDAR ?? ""),
    },
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const cal = google.calendar({ version: "v3", auth });

  real = {
    async createCalendar(summary, description) {
      const res = await cal.calendars.insert({
        requestBody: { summary, description, timeZone: "Asia/Manila" },
      });
      if (!res.data.id) throw new Error("Google did not return a calendar id");
      return res.data.id;
    },
    async shareCalendar(calendarId, email) {
      await cal.acl.insert({
        calendarId,
        sendNotifications: true,
        requestBody: { role: "reader", scope: { type: "user", value: email } },
      });
    },
    async insertEvent(calendarId, body) {
      const res = await cal.events.insert({ calendarId, requestBody: body });
      if (!res.data.id) throw new Error("Google did not return an event id");
      return res.data.id;
    },
    async updateEvent(calendarId, eventId, body) {
      await cal.events.update({ calendarId, eventId, requestBody: body });
    },
    async deleteEvent(calendarId, eventId) {
      try {
        await cal.events.delete({ calendarId, eventId });
      } catch (err) {
        if (!isGone(err)) throw err;
      }
    },
  };
  return real;
}

// ── Per-cleaner calendar ─────────────────────────────────────────────────────

// Two syncs for the same cleaner landing together must not create two
// calendars. In-process, the second waits on the first's promise; across
// instances, the conditional UPDATE below keeps exactly one and the loser
// deletes nothing it shared (it never got that far).
const creating = new Map<string, Promise<string | null>>();

/**
 * The cleaner's calendar id, creating and sharing it the first time, and
 * re-sharing if their email has changed since. Null for a non-cleaner or an
 * account without an email.
 */
export async function ensureCleanerCalendar(employeeId: string): Promise<string | null> {
  const pending = creating.get(employeeId);
  if (pending) return pending;
  const work = (async () => {
    const res = await pool.query(
      `SELECT email, first_name, last_name, role, cleaning_calendar_id, cleaning_calendar_shared_to
       FROM employees WHERE id = $1::uuid`,
      [employeeId],
    );
    const e = res.rows[0];
    if (!e || e.role !== "Cleaner" || !e.email) return null;

    let calendarId: string | null = e.cleaning_calendar_id ?? null;
    if (!calendarId) {
      const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email;
      const created = await api().createCalendar(
        `D'Lux Cleaning – ${name}`,
        "Your D'Lux Homes cleaning assignments. Updated automatically — each event runs from the guest's checkout to the next guest's check-in.",
      );
      const claim = await pool.query(
        `UPDATE employees SET cleaning_calendar_id = $2
         WHERE id = $1::uuid AND cleaning_calendar_id IS NULL
         RETURNING cleaning_calendar_id`,
        [employeeId, created],
      );
      if (claim.rows.length === 0) {
        // Another instance won the race; use theirs.
        const again = await pool.query(`SELECT cleaning_calendar_id FROM employees WHERE id = $1::uuid`, [employeeId]);
        calendarId = again.rows[0]?.cleaning_calendar_id ?? created;
      } else {
        calendarId = created;
      }
    }

    const email = String(e.email).trim().toLowerCase();
    if (calendarId && (e.cleaning_calendar_shared_to ?? "").toLowerCase() !== email) {
      await api().shareCalendar(calendarId, email);
      await pool.query(
        `UPDATE employees SET cleaning_calendar_shared_to = $2 WHERE id = $1::uuid`,
        [employeeId, email],
      );
    }
    return calendarId;
  })();
  creating.set(employeeId, work);
  try {
    return await work;
  } finally {
    creating.delete(employeeId);
  }
}

/** Forces the share to be sent again (the "resend invite" button). */
export async function reshareCleanerCalendar(employeeId: string): Promise<string | null> {
  await pool.query(`UPDATE employees SET cleaning_calendar_shared_to = NULL WHERE id = $1::uuid`, [employeeId]);
  return ensureCleanerCalendar(employeeId);
}

// ── Per-task event ───────────────────────────────────────────────────────────

const CHECKOUT_AT = `((CASE WHEN b.check_out_time = '00:00'
                 THEN (b.check_out_date::DATE + INTERVAL '1 day')
                 ELSE (b.check_out_date::DATE + COALESCE(b.check_out_time::TIME, '23:59'::TIME))
            END) AT TIME ZONE 'Asia/Manila')`;

function portalUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return base ? `${base}/admin/cleaners` : null;
}

/**
 * Make Google match this task as it is right now. Returns what it did, for
 * tests and logs. Never throws.
 */
export async function syncCleaningCalendarEvent(
  taskId: string,
): Promise<"created" | "updated" | "moved" | "deleted" | "none" | "skipped" | "error"> {
  if (!cleaningCalendarConfigured()) return "skipped";
  try {
    const res = await pool.query(
      `SELECT bc.id::text AS id, bc.assigned_to::text AS assigned_to, bc.cleaning_status,
              bc.inspection_note, bc.gcal_event_id, bc.gcal_calendar_id,
              COALESCE(bc.scheduled_for, ${CHECKOUT_AT}) AS due_at,
              b.booking_id, b.room_name, b.status AS booking_status,
              b.check_in_date::text AS check_in_date, b.check_in_time::text AS check_in_time,
              b.check_out_date::text AS check_out_date, b.check_out_time::text AS check_out_time,
              b.adults, b.children,
              (SELECT bg.first_name FROM booking_guests bg WHERE bg.booking_id = b.id
                 ORDER BY bg.guest_index NULLS LAST, bg.id LIMIT 1) AS guest_first_name,
              (SELECT MIN((n.check_in_date::DATE + COALESCE(n.check_in_time::TIME, '00:00'::TIME)) AT TIME ZONE 'Asia/Manila')
                 FROM booking n
                WHERE n.id <> b.id
                  AND n.room_name = b.room_name
                  AND n.status NOT IN ('cancelled', 'rejected')
                  AND (n.check_in_date::DATE + COALESCE(n.check_in_time::TIME, '00:00'::TIME)) AT TIME ZONE 'Asia/Manila'
                      > COALESCE(bc.scheduled_for, ${CHECKOUT_AT})) AS next_check_in
       FROM booking_cleaning bc
       JOIN booking b ON b.id = bc.booking_id
       WHERE bc.id = $1::uuid`,
      [taskId],
    );
    const t = res.rows[0];
    if (!t) return "none";

    const live = !["cancelled", "rejected", "declined"].includes(String(t.booking_status));
    const wantCalendar = live && t.assigned_to && t.due_at ? await ensureCleanerCalendar(t.assigned_to) : null;

    let outcome: "created" | "updated" | "moved" | "deleted" | "none" = "none";

    // Event sitting in a calendar it no longer belongs in (reassigned away,
    // unassigned, or the booking was cancelled) — remove it from there.
    if (t.gcal_event_id && t.gcal_calendar_id && t.gcal_calendar_id !== wantCalendar) {
      await api().deleteEvent(t.gcal_calendar_id, t.gcal_event_id);
      outcome = wantCalendar ? "moved" : "deleted";
      t.gcal_event_id = null;
    }

    if (!wantCalendar) {
      await pool.query(
        `UPDATE booking_cleaning SET gcal_event_id = NULL, gcal_calendar_id = NULL, gcal_synced_at = NOW(), gcal_error = NULL WHERE id = $1::uuid`,
        [taskId],
      );
      return outcome;
    }

    const body = buildCleaningEvent({
      bookingRef: t.booking_id,
      room: t.room_name,
      cleaningStatus: t.cleaning_status,
      inspectionNote: t.inspection_note,
      dueAt: new Date(t.due_at),
      nextCheckInAt: t.next_check_in ? new Date(t.next_check_in) : null,
      guestFirstName: t.guest_first_name,
      adults: t.adults == null ? null : Number(t.adults),
      children: t.children == null ? null : Number(t.children),
      check_in_date: t.check_in_date,
      check_in_time: t.check_in_time,
      check_out_date: t.check_out_date,
      check_out_time: t.check_out_time,
      portalUrl: portalUrl(),
    });

    let eventId: string | null = t.gcal_event_id;
    if (eventId) {
      try {
        await api().updateEvent(wantCalendar, eventId, body);
        outcome = "updated";
      } catch (err) {
        if (!isGone(err)) throw err;
        eventId = null; // deleted by hand in Google — recreate below
      }
    }
    if (!eventId) {
      eventId = await api().insertEvent(wantCalendar, body);
      if (outcome === "none") outcome = "created";
    }

    await pool.query(
      `UPDATE booking_cleaning
       SET gcal_event_id = $2, gcal_calendar_id = $3, gcal_synced_at = NOW(), gcal_error = NULL
       WHERE id = $1::uuid`,
      [taskId, eventId, wantCalendar],
    );
    return outcome;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`⚠️ Cleaning calendar sync failed for task ${taskId}:`, msg);
    await pool
      .query(`UPDATE booking_cleaning SET gcal_error = $2 WHERE id = $1::uuid`, [taskId, msg.slice(0, 500)])
      .catch(() => {});
    return "error";
  }
}

// ── Scheduling ───────────────────────────────────────────────────────────────

const inFlight = new Set<Promise<unknown>>();

/**
 * Sync a task's calendar event after the current response is sent (so Google's
 * latency never slows a cleaner's tap). Outside a request — the cron, tests —
 * it just runs in the background.
 */
export function scheduleCleaningCalendarSync(taskId: string | null | undefined): void {
  if (!taskId || !cleaningCalendarConfigured()) return;
  const run = () => {
    const p = syncCleaningCalendarEvent(taskId);
    inFlight.add(p);
    return p.finally(() => inFlight.delete(p));
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Tests: wait for background syncs to finish. */
export async function __flushCleaningCalendarSyncs(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}

/**
 * Heal pass for the cron: re-sync every task due from two days ago to 60 days
 * ahead, plus anything whose last sync failed. Catches changes no cleaning
 * action triggered — a new booking that now ends someone's cleaning window
 * earlier, or an event deleted by hand in Google.
 */
export async function reconcileCleaningCalendars(limit = 100): Promise<{ checked: number; errors: number }> {
  if (!cleaningCalendarConfigured()) return { checked: 0, errors: 0 };
  const res = await pool.query(
    `SELECT bc.id::text AS id
     FROM booking_cleaning bc
     JOIN booking b ON b.id = bc.booking_id
     WHERE (bc.assigned_to IS NOT NULL OR bc.gcal_event_id IS NOT NULL)
       AND (bc.gcal_error IS NOT NULL
            OR bc.scheduled_for BETWEEN NOW() - INTERVAL '2 days' AND NOW() + INTERVAL '60 days')
     ORDER BY bc.scheduled_for ASC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  let errors = 0;
  for (const row of res.rows) {
    if ((await syncCleaningCalendarEvent(row.id)) === "error") errors++;
  }
  return { checked: res.rows.length, errors };
}
