# Overhead Expense Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the D'Lux Homes owner record recurring overhead expenses, track what is due and paid, and see monthly/annual overhead totals on a dashboard.

**Architecture:** Recurring expenses are stored as a *definition* (`overhead_expenses`) plus generated *occurrences* (`overhead_expense_periods`) that snapshot the amount at generation time. Occurrences are materialised lazily on read (no cron exists on this deploy), made safe by a unique constraint. `due`/`overdue` are derived at read time, never stored.

**Tech Stack:** Next.js 16 App Router, TypeScript, raw `pg` SQL (no ORM), RTK Query, Tailwind v4 + inline styles, vitest (added by this plan).

**Spec:** [`docs/superpowers/specs/2026-08-23-overhead-expense-management-design.md`](../specs/2026-08-23-overhead-expense-management-design.md)

## Global Constraints

- **Git is manual.** The user stages and commits. No task commits, pushes, or creates branches. Each task ends by reporting what changed.
- **`npm run build` must pass** before any task is considered done. Vercel fails the deploy on any TS or lint error.
- **Lint baseline is 95 pre-existing errors / 57 warnings.** New code must not raise those counts. Verify with `npm run lint 2>&1 | tail -3`.
- **Currency is PHP only.** No currency column, no multi-currency handling anywhere.
- **Owner-only.** Every overhead route uses `requireOwner()`. The Finance tab is hidden for non-Owner sessions.
- **"Today" is Manila, never UTC.** All SQL date comparisons use `(NOW() AT TIME ZONE 'Asia/Manila')::date`.
- **Reporting basis is accrual.** A month's overhead is what is *due for* that month, paid or not.
- **Never destroy financial history.** Deleting an expense or period with any payment attached returns 409.
- **Naming:** tables `overhead_*`, controllers `overhead*Controller.ts`, RTK slice `overheadApi`, route base `/api/admin/overhead/`.
- **No new npm dependencies** other than `vitest` (dev).

---

### Task 1: Database schema and category seed

**Files:**
- Create: `src/backend/migrations/2026-08-23-create-overhead-expenses.sql`
- Create: `scripts/check-overhead-schema.mjs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: tables `overhead_categories`, `overhead_expenses`, `overhead_expense_periods`, `overhead_expense_payments`; six seeded category rows

- [ ] **Step 1: Write the migration**

Create `src/backend/migrations/2026-08-23-create-overhead-expenses.sql`:

```sql
-- Overhead Expense Management (phase 1).
--
-- Two-level model: overhead_expenses holds the recurring DEFINITION;
-- overhead_expense_periods holds each generated OCCURRENCE with the amount
-- SNAPSHOTTED at generation time. The snapshot is what lets a rate change
-- (Internet 1,500 -> 1,700) leave last month's history untouched.
--
-- Statuses here are only scheduled/paid/cancelled. 'due' and 'overdue' are
-- derived at read time from due_date, so no nightly job is needed to flip them
-- (this deploy has no working cron).

CREATE TABLE IF NOT EXISTS overhead_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overhead_expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(150) NOT NULL,
    category_id       UUID NOT NULL REFERENCES overhead_categories(id) ON DELETE RESTRICT,
    description       TEXT,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    frequency         VARCHAR(20) NOT NULL CHECK (frequency IN
                        ('one-time','daily','weekly','monthly',
                         'quarterly','semiannual','annual','custom')),
    interval_count    INT CHECK (interval_count > 0),
    interval_unit     VARCHAR(10) CHECK (interval_unit IN ('day','week','month')),
    start_date        DATE NOT NULL,
    end_date          DATE,
    due_day           INT CHECK (due_day BETWEEN 1 AND 31),
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    notes             TEXT,
    generated_through DATE,
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

CREATE TABLE IF NOT EXISTS overhead_expense_periods (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID NOT NULL REFERENCES overhead_expenses(id) ON DELETE RESTRICT,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    due_date      DATE NOT NULL,
    amount_due    NUMERIC(12,2) NOT NULL CHECK (amount_due > 0),
    status        VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','paid','cancelled')),
    accrual_month DATE NOT NULL,
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

-- Six top-level groups from the module doc. The doc's sub-bullets
-- ("Internet", "Cloud services") are expense NAMES, not categories.
INSERT INTO overhead_categories (name, sort_order) VALUES
    ('Property', 1),
    ('Utilities', 2),
    ('Software & Technology', 3),
    ('Maintenance', 4),
    ('Administrative', 5),
    ('Other', 6)
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:setup`

Expected: the summary lists `2026-08-23-create-overhead-expenses.sql` with a ✓. The runner continues on error and prints a per-file result, so read the summary rather than assuming success from a zero exit code.

- [ ] **Step 3: Write the schema verification script**

Create `scripts/check-overhead-schema.mjs`:

```js
// Verifies the overhead tables, constraints and seed rows landed.
// Usage: node --env-file=.env scripts/check-overhead-schema.mjs
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const TABLES = [
  'overhead_categories',
  'overhead_expenses',
  'overhead_expense_periods',
  'overhead_expense_payments',
];

let ok = true;

for (const t of TABLES) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [t]
  );
  const found = r.rows.length > 0;
  if (!found) ok = false;
  console.log(`${found ? '✓' : '✗'} table ${t}`);
}

const cats = await client.query(
  `SELECT name FROM overhead_categories ORDER BY sort_order`
);
console.log(`${cats.rows.length === 6 ? '✓' : '✗'} categories seeded: ` +
  cats.rows.map((r) => r.name).join(', '));
if (cats.rows.length !== 6) ok = false;

const uniq = await client.query(
  `SELECT 1 FROM pg_constraint WHERE conname = 'overhead_periods_unique'`
);
console.log(`${uniq.rows.length ? '✓' : '✗'} unique (expense_id, period_start)`);
if (!uniq.rows.length) ok = false;

await client.end();
console.log(ok ? '\nAll checks passed.' : '\nFAILED — see ✗ above.');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 4: Run the verification script**

Run: `node --env-file=.env scripts/check-overhead-schema.mjs`
Expected: every line ✓, `categories seeded: Property, Utilities, Software & Technology, Maintenance, Administrative, Other`, exit 0.

- [ ] **Step 5: Report**

Report the ✓/✗ summary. Do not commit — the user handles git.

---

### Task 2: Schedule module (pure date math) with vitest

**Files:**
- Create: `src/lib/overheadSchedule.ts`
- Create: `src/lib/overheadSchedule.test.ts`
- Modify: `package.json` (add `vitest` devDependency and `test` script)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `DUE_SOON_DAYS: number` (= 7)
  - `type Frequency = 'one-time'|'daily'|'weekly'|'monthly'|'quarterly'|'semiannual'|'annual'|'custom'`
  - `type IntervalUnit = 'day'|'week'|'month'`
  - `interface ScheduleDef { frequency; start_date; end_date?; due_day?; interval_count?; interval_unit? }`
  - `interface Occurrence { period_start: string; period_end: string; due_date: string }`
  - `occurrencesBetween(def: ScheduleDef, from: string, through: string): Occurrence[]`
  - `dueDateFor(periodStart: string, dueDay: number | null | undefined, frequency: Frequency): string`
  - `occurrencesPerYear(def: ScheduleDef): number`
  - `monthlyEquivalent(def: ScheduleDef, amount: number): number`
  - All dates are `'YYYY-MM-DD'` strings. No `Date` objects cross the boundary.

- [ ] **Step 1: Install vitest and add the script**

Run: `npm install --save-dev vitest`

Then add to `package.json` scripts (keep the existing four):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Write the failing test file**

Create `src/lib/overheadSchedule.test.ts`. Import relatively (not via `@/`) so no tsconfig-paths plugin is needed:

```ts
import { describe, it, expect } from "vitest";
import {
  occurrencesBetween,
  dueDateFor,
  occurrencesPerYear,
  monthlyEquivalent,
  DUE_SOON_DAYS,
  type ScheduleDef,
} from "./overheadSchedule";

const monthly: ScheduleDef = {
  frequency: "monthly",
  start_date: "2026-01-15",
  due_day: 15,
};

describe("dueDateFor", () => {
  it("uses the due day inside the period's month", () => {
    expect(dueDateFor("2026-03-01", 15, "monthly")).toBe("2026-03-15");
  });

  it("clamps day 31 to the last day of a short month", () => {
    expect(dueDateFor("2026-02-01", 31, "monthly")).toBe("2026-02-28");
    expect(dueDateFor("2028-02-01", 31, "monthly")).toBe("2028-02-29");
    expect(dueDateFor("2026-04-01", 31, "monthly")).toBe("2026-04-30");
  });

  it("falls back to the period start when no due day is set", () => {
    expect(dueDateFor("2026-03-09", null, "monthly")).toBe("2026-03-09");
  });

  it("ignores due_day for day- and week-based frequencies", () => {
    expect(dueDateFor("2026-03-09", 15, "weekly")).toBe("2026-03-09");
    expect(dueDateFor("2026-03-09", 15, "daily")).toBe("2026-03-09");
  });
});

describe("occurrencesBetween — monthly", () => {
  it("generates one occurrence per month within the window", () => {
    const out = occurrencesBetween(monthly, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("ends each period the day before the next starts", () => {
    const out = occurrencesBetween(monthly, "2026-01-01", "2026-02-28");
    expect(out[0].period_end).toBe("2026-02-14");
  });

  it("clamps a month-end start date in short months", () => {
    const jan31: ScheduleDef = { frequency: "monthly", start_date: "2026-01-31" };
    const out = occurrencesBetween(jan31, "2026-01-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("excludes occurrences before the window", () => {
    const out = occurrencesBetween(monthly, "2026-03-01", "2026-04-30");
    expect(out.map((o) => o.period_start)).toEqual(["2026-03-15", "2026-04-15"]);
  });

  it("stops at end_date", () => {
    const ending: ScheduleDef = { ...monthly, end_date: "2026-03-20" };
    const out = occurrencesBetween(ending, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });

  it("is deterministic — the same window twice yields identical output", () => {
    const a = occurrencesBetween(monthly, "2026-01-01", "2026-06-30");
    const b = occurrencesBetween(monthly, "2026-01-01", "2026-06-30");
    expect(a).toEqual(b);
  });
});

describe("occurrencesBetween — other frequencies", () => {
  it("quarterly steps three months", () => {
    const def: ScheduleDef = { frequency: "quarterly", start_date: "2026-01-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01",
    ]);
  });

  it("semiannual steps six months", () => {
    const def: ScheduleDef = { frequency: "semiannual", start_date: "2026-02-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out.map((o) => o.period_start)).toEqual(["2026-02-01", "2026-08-01"]);
  });

  it("annual yields one per year", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-03-01" };
    const out = occurrencesBetween(def, "2026-01-01", "2028-12-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-03-01", "2027-03-01", "2028-03-01",
    ]);
  });

  it("weekly steps seven days across a month boundary", () => {
    const def: ScheduleDef = { frequency: "weekly", start_date: "2026-01-29" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-02-20");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-29", "2026-02-05", "2026-02-12", "2026-02-19",
    ]);
  });

  it("daily steps one day across a leap day", () => {
    const def: ScheduleDef = { frequency: "daily", start_date: "2028-02-27" };
    const out = occurrencesBetween(def, "2028-02-27", "2028-03-01");
    expect(out.map((o) => o.period_start)).toEqual([
      "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01",
    ]);
  });

  it("one-time yields exactly one occurrence ending on its start", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2026-05-04" };
    const out = occurrencesBetween(def, "2026-01-01", "2026-12-31");
    expect(out).toHaveLength(1);
    expect(out[0].period_start).toBe("2026-05-04");
    expect(out[0].period_end).toBe("2026-05-04");
  });

  it("one-time outside the window yields nothing", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2025-05-04" };
    expect(occurrencesBetween(def, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("custom every 10 days", () => {
    const def: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-01",
      interval_count: 10, interval_unit: "day",
    };
    const out = occurrencesBetween(def, "2026-01-01", "2026-02-01");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-01", "2026-01-11", "2026-01-21", "2026-01-31",
    ]);
  });

  it("custom every 2 months", () => {
    const def: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-15",
      interval_count: 2, interval_unit: "month",
    };
    const out = occurrencesBetween(def, "2026-01-01", "2026-07-31");
    expect(out.map((o) => o.period_start)).toEqual([
      "2026-01-15", "2026-03-15", "2026-05-15", "2026-07-15",
    ]);
  });
});

describe("occurrencesPerYear and monthlyEquivalent", () => {
  it("maps each fixed frequency", () => {
    const at = (f: ScheduleDef["frequency"]) =>
      occurrencesPerYear({ frequency: f, start_date: "2026-01-01" });
    expect(at("daily")).toBe(365);
    expect(at("weekly")).toBe(52);
    expect(at("monthly")).toBe(12);
    expect(at("quarterly")).toBe(4);
    expect(at("semiannual")).toBe(2);
    expect(at("annual")).toBe(1);
  });

  it("treats one-time as non-recurring", () => {
    const def: ScheduleDef = { frequency: "one-time", start_date: "2026-01-01" };
    expect(occurrencesPerYear(def)).toBe(0);
    expect(monthlyEquivalent(def, 6000)).toBe(0);
  });

  it("smooths a quarterly bill into a monthly figure", () => {
    const def: ScheduleDef = { frequency: "quarterly", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 6000)).toBe(2000);
  });

  it("smooths an annual bill into a monthly figure", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 6000)).toBe(500);
  });

  it("computes custom intervals", () => {
    const everyTwoMonths: ScheduleDef = {
      frequency: "custom", start_date: "2026-01-01",
      interval_count: 2, interval_unit: "month",
    };
    expect(occurrencesPerYear(everyTwoMonths)).toBe(6);
    expect(monthlyEquivalent(everyTwoMonths, 1000)).toBe(500);
  });

  it("rounds to two decimals", () => {
    const def: ScheduleDef = { frequency: "annual", start_date: "2026-01-01" };
    expect(monthlyEquivalent(def, 1000)).toBe(83.33);
  });
});

describe("DUE_SOON_DAYS", () => {
  it("is the single tunable for the due-soon window", () => {
    expect(DUE_SOON_DAYS).toBe(7);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./overheadSchedule"`.

