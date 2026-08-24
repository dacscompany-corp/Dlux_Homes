import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { logAudit } from "../utils/auditLog";
import { accrualMonthOf } from "@/lib/overheadSchedule";
import { validateSpend, manilaToday } from "@/lib/overheadSpend";

/**
 * POST /api/admin/overhead/spend — record a cost that already happened.
 *
 * Written as a one-time expense + its single period + a payment covering it,
 * all in one transaction. Storing it this way means every existing aggregate
 * (dashboard totals, category breakdown, both profitability bases) picks it up
 * with no changes: they all read overhead_expense_periods.
 *
 * `active: false` is literally true — there is nothing further to generate —
 * and it keeps the row out of ensureMaterialized's scan and out of
 * estimatedAnnual, so a one-off purchase cannot inflate the annual estimate.
 */
export async function createSpend(
  req: NextRequest,
  actorEmail: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const check = validateSpend(await req.json(), manilaToday());
    if (!check.ok) {
      return NextResponse.json({ success: false, message: check.message }, { status: 400 });
    }
    const v = check.value;

    // Resolve the category explicitly so a bad id reads as a message, not as a
    // raw foreign-key violation.
    const cat = await pool.query(
      `SELECT id FROM overhead_categories WHERE id = $1 AND active`,
      [v.category_id],
    );
    if (!cat.rows.length) {
      return NextResponse.json(
        { success: false, message: "That category no longer exists — pick another." },
        { status: 400 },
      );
    }

    const actor = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
      [actorEmail],
    );
    const actorId = actor.rows[0]?.id ?? null;

    await client.query("BEGIN");

    // $4 is spent_on, used for both start_date and generated_through.
    const expense = await client.query<{ id: string }>(
      `INSERT INTO overhead_expenses
         (name, category_id, amount, frequency, start_date, active,
          notes, generated_through, created_by)
       VALUES ($1, $2, $3, 'one-time', $4, FALSE, $5, $4, $6)
       RETURNING id`,
      [v.name, v.category_id, v.amount, v.spent_on, v.notes, actorId],
    );
    const expenseId = expense.rows[0].id;

    const period = await client.query<{ id: string }>(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due,
          status, accrual_month)
       VALUES ($1, $2, $2, $2, $3, 'paid', $4)
       RETURNING id`,
      [expenseId, v.spent_on, v.amount, accrualMonthOf(v.spent_on)],
    );

    await client.query(
      `INSERT INTO overhead_expense_payments
         (period_id, paid_on, amount, method, reference, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [period.rows[0].id, v.spent_on, v.amount, v.method, v.reference, v.notes, actorId],
    );

    await logAudit({
      action: "overhead_spend.created",
      entity_type: "overhead_expense",
      entity_id: expenseId,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: { name: v.name, amount: v.amount, spent_on: v.spent_on },
    }, client);

    await client.query("COMMIT");

    return NextResponse.json({ success: true, data: { id: expenseId } }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] createSpend failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to record the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/admin/overhead/spend/[id] — remove a one-off entry.
 *
 * A deliberate, narrow exception to the module's rule that payment history is
 * never destroyed: a spend entry is born with a payment attached, so without
 * this a mistyped amount would be permanent. The frequency check is what keeps
 * the exception narrow — deleteExpense on the normal route still refuses with
 * 409 when a recurring bill has payments. The audit row survives the deletion.
 */
export async function deleteSpend(
  req: NextRequest,
  id: string,
  actorEmail: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const found = await client.query<{
      frequency: string; name: string; amount: string; start_date: string; active: boolean;
    }>(
      `SELECT frequency, name, amount, start_date, active FROM overhead_expenses WHERE id = $1`,
      [id],
    );
    if (!found.rows.length) {
      return NextResponse.json({ success: false, message: "Expense not found" }, { status: 404 });
    }
    const row = found.rows[0];
    if (row.frequency !== "one-time" || row.active) {
      return NextResponse.json(
        {
          success: false,
          message: "Only one-off entries can be deleted here. " +
                   "Pause or end a recurring expense instead.",
        },
        { status: 400 },
      );
    }

    const actor = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
      [actorEmail],
    );
    const actorId = actor.rows[0]?.id ?? null;

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM overhead_expense_payments
        WHERE period_id IN (SELECT id FROM overhead_expense_periods WHERE expense_id = $1)`,
      [id],
    );
    await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
    await client.query(`DELETE FROM overhead_expenses WHERE id = $1`, [id]);

    await logAudit({
      action: "overhead_spend.deleted",
      entity_type: "overhead_expense",
      entity_id: id,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: {
        name: row.name,
        amount: Number(row.amount),
        spent_on: String(row.start_date).slice(0, 10),
      },
    }, client);

    await client.query("COMMIT");

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] deleteSpend failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
