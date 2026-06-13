# D'Lux Homes — Supabase / Postgres setup

The backend talks to Postgres through a `pg` connection pool
([src/backend/config/db.ts](../src/backend/config/db.ts)) using `DATABASE_URL`.
Supabase is plain Postgres, so the same code works against a Supabase project, a
local Docker Postgres, or any Postgres.

## 1. Point `DATABASE_URL` at your Supabase database

In the Supabase dashboard: **Project Settings → Database → Connection string →
Connection pooling**. Use the **Transaction** pooler (host `*.pooler.supabase.com`,
port `6543`) for a serverless/Next.js app.

Copy [`.env.example`](../.env.example) to `.env.local` and set:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

## 2. Create the schema

```bash
node --env-file=.env.local scripts/db-setup.mjs
# or:  npm run db:setup   (after exporting DATABASE_URL, or with --env-file support)
```

The runner applies, in order:

1. **`supabase/00_base_tables.sql`** — `users` and `staff_activity_logs`. These two
   tables had no version-controlled `CREATE TABLE` in the source project (they
   lived only in the original live database), so they are **reconstructed** from
   how the controllers use them. Review the column types before production use.
2. **`src/backend/models/*.sql`** — the `CREATE TABLE` definitions for everything
   else (booking, havens, employees, booking_payments, cleaning_*, partners_*,
   discounts, reviews, notifications, …), applied in filename order.
3. **`src/backend/migrations/*.sql`** — incremental `ALTER`/fix migrations.

Each file runs in its own transaction and the runner **continues on error**,
printing a `✓`/`✗` summary. Most statements use `IF NOT EXISTS`, so re-running is
safe — re-run until the summary is all green. A `✗` is usually a dependency that
lands in a later file (resolved on the next pass) or a statement already applied.

## 3. Seed an admin to log in

The login flow checks `employees` first, then `partners_account`, then `users`.
Insert an Owner with a bcrypt-hashed password, e.g.:

```sql
-- hash generated with bcryptjs (cost 10)
INSERT INTO employees (first_name, last_name, email, password, role)
VALUES ('Admin', 'Owner', 'owner@dluxhomes.com', '$2a$10$REPLACE_WITH_BCRYPT_HASH', 'Owner');
```

Generate the hash locally: `node -e "console.log(require('bcryptjs').hashSync('yourpass',10))"`.

## Notes

- SSL is auto-disabled for `localhost`/`127.0.0.1` and enabled (with
  `rejectUnauthorized:false`) otherwise — matching how Supabase/Neon expect it.
- Optional integrations (Cloudinary uploads, Google Calendar/Sheets, email,
  Turnstile, OAuth) only activate when their env vars are set; core booking +
  auth work with just `DATABASE_URL` + `NEXTAUTH_SECRET`.