- [ ] **Step 4: Implement the module**

Create `src/lib/overheadSchedule.ts`:

```ts
// Pure date arithmetic for recurring overhead expenses.
//
// Everything here is value-in / value-out on 'YYYY-MM-DD' strings — no Date
// objects cross the boundary, no timezone can leak in, and the whole module is
// unit-testable without a database. Dates are manipulated through Date.UTC so
// the host machine's timezone never shifts a day.

export const DUE_SOON_DAYS = 7;

export type Frequency =
  | "one-time" | "daily" | "weekly" | "monthly"
  | "quarterly" | "semiannual" | "annual" | "custom";

export type IntervalUnit = "day" | "week" | "month";

export interface ScheduleDef {
  frequency: Frequency;
  start_date: string;
  end_date?: string | null;
  due_day?: number | null;
  interval_count?: number | null;
  interval_unit?: IntervalUnit | null;
}

export interface Occurrence {
  period_start: string;
  period_end: string;
  due_date: string;
}

// Months a frequency advances by. Absent = not month-based.
const MONTH_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
};

const DAY_STEP: Partial<Record<Frequency, number>> = {
  daily: 1, weekly: 7,
};

const PER_YEAR: Partial<Record<Frequency, number>> = {
  daily: 365, weekly: 52, monthly: 12,
  quarterly: 4, semiannual: 2, annual: 1, "one-time": 0,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month is the last day of this one. m is 1-based.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Adds months, clamping the day to the target month's length so Jan 31 + 1
// month is Feb 28 (or Feb 29), not Mar 3.
export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  const total = (y * 12) + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

function isMonthBased(def: ScheduleDef): boolean {
  return def.frequency in MONTH_STEP
    || (def.frequency === "custom" && def.interval_unit === "month");
}

export function dueDateFor(
  periodStart: string,
  dueDay: number | null | undefined,
  frequency: Frequency,
): string {
  const monthBased = frequency in MONTH_STEP;
  if (!dueDay || !monthBased) return periodStart;
  const { y, m } = parse(periodStart);
  return fmt(y, m, Math.min(dueDay, daysInMonth(y, m)));
}

// Advances one step from `iso` per the definition's frequency.
function step(def: ScheduleDef, iso: string): string {
  const months = MONTH_STEP[def.frequency];
  if (months) return addMonths(iso, months);

  const days = DAY_STEP[def.frequency];
  if (days) return addDays(iso, days);

  if (def.frequency === "custom") {
    const n = def.interval_count ?? 1;
    if (def.interval_unit === "month") return addMonths(iso, n);
    if (def.interval_unit === "week") return addDays(iso, n * 7);
    return addDays(iso, n);
  }

  // one-time: no next occurrence. Caller must stop after the first.
  return iso;
}

/**
 * Occurrences whose period_start falls within [from, through], bounded by the
 * definition's own start_date and end_date.
 *
 * period_end is the day before the next occurrence begins (for a one-time
 * expense it equals period_start).
 */
export function occurrencesBetween(
  def: ScheduleDef,
  from: string,
  through: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  const limit = def.end_date && def.end_date < through ? def.end_date : through;

  if (def.frequency === "one-time") {
    const s = def.start_date;
    if (s >= from && s <= limit) {
      out.push({
        period_start: s,
        period_end: s,
        due_date: dueDateFor(s, def.due_day, def.frequency),
      });
    }
    return out;
  }

  // Guard against a malformed custom definition spinning forever.
  const MAX_ITERATIONS = 10_000;
  let cursor = def.start_date;

  for (let i = 0; i < MAX_ITERATIONS && cursor <= limit; i++) {
    const next = step(def, cursor);
    if (next === cursor) break; // no progress — malformed definition
    if (cursor >= from) {
      out.push({
        period_start: cursor,
        period_end: addDays(next, -1),
        due_date: dueDateFor(cursor, def.due_day, def.frequency),
      });
    }
    cursor = next;
  }

  return out;
}

export function occurrencesPerYear(def: ScheduleDef): number {
  const fixed = PER_YEAR[def.frequency];
  if (fixed !== undefined) return fixed;

  // custom
  const n = def.interval_count ?? 1;
  if (def.interval_unit === "month") return 12 / n;
  if (def.interval_unit === "week") return 52 / n;
  return 365 / n;
}

/** Amount smoothed to a per-month figure. One-time expenses smooth to 0. */
export function monthlyEquivalent(def: ScheduleDef, amount: number): number {
  const perYear = occurrencesPerYear(def);
  if (!perYear) return 0;
  return Math.round(((amount * perYear) / 12) * 100) / 100;
}

/** First day of the month a period accrues to, as 'YYYY-MM-01'. */
export function accrualMonthOf(periodStart: string): string {
  const { y, m } = parse(periodStart);
  return fmt(y, m, 1);
}

/** True when the definition bills on month boundaries (used by callers). */
export function monthBased(def: ScheduleDef): boolean {
  return isMonthBased(def);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests green. If `occurrencesBetween` for `weekly` shows an off-by-one at the window edge, check that the `cursor >= from` filter runs *before* the cursor advances — not after.

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: success. The test file is inside `src/`, and tsconfig includes `**/*.ts`, so it is typechecked; `vitest` is a devDependency and resolves during the Vercel build too. If the build complains about the test import, add `"**/*.test.ts"` to the tsconfig `exclude` array rather than moving the file.

- [ ] **Step 7: Report**

Report the vitest summary (test count) and build result. Do not commit.

---

### Task 3: Owner guard and audit plumbing

**Files:**
- Modify: `src/backend/utils/requireAdmin.ts`
- Modify: `src/backend/utils/auditLog.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `requireOwner(): Promise<GuardResult>` — same `GuardResult` shape as `requireAdmin`
  - `logAudit(entry: AuditEntry, client?: PoolClient): Promise<void>` — optional transaction client
  - `AuditEntry.entity_type` accepts `"overhead_expense"` and `"overhead_period"`

- [ ] **Step 1: Add the Owner guard**

In `src/backend/utils/requireAdmin.ts`, beside the existing `ADMIN_ROLES` / `EMPLOYEE_ROLES` sets, add:

```ts
const OWNER_ROLES = new Set(["Owner"]);
```

And export, next to the existing `requireAdmin` / `requireEmployee` exports:

```ts
/**
 * Owner-only guard. Used by /api/admin/overhead/** — overhead records carry
 * rent, dues and margin figures that CSR accounts must not see.
 */
export async function requireOwner(): Promise<GuardResult> {
  return requireRole(OWNER_ROLES);
}
```

- [ ] **Step 2: Document the new routes in the file's route inventory**

The comment block at the top of `requireAdmin.ts` lists which routes use which guard. Add, after the `requireEmployee()` list:

```
// Routes that use requireOwner() instead (Owner only):
//   - /api/admin/overhead/**   (financial: rent, dues, margins)
```

- [ ] **Step 3: Widen the audit entity types and accept a transaction client**

In `src/backend/utils/auditLog.ts`, extend the `entity_type` union:

```ts
  entity_type: "haven" | "partner" | "payout" | "amenity_verification"
    | "booking" | "ical_feed" | "overhead_expense" | "overhead_period";
```

Then let callers pass a transaction client so a financial audit row commits or rolls back with the change it describes. Change the signature and the query target:

```ts
import type { PoolClient } from "pg";

/**
 * Append-only logger. Failures are swallowed (audit logging must never block
 * the business action). Call after the write succeeds.
 *
 * Pass `client` to write inside an open transaction — used by the overhead
 * module so a rate change and its audit row commit together. Without it the
 * row is written on the shared pool, best-effort, as every existing caller
 * expects.
 */
