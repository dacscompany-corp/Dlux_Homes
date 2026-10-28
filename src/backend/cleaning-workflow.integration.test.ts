// End-to-end checks for the Cleaners Portal MVP fix scope, run against a real
// Postgres engine (PGlite, in-process) with the repo's own schema applied in the
// same order `npm run db:setup` uses. Nothing here touches the real database.
//
// What this covers that the pure unit tests can't: the SQL. Fair rotation, the
// opportunity ledger (retained / completed / released + replacement credits),
// idempotent re-processing, the checklist + photo gate, and the route-level
// access rules — each exercised through the actual controller and route code.
//
// One honest limitation: PGlite is a single connection, so "simultaneous"
// requests are serialized by the pool adapter below rather than by Postgres
// row locks. That proves the logic produces no duplicate task or turn when
// requests are serialized — which is exactly what the FOR UPDATE on
// cleaning_rotation_state guarantees in production — but it does not exercise
// the lock itself.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { NextRequest } from "next/server";

// ── Test doubles ──────────────────────────────────────────────────────────────

type Session = { user: { id: string; role: string; name?: string; email?: string } } | null;

const h = vi.hoisted(() => ({
  db: null as unknown as import("@electric-sql/pglite").PGlite,
  session: null as Session,
  notifications: [] as Array<Record<string, unknown>>,
}));

// A pg-Pool-shaped adapter over the single PGlite connection. connect() hands
// out the connection exclusively until release(), so two "concurrent"
// transactions queue exactly as they would behind the rotation-row lock.
vi.mock("@/backend/config/db", () => {
  let tail: Promise<void> = Promise.resolve();
  const acquire = async (): Promise<() => void> => {
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const before = tail;
    tail = before.then(() => mine);
    await before;
    return release;
  };
  const run = async (sql: string, params?: unknown[]) => {
    const res = await h.db.query(sql, params as unknown[]);
    // pg's rowCount: rows returned for a SELECT / RETURNING, rows touched
    // otherwise. PGlite reports affectedRows = 0 for a SELECT, so prefer rows.
    const rowCount = res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0);
    return { rows: res.rows as Record<string, unknown>[], rowCount };
  };
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const release = await acquire();
      try {
        return await run(sql, params);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await acquire();
      let released = false;
      return {
        query: run,
        release: () => {
          if (!released) {
            released = true;
            release();
          }
        },
      };
    },
  };
  return { default: pool };
});

vi.mock("@/backend/utils/notificationHelper", () => ({
  createNotificationForUser: vi.fn(async (userId: string, data: Record<string, unknown>) => {
    h.notifications.push({ userId, ...data });
  }),
  createNotificationsForRoles: vi.fn(async (roles: string[], data: Record<string, unknown>) => {
    h.notifications.push({ roles, ...data });
  }),
}));

vi.mock("@/backend/utils/activityLogger", () => ({ logActivity: vi.fn(async () => {}) }));

vi.mock("@/backend/utils/fileUpload", () => ({
  upload_image_from_form: vi.fn(async (file: File) => ({
    url: `https://img.test/${encodeURIComponent(file.name)}`,
    public_id: `pid-${file.name}`,
  })),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => h.session) }));

// Imported after the mocks are registered.
import {
  acceptCleaningTask,
  declineCleaningTask,
  notifyCleaningEvent,
  sendCleaningReminders,
  ensureCleaningAssignment,
  onBookingStatusChanged,
  reassignCleaningTask,
  sweepUnassignedCleaning,
} from "@/backend/controller/cleanersController";
import { GET as listTasks } from "@/app/api/admin/cleaners/tasks/route";
import { PUT as startTask } from "@/app/api/admin/cleaners/tasks/[id]/start/route";
import { PUT as acceptRoute } from "@/app/api/admin/cleaners/tasks/[id]/accept/route";
import { POST as syncRoute } from "@/app/api/admin/cleaners/tasks/sync/route";
import { PATCH as staffStatusRoute } from "@/app/api/admin/employees/[id]/status/route";
import { PUT as declineRoute } from "@/app/api/admin/cleaners/tasks/[id]/decline/route";
import { PUT as completeTask } from "@/app/api/admin/cleaners/tasks/[id]/complete/route";
import { PUT as setStatus } from "@/app/api/admin/cleaners/tasks/[id]/status/route";
import { PUT as putTask } from "@/app/api/admin/cleaners/tasks/[id]/route";
import { PUT as assignTask } from "@/app/api/admin/cleaners/tasks/[id]/assign/route";
import { PUT as approveTask } from "@/app/api/admin/cleaners/tasks/[id]/inspect/approve/route";
import { PUT as rejectTask } from "@/app/api/admin/cleaners/tasks/[id]/inspect/reject/route";
import { GET as getChecklist, PATCH as tickTask, POST as checklistAction } from "@/app/api/admin/cleaners/route";
import { POST as uploadPhoto } from "@/app/api/admin/cleaners/checklist-photos/route";
import { PATCH as patchBookingCleaning } from "@/app/api/bookings/[id]/route";
import { PUT as putBookingCleaning } from "@/app/api/bookings/[id]/cleaning/route";
import { PUT as putAliasTask } from "@/app/api/cleaning-tasks/[id]/route";
import {
  __setCleaningCalendarApiForTests,
  __flushCleaningCalendarSyncs,
  syncCleaningCalendarEvent,
  type CleaningCalendarApi,
} from "@/backend/utils/cleaningCalendar";

// ── Schema ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..", "..");
const sqlFiles = (dir: string) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(ROOT, dir, f));

async function applySchema(db: PGlite, opts: { skip?: (file: string) => boolean } = {}) {
  // Supabase sessions run in UTC. PGlite would otherwise inherit this machine's
  // zone, which hides exactly the class of bug where a Manila wall-clock time is
  // stored without being anchored to Manila.
  await db.exec(`SET TIME ZONE 'UTC';`);
  await db.exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS btree_gist;`);
  const base = path.join(ROOT, "supabase", "00_base_tables.sql");
  const files = [
    ...(fs.existsSync(base) ? [base] : []),
    ...sqlFiles("src/backend/models"),
    ...sqlFiles("src/backend/migrations"),
  ].filter((f) => !opts.skip?.(f));

  // Same continue-on-error, re-run-until-green approach as scripts/db-setup.mjs.
  const failed = new Map<string, string>();
  for (let pass = 0; pass < 4; pass++) {
    for (const file of files) {
      if (pass > 0 && !failed.has(file)) continue;
      try {
        await db.exec("BEGIN");
        await db.exec(fs.readFileSync(file, "utf8"));
        await db.exec("COMMIT");
        failed.delete(file);
      } catch (err) {
        await db.exec("ROLLBACK").catch(() => {});
        failed.set(file, (err as Error).message);
      }
    }
  }
  return failed;
}

const newDb = () => new PGlite({ extensions: { uuid_ossp, btree_gist } });

// ── Seed helpers ──────────────────────────────────────────────────────────────

let empSeq = 0;
async function addEmployee(role: "Cleaner" | "Owner" | "CSR", first: string, status = "active"): Promise<string> {
  empSeq++;
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO employees (first_name, last_name, email, employment_id, hire_date, role, status, created_at)
     VALUES ($1, 'Test', $2, $3, '2026-01-01', $4, $5, TIMESTAMPTZ '2026-01-01 00:00:00+00' + ($6 || ' seconds')::interval)
     RETURNING id::text AS id`,
    [first, `${first.toLowerCase()}${empSeq}@test.local`, `EMP-${empSeq}`, role, status, String(empSeq)],
  );
  return r.rows[0].id;
}

