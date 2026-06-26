import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const before = await pool.query("SELECT haven_name, six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate FROM havens");
  console.log("BEFORE:", before.rows);
  // D'Lux real rate card →  ten=10h weekday, six=10h weekend, weekday=21h weekday, weekend=21h weekend
  // NOTE: rates are owner-managed in the admin. This script only GUARANTEES the per-extra-pax fee
  // and sets the rate columns to the canonical card. It is NOT run automatically — run manually only
  // to (re)seed a fresh DB. Do not run it to "fix" rates the owner has intentionally changed.
  const r = await pool.query(
    `UPDATE havens SET ten_hour_rate = 1499, six_hour_rate = 1799, weekday_rate = 1899, weekend_rate = 2099, extra_pax_fee = 300, updated_at = NOW() RETURNING haven_name`
  );
  console.log(`Updated ${r.rowCount} haven(s):`, r.rows.map(x => x.haven_name));
  const after = await pool.query("SELECT haven_name, six_hour_rate AS h10_weekend, ten_hour_rate AS h10_weekday, weekday_rate AS h21_weekday, weekend_rate AS h21_weekend FROM havens");
  console.log("AFTER:", after.rows);
} catch (e) { console.error("ERR:", e.message); process.exit(1); }
finally { await pool.end(); }
