import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const b = await pool.query("SELECT booking_id, status, check_in_date, check_out_date FROM booking ORDER BY check_in_date DESC LIMIT 15");
  console.log("Total bookings:", (await pool.query("SELECT count(*) FROM booking")).rows[0].count);
  console.log("Recent bookings:", b.rows);
  const bd = await pool.query("SELECT haven_id, from_date, to_date, status FROM blocked_dates ORDER BY from_date DESC LIMIT 5");
  console.log("Blocked dates:", bd.rows);
} catch (e) { console.error("ERR:", e.message); } finally { await pool.end(); }
