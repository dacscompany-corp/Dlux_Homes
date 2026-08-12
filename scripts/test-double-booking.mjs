import pg from "pg";
import { turnoverSql, describeTurnover } from "./_turnover.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log(`${describeTurnover()}\n`);

// The exact availability query from createBooking (time-aware + cleaning buffer).
const B_START = `(b.check_in_date::DATE + b.check_in_time::TIME)::TIMESTAMP`;
const B_END = `(CASE WHEN b.check_out_time = '00:00' THEN (b.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP ELSE (b.check_out_date::DATE + b.check_out_time::TIME)::TIMESTAMP END)`;
const Q = `
  WITH n AS (
    SELECT ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
      (CASE WHEN $5 = '00:00' THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne)
  SELECT b.id FROM booking b, n
  WHERE b.room_name = $1 AND b.status IN ('pending','approved','confirmed','checked-in','on-going')
    AND ${B_START} < n.ne + ${turnoverSql("n.ns", "n.ne")}
    AND (${B_END} + ${turnoverSql(B_START, B_END)}) > n.ns
  LIMIT 1`;

const c = await pool.connect();
let pass = 0, fail = 0;
try {
  await c.query("BEGIN");
  // Temp table mirrors the columns the query touches.
  await c.query(`CREATE TEMP TABLE booking (
    id serial, room_name text, status text,
    check_in_date date, check_in_time text, check_out_date date, check_out_time text) ON COMMIT DROP`);
  const ins = (room, cid, cit, cod, cot, st = "approved") =>
    c.query(`INSERT INTO booking (room_name,status,check_in_date,check_in_time,check_out_date,check_out_time) VALUES ($1,$2,$3,$4,$5,$6)`,
      [room, st, cid, cit, cod, cot]);

  // Seed: R1 has an overnight (Jul1 7PM→Jul2 4PM), a daycation (Jul5 7AM→5PM),
  // a midnight-checkout stay (Jul10 7PM→Jul11 00:00), and a CANCELLED one (Jul20).
  await ins("R1", "2026-07-01", "19:00", "2026-07-02", "16:00");          // E1 overnight
  await ins("R1", "2026-07-05", "07:00", "2026-07-05", "17:00");          // E2 daycation
  await ins("R1", "2026-07-10", "19:00", "2026-07-10", "00:00");          // E3 ends midnight (Jul11 00:00 via the +1day convention)
  await ins("R1", "2026-07-20", "19:00", "2026-07-21", "16:00", "cancelled"); // E4 cancelled (must NOT block)

  const cases = [
    // [label, room, ci_date, ci_time, co_date, co_time, expectBlocked]
    ["exact same slot as E1",                 "R1","2026-07-01","19:00","2026-07-02","16:00", true],
    ["overlaps E1 midday (daycation Jul2)",   "R1","2026-07-02","07:00","2026-07-02","17:00", true],
    ["inside E1's 3h cleaning (Jul2 5PM)",     "R1","2026-07-02","17:00","2026-07-03","14:00", true],
    ["back-to-back overnight (Jul2 7PM) OK",   "R1","2026-07-02","19:00","2026-07-03","16:00", false],
    ["prior overnight ending into E1 (Jun30)", "R1","2026-06-30","19:00","2026-07-01","16:00", false],
    ["1h before E1 cleaning ends (Jul2 6PM)",  "R1","2026-07-02","18:00","2026-07-03","15:00", true],
    ["E2 same daycation slot",                "R1","2026-07-05","07:00","2026-07-05","17:00", true],
    ["nightcation after E2 (Jul5 7PM) OK",     "R1","2026-07-05","19:00","2026-07-06","05:00", false],
    // E2 is a 10h daycation ending 5PM, so it owes the SHORT turnover. These
    // two straddle the moment that turnover ends.
    ["inside E2's cleaning (Jul5 5:30PM)",      "R1","2026-07-05","17:30","2026-07-06","03:30", true],
    ["exactly as E2's cleaning ends (Jul5 6PM)","R1","2026-07-05","18:00","2026-07-06","04:00", false],
    ["far future, no conflict (Jul15)",        "R1","2026-07-15","19:00","2026-07-16","16:00", false],
    ["midnight-checkout new booking ok (Aug)", "R1","2026-08-01","19:00","2026-08-02","00:00", false],
    // E3 runs 7PM→midnight (5h), so it also owes the SHORT turnover.
    ["inside E3's cleaning (Jul11 12:30AM)",    "R1","2026-07-11","00:30","2026-07-11","10:30", true],
    ["exactly as E3's cleaning ends (Jul11 1AM)","R1","2026-07-11","01:00","2026-07-11","11:00", false],
    ["same dates but DIFFERENT room R2",        "R2","2026-07-01","19:00","2026-07-02","16:00", false],
    ["overlaps the CANCELLED E4 (allowed)",     "R1","2026-07-20","19:00","2026-07-21","16:00", false],
  ];

  for (const [label, room, cid, cit, cod, cot, expectBlocked] of cases) {
    const r = await c.query(Q, [room, cid, cit, cod, cot]);
    const blocked = r.rowCount > 0;
    const ok = blocked === expectBlocked;
    ok ? pass++ : fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${blocked ? "BLOCKED " : "allowed "} (want ${expectBlocked ? "BLOCKED" : "allowed"})  ${label}`);
  }
  await c.query("ROLLBACK");
} catch (e) { console.error("ERROR:", e.message); process.exit(1); }
finally { c.release(); await pool.end(); }

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
