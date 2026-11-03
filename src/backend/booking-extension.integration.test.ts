import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { NextRequest } from "next/server";

// Extend Booking (admin-only, 2026-10-31) end to end against an in-memory
// Postgres with the real schema: who may use it, availability and turnover,
// the suggested price, the booking/payment update (paid history untouched),
// the cleaning reschedule, and paying the extension without a new deposit.
// Same pool/session mocking as cleaning-workflow.integration.test.ts.

type Session = { user: { id: string; role: string; name?: string } } | null;

const h = vi.hoisted(() => ({
  db: null as unknown as import("@electric-sql/pglite").PGlite,
  session: null as Session,
  notifications: [] as Array<Record<string, unknown>>,
  emails: [] as Array<Record<string, unknown>>,
}));

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
    const rowCount = res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0);
    return { rows: res.rows as Record<string, unknown>[], rowCount };
  };
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const release = await acquire();
      try { return await run(sql, params); } finally { release(); }
    },
    async connect() {
      const release = await acquire();
      let released = false;
      return { query: run, release: () => { if (!released) { released = true; release(); } } };
    },
  };
  return { default: pool };
});

vi.mock("@/backend/utils/notificationHelper", () => ({
  createNotificationForUser: vi.fn(async (userId: string, data: Record<string, unknown>) => { h.notifications.push({ userId, ...data }); }),
  createNotificationsForRoles: vi.fn(async (roles: string[], data: Record<string, unknown>) => { h.notifications.push({ roles, ...data }); }),
}));
vi.mock("@/backend/utils/activityLogger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/backend/utils/extensionEmail", () => ({
  sendExtensionEmail: vi.fn(async (d: Record<string, unknown>) => { h.emails.push(d); return { kind: "stay extension", ok: true }; }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => h.session) }));

import { GET as previewRoute, POST as extendRoute } from "@/app/api/admin/bookings/[id]/extend/route";
import { GET as listRoute } from "@/app/api/admin/booking-extensions/route";
import { PATCH as payRoute } from "@/app/api/admin/booking-extensions/[id]/route";

const ROOT = path.resolve(__dirname, "..", "..");
const sqlFiles = (dir: string) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(ROOT, dir, f));

async function applySchema(db: PGlite) {
  await db.exec(`SET TIME ZONE 'UTC';`);
  await db.exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS btree_gist;`);
  const base = path.join(ROOT, "supabase", "00_base_tables.sql");
  const files = [...(fs.existsSync(base) ? [base] : []), ...sqlFiles("src/backend/models"), ...sqlFiles("src/backend/migrations")];
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

const as = (user: { id: string; role: string } | null) => { h.session = user ? { user: { ...user, name: "Olive Owner" } } : null; };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, init: { method: string; body?: unknown } = { method: "GET" }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method,
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

// Manila calendar day, `plus` days from today.
const day = (plus: number) => {
  const d = new Date(Date.now() + 8 * 3600_000);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};

let OWNER = "", CLEANER = "";
let seq = 0;
async function addEmployee(role: string, first: string) {
  seq++;
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO employees (first_name, last_name, email, employment_id, hire_date, role)
     VALUES ($1, 'Test', $2, $3, '2026-01-01', $4) RETURNING id::text AS id`,
    [first, `${first.toLowerCase()}${seq}@t.local`, `EMP-X${seq}`, role],
  );
  return r.rows[0].id;
}

