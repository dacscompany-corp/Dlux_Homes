// D'Lux Homes — database setup runner.
//
// Applies the schema to the Postgres database in DATABASE_URL (Supabase or local):
//   1. supabase/00_base_tables.sql        (reconstructed users + staff_activity_logs)
//   2. src/backend/models/*.sql           (CREATE TABLE definitions, sorted)
//   3. src/backend/migrations/*.sql        (ALTER / fix migrations, sorted)
//
// Runs each file in its own statement batch and CONTINUES on error, printing a
// per-file ✓/✗ summary — so an already-applied idempotent statement (or a file
// whose dependency lands later) doesn't abort the whole run. Re-run until the
// summary is all green; most statements use IF NOT EXISTS and are safe to repeat.
//
// Usage:
//   node --env-file=.env.local scripts/db-setup.mjs
// (Node 20.6+ supports --env-file. Otherwise export DATABASE_URL first.)

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const ROOT = path.resolve('.');
const BASE = path.join(ROOT, 'supabase', '00_base_tables.sql');
const MODELS_DIR = path.join(ROOT, 'src', 'backend', 'models');
const MIGRATIONS_DIR = path.join(ROOT, 'src', 'backend', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('✗ DATABASE_URL is not set. Add it to .env.local and run with --env-file=.env.local');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

function sqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));
}

const files = [
  ...(fs.existsSync(BASE) ? [BASE] : []),
  ...sqlFiles(MODELS_DIR),
  ...sqlFiles(MIGRATIONS_DIR),
];

const client = new Client({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const results = [];

async function run() {
  await client.connect();
  console.log(`Connected. Applying ${files.length} SQL file(s)…\n`);

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const sql = fs.readFileSync(file, 'utf8').trim();
    if (!sql) {
      results.push({ rel, ok: true, note: 'empty' });
      continue;
    }
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      results.push({ rel, ok: true });
      console.log(`✓ ${rel}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      results.push({ rel, ok: false, error: err.message });
      console.log(`✗ ${rel}\n    ${err.message}`);
    }
  }

  await client.end();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n──────── summary ────────`);
  console.log(`applied ok : ${results.length - failed.length}`);
  console.log(`failed     : ${failed.length}`);
  if (failed.length) {
    console.log(`\nRe-run after reviewing these (often a dependency that lands in a later file,`);
    console.log(`or a statement already applied):`);
    for (const f of failed) console.log(`  - ${f.rel}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
