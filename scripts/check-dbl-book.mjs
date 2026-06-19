import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const c = await pool.query(`SELECT conname FROM pg_constraint WHERE conname = 'booking_no_double_book_active'`);
  console.log("Constraint installed:", c.rows.length ? "YES ✅" : "NO ❌");
  const ext = await pool.query(`SELECT extname FROM pg_extension WHERE extname='btree_gist'`);
  console.log("btree_gist extension:", ext.rows.length ? "present ✅" : "missing ❌");
} catch (e) { console.error("ERR:", e.message); process.exit(1); }
finally { await pool.end(); }
