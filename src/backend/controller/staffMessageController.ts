// Staff messaging: one chat thread per cleaner, shared by the whole office.
//
// A cleaner sees a single "D'Lux Office" thread. Any Owner or CSR can open
// any cleaner's thread and reply, so a message never waits on one particular
// admin being online. Threads are ordinary `conversations` rows (type
// 'internal', participant_ids = [cleaner id]); office staff are deliberately
// NOT stored as participants, so a CSR account created later sees every thread
// too.
//
// Everything here takes identity from the session — sender id and name are
// never read from the request body — and read/unread is per side:
//   - the cleaner has read the thread when every OFFICE message is read;
//   - the office has read it when every CLEANER message is read.
// (The generic /api/messages/mark-read marks everything "not sent by me" read,
// which would let a CSR opening a thread clear the Owner's unread messages to
// the cleaner.)
//
// Timestamps: `messages.created_at` is TIMESTAMP WITHOUT TIME ZONE. These
// threads store it as UTC wall-clock and return it as a real instant, so the
// browser shows the right local time whatever timezone the server runs in.

import pool from "@/backend/config/db";
import { createNotificationForUser, createNotificationsForRoles } from "@/backend/utils/notificationHelper";

export type StaffViewer = { id: string; role: string; name: string };

export const OFFICE_ROLES = new Set(["Owner", "CSR"]);
const MAX_MESSAGE_LENGTH = 2000;
// A burst of messages shouldn't become a burst of notifications: notify the
// other side only when the thread has been quiet for this long.
const NOTIFY_QUIET_MS = 5 * 60 * 1000;

export type StaffThreadSummary = {
  /** Null when the office hasn't messaged this cleaner yet and they haven't written either. */
  conversation_id: string | null;
  cleaner_id: string;
  cleaner_name: string;
  cleaner_email: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_name: string | null;
  /** Messages the viewer's side hasn't read yet. */
  unread_count: number;
};

export type StaffMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  message_text: string;
  created_at: string;
  is_read: boolean;
  /** True when the sender is the office (Owner/CSR), false when it's the cleaner. */
  from_office: boolean;
};

export class StaffMessageError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isOffice = (viewer: StaffViewer) => OFFICE_ROLES.has(viewer.role);

function threadName(cleaner: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const n = `${cleaner.first_name ?? ""} ${cleaner.last_name ?? ""}`.trim();
  return `Office · ${n || cleaner.email || "Cleaner"}`;
}