export async function logAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  try {
    const runner = client ?? pool;
    await runner.query(
      // ...unchanged INSERT and parameter array...
    );
  } catch (err) {
```

Leave the INSERT statement and parameter array exactly as they are. Every existing call site keeps working unchanged.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: success, no new type errors.

- [ ] **Step 5: Confirm the lint baseline did not move**

Run: `npm run lint 2>&1 | tail -3`
Expected: still `95 errors, 57 warnings` (or fewer). Any increase must be fixed before moving on.

- [ ] **Step 6: Report**

Report build and lint results. Do not commit.

---

### Task 4: Materialisation and period reads

**Files:**
- Create: `src/backend/controller/overheadPeriodsController.ts`
- Create: `src/app/api/admin/overhead/periods/route.ts`
- Create: `src/app/api/admin/overhead/periods/[id]/route.ts`
- Create: `scripts/check-overhead-materialize.mjs`

**Interfaces:**
- Consumes: `occurrencesBetween`, `accrualMonthOf`, `DUE_SOON_DAYS`, `type ScheduleDef` from `@/lib/overheadSchedule` (`dueDateFor` is applied inside `occurrencesBetween`, not called here); `requireOwner` from `@/backend/utils/requireAdmin`
- Produces:
  - `materializeExpense(client: PoolClient, expenseId: string, horizon: string): Promise<number>` — returns rows inserted
  - `ensureMaterialized(horizon?: string): Promise<void>`
  - `horizonDate(): string` — last day of next month, Manila
  - `getPeriods(req: NextRequest): Promise<NextResponse>`
  - `cancelPeriod(req: NextRequest, id: string): Promise<NextResponse>`
  - Period read rows carry a derived `display_status` of `paid | cancelled | overdue | due | scheduled` and an `amount_paid` total

- [ ] **Step 1: Write the controller**

Create `src/backend/controller/overheadPeriodsController.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "../config/db";
import {
  occurrencesBetween,
  accrualMonthOf,
  DUE_SOON_DAYS,
  type ScheduleDef,
} from "@/lib/overheadSchedule";

// Manila, not UTC: between 00:00 and 08:00 Manila the server's UTC date is
// still yesterday, which would misreport due and overdue at the boundary.
const TODAY_SQL = `(NOW() AT TIME ZONE 'Asia/Manila')::date`;

/** Last day of next month — how far ahead occurrences are materialised. */
export function horizonDate(): string {
  const now = new Date();
  // Day 0 of month+2 is the last day of month+1.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return end.toISOString().slice(0, 10);
}

interface ExpenseRow {
  id: string;
  amount: string;
  frequency: ScheduleDef["frequency"];
  interval_count: number | null;
  interval_unit: ScheduleDef["interval_unit"];
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  generated_through: string | null;
}

function toDef(row: ExpenseRow): ScheduleDef {
  return {
    frequency: row.frequency,
    start_date: String(row.start_date).slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    due_day: row.due_day,
    interval_count: row.interval_count,
    interval_unit: row.interval_unit,
  };
}

/**
 * Creates any missing periods for one expense up to `horizon`.
 *
 * Idempotent by construction: the UNIQUE (expense_id, period_start) constraint
 * turns a concurrent duplicate into a no-op via ON CONFLICT DO NOTHING, so two
 * simultaneous dashboard loads cannot double-generate. The row lock only avoids
 * the wasted work.
 *
 * Enumeration resumes STRICTLY AFTER generated_through. Re-generating the
 * boundary period would be absorbed by the constraint, but that would make the
 * watermark meaningless and hide an off-by-one in the schedule functions.
 */
export async function materializeExpense(
  client: PoolClient,
  expenseId: string,
  horizon: string,
): Promise<number> {
  const { rows } = await client.query<ExpenseRow>(
    `SELECT id, amount, frequency, interval_count, interval_unit,
            start_date, end_date, due_day, generated_through
       FROM overhead_expenses
      WHERE id = $1
      FOR UPDATE`,
    [expenseId],
  );
  const row = rows[0];
  if (!row) return 0;

  const def = toDef(row);
  const watermark = row.generated_through
    ? String(row.generated_through).slice(0, 10)
    : null;
  // Strictly after the watermark; from the definition's start when there is none.
  const from = watermark
    ? new Date(Date.UTC(
        Number(watermark.slice(0, 4)),
        Number(watermark.slice(5, 7)) - 1,
        Number(watermark.slice(8, 10)) + 1,
      )).toISOString().slice(0, 10)
    : def.start_date;

  if (from > horizon) return 0;

  const occurrences = occurrencesBetween(def, from, horizon);
  if (!occurrences.length) return 0;

  let inserted = 0;
  for (const o of occurrences) {
    const res = await client.query(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (expense_id, period_start) DO NOTHING`,
      [expenseId, o.period_start, o.period_end, o.due_date,
       row.amount, accrualMonthOf(o.period_start)],
    );
    inserted += res.rowCount ?? 0;
  }

  await client.query(
    `UPDATE overhead_expenses
        SET generated_through = $2, updated_at = NOW()
      WHERE id = $1`,
    [expenseId, occurrences[occurrences.length - 1].period_start],
  );

  return inserted;
}

/**
 * Brings every active expense up to the horizon. Called at the top of each
 * overhead read. No-ops on every request but the first of each month.
 */
export async function ensureMaterialized(horizon = horizonDate()): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM overhead_expenses
      WHERE active
        AND (generated_through IS NULL OR generated_through < $1)`,
    [horizon],
  );
  if (!rows.length) return;

  const client = await pool.connect();
  try {
    for (const r of rows) {
      await client.query("BEGIN");
      try {
        await materializeExpense(client, r.id, horizon);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[overhead] materialise failed for", r.id, err);
      }
    }
  } finally {
    client.release();
  }
}

// SELECT fragment shared by period reads. display_status is derived here rather
// than stored — 'due' and 'overdue' would otherwise need a nightly job to flip,
// and this deploy has no working cron.
const PERIOD_SELECT = `
  SELECT p.id, p.expense_id, p.period_start, p.period_end, p.due_date,
         p.amount_due, p.status, p.accrual_month,
         e.name AS expense_name,
         c.name AS category_name,
         COALESCE(pay.total, 0)::numeric AS amount_paid,
         CASE
           WHEN p.status = 'paid'      THEN 'paid'
           WHEN p.status = 'cancelled' THEN 'cancelled'
           WHEN p.due_date < ${TODAY_SQL} THEN 'overdue'
           WHEN p.due_date <= ${TODAY_SQL} + ${DUE_SOON_DAYS} THEN 'due'
           ELSE 'scheduled'
         END AS display_status
    FROM overhead_expense_periods p
    JOIN overhead_expenses e   ON e.id = p.expense_id
    JOIN overhead_categories c ON c.id = e.category_id
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS total
        FROM overhead_expense_payments
       WHERE period_id = p.id
    ) pay ON TRUE
`;

/** GET /api/admin/overhead/periods?month=YYYY-MM&status=due|overdue|paid|unpaid */
export async function getPeriods(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMaterialized();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const status = searchParams.get("status");

    const conditions: string[] = [];
    const values: string[] = [];

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { success: false, message: "month must be YYYY-MM" },
          { status: 400 },
        );
      }
      values.push(`${month}-01`);
      conditions.push(`p.accrual_month = $${values.length}::date`);
    }

    if (status === "paid")   conditions.push(`p.status = 'paid'`);
    if (status === "unpaid") conditions.push(`p.status = 'scheduled'`);
    if (status === "overdue") {
      conditions.push(`p.status = 'scheduled' AND p.due_date < ${TODAY_SQL}`);
    }
    if (status === "due") {
      conditions.push(
        `p.status = 'scheduled' AND p.due_date >= ${TODAY_SQL} ` +
        `AND p.due_date <= ${TODAY_SQL} + ${DUE_SOON_DAYS}`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `${PERIOD_SELECT} ${where} ORDER BY p.due_date ASC`,
      values,
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[overhead] getPeriods failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load overhead periods" },
      { status: 500 },
    );
  }
}

/** PATCH /api/admin/overhead/periods/[id] — cancel one occurrence. */
export async function cancelPeriod(
  req: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    const paid = await pool.query(
      `SELECT 1 FROM overhead_expense_payments WHERE period_id = $1 LIMIT 1`,
      [id],
    );
    if (paid.rows.length) {
      return NextResponse.json(
        { success: false, message: "This period has payments recorded and cannot be cancelled." },
        { status: 409 },
      );
    }

    const result = await pool.query(
      `UPDATE overhead_expense_periods
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status <> 'paid'
        RETURNING id`,
      [id],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Period not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[overhead] cancelPeriod failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to cancel period" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Write the route handlers**

Create `src/app/api/admin/overhead/periods/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPeriods } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getPeriods(request);
}
```

Create `src/app/api/admin/overhead/periods/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { cancelPeriod } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return cancelPeriod(request, id);
}
```

- [ ] **Step 3: Write the materialisation verification script**

Create `scripts/check-overhead-materialize.mjs`. It inserts a temporary monthly expense, materialises twice, and asserts the second run is a no-op:

```js
// Verifies lazy materialisation: correct period count, and idempotency.
// Usage: node --env-file=.env scripts/check-overhead-materialize.mjs
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cat = await client.query(
  `SELECT id FROM overhead_categories WHERE name = 'Utilities' LIMIT 1`
);

const exp = await client.query(
  `INSERT INTO overhead_expenses
     (name, category_id, amount, frequency, start_date, due_day)
   VALUES ('__materialise_probe', $1, 1500, 'monthly', '2026-01-15', 15)
   RETURNING id`,
  [cat.rows[0].id]
);
const id = exp.rows[0].id;

// Mirrors materializeExpense's INSERT for six months of 2026.
const starts = ['2026-01-15','2026-02-15','2026-03-15',
                '2026-04-15','2026-05-15','2026-06-15'];
for (const s of starts) {
  await client.query(
    `INSERT INTO overhead_expense_periods
       (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
     VALUES ($1, $2, $2, $2, 1500, date_trunc('month', $2::date)::date)
     ON CONFLICT (expense_id, period_start) DO NOTHING`,
    [id, s]
  );
}

const first = await client.query(
  `SELECT COUNT(*)::int AS n FROM overhead_expense_periods WHERE expense_id = $1`,
  [id]
);

// Second pass — every row should conflict and insert nothing.
let reinserted = 0;
for (const s of starts) {
  const r = await client.query(
    `INSERT INTO overhead_expense_periods
       (expense_id, period_start, period_end, due_date, amount_due, accrual_month)
     VALUES ($1, $2, $2, $2, 1500, date_trunc('month', $2::date)::date)
     ON CONFLICT (expense_id, period_start) DO NOTHING`,
    [id, s]
  );
  reinserted += r.rowCount;
}

console.log(`${first.rows[0].n === 6 ? '✓' : '✗'} generated 6 periods (got ${first.rows[0].n})`);
console.log(`${reinserted === 0 ? '✓' : '✗'} second pass inserted nothing (got ${reinserted})`);

// Clean up the probe.
await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
await client.query(`DELETE FROM overhead_expenses WHERE id = $1`, [id]);
await client.end();

const ok = first.rows[0].n === 6 && reinserted === 0;
console.log(ok ? '\nAll checks passed.' : '\nFAILED.');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 4: Run the verification script**

Run: `node --env-file=.env scripts/check-overhead-materialize.mjs`
Expected: both ✓, exit 0, and no `__materialise_probe` rows left behind.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged from baseline.

- [ ] **Step 6: Report**

Report the script output plus build/lint. Do not commit.

---

### Task 5: Categories CRUD

**Files:**
- Create: `src/backend/controller/overheadController.ts`
- Create: `src/app/api/admin/overhead/categories/route.ts`
- Create: `src/app/api/admin/overhead/categories/[id]/route.ts`

**Interfaces:**
- Consumes: `requireOwner`
- Produces (from `overheadController.ts`):
  - `getCategories(): Promise<NextResponse>` — takes no arguments; the route calls it bare
  - `createCategory(req: NextRequest): Promise<NextResponse>`
  - `updateCategory(req: NextRequest, id: string): Promise<NextResponse>`
  - `deleteCategory(req: NextRequest, id: string): Promise<NextResponse>` — 409 when in use

- [ ] **Step 1: Write the category handlers**

Create `src/backend/controller/overheadController.ts` with these four functions (expense CRUD is added to this same file in Task 6):

```ts
import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";

export async function getCategories(): Promise<NextResponse> {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.active,
              COUNT(e.id)::int AS expense_count
         FROM overhead_categories c
         LEFT JOIN overhead_expenses e ON e.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`,
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[overhead] getCategories failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load categories" },
      { status: 500 },
    );
  }
}

export async function createCategory(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Category name is required" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `INSERT INTO overhead_categories (name, sort_order)
       VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM overhead_categories), 1))
       ON CONFLICT (name) DO NOTHING
       RETURNING id, name, sort_order, active`,
      [name],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: `A category named "${name}" already exists.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[overhead] createCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to create category" },
      { status: 500 },
    );
  }
}

export async function updateCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = body.name === undefined ? null : String(body.name).trim();
    const active = body.active === undefined ? null : Boolean(body.active);

    if (name !== null && !name) {
      return NextResponse.json(
        { success: false, message: "Category name cannot be empty" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `UPDATE overhead_categories
          SET name = COALESCE($2, name),
              active = COALESCE($3, active),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, sort_order, active`,
      [id, name, active],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[overhead] updateCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update category" },
      { status: 500 },
    );
  }
}

export async function deleteCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const inUse = await pool.query(
      `SELECT COUNT(*)::int AS n FROM overhead_expenses WHERE category_id = $1`,
      [id],
    );
    if (inUse.rows[0].n > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `This category is used by ${inUse.rows[0].n} expense(s). ` +
                   `Deactivate it instead, or move those expenses first.`,
        },
        { status: 409 },
      );
    }

    const result = await pool.query(
      `DELETE FROM overhead_categories WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[overhead] deleteCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete category" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Write the routes**

Create `src/app/api/admin/overhead/categories/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCategories, createCategory } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getCategories();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createCategory(request);
}
```

Create `src/app/api/admin/overhead/categories/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { updateCategory, deleteCategory } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return updateCategory(request, id);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteCategory(request, id);
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 4: Manually exercise the endpoints**

Start `npm run dev`, sign in as Owner, then in the browser console on any admin page:

```js
await (await fetch('/api/admin/overhead/categories')).json()
```

Expected: `success: true` and the six seeded categories, each with `expense_count: 0`.

Then confirm the guard rejects a non-Owner: sign in as a CSR account and repeat. Expected: HTTP 403.

- [ ] **Step 5: Report**

Report both responses and the build/lint results. Do not commit.

---

### Task 6: Expenses CRUD with effective-dated amount changes

**Files:**
- Modify: `src/backend/controller/overheadController.ts` (append)
- Create: `src/app/api/admin/overhead/expenses/route.ts`
- Create: `src/app/api/admin/overhead/expenses/[id]/route.ts`

