// "Does a newly added staff account just work?" — end to end, against a real
// Postgres engine (PGlite, in-process) with the repo's own schema. Nothing here
// touches the real database.
//
// Covers adding accounts through the same API the Owner/CSR screens use,
// signing in with them through the real login code, the role rules that stop
// a CSR promoting themselves, and a brand-new cleaner using staff messaging.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { NextRequest } from "next/server";

type Session = { user: { id: string; role: string; name?: string; email?: string } } | null;

const h = vi.hoisted(() => {
  // The login's bot check is skipped without a secret, as in local dev.
  delete process.env.TURNSTILE_SECRET_KEY;
  return {
    db: null as unknown as import("@electric-sql/pglite").PGlite,
    session: null as Session,
    notifications: [] as Array<Record<string, unknown>>,
  };
});

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
      try {
        return await run(sql, params);
      } finally {
        release();
      }
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
vi.mock("@/backend/utils/mailer", () => ({ sendEmployeeWelcomeEmail: vi.fn(async () => {}) }));
vi.mock("@/backend/utils/cloudinary", () => ({ upload_file: vi.fn(async () => ({ url: "https://img.test/x.jpg" })) }));
vi.mock("@/backend/utils/sendOtpEmail", () => ({ sendOtpEmail: vi.fn(async () => {}) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => h.session) }));

// Imported after the mocks are registered.
import { authOptions } from "@/lib/auth";
import { POST as createEmployeeRoute } from "@/app/api/admin/employees/route";
import { PUT as updateEmployeeRoute } from "@/app/api/admin/employees/[id]/route";
import { listStaffThreads, sendStaffMessage, getStaffThreadMessages } from "@/backend/controller/staffMessageController";

// ── Schema ────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 0;
async function seedEmployee(role: "Owner" | "CSR" | "Cleaner", first: string): Promise<string> {
  seq++;
  const r = await h.db.query<{ id: string }>(
    `INSERT INTO employees (first_name, last_name, email, employment_id, hire_date, role, status, password)
     VALUES ($1, 'Seed', $2, $3, '2026-01-01', $4, 'active', 'x') RETURNING id::text AS id`,
    [first, `${first.toLowerCase()}${seq}@seed.test`, `SEED-${seq}`, role],
  );
  return r.rows[0].id;
}

const as = (id: string, role: string) => { h.session = { user: { id, role, name: role } }; };

const post = (body: unknown) =>
  createEmployeeRoute(new NextRequest("http://localhost/api/admin/employees", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));

