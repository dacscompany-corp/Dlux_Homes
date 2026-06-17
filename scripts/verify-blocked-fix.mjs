import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await pool.query(`SELECT id FROM blocked_dates WHERE haven_id=$1 AND daterange(from_date,to_date,'[]') && daterange($2::date,$3::date,'[)') LIMIT 1`, ["00000000-0000-0000-0000-000000000000","2026-06-17","2026-06-20"]);
  console.log("✅ fixed blocked-check query parses & runs");
} catch (e) { console.log("❌", e.message); } finally { await pool.end(); }
