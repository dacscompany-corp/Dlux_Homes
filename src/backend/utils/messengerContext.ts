/**
 * Persistence for the Messenger bot's short-lived conversation memory.
 *
 * All the decision-making lives in src/lib/messenger-context.ts, which is pure
 * and unit-tested; this file only reads and writes the `messenger_context`
 * table. Keeping the split means the merge rules never need a database to test.
 *
 * Every function here swallows its errors and degrades to "no memory". A bot
 * that answers each message in isolation is the behaviour we had before this
 * table existed — worth far more than a webhook that 500s because one row could
 * not be written.
 */
import pool from "@/backend/config/db";
import {
  MESSENGER_CONTEXT_TTL_MINUTES,
  type Remembered,
} from "@/lib/messenger-context";

/** Postgres DATE comes back as a Date; the bot reasons in "YYYY-MM-DD". */
function toISODate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/**
 * What this guest was last asking about, or null if they have gone quiet longer
 * than the TTL. Expiry is enforced in SQL so a stale row can never be read.
 */
export async function loadContext(psid: string): Promise<Remembered | null> {
  try {
    const r = await pool.query(
      `SELECT from_date, to_date, pax, stay
         FROM messenger_context
        WHERE psid = $1
          AND updated_at > NOW() - ($2 || ' minutes')::INTERVAL
        LIMIT 1`,
      [psid, String(MESSENGER_CONTEXT_TTL_MINUTES)],
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    const out: Remembered = {};
    const from = toISODate(row.from_date);
    const to = toISODate(row.to_date);
    if (from) out.from = from;
    if (to) out.to = to;
    if (row.pax != null) out.pax = Number(row.pax);
    if (row.stay) out.stay = row.stay;
    return out;
  } catch (e) {
    console.error("[messenger] context load failed", e);
    return null;
  }
}

/**
 * Save what the guest is asking about, and disarm the follow-up.
 *
 * The guest has just spoken, so any pending nudge is moot — `quoted_at` is
 * cleared and `follow_up_sent` reset here, which is what gives them a fresh
 * nudge on their next quiet spell rather than one per lifetime.
 */
export async function saveContext(psid: string, ctx: Remembered | null): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO messenger_context (psid, from_date, to_date, pax, stay,
                                      quoted_at, follow_up_sent, updated_at)
            VALUES ($1, $2, $3, $4, $5, NULL, FALSE, NOW())
       ON CONFLICT (psid) DO UPDATE
            SET from_date = EXCLUDED.from_date,
                to_date = EXCLUDED.to_date,
                pax = EXCLUDED.pax,
                stay = EXCLUDED.stay,
                quoted_at = NULL,
                follow_up_sent = FALSE,
                updated_at = NOW()`,
      [psid, ctx?.from ?? null, ctx?.to ?? null, ctx?.pax ?? null, ctx?.stay ?? null],
    );
  } catch (e) {
    console.error("[messenger] context save failed", e);
  }
}

/**
 * Arm the follow-up: a real quote just went out and we are awaiting an answer.
 * Called after saveContext, which has already cleared the previous alarm.
 */
export async function armFollowUp(psid: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE messenger_context
          SET quoted_at = NOW(), follow_up_sent = FALSE
        WHERE psid = $1`,
      [psid],
    );
  } catch (e) {
    console.error("[messenger] follow-up arm failed", e);
  }
}

/**
 * Conversations quoted at least `minutes` ago that have had no reply since and
 * have not been nudged. `quoted_at` is NULLed on any inbound message, so a row
 * appearing here really has gone quiet.
 */
export async function dueForFollowUp(minutes: number): Promise<string[]> {
  const r = await pool.query(
    `SELECT psid
       FROM messenger_context
      WHERE quoted_at IS NOT NULL
        AND follow_up_sent = FALSE
        AND quoted_at < NOW() - ($1 || ' minutes')::INTERVAL
      ORDER BY quoted_at
      LIMIT 100`,
    [String(minutes)],
  );
  return r.rows.map((row) => String(row.psid));
}

/**
 * Stamp the nudge as sent. Guarded on `follow_up_sent = FALSE` so two overlapping
 * cron runs cannot both claim the same conversation; returns false when another
 * run got there first, and the caller then skips the send.
 *
 * `updated_at` is deliberately left alone: it measures time since the GUEST
 * last spoke, and the bot nudging itself is not the guest speaking. Refreshing
 * it here would keep a one-sided conversation warm past its TTL.
 */
export async function claimFollowUp(psid: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE messenger_context
        SET follow_up_sent = TRUE
      WHERE psid = $1 AND follow_up_sent = FALSE AND quoted_at IS NOT NULL`,
    [psid],
  );
  return (r.rowCount ?? 0) > 0;
}
