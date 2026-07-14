# Backend architecture and gotchas

The backend was ported wholesale from a separate multi-property project ("Staycation"). That's why you'll see `package.json` name `staycation-temp`, "Haven" terminology, and partner/multi-listing scaffolding even though this app serves a single property.

**Layout:** `src/backend/` (config, controllers, middlewares, utils, migrations, models — raw SQL, no ORM), `src/redux/api/*` (RTK Query), `src/lib/auth.ts` (NextAuth), `src/app/api/*` (route handlers).

**Pattern:** route handler → `requireAdmin()`/`requireEmployee()` guard (`src/backend/utils/requireAdmin.ts`) → controller → raw `pg` SQL against a single shared Pool (`src/backend/config/db.ts`).

**Schema setup:** `npm run db:setup` applies `supabase/00_base_tables.sql` then `src/backend/models/*.sql` then `src/backend/migrations/*.sql`, in that order. `npm run db:seed` seeds an owner account. Migrations must also be run manually against Supabase on deploy — Vercel does not apply them.

**Booking status values:** DB constraint allows `pending, on-going, approved, rejected, checked-in, checked-out, cancelled, completed` — it does NOT include `confirmed`. UI displays `approved` as "confirmed" and `completed` as "checked-out"; don't write those display strings to the DB.

**Booking identifiers:** a booking has both a UUID (`id`) and a display code (`booking_id`, e.g. `BK...`). Status mutations require the UUID — the controller's post-update query joins on it.

See also [business-rules.md](business-rules.md) and the guest-facing flow in [../BOOKING_WORKFLOW.md](../BOOKING_WORKFLOW.md).