async function addBooking(o: { ref: string; inDay: number; outDay: number; inTime?: string; outTime?: string; status?: string; payStatus?: string; total?: number; paid?: number }) {
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status, adults)
     VALUES ($1, 'Haven 1', $2, $3, $4, $5, $6, 2) RETURNING id::text AS id`,
    [o.ref, day(o.inDay), day(o.outDay), o.inTime ?? "19:00", o.outTime ?? "17:00", o.status ?? "approved"],
  );
  const id = r.rows[0].id;
  await h.db.query(
    `INSERT INTO booking_guests (booking_id, first_name, last_name, email, phone) VALUES ($1, 'Gina', 'Guest', 'gina@guest.test', '0917')`,
    [id],
  );
  const total = o.total ?? 4000;
  const paid = o.paid ?? 2000;
  await h.db.query(
    `INSERT INTO booking_payments (booking_id, payment_method, room_rate, total_amount, down_payment, remaining_balance, amount_paid, payment_status)
     VALUES ($1, 'gcash', $2::numeric, $2::numeric, $3::numeric, $2::numeric - $3::numeric, $3::numeric, $4)`,
    [id, total, paid, o.payStatus ?? "approved_down_payment"],
  );
  return id;
}

const payment = async (id: string) =>
  (await h.db.query<{ total_amount: string; amount_paid: string; remaining_balance: string; payment_status: string }>(
    `SELECT total_amount::text, amount_paid::text, remaining_balance::text, payment_status FROM booking_payments WHERE booking_id = $1::uuid`, [id])).rows[0];

beforeAll(async () => {
  h.db = new PGlite({ extensions: { uuid_ossp, btree_gist } });
  const failed = await applySchema(h.db);
  failed.forEach((_e, f) => { if (f.endsWith("blocked_dates.sql")) failed.delete(f); });
  expect([...failed.entries()]).toEqual([]);
}, 90_000);

beforeEach(async () => {
  await h.db.exec(`TRUNCATE booking, employees, havens RESTART IDENTITY CASCADE;`);
  h.notifications.length = 0;
  h.emails.length = 0;
  seq = 0;
  await h.db.query(
    `INSERT INTO havens (haven_name, tower, floor, view_type, capacity, room_size, beds, description,
                         six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate)
     VALUES ('Haven 1', 'T4', '10', 'City', 4, 30, '1 Queen', 'Test unit', 1499, 1499, 1899, 2099)`,
  );
  OWNER = await addEmployee("Owner", "Olive");
  CLEANER = await addEmployee("Cleaner", "Cora");
});

describe("Extend Booking", () => {
  it("only Owner/CSR can preview or extend", async () => {
    const id = await addBooking({ ref: "DL-EXT-1", inDay: 1, outDay: 3 });
    as(null);
    expect((await previewRoute(req(`/x?new_check_out=${day(4)}`), ctx(id))).status).toBe(401);
    as({ id: CLEANER, role: "Cleaner" });
    expect((await previewRoute(req(`/x?new_check_out=${day(4)}`), ctx(id))).status).toBe(403);
    expect((await extendRoute(req("/x", { method: "POST", body: { new_check_out: day(4), charge: 1 } }), ctx(id))).status).toBe(403);
    expect((await listRoute(req("/x"))).status).toBe(403);
  });

  it("previews nights and a suggested price, and refuses dates that clash or don't make sense", async () => {
    const id = await addBooking({ ref: "DL-EXT-1", inDay: 1, outDay: 3 });
    await addBooking({ ref: "DL-NEXT-9", inDay: 5, outDay: 6 });
    as({ id: OWNER, role: "Owner" });

    const ok = await previewRoute(req(`/x?new_check_out=${day(5)}`), ctx(id));
    expect(ok.status).toBe(200);
    const data = (await ok.json()).data;
    expect(data.addedNights).toBe(2);
    expect(data.oldCheckOutDate).toBe(day(3));
    expect(data.nights).toHaveLength(2);
    expect(data.suggested).toBeGreaterThan(0);

    // Next guest arrives day 5 at 7PM — staying to day 6 (5PM) runs into them.
    const clash = await previewRoute(req(`/x?new_check_out=${day(6)}`), ctx(id));
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toContain("DL-NEXT-9");

    expect((await previewRoute(req(`/x?new_check_out=${day(3)}`), ctx(id))).status).toBe(400);
    expect((await previewRoute(req(`/x?new_check_out=${day(2)}`), ctx(id))).status).toBe(400);
    expect((await previewRoute(req(`/x?new_check_out=soon`), ctx(id))).status).toBe(400);
  });

  it("refuses bookings that aren't confirmed, and single sessions", async () => {
    as({ id: OWNER, role: "Owner" });
    const unpaid = await addBooking({ ref: "DL-UNPAID", inDay: 1, outDay: 2, payStatus: "pending_down_payment", paid: 0 });
    expect((await previewRoute(req(`/x?new_check_out=${day(3)}`), ctx(unpaid))).status).toBe(409);
    const pending = await addBooking({ ref: "DL-PEND", inDay: 10, outDay: 11, status: "pending" });
    expect((await previewRoute(req(`/x?new_check_out=${day(12)}`), ctx(pending))).status).toBe(409);
    const daycation = await addBooking({ ref: "DL-DAY", inDay: 20, outDay: 20, inTime: "07:00", outTime: "17:00" });
    const res = await previewRoute(req(`/x?new_check_out=${day(21)}`), ctx(daycation));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/single session/);
  });

  it("extends the stay, bills it separately, moves the cleaning, and keeps the paid history", async () => {
    const id = await addBooking({ ref: "DL-EXT-1", inDay: 1, outDay: 3, total: 4000, paid: 2000 });
    await h.db.query(
      `INSERT INTO booking_cleaning (booking_id, cleaning_status, assigned_to, assignment_method, reminder_upcoming_sent_at)
       VALUES ($1::uuid, 'assigned', $2::uuid, 'automatic', NOW())`,
      [id, CLEANER],
    );
    as({ id: OWNER, role: "Owner" });

    const res = await extendRoute(req("/x", { method: "POST", body: { new_check_out: day(4), charge: 1500, note: "Guest asked at the desk" } }), ctx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.addedNights).toBe(1);
    expect(body.emailStatus.ok).toBe(true);

    const b = (await h.db.query<{ out: string }>(`SELECT check_out_date::text AS out FROM booking WHERE id = $1::uuid`, [id])).rows[0];
    expect(b.out).toBe(day(4));

    // Owed, not paid: total and balance up by 1,500; amount already paid unchanged.
    expect(await payment(id)).toEqual({ total_amount: "5500.00", amount_paid: "2000.00", remaining_balance: "3500.00", payment_status: "approved_down_payment" });

    const ext = (await h.db.query<{ old: string; new: string; added_nights: number; charge: string; status: string; note: string; created_by: string }>(
      `SELECT old_check_out_date::text AS old, new_check_out_date::text AS new, added_nights, charge_amount::text AS charge, status, note, created_by::text
         FROM booking_extensions WHERE booking_id = $1::uuid`, [id])).rows;
    expect(ext).toEqual([{ old: day(3), new: day(4), added_nights: 1, charge: "1500.00", status: "unpaid", note: "Guest asked at the desk", created_by: OWNER }]);

    // Cleaning follows the new checkout, reminders re-arm, the cleaner is told.
    const task = (await h.db.query<{ due: string; reminder: string | null }>(
      `SELECT (scheduled_for AT TIME ZONE 'Asia/Manila')::date::text AS due, reminder_upcoming_sent_at::text AS reminder FROM booking_cleaning WHERE booking_id = $1::uuid`, [id])).rows[0];
    expect(task).toEqual({ due: day(4), reminder: null });
    expect(h.notifications.some((n) => n.userId === CLEANER && String(n.message).includes("DL-EXT-1"))).toBe(true);
    // The guest is emailed the new checkout and what's due.
    expect(h.emails[0]).toMatchObject({ email: "gina@guest.test", newCheckOutDate: day(4), charge: 1500, balanceDue: 3500 });

    // History is listed for the booking.
    const list = await (await listRoute(req(`/x?booking_id=${id}`))).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].created_by_name).toBe("Olive Test");
  });

  it("can't extend into another booking, even past the preview", async () => {
    const id = await addBooking({ ref: "DL-EXT-1", inDay: 1, outDay: 3 });
    await addBooking({ ref: "DL-NEXT-9", inDay: 4, outDay: 5 });
    as({ id: OWNER, role: "Owner" });
    const res = await extendRoute(req("/x", { method: "POST", body: { new_check_out: day(5), charge: 1000 } }), ctx(id));
    expect(res.status).toBe(409);
    expect((await h.db.query<{ out: string }>(`SELECT check_out_date::text AS out FROM booking WHERE id = $1::uuid`, [id])).rows[0].out).toBe(day(3));
    expect((await payment(id)).total_amount).toBe("4000.00");
    // A bad price is refused before anything changes.
    expect((await extendRoute(req("/x", { method: "POST", body: { new_check_out: day(4), charge: -5 } }), ctx(id))).status).toBe(400);
  });

  it("records the extension payment without taking another deposit", async () => {
    const id = await addBooking({ ref: "DL-EXT-1", inDay: 1, outDay: 3, total: 4000, paid: 4000, payStatus: "approved_full_payment" });
    as({ id: OWNER, role: "Owner" });
    expect((await extendRoute(req("/x", { method: "POST", body: { new_check_out: day(4), charge: 1800 } }), ctx(id))).status).toBe(200);
    // A fully paid booking owes money again until the extension is paid.
    expect(await payment(id)).toEqual({ total_amount: "5800.00", amount_paid: "4000.00", remaining_balance: "1800.00", payment_status: "approved_down_payment" });

    const [ext] = (await (await listRoute(req(`/x?booking_id=${id}`))).json()).data;
    expect((await payRoute(req("/x", { method: "PATCH", body: { method: "GCash" } }), ctx(ext.id))).status).toBe(200);
    expect(await payment(id)).toEqual({ total_amount: "5800.00", amount_paid: "5800.00", remaining_balance: "0.00", payment_status: "approved_full_payment" });
    const paid = (await (await listRoute(req(`/x?booking_id=${id}`))).json()).data[0];
    expect(paid).toMatchObject({ status: "paid", payment_method: "GCash" });
    // Paying twice is refused.
    expect((await payRoute(req("/x", { method: "PATCH", body: {} }), ctx(ext.id))).status).toBe(409);
    // No security deposit row was created or changed.
    expect((await h.db.query(`SELECT 1 FROM booking_security_deposits WHERE booking_id = $1::uuid`, [id])).rows).toHaveLength(0);
  });
});
