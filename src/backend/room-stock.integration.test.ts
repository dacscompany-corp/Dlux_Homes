import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";

// Room Stock (owner MVP 2026-10-22) end to end against an in-memory Postgres:
// cleaner counts → requests → Owner moves it Pending → Processing → Completed
// → the room's count goes back up. Same pool/session mocking as
// cleaning-workflow.integration.test.ts, cut down to what this feature touches.

type Session = { user: { id: string; role: string; name?: string } } | null;

const h = vi.hoisted(() => ({
  db: null as unknown as import("@electric-sql/pglite").PGlite,
  session: null as Session,
  notifications: [] as Array<Record<string, unknown>>,
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
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => h.session) }));

import { GET as getStock, POST as postStock } from "@/app/api/admin/cleaners/room-stock/route";
import { PUT as putSupply, DELETE as deleteSupply } from "@/app/api/admin/cleaners/room-stock/[id]/route";
import { PATCH as patchCounts } from "@/app/api/admin/cleaners/room-stock/counts/route";
import { GET as getRequests, POST as postRequest } from "@/app/api/admin/cleaners/restock-requests/route";
import { PATCH as patchRequest } from "@/app/api/admin/cleaners/restock-requests/[id]/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const HAVEN = "44444444-4444-4444-8444-444444444444";

const as = (id: string, role: string, name = role) => { h.session = { user: { id, role, name } }; };
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : {}),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  h.db = new PGlite();
  await h.db.exec(`
    CREATE TABLE havens (uuid_id UUID PRIMARY KEY, haven_name TEXT NOT NULL);
    CREATE TABLE employees (id UUID PRIMARY KEY, first_name TEXT, last_name TEXT, role TEXT, status TEXT DEFAULT 'active');
  `);
  await h.db.query(`INSERT INTO havens VALUES ($1, 'Tower 4 Unit')`, [HAVEN]);
  for (const [id, fn, role] of [[OWNER, "Olive", "Owner"], [C1, "Cora", "Cleaner"], [C2, "Cy", "Cleaner"]]) {
    await h.db.query(`INSERT INTO employees (id, first_name, last_name, role) VALUES ($1, $2, 'Test', $3)`, [id, fn, role]);
  }
  await h.db.exec(fs.readFileSync(path.join(process.cwd(), "src/backend/migrations/2026-10-22-room-stock.sql"), "utf8"));
}, 60_000);

