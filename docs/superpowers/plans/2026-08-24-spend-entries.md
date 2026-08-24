# One-off Spend Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner record a cost that already happened and is already paid — laundry, supplies, a repair — without inventing a schedule for it.

**Architecture:** A one-off is stored as a `frequency: 'one-time'` expense plus its single period plus a payment, written in one transaction. No migration, and no aggregate changes: the dashboard, category breakdown, payments queue and both profitability bases already read those tables. Validation lives in a pure, unit-tested module; the controller does I/O only.

**Tech Stack:** Next.js 16 App Router, TypeScript, raw `pg` SQL, RTK Query, vitest (dev), inline styles matching the owner dashboard.

**Spec:** [docs/superpowers/specs/2026-08-24-spend-entries-design.md](../specs/2026-08-24-spend-entries-design.md)

## Global Constraints

- **Git is manual.** The user stages and commits. No task commits, pushes, or creates branches. Each task ends by reporting what changed.
- **`npm run build` must pass** (exit 0) before any task is considered done. Vercel fails the deploy on any TS or lint error.
- **Lint baseline is 94 errors / 57 warnings.** New code must not raise either count. Verify with `npm run lint 2>&1 | tail -3`.
- **No migration.** No file under `src/backend/migrations/` may be added or changed. The schema already supports every field this needs. If a task appears to need a schema change, stop and report — it means the spec was wrong.
- **No new npm dependencies.**
- **Currency is PHP only.**
- **Owner-only.** Both new routes use `requireOwner()`, like every other overhead route.
- **"Today" is Manila, never UTC.** Date comparisons use the Manila day.
- **Never destroy a recurring bill's history.** The delete path accepts `frequency = 'one-time'` only; `deleteExpense` on the existing route keeps its 409 guard untouched.
- **No setState inside an effect.** The React Compiler lint rule is part of the baseline; seed state from props or `useState` initialisers instead.

---

### Task 1: Pure spend validation module with vitest

**Files:**
- Create: `src/lib/overheadSpend.ts`
- Create: `src/lib/overheadSpend.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface SpendInput { name: string; category_id: string; amount: number; spent_on: string; method: string | null; reference: string | null; notes: string | null }`
  - `type SpendValidation = { ok: true; value: SpendInput } | { ok: false; message: string }`
  - `manilaToday(now?: Date): string`
  - `validateSpend(body: unknown, today: string): SpendValidation`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/overheadSpend.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { manilaToday, validateSpend } from "./overheadSpend";

const CAT = "3f6c1a2e-9b4d-4c7a-8e11-2b5d6f0a9c33";

const good = {
  name: "Laundry",
  category_id: CAT,
  amount: 500,
  spent_on: "2026-08-24",
};

describe("manilaToday", () => {
  it("uses the Manila day, not UTC", () => {
    // 2026-08-31 17:00 UTC is 2026-09-01 01:00 in Manila.
    expect(manilaToday(new Date("2026-08-31T17:00:00Z"))).toBe("2026-09-01");
  });

  it("does not roll forward before the Manila day changes", () => {
    // 2026-08-31 15:59 UTC is 2026-08-31 23:59 in Manila.
    expect(manilaToday(new Date("2026-08-31T15:59:00Z"))).toBe("2026-08-31");
  });
});

