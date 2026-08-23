# Overhead Expense Management — Design

**Date:** 2026-08-23
**Status:** Approved for planning
**Source:** `Overhead Expense Management Module.pdf` (§ references below point at that document)

## 1. Purpose

Record and analyse D'Lux Homes' recurring operating expenses so the owner can answer:
*how much does it cost to keep the property running even with no bookings, and what must
each sellable night therefore carry?*

### In scope (this spec)

§1–13 and §21–28: categories, expense records, recurrence, payment tracking, statuses,
monthly and annual totals, the overhead dashboard, month-over-month comparison, history,
editing rules, validation, access control, audit trail.

### Out of scope (deferred to a second spec)

- §14 narrative trend explanations ("dues rose ₱500 and a new subscription was added")
- §15–16 overhead per available night, allocation to bookings
- §18 profitability integration
- §19 AI Revenue Manager seam — **no such consumer exists in the codebase today**
- §20 alerts and notifications

The analytics layer is deferred deliberately: its numbers should be validated against real
recorded expenses, and none exist yet. The data model below is built so that layer needs no
schema change — only new read queries.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Reporting basis | **Accrual.** "August overhead" is what was *due for* August, paid or not. Paid/unpaid/overdue is a separate cash layer on top. |
| 2 | Available nights (§15, informs phase 2) | Calendar nights in month **minus active `blocked_dates`**. Turnover is 1–2 hours ([`src/lib/turnover.ts`](../../../src/lib/turnover.ts)) so it never consumes a night. |
| 3 | Access control (§26) | **Owner only.** New `requireOwner()` guard. No per-staff permission system — that would be its own subsystem. |
| 4 | Amount changes (§23) | **Effective-dated.** The edit form asks "from when", defaulting to the next unpaid period. Paid periods are never modified. |
| 5 | Non-monthly accrual | Periods accrue **point-in-time** (a quarterly bill lands wholly in its first month). Trend and forecast figures use a **normalized monthly equivalent** so a quarterly bill does not read as a 300% spike. |
| 6 | Deletion | **Hard delete blocked once any payment exists** (409). Pause/end (§23) is the real mechanism. |
| 7 | Currency (§5) | **Dropped.** PHP only; a currency column invites a bug the app will never need. |
| 8 | Custom frequency (§6) | `interval_count` + `interval_unit` (every N days/weeks/months). Not a cron expression. |

## 3. Data model

One migration, `src/backend/migrations/2026-08-23-create-overhead-expenses.sql`, following the
conventions in `2026-07-21-create-promotions.sql` (UUID PKs via `gen_random_uuid()`,
`created_by → employees(id)`, explicit indexes).

### 3.1 `overhead_categories`

Flat list seeded with §4's six top-level groups: Property, Utilities, Software & Technology,
Maintenance, Administrative, Other. The sub-bullets in §4 ("Internet", "Cloud services") are
expense *names*, not categories — this keeps §13's report grouping exactly as the document
shows it.

