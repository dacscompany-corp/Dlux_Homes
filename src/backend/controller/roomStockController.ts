import { NextResponse } from "next/server";
import pool from "../config/db";
import { createNotificationForUser, createNotificationsForRoles } from "@/backend/utils/notificationHelper";

// Cleaning Operations → Room Stock (owner MVP, 2026-10-22).
//
//   Cleaner checks room supplies → updates quantities → requests needed items
//   → Owner/CSR process the request → supplies delivered → request Completed.
//
// Tables: room_supplies (what's in the room) and restock_requests — see
// migrations/2026-10-22-room-stock.sql. Route files do the auth; these
// functions take already-validated input plus the acting employee.

export type RequestStatus = "pending" | "processing" | "completed";
export const REQUEST_STATUSES: RequestStatus[] = ["pending", "processing", "completed"];

// A sensible first list for a condo unit, offered to the owner as a one-click
// start. Quantities are the "fully stocked" amount; the owner can edit them.
export const STARTER_SUPPLIES: { item_name: string; unit_type: string; par_quantity: number }[] = [
  { item_name: "Toilet paper", unit_type: "rolls", par_quantity: 4 },
  { item_name: "Shampoo", unit_type: "sachets", par_quantity: 4 },
  { item_name: "Conditioner", unit_type: "sachets", par_quantity: 4 },
  { item_name: "Body soap", unit_type: "bars", par_quantity: 2 },
  { item_name: "Toothbrush & toothpaste kit", unit_type: "kits", par_quantity: 4 },
  { item_name: "Bath towels", unit_type: "pcs", par_quantity: 4 },
  { item_name: "Drinking water", unit_type: "bottles", par_quantity: 4 },
  { item_name: "Coffee", unit_type: "sachets", par_quantity: 6 },
  { item_name: "Sugar & creamer", unit_type: "sachets", par_quantity: 6 },
  { item_name: "Trash bags", unit_type: "pcs", par_quantity: 5 },
  { item_name: "Dishwashing liquid", unit_type: "bottles", par_quantity: 1 },
  { item_name: "Tissue", unit_type: "boxes", par_quantity: 1 },
];

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status });
const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const wholeNumber = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** The unit to use: the one asked for if it exists, else the first one. */
async function resolveHaven(havenId: string | null): Promise<{ id: string; name: string } | null> {
  const res = await pool.query<{ id: string; name: string }>(
    `SELECT uuid_id::text AS id, haven_name AS name FROM havens
      ORDER BY (uuid_id::text = $1) DESC, haven_name ASC LIMIT 1`,
    [havenId ?? ""],
  );
  return res.rows[0] ?? null;
}

const SUPPLY_SELECT = `
  SELECT s.id::text AS id, s.haven_id::text AS haven_id, s.item_name, s.unit_type,
         s.par_quantity, s.current_quantity, s.display_order,
         s.last_counted_at, s.updated_at,
         NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), '') AS last_counted_by_name,
         (SELECT COALESCE(SUM(r.quantity), 0)::int FROM restock_requests r
           WHERE r.room_supply_id = s.id AND r.status <> 'completed') AS open_request_qty
    FROM room_supplies s
    LEFT JOIN employees e ON e.id = s.last_counted_by
`;

/** GET — the unit's supply list (any staff). */
export async function listRoomSupplies(havenId: string | null): Promise<NextResponse> {
  try {
    const haven = await resolveHaven(havenId);
    if (!haven) return ok({ haven: null, havens: [], supplies: [] });
    const [havens, supplies] = await Promise.all([
      pool.query<{ id: string; name: string }>(`SELECT uuid_id::text AS id, haven_name AS name FROM havens ORDER BY haven_name`),
      pool.query(`${SUPPLY_SELECT} WHERE s.haven_id = $1::uuid ORDER BY s.display_order, s.item_name`, [haven.id]),
    ]);
    return ok({ haven, havens: havens.rows, supplies: supplies.rows });
  } catch (err) {
    console.error("listRoomSupplies failed:", err);
    return fail("Could not load room supplies", 500);
  }
}

/**
 * POST — add one item, or the starter list (Owner/CSR). A cleaner may add one
 * item too (owner, 2026-10-29); `byCleaner` names them so the office is told.
 */