describe("validateSpend", () => {
  it("accepts a well-formed entry and normalises optional fields to null", () => {
    const r = validateSpend(good, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      name: "Laundry",
      category_id: CAT,
      amount: 500,
      spent_on: "2026-08-24",
      method: null,
      reference: null,
      notes: null,
    });
  });

  it("keeps optional fields when supplied, trimmed", () => {
    const r = validateSpend({ ...good, method: " GCash ", reference: "REF1", notes: " two loads " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("GCash");
    expect(r.value.notes).toBe("two loads");
  });

  it("treats a whitespace-only optional field as absent", () => {
    const r = validateSpend({ ...good, reference: "   " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reference).toBeNull();
  });

  it("trims the name", () => {
    const r = validateSpend({ ...good, name: "  Laundry  " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Laundry");
  });

  it("rejects an empty name", () => {
    const r = validateSpend({ ...good, name: "   " }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Give this expense a name." });
  });

  it("rejects a name longer than the column allows", () => {
    const r = validateSpend({ ...good, name: "x".repeat(151) }, "2026-08-24");
    expect(r.ok).toBe(false);
  });

  it("rejects a non-uuid category", () => {
    const r = validateSpend({ ...good, category_id: "not-a-uuid" }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Choose a category." });
  });

  it("rejects a missing category", () => {
    const r = validateSpend({ ...good, category_id: undefined }, "2026-08-24");
    expect(r.ok).toBe(false);
  });

  it("rejects zero and negative amounts", () => {
    expect(validateSpend({ ...good, amount: 0 }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, amount: -50 }, "2026-08-24").ok).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(validateSpend({ ...good, amount: "abc" }, "2026-08-24").ok).toBe(false);
  });

  it("accepts a numeric string amount, since form inputs are strings", () => {
    const r = validateSpend({ ...good, amount: "500.50" }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(500.5);
  });

  it("rejects a malformed date", () => {
    const r = validateSpend({ ...good, spent_on: "24/08/2026" }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Give the date this was paid." });
  });

  it("rejects a future date", () => {
    const r = validateSpend({ ...good, spent_on: "2026-08-25" }, "2026-08-24");
    expect(r).toEqual({
      ok: false,
      message: "You cannot record a payment for a date that has not happened yet.",
    });
  });

  it("accepts today", () => {
    expect(validateSpend({ ...good, spent_on: "2026-08-24" }, "2026-08-24").ok).toBe(true);
  });

  it("accepts a past date", () => {
    expect(validateSpend({ ...good, spent_on: "2026-01-02" }, "2026-08-24").ok).toBe(true);
  });

  it("does not throw on a null or non-object body", () => {
    expect(validateSpend(null, "2026-08-24").ok).toBe(false);
    expect(validateSpend("nonsense", "2026-08-24").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- overheadSpend`
Expected: FAIL — `Failed to resolve import "./overheadSpend"`.

- [ ] **Step 3: Implement the module**

Create `src/lib/overheadSpend.ts`:

```ts
/**
 * Validation for one-off spend entries — a cost that already happened and is
 * already paid. Pure by design: the controller does I/O, this decides what a
 * valid entry is. See docs/superpowers/specs/2026-08-24-spend-entries-design.md.
 */

export interface SpendInput {
  name: string;
  category_id: string;
  amount: number;
  spent_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

export type SpendValidation =
  | { ok: true; value: SpendInput }
  | { ok: false; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 150; // matches overhead_expenses.name VARCHAR(150)

/**
 * Today's date in Manila as 'YYYY-MM-DD'. Manila is UTC+8 and never negative,
 * so shifting forward eight hours before reading the UTC date lands on the
 * right calendar day. Same approach the overhead reports controller uses.
 */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Trimmed string, or null when absent or blank. */
function optional(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export function validateSpend(body: unknown, today: string): SpendValidation {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  if (!name) return { ok: false, message: "Give this expense a name." };
  if (name.length > NAME_MAX) {
    return { ok: false, message: `That name is too long (${NAME_MAX} characters max).` };
  }

  const category_id = String(b.category_id ?? "");
  if (!UUID_RE.test(category_id)) return { ok: false, message: "Choose a category." };

  // Form inputs arrive as strings, so coerce before testing.
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero." };
  }

  const spent_on = String(b.spent_on ?? "");
  if (!DATE_RE.test(spent_on)) return { ok: false, message: "Give the date this was paid." };
  // String comparison is safe: both sides are zero-padded 'YYYY-MM-DD'.
  if (spent_on > today) {
    return {
      ok: false,
      message: "You cannot record a payment for a date that has not happened yet.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      category_id,
      amount,
      spent_on,
      method: optional(b.method),
      reference: optional(b.reference),
      notes: optional(b.notes),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- overheadSpend`
Expected: PASS, 18 tests.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint no worse than 94 errors / 57 warnings.

- [ ] **Step 6: Report**

Report test count, build status, lint counts. Do not commit.

---

### Task 2: Spend controller, routes, and the expenses-list query change

**Files:**
- Create: `src/backend/controller/overheadSpendController.ts`
- Create: `src/app/api/admin/overhead/spend/route.ts`
- Create: `src/app/api/admin/overhead/spend/[id]/route.ts`
- Modify: `src/backend/controller/overheadController.ts` (the `getExpenses` query only)

**Interfaces:**
- Consumes: `validateSpend`, `manilaToday` from `@/lib/overheadSpend`; `accrualMonthOf` from `@/lib/overheadSchedule`; `logAudit` from `../utils/auditLog`; `requireOwner` from `@/backend/utils/requireAdmin`
- Produces:
  - `createSpend(req: NextRequest, actorEmail: string): Promise<NextResponse>` — 201 `{ success: true, data: { id } }`
  - `deleteSpend(req: NextRequest, id: string, actorEmail: string): Promise<NextResponse>` — 200 `{ success: true, data: { id } }`
  - `GET /api/admin/overhead/expenses?month=YYYY-MM` scopes one-off rows to that month

- [ ] **Step 1: Write the controller**

Create `src/backend/controller/overheadSpendController.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { logAudit } from "../utils/auditLog";
import { accrualMonthOf } from "@/lib/overheadSchedule";
import { validateSpend, manilaToday } from "@/lib/overheadSpend";

/**
 * POST /api/admin/overhead/spend — record a cost that already happened.
 *
 * Written as a one-time expense + its single period + a payment covering it,
 * all in one transaction. Storing it this way means every existing aggregate
 * (dashboard totals, category breakdown, both profitability bases) picks it up
 * with no changes: they all read overhead_expense_periods.
 *
 * `active: false` is literally true — there is nothing further to generate —
 * and it keeps the row out of ensureMaterialized's scan and out of
 * estimatedAnnual, so a one-off purchase cannot inflate the annual estimate.
 */
export async function createSpend(
  req: NextRequest,
  actorEmail: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const check = validateSpend(await req.json(), manilaToday());
    if (!check.ok) {
      return NextResponse.json({ success: false, message: check.message }, { status: 400 });
    }
    const v = check.value;

    // Resolve the category explicitly so a bad id reads as a message, not as a
    // raw foreign-key violation.
    const cat = await pool.query(
      `SELECT id FROM overhead_categories WHERE id = $1 AND active`,
      [v.category_id],
    );
    if (!cat.rows.length) {
      return NextResponse.json(
        { success: false, message: "That category no longer exists — pick another." },
        { status: 400 },
      );
    }

    const actor = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
      [actorEmail],
    );
    const actorId = actor.rows[0]?.id ?? null;

    await client.query("BEGIN");

    // $4 is spent_on, used for both start_date and generated_through.
    const expense = await client.query<{ id: string }>(
      `INSERT INTO overhead_expenses
         (name, category_id, amount, frequency, start_date, active,
          notes, generated_through, created_by)
       VALUES ($1, $2, $3, 'one-time', $4, FALSE, $5, $4, $6)
       RETURNING id`,
      [v.name, v.category_id, v.amount, v.spent_on, v.notes, actorId],
    );
    const expenseId = expense.rows[0].id;

    const period = await client.query<{ id: string }>(
      `INSERT INTO overhead_expense_periods
         (expense_id, period_start, period_end, due_date, amount_due,
          status, accrual_month)
       VALUES ($1, $2, $2, $2, $3, 'paid', $4)
       RETURNING id`,
      [expenseId, v.spent_on, v.amount, accrualMonthOf(v.spent_on)],
    );

    await client.query(
      `INSERT INTO overhead_expense_payments
         (period_id, paid_on, amount, method, reference, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [period.rows[0].id, v.spent_on, v.amount, v.method, v.reference, v.notes, actorId],
    );

    await logAudit({
      action: "overhead_spend.created",
      entity_type: "overhead_expense",
      entity_id: expenseId,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: { name: v.name, amount: v.amount, spent_on: v.spent_on },
    }, client);

    await client.query("COMMIT");

    return NextResponse.json({ success: true, data: { id: expenseId } }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] createSpend failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to record the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/admin/overhead/spend/[id] — remove a one-off entry.
 *
 * A deliberate, narrow exception to the module's rule that payment history is
 * never destroyed: a spend entry is born with a payment attached, so without
 * this a mistyped amount would be permanent. The frequency check is what keeps
 * the exception narrow — deleteExpense on the normal route still refuses with
 * 409 when a recurring bill has payments. The audit row survives the deletion.
 */
export async function deleteSpend(
  req: NextRequest,
  id: string,
  actorEmail: string,
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const found = await client.query<{
      frequency: string; name: string; amount: string; start_date: string;
    }>(
      `SELECT frequency, name, amount, start_date FROM overhead_expenses WHERE id = $1`,
      [id],
    );
    if (!found.rows.length) {
      return NextResponse.json({ success: false, message: "Expense not found" }, { status: 404 });
    }
    const row = found.rows[0];
    if (row.frequency !== "one-time") {
      return NextResponse.json(
        {
          success: false,
          message: "Only one-off entries can be deleted here. " +
                   "Pause or end a recurring expense instead.",
        },
        { status: 400 },
      );
    }

    const actor = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
      [actorEmail],
    );
    const actorId = actor.rows[0]?.id ?? null;

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM overhead_expense_payments
        WHERE period_id IN (SELECT id FROM overhead_expense_periods WHERE expense_id = $1)`,
      [id],
    );
    await client.query(`DELETE FROM overhead_expense_periods WHERE expense_id = $1`, [id]);
    await client.query(`DELETE FROM overhead_expenses WHERE id = $1`, [id]);

    await logAudit({
      action: "overhead_spend.deleted",
      entity_type: "overhead_expense",
      entity_id: id,
      actor_type: "admin",
      actor_id: actorId,
      actor_email: actorEmail,
      metadata: {
        name: row.name,
        amount: Number(row.amount),
        spent_on: String(row.start_date).slice(0, 10),
      },
    }, client);

    await client.query("COMMIT");

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[overhead] deleteSpend failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete the expense" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Write the two routes**

Create `src/app/api/admin/overhead/spend/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSpend } from "@/backend/controller/overheadSpendController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  return createSpend(request, guard.session.user.email ?? "");
}
```

Create `src/app/api/admin/overhead/spend/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteSpend } from "@/backend/controller/overheadSpendController";
import { requireOwner } from "@/backend/utils/requireAdmin";

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  return deleteSpend(request, id, guard.session.user.email ?? "");
}
```

- [ ] **Step 3: Scope one-off rows by month in `getExpenses`**

In `src/backend/controller/overheadController.ts`, inside `getExpenses`, after the existing
`const q = searchParams.get("q");` line, add:

```ts
    const month = searchParams.get("month");
```

Then, after the existing `if (q) { ... }` block and before `const where = ...`, add:

```ts
    // Recurring rules are a standing configuration and always list. One-off
    // entries belong to the month they were paid in — without this they would
    // accumulate weekly and bury the recurring rules after a year.
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { success: false, message: "month must be YYYY-MM" },
          { status: 400 },
        );
      }
      values.push(`${month}-01`);
      conditions.push(
        `(e.frequency <> 'one-time' OR (e.start_date >= $${values.length}::date ` +
        `AND e.start_date < $${values.length}::date + INTERVAL '1 month'))`,
      );
    }
```

Then replace the query's ORDER BY line:

```sql
        ORDER BY e.active DESC, c.sort_order, e.name
```

with:

```sql
        ORDER BY (e.frequency = 'one-time'),
                 CASE WHEN e.frequency = 'one-time' THEN 0 ELSE c.sort_order END,
                 CASE WHEN e.frequency = 'one-time' THEN '' ELSE e.name END,
                 e.start_date DESC, e.name
```

This groups recurring rules first (sorted by category then name) and one-off entries after
them, newest first. `e.active DESC` is dropped deliberately: one-off entries carry
`active = false`, so keeping it would interleave them with paused recurring rules.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0, `/api/admin/overhead/spend` and `/api/admin/overhead/spend/[id]` in
the route list; lint no worse than 94 errors / 57 warnings.

- [ ] **Step 5: Report**

Report build, lint, and the two route paths from the build output. Do not commit.

---

### Task 3: RTK endpoints and the branching entry form

**Files:**
- Modify: `src/redux/api/overheadApi.ts`
- Modify: `src/components/admin/owners/overhead/ExpenseFormModal.tsx`

**Interfaces:**
- Consumes: `POST /spend` and `DELETE /spend/:id` from Task 2
- Produces:
  - `useCreateOverheadSpendMutation()` — arg `{ name, category_id, amount, spent_on, method?, reference?, notes? }`
  - `useDeleteOverheadSpendMutation()` — arg `string` (the expense id)
  - `ExpenseFormModal` gains a repeat toggle on create

- [ ] **Step 1: Add the two RTK endpoints**

In `src/redux/api/overheadApi.ts`, add these two endpoints immediately after the
`deleteOverheadExpense` endpoint definition:

```ts
    createOverheadSpend: builder.mutation<
      Ok<{ id: string }>,
      { name: string; category_id: string; amount: number; spent_on: string;
        method?: string; reference?: string; notes?: string }
    >({
      query: (body) => ({ url: "/spend", method: "POST", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    deleteOverheadSpend: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/spend/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
```

Then add both hooks to the export block at the bottom of the file, after
`useDeleteOverheadExpenseMutation,`:

```ts
  useCreateOverheadSpendMutation,
  useDeleteOverheadSpendMutation,
```

- [ ] **Step 2: Extend the expenses query argument with `month`**

In the same file, change the `getOverheadExpenses` endpoint's argument type from:

```ts
      Ok<OverheadExpense[]>, { active?: string; category?: string; q?: string } | void
```

to:

```ts
      Ok<OverheadExpense[]>,
      { active?: string; category?: string; q?: string; month?: string } | void
```

The `query` body needs no change — it already spreads whatever params it is given.

- [ ] **Step 3: Add the repeat toggle and the one-off branch to the form**

In `src/components/admin/owners/overhead/ExpenseFormModal.tsx`:

Add to the imports from `@/redux/api/overheadApi`:

```ts
  useCreateOverheadSpendMutation,
```

Inside `ExpenseForm`, after the existing `const [updateExpense, { isLoading: updating }] = useUpdateOverheadExpenseMutation();` line, add:

```ts
  const [createSpend, { isLoading: savingSpend }] = useCreateOverheadSpendMutation();

  // Editing always means a recurring rule: a one-off already has a period and a
  // payment behind it, and its correction path is Delete, not Edit.
  const [repeats, setRepeats] = useState(() => (expense ? true : false));

  const [spend, setSpend] = useState(() => ({
    spent_on: new Date().toISOString().slice(0, 10),
    method: "",
    reference: "",
  }));

  const submitSpend = async () => {
    try {
      const res = await createSpend({
        name: form.name,
        category_id: form.category_id,
        amount: Number(form.amount),
        spent_on: spend.spent_on,
        method: spend.method || undefined,
        reference: spend.reference || undefined,
        notes: form.notes || undefined,
      }).unwrap();
      if (res.success) {
        toast.success("Expense recorded");
        onClose();
      }
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not record the expense");
    }
  };
```

Immediately after the opening `<div style={{ display: "grid", gap: 16 }}>` inside the
`Shell`, and BEFORE the "Expense name" field, insert the toggle — rendered on create only:

```tsx
          {!expenseId && (
            <div>
              <label style={label}>Does this repeat?</label>
              <div className="inline-flex" style={{ border: "1px solid #D4BFA0", background: "#F7F0E3" }}>
                <button type="button" onClick={() => setRepeats(false)}
                  aria-pressed={!repeats}
                  className="cursor-pointer"
                  style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                    color: !repeats ? "#1f1b16" : "#8a8276",
                    background: !repeats ? "#fff" : "transparent", border: "none" }}>
                  No — already paid
                </button>
                <button type="button" onClick={() => setRepeats(true)}
                  aria-pressed={repeats}
                  className="cursor-pointer"
                  style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                    color: repeats ? "#1f1b16" : "#8a8276",
                    background: repeats ? "#fff" : "transparent", border: "none",
                    borderLeft: "1px solid #D4BFA0" }}>
                  Yes — it&apos;s a recurring bill
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: "#8a8276", margin: "8px 0 0" }}>
                {repeats
                  ? "Creates a schedule that keeps generating bills you settle later."
                  : "Records a cost you have already paid. No schedule, no due date."}
              </p>
            </div>
          )}
```

Wrap the schedule fields so they render only on the recurring branch. Do not retype them —
wrap the existing JSX unchanged. The region to wrap starts at the line:

```tsx
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={label}>Repeats</label>
```

and ends immediately after the closing `</div>` of the grid whose second field is:

```tsx
              <label style={label}>Ends (optional)</label>
```

That region contains three sibling blocks in order: the Repeats / Due-day grid, the
`{form.frequency === "custom" && (...)}` interval block, and the Starts / Ends grid. Put
`{repeats && (<>` immediately before the first and `</>)}` immediately after the last,
leaving everything between them byte-for-byte as it is.

And add the one-off fields, rendered only when `!repeats`, immediately after that block:

```tsx
          {!repeats && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Date paid</label>
                <input style={input} className="dlx-date" type="date" value={spend.spent_on}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSpend({ ...spend, spent_on: e.target.value })} />
              </div>
              <div>
                <label style={label}>Method (optional)</label>
                <input style={input} value={spend.method}
                  onChange={(e) => setSpend({ ...spend, method: e.target.value })}
                  placeholder="e.g. GCash" />
              </div>
            </div>
          )}
```

Finally, route the submit button and its label. Replace the submit button's `onClick` and
its `disabled` and label expressions with:

```tsx
            <button type="button"
              onClick={() => (repeats ? submit(false) : submitSpend())}
              disabled={creating || updating || savingSpend} className="cursor-pointer"
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#faf7f1",
                background: "#1f1b16", border: "none", fontFamily: "inherit",
                opacity: creating || updating || savingSpend ? 0.6 : 1,
              }}>
              {expenseId ? "Save changes" : repeats ? "Add expense" : "Record expense"}
            </button>
```

Leave the modal title alone. It is currently `expenseId ? "Edit expense" : "Add overhead
expense"` and should stay that way: the toggle's own labels and helper line already carry the
distinction, and a heading that rewrites itself as you flip a radio is more distracting than
helpful.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint no worse than 94 errors / 57 warnings.

Watch for the React Compiler `set-state-in-effect` rule: this task adds `useState` only and
must add no `useEffect`. If lint rises by one, that is the cause.

- [ ] **Step 5: Report**

Report build and lint. Note that the form is reachable but the list does not yet show the
month navigator or the one-off rows — that is Task 4. Do not commit.

---

### Task 4: The combined list

**Files:**
- Modify: `src/components/admin/owners/overhead/ExpenseList.tsx`
- Modify: `src/components/admin/owners/overhead/OverheadSection.tsx`

**Interfaces:**
- Consumes: `useGetOverheadExpensesQuery({ month })`, `useDeleteOverheadSpendMutation` from Task 3; `MonthNavigator`, `currentMonthKey` from `@/components/admin/owners/MonthNavigator`
- Produces: `ExpenseList({ month, onMonthChange, onEdit, onCreate })`

- [ ] **Step 1: Rewrite the list component**

Replace the whole of `src/components/admin/owners/overhead/ExpenseList.tsx` with:

```tsx
"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  useGetOverheadExpensesQuery,
  useDeleteOverheadSpendMutation,
} from "@/redux/api/overheadApi";
import { Empty } from "@/components/admin/owners/OwnerModules";
import { MonthNavigator } from "@/components/admin/owners/MonthNavigator";

const peso = (n: number | string) =>
  "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

const FREQUENCY_LABEL: Record<string, string> = {
  "one-time": "One-off", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually",
  custom: "Custom",
};

const day = (v: string | null) => (v ? String(v).slice(0, 10) : null);

export function ExpenseList({
  month, onMonthChange, onEdit, onCreate,
}: {
  month: string | null;
  onMonthChange: (m: string | null) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const { data, isLoading } = useGetOverheadExpensesQuery(
    month ? { month } : undefined,
  );
  const [deleteSpend, { isLoading: deleting }] = useDeleteOverheadSpendMutation();
  const rows = data?.data ?? [];

  const removeOneOff = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This removes the expense and its payment for good.`)) return;
    try {
      await deleteSpend(id).unwrap();
      toast.success("Expense deleted");
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e.data?.message ?? "Could not delete the expense");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap mb-4" style={{ gap: 12 }}>
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400,
            fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16",
          }}>
            Expenses
          </h3>
          {/* No dots: this list has no per-month figures to advertise — the
              navigator here is a filter, not a data browser. */}
          <MonthNavigator
            value={month}
            onChange={onMonthChange}
            monthsWithData={[]}
          />
        </div>
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

      <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 16px" }}>
        Recurring bills always show. One-off spend is listed for the selected month.
      </p>

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
                  {["Expense", "Category", "Amount", "When", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left uppercase"
                      style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const oneOff = e.frequency === "one-time";
                  // `paused` is meaningless for a completed purchase: one-off
                  // rows carry active=false so they stay out of the annual
                  // estimate, not because anyone paused them.
                  const paused = !oneOff && !e.active;
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f3eee2", opacity: paused ? 0.55 : 1 }}>
                      <td className="px-6 py-3.5" style={{ fontSize: 13, color: "#1f1b16" }}>
                        {e.name}
                        {paused && (
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
                      <td className="px-6 py-3.5" style={{ fontSize: 12.5, color: "#6b6358" }}>
                        {oneOff
                          ? `One-off · paid ${day(e.start_date)}`
                          : `${FREQUENCY_LABEL[e.frequency] ?? e.frequency}${
                              e.next_due_date ? ` · next due ${day(e.next_due_date)}` : ""
                            }`}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {oneOff ? (
                          <button type="button" disabled={deleting}
                            onClick={() => removeOneOff(e.id, e.name)}
                            className="inline-flex items-center cursor-pointer"
                            style={{
                              gap: 5, padding: "6px 10px", fontSize: 12, color: "#9a4a3a",
                              background: "#fff", border: "1px solid #e3c9c2",
                              fontFamily: "inherit", opacity: deleting ? 0.6 : 1,
                            }}>
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        ) : (
                          <button type="button" onClick={() => onEdit(e.id)}
                            className="inline-flex items-center cursor-pointer"
                            style={{
                              gap: 5, padding: "6px 10px", fontSize: 12, color: "#B07848",
                              background: "#F7F0E3", border: "1px solid #D4BFA0",
                              fontFamily: "inherit",
                            }}>
                            <Pencil className="w-3 h-3" /> Edit
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
    </div>
  );
}
```

- [ ] **Step 2: Pass the month down from the section**

In `src/components/admin/owners/overhead/OverheadSection.tsx`, change the `month` state so it
can be changed, replacing:

```tsx
  const [month] = useState(() => new Date().toISOString().slice(0, 7));
```

with:

```tsx
  const [month, setMonth] = useState<string | null>(() => currentMonthKey());
```

Add `currentMonthKey` to the MonthNavigator import at the top of the file:

```tsx
import { currentMonthKey } from "@/components/admin/owners/MonthNavigator";
```

Update the `ExpenseList` render to pass the month:

```tsx
        <ExpenseList
          month={month}
          onMonthChange={setMonth}
          onEdit={(id) => { setEditingId(id); setFormOpen(true); }}
          onCreate={() => { setEditingId(null); setFormOpen(true); }}
        />
```

The `PeriodQueue` and `OverheadDashboard` renders both take `month={month}` today and require
a `string`. Since `month` is now `string | null`, pass the resolved value to those two:

```tsx
      {tab === "dashboard" && <OverheadDashboard month={month ?? currentMonthKey()} />}
      {tab === "payments" && <PeriodQueue month={month ?? currentMonthKey()} />}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint no worse than 94 errors / 57 warnings.

- [ ] **Step 4: Report**

Report build and lint. Do not commit.

---

### Task 5: Verification against live data

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all pass — the existing 52 plus the 18 from Task 1, so 70 total.

- [ ] **Step 2: Record the before figures**

With `npm run dev` and an Owner session, open Finance → Overhead → Dashboard for the current
month and write down: `accrued_total` ("This month"), `paid`, `estimated_annual`
("Est. annual"), and the Maintenance line in "By category". Then open Finance →
Profitability and write down Net and Margin under BOTH toggle positions.

- [ ] **Step 3: Add a one-off entry**

Finance → Overhead → Expenses → **Add expense**. Confirm the form opens with "Does this
repeat?" set to **No**, and that no Repeats / Due day / Starts / Ends fields are visible.

Enter: name `Laundry`, category `Maintenance`, amount `500`, date paid = today. Save.

Expected: the row appears in the list reading `One-off · paid <today>`, with a Delete action
and no "paused" label.

- [ ] **Step 4: Reconcile**

Re-check every figure from Step 2.

Expected, exactly:
- `accrued_total` +₱500
- `paid` +₱500
- Maintenance in "By category" +₱500
- **`estimated_annual` unchanged** — this is the `active: false` decision working; if it moved
  by ₱500, the flag is not being set
- Profitability Net −₱500 under BOTH toggle positions — but ONLY on the accrued figures.
  The trend's dashed *normalised* line must NOT move: it derives from `monthlyEquivalent`
  over `WHERE active` rows, and a one-off is both inactive and carries
  `PER_YEAR['one-time'] = 0`, so it contributes ₱0 there by design (spec §3). If the
  normalised line moves, something is wrong; if it stays flat, that is correct.
- The one-off must NOT appear in the Payments tab — it is already settled

- [ ] **Step 5: Check the month scoping**

Step the month navigator on the Expenses tab back one month.

Expected: the `Laundry` row disappears, every recurring bill still lists.

- [ ] **Step 6: Check the guards**

In the browser console with the Owner session:

```js
// Future date — expect 400 with the "has not happened yet" message.
await (await fetch('/api/admin/overhead/spend', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Future', category_id: '<any category id>', amount: 100, spent_on: '2027-01-01' }),
})).json();

// Deleting a RECURRING expense through the spend route — expect 400, not a deletion.
await (await fetch('/api/admin/overhead/spend/<a recurring expense id>', { method: 'DELETE' })).json();
```

- [ ] **Step 7: Delete and re-reconcile**

Delete the `Laundry` row from the list. Confirm the browser prompt appears.

Expected: all five figures from Step 4 return to their Step 2 values.

- [ ] **Step 8: Confirm access control**

Sign in as a CSR. Expected: no Overhead tab, and both spend routes return 403.

- [ ] **Step 9: Report the summary**

Report each check with its result, the final build status, and lint counts. Confirm no
migration was needed.

---

## Out of scope

Carried from the spec so nothing is silently dropped:

- Per-booking cost allocation (§16 of the parent overhead spec)
- Editing a one-off entry — delete and re-add is the correction path
- Receipt photo attachments
- Bulk entry of several one-offs at once