let havenId = "";
async function addHaven() {
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO havens (haven_name, tower, floor, view_type, capacity, room_size, beds, description,
                         six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate)
     VALUES ('Haven 1', 'T4', '10', 'City', 4, 30, '1 Queen', 'Test unit', 1000, 1500, 2500, 3000)
     RETURNING uuid_id::text AS id`,
  );
  havenId = r.rows[0].id;
}

let bookingSeq = 0;
/** A non-overlapping one-night stay. `when` picks past (checked out) or future. */
async function addBooking(opts: { status?: string; when?: "past" | "future" } = {}): Promise<{ id: string; ref: string }> {
  bookingSeq++;
  const year = opts.when === "future" ? 2099 : 2020;
  const start = new Date(Date.UTC(year, 0, 1 + bookingSeq * 3));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const ref = `DL-TEST-${bookingSeq}`;
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
     VALUES ($1, 'Haven 1', $2, $3, '14:00', '12:00', $4)
     RETURNING id::text AS id`,
    [ref, d(start), d(end), opts.status ?? "pending"],
  );
  const id = r.rows[0].id;
  await h.db.query(
    `INSERT INTO booking_guests (booking_id, first_name, last_name, email, phone)
     VALUES ($1, 'Gina', 'Guest', 'gina@guest.test', '09170000000')`,
    [id],
  );
  await h.db.query(
    `INSERT INTO booking_payments (booking_id, payment_method, room_rate, total_amount, down_payment, remaining_balance, amount_paid)
     VALUES ($1, 'gcash', 2500, 2500, 1250, 1250, 1250)`,
    [id],
  );
  return { id, ref };
}

async function confirm(bookingId: string) {
  await h.db.query(`UPDATE booking SET status = 'approved' WHERE id = $1::uuid`, [bookingId]);
  await onBookingStatusChanged(bookingId, "approved");
}

async function cancel(bookingId: string) {
  await h.db.query(`UPDATE booking SET status = 'cancelled' WHERE id = $1::uuid`, [bookingId]);
  await onBookingStatusChanged(bookingId, "cancelled");
}

async function taskFor(bookingId: string) {
  const r = await h.db.query<{ id: string; assigned_to: string | null; cleaning_status: string; assignment_method: string | null; unassigned_reason: string | null; scheduled_for: Date | null }>(
    `SELECT id::text AS id, assigned_to::text AS assigned_to, cleaning_status, assignment_method, unassigned_reason, scheduled_for
     FROM booking_cleaning WHERE booking_id = $1::uuid`,
    [bookingId],
  );
  return r.rows;
}

async function shares(): Promise<Record<string, { share: number; credits: number }>> {
  const r = await h.db.query<{ id: string; share: number; credits: number }>(
    `SELECT e.id::text AS id,
            (SELECT COUNT(*)::int FROM cleaning_opportunities o WHERE o.employee_id = e.id AND o.state IN ('retained','completed')) AS share,
            (SELECT COUNT(*)::int FROM cleaning_opportunities o WHERE o.employee_id = e.id AND o.state = 'released' AND NOT o.credit_consumed) AS credits
     FROM employees e WHERE e.role = 'Cleaner'`,
  );
  return Object.fromEntries(r.rows.map((x) => [x.id, { share: x.share, credits: x.credits }]));
}

