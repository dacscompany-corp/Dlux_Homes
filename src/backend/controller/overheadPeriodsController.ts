import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "../config/db";
import {
  occurrencesBetween,
  accrualMonthOf,
  DUE_SOON_DAYS,
  type ScheduleDef,
} from "@/lib/overheadSchedule";

// Manila, not UTC: between 00:00 and 08:00 Manila the server's UTC date is
// still yesterday, which would misreport due and overdue at the boundary.
const TODAY_SQL = `(NOW() AT TIME ZONE 'Asia/Manila')::date`;

/** Last day of next month — how far ahead occurrences are materialised. */
export function horizonDate(): string {
  const now = new Date();
  // Day 0 of month+2 is the last day of month+1.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return end.toISOString().slice(0, 10);
}

interface ExpenseRow {
  id: string;
  amount: string;
  frequency: ScheduleDef["frequency"];
  interval_count: number | null;
  interval_unit: ScheduleDef["interval_unit"];
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  generated_through: string | null;
}

function toDef(row: ExpenseRow): ScheduleDef {
  return {
    frequency: row.frequency,
    start_date: String(row.start_date).slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    due_day: row.due_day,
    interval_count: row.interval_count,
    interval_unit: row.interval_unit,
  };
}

/**
 * Creates any missing periods for one expense up to `horizon`.
 *
 * Idempotent by construction: the UNIQUE (expense_id, period_start) constraint
 * turns a concurrent duplicate into a no-op via ON CONFLICT DO NOTHING, so two
 * simultaneous dashboard loads cannot double-generate. The row lock only avoids
 * the wasted work.
 *
 * Enumeration resumes STRICTLY AFTER generated_through. Re-generating the
 * boundary period would be absorbed by the constraint, but that would make the
 * watermark meaningless and hide an off-by-one in the schedule functions.
 */
