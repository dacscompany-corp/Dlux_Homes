<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What this is

D'Lux Homes is a booking site for a single real property (Tower 4, Grass Residences, QC). Stack: Next.js 16 App Router + TypeScript, Tailwind v4 + shadcn/ui, Redux Toolkit/RTK Query, NextAuth, Supabase Postgres via raw `pg` SQL (no ORM).

The backend was ported wholesale from a separate multi-property project ("Staycation"), so you'll see "Haven" naming and partner/multi-listing scaffolding that predates this being a single-property app — see [agent_docs/backend-notes.md](agent_docs/backend-notes.md) before touching `src/backend/` or booking status logic.

## How to work here

- `npm run dev` / `npm run build` / `npm run lint`. Vercel deploy fails on any TS/lint error — run `npm run build` locally before pushing.
- `npm run db:setup` applies schema (base tables → models → migrations); `npm run db:seed` seeds an owner account. Details: [agent_docs/backend-notes.md](agent_docs/backend-notes.md).
- Guest-facing booking flow (rooms → checkout → admin review): [BOOKING_WORKFLOW.md](BOOKING_WORKFLOW.md).
- Pricing, pax limits, payment/cancellation terms are owner-set business rules, not assumptions — read [agent_docs/business-rules.md](agent_docs/business-rules.md) before changing anything under `src/lib/pricing.ts` or `havens` rate columns.
- Any new photo/file upload: [agent_docs/image-uploads.md](agent_docs/image-uploads.md).
- Deploy/env specifics: [agent_docs/deployment.md](agent_docs/deployment.md).
