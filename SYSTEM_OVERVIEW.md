# D'Lux Homes — System Overview

Structure, features, modules and workflows for the whole app, in one place.

> **Verified against the codebase and the live database on 2026-08-15.** Where a
> claim came from the database rather than the source (table lists, row counts,
> status constraints), it is marked. Two older docs — `BOOKING_WORKFLOW.md` and
> `ADMIN_WORKFLOW.md` — predate most of this and describe products that no
> longer exist; prefer this file where they disagree.

---

## 1. What this is

A booking site for **one physical unit** — Tower 4, Grass Residences, SM North
EDSA, Quezon City. Guests browse it, pick a stay window and date, submit a
booking request with ID photos, and the owner reviews and approves it.

The backend was ported wholesale from a multi-property project ("Staycation
Haven PH"). That inheritance is the single most confusing thing about this
repo: roughly half the API surface and database schema serves partners,
payouts, multi-listing and commission features that D'Lux does not use. See
[§9 Dormant scaffolding](#9-dormant-scaffolding) before assuming a table or
route is live.

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 +
shadcn/ui · Redux Toolkit / RTK Query · NextAuth · Supabase Postgres accessed
through raw `pg` SQL (no ORM) · Cloudinary for images · deployed on Vercel.

---

## 2. Repo layout

```
src/
  app/                    Routes (App Router). Pages + /api handlers.
  backend/
    config/               pg pool
    controller/           18 controllers — all SQL lives here
    middlewares/
    migrations/           32 dated .sql files, applied in order
    models/               base table DDL
    utils/                mailer, cloudinary, pdf, ical, calendar, logging
  components/
    admin/                owner/CSR/cleaner UI, booking wizard, promo modal
    brand/                DluxMark, DluxLoader, palette
    guest/ shared/ ui/    guest-facing + shadcn primitives
  hooks/                  useDebouncedValue, useInactivityLogout, useRoomDiscounts
  lib/                    business rules and helpers (see §6)
  redux/                  store, bookingSlice, 26 RTK Query API slices
agent_docs/               backend notes, business rules, deployment, uploads
```

---

## 3. Guest workflow

Routes: `/` → `/rooms` → `/rooms/[id]` → `/checkout` →
`/my-bookings/confirmed` → `/my-bookings`

**`/`** redirects straight to `/rooms` (`redirect("/rooms")`).

**`/rooms`** — the single property, its gallery, promo offer and a bottom CTA
bar on mobile.

**`/rooms/[id]`** — the booking card. Three guided steps: **date → rate →
guests**. Date comes first because availability is per-date.

The three stay windows come from the haven row via `haven-adapter.ts`:

| Window | `stayType` | Source columns |
|---|---|---|
| Daycation | `10` | `ten_hour_check_in` / `_out` |
| Nightcation | `10` | `six_hour_check_in` / `_out` |
| Overnight | `21` | `twenty_one_hour_check_in` / `_out` |

Nightcation reuses the unused `six_hour` column pair — there is **no 6-hour
product**. Live values are Daycation 07:00–17:00, Nightcation 19:00–05:00,
Overnight 19:00–17:00 next day (22h).

Availability is **time-aware**, not per-day: a daycation and a nightcation can
share one date. Two stays clash only once cleaning turnover is added — see
[§5 Business rules](#5-business-rules). The calendar mirrors the server's SQL
check by reading the same constants, so what it offers is what the server
accepts.

**`/checkout`** — guest details, additional guests, ID photos, promo code,
payment method. Submitting `POST /api/bookings` uploads every photo to
Cloudinary, writes the booking, and emails the guest and owner. Booking IDs are
`DL-BK` + the last 10 digits of a timestamp (`generateBookingId()`).

**`/my-bookings/confirmed?id=`** — the confirmation page. This is also where
the guest uploads **payment proof** after approval (`submitPayment` → `PUT
/api/bookings/[id]`) and can leave a review.

**`/my-bookings`** — bookings for this device (`localStorage`) merged with any
tied to the signed-in account.

Guest booking state between the room page and checkout is held in
`localStorage` via `lib/booking-store.ts`, not in Redux.

---

## 4. Admin workflow

Three role dashboards, all behind NextAuth; unauthenticated access goes to
`/admin/login`.

| Role | Route | Scope |
|---|---|---|
| Owner | `/admin/owners` | Everything — bookings, rates, staff, settings, analytics |
| CSR | `/admin/csr` | Bookings, payments, guest support |
| Cleaner | `/admin/cleaners` | Cleaning tasks, issue reports |

### Booking status

The **database** is the authority. `booking.status` has a `CHECK` constraint
allowing exactly:

```
pending · on-going · approved · rejected · checked-in · checked-out · cancelled · completed
```

The transitions the owner dashboard actually writes are a subset:

```
pending ──Approve──► approved ──Check-in──► checked-in ──Check-out──► completed
   └─────Reject────► rejected
```

Money is collected as a **separate** action from check-in (`Collect`), so
arrival and payment can happen independently.

Only `pending · approved · confirmed · checked-in · on-going` bookings block
availability; `rejected`, `cancelled` and `completed` free their dates.

### Stored status vs displayed status

The admin UI does **not** show raw statuses. `deriveStatus()` in
`app/admin/owners/page.tsx` maps stored values onto eight display statuses,
which is why the dashboard shows stages the database has never heard of:

| Displayed | Derived from |
|---|---|
| Pending | `pending` |
| Awaiting Payment | `approved`, down payment **not** approved yet |
| Down Paid | `on-going` |
| Confirmed | `approved`, down payment approved |
| Checked In | `checked-in` |
| Checked Out | `completed` |
| Rejected | `rejected` |
| Expired | `pending`/`awaiting-payment` whose check-in date has passed |

So `Awaiting Payment`, `Down Paid` and `Expired` are **presentation only** — no
row ever stores them. `confirmed` is the subtle one: it is a real, meaningful
stage in the UI, but it is *derived*, and the raw value is `approved`. It also
appears in the availability `IN` filters in `bookingController.ts`, where it is
dead weight — the CHECK constraint forbids it, so no row can match. Harmless,
but it looks like a supported stored value and isn't.

The practical rule: **filter and display against derived statuses, query
availability against stored ones.**

---

## 5. Business rules

Rates, pax limits and payment terms are **owner-set** — see
[agent_docs/business-rules.md](agent_docs/business-rules.md), which is the
authority. Summary of where they live in code:

| Rule | Module |
|---|---|
| Weekday/weekend rates, extra-pax fee, bundle tiers, senior/PWD discount | `lib/pricing.ts` |
| Cleaning turnover between stays | `lib/turnover.ts` |
| Weekend/holiday calendar (owner-editable) | `lib/useCalendarRules.ts` + `pricing_holidays` |
| Promo offer derivation | `lib/promo-offer.ts` |
| Stay-window maths | `lib/stay-window.ts`, `lib/checkin-window.ts` |

**Cleaning turnover** deserves a note because it silently controls
availability. After every stay the unit is unavailable until cleaned:
**2 hours** after a stay of 20h or more, **1 hour** after anything shorter. The
buffer is applied to *both* stays being compared, so neither can butt up
against the other's cleaning window. `lib/turnover.ts` is the single source of
truth — the room calendar, `createBooking`'s SQL and the guest-facing error
text all read it, and `scripts/test-turnover.mjs` locks the behaviour in.

Payment: 50% down payment to reserve, 50% balance plus a ₱1,000 refundable
security deposit at check-in. **No cancellation** — one date change if
requested ≥7 days out.

---

## 6. Modules (`src/lib`)

| Module | Purpose |
|---|---|
| `pricing.ts` | Single source of truth for rates, extra pax, bundles, discounts |
| `turnover.ts` | Cleaning turnover hours + the SQL fragment the server uses |
| `stay-window.ts` | Stay-window helpers shared by the Haven wizard and settings |
| `checkin-window.ts` | When a booking becomes checkable-in |
| `haven-adapter.ts` | Maps a `havens` DB row to the shape the storefront renders |
| `booking-store.ts` | "My bookings on this device" (localStorage) + booking ID generation |
| `promo-offer.ts` | Shared offer-card derivation for rooms list and detail page |
| `useCalendarRules.ts` | Fetches the owner-editable weekend/holiday calendar |
| `auth.ts` | NextAuth config; Cloudflare Turnstile enforced only when configured |
| `guest.ts` | Guest token helpers |
| `validateImageFile.ts` | Client-side upload guard — **UX only**, server re-checks |
| `compressImage.ts` | Client-side downscaling for every guest photo upload |
| `house-rules-sheet.ts` | Content for the printed in-unit House Rules sheet |
| `dateUtils.ts` | Timezone-safe date formatting |
| `mock-data.ts` | Fallback data so pages render before/without the backend |

**Brand components** (`components/brand/`): `DluxMark` (the animated logo,
three layouts), `DluxLoader` (inline / `DluxLoaderPage` / `DluxLoaderOverlay`),
`palette.ts` (shared accent hexes). Loader keyframes live in `globals.css`.

---

## 7. Backend

All SQL is raw `pg` inside `src/backend/controller/` — 18 controllers, of which
`bookingController.ts` is by far the largest and owns booking creation, the
time-aware availability check, status transitions and the guest record.

**Live tables** (have data as of 2026-08-15):

```
havens · booking · booking_guests · booking_payments · booking_security_deposits
booking_cleaning · booking_time_categories · blocked_dates · haven_images
users · employees · employee_activity_logs · notifications
discounts · discount_users · promotions · payment_methods
pricing_settings · pricing_holidays · property_approval
```

**Migrations** are 32 dated `.sql` files under `backend/migrations/`, applied
after the base models. `npm run db:setup` runs base tables → models →
migrations; `npm run db:seed` seeds an owner account.

---

## 8. Integrations

| Service | Used for | Key env |
|---|---|---|
| Supabase Postgres | All data | `DATABASE_URL` |
| Cloudinary | ID photos, payment proof, haven images | `CLOUDINARY_*` |
| Gmail SMTP | All transactional email | `EMAIL_USER`, `EMAIL_PASSWORD` |
| Google Calendar | Booking sync | `GOOGLE_*_CALENDAR`, `GOOGLE_CALENDAR_ID` |
| Google Sheets | Booking export | `SPREADSHEET_ID` |
| Facebook Messenger | Guest chat + owner alerts | `MESSENGER_*`, `FB_APP_SECRET` |
| Cloudflare Turnstile | Bot check (optional) | `TURNSTILE_SECRET_KEY` |
| NextAuth | Sessions, Google login | `NEXTAUTH_*`, `GOOGLE_CLIENT_*` |

Unit-specific values (wifi, floor, mailbox, Netflix PIN) come from `DLUX_*`
env vars so they never sit in source.

**Cron routes** — `/api/cron/send-self-checkin-emails`,
`send-checkout-reminders`, `sync-icals`. There is **no `vercel.json`**: on the
Hobby plan the cron declarations were removed, so these need an external
pinger hitting them on a schedule with `CRON_SECRET`.

---

## 9. Dormant scaffolding

Ported from the multi-property project, wired up but **unused by D'Lux**. Every
one of these tables is empty:

```
partners_account · partners_information · partners_property_information
partner_documents · partner_payouts · partner_payout_items
partner_payout_attachments · partner_messages · partner_message_threads
partner_notifications · partner_bookings_view · platform_documents
haven_amenity_verifications · haven_ical_feeds · haven_addon_categories
haven_rentable_items · cleaning_tasks · cleaning_checklists
cleaning_checklist_photos · inventory · messages · conversations
reviews · wishlist · otp_verification · deposits · booking_add_ons
audit_logs · staff_activity_logs · report_issue · photo_tour_images
```

Their routes (`/api/partners/**`, `/api/admin/partner-*`, `/api/inventory`,
`/api/wishlist`, …) and RTK Query slices still exist. Treat anything named
`partner*`, `payout*`, `amenity-verification*` or `ical*` as inherited until
proven otherwise.

Two consequences worth remembering:

- **`booking_add_ons` is empty and there is no add-ons step.** The old
  `BOOKING_WORKFLOW.md` documents a Pool Pass / Towels / Bath Robe step; no
  such UI exists anywhere in `src/`.
- **`reviews` is empty** even though the confirmation page can submit one.

---

## 10. Working here

- `npm run dev` · `npm run build` · `npm run lint`. Vercel fails the deploy on
  any TS or lint error, so build locally before pushing.
- **Do not run `npm run build` while `npm run dev` is running.** They share
  `.next/`, and the build clobbers state Turbopack's dev cache depends on —
  the symptom is the dev server serving stale CSS/JS until you delete
  `.next/dev` and restart.
- Lint has a known baseline of pre-existing problems (mostly `no-explicit-any`
  and unused vars). Compare against the baseline rather than expecting zero.
- Test scripts under `scripts/` are run with
  `node --env-file=.env scripts/<name>.mjs`. `test-turnover.mjs` and
  `test-double-booking.mjs` cover availability; they read their constants from
  `src/lib/turnover.ts` so they can't drift from production.

### Related docs

| Doc | Covers |
|---|---|
| [AGENTS.md](AGENTS.md) | Entry point and conventions |
| [agent_docs/business-rules.md](agent_docs/business-rules.md) | Owner-confirmed rates, pax, payment, turnover |
| [agent_docs/backend-notes.md](agent_docs/backend-notes.md) | Ported backend, Haven naming, booking status logic |
| [agent_docs/image-uploads.md](agent_docs/image-uploads.md) | Photo/file upload path |
| [agent_docs/deployment.md](agent_docs/deployment.md) | Vercel and env specifics |
| `BOOKING_WORKFLOW.md`, `ADMIN_WORKFLOW.md` | **Stale** (last updated 2026-03-28) — see the note at the top |