describe("Room Stock", () => {
  it("runs count → request → processing → completed, and tops the room back up", async () => {
    // Cleaners can't build the list; the owner adds the starter list.
    as(C1, "Cleaner", "Cora Test");
    expect((await postStock(req("/x", { method: "POST", body: { starter: true } }))).status).toBe(403);
    as(OWNER, "Owner");
    const added = await (await postStock(req("/x", { method: "POST", body: { starter: true } }))).json();
    expect(added.data.added).toBeGreaterThan(5);
    // Re-running the starter list doesn't duplicate items.
    expect((await (await postStock(req("/x", { method: "POST", body: { starter: true } }))).json()).data.added).toBe(0);

    // Cleaner sees the list and counts what's left.
    as(C1, "Cleaner", "Cora Test");
    const stock = await (await getStock(req("/x"))).json();
    expect(stock.data.haven.id).toBe(HAVEN);
    const tp = stock.data.supplies.find((s: { item_name: string }) => s.item_name === "Toilet paper");
    expect(tp.par_quantity).toBe(4);
    expect((await patchCounts(req("/x", { method: "PATCH", body: { counts: [{ id: tp.id, current_quantity: 1 }] } }))).status).toBe(200);
    expect((await patchCounts(req("/x", { method: "PATCH", body: { counts: [{ id: tp.id, current_quantity: -2 }] } }))).status).toBe(400);

    // …and asks for 3 more, plus a one-off item.
    h.notifications = [];
    const made = await postRequest(req("/x", { method: "POST", body: {
      note: "Running out fast", items: [{ room_supply_id: tp.id, quantity: 3 }, { item_name: "Air freshener", quantity: 1 }],
    } }));
    expect(made.status).toBe(201);
    expect(h.notifications[0]).toMatchObject({ roles: ["Owner", "CSR"], notificationType: "restock_request" });

    const afterReq = await (await getStock(req("/x"))).json();
    expect(afterReq.data.supplies.find((s: { id: string }) => s.id === tp.id).open_request_qty).toBe(3);

    // Cleaner 2 doesn't see Cleaner 1's requests; the owner sees both.
    as(C2, "Cleaner", "Cy Test");
    expect((await (await getRequests(req("/x"))).json()).data).toHaveLength(0);
    as(OWNER, "Owner");
    const all = (await (await getRequests(req("/x"))).json()).data as { id: string; item_name: string; status: string }[];
    expect(all).toHaveLength(2);
    const tpReq = all.find((r) => r.item_name === "Toilet paper")!;

    // Only Owner/CSR can move a request.
    as(C1, "Cleaner", "Cora Test");
    expect((await patchRequest(req("/x", { method: "PATCH", body: { status: "completed" } }), ctx(tpReq.id))).status).toBe(403);

    as(OWNER, "Owner");
    expect((await patchRequest(req("/x", { method: "PATCH", body: { status: "processing" } }), ctx(tpReq.id))).status).toBe(200);
    h.notifications = [];
    expect((await patchRequest(req("/x", { method: "PATCH", body: { status: "completed" } }), ctx(tpReq.id))).status).toBe(200);
    expect(h.notifications[0]).toMatchObject({ userId: C1, notificationType: "restock_completed" });

    // Delivered: 1 + 3 = 4, nothing left open.
    const done = await (await getStock(req("/x"))).json();
    const tpNow = done.data.supplies.find((s: { id: string }) => s.id === tp.id);
    expect(tpNow.current_quantity).toBe(4);
    expect(tpNow.open_request_qty).toBe(0);

    // Completing twice doesn't add twice, and a completed request can't go back.
    expect((await patchRequest(req("/x", { method: "PATCH", body: { status: "completed" } }), ctx(tpReq.id))).status).toBe(200);
    expect((await (await getStock(req("/x"))).json()).data.supplies.find((s: { id: string }) => s.id === tp.id).current_quantity).toBe(4);
    expect((await patchRequest(req("/x", { method: "PATCH", body: { status: "pending" } }), ctx(tpReq.id))).status).toBe(400);

    // Cleaner 1 sees their requests with the new status.
    as(C1, "Cleaner", "Cora Test");
    const mine = (await (await getRequests(req("/x"))).json()).data as { item_name: string; status: string }[];
    expect(mine.find((r) => r.item_name === "Toilet paper")!.status).toBe("completed");
  }, 60_000);

  it("lets Owner/CSR edit and remove items, and refuses duplicates", async () => {
    as(OWNER, "Owner");
    const created = await postStock(req("/x", { method: "POST", body: { item_name: "Hand soap", unit_type: "bottles", par_quantity: 2 } }));
    expect(created.status).toBe(200);
    expect((await postStock(req("/x", { method: "POST", body: { item_name: "hand SOAP", par_quantity: 1 } }))).status).toBe(409);

    const list = (await (await getStock(req("/x"))).json()).data.supplies as { id: string; item_name: string }[];
    const soap = list.find((s) => s.item_name === "Hand soap")!;
    expect((await putSupply(req("/x", { method: "PUT", body: { par_quantity: 3 } }), ctx(soap.id))).status).toBe(200);
    // Only the office changes an item's settings.
    as(C1, "Cleaner");
    expect((await putSupply(req("/x", { method: "PUT", body: { par_quantity: 9 } }), ctx(soap.id))).status).toBe(403);
    as(OWNER, "Owner");
    h.notifications = [];
    expect((await deleteSupply(req("/x", { method: "DELETE" }), ctx(soap.id))).status).toBe(200);
    const after = (await (await getStock(req("/x"))).json()).data.supplies as { item_name: string }[];
    expect(after.some((s) => s.item_name === "Hand soap")).toBe(false);
    // The office's own changes don't notify the office.
    expect(h.notifications).toHaveLength(0);
  }, 60_000);

  it("lets cleaners add and remove items, telling the office each time", async () => {
    as(C1, "Cleaner", "Cora Test");
    h.notifications = [];
    const made = await postStock(req("/x", { method: "POST", body: { item_name: "Slippers", unit_type: "pairs", par_quantity: 2 } }));
    expect(made.status).toBe(200);
    expect(h.notifications[0]).toMatchObject({ roles: ["Owner", "CSR"], title: "Room supply added" });
    expect(String(h.notifications[0].message)).toContain("Cora Test added Slippers");

    const list = (await (await getStock(req("/x"))).json()).data.supplies as { id: string; item_name: string; current_quantity: number }[];
    const slippers = list.find((s) => s.item_name === "Slippers")!;
    expect(slippers.current_quantity).toBe(2);

    h.notifications = [];
    expect((await deleteSupply(req("/x", { method: "DELETE" }), ctx(slippers.id))).status).toBe(200);
    expect(h.notifications[0]).toMatchObject({ roles: ["Owner", "CSR"], title: "Room supply removed" });
    const after = (await (await getStock(req("/x"))).json()).data.supplies as { item_name: string }[];
    expect(after.some((s) => s.item_name === "Slippers")).toBe(false);
  }, 60_000);
});