function as(user: { id: string; role: string } | null) {
  h.session = user ? { user: { ...user, name: "Test" } } : null;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, init: { method: string; body?: unknown } = { method: "GET" }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method,
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let C1 = "", C2 = "", C3 = "", C4 = "", OWNER = "", CSR = "";

beforeAll(async () => {
  h.db = newDb();
  const failed = await applySchema(h.db);
  // blocked_dates.sql re-runs CREATE TABLE without IF NOT EXISTS once another
  // file has created it — pre-existing, unrelated to cleaning.
  failed.forEach((_e, f) => {
    if (f.endsWith("blocked_dates.sql")) failed.delete(f);
  });
  expect([...failed.entries()]).toEqual([]);
}, 60_000);

beforeEach(async () => {
  await h.db.exec(`
    TRUNCATE booking, employees, havens RESTART IDENTITY CASCADE;
    INSERT INTO cleaning_rotation_state (id, last_assigned_employee_id) VALUES (1, NULL)
      ON CONFLICT (id) DO UPDATE SET last_assigned_employee_id = NULL;
  `);
  h.notifications.length = 0;
  h.session = null;
  empSeq = 0;
  bookingSeq = 0;
  await addHaven();
  C1 = await addEmployee("Cleaner", "Cleaner1");
  C2 = await addEmployee("Cleaner", "Cleaner2");
  C3 = await addEmployee("Cleaner", "Cleaner3");
  C4 = await addEmployee("Cleaner", "Cleaner4");
  OWNER = await addEmployee("Owner", "Owner");
  CSR = await addEmployee("CSR", "Csr");
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Fair automatic and manual assignment
// ═════════════════════════════════════════════════════════════════════════════

describe("fair assignment", () => {
  it("four cleaners, four bookings: one each, in rotation order", async () => {
    const picks: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const b = await addBooking();
      await confirm(b.id);
      picks.push((await taskFor(b.id))[0].assigned_to);
    }
    expect(picks).toEqual([C1, C2, C3, C4]);
  });

  it("four cleaners, eight bookings: two each across two full rounds", async () => {
    const picks: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      const b = await addBooking();
      await confirm(b.id);
      picks.push((await taskFor(b.id))[0].assigned_to);
    }
    expect(picks).toEqual([C1, C2, C3, C4, C1, C2, C3, C4]);
    const s = await shares();
    for (const c of [C1, C2, C3, C4]) expect(s[c].share).toBe(2);
  });

  it("assigns at confirmation, scheduled for the guest's checkout", async () => {
    const b = await addBooking();
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    expect(t.cleaning_status).toBe("assigned");
    expect(t.assignment_method).toBe("automatic");
    expect(t.scheduled_for).not.toBeNull();
    // 12:00 Manila checkout — stored as the real instant, 04:00Z.
    const due = new Date(t.scheduled_for as Date);
    expect(due.getUTCHours()).toBe(4);
    expect(h.notifications.some((n) => n.userId === C1 && n.notificationType === "cleaning_assignment")).toBe(true);
  });

  it("reuses the unassigned record created at booking time", async () => {
    const b = await addBooking();
    await h.db.query(`INSERT INTO booking_cleaning (booking_id, cleaning_status) VALUES ($1::uuid, 'pending')`, [b.id]);
    const [before] = await taskFor(b.id);
    await confirm(b.id);
    const after = await taskFor(b.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].assigned_to).toBe(C1);
    expect(after[0].scheduled_for).not.toBeNull();
  });

  it("processing the same confirmation twice records one task and one turn", async () => {
    const b1 = await addBooking();
    await confirm(b1.id);
    await confirm(b1.id);
    await onBookingStatusChanged(b1.id, "approved");
    expect(await taskFor(b1.id)).toHaveLength(1);
    const opps = await h.db.query(`SELECT * FROM cleaning_opportunities`);
    expect(opps.rows).toHaveLength(1);
    // The pointer advanced once, so the next booking goes to Cleaner 2.
    const b2 = await addBooking();
    await confirm(b2.id);
    expect((await taskFor(b2.id))[0].assigned_to).toBe(C2);
  });

  it("two bookings confirmed simultaneously get different cleaners and no duplicate turns", async () => {
    const [a, b] = [await addBooking(), await addBooking()];
    await h.db.query(`UPDATE booking SET status = 'approved' WHERE id IN ($1::uuid, $2::uuid)`, [a.id, b.id]);
    await Promise.all([ensureCleaningAssignment(a.id, "booking-confirmed"), ensureCleaningAssignment(b.id, "booking-confirmed")]);
    const got = [(await taskFor(a.id))[0].assigned_to, (await taskFor(b.id))[0].assigned_to];
    expect(new Set(got).size).toBe(2);
    expect(got.sort()).toEqual([C1, C2].sort());
    expect((await h.db.query(`SELECT * FROM cleaning_opportunities`)).rows).toHaveLength(2);
  });

  it("the same confirmation arriving twice at once still yields one task and one turn", async () => {
    const b = await addBooking({ status: "approved" });
    await Promise.all([
      ensureCleaningAssignment(b.id, "booking-confirmed"),
      ensureCleaningAssignment(b.id, "booking-confirmed"),
    ]);
    expect(await taskFor(b.id)).toHaveLength(1);
    expect((await h.db.query(`SELECT * FROM cleaning_opportunities`)).rows).toHaveLength(1);
  });

  it("a manual assignment counts toward the share; automatic picks favour the others", async () => {
    const m = await addBooking();
    await h.db.query(`INSERT INTO booking_cleaning (booking_id, cleaning_status) VALUES ($1::uuid, 'pending')`, [m.id]);
    const [mt] = await taskFor(m.id);
    await reassignCleaningTask({ cleaningTaskId: mt.id, toEmployeeId: C1, assignedBy: OWNER, currentStatus: "pending", currentAssigneeId: null });
    // Confirming the manually assigned booking must not touch it.
    await confirm(m.id);
    const [kept] = await taskFor(m.id);
    expect(kept.assigned_to).toBe(C1);
    expect(kept.assignment_method).toBe("manual");

    const picks: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const b = await addBooking();
      await confirm(b.id);
      picks.push((await taskFor(b.id))[0].assigned_to);
    }
    expect(picks).toEqual([C2, C3, C4]);
    const opp = await h.db.query<{ assigned_by: string; assignment_method: string }>(
      `SELECT assigned_by::text AS assigned_by, assignment_method FROM cleaning_opportunities WHERE booking_cleaning_id = $1::uuid`,
      [mt.id],
    );
    expect(opp.rows[0]).toEqual({ assigned_by: OWNER, assignment_method: "manual" });
  });

  it("finishing faster gives no extra turn", async () => {
    const b1 = await addBooking();
    const b2 = await addBooking();
    await confirm(b1.id);
    await confirm(b2.id);
    // Cleaner 1 finishes immediately.
    const [t1] = await taskFor(b1.id);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'in-progress' WHERE id = $1::uuid`, [t1.id]);
    as({ id: OWNER, role: "Owner" });
    await putTask(req(`/api/admin/cleaners/tasks/${t1.id}`, { method: "PUT", body: { cleaning_status: "awaiting-inspection" } }), ctx(t1.id));
    const b3 = await addBooking();
    await confirm(b3.id);
    expect((await taskFor(b3.id))[0].assigned_to).toBe(C3);
  });

  it("an unfinished assignment does not by itself remove a cleaner from the rotation", async () => {
    for (let i = 0; i < 4; i++) await confirm((await addBooking()).id);
    // Nobody has started or finished anything; the fifth still goes to C1.
    const b5 = await addBooking();
    await confirm(b5.id);
    expect((await taskFor(b5.id))[0].assigned_to).toBe(C1);
  });

  it("a cancelled booking gives its cleaner replacement priority — once, however often it's processed", async () => {
    const bs = [];
    for (let i = 0; i < 4; i++) {
      const b = await addBooking();
      await confirm(b.id);
      bs.push(b);
    }
    await cancel(bs[1].id); // Cleaner 2's booking
    await cancel(bs[1].id); // replayed
    await onBookingStatusChanged(bs[1].id, "cancelled"); // and again
    let s = await shares();
    expect(s[C2]).toEqual({ share: 0, credits: 1 });

    const b5 = await addBooking();
    await confirm(b5.id);
    expect((await taskFor(b5.id))[0].assigned_to).toBe(C2);
    s = await shares();
    expect(s[C2]).toEqual({ share: 1, credits: 0 });
    expect(h.notifications.filter((n) => n.userId === C2 && n.notificationType === "cleaning_cancelled")).toHaveLength(1);
  });

  it("a cancelled booking that is later re-approved goes back through the fair rotation", async () => {
    const b1 = await addBooking();
    await confirm(b1.id); // C1
    await cancel(b1.id); // C1 released, credit +1, seat vacated
    const [vacated] = await taskFor(b1.id);
    expect(vacated.assigned_to).toBeNull();
    expect(vacated.cleaning_status).toBe("pending");

    const b2 = await addBooking();
    await confirm(b2.id); // C1's replacement (lowest share, holds the credit)
    expect((await taskFor(b2.id))[0].assigned_to).toBe(C1);

    await confirm(b1.id); // re-approved: same record, placed fairly again
    const after = await taskFor(b1.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(vacated.id);
    expect(after[0].assigned_to).toBe(C2);
    const s = await shares();
    expect([s[C1].share, s[C2].share, s[C1].credits]).toEqual([1, 1, 0]);
  });

  it("the cancelled booking's task disappears from the cleaner's list", async () => {
    const b = await addBooking();
    await confirm(b.id);
    await cancel(b.id);
    as({ id: C1, role: "Cleaner" });
    const res = await listTasks(req(`/api/admin/cleaners/tasks`));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("an unperformed task moved from Cleaner 2 to Cleaner 3 restores Cleaner 2 and counts for Cleaner 3", async () => {
    const bs = [];
    for (let i = 0; i < 4; i++) {
      const b = await addBooking();
      await confirm(b.id);
      bs.push(b);
    }
    const [t2] = await taskFor(bs[1].id);
    as({ id: OWNER, role: "Owner" });
    const res = await assignTask(req(`/api/admin/cleaners/tasks/${t2.id}/assign`, { method: "PUT", body: { assigned_to: C3 } }), ctx(t2.id));
    expect(res.status).toBe(200);
    // Replayed reassignment: no second restore.
    await assignTask(req(`/api/admin/cleaners/tasks/${t2.id}/assign`, { method: "PUT", body: { assigned_to: C3 } }), ctx(t2.id));

    const s = await shares();
    expect(s[C2]).toEqual({ share: 0, credits: 1 });
    expect(s[C3].share).toBe(2);

    const b5 = await addBooking();
    await confirm(b5.id);
    expect((await taskFor(b5.id))[0].assigned_to).toBe(C2);

    const hist = await h.db.query<{ note: string }>(
      `SELECT note FROM booking_cleaning_history WHERE booking_cleaning_id = $1::uuid ORDER BY changed_at`,
      [t2.id],
    );
    expect(hist.rows.some((r) => /Reassigned from Cleaner2 to Cleaner3/.test(r.note ?? "") && /restored/.test(r.note ?? ""))).toBe(true);
  });

  it("completed cleaning keeps its original cleaner's attribution after reassignment", async () => {
    const b = await addBooking();
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'in-progress' WHERE id = $1::uuid`, [t.id]);
    as({ id: OWNER, role: "Owner" });
    await putTask(req(`/api/admin/cleaners/tasks/${t.id}`, { method: "PUT", body: { cleaning_status: "awaiting-inspection" } }), ctx(t.id));
    await assignTask(req(`/api/admin/cleaners/tasks/${t.id}/assign`, { method: "PUT", body: { assigned_to: C2 } }), ctx(t.id));

    const o = await h.db.query<{ employee_id: string; state: string }>(
      `SELECT employee_id::text AS employee_id, state FROM cleaning_opportunities WHERE booking_cleaning_id = $1::uuid ORDER BY created_at`,
      [t.id],
    );
    expect(o.rows).toEqual([
      { employee_id: C1, state: "completed" },
      { employee_id: C2, state: "retained" },
    ]);
    const s = await shares();
    expect(s[C1]).toEqual({ share: 1, credits: 0 });
  });

  it("skips inactive cleaners", async () => {
    await h.db.query(`UPDATE employees SET status = 'inactive' WHERE id = $1::uuid`, [C1]);
    const b = await addBooking();
    await confirm(b.id);
    expect((await taskFor(b.id))[0].assigned_to).toBe(C2);
  });

  it("skips a cleaner already booked for an overlapping stay", async () => {
    const a = await addBooking();
    await confirm(a.id); // C1
    // A second booking overlapping the first stay (different room so the
    // no-double-booking constraint allows it).
    const r = await h.db.query<{ id: string }>(
      `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
       SELECT 'DL-OVERLAP', 'Haven 2', check_in_date, check_out_date, '15:00', '11:00', 'approved' FROM booking WHERE id = $1::uuid
       RETURNING id::text AS id`,
      [a.id],
    );
    // Make C2..C4 all busy too, except C3, by giving them overlapping work.
    await h.db.query(`UPDATE cleaning_rotation_state SET last_assigned_employee_id = $1::uuid`, [C4]);
    await ensureCleaningAssignment(r.rows[0].id, "booking-confirmed");
    // Rotation wants C1 next (after C4), but C1 is busy for this window.
    expect((await taskFor(r.rows[0].id))[0].assigned_to).toBe(C2);
  });

  it("with nobody eligible, leaves the task unassigned with a reason and notifies Owner/CSR", async () => {
    await h.db.query(`UPDATE employees SET status = 'inactive' WHERE role = 'Cleaner'`);
    const b = await addBooking();
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    expect(t.assigned_to).toBeNull();
    expect(t.cleaning_status).toBe("pending");
    expect(t.unassigned_reason).toMatch(/inactive/);
    const n = h.notifications.find((x) => x.notificationType === "cleaning_unassigned");
    expect(n?.roles).toEqual(["Owner", "CSR"]);

    // Once a cleaner is available again, checkout processing picks the same
    // record up rather than creating another.
    await h.db.query(`UPDATE employees SET status = 'active' WHERE id = $1::uuid`, [C3]);
    await onBookingStatusChanged(b.id, "completed");
    const after = await taskFor(b.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(t.id);
    expect(after[0].assigned_to).toBe(C3);
    expect(after[0].unassigned_reason).toBeNull();
  });

  it("checking out a booking whose room was already cleaned does not hand it out again", async () => {
    // Legacy row: cleaned under the old flow, no assignee, no ledger entry.
    const b = await addBooking({ status: "checked-in" });
    await h.db.query(`INSERT INTO booking_cleaning (booking_id, cleaning_status, cleaned_at) VALUES ($1::uuid, 'cleaned', NOW())`, [b.id]);
    await h.db.query(`UPDATE booking SET status = 'completed' WHERE id = $1::uuid`, [b.id]);
    await onBookingStatusChanged(b.id, "completed");
    await sweepUnassignedCleaning();
    const [t] = await taskFor(b.id);
    expect(t.cleaning_status).toBe("cleaned");
    expect(t.assigned_to).toBeNull();
    expect((await h.db.query(`SELECT * FROM cleaning_opportunities`)).rows).toHaveLength(0);
  });

  it("never creates a cleaning task for a cancelled booking", async () => {
    const b = await addBooking({ status: "cancelled" });
    const out = await ensureCleaningAssignment(b.id, "booking-confirmed");
    expect(out.skipped).toBe("booking-not-eligible");
    expect(await taskFor(b.id)).toHaveLength(0);
  });
});