**Interfaces:**
- Consumes: `materializeExpense`, `horizonDate` from `overheadPeriodsController`; `logAudit`; `occurrencesBetween`
- Produces:
  - `getExpenses(req: NextRequest): Promise<NextResponse>`
  - `getExpense(req: NextRequest, id: string): Promise<NextResponse>` — definition + periods + rate history
  - `createExpense(req: NextRequest, actorEmail: string): Promise<NextResponse>`
  - `updateExpense(req: NextRequest, id: string, actorEmail: string): Promise<NextResponse>`
  - `deleteExpense(req: NextRequest, id: string): Promise<NextResponse>` — 409 when payments exist
  - Request body for create/update:
    `{ name, category_id, description?, amount, frequency, interval_count?, interval_unit?, start_date, end_date?, due_day?, active?, notes?, effective_from?, change_reason?, confirm_duplicate? }`

- [ ] **Step 1: Append the validation helper and create handler**

Add to `src/backend/controller/overheadController.ts`:

```ts
import type { PoolClient } from "pg";
import { logAudit } from "../utils/auditLog";
import { materializeExpense, horizonDate } from "./overheadPeriodsController";

const FREQUENCIES = new Set([
  "one-time", "daily", "weekly", "monthly",
  "quarterly", "semiannual", "annual", "custom",
]);

interface ExpenseInput {
  name: string;
  category_id: string;
  description: string | null;
  amount: number;
  frequency: string;
  interval_count: number | null;
  interval_unit: string | null;
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  notes: string | null;
}

/** Returns an error message, or null when the body is valid. */
function validateExpense(body: Record<string, unknown>): string | null {
  const name = String(body.name || "").trim();
  if (!name) return "Expense name is required.";
  if (!body.category_id) return "Please choose a category.";

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Amount must be greater than zero.";
  }

  const frequency = String(body.frequency || "");
  if (!FREQUENCIES.has(frequency)) return "Please choose how often this repeats.";

  if (frequency === "custom") {
    const n = Number(body.interval_count);
    if (!Number.isInteger(n) || n <= 0) {
      return "A custom schedule needs a repeat interval greater than zero.";
    }
    if (!["day", "week", "month"].includes(String(body.interval_unit))) {
      return "A custom schedule needs a repeat unit of day, week or month.";
    }
  }

  const start = String(body.start_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Start date is required.";

  const end = body.end_date ? String(body.end_date) : null;
  if (end && end < start) return "End date cannot be before the start date.";

  if (body.due_day !== undefined && body.due_day !== null) {
    const d = Number(body.due_day);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return "Payment due day must be between 1 and 31.";
    }
  }

  return null;
}

function readInput(body: Record<string, unknown>): ExpenseInput {
  return {
    name: String(body.name).trim(),
    category_id: String(body.category_id),
    description: body.description ? String(body.description) : null,
    amount: Number(body.amount),
    frequency: String(body.frequency),
    interval_count: body.interval_count == null ? null : Number(body.interval_count),
    interval_unit: body.interval_unit ? String(body.interval_unit) : null,
    start_date: String(body.start_date),
    end_date: body.end_date ? String(body.end_date) : null,
    due_day: body.due_day == null ? null : Number(body.due_day),
    notes: body.notes ? String(body.notes) : null,
  };
}

async function employeeIdFor(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM employees WHERE email = $1 LIMIT 1`, [email],
  );
  return r.rows[0]?.id ?? null;
}

export async function createExpense(
  req: NextRequest,
  actorEmail: string,
): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const body = await req.json();
    const error = validateExpense(body);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    const input = readInput(body);

    // Duplicate WARNING, not a block — the module doc asks for a warning.
    if (!body.confirm_duplicate) {
      const dupe = await client.query(
        `SELECT 1 FROM overhead_expenses
          WHERE LOWER(name) = LOWER($1) AND category_id = $2 LIMIT 1`,
        [input.name, input.category_id],
      );
      if (dupe.rows.length) {
        return NextResponse.json(
          {
            success: false,
            duplicate: true,
            message: `An expense named "${input.name}" already exists in this category. ` +
                     `Save it anyway?`,
          },
          { status: 409 },
        );
      }
    }

    const actorId = await employeeIdFor(actorEmail);

    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO overhead_expenses
         (name, category_id, description, amount, frequency, interval_count,
          interval_unit, start_date, end_date, due_day, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [input.name, input.category_id, input.description, input.amount,
       input.frequency, input.interval_count, input.interval_unit,
       input.start_date, input.end_date, input.due_day, input.notes, actorId],
    );
    const id = result.rows[0].id;

    await materializeExpense(client, id, horizonDate());

    await logAudit({
      action: "overhead_expense.created",
      entity_type: "overhead_expense",
      entity_id: id,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: { after: input },
    }, client);

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] createExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Append the list and detail handlers**

```ts
/** GET /api/admin/overhead/expenses?active=&category=&q= */
export async function getExpenses(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active");
    const category = searchParams.get("category");
    const q = searchParams.get("q");

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (active === "true")  conditions.push(`e.active`);
    if (active === "false") conditions.push(`NOT e.active`);
    if (category) {
      values.push(category);
      conditions.push(`e.category_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      conditions.push(`e.name ILIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT e.id, e.name, e.description, e.amount, e.frequency,
              e.interval_count, e.interval_unit, e.start_date, e.end_date,
              e.due_day, e.active, e.notes, e.category_id,
              c.name AS category_name,
              (SELECT MIN(p.due_date)
                 FROM overhead_expense_periods p
                WHERE p.expense_id = e.id
                  AND p.status = 'scheduled'
                  AND p.due_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date
              ) AS next_due_date
         FROM overhead_expenses e
         JOIN overhead_categories c ON c.id = e.category_id
         ${where}
        ORDER BY e.active DESC, c.sort_order, e.name`,
      values,
    );

    return NextResponse.json({
      success: true, data: result.rows, count: result.rows.length,
    });
  } catch (err) {
    console.error("[overhead] getExpenses failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load expenses" },
      { status: 500 },
    );
  }
}

/** GET /api/admin/overhead/expenses/[id] — definition, periods and rate history. */
export async function getExpense(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const expense = await pool.query(
      `SELECT e.*, c.name AS category_name
         FROM overhead_expenses e
         JOIN overhead_categories c ON c.id = e.category_id
        WHERE e.id = $1`,
      [id],
    );
    if (!expense.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }

    const periods = await pool.query(
      `SELECT p.id, p.period_start, p.period_end, p.due_date, p.amount_due,
              p.status, p.accrual_month,
              COALESCE((SELECT SUM(amount) FROM overhead_expense_payments
                         WHERE period_id = p.id), 0)::numeric AS amount_paid
         FROM overhead_expense_periods p
        WHERE p.expense_id = $1
        ORDER BY p.period_start DESC`,
      [id],
    );

    // Rate history lives in audit_logs — the period snapshots already record
    // what each month cost, so a separate history table would duplicate them.
    const history = await pool.query(
      `SELECT action, metadata, actor_email, created_at
         FROM audit_logs
        WHERE entity_type = 'overhead_expense' AND entity_id = $1
        ORDER BY created_at DESC`,
      [id],
    );

    return NextResponse.json({
      success: true,
      data: {
        expense: expense.rows[0],
        periods: periods.rows,
        history: history.rows,
      },
    });
  } catch (err) {
    console.error("[overhead] getExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the expense" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Append the update handler with effective-dated amount changes**

```ts
/**
 * PUT /api/admin/overhead/expenses/[id]
 *
 * An amount change is effective-dated: periods from `effective_from` forward
 * that have NO payments take the new amount; everything earlier, and anything
 * paid, is left exactly as it was. That is what keeps history honest when a
 * rate rises mid-year.
 *
 * A schedule change (start date, frequency, interval) drops future unpaid,
 * payment-free periods and re-materialises. Paid periods survive even if they
 * no longer fit the new schedule — they record what actually happened.
 */
export async function updateExpense(
  req: NextRequest,
  id: string,
  actorEmail: string,
): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const body = await req.json();
    const error = validateExpense(body);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    const input = readInput(body);

    const existing = await client.query(
      `SELECT * FROM overhead_expenses WHERE id = $1`, [id],
    );
    if (!existing.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }
    const before = existing.rows[0];

    const amountChanged = Number(before.amount) !== input.amount;
    const scheduleChanged =
      String(before.start_date).slice(0, 10) !== input.start_date ||
      before.frequency !== input.frequency ||
      Number(before.interval_count ?? 0) !== Number(input.interval_count ?? 0) ||
      (before.interval_unit ?? null) !== input.interval_unit ||
      Number(before.due_day ?? 0) !== Number(input.due_day ?? 0);

    // Default: the next unpaid period. Matches what the edit dialog pre-fills.
    const effectiveFrom = body.effective_from
      ? String(body.effective_from)
      : String(before.start_date).slice(0, 10);

    const actorId = await employeeIdFor(actorEmail);

    await client.query("BEGIN");

    await client.query(
      `UPDATE overhead_expenses
          SET name = $2, category_id = $3, description = $4, amount = $5,
              frequency = $6, interval_count = $7, interval_unit = $8,
              start_date = $9, end_date = $10, due_day = $11, notes = $12,
              active = COALESCE($13, active), updated_at = NOW()
        WHERE id = $1`,
      [id, input.name, input.category_id, input.description, input.amount,
       input.frequency, input.interval_count, input.interval_unit,
       input.start_date, input.end_date, input.due_day, input.notes,
       body.active === undefined ? null : Boolean(body.active)],
    );

    if (amountChanged) {
      await client.query(
        `UPDATE overhead_expense_periods p
            SET amount_due = $3, updated_at = NOW()
          WHERE p.expense_id = $1
            AND p.period_start >= $2::date
            AND p.status <> 'paid'
            AND NOT EXISTS (
              SELECT 1 FROM overhead_expense_payments
               WHERE period_id = p.id
            )`,
        [id, effectiveFrom, input.amount],
      );

      await logAudit({
        action: "overhead_expense.amount_changed",
        entity_type: "overhead_expense",
        entity_id: id,
        actor_type: "admin",
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: {
          before: Number(before.amount),
          after: input.amount,
          effective_from: effectiveFrom,
          reason: body.change_reason ? String(body.change_reason) : null,
        },
      }, client);
    }

    if (scheduleChanged) {
      await client.query(
        `DELETE FROM overhead_expense_periods p
          WHERE p.expense_id = $1
            AND p.status = 'scheduled'
            AND p.period_start >= (NOW() AT TIME ZONE 'Asia/Manila')::date
            AND NOT EXISTS (
              SELECT 1 FROM overhead_expense_payments WHERE period_id = p.id
            )`,
        [id],
      );
      await client.query(
        `UPDATE overhead_expenses
            SET generated_through = (
              SELECT MAX(period_start) FROM overhead_expense_periods
               WHERE expense_id = $1
            )
          WHERE id = $1`,
        [id],
      );
      await materializeExpense(client, id, horizonDate());

      await logAudit({
        action: "overhead_expense.schedule_changed",
        entity_type: "overhead_expense",
        entity_id: id,
        actor_type: "admin",
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: {
          before: {
            frequency: before.frequency,
            start_date: String(before.start_date).slice(0, 10),
            due_day: before.due_day,
          },
          after: {
            frequency: input.frequency,
            start_date: input.start_date,
            due_day: input.due_day,
          },
        },
      }, client);
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] updateExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/** DELETE — refused once any payment exists anywhere on this expense. */
export async function deleteExpense(req: NextRequest, id: string): Promise<NextResponse> {
  const client: PoolClient = await pool.connect();
  try {
    const paid = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM overhead_expense_payments pay
         JOIN overhead_expense_periods p ON p.id = pay.period_id
        WHERE p.expense_id = $1`,
      [id],
    );
    if (paid.rows[0].n > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `This expense has ${paid.rows[0].n} recorded payment(s). ` +
                   `Deleting it would erase that history — end or pause it instead.`,
        },
        { status: 409 },
      );
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
    const result = await client.query(
      `DELETE FROM overhead_expenses WHERE id = $1 RETURNING id`, [id],
    );
    await client.query("COMMIT");

    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Expense not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] deleteExpense failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Write the routes**

Create `src/app/api/admin/overhead/expenses/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getExpenses, createExpense } from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getExpenses(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createExpense(request, guard.session.user.email ?? "");
}
```

