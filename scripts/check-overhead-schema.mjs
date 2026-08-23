// Verifies the overhead tables, constraints and seed rows landed.
// Usage: node --env-file=.env scripts/check-overhead-schema.mjs
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const TABLES = [
  'overhead_categories',
  'overhead_expenses',
  'overhead_expense_periods',
  'overhead_expense_payments',
];

let ok = true;

for (const t of TABLES) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [t]
  );
  const found = r.rows.length > 0;
  if (!found) ok = false;
  console.log(`${found ? '✓' : '✗'} table ${t}`);
}

const cats = await client.query(
  `SELECT name FROM overhead_categories ORDER BY sort_order`
);
console.log(`${cats.rows.length === 6 ? '✓' : '✗'} categories seeded: ` +
  cats.rows.map((r) => r.name).join(', '));
if (cats.rows.length !== 6) ok = false;

const uniq = await client.query(
  `SELECT 1 FROM pg_constraint WHERE conname = 'overhead_periods_unique'`
);
console.log(`${uniq.rows.length ? '✓' : '✗'} unique (expense_id, period_start)`);
if (!uniq.rows.length) ok = false;

await client.end();
console.log(ok ? '\nAll checks passed.' : '\nFAILED — see ✗ above.');
process.exit(ok ? 0 : 1);
