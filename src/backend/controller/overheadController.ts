import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "../config/db";
import { logAudit } from "../utils/auditLog";
import { materializeExpense, horizonDate } from "./overheadPeriodsController";

export async function getCategories(): Promise<NextResponse> {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.active,
              COUNT(e.id)::int AS expense_count
         FROM overhead_categories c
         LEFT JOIN overhead_expenses e ON e.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`,
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[overhead] getCategories failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load categories" },
      { status: 500 },
    );
  }
}

export async function createCategory(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Category name is required" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `INSERT INTO overhead_categories (name, sort_order)
       VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM overhead_categories), 1))
       ON CONFLICT (name) DO NOTHING
       RETURNING id, name, sort_order, active`,
      [name],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: `A category named "${name}" already exists.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[overhead] createCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to create category" },
      { status: 500 },
    );
  }
}

export async function updateCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = body.name === undefined ? null : String(body.name).trim();
    const active = body.active === undefined ? null : Boolean(body.active);

    if (name !== null && !name) {
      return NextResponse.json(
        { success: false, message: "Category name cannot be empty" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `UPDATE overhead_categories
          SET name = COALESCE($2, name),
              active = COALESCE($3, active),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, sort_order, active`,
      [id, name, active],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[overhead] updateCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update category" },
      { status: 500 },
    );
  }
}

export async function deleteCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const inUse = await pool.query(
      `SELECT COUNT(*)::int AS n FROM overhead_expenses WHERE category_id = $1`,
      [id],
    );
    if (inUse.rows[0].n > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `This category is used by ${inUse.rows[0].n} expense(s). ` +
                   `Deactivate it instead, or move those expenses first.`,
        },
        { status: 409 },
      );
    }

    const result = await pool.query(
      `DELETE FROM overhead_categories WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[overhead] deleteCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete category" },
      { status: 500 },
    );
  }
}

const FREQUENCIES = new Set([
  "one-time", "daily", "weekly", "monthly",
  "quarterly", "semiannual", "annual", "custom",
]);

interface ExpenseInput {
  name: string;
  category_id: string;
  description: string | null;
  amount: number;
  frequency: string;
  interval_count: number | null;
  interval_unit: string | null;
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  notes: string | null;
}

/** Returns an error message, or null when the body is valid. */
function validateExpense(body: Record<string, unknown>): string | null {
  const name = String(body.name || "").trim();
  if (!name) return "Expense name is required.";
  if (!body.category_id) return "Please choose a category.";

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Amount must be greater than zero.";
  }

  const frequency = String(body.frequency || "");
  if (!FREQUENCIES.has(frequency)) return "Please choose how often this repeats.";

  if (frequency === "custom") {
    const n = Number(body.interval_count);
    if (!Number.isInteger(n) || n <= 0) {
      return "A custom schedule needs a repeat interval greater than zero.";
    }
    if (!["day", "week", "month"].includes(String(body.interval_unit))) {
      return "A custom schedule needs a repeat unit of day, week or month.";
    }
  }

  const start = String(body.start_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Start date is required.";

  const end = body.end_date ? String(body.end_date) : null;
  if (end && end < start) return "End date cannot be before the start date.";

  if (body.due_day !== undefined && body.due_day !== null) {
    const d = Number(body.due_day);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return "Payment due day must be between 1 and 31.";
    }
  }

  return null;
}

function readInput(body: Record<string, unknown>): ExpenseInput {
  return {
    name: String(body.name).trim(),
    category_id: String(body.category_id),
    description: body.description ? String(body.description) : null,
    amount: Number(body.amount),
    frequency: String(body.frequency),
    interval_count: body.interval_count == null ? null : Number(body.interval_count),
    interval_unit: body.interval_unit ? String(body.interval_unit) : null,
    start_date: String(body.start_date),
    end_date: body.end_date ? String(body.end_date) : null,
    due_day: body.due_day == null ? null : Number(body.due_day),
    notes: body.notes ? String(body.notes) : null,
  };
}

async function employeeIdFor(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM employees WHERE email = $1 LIMIT 1`, [email],
  );
  return r.rows[0]?.id ?? null;
}

