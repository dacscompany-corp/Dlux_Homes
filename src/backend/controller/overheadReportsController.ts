import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { ensureMaterialized } from "./overheadPeriodsController";
import {
  occurrencesBetween,
  monthlyEquivalent,
  type ScheduleDef,
} from "@/lib/overheadSchedule";

const TODAY_SQL = `(NOW() AT TIME ZONE 'Asia/Manila')::date`;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  // Manila is UTC+8 and never negative, so shifting forward is enough to land
  // on the right calendar month at the boundary.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return monthKey(now);
}

function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Accrued total for one month: what was DUE for it, paid or not. */
async function accruedFor(month: string): Promise<number> {
  const r = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_due), 0)::numeric AS total
       FROM overhead_expense_periods
      WHERE accrual_month = $1::date AND status <> 'cancelled'`,
    [`${month}-01`],
  );
  return Number(r.rows[0].total);
}

interface DefRow {
  amount: string;
  frequency: ScheduleDef["frequency"];
  interval_count: number | null;
  interval_unit: ScheduleDef["interval_unit"];
  start_date: string;
  end_date: string | null;
  due_day: number | null;
}

function toDef(row: DefRow): ScheduleDef {
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
 * Estimated annual overhead, computed from the real schedules rather than
 * monthly x 12 — a 6,000 annual subscription must count once, not twelve times.
 * No periods are materialised for this; it is arithmetic over the definitions.
 */
async function estimatedAnnual(): Promise<{ annual: number; normalizedMonthly: number }> {
  const { rows } = await pool.query<DefRow>(
    `SELECT amount, frequency, interval_count, interval_unit,
            start_date, end_date, due_day
       FROM overhead_expenses
      WHERE active`,
  );

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  // The window must span twelve months, not twelve months plus a day.
  // `occurrencesBetween`'s `through` is INCLUSIVE, so running to the same date
  // next year counts the anniversary as a thirteenth occurrence: a ₱25,000
  // monthly bill read as ₱325,000 a year instead of ₱300,000. End the day
  // before. A 29 February start normalises to 28 February in a common year,
  // which is the right answer for a yearly window.
  const [ty, tm, td] = today.split("-").map(Number);
  const end = new Date(Date.UTC(ty + 1, tm - 1, td));
  end.setUTCDate(end.getUTCDate() - 1);
  const throughDate = end.toISOString().slice(0, 10);

  let annual = 0;
  let normalizedMonthly = 0;

  for (const row of rows) {
    const def = toDef(row);
    const amount = Number(row.amount);
    annual += occurrencesBetween(def, today, throughDate).length * amount;
    normalizedMonthly += monthlyEquivalent(def, amount);
  }

  return {
    annual: Math.round(annual * 100) / 100,
    normalizedMonthly: Math.round(normalizedMonthly * 100) / 100,
  };
}

/** GET /api/admin/overhead/dashboard?month=YYYY-MM */
export async function getDashboard(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMaterialized();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || currentMonthKey();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, message: "month must be YYYY-MM" },
        { status: 400 },
      );
    }

    const year = month.slice(0, 4);

    const [accrued, previous, ytd, cash, byCategory, estimate] = await Promise.all([
      accruedFor(month),
      accruedFor(shiftMonth(month, -1)),
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount_due), 0)::numeric AS total
           FROM overhead_expense_periods
          WHERE status <> 'cancelled'
            AND accrual_month >= $1::date
            AND accrual_month <= $2::date`,
        [`${year}-01-01`, `${year}-12-01`],
      ),
      // Cash layer for the month: settled, still owed, and of that, overdue.
      pool.query<{ paid: string; unpaid: string; overdue: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_due END), 0)::numeric AS paid,
           COALESCE(SUM(CASE WHEN p.status = 'scheduled' THEN p.amount_due END), 0)::numeric AS unpaid,
           COALESCE(SUM(CASE WHEN p.status = 'scheduled'
                              AND p.due_date < ${TODAY_SQL}
                         THEN p.amount_due END), 0)::numeric AS overdue
         FROM overhead_expense_periods p
        WHERE p.accrual_month = $1::date AND p.status <> 'cancelled'`,
        [`${month}-01`],
      ),
      pool.query<{ name: string; amount: string }>(
        `SELECT c.name, COALESCE(SUM(p.amount_due), 0)::numeric AS amount
           FROM overhead_expense_periods p
           JOIN overhead_expenses e   ON e.id = p.expense_id
           JOIN overhead_categories c ON c.id = e.category_id
          WHERE p.accrual_month = $1::date AND p.status <> 'cancelled'
          GROUP BY c.name, c.sort_order
          HAVING SUM(p.amount_due) > 0
          ORDER BY amount DESC`,
        [`${month}-01`],
      ),
      estimatedAnnual(),
    ]);

    // Trend: twelve months ending at the selected one. `accrued` is the
    // point-in-time truth (a quarterly bill spikes in its own month) and
    // `normalized` is the smoothed line the eye should follow.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) months.push(shiftMonth(month, -i));

    const trendRows = await pool.query<{ m: string; total: string }>(
      `SELECT to_char(accrual_month, 'YYYY-MM') AS m,
              COALESCE(SUM(amount_due), 0)::numeric AS total
         FROM overhead_expense_periods
        WHERE status <> 'cancelled'
          AND accrual_month >= $1::date
          AND accrual_month <= $2::date
        GROUP BY accrual_month
        ORDER BY accrual_month`,
      [`${months[0]}-01`, `${month}-01`],
    );
    const byMonth = new Map(trendRows.rows.map((r) => [r.m, Number(r.total)]));

    return NextResponse.json({
      success: true,
      data: {
        month,
        accrued_total: accrued,
        previous_month_total: previous,
        ytd_total: Number(ytd.rows[0].total),
        estimated_annual: estimate.annual,
        paid: Number(cash.rows[0].paid),
        unpaid: Number(cash.rows[0].unpaid),
        overdue: Number(cash.rows[0].overdue),
        by_category: byCategory.rows.map((r) => ({
          name: r.name, amount: Number(r.amount),
        })),
        trend: months.map((m) => ({
          month: m,
          accrued: byMonth.get(m) ?? 0,
          normalized: estimate.normalizedMonthly,
        })),
      },
    });
  } catch (err) {
    console.error("[overhead] getDashboard failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the overhead dashboard" },
      { status: 500 },
    );
  }
}
