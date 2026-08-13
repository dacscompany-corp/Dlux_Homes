// Cleaning-turnover regression test.
//
// Mirrors the conflict predicate in createBooking's availabilityCheckQuery
// (src/backend/controller/bookingController.ts) but runs it against a VALUES
// fixture instead of the live `booking` table, so the expected results never
// drift when real bookings come and go.
//
// The rule under test — a stay of 20h or more needs 2 hours of cleaning after
// it, anything shorter needs 1 hour:
//
//   existing check-in                      <  new check-out + new turnover
//   existing check-out + existing turnover >  new check-in
//
// The hour values are READ OUT OF src/lib/turnover.ts rather than repeated
// here, so this test exercises what production actually uses. The expected
// ALLOWED/BLOCKED outcomes below are the assertions — change the constant and
// these cases are what tell you what it did.
//
// Run:  node --env-file=.env scripts/test-turnover.mjs
import pg from "pg";
import { turnoverSql, describeTurnover } from "./_turnover.mjs";

console.log(`${describeTurnover()}\n`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const q = `
  WITH f AS (
    SELECT ($1::DATE + $2::TIME)::TIMESTAMP AS bs,  -- existing stay
           ($3::DATE + $4::TIME)::TIMESTAMP AS be,
           ($5::DATE + $6::TIME)::TIMESTAMP AS ns,  -- candidate stay
           ($7::DATE + $8::TIME)::TIMESTAMP AS ne
  )
  SELECT (bs < ne + ${turnoverSql("ns", "ne")} AND be + ${turnoverSql("bs", "be")} > ns) AS conflicts
  FROM f`;

// [name, existing stay, candidate stay, expected allowed?]
const cases = [
  ["daycation the same day a 6PM overnight checks in",
    ["2026-08-21", "18:00", "2026-08-22", "16:00"], ["2026-08-21", "07:00", "2026-08-21", "17:00"], true],
  ["daycation on the day that overnight checks OUT (guest still in unit)",
    ["2026-08-21", "18:00", "2026-08-22", "16:00"], ["2026-08-22", "07:00", "2026-08-22", "17:00"], false],
  ["overnight checking in 1h after a daycation ends",
    ["2026-08-10", "07:00", "2026-08-10", "17:00"], ["2026-08-10", "18:00", "2026-08-11", "16:00"], true],
  ["overnight checking in 30min after a daycation ends (inside turnover)",
    ["2026-08-10", "07:00", "2026-08-10", "17:00"], ["2026-08-10", "17:30", "2026-08-11", "16:00"], false],
  ["nightcation 3h after an overnight checks out",
    ["2026-08-15", "19:00", "2026-08-16", "16:00"], ["2026-08-16", "19:00", "2026-08-17", "05:00"], true],
  ["nightcation 1h after an overnight checks out (inside turnover)",
    ["2026-08-15", "19:00", "2026-08-16", "16:00"], ["2026-08-16", "17:00", "2026-08-17", "05:00"], false],
  ["back-to-back overnights (4PM out, 7PM in)",
    ["2026-08-20", "19:00", "2026-08-21", "16:00"], ["2026-08-21", "19:00", "2026-08-22", "16:00"], true],
  ["two daycations on the same day",
    ["2026-08-10", "07:00", "2026-08-10", "17:00"], ["2026-08-10", "07:00", "2026-08-10", "17:00"], false],
];

let failed = 0;
try {
  for (const [name, existing, candidate, expectAllowed] of cases) {
    const { rows } = await pool.query(q, [...existing, ...candidate]);
    const allowed = !rows[0].conflicts;
    const ok = allowed === expectAllowed;
    if (!ok) failed++;
    console.log(`${ok ? "✅" : "❌"} ${name}`);
    if (!ok) console.log(`     expected ${expectAllowed ? "ALLOWED" : "BLOCKED"}, got ${allowed ? "ALLOWED" : "BLOCKED"}`);
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
} catch (e) {
  console.error("❌ SQL ERROR:", e.message);
  failed = 1;
} finally {
  await pool.end();
}
process.exit(failed ? 1 : 0);
