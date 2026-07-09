import { Pool, types } from 'pg';

// Return DATE columns (type OID 1082) as raw 'YYYY-MM-DD' strings instead of JS
// Date objects. node-postgres otherwise parses a DATE into a Date at the server's
// local midnight, which JSON-serialises to a UTC ISO string shifted back a day in
// +UTC zones (PH is UTC+8) — turning a Jun 25 check-in into Jun 24. Keeping the
// raw string preserves the exact calendar date the guest picked. DATE has no time
// or zone, so a plain string is the only lossless representation.
types.setTypeParser(1082, (v) => v);

// PostgreSQL connection pool.
//
// Supabase: use the connection string from
//   Project Settings → Database → Connection string → "Connection pooling".
// For a serverless/Next.js app prefer the POOLER connection (Transaction mode,
// host *.pooler.supabase.com, port 6543). Set it as DATABASE_URL in .env.local:
//
//   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
//
// Supabase always requires SSL. By default rejectUnauthorized:false accepts its
// cert chain the same way the original Neon setup did (encrypted but not
// certificate-verified — a known Supabase-pooler workaround). If you can supply
// the CA / use a verify-full connection string, set DATABASE_SSL_STRICT=1 to
// turn on full certificate validation and close the theoretical MITM gap. Local
// Postgres (Docker) needs no SSL.
const connectionString = process.env.DATABASE_URL;

const isLocal =
  !!connectionString &&
  (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'));

const sslStrict = process.env.DATABASE_SSL_STRICT === '1';

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: sslStrict },
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

export default pool;