describe("catch-up sweep (cron)", () => {
  it("assigns bookings confirmed before automatic assignment existed, fairly and earliest first", async () => {
    // Confirmed the old way: status set, bare pending row, no assignment ran.
    const old = [];
    for (let i = 0; i < 3; i++) {
      const b = await addBooking({ status: "approved" });
      await h.db.query(`INSERT INTO booking_cleaning (booking_id, cleaning_status) VALUES ($1::uuid, 'pending')`, [b.id]);
      old.push(b);
    }
    const noRow = await addBooking({ status: "checked-in" }); // no cleaning row at all
    const history = await addBooking({ status: "completed" }); // past stay — must be left alone
    await h.db.query(`INSERT INTO booking_cleaning (booking_id, cleaning_status) VALUES ($1::uuid, 'pending')`, [history.id]);

    const result = await sweepUnassignedCleaning();
    expect(result).toEqual({ checked: 4, assigned: 4, stillUnassigned: 0 });
    const got = [];
    for (const b of [...old, noRow]) got.push((await taskFor(b.id))[0].assigned_to);
    expect(got).toEqual([C1, C2, C3, C4]);
    expect((await taskFor(history.id))[0].assigned_to).toBeNull();

    // Second run finds nothing to do.
    expect(await sweepUnassignedCleaning()).toEqual({ checked: 0, assigned: 0, stillUnassigned: 0 });
  });

  it("retries tasks nobody could take, without re-notifying Owner/CSR every run", async () => {
    await h.db.query(`UPDATE employees SET status = 'inactive' WHERE role = 'Cleaner'`);
    const b = await addBooking();
    await confirm(b.id);
    await sweepUnassignedCleaning();
    await sweepUnassignedCleaning();
    expect(h.notifications.filter((n) => n.notificationType === "cleaning_unassigned")).toHaveLength(1);

    await h.db.query(`UPDATE employees SET status = 'active' WHERE id = $1::uuid`, [C2]);
    expect(await sweepUnassignedCleaning()).toMatchObject({ assigned: 1 });
    expect((await taskFor(b.id))[0].assigned_to).toBe(C2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Task access and inspection
// ═════════════════════════════════════════════════════════════════════════════

describe("access control and the inspection sequence", () => {
  async function assignedTo(cleaner: string, when: "past" | "future" = "past") {
    const b = await addBooking({ when });
    await h.db.query(`UPDATE cleaning_rotation_state SET last_assigned_employee_id = NULL`);
    await h.db.query(`UPDATE employees SET status = CASE WHEN id = $1::uuid THEN 'active' ELSE 'inactive' END WHERE role = 'Cleaner'`, [cleaner]);
    await confirm(b.id);
    await h.db.query(`UPDATE employees SET status = 'active' WHERE role = 'Cleaner'`);
    const [t] = await taskFor(b.id);
    expect(t.assigned_to).toBe(cleaner);
    return { booking: b, taskId: t.id };
  }

  it("a cleaner sees only their own tasks, without guest contact or payment details", async () => {
    await assignedTo(C1);
    await assignedTo(C2);
    as({ id: C1, role: "Cleaner" });
    const body = await (await listTasks(req(`/api/admin/cleaners/tasks`))).json();
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row.assigned_cleaner_id).toBe(C1);
    for (const k of ["guest_email", "guest_phone", "total_amount", "amount_paid", "down_payment", "remaining_balance", "security_deposit", "deposit_proof_url", "deposit_status"]) {
      expect(row).not.toHaveProperty(k);
    }
  });

  it("Owner/CSR still see every task with guest contact and payments", async () => {
    await assignedTo(C1);
    await assignedTo(C2);
    as({ id: CSR, role: "CSR" });
    const body = await (await listTasks(req(`/api/admin/cleaners/tasks`))).json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toHaveProperty("guest_email", "gina@guest.test");
    expect(body.data[0]).toHaveProperty("total_amount");
  });

  it("a cleaner cannot start, complete or read another cleaner's task", async () => {
    const { taskId } = await assignedTo(C2);
    as({ id: C1, role: "Cleaner" });
    expect((await startTask(req(`/x`, { method: "PUT" }), ctx(taskId))).status).toBe(403);
    expect((await completeTask(req(`/x`, { method: "PUT" }), ctx(taskId))).status).toBe(403);
  });

  it("a cleaner cannot approve, reject, assign, or set a status directly", async () => {
    const { taskId } = await assignedTo(C1);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'awaiting-inspection' WHERE id = $1::uuid`, [taskId]);
    as({ id: C1, role: "Cleaner" });
    expect((await approveTask(req(`/x`, { method: "PUT" }), ctx(taskId))).status).toBe(403);
    expect((await rejectTask(req(`/x`, { method: "PUT", body: { note: "x" } }), ctx(taskId))).status).toBe(403);
    expect((await assignTask(req(`/x`, { method: "PUT", body: { assigned_to: C1 } }), ctx(taskId))).status).toBe(403);
    expect((await setStatus(req(`/x`, { method: "PUT", body: { cleaning_status: "ready" } }), ctx(taskId))).status).toBe(403);
    expect((await putTask(req(`/x`, { method: "PUT", body: { cleaning_status: "ready" } }), ctx(taskId))).status).toBe(403);
    expect((await putAliasTask(req(`/x`, { method: "PUT", body: { cleaning_status: "ready" } }), ctx(taskId))).status).toBe(403);
    const b = (await h.db.query<{ booking_id: string }>(`SELECT booking_id::text AS booking_id FROM booking_cleaning WHERE id = $1::uuid`, [taskId])).rows[0].booking_id;
    expect((await patchBookingCleaning(req(`/x`, { method: "PATCH", body: { cleaning_status: "inspected" } }), ctx(b))).status).toBe(403);
    expect((await putBookingCleaning(req(`/x`, { method: "PUT", body: { cleaning_status: "inspected" } }), ctx(b))).status).toBe(403);
    const [t] = await taskFor(b);
    expect(t.cleaning_status).toBe("awaiting-inspection");
  });

  it("not even Owner/CSR can skip inspection through the generic endpoints", async () => {
    const { taskId } = await assignedTo(C1);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'in-progress' WHERE id = $1::uuid`, [taskId]);
    as({ id: OWNER, role: "Owner" });
    const res = await putTask(req(`/x`, { method: "PUT", body: { cleaning_status: "ready" } }), ctx(taskId));
    expect(res.status).toBe(400);
    const res2 = await setStatus(req(`/x`, { method: "PUT", body: { cleaning_status: "ready" } }), ctx(taskId));
    expect(res2.status).toBe(400);
  });

  it("cleaning cannot start before the guest checks out", async () => {
    const { taskId } = await assignedTo(C1, "future");
    as({ id: C1, role: "Cleaner" });
    const res = await startTask(req(`/x`, { method: "PUT" }), ctx(taskId));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/once the guest is checked out/);
  });

  it("an early checkout opens the room before the scheduled time", async () => {
    const { booking, taskId } = await assignedTo(C1, "future");
    await h.db.query(`UPDATE booking SET status = 'completed' WHERE id = $1::uuid`, [booking.id]);
    as({ id: C1, role: "Cleaner" });
    const res = await startTask(req(`/x`, { method: "PUT" }), ctx(taskId));
    expect(res.status).toBe(200);
    expect((await taskFor(booking.id))[0].cleaning_status).toBe("in-progress");
  });

  it("rejection needs a note and returns the task to In Progress", async () => {
    const { taskId } = await assignedTo(C1);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'awaiting-inspection' WHERE id = $1::uuid`, [taskId]);
    as({ id: CSR, role: "CSR" });
    expect((await rejectTask(req(`/x`, { method: "PUT", body: {} }), ctx(taskId))).status).toBe(400);
    expect((await rejectTask(req(`/x`, { method: "PUT", body: { note: "Bathroom mirror streaky" } }), ctx(taskId))).status).toBe(200);
    const r = await h.db.query<{ cleaning_status: string; inspection_note: string }>(
      `SELECT cleaning_status, inspection_note FROM booking_cleaning WHERE id = $1::uuid`,
      [taskId],
    );
    expect(r.rows[0]).toEqual({ cleaning_status: "in-progress", inspection_note: "Bathroom mirror streaky" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Checklist completion and photo proof — full workflow
// ═════════════════════════════════════════════════════════════════════════════

describe("confirmation → assignment → checkout → cleaning → inspection", () => {
  it("runs the whole sequence, blocking submission until every task is ticked and every area photographed", async () => {
    const b = await addBooking();
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    expect(t.assigned_to).toBe(C1);
    as({ id: C1, role: "Cleaner" });

    // Checklist is closed until cleaning starts.
    const ck0 = await (await getChecklist(req(`/api/admin/cleaners?haven_id=${havenId}&booking_id=${b.id}`))).json();
    const firstTask = ck0.data.checklist.categories[0].tasks[0];
    expect((await tickTask(req(`/x`, { method: "PATCH", body: { task_id: firstTask.id, completed: true } }))).status).toBe(409);

    // Guest has checked out (booking is in the past) → start.
    expect((await startTask(req(`/x`, { method: "PUT" }), ctx(t.id))).status).toBe(200);

    // Nothing done yet → refused, naming the gap. A missing checklist or
    // unticked items never pass.
    let res = await completeTask(req(`/x`, { method: "PUT" }), ctx(t.id));
    expect(res.status).toBe(400);
    let body = await res.json();
    expect(body.incompleteCount).toBeGreaterThan(0);

    // Tick everything — still refused: no photos. One photo per CATEGORY
    // (the finished area), not per task.
    const all = ck0.data.checklist.categories.flatMap((c: { tasks: { id: string }[] }) => c.tasks);
    const cats: string[] = ck0.data.checklist.categories.map((c: { category: string }) => c.category);
    for (const task of all) {
      expect((await tickTask(req(`/x`, { method: "PATCH", body: { task_id: task.id, completed: true } }))).status).toBe(200);
    }
    res = await completeTask(req(`/x`, { method: "PUT" }), ctx(t.id));
    expect(res.status).toBe(400);
    body = await res.json();
    expect(body.incompleteCount).toBe(0);
    expect(body.missingPhotoCount).toBe(cats.length);
    expect(body.error).toMatch(/need a photo/);

    // The old "submit" action no longer force-completes anything.
    const submit = await checklistAction(req(`/x`, { method: "POST", body: { action: "submit", checklist_id: ck0.data.checklist.id } }));
    expect(submit.status).toBe(400);

    const photoFor = (category: string, name = "area.jpg") => {
      const fd = new FormData();
      fd.append("file", new File([new Uint8Array([1])], name, { type: "image/jpeg" }));
      fd.append("checklist_id", ck0.data.checklist.id);
      fd.append("category", category);
      return uploadPhoto(new NextRequest("http://localhost/x", { method: "POST", body: fd }));
    };

    // A photo for an area that isn't on this checklist is refused.
    expect((await photoFor("Not An Area")).status).toBe(400);

    // A photo does NOT tick anything — the checklist is ticked by hand.
    await tickTask(req(`/x`, { method: "PATCH", body: { task_id: all[0].id, completed: false } }));
    expect((await photoFor(cats[0])).status).toBe(200);
    {
      const ticked = await h.db.query<{ completed: boolean }>(`SELECT completed FROM cleaning_tasks WHERE id = $1::uuid`, [all[0].id]);
      expect(ticked.rows[0].completed).toBe(false);
    }
    await tickTask(req(`/x`, { method: "PATCH", body: { task_id: all[0].id, completed: true } }));

    // Photograph every area but one → still refused, and that one is named.
    for (const cat of cats.slice(1, -1)) {
      expect((await photoFor(cat)).status).toBe(200);
    }
    res = await completeTask(req(`/x`, { method: "PUT" }), ctx(t.id));
    expect(res.status).toBe(400);
    body = await res.json();
    expect(body.missingPhotoCategories).toEqual([cats[cats.length - 1]]);

    // Last area photo → the checklist is finished, so the room is handed in
    // automatically: Awaiting Inspection, not Ready. Done afterwards is a no-op.
    const last = await photoFor(cats[cats.length - 1], "last.jpg");
    expect(last.status).toBe(200);
    expect((await last.json()).autoCompleted).toBe(true);
    expect((await taskFor(b.id))[0].cleaning_status).toBe("awaiting-inspection");
    res = await completeTask(req(`/x`, { method: "PUT" }), ctx(t.id));
    expect(res.status).toBe(200);

    // Locked once handed in.
    expect((await tickTask(req(`/x`, { method: "PATCH", body: { task_id: firstTask.id, completed: false } }))).status).toBe(409);

    // Owner/CSR can review the proof: every area carries its photo.
    as({ id: OWNER, role: "Owner" });
    const review = await (await getChecklist(req(`/api/admin/cleaners?haven_id=${havenId}&booking_id=${b.id}`))).json();
    expect(review.data.checklist.categories.every((c: { photo_url: string | null }) => !!c.photo_url)).toBe(true);

    // Approve → Ready, attributed to Cleaner 1 permanently.
    expect((await approveTask(req(`/x`, { method: "PUT" }), ctx(t.id))).status).toBe(200);
    expect((await taskFor(b.id))[0].cleaning_status).toBe("ready");
    const o = await h.db.query<{ employee_id: string; state: string }>(
      `SELECT employee_id::text AS employee_id, state FROM cleaning_opportunities WHERE booking_cleaning_id = $1::uuid`,
      [t.id],
    );
    expect(o.rows).toEqual([{ employee_id: C1, state: "completed" }]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Migration: backfill from pre-existing data, and safe to re-run
// ═════════════════════════════════════════════════════════════════════════════

describe("2026-09-28 migration", () => {
  it("backfills the ledger and photo links from existing rows, and is idempotent", async () => {
    const db = newDb();
    const failed = await applySchema(db, { skip: (f) => f.endsWith("2026-09-28-cleaning-fair-assignment.sql") });
    failed.forEach((_e, f) => {
      if (f.endsWith("blocked_dates.sql")) failed.delete(f);
    });
    expect([...failed.entries()]).toEqual([]);

    const q = async <T,>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
    const [emp] = await q<{ id: string }>(
      `INSERT INTO employees (first_name, last_name, email, employment_id, hire_date, role)
       VALUES ('Old', 'Cleaner', 'old@t', 'E1', '2026-01-01', 'Cleaner') RETURNING id::text AS id`,
    );
    const [haven] = await q<{ id: string }>(
      `INSERT INTO havens (haven_name, tower, floor, view_type, capacity, room_size, beds, description, six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate)
       VALUES ('Haven 1','T','1','v',2,20,'b','d',1,1,1,1) RETURNING uuid_id::text AS id`,
    );
    const mk = async (ref: string, status: string, day: number) =>
      (await q<{ id: string }>(
        `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
         VALUES ($1, 'Haven 1', $2::date, $2::date + 1, '14:00', '00:00', $3) RETURNING id::text AS id`,
        [ref, `2020-02-${String(day).padStart(2, "0")}`, status],
      ))[0].id;
    const done = await mk("B-DONE", "completed", 1);
    const open = await mk("B-OPEN", "approved", 4);
    const gone = await mk("B-GONE", "cancelled", 7);
    for (const [b, s] of [[done, "ready"], [open, "assigned"], [gone, "assigned"]] as const) {
      await q(`INSERT INTO booking_cleaning (booking_id, cleaning_status, assigned_to, assignment_method) VALUES ($1::uuid, $2, $3::uuid, 'automatic')`, [b, s, emp.id]);
    }
    const [cl] = await q<{ id: string }>(
      `INSERT INTO cleaning_checklists (haven_id, booking_id, status) VALUES ($1::uuid, $2::uuid, 'in_progress') RETURNING id::text AS id`,
      [haven.id, open],
    );
    const [task] = await q<{ id: string }>(
      `INSERT INTO cleaning_tasks (checklist_id, category, task_description) VALUES ($1::uuid, 'Bedroom', 'Make bed') RETURNING id::text AS id`,
      [cl.id],
    );
    await q(`INSERT INTO cleaning_checklist_photos (checklist_id, category, image_url) VALUES ($1::uuid, 'Make bed', 'https://x/p.jpg')`, [cl.id]);

    const migration = fs.readFileSync(path.join(ROOT, "src/backend/migrations/2026-09-28-cleaning-fair-assignment.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // re-run, as db:setup does

    const ledger = await q<{ ref: string; state: string; release_reason: string | null }>(
      `SELECT b.booking_id AS ref, o.state, o.release_reason
       FROM cleaning_opportunities o JOIN booking_cleaning bc ON bc.id = o.booking_cleaning_id JOIN booking b ON b.id = bc.booking_id
       ORDER BY b.booking_id`,
    );
    expect(ledger).toEqual([
      { ref: "B-DONE", state: "completed", release_reason: null },
      { ref: "B-GONE", state: "released", release_reason: "cancelled" },
      { ref: "B-OPEN", state: "retained", release_reason: null },
    ]);

    const photo = await q<{ task_id: string }>(`SELECT task_id::text AS task_id FROM cleaning_checklist_photos`);
    expect(photo[0].task_id).toBe(task.id);

    // Checkout Feb 5 at '00:00' → due at the START of Feb 6, Manila = Feb 5 16:00Z.
    const sched = await q<{ scheduled_for: Date }>(`SELECT scheduled_for FROM booking_cleaning WHERE booking_id = $1::uuid`, [open]);
    expect(new Date(sched[0].scheduled_for).toISOString()).toBe("2020-02-05T16:00:00.000Z");
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Cleaner Google Calendar sync (against a recording fake of the Google API)
// ═════════════════════════════════════════════════════════════════════════════

type FakeEvent = { id: string; summary: string; start: string; end: string; description: string };

function fakeGoogle() {
  const calendars = new Map<string, { summary: string; events: Map<string, FakeEvent> }>();
  const shares: Array<{ calendarId: string; email: string }> = [];
  let seq = 0;
  let failNext = false;
  const cal = (id: string) => {
    const c = calendars.get(id);
    if (!c) throw Object.assign(new Error("calendar not found"), { code: 404 });
    return c;
  };
  const api: CleaningCalendarApi = {
    async createCalendar(summary) {
      const id = `cal${++seq}@group.calendar.google.com`;
      calendars.set(id, { summary, events: new Map() });
      return id;
    },
    async shareCalendar(calendarId, email) {
      shares.push({ calendarId, email });
    },
    async insertEvent(calendarId, body) {
      if (failNext) { failNext = false; throw new Error("Google is down"); }
      const id = `ev${++seq}`;
      cal(calendarId).events.set(id, { id, summary: body.summary, start: body.start.dateTime, end: body.end.dateTime, description: body.description });
      return id;
    },
    async updateEvent(calendarId, eventId, body) {
      const c = cal(calendarId);
      if (!c.events.has(eventId)) throw Object.assign(new Error("gone"), { code: 410 });
      c.events.set(eventId, { id: eventId, summary: body.summary, start: body.start.dateTime, end: body.end.dateTime, description: body.description });
    },
    async deleteEvent(calendarId, eventId) {
      calendars.get(calendarId)?.events.delete(eventId);
    },
  };
  return {
    api,
    calendars,
    shares,
    failOnce: () => { failNext = true; },
    eventsOf: (email: string) => {
      const share = shares.find((x) => x.email === email);
      return share ? [...(calendars.get(share.calendarId)?.events.values() ?? [])] : [];
    },
  };
}

describe("cleaner Google Calendar sync", () => {
  let g: ReturnType<typeof fakeGoogle>;
  const emailOf = async (id: string) =>
    (await h.db.query<{ email: string }>(`SELECT email FROM employees WHERE id = $1::uuid`, [id])).rows[0].email.toLowerCase();

  beforeEach(() => {
    g = fakeGoogle();
    __setCleaningCalendarApiForTests(g.api);
  });
  afterEach(() => __setCleaningCalendarApiForTests(null));

  it("an assignment creates the cleaner's calendar, shares it once, and adds the event", async () => {
    const a = await addBooking();
    const b = await addBooking();
    await h.db.query(`UPDATE employees SET status = 'inactive' WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`, [C2, C3, C4]);
    await confirm(a.id);
    await confirm(b.id);
    await __flushCleaningCalendarSyncs();

    expect(g.calendars.size).toBe(1);
    expect(g.shares).toEqual([{ calendarId: [...g.calendars.keys()][0], email: await emailOf(C1) }]);
    const events = g.eventsOf(await emailOf(C1));
    expect(events).toHaveLength(2);
    expect(events[0].summary).toMatch(/^🧹 Clean · DL-TEST-\d+ · Overnight$/);
    // 12:00 Manila checkout, no guest for days → a 2-hour block.
    expect(events[0].start).toMatch(/T04:00:00/);
    expect(new Date(events[0].end).getTime() - new Date(events[0].start).getTime()).toBe(2 * 3_600_000);
  });

  it("ends the event at the next guest's check-in when they arrive the same day", async () => {
    const a = await addBooking();
    await confirm(a.id);
    await __flushCleaningCalendarSyncs();
    const out = (await h.db.query<{ d: string }>(`SELECT check_out_date::text AS d FROM booking WHERE id = $1::uuid`, [a.id])).rows[0].d;
    await h.db.query(
      `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
       VALUES ('DL-NEXT', 'Haven 1', $1::date, $1::date + 1, '14:00', '12:00', 'approved')`,
      [out],
    );
    const [t] = await taskFor(a.id);
    await syncCleaningCalendarEvent(t.id);
    const [ev] = g.eventsOf(await emailOf(C1));
    expect(ev.end).toMatch(/T06:00:00/); // 14:00 Manila
    expect(ev.description).toContain("Next guest checks in");
  });

  it("status changes update the title, and re-syncing never duplicates", async () => {
    const a = await addBooking();
    await confirm(a.id);
    await __flushCleaningCalendarSyncs();
    const [t] = await taskFor(a.id);
    as({ id: C1, role: "Cleaner" });
    await startTask(req(`/x`, { method: "PUT" }), ctx(t.id));
    await __flushCleaningCalendarSyncs();
    await syncCleaningCalendarEvent(t.id);
    await syncCleaningCalendarEvent(t.id);
    const events = g.eventsOf(await emailOf(C1));
    expect(events).toHaveLength(1);
    expect(events[0].summary.startsWith("🟡 Cleaning")).toBe(true);
  });

  it("a reassignment moves the event to the new cleaner's calendar", async () => {
    const a = await addBooking();
    await confirm(a.id); // C1
    await __flushCleaningCalendarSyncs();
    const [t] = await taskFor(a.id);
    as({ id: OWNER, role: "Owner" });
    await assignTask(req(`/x`, { method: "PUT", body: { assigned_to: C2 } }), ctx(t.id));
    await __flushCleaningCalendarSyncs();
    expect(g.eventsOf(await emailOf(C1))).toHaveLength(0);
    expect(g.eventsOf(await emailOf(C2))).toHaveLength(1);
  });

  it("a cancellation removes the event", async () => {
    const a = await addBooking();
    await confirm(a.id);
    await __flushCleaningCalendarSyncs();
    await cancel(a.id);
    await __flushCleaningCalendarSyncs();
    expect(g.eventsOf(await emailOf(C1))).toHaveLength(0);
    const [t] = await taskFor(a.id);
    const row = await h.db.query<{ gcal_event_id: string | null }>(`SELECT gcal_event_id FROM booking_cleaning WHERE id = $1::uuid`, [t.id]);
    expect(row.rows[0].gcal_event_id).toBeNull();
  });

  it("a Google failure never blocks the cleaning action and is recorded for the heal pass", async () => {
    g.failOnce();
    const a = await addBooking();
    await confirm(a.id);
    await __flushCleaningCalendarSyncs();
    const [t] = await taskFor(a.id);
    expect(t.assigned_to).toBe(C1);
    const row = await h.db.query<{ gcal_error: string | null }>(`SELECT gcal_error FROM booking_cleaning WHERE id = $1::uuid`, [t.id]);
    expect(row.rows[0].gcal_error).toMatch(/Google is down/);
    expect(await syncCleaningCalendarEvent(t.id)).toBe("created");
    expect(g.eventsOf(await emailOf(C1))).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Notifications to cleaner AND office (owner, 2026-10-23)
// ═════════════════════════════════════════════════════════════════════════════

describe("cleaning notifications for cleaner and office", () => {
  const types = () => h.notifications.map((n) => n.notificationType);

  it("reminds both about an upcoming room, then that it's ready to clean — once each", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    expect(t.assigned_to).toBeTruthy();

    // Due in 3 hours → "upcoming" to the cleaner and to Owner/CSR.
    await h.db.query(`UPDATE booking_cleaning SET scheduled_for = NOW() + INTERVAL '3 hours' WHERE id = $1::uuid`, [t.id]);
    h.notifications.length = 0;
    expect(await sendCleaningReminders()).toEqual({ upcoming: 1, start: 0 });
    expect(h.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: t.assigned_to, notificationType: "cleaning_upcoming" }),
      expect.objectContaining({ roles: ["Owner", "CSR"], notificationType: "cleaning_upcoming" }),
    ]));
    // A second sweep sends nothing new.
    expect(await sendCleaningReminders()).toEqual({ upcoming: 0, start: 0 });

    // Checkout time passed → "ready to clean" to both, once.
    await h.db.query(`UPDATE booking_cleaning SET scheduled_for = NOW() - INTERVAL '10 minutes' WHERE id = $1::uuid`, [t.id]);
    h.notifications.length = 0;
    expect(await sendCleaningReminders()).toEqual({ upcoming: 0, start: 1 });
    expect(types().filter((x) => x === "cleaning_start")).toHaveLength(2);
    expect(await sendCleaningReminders()).toEqual({ upcoming: 0, start: 0 });
  });

  it("doesn't flood anyone about old rooms", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    await h.db.query(`UPDATE booking_cleaning SET scheduled_for = NOW() - INTERVAL '5 days' WHERE id = $1::uuid`, [t.id]);
    h.notifications.length = 0;
    expect(await sendCleaningReminders()).toEqual({ upcoming: 0, start: 0 });
    expect(h.notifications).toHaveLength(0);
  });

  it("tells the office a room is done, the cleaner it was sent, and the cleaner when it's approved", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    h.notifications.length = 0;
    await notifyCleaningEvent(t.id, "handed-in");
    expect(h.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ roles: ["Owner", "CSR"], notificationType: "cleaning_done" }),
      expect.objectContaining({ userId: t.assigned_to, notificationType: "cleaning_submitted" }),
    ]));
    h.notifications.length = 0;
    await notifyCleaningEvent(t.id, "approved");
    expect(h.notifications).toEqual([expect.objectContaining({ userId: t.assigned_to, notificationType: "cleaning_approved" })]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A cleaner says they're not available (owner, 2026-10-26)
// ═════════════════════════════════════════════════════════════════════════════

describe("cleaner declines an assigned room", () => {
  it("frees the room, tells the office, and keeps automatic assignment off it until the office reassigns", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    const cleaner = t.assigned_to!;

    // Only the assigned cleaner can decline.
    const other = [C1, C2, C3, C4].find((c) => c !== cleaner)!;
    expect(await declineCleaningTask({ cleaningTaskId: t.id, cleanerId: other, reason: "" })).toMatchObject({ ok: false, status: 403 });

    h.notifications.length = 0;
    expect(await declineCleaningTask({ cleaningTaskId: t.id, cleanerId: cleaner, reason: "Sick" })).toEqual({ ok: true });
    const [after] = await taskFor(b.id);
    expect(after.assigned_to).toBeNull();
    expect(after.cleaning_status).toBe("pending");
    expect(after.unassigned_reason).toMatch(/isn't available: Sick/);
    expect(h.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ roles: ["Owner", "CSR"], notificationType: "cleaning_declined" }),
    ]));

    // No replacement credit for declining.
    const credits = await h.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cleaning_opportunities WHERE employee_id = $1::uuid AND state = 'released' AND credit_consumed = false`, [cleaner]);
    expect(credits.rows[0].n).toBe(0);

    // The sweep and the confirmation hook leave it for the office.
    await sweepUnassignedCleaning();
    await ensureCleaningAssignment(b.id, "checkout");
    expect((await taskFor(b.id))[0].assigned_to).toBeNull();

    // The office assigns someone — the decline mark is cleared.
    await reassignCleaningTask({ cleaningTaskId: t.id, toEmployeeId: other, assignedBy: OWNER, currentStatus: "pending", currentAssigneeId: null });
    const marked = await h.db.query<{ declined_at: Date | null }>(`SELECT declined_at FROM booking_cleaning WHERE id = $1::uuid`, [t.id]);
    expect(marked.rows[0].declined_at).toBeNull();
    expect((await taskFor(b.id))[0].assigned_to).toBe(other);
  });

  it("can't decline a room already being cleaned", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    await h.db.query(`UPDATE booking_cleaning SET cleaning_status = 'in-progress' WHERE id = $1::uuid`, [t.id]);
    expect(await declineCleaningTask({ cleaningTaskId: t.id, cleanerId: t.assigned_to!, reason: "" })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("cleaner accepts an assigned room", () => {
  it("records the accept once, tells the office once, and resets when the room changes hands", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    const cleaner = t.assigned_to!;
    const other = [C1, C2, C3, C4].find((c) => c !== cleaner)!;

    expect(await acceptCleaningTask({ cleaningTaskId: t.id, cleanerId: other })).toMatchObject({ ok: false, status: 403 });

    h.notifications.length = 0;
    expect(await acceptCleaningTask({ cleaningTaskId: t.id, cleanerId: cleaner })).toEqual({ ok: true });
    expect(await acceptCleaningTask({ cleaningTaskId: t.id, cleanerId: cleaner })).toEqual({ ok: true });
    expect(h.notifications.filter((n) => n.notificationType === "cleaning_accepted")).toHaveLength(1);
    const acc = await h.db.query<{ accepted_at: Date | null }>(`SELECT accepted_at FROM booking_cleaning WHERE id = $1::uuid`, [t.id]);
    expect(acc.rows[0].accepted_at).not.toBeNull();

    // Reassigned to someone else → they accept it themselves.
    await reassignCleaningTask({ cleaningTaskId: t.id, toEmployeeId: other, assignedBy: OWNER, currentStatus: "assigned", currentAssigneeId: cleaner });
    const reset = await h.db.query<{ accepted_at: Date | null }>(`SELECT accepted_at FROM booking_cleaning WHERE id = $1::uuid`, [t.id]);
    expect(reset.rows[0].accepted_at).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Accept / Reject through the real API routes the buttons call
// ═════════════════════════════════════════════════════════════════════════════

describe("Accept / Reject API (what the cleaner's buttons call)", () => {
  const accepted = async (id: string) =>
    (await h.db.query<{ accepted_at: Date | null }>(`SELECT accepted_at FROM booking_cleaning WHERE id = $1::uuid`, [id])).rows[0].accepted_at;

  it("Accept: needs a login, only the assigned cleaner, shows up in their task list", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    const mine = t.assigned_to!;
    const other = [C1, C2, C3, C4].find((c) => c !== mine)!;

    as(null);
    expect((await acceptRoute(req("/x", { method: "PUT" }), ctx(t.id))).status).toBe(401);
    as({ id: other, role: "Cleaner" });
    expect((await acceptRoute(req("/x", { method: "PUT" }), ctx(t.id))).status).toBe(403);

    as({ id: mine, role: "Cleaner" });
    const ok = await acceptRoute(req("/x", { method: "PUT" }), ctx(t.id));
    expect(ok.status).toBe(200);
    expect(await accepted(t.id)).not.toBeNull();

    // Their own task list carries it (that's what flips the card to Start cleaning).
    const list = await (await listTasks(req("/api/admin/cleaners/tasks"))).json();
    const row = list.data.find((x: { cleaning_id: string }) => x.cleaning_id === t.id);
    expect(row.accepted_at).toBeTruthy();
  });

  it("Reject: sends the room back to the office with the reason, and the cleaner can't accept it after", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    const mine = t.assigned_to!;

    as({ id: mine, role: "Cleaner" });
    h.notifications.length = 0;
    const res = await declineRoute(req("/x", { method: "PUT", body: { reason: "Schedule conflict" } }), ctx(t.id));
    expect(res.status).toBe(200);
    const [after] = await taskFor(b.id);
    expect(after.assigned_to).toBeNull();
    expect(after.unassigned_reason).toMatch(/Schedule conflict/);
    expect(h.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ roles: ["Owner", "CSR"], notificationType: "cleaning_declined" }),
    ]));
    // It's gone from their list, and accepting it now is refused.
    const list = await (await listTasks(req("/api/admin/cleaners/tasks"))).json();
    expect(list.data.some((x: { cleaning_id: string }) => x.cleaning_id === t.id)).toBe(false);
    expect((await acceptRoute(req("/x", { method: "PUT" }), ctx(t.id))).status).toBe(403);
  });

  it("Reject also works after accepting (\"Can't make it any more?\")", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    as({ id: t.assigned_to!, role: "Cleaner" });
    expect((await acceptRoute(req("/x", { method: "PUT" }), ctx(t.id))).status).toBe(200);
    expect((await declineRoute(req("/x", { method: "PUT", body: {} }), ctx(t.id))).status).toBe(200);
    expect(await accepted(t.id)).toBeNull();
  });

  it("Starting a room counts as accepting it", async () => {
    const b = await addBooking(); // past stay → can start now
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    as({ id: t.assigned_to!, role: "Cleaner" });
    expect(await accepted(t.id)).toBeNull();
    expect((await startTask(req("/x", { method: "PUT" }), ctx(t.id))).status).toBe(200);
    expect(await accepted(t.id)).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Booking → Cleaning Operations transmission (2026-10-28)
// ═════════════════════════════════════════════════════════════════════════════

describe("booking → cleaning task transmission", () => {
  const taskCount = async (bookingId: string) =>
    (await h.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM booking_cleaning WHERE booking_id = $1::uuid`, [bookingId])).rows[0].n;

  // A stay whose checkout was N days ago (Manila calendar).
  async function addRecentBooking(status: string, daysAgo: number): Promise<{ id: string }> {
    bookingSeq++;
    const r = await h.db.query<{ id: string }>(
      `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
       VALUES ($1, 'Haven 1', (NOW() AT TIME ZONE 'Asia/Manila')::date - $2::int - 1,
               (NOW() AT TIME ZONE 'Asia/Manila')::date - $2::int, '14:00', '12:00', $3)
       RETURNING id::text AS id`,
      [`DL-RECENT-${bookingSeq}`, daysAgo, status],
    );
    return r.rows[0];
  }

  it("a booking that goes straight to on-going / checked-in gets its task and a cleaner", async () => {
    for (const status of ["on-going", "checked-in"]) {
      const b = await addBooking({ when: "future" });
      await h.db.query(`UPDATE booking SET status = $2 WHERE id = $1::uuid`, [b.id, status]);
      await onBookingStatusChanged(b.id, status);
      const [t] = await taskFor(b.id);
      expect(t?.assigned_to, status).toBeTruthy();
    }
  });

  it("the sweep / 'Check for missing tasks' recovers a missed booking and a recent checkout, without duplicates", async () => {
    // Confirmed, but the hook never ran.
    const missed = await addBooking({ when: "future" });
    await h.db.query(`UPDATE booking SET status = 'approved' WHERE id = $1::uuid`, [missed.id]);
    // Checked out yesterday, never had a task.
    const recent = await addRecentBooking("completed", 1);
    // Checked out long ago with no task — old history stays untouched.
    const old = await addRecentBooking("completed", 30);

    as({ id: OWNER, role: "Owner" });
    expect((await syncRoute()).status).toBe(200);
    expect(await taskCount(missed.id)).toBe(1);
    expect(await taskCount(recent.id)).toBe(1);
    expect(await taskCount(old.id)).toBe(0);
    expect((await taskFor(missed.id))[0].assigned_to).toBeTruthy();

    // Running it again changes nothing.
    const before = (await taskFor(missed.id))[0].assigned_to;
    await syncRoute();
    await sweepUnassignedCleaning();
    expect(await taskCount(missed.id)).toBe(1);
    expect(await taskCount(recent.id)).toBe(1);
    expect((await taskFor(missed.id))[0].assigned_to).toBe(before);

    // Cleaners can't run it.
    as({ id: C1, role: "Cleaner" });
    expect((await syncRoute()).status).toBe(403);
  });

  it("deactivating a cleaner hands their upcoming rooms to an active cleaner", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    const leaving = t.assigned_to!;

    as({ id: OWNER, role: "Owner" });
    const res = await staffStatusRoute(req("/x", { method: "PATCH", body: { status: "inactive" } }), ctx(leaving));
    expect(res.status).toBe(200);
    expect((await res.json()).releasedRooms).toBe(1);

    const [after] = await taskFor(b.id);
    expect(after.assigned_to).toBeTruthy();
    expect(after.assigned_to).not.toBe(leaving);
    expect(await taskCount(b.id)).toBe(1);
  });

  it("the sweep also rescues rooms already stuck with an inactive cleaner", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    await h.db.query(`UPDATE employees SET status = 'inactive' WHERE id = $1::uuid`, [t.assigned_to]);
    await sweepUnassignedCleaning();
    const [after] = await taskFor(b.id);
    expect(after.assigned_to).toBeTruthy();
    expect(after.assigned_to).not.toBe(t.assigned_to);
  });

  it("assigned rooms show on that cleaner's list; unassigned ones show to admin", async () => {
    const b = await addBooking({ when: "future" });
    await confirm(b.id);
    const [t] = await taskFor(b.id);
    as({ id: t.assigned_to!, role: "Cleaner" });
    const mine = await (await listTasks(req("/api/admin/cleaners/tasks"))).json();
    expect(mine.data.some((x: { cleaning_id: string }) => x.cleaning_id === t.id)).toBe(true);

    // Rejected by the cleaner → off their list, on admin's list with no cleaner.
    await declineCleaningTask({ cleaningTaskId: t.id, cleanerId: t.assigned_to!, reason: "" });
    as({ id: OWNER, role: "Owner" });
    const all = await (await listTasks(req("/api/admin/cleaners/tasks"))).json();
    const row = all.data.find((x: { cleaning_id: string }) => x.cleaning_id === t.id);
    expect(row).toBeTruthy();
    expect(row.assigned_cleaner_id).toBeNull();
  });
});
