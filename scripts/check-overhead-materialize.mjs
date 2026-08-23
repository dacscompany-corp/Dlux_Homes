// Verifies lazy materialisation: correct period count, and idempotency.
// Usage: node --env-file=.env scripts/check-overhead-materialize.mjs
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cat = await client.query(
  `SELECT id FROM overhead_categories WHERE name = 'Utilities' LIMIT 1`
);

const exp = await client.query(
  `INSERT INTO overhead_expenses
     (name, category_id, amount, frequency, start_date, due_day)
   VALUES ('__materialise_probe', $1, 1500, 'monthly', '2026-01-15', 15)
   RETURNING id`,
  [cat.rows[0].id]
);
const id = exp.rows[0].id;

try {
  // Mirrors materializeExpense's INSERT for six months of 2026.
  const starts = ['2026-01-15','2026-02-15','2026-03-15',
                  '2026-04-15','2026-05-15','2026-06-15'];
  for (const s of starts) {
    await client.query(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
       VALUES ($1, $2, $2, $2, 1500, date_trunc('month', $2::date)::date)
       ON CONFLICT (expense_id, period_start) DO NOTHING`,
      [id, s]
    );
  }

  const first = await client.query(
    `SELECT COUNT(*)::int AS n FROM overhead_expense_periods WHERE expense_id = $1`,
    [id]
  );

  // Second pass — every row should conflict and insert nothing.
  let reinserted = 0;
  for (const s of starts) {
    const r = await client.query(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
       VALUES ($1, $2, $2, $2, 1500, date_trunc('month', $2::date)::date)
       ON CONFLICT (expense_id, period_start) DO NOTHING`,
      [id, s]
    );
    reinserted += r.rowCount;
  }

  console.log(`${first.rows[0].n === 6 ? '✓' : '✗'} generated 6 periods (got ${first.rows[0].n})`);
  console.log(`${reinserted === 0 ? '✓' : '✗'} second pass inserted nothing (got ${reinserted})`);

  const ok = first.rows[0].n === 6 && reinserted === 0;
  console.log(ok ? '\nAll checks passed.' : '\nFAILED.');

  // Clean up the probe (finally-equivalent: also runs on assertion failure below).
  await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
  await client.query(`DELETE FROM overhead_expenses WHERE id = $1`, [id]);
  await client.end();

  process.exit(ok ? 0 : 1);
} catch (err) {
  // Never leave the probe rows behind, even if an assertion or query above threw.
  console.error('[check-overhead-materialize] error:', err);
  try {
    await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
    await client.query(`DELETE FROM overhead_expenses WHERE id = $1`, [id]);
  } catch (cleanupErr) {
    console.error('[check-overhead-materialize] cleanup also failed:', cleanupErr);
  } finally {
    await client.end();
  }
  process.exit(1);
}
