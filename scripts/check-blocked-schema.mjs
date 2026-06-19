import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='blocked_dates' ORDER BY ordinal_position`);
  console.log("blocked_dates columns:", cols.rows.map(r => r.column_name).join(", "));
  // Does the createBooking blocked-check query work? (it filters status='active')
  try {
    await pool.query(`SELECT id FROM blocked_dates WHERE haven_id = $1 AND status = 'active' LIMIT 1`, ["00000000-0000-0000-0000-000000000000"]);
    console.log("status filter query: ✅ OK");
  } catch (e) { console.log("status filter query: ❌ FAILS —", e.message); }
} catch (e) { console.error("ERR:", e.message); } finally { await pool.end(); }