```sql
CREATE TABLE IF NOT EXISTS overhead_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Renameable and deactivatable. Deletion is refused while any expense references the category.

### 3.2 `overhead_expenses` — the definition

```sql
CREATE TABLE IF NOT EXISTS overhead_expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(150) NOT NULL,
    category_id       UUID NOT NULL REFERENCES overhead_categories(id) ON DELETE RESTRICT,
    description       TEXT,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    frequency         VARCHAR(20) NOT NULL CHECK (frequency IN
                        ('one-time','daily','weekly','monthly',
                         'quarterly','semiannual','annual','custom')),
    interval_count    INT CHECK (interval_count > 0),        -- custom only
    interval_unit     VARCHAR(10) CHECK (interval_unit IN ('day','week','month')),
    start_date        DATE NOT NULL,
    end_date          DATE,
    due_day           INT CHECK (due_day BETWEEN 1 AND 31),  -- NULL = due on period_start
    active            BOOLEAN NOT NULL DEFAULT TRUE,         -- pause = FALSE
    notes             TEXT,
    generated_through DATE,                                  -- materialisation watermark
    created_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT overhead_expenses_dates_chk
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT overhead_expenses_custom_chk
        CHECK (frequency <> 'custom'
               OR (interval_count IS NOT NULL AND interval_unit IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_overhead_expenses_active
    ON overhead_expenses(active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_overhead_expenses_category
    ON overhead_expenses(category_id);
```

### 3.3 `overhead_expense_periods` — the occurrence

The load-bearing table. `amount_due` is a **snapshot** taken at generation time; this is what
makes §22 history and §23 "don't overwrite the past" structural rather than a discipline
problem.

```sql
CREATE TABLE IF NOT EXISTS overhead_expense_periods (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID NOT NULL REFERENCES overhead_expenses(id) ON DELETE RESTRICT,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    due_date      DATE NOT NULL,
    amount_due    NUMERIC(12,2) NOT NULL CHECK (amount_due > 0),
    status        VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','paid','cancelled')),
    accrual_month DATE NOT NULL,          -- first day of the month this accrues to
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT overhead_periods_unique UNIQUE (expense_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_overhead_periods_accrual
    ON overhead_expense_periods(accrual_month);
CREATE INDEX IF NOT EXISTS idx_overhead_periods_due
    ON overhead_expense_periods(due_date) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_overhead_periods_expense
    ON overhead_expense_periods(expense_id);
```

**`UNIQUE (expense_id, period_start)` is what makes lazy generation safe** under concurrent
requests — a second generator inserting the same period is a no-op, not a duplicate.

`accrual_month` is written by the generator as `date_trunc('month', period_start)::date`.
A `GENERATED ALWAYS AS (...) STORED` column would also work and should be preferred if
Postgres accepts the expression as immutable — **verify at migration time**; if it is
rejected, the plain column above stands with no other design change.

`ON DELETE RESTRICT` (not CASCADE) on `expense_id`: deleting an expense must never silently
destroy the record that money was paid.

### 3.4 `overhead_expense_payments`

```sql
CREATE TABLE IF NOT EXISTS overhead_expense_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id   UUID NOT NULL REFERENCES overhead_expense_periods(id) ON DELETE RESTRICT,
    paid_on     DATE NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    method      VARCHAR(50),
    reference   VARCHAR(100),
    notes       TEXT,
    recorded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overhead_payments_period
    ON overhead_expense_payments(period_id);
```

Payments are rows rather than columns on the period, so partial payment works and §10's
payment history is simply the row list.

### 3.5 What is deliberately NOT a table

**§9's five statuses are three.** Only `scheduled | paid | cancelled` are stored. `due` and
`overdue` are **derived at read time** from `due_date` against today:

```
paid       status = 'paid'
cancelled  status = 'cancelled'
overdue    due_date <  today
due        due_date <= today + DUE_SOON_DAYS
scheduled  otherwise
```

`DUE_SOON_DAYS = 7`, a single exported constant in `src/lib/overheadSchedule.ts` — not a
literal scattered across queries and components. It is the only tunable in the status
derivation, and §20's "upcoming due expenses" alerting will reuse it in phase 2.

If they were stored, something would have to run nightly to flip them, and a missed run means
a dashboard that quietly lies. Derived, they are always correct with no scheduler — which
matters because this project has no working cron (Vercel Hobby; `/api/cron/*` requires an
external pinger).

**§22's rate history is not a fifth table.** The period snapshots already preserve what each
month cost. What is genuinely additional — effective date and reason-for-change — is written
to the existing `audit_logs` table as
`{ before, after, effective_from, reason }` in `metadata`, with
`entity_type = 'overhead_expense'`. This satisfies §22 and §27 together, and
`idx_audit_logs_entity` makes "show this expense's rate history" a single indexed query.

**"Today" is Manila, never UTC.** All date comparisons use
`(NOW() AT TIME ZONE 'Asia/Manila')::date`. Between 00:00 and 08:00 Manila the server's UTC
date is still the previous day, which would misreport due and overdue at the boundary. This
idiom is already used in 17 files in the codebase.

## 4. Generation engine

### 4.1 `src/lib/overheadSchedule.ts` — pure, no I/O

```
occurrencesBetween(def, from, through) -> [{ period_start, period_end, due_date }]
dueDateFor(period_start, due_day)      -> clamps day 31 to Feb 28/29 etc.
monthlyEquivalent(def)                 -> amount * occurrencesPerYear / 12
occurrencesPerYear(def)                -> 12 | 4 | 2 | 1 | 365 | 52 | custom
```

All recurrence complexity lives here as value-in/value-out functions. The hard cases —
`due_day: 31` in February, a monthly expense starting Jan 31, one-time expenses, custom
intervals — are defined here and tested here.

### 4.2 Materialisation

```
materialize(client, expenseId, horizon):
    SELECT ... FROM overhead_expenses WHERE id = $1 FOR UPDATE
    enumerate occurrences whose period_start is
        STRICTLY AFTER generated_through   (or FROM start_date if it is NULL)
        and NOT AFTER   LEAST(horizon, COALESCE(end_date, horizon))
    INSERT INTO overhead_expense_periods (...)
        ON CONFLICT (expense_id, period_start) DO NOTHING
    UPDATE overhead_expenses SET generated_through = <last period_start inserted>
```

`generated_through` holds the `period_start` of the last period already created, and
enumeration resumes **strictly after** it — never at it. Re-generating the boundary period
would be harmless (the unique constraint absorbs it) but would make the watermark meaningless
and hide an off-by-one in the schedule functions.

Transactional and idempotent. `ON CONFLICT DO NOTHING` means two concurrent dashboard loads
cannot double-generate; the row lock only avoids wasted work.

`ensureMaterialized(client, horizon)` wraps this across all active expenses
(`WHERE active AND (generated_through IS NULL OR generated_through < horizon)`) and is called
at the top of the dashboard, report and periods reads, and after any expense create or edit.
It no-ops on every request but the first of each month.

### 4.3 Horizon

**End of next month.** Nothing further is materialised. Forward-looking figures are computed
arithmetically from the definitions, never from generated rows:

- **Estimated annual overhead (§8)** = for each active definition,
  `occurrencesBetween(def, today, today + 1 year).length × amount`, summed.
  This satisfies §8's requirement that the annual figure come from real schedules rather than
  assuming monthly × 12.
- **Normalized monthly equivalent** = `monthlyEquivalent(def)` summed over active definitions.

So the forward view is arithmetic over ~20 rows, and materialisation only ever covers the
window the owner can act on. Nothing to backfill; nothing to clean up when a schedule changes.

### 4.4 Edit semantics

| Edit | Behaviour |
|---|---|
| Amount change | `UPDATE amount_due` on periods with `period_start >= effective_from` **that have no payments**. Earlier and paid periods untouched. One `audit_logs` row. |
| Schedule change (start date, frequency, interval) | Delete future periods that are unpaid and payment-free; reset `generated_through`; re-materialise. Paid periods survive as history even if they no longer fit the new schedule. |
| Pause | `active = false`. Generation stops; existing periods remain. |
| End | Set `end_date`. Periods beyond it are removed if unpaid and payment-free. |
| Reactivate | `active = true`; next read re-materialises from `generated_through`. |
| Payment recorded | Recompute: `SUM(payments) >= amount_due` → `status = 'paid'`; a lesser sum leaves `scheduled`, and the UI shows it as partial. |

## 5. Derived figures

| Figure | Computed as |
|---|---|
| Month overhead (§7, §13) | `SUM(amount_due)` where `accrual_month = month AND status <> 'cancelled'` |
| Paid / unpaid / overdue (§12) | Cash layer: joined `SUM(payments)` against `amount_due`, with overdue by `due_date` |
| Year to date (§12) | Same accrual sum over `accrual_month` within the calendar year |
| Estimated annual (§8) | §4.3 — occurrence count from real schedules × amount |
| Trend series (§12) | 12 points, each carrying **both** `accrued` (point-in-time) and `normalized` (monthly-equivalent) |
| Comparison (§21) | Month vs previous month, year vs previous year, category vs category — from the accrual sum, showing both amounts and their difference |

**Which series feeds which figure** — these are not interchangeable, and conflating them is the
single most likely way for this module to report a number that is technically correct and
practically misleading:

| Consumer | Series | Why |
|---|---|---|
| §21 comparison ("August ₱20,800 vs July ₱19,500") | **Accrued** | The owner is comparing what each month actually cost. Showing a smoothed figure here would contradict the expense list on the same screen. |
| §13 monthly report and category breakdown | **Accrued** | Same reason — it must reconcile line by line with the periods it lists. |
| Trend chart | **Both**, accrued as bars, normalized as a line | The spike is real and worth seeing; the line is what the eye should follow. |
| §14 percentage-change alerting (phase 2) | **Normalized** | A ₱6,000 quarterly bill accruing wholly to one month would otherwise fire a false ~300% increase every quarter. |
| Forecasting and per-night figures (phase 2) | **Normalized** | A price floor must not swing by quarter. |

## 6. Backend surface

### 6.1 Guard

`requireOwner()` added to [`src/backend/utils/requireAdmin.ts`](../../../src/backend/utils/requireAdmin.ts),
sharing the existing `requireRole()` internals with `OWNER_ROLES = new Set(["Owner"])`. The
route-inventory comment block at the top of that file is updated with the new routes.

### 6.2 Controllers

Three focused files, none expected to exceed ~400 lines:

| File | Owns |
|---|---|
| `src/backend/controller/overheadController.ts` | expenses + categories CRUD, edit semantics, audit writes |
| `src/backend/controller/overheadPeriodsController.ts` | materialisation, period queries, payments |
| `src/backend/controller/overheadReportsController.ts` | dashboard + monthly report aggregation |

### 6.3 Routes

All under `/api/admin/overhead/`, all thin handlers behind `requireOwner()`, matching the
pattern in `src/app/api/admin/analytics/summary/route.ts`.

```
categories/             GET POST
categories/[id]/        PUT DELETE      409 if the category is in use
expenses/               GET POST        filters: active, category, search
expenses/[id]/          GET PUT DELETE  GET returns definition + periods + rate history
                                        PUT carries effective_from for amount changes
                                        409 DELETE if any payment exists
periods/                GET             working queue: ?month= &status=
periods/[id]/           PATCH           cancel one occurrence
periods/[id]/payments/  GET POST        record a payment / list history
dashboard/              GET ?month=     whole §12 payload in one round trip
report/                 GET ?month=     §13 breakdown + §21 comparison
```

Deliberately omitted: separate pause/resume/end endpoints (that is `PUT` setting `active` or
`end_date`), and bulk operations.

### 6.4 Dashboard payload

```jsonc
{
  "month": "2026-08",
  "accrued_total": 20800,
  "previous_month_total": 19500,
  "ytd_total": 158400,
  "estimated_annual": 249600,   // from schedules, not x12
  "paid": 17300,
  "unpaid": 3500,
  "overdue": 1000,
  "by_category": [{ "name": "Property", "amount": 17500 }],
  "trend": [{ "month": "2026-08", "accrued": 20800, "normalized": 20800 }]
}
```

### 6.5 Validation (§25) and errors

Explicit checks in the controller (the project uses no zod/yup):
amount > 0; category exists and is active; frequency valid; `end_date >= start_date`;
custom frequency requires both interval fields; `start_date` parseable.

A same-name-same-category duplicate returns a **warning the UI can confirm past**, not a hard
block — §25 says "warned against", not "prevented".

| Code | Case |
|---|---|
| 400 | validation failure |
| 403 | non-Owner session |
| 404 | unknown id |
| 409 | delete would destroy history (paid expense, category in use) |

Payment recording and amount changes write their data and their audit row inside a single
transaction, matching the savepoint-wrapped pattern already used in `bookingController.ts`.

## 7. Frontend

### 7.1 Placement

Finance gains a fourth tab. Extend the `financeTab` union at
[`page.tsx:155`](../../../src/app/admin/owners/page.tsx#L155) and the tabBar at
[`page.tsx:1905`](../../../src/app/admin/owners/page.tsx#L1905), rendering one
`<OverheadSection />`. The tab is **hidden for non-Owner sessions**, so access control is
visible in the nav rather than only as a 403 after a click. Total diff to `page.tsx`: ~4 lines.

### 7.2 Components

New directory `src/components/admin/owners/overhead/` — not added to `OwnerModules.tsx`, which
is already 1,466 lines:

```
OverheadSection.tsx     sub-tab shell: Dashboard | Expenses | Payments
OverheadDashboard.tsx   §12 KPI grid, category breakdown, 12-month trend
ExpenseList.tsx         definitions: name, category, amount, frequency, next due
ExpenseFormModal.tsx    create/edit, including the effective-from field
ExpenseDetail.tsx       periods, rate history, audit trail for one expense
PeriodQueue.tsx         this month's occurrences; due/overdue/paid; mark paid
PaymentModal.tsx        record a payment against a period
```

### 7.3 Visual language

Inherited, not invented: flat bordered cells (`#ece5d4` on `#fff`), the 1px-gap KPI grid the
Overview dashboard already uses, Instrument Serif headings, Geist Mono for every figure,
`#B07848` on `#F7F0E3` for actions. The Overview month navigator is reused for choosing the
report month.

**One rule that is §17 expressed as pixels:** when phase 2 adds per-night and allocation
figures, they render in a visually distinct "analysis" block — never in a table column that
sums alongside actual expenses.

### 7.4 State

`src/redux/api/overheadApi.ts`, registered in `src/redux/store.ts` alongside the existing
slices. Tags: `OverheadExpense`, `OverheadPeriod`, `OverheadCategory`, `OverheadDashboard`.
Recording a payment invalidates `OverheadPeriod` and `OverheadDashboard`.

## 8. Testing

**vitest is added to the project** (dev dependency + `test` script) — there is currently no
test framework at all. It targets `src/lib/overheadSchedule.ts` only: ~150 lines of date
arithmetic where an off-by-one silently corrupts financial reporting for months before anyone
notices. Controllers and UI are verified by `npm run build`, `npm run lint`, and manual
exercise, consistent with the rest of the repo.

Cases the suite must cover:

- monthly with `due_day: 31` → Feb 28 (2027) and Feb 29 (2028)
- monthly starting Jan 31 → February's period start
- quarterly, semiannual, annual occurrence boundaries
- one-time generates exactly one period
- custom every-N-days and every-N-months
- `end_date` truncates mid-schedule
- `monthlyEquivalent` for every frequency
- idempotency: enumerating the same window twice yields identical periods

## 9. Build order

Each step verifiable before the next:

1. Migration + category seed, wired into `db:setup`; applied manually to Supabase per
   [`agent_docs/backend-notes.md`](../../../agent_docs/backend-notes.md)
2. `overheadSchedule.ts` — **tests first**, then implementation
3. Materialisation + periods controller
4. `requireOwner()` + expenses/categories controllers + routes
5. Reports controller (dashboard, monthly report)
6. RTK slice + store registration
7. UI in dependency order: expense list → form → period queue → payment → dashboard last
8. Audit writes, validation, duplicate warning
9. `npm run build` and `npm run lint` clean

Steps 1–2 are where a mistake is expensive and invisible; 6–7 are where it is obvious
immediately.

## 10. Known risks

| Risk | Mitigation |
|---|---|
| `GENERATED ALWAYS AS ... STORED` may be rejected for `accrual_month` | Verify at migration time; plain column written by the generator is the fallback, no design change |
| Migrations are not applied by Vercel | Documented step 1; must be run manually against Supabase |
| Lint baseline is already ~95 pre-existing errors | New code must not add to it; verified by comparing counts before and after |
| Deferred analytics may want data this schema lacks | Phase 2 needs read queries only; periods carry amount, dates and category, which is the full input set for allocation |

## 11. Success criteria (§29, this phase)

- Record all major recurring overhead expenses ✔
- See total monthly overhead ✔
- See total annual overhead ✔ (from real schedules)
- Track upcoming and overdue expenses ✔
- Track historical changes ✔
- Overhead per available night — *phase 2*
- Allocated overhead to profitability — *phase 2*
- Overhead information to AI pricing — *phase 2*
