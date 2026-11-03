import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { NextRequest } from "next/server";

// Pool Pass fees are not business revenue (owner, 2026-11-03): every revenue
// figure — the dashboard summary, revenue by room, the monthly trend and the
// all-time profitability total — leaves them out, and reports them on their
// own as pool_pass_total. Real schema, in-memory Postgres.

const h = vi.hoisted(() => ({ db: null as unknown as import("@electric-sql/pglite").PGlite }));

vi.mock("@/backend/config/db", () => {
  const run = async (sql: string, params?: unknown[]) => {
    const res = await h.db.query(sql, params as unknown[]);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rows.length || (res.affectedRows ?? 0) };
  };
  return { default: { query: run, connect: async () => ({ query: run, release: () => {} }) } };
});

import { getAnalyticsSummary, getRevenueByRoom, getMonthlyRevenue } from "@/backend/controller/analyticsController";
import { getAllTimeTotals } from "@/backend/controller/overheadReportsController";

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

// This month, in Manila — the stays below all check in this month.
const MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).slice(0, 7);
let n = 0;

async function booking(o: { total: number; down: number; addOnsTotal: number; payStatus: string; addOns?: [string, number, number, string?][] }) {
  n++;
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO booking (booking_id, room_name, check_in_date, check_out_date, check_in_time, check_out_time, status)
     VALUES ($1, 'Haven 1', $2::date, $2::date + 1, '19:00', '17:00', 'completed') RETURNING id::text AS id`,
    [`DL-POOL-${n}`, `${MONTH}-${String(n).padStart(2, "0")}`],
  );
  const id = r.rows[0].id;
  const paid = o.payStatus === "approved_full_payment" ? o.total : o.down;
  await h.db.query(
    `INSERT INTO booking_payments (booking_id, payment_method, room_rate, add_ons_total, total_amount, down_payment, remaining_balance, amount_paid, payment_status)
     VALUES ($1, 'gcash', $2::numeric, $3::numeric, $2::numeric, $4::numeric, $2::numeric - $5::numeric, $5::numeric, $6)`,
    [id, o.total, o.addOnsTotal, o.down, paid, o.payStatus],
  );
  for (const [name, price, qty, status] of o.addOns ?? []) {
    await h.db.query(`INSERT INTO booking_add_ons (booking_id, name, price, quantity, status) VALUES ($1, $2, $3, $4, $5)`, [id, name, price, qty, status ?? "pending"]);
  }
}

const get = async (fn: (r: NextRequest) => Promise<Response>, qs: string) => (await (await fn(new NextRequest(`http://localhost/x?${qs}`))).json()).data;

beforeAll(async () => {
  h.db = new PGlite({ extensions: { uuid_ossp, btree_gist } });
  const failed = await applySchema(h.db);
  failed.forEach((_e, f) => { if (f.endsWith("blocked_dates.sql")) failed.delete(f); });
  expect([...failed.entries()]).toEqual([]);

  // Fully paid, 2 Swimming Pool passes at ₱150 (₱1,899 stay + ₱300).
  await booking({ total: 2199, down: 1250, addOnsTotal: 300, payStatus: "approved_full_payment", addOns: [["Swimming Pool", 150, 2]] });
  // Down payment only: half the stay + the pool passes in full.
  await booking({ total: 2199, down: 1250, addOnsTotal: 300, payStatus: "approved_down_payment", addOns: [["Swimming Pool", 150, 2]] });
  // No pool — counted exactly as before.
  await booking({ total: 1899, down: 950, addOnsTotal: 0, payStatus: "approved_full_payment" });
  // Older/admin booking: legacy "poolPass" add-on, add_ons_total never filled in.
  await booking({ total: 1999, down: 1000, addOnsTotal: 0, payStatus: "approved_full_payment", addOns: [["poolPass", 100, 1]] });
  // A cancelled pool add-on isn't taken off anything.
  await booking({ total: 1899, down: 950, addOnsTotal: 0, payStatus: "approved_full_payment", addOns: [["Pool Pass", 150, 1, "cancelled"]] });
  // Not paid yet — no collected revenue, no pool collected.
  await booking({ total: 2199, down: 1250, addOnsTotal: 300, payStatus: "pending_down_payment", addOns: [["Swimming Pool", 150, 2]] });
}, 90_000);

describe("Pool Pass is excluded from revenue", () => {
  // Collected: 1,899 + 950 + 1,899 + 1,899 + 1,899 + 0
  const COLLECTED = 1899 + 950 + 1899 + 1899 + 1899;
  // Pool collected: 300 + 300 + 0 + 100 + 0 + 0
  const POOL = 700;

  it("dashboard summary: revenue without pool fees, pool reported separately", async () => {
    const s = await get(getAnalyticsSummary, `month=${MONTH}`);
    expect(s.total_revenue).toBe(COLLECTED);
    expect(s.pool_pass_total).toBe(POOL);
    // Gross: booked value less add-ons (pool included) — the legacy row too.
    expect(s.total_gross_revenue).toBe(1899 * 6);
    expect(s.total_bookings).toBe(6);
  });

  it("revenue by room and the monthly trend agree with the summary", async () => {
    const rooms = await get(getRevenueByRoom, `month=${MONTH}`);
    expect(rooms[0].revenue).toBe(COLLECTED);
    const months = await get(getMonthlyRevenue, `months=2`);
    const thisMonth = months.find((m: { month: string }) => m.month === MONTH);
    expect(thisMonth.revenue).toBe(COLLECTED);
  });

  it("the all-time profitability total leaves pool fees out too", async () => {
    const res = await getAllTimeTotals();
    const d = (await res.json()).data;
    expect(d.revenue).toBe(COLLECTED);
    expect(d.pool_pass_total).toBe(POOL);
  });
});