export async function createRoomSupplies(body: {
  haven_id?: string; starter?: boolean; item_name?: string; unit_type?: string; par_quantity?: unknown; current_quantity?: unknown;
}, byCleaner: string | null = null): Promise<NextResponse> {
  try {
    const haven = await resolveHaven(isUuid(body.haven_id) ? body.haven_id : null);
    if (!haven) return fail("No room found to add supplies to.", 404);

    const items = body.starter
      ? STARTER_SUPPLIES.map((s) => ({ ...s, current_quantity: s.par_quantity }))
      : [{
          item_name: String(body.item_name ?? "").trim(),
          unit_type: String(body.unit_type ?? "pcs").trim() || "pcs",
          par_quantity: wholeNumber(body.par_quantity),
          current_quantity: wholeNumber(body.current_quantity ?? body.par_quantity),
        }];

    for (const it of items) {
      if (!it.item_name) return fail("Give the item a name.");
      if (it.item_name.length > 100) return fail("Item name is too long.");
      if (it.par_quantity === null || it.current_quantity === null) return fail("Quantities must be whole numbers, 0 or more.");
    }

    const order = await pool.query<{ n: number }>(
      `SELECT COALESCE(MAX(display_order), 0)::int AS n FROM room_supplies WHERE haven_id = $1::uuid`, [haven.id]);
    let next = order.rows[0].n;
    let added = 0;
    for (const it of items) {
      next += 1;
      const res = await pool.query(
        `INSERT INTO room_supplies (haven_id, item_name, unit_type, par_quantity, current_quantity, display_order)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         ON CONFLICT (haven_id, lower(item_name)) DO NOTHING`,
        [haven.id, it.item_name, it.unit_type, it.par_quantity, it.current_quantity, next],
      );
      added += res.rowCount ?? 0;
    }
    if (!body.starter && added === 0) return fail("That item is already on the list.", 409);
    if (byCleaner) {
      await createNotificationsForRoles(["Owner", "CSR"], {
        title: "Room supply added",
        message: `${byCleaner} added ${items[0].item_name} (full = ${items[0].par_quantity} ${items[0].unit_type}) to ${haven.name}'s supply list.`,
        notificationType: "restock_request",
      }).catch((e) => console.error("supply-added notify failed:", e));
    }
    return ok({ added });
  } catch (err) {
    console.error("createRoomSupplies failed:", err);
    return fail("Could not add the item", 500);
  }
}

/** PUT — rename / change unit or full-stock amount (Owner/CSR). */
export async function updateRoomSupply(id: string, body: { item_name?: string; unit_type?: string; par_quantity?: unknown }): Promise<NextResponse> {
  if (!isUuid(id)) return fail("Unknown item", 404);
  const name = body.item_name !== undefined ? String(body.item_name).trim() : undefined;
  const par = body.par_quantity !== undefined ? wholeNumber(body.par_quantity) : undefined;
  if (name !== undefined && !name) return fail("Give the item a name.");
  if (par === null) return fail("Full-stock amount must be a whole number, 0 or more.");
  try {
    const res = await pool.query(
      `UPDATE room_supplies SET
         item_name = COALESCE($2, item_name),
         unit_type = COALESCE(NULLIF($3, ''), unit_type),
         par_quantity = COALESCE($4, par_quantity),
         updated_at = NOW()
       WHERE id = $1::uuid RETURNING id`,
      [id, name ?? null, body.unit_type !== undefined ? String(body.unit_type).trim() : null, par ?? null],
    );
    if (!res.rowCount) return fail("Unknown item", 404);
    return ok({ id });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return fail("Another item already has that name.", 409);
    console.error("updateRoomSupply failed:", err);
    return fail("Could not save the item", 500);
  }
}

/**
 * DELETE — remove an item from the room list. Requests keep their name.
 * Owner/CSR, or a cleaner (owner, 2026-10-29) — then the office is told.
 */