export async function materializeExpense(
  client: PoolClient,
  expenseId: string,
  horizon: string,
): Promise<number> {
  const { rows } = await client.query<ExpenseRow>(
    `SELECT id, amount, frequency, interval_count, interval_unit,
            start_date, end_date, due_day, generated_through
       FROM overhead_expenses
      WHERE id = $1
      FOR UPDATE`,
    [expenseId],
  );
  const row = rows[0];
  if (!row) return 0;

  const def = toDef(row);
  const watermark = row.generated_through
    ? String(row.generated_through).slice(0, 10)
    : null;
  // Strictly after the watermark; from the definition's start when there is none.
  const from = watermark
    ? new Date(Date.UTC(
        Number(watermark.slice(0, 4)),
        Number(watermark.slice(5, 7)) - 1,
        Number(watermark.slice(8, 10)) + 1,
      )).toISOString().slice(0, 10)
    : def.start_date;

  if (from > horizon) return 0;

  const occurrences = occurrencesBetween(def, from, horizon);
  if (!occurrences.length) return 0;

  let inserted = 0;
  for (const o of occurrences) {
    const res = await client.query(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (expense_id, period_start) DO NOTHING`,
      [expenseId, o.period_start, o.period_end, o.due_date,
       row.amount, accrualMonthOf(o.period_start)],
    );
    inserted += res.rowCount ?? 0;
  }

  await client.query(
    `UPDATE overhead_expenses
        SET generated_through = $2, updated_at = NOW()
      WHERE id = $1`,
    [expenseId, occurrences[occurrences.length - 1].period_start],
  );

  return inserted;
}

/**
 * Brings every active expense up to the horizon. Called at the top of each
 * overhead read. No-ops on every request but the first of each month.
 *
 * Each expense gets its own transaction: occurrencesBetween can throw for a
 * genuinely malformed schedule definition (exhausted iteration guard), and
 * that must roll back only that expense's work, not abort the whole pass —
 * one bad definition should not block every other expense's periods from
 * materialising.
 */
export async function ensureMaterialized(horizon = horizonDate()): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM overhead_expenses
      WHERE active
        AND (generated_through IS NULL OR generated_through < $1)`,
    [horizon],
  );
  if (!rows.length) return;

  const client = await pool.connect();
  try {
    for (const r of rows) {
      await client.query("BEGIN");
      try {
        await materializeExpense(client, r.id, horizon);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[overhead] materialise failed for", r.id, err);
      }
    }
  } finally {
    client.release();
  }
}

// SELECT fragment shared by period reads. display_status is derived here rather
// than stored — 'due' and 'overdue' would otherwise need a nightly job to flip,
// and this deploy has no working cron.
const PERIOD_SELECT = `
  SELECT p.id, p.expense_id, p.period_start, p.period_end, p.due_date,
         p.amount_due, p.status, p.accrual_month,
         e.name AS expense_name,
         c.name AS category_name,
         COALESCE(pay.total, 0)::numeric AS amount_paid,
         CASE
           WHEN p.status = 'paid'      THEN 'paid'
           WHEN p.status = 'cancelled' THEN 'cancelled'
           WHEN p.due_date < ${TODAY_SQL} THEN 'overdue'
           WHEN p.due_date <= ${TODAY_SQL} + ${DUE_SOON_DAYS} THEN 'due'
           ELSE 'scheduled'
         END AS display_status
    FROM overhead_expense_periods p
    JOIN overhead_expenses e   ON e.id = p.expense_id
    JOIN overhead_categories c ON c.id = e.category_id
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS total
        FROM overhead_expense_payments
       WHERE period_id = p.id
    ) pay ON TRUE
`;

/** GET /api/admin/overhead/periods?month=YYYY-MM&status=due|overdue|paid|unpaid */
export async function getPeriods(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMaterialized();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const status = searchParams.get("status");

    const conditions: string[] = [];
    const values: string[] = [];

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { success: false, message: "month must be YYYY-MM" },
          { status: 400 },
        );
      }
      values.push(`${month}-01`);
      conditions.push(`p.accrual_month = $${values.length}::date`);
    }

    if (status === "paid")   conditions.push(`p.status = 'paid'`);
    if (status === "unpaid") conditions.push(`p.status = 'scheduled'`);
    if (status === "overdue") {
      conditions.push(`p.status = 'scheduled' AND p.due_date < ${TODAY_SQL}`);
    }
    if (status === "due") {
      conditions.push(
        `p.status = 'scheduled' AND p.due_date >= ${TODAY_SQL} ` +
        `AND p.due_date <= ${TODAY_SQL} + ${DUE_SOON_DAYS}`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `${PERIOD_SELECT} ${where} ORDER BY p.due_date ASC`,
      values,
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[overhead] getPeriods failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load overhead periods" },
      { status: 500 },
    );
  }
}

/** PATCH /api/admin/overhead/periods/[id] — cancel one occurrence. */
export async function cancelPeriod(
  req: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    // Payment check and cancelling UPDATE folded into one statement so no
    // window exists between them — a payment recorded between a separate
    // check and update could otherwise let a paid-for period get cancelled
    // anyway, violating the "never destroy financial history" invariant.
    const result = await pool.query(
      `UPDATE overhead_expense_periods p
          SET status = 'cancelled', updated_at = NOW()
        WHERE p.id = $1
          AND p.status <> 'paid'
          AND NOT EXISTS (
            SELECT 1 FROM overhead_expense_payments WHERE period_id = p.id
          )
        RETURNING p.id`,
      [id],
    );
    if (result.rows.length) {
      return NextResponse.json({ success: true, data: { id } });
    }

    // Zero rows can mean: doesn't exist, already paid, or has payments
    // attached. By now no cancellation has happened either way, so a stale
    // read here can only affect which error message comes back, never the
    // data — the race that matters is already closed.
    const existing = await pool.query(
      `SELECT 1 FROM overhead_expense_periods WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!existing.rows.length) {
      return NextResponse.json(
        { success: false, message: "Period not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: false, message: "This period has payments recorded and cannot be cancelled." },
      { status: 409 },
    );
  } catch (err) {
    console.error("[overhead] cancelPeriod failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to cancel period" },
      { status: 500 },
    );
  }
}