Create `src/app/api/admin/overhead/expenses/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  getExpense, updateExpense, deleteExpense,
} from "@/backend/controller/overheadController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return getExpense(request, id);
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return updateExpense(request, id, guard.session.user.email ?? "");
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteExpense(request, id);
}
```

- [ ] **Step 5: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 6: Manually exercise create and the rate change**

With `npm run dev` and an Owner session, in the browser console:

```js
const cats = (await (await fetch('/api/admin/overhead/categories')).json()).data;
const utilities = cats.find(c => c.name === 'Utilities').id;

// Create a monthly internet bill due the 15th, starting six months ago.
const created = await (await fetch('/api/admin/overhead/expenses', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Internet', category_id: utilities, amount: 1500,
    frequency: 'monthly', start_date: '2026-03-15', due_day: 15,
  }),
})).json();

// Raise the rate from September onward.
await (await fetch(`/api/admin/overhead/expenses/${created.data.id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Internet', category_id: utilities, amount: 1700,
    frequency: 'monthly', start_date: '2026-03-15', due_day: 15,
    effective_from: '2026-09-01', change_reason: 'Provider price increase',
  }),
})).json();

// Inspect: earlier periods must still read 1500.
(await (await fetch(`/api/admin/overhead/expenses/${created.data.id}`)).json()).data
```

Expected: periods with `period_start` before 2026-09-01 keep `amount_due: "1500.00"`; September onward reads `1700.00`; `history` contains one `overhead_expense.amount_changed` entry with `before: 1500`, `after: 1700`, `effective_from: "2026-09-01"`.

- [ ] **Step 7: Report**

Report the inspected period amounts and the audit entry. Do not commit.

---

### Task 7: Payment recording

**Files:**
- Modify: `src/backend/controller/overheadPeriodsController.ts` (append)
- Create: `src/app/api/admin/overhead/periods/[id]/payments/route.ts`

**Interfaces:**
- Consumes: `logAudit`
- Produces:
  - `getPayments(req: NextRequest, periodId: string): Promise<NextResponse>`
  - `recordPayment(req: NextRequest, periodId: string, actorEmail: string): Promise<NextResponse>`
  - Body: `{ paid_on, amount, method?, reference?, notes? }`
  - A period flips to `status = 'paid'` when `SUM(payments) >= amount_due`; a lesser sum leaves it `scheduled` and the response reports `amount_paid` so the UI can show it as partial.

- [ ] **Step 1: Append the payment handlers**

Add to `src/backend/controller/overheadPeriodsController.ts`:

```ts
import { logAudit } from "../utils/auditLog";

export async function getPayments(
  req: NextRequest,
  periodId: string,
): Promise<NextResponse> {
  try {
    const result = await pool.query(
      `SELECT pay.id, pay.paid_on, pay.amount, pay.method, pay.reference,
              pay.notes, pay.created_at,
              e.first_name || ' ' || e.last_name AS recorded_by_name
         FROM overhead_expense_payments pay
         LEFT JOIN employees e ON e.id = pay.recorded_by
        WHERE pay.period_id = $1
        ORDER BY pay.paid_on DESC, pay.created_at DESC`,
      [periodId],
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[overhead] getPayments failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load payments" },
      { status: 500 },
    );
  }
}

export async function recordPayment(
  req: NextRequest,
  periodId: string,
  actorEmail: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const body = await req.json();

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Payment amount must be greater than zero." },
        { status: 400 },
      );
    }
    const paidOn = String(body.paid_on || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      return NextResponse.json(
        { success: false, message: "Please give the date this was paid." },
        { status: 400 },
      );
    }

    const period = await client.query(
      `SELECT id, amount_due, status FROM overhead_expense_periods WHERE id = $1`,
      [periodId],
    );
    if (!period.rows.length) {
      return NextResponse.json(
        { success: false, message: "Period not found" },
        { status: 404 },
      );
    }
    if (period.rows[0].status === "cancelled") {
      return NextResponse.json(
        { success: false, message: "This period was cancelled — reinstate it before recording a payment." },
        { status: 409 },
      );
    }

    const actor = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`, [actorEmail],
    );
    const actorId = actor.rows[0]?.id ?? null;

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO overhead_expense_payments
         (period_id, paid_on, amount, method, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [periodId, paidOn, amount,
       body.method ? String(body.method) : null,
       body.reference ? String(body.reference) : null,
       body.notes ? String(body.notes) : null,
       actorId],
    );

    // Settled only once the payments cover the amount due — partial payments
    // leave the period scheduled so it keeps showing in the unpaid queue.
    const totals = await client.query<{ total: string; amount_due: string }>(
      `SELECT COALESCE(SUM(pay.amount), 0)::numeric AS total,
              p.amount_due
         FROM overhead_expense_periods p
         LEFT JOIN overhead_expense_payments pay ON pay.period_id = p.id
        WHERE p.id = $1
        GROUP BY p.amount_due`,
      [periodId],
    );
    const total = Number(totals.rows[0].total);
    const due = Number(totals.rows[0].amount_due);

    if (total >= due) {
      await client.query(
        `UPDATE overhead_expense_periods
            SET status = 'paid', updated_at = NOW()
          WHERE id = $1`,
        [periodId],
      );
    }

    await logAudit({
      action: "overhead_period.payment_recorded",
      entity_type: "overhead_period",
      entity_id: periodId,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: { amount, paid_on: paidOn, total_paid: total, amount_due: due },
    }, client);

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      data: { period_id: periodId, amount_paid: total, settled: total >= due },
    }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] recordPayment failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to record the payment" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Write the route**

Create `src/app/api/admin/overhead/periods/[id]/payments/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPayments, recordPayment } from "@/backend/controller/overheadPeriodsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return getPayments(request, id);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return recordPayment(request, id, guard.session.user.email ?? "");
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 4: Manually verify partial then full payment**

With an Owner session and the Internet expense from Task 6, in the browser console:

```js
const periods = (await (await fetch('/api/admin/overhead/periods?month=2026-08')).json()).data;
const p = periods.find(x => x.expense_name === 'Internet');

// Partial: 500 of 1500.
await (await fetch(`/api/admin/overhead/periods/${p.id}/payments`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paid_on: '2026-08-14', amount: 500, method: 'GCash' }),
})).json();
```

Expected: `settled: false`, `amount_paid: 500`. Re-fetch the periods list: `display_status` is still `overdue` or `due`, not `paid`.

```js
// Remainder.
await (await fetch(`/api/admin/overhead/periods/${p.id}/payments`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paid_on: '2026-08-15', amount: 1000, method: 'GCash' }),
})).json();
```

Expected: `settled: true`, `amount_paid: 1500`; the period now reads `display_status: 'paid'`.

- [ ] **Step 5: Report**

Report both responses and the resulting `display_status`. Do not commit.

---

### Task 8: Dashboard

**Files:**
- Create: `src/backend/controller/overheadReportsController.ts`
- Create: `src/app/api/admin/overhead/dashboard/route.ts`

> **Divergence from the spec, deliberate.** §6.3 of the design lists a separate
> `/report` endpoint. It is dropped from phase 1: the dashboard payload already
> carries the month total, previous month, and category breakdown (§13's whole
> content), and the Payments tab lists the same month line by line. A `/report`
> route would ship as dead code with no consumer. It returns in phase 2 if a
> print/export view needs one payload.

**Interfaces:**
- Consumes: `ensureMaterialized`; `occurrencesBetween`, `monthlyEquivalent`, `type ScheduleDef` from `@/lib/overheadSchedule`
- Produces:
  - `getDashboard(req: NextRequest): Promise<NextResponse>`
  - Dashboard payload:
    `{ month, accrued_total, previous_month_total, ytd_total, estimated_annual, paid, unpaid, overdue, by_category: [{ name, amount }], trend: [{ month, accrued, normalized }] }`

- [ ] **Step 1: Write the reports controller**

Create `src/backend/controller/overheadReportsController.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { ensureMaterialized } from "./overheadPeriodsController";
import {
  occurrencesBetween,
  monthlyEquivalent,
  type ScheduleDef,
} from "@/lib/overheadSchedule";

const TODAY_SQL = `(NOW() AT TIME ZONE 'Asia/Manila')::date`;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  // Manila is UTC+8 and never negative, so shifting forward is enough to land
  // on the right calendar month at the boundary.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return monthKey(now);
}

function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Accrued total for one month: what was DUE for it, paid or not. */
async function accruedFor(month: string): Promise<number> {
  const r = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_due), 0)::numeric AS total
       FROM overhead_expense_periods
      WHERE accrual_month = $1::date AND status <> 'cancelled'`,
    [`${month}-01`],
  );
  return Number(r.rows[0].total);
}

interface DefRow {
  amount: string;
  frequency: ScheduleDef["frequency"];
  interval_count: number | null;
  interval_unit: ScheduleDef["interval_unit"];
  start_date: string;
  end_date: string | null;
  due_day: number | null;
}

function toDef(row: DefRow): ScheduleDef {
  return {
    frequency: row.frequency,
    start_date: String(row.start_date).slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    due_day: row.due_day,
    interval_count: row.interval_count,
    interval_unit: row.interval_unit,
  };
}

/**
 * Estimated annual overhead, computed from the real schedules rather than
 * monthly x 12 — a 6,000 annual subscription must count once, not twelve times.
 * No periods are materialised for this; it is arithmetic over the definitions.
 */
async function estimatedAnnual(): Promise<{ annual: number; normalizedMonthly: number }> {
  const { rows } = await pool.query<DefRow>(
    `SELECT amount, frequency, interval_count, interval_unit,
            start_date, end_date, due_day
       FROM overhead_expenses
      WHERE active`,
  );

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

  let annual = 0;
  let normalizedMonthly = 0;

  for (const row of rows) {
    const def = toDef(row);
    const amount = Number(row.amount);
    annual += occurrencesBetween(def, today, nextYear).length * amount;
    normalizedMonthly += monthlyEquivalent(def, amount);
  }

  return {
    annual: Math.round(annual * 100) / 100,
    normalizedMonthly: Math.round(normalizedMonthly * 100) / 100,
  };
}

/** GET /api/admin/overhead/dashboard?month=YYYY-MM */
export async function getDashboard(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMaterialized();

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || currentMonthKey();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, message: "month must be YYYY-MM" },
        { status: 400 },
      );
    }

    const year = month.slice(0, 4);

    const [accrued, previous, ytd, cash, byCategory, estimate] = await Promise.all([
      accruedFor(month),
      accruedFor(shiftMonth(month, -1)),
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount_due), 0)::numeric AS total
           FROM overhead_expense_periods
          WHERE status <> 'cancelled'
            AND accrual_month >= $1::date
            AND accrual_month <= $2::date`,
        [`${year}-01-01`, `${year}-12-01`],
      ),
      // Cash layer for the month: settled, still owed, and of that, overdue.
      pool.query<{ paid: string; unpaid: string; overdue: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_due END), 0)::numeric AS paid,
           COALESCE(SUM(CASE WHEN p.status = 'scheduled' THEN p.amount_due END), 0)::numeric AS unpaid,
           COALESCE(SUM(CASE WHEN p.status = 'scheduled'
                              AND p.due_date < ${TODAY_SQL}
                         THEN p.amount_due END), 0)::numeric AS overdue
         FROM overhead_expense_periods p
        WHERE p.accrual_month = $1::date AND p.status <> 'cancelled'`,
        [`${month}-01`],
      ),
      pool.query<{ name: string; amount: string }>(
        `SELECT c.name, COALESCE(SUM(p.amount_due), 0)::numeric AS amount
           FROM overhead_expense_periods p
           JOIN overhead_expenses e   ON e.id = p.expense_id
           JOIN overhead_categories c ON c.id = e.category_id
          WHERE p.accrual_month = $1::date AND p.status <> 'cancelled'
          GROUP BY c.name, c.sort_order
          HAVING SUM(p.amount_due) > 0
          ORDER BY amount DESC`,
        [`${month}-01`],
      ),
      estimatedAnnual(),
    ]);

    // Trend: twelve months ending at the selected one. `accrued` is the
    // point-in-time truth (a quarterly bill spikes in its own month) and
    // `normalized` is the smoothed line the eye should follow.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) months.push(shiftMonth(month, -i));

    const trendRows = await pool.query<{ m: string; total: string }>(
      `SELECT to_char(accrual_month, 'YYYY-MM') AS m,
              COALESCE(SUM(amount_due), 0)::numeric AS total
         FROM overhead_expense_periods
        WHERE status <> 'cancelled'
          AND accrual_month >= $1::date
          AND accrual_month <= $2::date
        GROUP BY accrual_month
        ORDER BY accrual_month`,
      [`${months[0]}-01`, `${month}-01`],
    );
    const byMonth = new Map(trendRows.rows.map((r) => [r.m, Number(r.total)]));

    return NextResponse.json({
      success: true,
      data: {
        month,
        accrued_total: accrued,
        previous_month_total: previous,
        ytd_total: Number(ytd.rows[0].total),
        estimated_annual: estimate.annual,
        paid: Number(cash.rows[0].paid),
        unpaid: Number(cash.rows[0].unpaid),
        overdue: Number(cash.rows[0].overdue),
        by_category: byCategory.rows.map((r) => ({
          name: r.name, amount: Number(r.amount),
        })),
        trend: months.map((m) => ({
          month: m,
          accrued: byMonth.get(m) ?? 0,
          normalized: estimate.normalizedMonthly,
        })),
      },
    });
  } catch (err) {
    console.error("[overhead] getDashboard failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load the overhead dashboard" },
      { status: 500 },
    );
  }
}

