import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = `
  WITH n AS (
    SELECT ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
      (CASE WHEN $5 = '00:00' THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne)
  SELECT b.id, b.booking_id FROM booking b, n
  WHERE b.room_name = $1 AND b.status IN ('pending','approved','confirmed','checked-in','on-going')
    AND (b.check_in_date::DATE + b.check_in_time::TIME)::TIMESTAMP <
        n.ne + (CASE WHEN (n.ne - n.ns) >= INTERVAL '20 hours' THEN INTERVAL '3 hours' ELSE INTERVAL '2 hours' END)
    AND ((CASE WHEN b.check_out_time = '00:00' THEN (b.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP ELSE (b.check_out_date::DATE + b.check_out_time::TIME)::TIMESTAMP END)
      + (CASE WHEN ((CASE WHEN b.check_out_time='00:00' THEN (b.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP ELSE (b.check_out_date::DATE + b.check_out_time::TIME)::TIMESTAMP END) - (b.check_in_date::DATE + b.check_in_time::TIME)::TIMESTAMP) >= INTERVAL '20 hours' THEN INTERVAL '3 hours' ELSE INTERVAL '2 hours' END)
    ) > n.ns
  LIMIT 1`;
try {
  const r = await pool.query(q, ["D’Lux Homes — Tower 4 Grass Residences", "2026-07-01", "19:00", "2026-07-02", "16:00"]);
  console.log("✅ SQL valid — query executed, rows:", r.rowCount);
} catch (e) { console.error("❌ SQL ERROR:", e.message); process.exit(1); }
finally { await pool.end(); }