/** The cleaner a thread belongs to, or null if it isn't a staff thread. */
async function threadCleaner(conversationId: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT e.id::text AS cleaner_id
     FROM conversations c
     JOIN employees e ON e.id = ANY(c.participant_ids) AND e.role = 'Cleaner'
     WHERE c.id = $1::uuid AND c.type = 'internal'
     LIMIT 1`,
    [conversationId],
  );
  return res.rows[0]?.cleaner_id ?? null;
}

/** Throws unless the viewer may read and write this thread. Returns the thread's cleaner. */
async function assertThreadAccess(viewer: StaffViewer, conversationId: string): Promise<string> {
  const cleanerId = await threadCleaner(conversationId).catch(() => null);
  if (!cleanerId) throw new StaffMessageError(404, "Conversation not found");
  if (!isOffice(viewer) && cleanerId !== viewer.id) {
    throw new StaffMessageError(403, "This conversation belongs to another cleaner.");
  }
  return cleanerId;
}

/**
 * The cleaner's thread with the office, created on first use. Serialized per
 * cleaner with an advisory lock, so two first messages sent at the same moment
 * still produce one thread.
 */
export async function ensureStaffThread(cleanerId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('staff-thread:' || $1::text))`, [cleanerId]);

    const cleaner = await client.query(
      `SELECT id, first_name, last_name, email FROM employees WHERE id = $1::uuid AND role = 'Cleaner'`,
      [cleanerId],
    );
    if (!cleaner.rows[0]) throw new StaffMessageError(404, "Cleaner not found");

    const existing = await client.query(
      `SELECT id::text AS id FROM conversations
       WHERE type = 'internal' AND $1::uuid = ANY(participant_ids)
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [cleanerId],
    );
    let id: string;
    if (existing.rows[0]) {
      id = existing.rows[0].id;
    } else {
      const created = await client.query(
        `INSERT INTO conversations (name, type, participant_ids, created_at, updated_at)
         VALUES ($1, 'internal', ARRAY[$2::uuid], NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
         RETURNING id::text AS id`,
        [threadName(cleaner.rows[0]), cleanerId],
      );
      id = created.rows[0].id;
    }
    await client.query("COMMIT");
    return id;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cleaner: their single office thread (created if it doesn't exist yet).
 * Owner/CSR: one row per active cleaner, with or without a thread yet, most
 * recent conversation first — so the office can start a chat with anyone.
 */
export async function listStaffThreads(viewer: StaffViewer): Promise<StaffThreadSummary[]> {
  const office = isOffice(viewer);
  if (!office) await ensureStaffThread(viewer.id);

  // "Unread for me": office counts cleaner messages; a cleaner counts office messages.
  const res = await pool.query(
    `
    SELECT
      e.id::text AS cleaner_id,
      NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), '') AS cleaner_name,
      e.email AS cleaner_email,
      t.id::text AS conversation_id,
      last_msg.message_text AS last_message,
      (last_msg.created_at AT TIME ZONE 'UTC') AS last_message_at,
      last_msg.sender_name AS last_sender_name,
      COALESCE((
        SELECT COUNT(*)::int FROM messages m
        WHERE m.conversation_id = t.id AND m.is_read = false
          AND CASE WHEN $2::boolean THEN m.sender_id = e.id ELSE m.sender_id <> e.id END
      ), 0) AS unread_count
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT c.id FROM conversations c
      WHERE c.type = 'internal' AND e.id = ANY(c.participant_ids)
      ORDER BY c.updated_at DESC NULLS LAST
      LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT m.message_text, m.created_at, m.sender_name FROM messages m
      WHERE m.conversation_id = t.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_msg ON true
    WHERE e.role = 'Cleaner'
      AND ($2::boolean OR e.id = $1::uuid)
      AND ($2::boolean = false OR COALESCE(e.status, 'active') = 'active' OR t.id IS NOT NULL)
    ORDER BY last_msg.created_at DESC NULLS LAST, cleaner_name ASC NULLS LAST
    `,
    [viewer.id, office],
  );

  return res.rows.map((r) => ({
    conversation_id: r.conversation_id ?? null,
    cleaner_id: r.cleaner_id,
    cleaner_name: r.cleaner_name ?? r.cleaner_email ?? "Cleaner",
    cleaner_email: r.cleaner_email ?? null,
    last_message: r.last_message ?? null,
    last_message_at: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    last_sender_name: r.last_sender_name ?? null,
    unread_count: Number(r.unread_count ?? 0),
  }));
}

/**
 * Messages in a staff thread, oldest first. Opening the thread counts as
 * reading it, for the viewer's side only.
 */
export async function getStaffThreadMessages(viewer: StaffViewer, conversationId: string): Promise<StaffMessage[]> {
  const cleanerId = await assertThreadAccess(viewer, conversationId);

  await pool.query(
    `UPDATE messages SET is_read = true
     WHERE conversation_id = $1::uuid AND is_read = false
       AND CASE WHEN $3::boolean THEN sender_id = $2::uuid ELSE sender_id <> $2::uuid END`,
    [conversationId, cleanerId, isOffice(viewer)],
  );

  const res = await pool.query(
    `SELECT m.id::text AS id, m.conversation_id::text AS conversation_id, m.sender_id::text AS sender_id,
            m.sender_name, m.message_text, (m.created_at AT TIME ZONE 'UTC') AS created_at, m.is_read
     FROM messages m
     WHERE m.conversation_id = $1::uuid
     ORDER BY m.created_at ASC`,
    [conversationId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    conversation_id: r.conversation_id,
    sender_id: r.sender_id,
    sender_name: r.sender_name,
    message_text: r.message_text ?? "",
    created_at: new Date(r.created_at).toISOString(),
    is_read: Boolean(r.is_read),
    from_office: r.sender_id !== cleanerId,
  }));
}

/**
 * Sends a message as the signed-in staff member. The office can address a
 * cleaner who has no thread yet by `cleanerId`; the thread is created then.
 * The other side gets a notification unless the thread was already active in
 * the last few minutes.
 */
export async function sendStaffMessage(
  viewer: StaffViewer,
  target: { conversationId?: string | null; cleanerId?: string | null },
  rawText: unknown,
): Promise<StaffMessage> {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) throw new StaffMessageError(400, "Write a message first.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new StaffMessageError(400, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  let conversationId = target.conversationId ?? null;
  if (!conversationId) {
    // A cleaner always writes to their own thread; the office names a cleaner.
    const cleanerId = isOffice(viewer) ? target.cleanerId : viewer.id;
    if (!cleanerId) throw new StaffMessageError(400, "Choose a cleaner to message.");
    conversationId = await ensureStaffThread(cleanerId);
  }
  const cleanerId = await assertThreadAccess(viewer, conversationId);

  const previous = await pool.query(
    `SELECT (MAX(created_at) AT TIME ZONE 'UTC') AS at FROM messages WHERE conversation_id = $1::uuid`,
    [conversationId],
  );
  const lastAt = previous.rows[0]?.at ? new Date(previous.rows[0].at).getTime() : 0;

  const inserted = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, sender_name, message_text, is_read, created_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, false, NOW() AT TIME ZONE 'UTC')
     RETURNING id::text AS id, conversation_id::text AS conversation_id, sender_id::text AS sender_id,
               sender_name, message_text, (created_at AT TIME ZONE 'UTC') AS created_at, is_read`,
    [conversationId, viewer.id, viewer.name, text],
  );
  await pool.query(
    `UPDATE conversations SET updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1::uuid`,
    [conversationId],
  );

  if (Date.now() - lastAt > NOTIFY_QUIET_MS) {
    const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    const notify = isOffice(viewer)
      ? createNotificationForUser(cleanerId, {
          title: "New message from the office",
          message: `${viewer.name}: ${preview}`,
          notificationType: "staff_message",
        })
      : createNotificationsForRoles(["Owner", "CSR"], {
          title: `Message from ${viewer.name}`,
          message: preview,
          notificationType: "staff_message",
        });
    await notify.catch((err: unknown) => console.error("⚠️ Staff message notification failed:", err));
  }

  const r = inserted.rows[0];
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    sender_id: r.sender_id,
    sender_name: r.sender_name,
    message_text: r.message_text,
    created_at: new Date(r.created_at).toISOString(),
    is_read: false,
    from_office: r.sender_id !== cleanerId,
  };
}

/** The signed-in employee's display name, from the employees table. */
export async function staffDisplayName(employeeId: string, fallback: string): Promise<string> {
  try {
    const res = await pool.query(
      `SELECT first_name, last_name, role FROM employees WHERE id = $1::uuid`,
      [employeeId],
    );
    const row = res.rows[0];
    const name = `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}
