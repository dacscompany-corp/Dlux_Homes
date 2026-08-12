import pg from "pg";
import { turnoverSql } from "./_turnover.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const B_START = `(b.check_in_date::DATE + b.check_in_time::TIME)::TIMESTAMP`;
const B_END = `(CASE WHEN b.check_out_time = '00:00' THEN (b.check_out_date::DATE + INTERVAL '1 day')::TIMESTAMP ELSE (b.check_out_date::DATE + b.check_out_time::TIME)::TIMESTAMP END)`;
const q = `
  WITH n AS (
    SELECT ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
      (CASE WHEN $5 = '00:00' THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne)
  SELECT b.id, b.booking_id FROM booking b, n
  WHERE b.room_name = $1 AND b.status IN ('pending','approved','confirmed','checked-in','on-going')
    AND ${B_START} < n.ne + ${turnoverSql("n.ns", "n.ne")}
    AND (${B_END} + ${turnoverSql(B_START, B_END)}) > n.ns
  LIMIT 1`;
try {
  const r = await pool.query(q, ["D’Lux Homes — Tower 4 Grass Residences", "2026-07-01", "19:00", "2026-07-02", "16:00"]);
  console.log("✅ SQL valid — query executed, rows:", r.rowCount);
} catch (e) { console.error("❌ SQL ERROR:", e.message); process.exit(1); }
finally { await pool.end(); }