export async function deleteRoomSupply(id: string, byCleaner: string | null = null): Promise<NextResponse> {
  if (!isUuid(id)) return fail("Unknown item", 404);
  try {
    const res = await pool.query<{ item_name: string }>(`DELETE FROM room_supplies WHERE id = $1::uuid RETURNING item_name`, [id]);
    if (!res.rowCount) return fail("Unknown item", 404);
    if (byCleaner) {
      await createNotificationsForRoles(["Owner", "CSR"], {
        title: "Room supply removed",
        message: `${byCleaner} removed ${res.rows[0].item_name} from the room's supply list.`,
        notificationType: "restock_request",
      }).catch((e) => console.error("supply-removed notify failed:", e));
    }
    return ok({ id });
  } catch (err) {
    console.error("deleteRoomSupply failed:", err);
    return fail("Could not remove the item", 500);
  }
}

/** PATCH counts — the cleaner's "what's left in the room" (any staff). */
export async function saveSupplyCounts(counts: unknown, actorId: string | null): Promise<NextResponse> {
  if (!Array.isArray(counts) || counts.length === 0) return fail("Nothing to save.");
  const clean: { id: string; qty: number }[] = [];
  for (const c of counts as { id?: unknown; current_quantity?: unknown }[]) {
    const qty = wholeNumber(c?.current_quantity);
    if (!isUuid(c?.id) || qty === null) return fail("Each count needs an item and a whole number, 0 or more.");
    clean.push({ id: c.id as string, qty });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const c of clean) {
      await client.query(
        `UPDATE room_supplies SET current_quantity = $2, last_counted_at = NOW(),
                last_counted_by = $3::uuid, updated_at = NOW()
          WHERE id = $1::uuid`,
        [c.id, c.qty, isUuid(actorId) ? actorId : null],
      );
    }
    await client.query("COMMIT");
    return ok({ saved: clean.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("saveSupplyCounts failed:", err);
    return fail("Could not save the counts", 500);
  } finally {
    client.release();
  }
}

const REQUEST_SELECT = `
  SELECT r.id::text AS id, r.haven_id::text AS haven_id, h.haven_name AS room_name,
         r.room_supply_id::text AS room_supply_id, r.item_name, r.quantity, r.note, r.status,
         r.requested_at, r.processing_at, r.completed_at, r.admin_note,
         r.requested_by::text AS requested_by,
         NULLIF(TRIM(COALESCE(rq.first_name, '') || ' ' || COALESCE(rq.last_name, '')), '') AS requested_by_name,
         NULLIF(TRIM(COALESCE(hb.first_name, '') || ' ' || COALESCE(hb.last_name, '')), '') AS handled_by_name,
         s.unit_type
    FROM restock_requests r
    LEFT JOIN havens h ON h.uuid_id = r.haven_id
    LEFT JOIN room_supplies s ON s.id = r.room_supply_id
    LEFT JOIN employees rq ON rq.id = r.requested_by
    LEFT JOIN employees hb ON hb.id = r.handled_by
`;

/** GET requests. Cleaners see their own; Owner/CSR see everyone's. */
export async function listRestockRequests(opts: { status: string | null; onlyRequester: string | null }): Promise<NextResponse> {
  try {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status && (REQUEST_STATUSES as string[]).includes(opts.status)) {
      params.push(opts.status);
      where.push(`r.status = $${params.length}`);
    }
    if (opts.onlyRequester) {
      params.push(opts.onlyRequester);
      where.push(`r.requested_by = $${params.length}::uuid`);
    }
    const res = await pool.query(
      `${REQUEST_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, r.requested_at DESC
       LIMIT 200`,
      params,
    );
    return ok(res.rows);
  } catch (err) {
    console.error("listRestockRequests failed:", err);
    return fail("Could not load restock requests", 500);
  }
}