```

- [ ] **Step 2: Write the route**

Create `src/app/api/admin/overhead/dashboard/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/backend/controller/overheadReportsController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return getDashboard(request);
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 4: Verify the annual estimate is not monthly × 12**

With an Owner session, add a one-off annual expense, then read the dashboard:

```js
const cats = (await (await fetch('/api/admin/overhead/categories')).json()).data;
const software = cats.find(c => c.name === 'Software & Technology').id;

await (await fetch('/api/admin/overhead/expenses', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Annual software subscription', category_id: software,
    amount: 6000, frequency: 'annual', start_date: '2026-02-01',
  }),
})).json();

(await (await fetch('/api/admin/overhead/dashboard')).json()).data
```

Expected: `estimated_annual` includes **6000 once**, not 72,000. The `trend` entries show `accrued: 0` for months the annual bill does not fall in, while `normalized` includes its ₱500/month share — this is the smoothing that stops a quarterly or annual bill reading as a spike.

- [ ] **Step 5: Report**

Report the dashboard payload, calling out `estimated_annual` and one trend entry where `accrued` and `normalized` differ. Do not commit.

---

### Task 9: RTK Query slice

**Files:**
- Create: `src/redux/api/overheadApi.ts`
- Modify: `src/redux/store.ts`

**Interfaces:**
- Consumes: the routes from Tasks 4–8
- Produces: `useGetOverheadCategoriesQuery`, `useCreateOverheadCategoryMutation`, `useUpdateOverheadCategoryMutation`, `useDeleteOverheadCategoryMutation`, `useGetOverheadExpensesQuery`, `useGetOverheadExpenseQuery`, `useCreateOverheadExpenseMutation`, `useUpdateOverheadExpenseMutation`, `useDeleteOverheadExpenseMutation`, `useGetOverheadPeriodsQuery`, `useCancelOverheadPeriodMutation`, `useGetOverheadPaymentsQuery`, `useRecordOverheadPaymentMutation`, `useGetOverheadDashboardQuery`

- [ ] **Step 1: Write the slice**

Create `src/redux/api/overheadApi.ts`:

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface OverheadCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  expense_count?: number;
}

export interface OverheadExpense {
  id: string;
  name: string;
  description: string | null;
  amount: string;
  frequency: string;
  interval_count: number | null;
  interval_unit: string | null;
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  active: boolean;
  notes: string | null;
  category_id: string;
  category_name: string;
  next_due_date: string | null;
}

export interface OverheadPeriod {
  id: string;
  expense_id: string;
  expense_name: string;
  category_name: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: "scheduled" | "paid" | "cancelled";
  display_status: "scheduled" | "due" | "overdue" | "paid" | "cancelled";
  accrual_month: string;
}

export interface OverheadPayment {
  id: string;
  paid_on: string;
  amount: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface OverheadDashboard {
  month: string;
  accrued_total: number;
  previous_month_total: number;
  ytd_total: number;
  estimated_annual: number;
  paid: number;
  unpaid: number;
  overdue: number;
  by_category: { name: string; amount: number }[];
  trend: { month: string; accrued: number; normalized: number }[];
}

export interface OverheadExpenseDetail {
  expense: OverheadExpense;
  periods: OverheadPeriod[];
  history: {
    action: string;
    metadata: Record<string, unknown>;
    actor_email: string | null;
    created_at: string;
  }[];
}

type Ok<T> = { success: boolean; data: T };

export const overheadApi = createApi({
  reducerPath: "overheadApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/overhead" }),
  tagTypes: ["OverheadExpense", "OverheadPeriod", "OverheadCategory", "OverheadDashboard"],
  endpoints: (builder) => ({
    getOverheadCategories: builder.query<Ok<OverheadCategory[]>, void>({
      query: () => "/categories",
      providesTags: ["OverheadCategory"],
    }),
    createOverheadCategory: builder.mutation<Ok<OverheadCategory>, { name: string }>({
      query: (body) => ({ url: "/categories", method: "POST", body }),
      invalidatesTags: ["OverheadCategory"],
    }),
    updateOverheadCategory: builder.mutation<
      Ok<OverheadCategory>, { id: string; name?: string; active?: boolean }
    >({
      query: ({ id, ...body }) => ({ url: `/categories/${id}`, method: "PUT", body }),
      invalidatesTags: ["OverheadCategory", "OverheadExpense"],
    }),
    deleteOverheadCategory: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadCategory"],
    }),

