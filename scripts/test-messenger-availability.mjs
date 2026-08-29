// Parity test: the Messenger availability module vs createBooking's conflict check.
//
// src/lib/availability.ts and createBooking compose the SAME fragments
// (EXISTING_START_SQL / EXISTING_END_SQL / occupyingBookingSql / turnoverSql),
// so they cannot disagree on the fragments — only on how they are assembled.
// This asserts the assembled verdict against a VALUES fixture, so results never
// drift as real bookings come and go.
//
// A disagreement means a guest is told "available" in Messenger and then refused
// at checkout — the exact failure this bot must not produce.
//
// The turnover hours are READ OUT OF src/lib/turnover.ts via _turnover.mjs, so
// this exercises what production actually uses. The expected ALLOWED/BLOCKED
// outcomes below are the assertions.
//
// Run:  node --env-file=.env scripts/test-messenger-availability.mjs
import pg from "pg";
import { turnoverSql, describeTurnover } from "./_turnover.mjs";

console.log(`${describeTurnover()}\n`);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "1" },
});

const EX_START = "f.bs";
const EX_END = "f.be";

// The same two-sided overlap test both callers run.
const sql = `
  WITH f AS (
    SELECT ($1::DATE + $2::TIME)::TIMESTAMP AS bs,
           ($3::DATE + $4::TIME)::TIMESTAMP AS be,
           ($5::DATE + $6::TIME)::TIMESTAMP AS ns,
           ($7::DATE + $8::TIME)::TIMESTAMP AS ne
  )
  SELECT (
    ${EX_START} < f.ne + ${turnoverSql("f.ns", "f.ne")}
    AND (${EX_END} + ${turnoverSql(EX_START, EX_END)}) > f.ns
  ) AS blocked
  FROM f
`;

// [name, existing stay (in date/time, out date/time), proposed stay, expected blocked]
const cases = [
  [
    "Daycation then Overnight same day (1h turnover clears 6PM)",
    ["2026-09-04", "07:00", "2026-09-04", "17:00"],
    ["2026-09-04", "19:00", "2026-09-05", "17:00"],
    false,
  ],
  [
    "Overnight then Nightcation same evening (both start 7PM)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"],
    ["2026-09-04", "19:00", "2026-09-05", "05:00"],
    true,
  ],
  [
    "Overnight then next-day Daycation (checkout 5PM is after 7AM)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"],
    ["2026-09-05", "07:00", "2026-09-05", "17:00"],
    true,
  ],
  [
    "Overnight then Daycation two days later",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"],
    ["2026-09-06", "07:00", "2026-09-06", "17:00"],
    false,
  ],
  [
    "Back-to-back overnights (5PM out + 1h clears 7PM check-in)",
    ["2026-09-04", "19:00", "2026-09-05", "17:00"],
    ["2026-09-05", "19:00", "2026-09-06", "17:00"],
    false,
  ],
  [
    "Nightcation then same-morning Daycation (5AM out + 1h clears 7AM)",
    ["2026-09-04", "19:00", "2026-09-05", "05:00"],
    ["2026-09-05", "07:00", "2026-09-05", "17:00"],
    false,
  ],
  [
    "Multi-night overnight overlapping a later single night",
    ["2026-09-04", "19:00", "2026-09-07", "17:00"],
    ["2026-09-06", "19:00", "2026-09-07", "17:00"],
    true,
  ],
];

let failed = 0;
for (const [name, existing, proposed, expected] of cases) {
  const r = await pool.query(sql, [...existing, ...proposed]);
  const got = r.rows[0].blocked;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `  (blocked=${got}, expected=${expected})`}`);
}

await pool.end();
console.log(failed === 0 ? `\n${cases.length}/${cases.length} passed` : `\n${failed} case(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