/** POST — one request per item (any staff). Owner/CSR are notified. */
export async function createRestockRequests(
  body: { haven_id?: string; note?: string; items?: { room_supply_id?: string; item_name?: string; quantity?: unknown }[] },
  actor: { id: string | null; name: string },
): Promise<NextResponse> {
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return fail("Pick at least one item to request.");
  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  // Look the room up before taking a connection for the transaction.
  const haven = await resolveHaven(isUuid(body.haven_id) ? body.haven_id : null).catch(() => null);
  if (!haven) return fail("No room found for this request.", 404);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created: { item_name: string; quantity: number }[] = [];
    for (const it of items) {
      const qty = wholeNumber(it.quantity);
      if (!qty) { await client.query("ROLLBACK"); return fail("Each item needs a quantity of 1 or more."); }
      let name = String(it.item_name ?? "").trim();
      let supplyId: string | null = null;
      if (isUuid(it.room_supply_id)) {
        const s = await client.query<{ item_name: string }>(
          `SELECT item_name FROM room_supplies WHERE id = $1::uuid AND haven_id = $2::uuid`, [it.room_supply_id, haven.id]);
        if (!s.rows[0]) { await client.query("ROLLBACK"); return fail("That item isn't on this room's list."); }
        supplyId = it.room_supply_id;
        name = s.rows[0].item_name;
      }
      if (!name) { await client.query("ROLLBACK"); return fail("Each item needs a name."); }
      await client.query(
        `INSERT INTO restock_requests (haven_id, room_supply_id, item_name, quantity, note, requested_by)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)`,
        [haven.id, supplyId, name.slice(0, 100), qty, note, isUuid(actor.id) ? actor.id : null],
      );
      created.push({ item_name: name, quantity: qty });
    }
    await client.query("COMMIT");

    const list = created.map((c) => `${c.quantity} × ${c.item_name}`).join(", ");
    await createNotificationsForRoles(["Owner", "CSR"], {
      title: "Restock request",
      message: `${actor.name} asked for ${list} for ${haven.name}.${note ? ` Note: ${note}` : ""}`,
      notificationType: "restock_request",
    }).catch((e) => console.error("restock notify failed:", e));

    return ok({ created: created.length }, 201);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("createRestockRequests failed:", err);
    return fail("Could not send the request", 500);
  } finally {
    client.release();
  }
}

/**
 * PATCH — Owner/CSR move a request along. Completing it means the supplies
 * were delivered, so the room's count goes up by the requested amount (in the
 * same transaction). The requester is told when it's completed.
 */
export async function updateRestockRequest(
  id: string,
  body: { status?: string; admin_note?: string },
  actorId: string | null,
): Promise<NextResponse> {
  if (!isUuid(id)) return fail("Unknown request", 404);
  const status = body.status as RequestStatus | undefined;
  if (status && !REQUEST_STATUSES.includes(status)) return fail("Status must be pending, processing or completed.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ status: RequestStatus; room_supply_id: string | null; quantity: number; item_name: string; requested_by: string | null }>(
      `SELECT status, room_supply_id::text AS room_supply_id, quantity, item_name, requested_by::text AS requested_by
         FROM restock_requests WHERE id = $1::uuid FOR UPDATE`, [id]);
    const req = cur.rows[0];
    if (!req) { await client.query("ROLLBACK"); return fail("Unknown request", 404); }
    if (req.status === "completed" && status && status !== "completed") {
      await client.query("ROLLBACK");
      return fail("This request is already completed.");
    }

    await client.query(
      `UPDATE restock_requests SET
         status = COALESCE($2, status),
         admin_note = COALESCE($3, admin_note),
         handled_by = $4::uuid,
         processing_at = CASE WHEN $2 = 'processing' AND processing_at IS NULL THEN NOW() ELSE processing_at END,
         completed_at  = CASE WHEN $2 = 'completed'  AND completed_at  IS NULL THEN NOW() ELSE completed_at END
       WHERE id = $1::uuid`,
      [id, status ?? null, body.admin_note !== undefined ? String(body.admin_note).trim().slice(0, 500) : null, isUuid(actorId) ? actorId : null],
    );

    const nowCompleted = status === "completed" && req.status !== "completed";
    if (nowCompleted && req.room_supply_id) {
      await client.query(
        `UPDATE room_supplies SET current_quantity = current_quantity + $2, updated_at = NOW() WHERE id = $1::uuid`,
        [req.room_supply_id, req.quantity],
      );
    }
    await client.query("COMMIT");

    if (nowCompleted && req.requested_by) {
      await createNotificationForUser(req.requested_by, {
        title: "Supplies delivered",
        message: `Your request for ${req.quantity} × ${req.item_name} is completed.`,
        notificationType: "restock_completed",
      }).catch((e) => console.error("restock notify failed:", e));
    }
    return ok({ id, status: status ?? req.status });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("updateRestockRequest failed:", err);
    return fail("Could not update the request", 500);
  } finally {
    client.release();
  }
}