    getOverheadExpenses: builder.query<
      Ok<OverheadExpense[]>, { active?: string; category?: string; q?: string } | void
    >({
      query: (params) => ({ url: "/expenses", params: params || undefined }),
      providesTags: ["OverheadExpense"],
    }),
    getOverheadExpense: builder.query<Ok<OverheadExpenseDetail>, string>({
      query: (id) => `/expenses/${id}`,
      providesTags: ["OverheadExpense", "OverheadPeriod"],
    }),
    createOverheadExpense: builder.mutation<Ok<{ id: string }>, Record<string, unknown>>({
      query: (body) => ({ url: "/expenses", method: "POST", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    updateOverheadExpense: builder.mutation<
      Ok<{ id: string }>, { id: string } & Record<string, unknown>
    >({
      query: ({ id, ...body }) => ({ url: `/expenses/${id}`, method: "PUT", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    deleteOverheadExpense: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/expenses/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadPeriods: builder.query<
      Ok<OverheadPeriod[]>, { month?: string; status?: string } | void
    >({
      query: (params) => ({ url: "/periods", params: params || undefined }),
      providesTags: ["OverheadPeriod"],
    }),
    cancelOverheadPeriod: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/periods/${id}`, method: "PATCH" }),
      invalidatesTags: ["OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadPayments: builder.query<Ok<OverheadPayment[]>, string>({
      query: (periodId) => `/periods/${periodId}/payments`,
      providesTags: ["OverheadPeriod"],
    }),
    recordOverheadPayment: builder.mutation<
      Ok<{ period_id: string; amount_paid: number; settled: boolean }>,
      { periodId: string; paid_on: string; amount: number;
        method?: string; reference?: string; notes?: string }
    >({
      query: ({ periodId, ...body }) => ({
        url: `/periods/${periodId}/payments`, method: "POST", body,
      }),
      invalidatesTags: ["OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadDashboard: builder.query<Ok<OverheadDashboard>, { month?: string } | void>({
      query: (params) => ({ url: "/dashboard", params: params || undefined }),
      providesTags: ["OverheadDashboard"],
    }),
  }),
});

export const {
  useGetOverheadCategoriesQuery,
  useCreateOverheadCategoryMutation,
  useUpdateOverheadCategoryMutation,
  useDeleteOverheadCategoryMutation,
  useGetOverheadExpensesQuery,
  useGetOverheadExpenseQuery,
  useCreateOverheadExpenseMutation,
  useUpdateOverheadExpenseMutation,
  useDeleteOverheadExpenseMutation,
  useGetOverheadPeriodsQuery,
  useCancelOverheadPeriodMutation,
  useGetOverheadPaymentsQuery,
  useRecordOverheadPaymentMutation,
  useGetOverheadDashboardQuery,
} = overheadApi;
```

- [ ] **Step 2: Register in the store**

In `src/redux/store.ts`, add the import beside the other API imports:

```ts
import { overheadApi } from "./api/overheadApi";
```

Add the reducer inside `reducer: { ... }`, after `[promotionsApi.reducerPath]`:

```ts
    [overheadApi.reducerPath]: overheadApi.reducer,
```

And add the middleware to the end of the existing `.concat(...)` chain:

```ts
      .concat(overheadApi.middleware)
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 4: Report**

Report build and lint results. Do not commit.

---

### Task 10: Expense list and form UI

**Files:**
- Create: `src/components/admin/owners/overhead/OverheadSection.tsx`
- Create: `src/components/admin/owners/overhead/ExpenseList.tsx`
- Create: `src/components/admin/owners/overhead/ExpenseFormModal.tsx`

**Interfaces:**
- Consumes: the hooks from Task 9; `Empty` from `@/components/admin/owners/OwnerModules`
- Produces:
  - `export default function OverheadSection(): JSX.Element` — owns the sub-tab state
  - `export function ExpenseList({ onEdit, onCreate }: { onEdit: (id: string) => void; onCreate: () => void })`
  - `export function ExpenseFormModal({ expenseId, open, onClose }: { expenseId: string | null; open: boolean; onClose: () => void })`

- [ ] **Step 1: Write the section shell**

Create `src/components/admin/owners/overhead/OverheadSection.tsx`. It owns the sub-tab and the selected month, matching the tab styling used elsewhere in the owner dashboard:

```tsx
"use client";

import { useState } from "react";
import { LayoutDashboard, Receipt, Wallet } from "lucide-react";
import { ExpenseList } from "./ExpenseList";
import { ExpenseFormModal } from "./ExpenseFormModal";

type Tab = "dashboard" | "expenses" | "payments";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "payments", label: "Payments", icon: Wallet },
];

export default function OverheadSection() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
              style={{
                backgroundColor: on ? "#1f1b16" : "transparent",
                color: on ? "#faf7f1" : "#6b6358",
                border: `1px solid ${on ? "#1f1b16" : "#d9d1c2"}`,
                fontWeight: on ? 500 : 400,
              }}>
              <Icon className="w-4 h-4" style={{ opacity: on ? 1 : 0.7 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "expenses" && (
        <ExpenseList
          onEdit={(id) => { setEditingId(id); setFormOpen(true); }}
          onCreate={() => { setEditingId(null); setFormOpen(true); }}
        />
      )}

      {tab === "dashboard" && (
        <p style={{ fontSize: 13, color: "#8a8276" }}>Dashboard arrives in Task 12.</p>
      )}
      {tab === "payments" && (
        <p style={{ fontSize: 13, color: "#8a8276" }}>Payments arrive in Task 11.</p>
      )}

      <ExpenseFormModal
        expenseId={editingId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
```

Note: the two placeholder paragraphs are replaced in Tasks 11 and 12. They exist so this task ends with something runnable.

- [ ] **Step 2: Write the expense list**

Create `src/components/admin/owners/overhead/ExpenseList.tsx`:

```tsx
"use client";

import { Plus, Pencil } from "lucide-react";
import { useGetOverheadExpensesQuery } from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const FREQUENCY_LABEL: Record<string, string> = {
  "one-time": "One-time", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually",
  custom: "Custom",
};

export function ExpenseList({
  onEdit, onCreate,
}: { onEdit: (id: string) => void; onCreate: () => void }) {
  const { data, isLoading } = useGetOverheadExpensesQuery();
  const rows = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{
          fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
          fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16",
        }}>
          Recurring expenses
        </h3>
        <button type="button" onClick={onCreate}
          className="inline-flex items-center cursor-pointer"
          style={{
            gap: 7, padding: "9px 16px", fontSize: 13, fontWeight: 500,
            color: "#faf7f1", background: "#1f1b16", border: "none",
            fontFamily: "inherit",
          }}>
          <Plus className="w-4 h-4" /> Add expense
        </button>
      </div>

      {isLoading && <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <Empty label="No overhead expenses recorded yet." />
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                  {["Expense", "Category", "Amount", "Repeats", "Next due", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f3eee2", opacity: e.active ? 1 : 0.55 }}>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                      {e.name}
                      {!e.active && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#8a8276" }}>paused</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#6b6358" }}>
                      {e.category_name}
                    </td>
                    <td className="px-6 py-3.5"
                      style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>
                      {peso(e.amount)}
                    </td>
                    <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#6b6358" }}>
                      {FREQUENCY_LABEL[e.frequency] ?? e.frequency}
                    </td>
                    <td className="px-6 py-3.5"
                      style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                      {e.next_due_date ? String(e.next_due_date).slice(0, 10) : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button type="button" onClick={() => onEdit(e.id)}
                        className="inline-flex items-center cursor-pointer"
                        style={{
                          gap: 5, padding: "6px 10px", fontSize: 12, color: "#B07848",
                          background: "#F7F0E3", border: "1px solid #D4BFA0",
                          fontFamily: "inherit",
                        }}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the form modal**

Create `src/components/admin/owners/overhead/ExpenseFormModal.tsx`. It handles create and edit, shows the interval fields only for a custom schedule, exposes `effective_from` only when editing an amount, and confirms past a duplicate warning:

```tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  useGetOverheadCategoriesQuery,
  useGetOverheadExpenseQuery,
  useCreateOverheadExpenseMutation,
  useUpdateOverheadExpenseMutation,
} from "@/redux/api/overheadApi";

const FREQUENCIES = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "semiannual", label: "Semi-annually" },
  { id: "annual", label: "Annually" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
  { id: "one-time", label: "One-time" },
  { id: "custom", label: "Custom…" },
];

const label = { fontSize: 12, color: "#6b6358", display: "block", marginBottom: 6 } as const;
const input = {
  width: "100%", padding: "9px 12px", fontSize: 13, color: "#1f1b16",
  background: "#fff", border: "1px solid #d9d1c2", fontFamily: "inherit",
} as const;

export function ExpenseFormModal({
  expenseId, open, onClose,
}: { expenseId: string | null; open: boolean; onClose: () => void }) {
  const { data: cats } = useGetOverheadCategoriesQuery();
  const { data: detail } = useGetOverheadExpenseQuery(expenseId ?? "", { skip: !expenseId });
  const [createExpense, { isLoading: creating }] = useCreateOverheadExpenseMutation();
  const [updateExpense, { isLoading: updating }] = useUpdateOverheadExpenseMutation();

  const [form, setForm] = useState({
    name: "", category_id: "", amount: "", frequency: "monthly",
    interval_count: "1", interval_unit: "month",
    start_date: "", end_date: "", due_day: "", notes: "",
    effective_from: "", change_reason: "", active: true,
  });
  const [originalAmount, setOriginalAmount] = useState<string | null>(null);

  useEffect(() => {
    const e = detail?.data?.expense;
    if (expenseId && e) {
      setForm({
        name: e.name, category_id: e.category_id, amount: String(e.amount),
        frequency: e.frequency,
        interval_count: String(e.interval_count ?? 1),
        interval_unit: e.interval_unit ?? "month",
        start_date: String(e.start_date).slice(0, 10),
        end_date: e.end_date ? String(e.end_date).slice(0, 10) : "",
        due_day: e.due_day ? String(e.due_day) : "",
        notes: e.notes ?? "", effective_from: "", change_reason: "",
        active: e.active,
      });
      setOriginalAmount(String(e.amount));
    }
    if (!expenseId) {
      setForm({
        name: "", category_id: cats?.data?.[0]?.id ?? "", amount: "",
        frequency: "monthly", interval_count: "1", interval_unit: "month",
        start_date: "", end_date: "", due_day: "", notes: "",
        effective_from: "", change_reason: "", active: true,
      });
      setOriginalAmount(null);
    }
  }, [expenseId, detail, cats]);

  if (!open) return null;

  const amountChanged =
    originalAmount !== null && Number(originalAmount) !== Number(form.amount);

  const submit = async (confirmDuplicate = false) => {
    const body: Record<string, unknown> = {
      name: form.name,
      category_id: form.category_id,
      amount: Number(form.amount),
      frequency: form.frequency,
      start_date: form.start_date,
      end_date: form.end_date || null,
      due_day: form.due_day ? Number(form.due_day) : null,
      notes: form.notes || null,
      confirm_duplicate: confirmDuplicate,
    };
    // Only editing can pause; a new expense is active by DB default.
    if (expenseId) body.active = form.active;
    if (form.frequency === "custom") {
      body.interval_count = Number(form.interval_count);
      body.interval_unit = form.interval_unit;
    }
    if (amountChanged) {
      body.effective_from = form.effective_from || form.start_date;
      body.change_reason = form.change_reason || null;
    }

    try {
      const res = expenseId
        ? await updateExpense({ id: expenseId, ...body }).unwrap()
        : await createExpense(body).unwrap();
      if (res.success) {
        toast.success(expenseId ? "Expense updated" : "Expense added");
        onClose();
      }
    } catch (err) {
      const e = err as { data?: { message?: string; duplicate?: boolean } };
      if (e.data?.duplicate && !confirmDuplicate) {
        if (window.confirm(e.data.message)) return submit(true);
        return;
      }
      toast.error(e.data?.message ?? "Could not save the expense");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(31,27,22,.45)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ece5d4", width: "min(560px, 100%)",
        maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div className="flex items-center justify-between mb-6">
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            {expenseId ? "Edit expense" : "Add overhead expense"}
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer"
            style={{ background: "transparent", border: "none", color: "#8a8276" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={label}>Expense name</label>
            <input style={input} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Condo rent" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Category</label>
              <select style={input} value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                {(cats?.data ?? []).filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Amount (₱)</label>
              <input style={input} type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Repeats</label>
              <select style={input} value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Due day of month (optional)</label>
              <input style={input} type="number" min="1" max="31" value={form.due_day}
                onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                placeholder="e.g. 15" />
            </div>
          </div>

          {form.frequency === "custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Every</label>
                <input style={input} type="number" min="1" value={form.interval_count}
                  onChange={(e) => setForm({ ...form, interval_count: e.target.value })} />
              </div>
              <div>
                <label style={label}>Unit</label>
                <select style={input} value={form.interval_unit}
                  onChange={(e) => setForm({ ...form, interval_unit: e.target.value })}>
                  <option value="day">days</option>
                  <option value="week">weeks</option>
                  <option value="month">months</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Starts</label>
              <input style={input} type="date" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label style={label}>Ends (optional)</label>
              <input style={input} type="date" value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          {amountChanged && (
            <div style={{ background: "#F7F0E3", border: "1px solid #D4BFA0", padding: 16 }}>
              <p style={{ fontSize: 12.5, color: "#5a4a3a", margin: "0 0 12px" }}>
                The amount changed from ₱{originalAmount} to ₱{form.amount}. Bills already
                paid are never altered — choose when the new amount starts applying.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={label}>New amount applies from</label>
                  <input style={input} type="date" value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                </div>
                <div>
                  <label style={label}>Reason (optional)</label>
                  <input style={input} value={form.change_reason}
                    onChange={(e) => setForm({ ...form, change_reason: e.target.value })}
                    placeholder="e.g. Provider increase" />
                </div>
              </div>
            </div>
          )}

          <div>
            <label style={label}>Notes (optional)</label>
            <textarea style={{ ...input, minHeight: 72 }} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {expenseId && (
            <label className="flex items-center cursor-pointer"
              style={{ gap: 10, fontSize: 13, color: "#5a4a3a" }}>
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active — uncheck to pause this expense. Existing bills stay; no new
              ones are generated.
            </label>
          )}

          <div className="flex items-center justify-end" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="cursor-pointer"
              style={{
                padding: "9px 16px", fontSize: 13, color: "#6b6358",
                background: "transparent", border: "1px solid #d9d1c2",
                fontFamily: "inherit",
              }}>
              Cancel
            </button>
            <button type="button" onClick={() => submit(false)}
              disabled={creating || updating} className="cursor-pointer"
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#faf7f1",
                background: "#1f1b16", border: "none", fontFamily: "inherit",
                opacity: creating || updating ? 0.6 : 1,
              }}>
              {expenseId ? "Save changes" : "Add expense"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 5: Report**

Report build and lint. The UI is not reachable until Task 12 wires the Finance tab; that is expected. Do not commit.

---

### Task 11: Payment queue UI

**Files:**
- Create: `src/components/admin/owners/overhead/PeriodQueue.tsx`
- Create: `src/components/admin/owners/overhead/PaymentModal.tsx`
- Modify: `src/components/admin/owners/overhead/OverheadSection.tsx` (replace the payments placeholder)

**Interfaces:**
- Consumes: `useGetOverheadPeriodsQuery`, `useRecordOverheadPaymentMutation`, `useGetOverheadPaymentsQuery`
- Produces:
  - `export function PeriodQueue({ month }: { month: string })`
  - `export function PaymentModal({ period, open, onClose }: { period: OverheadPeriod | null; open: boolean; onClose: () => void })`

- [ ] **Step 1: Write the payment modal**

Create `src/components/admin/owners/overhead/PaymentModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  useRecordOverheadPaymentMutation,
  useGetOverheadPaymentsQuery,
  type OverheadPeriod,
} from "@/redux/api/overheadApi";

const label = { fontSize: 12, color: "#6b6358", display: "block", marginBottom: 6 } as const;
const input = {
  width: "100%", padding: "9px 12px", fontSize: 13, color: "#1f1b16",
  background: "#fff", border: "1px solid #d9d1c2", fontFamily: "inherit",
} as const;

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

export function PaymentModal({
  period, open, onClose,
}: { period: OverheadPeriod | null; open: boolean; onClose: () => void }) {
  const [record, { isLoading }] = useRecordOverheadPaymentMutation();
  const { data: history } = useGetOverheadPaymentsQuery(period?.id ?? "", { skip: !period });

  const outstanding = period
    ? Number(period.amount_due) - Number(period.amount_paid || 0)
    : 0;

  const [form, setForm] = useState({
    paid_on: "", amount: "", method: "", reference: "", notes: "",
  });

  useEffect(() => {
    if (period) {
      setForm({
        paid_on: new Date().toISOString().slice(0, 10),
        amount: String(outstanding),
        method: "", reference: "", notes: "",
      });
    }
    // outstanding is derived from period; period is the real trigger.
  }, [period, outstanding]);

  if (!open || !period) return null;

  const submit = async () => {
    try {
      const res = await record({
        periodId: period.id,
        paid_on: form.paid_on,
        amount: Number(form.amount),
        method: form.method || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      }).unwrap();
      toast.success(res.data.settled
        ? "Payment recorded — this bill is settled."
        : `Partial payment recorded. ${peso(Number(period.amount_due) - res.data.amount_paid)} still owed.`);
      onClose();
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not record the payment");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(31,27,22,.45)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", border: "1px solid #ece5d4", width: "min(480px, 100%)",
        maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div className="flex items-center justify-between mb-2">
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            Record payment
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer"
            style={{ background: "transparent", border: "none", color: "#8a8276" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#6b6358", margin: "0 0 20px" }}>
          {period.expense_name} · due {String(period.due_date).slice(0, 10)} ·{" "}
          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
            {peso(outstanding)} outstanding
          </span>
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Paid on</label>
              <input style={input} type="date" value={form.paid_on}
                onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
            </div>
            <div>
              <label style={label}>Amount (₱)</label>
              <input style={input} type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Method (optional)</label>
              <input style={input} value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                placeholder="e.g. GCash" />
            </div>
            <div>
              <label style={label}>Reference (optional)</label>
              <input style={input} value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>

          {(history?.data?.length ?? 0) > 0 && (
            <div>
              <p style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "#8B6344", margin: "0 0 8px",
              }}>
                Earlier payments
              </p>
              {(history?.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between"
                  style={{ fontSize: 12.5, color: "#6b6358", padding: "4px 0" }}>
                  <span>{String(p.paid_on).slice(0, 10)}{p.method ? ` · ${p.method}` : ""}</span>
                  <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>
                    {peso(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="cursor-pointer"
              style={{
                padding: "9px 16px", fontSize: 13, color: "#6b6358",
                background: "transparent", border: "1px solid #d9d1c2",
                fontFamily: "inherit",
              }}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={isLoading}
              className="cursor-pointer"
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#faf7f1",
                background: "#1f1b16", border: "none", fontFamily: "inherit",
                opacity: isLoading ? 0.6 : 1,
              }}>
              Record payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the period queue**

Create `src/components/admin/owners/overhead/PeriodQueue.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  useGetOverheadPeriodsQuery,
  type OverheadPeriod,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";
import { PaymentModal } from "./PaymentModal";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const STATUS_TONE: Record<string, { c: string; dot: string; label: string }> = {
  paid:      { c: "#4a6a3a", dot: "#7a8c5a", label: "Paid" },
  overdue:   { c: "#9a4a3a", dot: "#b85a4a", label: "Overdue" },
  due:       { c: "#8a6a2f", dot: "#d4a96a", label: "Due soon" },
  scheduled: { c: "#8a8276", dot: "#c9c1b2", label: "Scheduled" },
  cancelled: { c: "#8a8276", dot: "#c9c1b2", label: "Cancelled" },
};

export function PeriodQueue({ month }: { month: string }) {
  const { data, isLoading } = useGetOverheadPeriodsQuery({ month });
  const [active, setActive] = useState<OverheadPeriod | null>(null);
  const rows = data?.data ?? [];

  return (
    <div>
      {isLoading && <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <Empty label="Nothing due in this month." />
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                  {["Expense", "Due", "Amount", "Paid", "Status", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const tone = STATUS_TONE[p.display_status] ?? STATUS_TONE.scheduled;
                  const settled = p.display_status === "paid";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3eee2" }}>
                      <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                        {p.expense_name}
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: "#8a8276" }}>
                          {p.category_name}
                        </span>
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                        {String(p.due_date).slice(0, 10)}
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>
                        {peso(p.amount_due)}
                      </td>
                      <td className="px-6 py-3.5"
                        style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#6b6358" }}>
                        {Number(p.amount_paid) > 0 ? peso(p.amount_paid) : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center"
                          style={{ gap: 7, fontSize: 12, color: tone.c }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: tone.dot, flex: "none",
                          }} />
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {!settled && (
                          <button type="button" onClick={() => setActive(p)}
                            className="cursor-pointer"
                            style={{
                              padding: "6px 12px", fontSize: 12, color: "#B07848",
                              background: "#F7F0E3", border: "1px solid #D4BFA0",
                              fontFamily: "inherit",
                            }}>
                            Record payment
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaymentModal period={active} open={!!active} onClose={() => setActive(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the section**

In `OverheadSection.tsx`, add the import and a month value, then replace the payments placeholder:

```tsx
import { PeriodQueue } from "./PeriodQueue";
```

Add near the other state:

```tsx
  const [month] = useState(() => new Date().toISOString().slice(0, 7));
```

Replace:

```tsx
      {tab === "payments" && (
        <p style={{ fontSize: 13, color: "#8a8276" }}>Payments arrive in Task 11.</p>
      )}
```

with:

```tsx
      {tab === "payments" && <PeriodQueue month={month} />}
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 5: Report**

Report build and lint. Do not commit.

---

### Task 12: Dashboard UI and Finance tab wiring

**Files:**
- Create: `src/components/admin/owners/overhead/OverheadDashboard.tsx`
- Modify: `src/components/admin/owners/overhead/OverheadSection.tsx` (replace the dashboard placeholder)
- Modify: `src/app/admin/owners/page.tsx` (Finance tab)

**Interfaces:**
- Consumes: `useGetOverheadDashboardQuery`
- Produces: `export function OverheadDashboard({ month }: { month: string })`; a reachable Finance → Overhead tab

- [ ] **Step 1: Write the dashboard**

Create `src/components/admin/owners/overhead/OverheadDashboard.tsx`:

```tsx
"use client";

import { useGetOverheadDashboardQuery } from "@/redux/api/overheadApi";

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();

export function OverheadDashboard({ month }: { month: string }) {
  const { data, isLoading } = useGetOverheadDashboardQuery({ month });
  const d = data?.data;

  if (isLoading) return <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>;
  if (!d) return null;

  const change = d.previous_month_total
    ? ((d.accrued_total - d.previous_month_total) / d.previous_month_total) * 100
    : null;

  const kpis = [
    { label: "This month", value: peso(d.accrued_total),
      note: change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs last month` },
    { label: "Last month", value: peso(d.previous_month_total), note: d.previous_month_total ? "" : "no data" },
    { label: "Year to date", value: peso(d.ytd_total), note: "" },
    { label: "Est. annual", value: peso(d.estimated_annual), note: "from real schedules" },
    { label: "Paid", value: peso(d.paid), note: "" },
    { label: "Unpaid", value: peso(d.unpaid), note: d.overdue ? `${peso(d.overdue)} overdue` : "" },
  ];

  const maxTrend = Math.max(...d.trend.map((t) => Math.max(t.accrued, t.normalized)), 1);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-6"
        style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: "#fff", padding: 18 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a8276", marginBottom: 10 }}>
              {k.label}
            </div>
            <div style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 22,
              fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16",
            }}>
              {k.value}
            </div>
            {k.note && (
              <div style={{ fontSize: 11, color: "#8a8276", marginTop: 8 }}>{k.note}</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: 20 }}>
        <div className="xl:col-span-2" style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16",
          }}>
            Overhead trend
          </h3>
          <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 20px" }}>
            Bars are what each month actually accrued. The line is the smoothed monthly
            average, so a quarterly or annual bill does not read as a spike.
          </p>
          <div className="flex items-end" style={{ gap: 6, height: 160 }}>
            {d.trend.map((t) => (
              <div key={t.month} className="flex-1 flex flex-col items-center" style={{ gap: 6 }}>
                <div style={{ width: "100%", height: 130, display: "flex", alignItems: "flex-end", position: "relative" }}>
                  <div style={{
                    width: "100%",
                    height: `${(t.accrued / maxTrend) * 100}%`,
                    background: t.month === d.month ? "#B07848" : "#E8D9C0",
                  }} />
                  <div style={{
                    position: "absolute", left: 0, right: 0,
                    bottom: `${(t.normalized / maxTrend) * 100}%`,
                    borderTop: "1px dashed #8B6344",
                  }} />
                </div>
                <span style={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  fontSize: 9.5, color: "#b0a695",
                }}>
                  {t.month.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 20, margin: "0 0 20px", lineHeight: 1, color: "#1f1b16",
          }}>
            By category
          </h3>
          {d.by_category.length === 0 && (
            <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>Nothing accrued this month.</p>
          )}
          {d.by_category.map((c) => (
            <div key={c.name} className="flex items-center justify-between"
              style={{ padding: "9px 0", borderBottom: "1px solid #f3eee2" }}>
              <span style={{ fontSize: 13, color: "#5a4a3a" }}>{c.name}</span>
              <span style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 13, color: "#1f1b16",
              }}>
                {peso(c.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the section**

In `OverheadSection.tsx`, import it and replace the dashboard placeholder:

```tsx
import { OverheadDashboard } from "./OverheadDashboard";
```

Replace:

```tsx
      {tab === "dashboard" && (
        <p style={{ fontSize: 13, color: "#8a8276" }}>Dashboard arrives in Task 12.</p>
      )}
```

with:

```tsx
      {tab === "dashboard" && <OverheadDashboard month={month} />}
```

- [ ] **Step 3: Add the Finance tab**

In `src/app/admin/owners/page.tsx`:

Add the import beside the other owner-module imports:

```tsx
import OverheadSection from "@/components/admin/owners/overhead/OverheadSection";
```

Widen the tab union at line ~155:

```tsx
  const [financeTab, setFinanceTab]   = useState<"revenue"|"methods"|"promotions"|"overhead">("revenue");
```

At line ~1905, add the tab — Owner-only, so a CSR never sees it — and render the section. Replace the existing tabBar call with:

```tsx
          {tabBar([
            { id: "revenue", label: "Revenue Management", icon: PhilippinePeso },
            { id: "methods", label: "Payment Methods", icon: CreditCard },
            { id: "promotions", label: "Promotions", icon: Sparkles },
            ...(isOwner ? [{ id: "overhead", label: "Overhead", icon: Receipt }] : []),
          ], financeTab, (id) => setFinanceTab(id as "revenue" | "methods" | "promotions" | "overhead"))}
          {financeTab === "overhead" && isOwner && <OverheadSection />}
```

Add `Receipt` to the existing `lucide-react` import in that file.

`isOwner` does not exist yet. Derive it next to the existing `ownerId` line (~line 241), using the same cast style that line already uses — the role is written onto the session as `(session.user as { role?: string }).role` by the session callback in `src/lib/auth.ts`:

```tsx
  const isOwner = (session?.user as { role?: string } | undefined)?.role === "Owner";
```

`const { data: session } = useSession()` is already in scope at line 240 — do not add a second call.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint counts unchanged.

- [ ] **Step 5: Exercise the whole flow in the browser**

With `npm run dev` and an Owner session, go to Finance → Overhead and confirm:

1. **Expenses tab** — the Internet and annual-subscription expenses from Tasks 6 and 8 are listed with correct amount, frequency and next due date.
2. **Add expense** — create "Condo rent", Property, ₱15,000, monthly, due day 5. It appears in the list immediately.
3. **Payments tab** — this month's occurrences are listed. Record a partial payment; the row stays unpaid and shows the paid amount. Record the remainder; it flips to Paid.
4. **Dashboard tab** — "This month" matches the sum of the Payments tab rows; "Est. annual" counts the ₱6,000 annual subscription once; the trend shows bars differing from the dashed normalized line in months containing the annual bill.
5. **Pause** — edit "Condo rent" and uncheck Active. The row dims and reads "paused"; its existing periods remain in the Payments tab, and no new ones appear next month. Re-check Active to reinstate it.
6. **Access** — sign in as CSR: the Overhead tab is absent, and `fetch('/api/admin/overhead/expenses')` returns 403.

- [ ] **Step 6: Report**

Report each of the six checks with its result. Do not commit.

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm test`
Expected: all `overheadSchedule` tests pass.

- [ ] **Step 2: Run the schema and materialisation checks**

Run:
```bash
node --env-file=.env scripts/check-overhead-schema.mjs
node --env-file=.env scripts/check-overhead-materialize.mjs
```
Expected: both exit 0, all ✓.

- [ ] **Step 3: Confirm the build is clean**

Run: `npm run build`
Expected: success, no TS errors.

- [ ] **Step 4: Confirm the lint baseline did not regress**

Run: `npm run lint 2>&1 | tail -3`
Expected: at most 95 errors / 57 warnings. Any increase must be traced to overhead files and fixed.

- [ ] **Step 5: Clean up probe data**

Delete any test expenses created during Tasks 6, 8 and 12 that the owner does not want to keep. Because expenses with payments cannot be deleted through the API by design, remove those directly:

```sql
DELETE FROM overhead_expense_payments
 WHERE period_id IN (
   SELECT p.id FROM overhead_expense_periods p
   JOIN overhead_expenses e ON e.id = p.expense_id
   WHERE e.name IN ('Internet', 'Annual software subscription', 'Condo rent')
 );
DELETE FROM overhead_expense_periods
 WHERE expense_id IN (
   SELECT id FROM overhead_expenses
   WHERE name IN ('Internet', 'Annual software subscription', 'Condo rent')
 );
DELETE FROM overhead_expenses
 WHERE name IN ('Internet', 'Annual software subscription', 'Condo rent');
```

**Ask the owner first** — these may be real expenses they want to keep.

- [ ] **Step 6: Report the summary**

Report: test count, both script results, build status, lint counts before and after, and the list of files created or modified. Remind the user that the migration must be applied manually to Supabase before the Vercel deploy, since Vercel does not run migrations.

---

## Deferred to phase 2

Tracked here so nothing is silently dropped. These need a separate spec:

- §14 narrative trend explanations
- §15–16 overhead per available night (calendar nights minus active `blocked_dates`), allocation to bookings
- §18 profitability integration
- §19 AI Revenue Manager read seam — no consumer exists in the codebase yet
- §20 alerts (upcoming due, overdue, unusual increases) — needs the external cron pinger
- Category reordering UI and per-staff permissions (§26's configurable variant)
- A `/report` endpoint, if a print or export view needs the month's total, comparison and line items in a single payload (dropped from phase 1 as dead code — see the note on Task 8)
