// Seed a staff account into `employees` so it can log in at /admin/login.
//
// Usage:
//   node --env-file=.env.local scripts/seed-admin.mjs [email] [password] [role]
//
// role is case-insensitive and validated against the employees.role enum
// (Owner | CSR | Cleaner). Defaults: owner@dluxhomes.com / Owner@123 / Owner.
//
// Examples:
//   node --env-file=.env.local scripts/seed-admin.mjs                              # default Owner
//   node --env-file=.env.local scripts/seed-admin.mjs csr@dluxhomes.com Csr@123 CSR
//   node --env-file=.env.local scripts/seed-admin.mjs cleaner@dluxhomes.com Clean@123 Cleaner
//
// Idempotent: if the email already exists, it updates the password + role
// instead of inserting a duplicate.

import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Client } = pg;

const email = process.argv[2] || 'owner@dluxhomes.com';
const password = process.argv[3] || 'Owner@123';
const requestedRole = process.argv[4] || 'Owner';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('✗ DATABASE_URL not set. Run with: node --env-file=.env.local scripts/seed-admin.mjs');
  process.exit(1);
}
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const client = new Client({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

// Resolve the requested role against the actual enum labels (case-insensitive).
async function resolveRole(requested) {
  const r = await client.query(
    `SELECT e.enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'employee_role' ORDER BY e.enumsortorder`
  );
  const labels = r.rows.map((x) => x.enumlabel);
  if (!labels.length) return requested; // enum missing — trust the input

  const match = labels.find((l) => l.toLowerCase() === requested.toLowerCase());
  if (!match) {
    throw new Error(
      `Role "${requested}" is not valid. Allowed roles: ${labels.join(', ')}`
    );
  }
  return match;
}

// Sensible default names per role (first_name/last_name are NOT NULL).
function namesFor(role) {
  if (role === 'Owner') return ['Admin', 'Owner'];
  return ['Staff', role]; // e.g. "Staff CSR", "Staff Cleaner"
}

async function run() {
  await client.connect();
  const role = await resolveRole(requestedRole);
  const [firstName, lastName] = namesFor(role);
  const hash = bcrypt.hashSync(password, 10);

  const existing = await client.query('SELECT id FROM employees WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    await client.query(
      `UPDATE employees SET password = $1, role = $2, login_attempts = 0, updated_at = NOW() WHERE email = $3`,
      [hash, role, email]
    );
    console.log(`✓ Updated existing account: ${email} (role ${role})`);
  } else {
    const employmentId = 'EMP-' + email.split('@')[0].toUpperCase();
    await client.query(
      `INSERT INTO employees
         (first_name, last_name, email, password, employment_id, hire_date, role, login_attempts)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, 0)`,
      [firstName, lastName, email, hash, employmentId, role]
    );
    console.log(`✓ Created account: ${email} (role ${role})`);
  }

  const dash = role === 'Owner' ? '/admin/owners' : role === 'CSR' ? '/admin/csr' : '/admin/cleaners';
  console.log(`\n  Login at /admin/login  →  ${dash}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`\n  ⚠ Change this password after first login.`);
  await client.end();
}

run().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
