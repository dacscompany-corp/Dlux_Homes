import { Pool } from 'pg';

// PostgreSQL connection pool.
//
// Supabase: use the connection string from
//   Project Settings → Database → Connection string → "Connection pooling".
// For a serverless/Next.js app prefer the POOLER connection (Transaction mode,
// host *.pooler.supabase.com, port 6543). Set it as DATABASE_URL in .env.local:
//
//   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
//
// Supabase always requires SSL; rejectUnauthorized:false accepts its cert chain
// the same way the original Neon setup did. Local Postgres (Docker) needs no SSL.
const connectionString = process.env.DATABASE_URL;

const isLocal =
  !!connectionString &&
  (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'));

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

export default pool;
