import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const before = await pool.query("SELECT haven_name, six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate FROM havens");
  console.log("BEFORE:", before.rows);
  // D'Lux rate card →  ten=10h weekday, six=10h weekend, weekday=21h weekday, weekend=21h weekend
  const r = await pool.query(
    `UPDATE havens SET ten_hour_rate = 1500, six_hour_rate = 1800, weekday_rate = 1900, weekend_rate = 2100, updated_at = NOW() RETURNING haven_name`
  );
  console.log(`Updated ${r.rowCount} haven(s):`, r.rows.map(x => x.haven_name));
  const after = await pool.query("SELECT haven_name, six_hour_rate AS h10_weekend, ten_hour_rate AS h10_weekday, weekday_rate AS h21_weekday, weekend_rate AS h21_weekend FROM havens");
  console.log("AFTER:", after.rows);
} catch (e) { console.error("ERR:", e.message); process.exit(1); }
finally { await pool.end(); }