export async function createExpense(
  req: NextRequest,
  actorEmail: string,
): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const body = await req.json();
    const error = validateExpense(body);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    const input = readInput(body);

    // Duplicate WARNING, not a block — the module doc asks for a warning.
    if (!body.confirm_duplicate) {
      const dupe = await client.query(
        `SELECT 1 FROM overhead_expenses
          WHERE LOWER(name) = LOWER($1) AND category_id = $2 LIMIT 1`,
        [input.name, input.category_id],
      );
      if (dupe.rows.length) {
        return NextResponse.json(
          {
            success: false,
            duplicate: true,
            message: `An expense named "${input.name}" already exists in this category. ` +
                     `Save it anyway?`,
          },
          { status: 409 },
        );
      }
    }

    const actorId = await employeeIdFor(actorEmail);

    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO overhead_expenses
         (name, category_id, description, amount, frequency, interval_count,
          interval_unit, start_date, end_date, due_day, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [input.name, input.category_id, input.description, input.amount,
       input.frequency, input.interval_count, input.interval_unit,
       input.start_date, input.end_date, input.due_day, input.notes, actorId],
    );
    const id = result.rows[0].id;

    await materializeExpense(client, id, horizonDate());

    await logAudit({
      action: "overhead_expense.created",
      entity_type: "overhead_expense",
      entity_id: id,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: { after: input },
    }, client);

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] createExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/** GET /api/admin/overhead/expenses?active=&category=&q= */
export async function getExpenses(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active");
    const category = searchParams.get("category");
    const q = searchParams.get("q");

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (active === "true")  conditions.push(`e.active`);
    if (active === "false") conditions.push(`NOT e.active`);
    if (category) {
      values.push(category);
      conditions.push(`e.category_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      conditions.push(`e.name ILIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT e.id, e.name, e.description, e.amount, e.frequency,
              e.interval_count, e.interval_unit, e.start_date, e.end_date,
              e.due_day, e.active, e.notes, e.category_id,
              c.name AS category_name,
              (SELECT MIN(p.due_date)
                 FROM overhead_expense_periods p
                WHERE p.expense_id = e.id
                  AND p.status = 'scheduled'
                  AND p.due_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date
              ) AS next_due_date
         FROM overhead_expenses e
         JOIN overhead_categories c ON c.id = e.category_id
         ${where}
        ORDER BY e.active DESC, c.sort_order, e.name`,
      values,
    );

    return NextResponse.json({
      success: true, data: result.rows, count: result.rows.length,
    });
  } catch (err) {
    console.error("[overhead] getExpenses failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load expenses" },
      { status: 500 },
    );
  }
}

/** GET /api/admin/overhead/expenses/[id] — definition, periods and rate history. */
export async function getExpense(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const expense = await pool.query(
      `SELECT e.*, c.name AS category_name
         FROM overhead_expenses e
         JOIN overhead_categories c ON c.id = e.category_id
        WHERE e.id = $1`,
      [id],
    );
    if (!expense.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }

    const periods = await pool.query(
      `SELECT p.id, p.period_start, p.period_end, p.due_date, p.amount_due,
              p.status, p.accrual_month,
              COALESCE((SELECT SUM(amount) FROM overhead_expense_payments
                         WHERE period_id = p.id), 0)::numeric AS amount_paid
         FROM overhead_expense_periods p
        WHERE p.expense_id = $1
        ORDER BY p.period_start DESC`,
      [id],
    );

    // Rate history lives in audit_logs — the period snapshots already record
    // what each month cost, so a separate history table would duplicate them.
    const history = await pool.query(
      `SELECT action, metadata, actor_email, created_at
         FROM audit_logs
        WHERE entity_type = 'overhead_expense' AND entity_id = $1
        ORDER BY created_at DESC`,
      [id],
    );

    return NextResponse.json({
      success: true,
      data: {
        expense: expense.rows[0],
        periods: periods.rows,
        history: history.rows,
      },
    });
  } catch (err) {
    console.error("[overhead] getExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the expense" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/overhead/expenses/[id]
 *
 * An amount change is effective-dated: periods from `effective_from` forward
 * that have NO payments take the new amount; everything earlier, and anything
 * paid, is left exactly as it was. That is what keeps history honest when a
 * rate rises mid-year.
 *
 * A schedule change (start date, frequency, interval) drops future unpaid,
 * payment-free periods and re-materialises. Paid periods survive even if they
 * no longer fit the new schedule — they record what actually happened.
 */
export async function updateExpense(
  req: NextRequest,
  id: string,
  actorEmail: string,
): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const body = await req.json();
    const error = validateExpense(body);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    const input = readInput(body);

    const existing = await client.query(
      `SELECT * FROM overhead_expenses WHERE id = $1`, [id],
    );
    if (!existing.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }
    const before = existing.rows[0];

    const amountChanged = Number(before.amount) !== input.amount;
    const scheduleChanged =
      String(before.start_date).slice(0, 10) !== input.start_date ||
      before.frequency !== input.frequency ||
      Number(before.interval_count ?? 0) !== Number(input.interval_count ?? 0) ||
      (before.interval_unit ?? null) !== input.interval_unit ||
      Number(before.due_day ?? 0) !== Number(input.due_day ?? 0);

    // Default: the next unpaid period. Matches what the edit dialog pre-fills.
    const effectiveFrom = body.effective_from
      ? String(body.effective_from)
      : String(before.start_date).slice(0, 10);

    const actorId = await employeeIdFor(actorEmail);

    await client.query("BEGIN");

    await client.query(
      `UPDATE overhead_expenses
          SET name = $2, category_id = $3, description = $4, amount = $5,
              frequency = $6, interval_count = $7, interval_unit = $8,
              start_date = $9, end_date = $10, due_day = $11, notes = $12,
              active = COALESCE($13, active), updated_at = NOW()
        WHERE id = $1`,
      [id, input.name, input.category_id, input.description, input.amount,
       input.frequency, input.interval_count, input.interval_unit,
       input.start_date, input.end_date, input.due_day, input.notes,
       body.active === undefined ? null : Boolean(body.active)],
    );

    if (amountChanged) {
      await client.query(
        `UPDATE overhead_expense_periods p
            SET amount_due = $3, updated_at = NOW()
          WHERE p.expense_id = $1
            AND p.period_start >= $2::date
            AND p.status <> 'paid'
            AND NOT EXISTS (
              SELECT 1 FROM overhead_expense_payments
               WHERE period_id = p.id
            )`,
        [id, effectiveFrom, input.amount],
      );

      await logAudit({
        action: "overhead_expense.amount_changed",
        entity_type: "overhead_expense",
        entity_id: id,
        actor_type: "admin",
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: {
          before: Number(before.amount),
          after: input.amount,
          effective_from: effectiveFrom,
          reason: body.change_reason ? String(body.change_reason) : null,
        },
      }, client);
    }

    if (scheduleChanged) {
      await client.query(
        `DELETE FROM overhead_expense_periods p
          WHERE p.expense_id = $1
            AND p.status = 'scheduled'
            AND p.period_start >= (NOW() AT TIME ZONE 'Asia/Manila')::date
            AND NOT EXISTS (
              SELECT 1 FROM overhead_expense_payments WHERE period_id = p.id
            )`,
        [id],
      );
      await client.query(
        `UPDATE overhead_expenses
            SET generated_through = (
              SELECT MAX(period_start) FROM overhead_expense_periods
               WHERE expense_id = $1
            )
          WHERE id = $1`,
        [id],
      );
      await materializeExpense(client, id, horizonDate());

      await logAudit({
        action: "overhead_expense.schedule_changed",
        entity_type: "overhead_expense",
        entity_id: id,
        actor_type: "admin",
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: {
          before: {
            frequency: before.frequency,
            start_date: String(before.start_date).slice(0, 10),
            due_day: before.due_day,
          },
          after: {
            frequency: input.frequency,
            start_date: input.start_date,
            due_day: input.due_day,
          },
        },
      }, client);
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] updateExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/** DELETE — refused once any payment exists anywhere on this expense. */
export async function deleteExpense(req: NextRequest, id: string): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const paid = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM overhead_expense_payments pay
         JOIN overhead_expense_periods p ON p.id = pay.period_id
        WHERE p.expense_id = $1`,
      [id],
    );
    if (paid.rows[0].n > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `This expense has ${paid.rows[0].n} recorded payment(s). ` +
                   `Deleting it would erase that history — end or pause it instead.`,
        },
        { status: 409 },
      );
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
    const result = await client.query(
      `DELETE FROM overhead_expenses WHERE id = $1 RETURNING id`, [id],
    );
    await client.query("COMMIT");

    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] deleteExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