const put = (id: string, body: unknown) =>
  updateEmployeeRoute(new NextRequest(`http://localhost/api/admin/employees/${id}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

const newStaff = (over: Record<string, unknown> = {}) => ({
  first_name: "Maria", last_name: "Santos", email: "Maria.Santos@Example.com",
  phone: "09170000000", employment_id: `EMP-${++seq}`, hire_date: "2026-10-01",
  role: "Cleaner", department: "Housekeeping", password: "Cleaner#2026", ...over,
});

// The real login check behind the admin login page.
type Authorize = (creds: Record<string, unknown>, req: unknown) => Promise<{ id: string; email: string; name: string; role: string } | null>;
const authorize: Authorize = (creds, req) => {
  const provider = authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: Authorize } };
  return provider.options.authorize(creds, req);
};
const login = (email: string, password: string) => authorize({ email, password }, { headers: {} });

let OWNER = "", CSR = "";

beforeAll(async () => {
  h.db = new PGlite({ extensions: { uuid_ossp, btree_gist } });
  const failed = await applySchema(h.db);
  failed.forEach((_e, f) => { if (f.endsWith("blocked_dates.sql")) failed.delete(f); });
  expect([...failed.entries()]).toEqual([]);
}, 60_000);

beforeEach(async () => {
  await h.db.exec(`TRUNCATE employees RESTART IDENTITY CASCADE;`);
  await h.db.exec(`TRUNCATE conversations RESTART IDENTITY CASCADE;`).catch(() => {});
  h.notifications.length = 0;
  OWNER = await seedEmployee("Owner", "Olivia");
  CSR = await seedEmployee("CSR", "Carlo");
});

// ═════════════════════════════════════════════════════════════════════════════

describe("adding a staff account", () => {
  it("a CSR can add a cleaner; the email is stored lowercase", async () => {
    as(CSR, "CSR");
    const res = await post(newStaff());
    expect(res.status).toBe(201);
    const row = (await h.db.query<{ email: string; role: string; status: string }>(
      `SELECT email, role, status FROM employees WHERE first_name = 'Maria'`,
    )).rows[0];
    expect(row).toEqual({ email: "maria.santos@example.com", role: "Cleaner", status: "active" });
  });

  it("refuses the same email again, whatever its capital letters", async () => {
    as(CSR, "CSR");
    await post(newStaff());
    const again = await post(newStaff({ email: "MARIA.SANTOS@example.com", employment_id: "EMP-X" }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/already exists/);
  });

  it("refuses a role no portal accepts, a short password, or a missing name", async () => {
    as(OWNER, "Owner");
    expect((await post(newStaff({ role: "cleaner" }))).status).toBe(400);
    expect((await post(newStaff({ password: "short" }))).status).toBe(400);
    expect((await post(newStaff({ last_name: "" }))).status).toBe(400);
  });

  it("only an Owner can add another Owner", async () => {
    as(CSR, "CSR");
    expect((await post(newStaff({ role: "Owner", email: "boss@example.com" }))).status).toBe(403);
    as(OWNER, "Owner");
    expect((await post(newStaff({ role: "Owner", email: "boss@example.com" }))).status).toBe(201);
  });

  it("a cleaner cannot add accounts at all", async () => {
    const cleaner = await seedEmployee("Cleaner", "Cris");
    as(cleaner, "Cleaner");
    expect((await post(newStaff())).status).toBe(403);
  });
});

describe("signing in with a new account", () => {
  it("works with any capitals or stray spaces in the email", async () => {
    as(CSR, "CSR");
    await post(newStaff());
    const user = await login("  maria.SANTOS@example.com ", "Cleaner#2026");
    expect(user).toMatchObject({ email: "maria.santos@example.com", role: "Cleaner", name: "Maria Santos" });
  });

  it("a wrong password with different capitals fails cleanly and counts the attempt", async () => {
    as(CSR, "CSR");
    await post(newStaff());
    await expect(login("MARIA.SANTOS@EXAMPLE.COM", "wrong-password")).rejects.toThrow(/Invalid email or password/);
    const attempts = (await h.db.query<{ login_attempts: number }>(
      `SELECT login_attempts FROM employees WHERE email = 'maria.santos@example.com'`,
    )).rows[0].login_attempts;
    expect(attempts).toBe(1);
  });

  it("each role signs in with its own role, ready for its own portal", async () => {
    as(OWNER, "Owner");
    await post(newStaff({ role: "CSR", email: "new.csr@example.com", first_name: "Nina" }));
    await post(newStaff({ role: "Owner", email: "new.owner@example.com", first_name: "Oscar" }));
    expect((await login("new.csr@example.com", "Cleaner#2026"))?.role).toBe("CSR");
    expect((await login("new.owner@example.com", "Cleaner#2026"))?.role).toBe("Owner");
  });
});

describe("editing a staff account", () => {
  it("a CSR cannot promote themselves (or anyone) to Owner", async () => {
    as(CSR, "CSR");
    expect((await put(CSR, { role: "Owner" })).status).toBe(403);
    const role = (await h.db.query<{ role: string }>(`SELECT role FROM employees WHERE id = $1`, [CSR])).rows[0].role;
    expect(role).toBe("CSR");
  });

  it("a CSR cannot demote an Owner", async () => {
    as(CSR, "CSR");
    expect((await put(OWNER, { role: "Cleaner" })).status).toBe(403);
  });

  it("an Owner can change roles, but only to a real one", async () => {
    as(OWNER, "Owner");
    expect((await put(CSR, { role: "Owner" })).status).toBe(200);
    expect((await put(CSR, { role: "Manager" })).status).toBe(400);
  });

  it("an email change is stored lowercase and can't take someone else's", async () => {
    as(OWNER, "Owner");
    const other = await seedEmployee("Cleaner", "Pia");
    const taken = (await h.db.query<{ email: string }>(`SELECT email FROM employees WHERE id = $1`, [other])).rows[0].email;
    expect((await put(CSR, { email: taken.toUpperCase() })).status).toBe(409);
    expect((await put(CSR, { email: " Carlo.New@Example.com " })).status).toBe(200);
    expect((await h.db.query<{ email: string }>(`SELECT email FROM employees WHERE id = $1`, [CSR])).rows[0].email)
      .toBe("carlo.new@example.com");
  });
});

describe("a brand-new cleaner and staff messaging", () => {
  it("gets an office thread on first use, and every Owner/CSR can answer it", async () => {
    as(CSR, "CSR");
    await post(newStaff());
    const maria = (await h.db.query<{ id: string }>(`SELECT id::text AS id FROM employees WHERE first_name = 'Maria'`)).rows[0].id;

    // The new cleaner opens Messages: their thread exists straight away.
    const mine = await listStaffThreads({ id: maria, role: "Cleaner", name: "Maria Santos" });
    expect(mine).toHaveLength(1);
    const convId = mine[0].conversation_id!;
    await sendStaffMessage({ id: maria, role: "Cleaner", name: "Maria Santos" }, {}, "Hi, I'm new!");

    // Both the Owner and the CSR see her in the office inbox, with the unread message.
    for (const viewer of [{ id: OWNER, role: "Owner", name: "Olivia Seed" }, { id: CSR, role: "CSR", name: "Carlo Seed" }]) {
      const inbox = await listStaffThreads(viewer);
      const row = inbox.find((t) => t.cleaner_id === maria);
      expect(row).toMatchObject({ conversation_id: convId, last_message: "Hi, I'm new!" });
    }

    // The CSR replies; the cleaner reads it.
    await sendStaffMessage({ id: CSR, role: "CSR", name: "Carlo Seed" }, { conversationId: convId }, "Welcome, Maria!");
    const thread = await getStaffThreadMessages({ id: maria, role: "Cleaner", name: "Maria Santos" }, convId);
    expect(thread.map((m) => m.message_text)).toEqual(["Hi, I'm new!", "Welcome, Maria!"]);
    expect(thread[1].from_office).toBe(true);
  });

  it("a second new cleaner can't open the first one's thread", async () => {
    as(CSR, "CSR");
    await post(newStaff());
    await post(newStaff({ email: "second@example.com", first_name: "Sam" }));
    const ids = (await h.db.query<{ id: string; first_name: string }>(`SELECT id::text AS id, first_name FROM employees WHERE role = 'Cleaner'`)).rows;
    const maria = ids.find((r) => r.first_name === "Maria")!.id;
    const sam = ids.find((r) => r.first_name === "Sam")!.id;
    const [thread] = await listStaffThreads({ id: maria, role: "Cleaner", name: "Maria Santos" });
    await expect(getStaffThreadMessages({ id: sam, role: "Cleaner", name: "Sam Santos" }, thread.conversation_id!))
      .rejects.toThrow(/another cleaner/);
  });
});
