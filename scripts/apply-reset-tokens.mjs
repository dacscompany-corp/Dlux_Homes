import { readFileSync } from "node:fs";
import pg from "pg";
const sql = readFileSync("src/backend/models/password_reset_tokens.sql", "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await pool.query(sql);
  const r = await pool.query("SELECT to_regclass('public.password_reset_tokens') AS t");
  console.log("password_reset_tokens table:", r.rows[0].t ? "EXISTS ✅" : "MISSING ❌");
} catch (e) { console.error("ERROR:", e.message); process.exit(1); }
finally { await pool.end(); }
