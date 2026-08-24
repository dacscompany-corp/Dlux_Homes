# One-off spend entries

Closes a gap in the overhead module: it assumes every cost is a *scheduled bill*. Laundry,
supplies and repairs are not. They have no due day, no frequency, and no gap between owing
and paying — the owner hands over cash and it is done.

Extends [2026-08-23-overhead-expense-management-design.md](2026-08-23-overhead-expense-management-design.md).
Adds no tables and no columns.

## 1. The distinction, and where it does NOT apply

A recurring expense is a **rule**: "₱15,000, monthly, due the 5th," which keeps generating
future bills. A one-off entry is a **fact**: "₱500, paid Aug 3." Editing a rule changes what
happens next month; editing a fact changes one thing that already happened. Pausing a rule is
meaningful; pausing a fact is not.

That distinction is real in the data and must be preserved. It is **not** a distinction the
owner should have to navigate. Every view that answers "what did this month cost me" — the
Dashboard totals, the category breakdown, the Payments queue, both Profitability bases —
already reads `overhead_expense_periods`, which will hold both kinds. The money is unified
today. Only *entry* and *listing* are in question, and those get one list and one button.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Storage | **Reuse the existing three tables.** A one-off is a `frequency: 'one-time'` expense plus its single period plus a payment. No migration; every aggregate keeps working untouched. |
| 2 | Entry surface | **One list, one "Add expense" button.** The form's first question is "Does this repeat?"; the answer reveals either the schedule fields or the paid-on-the-spot fields. |
| 3 | Default answer | **No (one-off).** Recurring rules are configured perhaps a dozen times ever; one-off spend is a weekly act. |
| 4 | Converting between kinds | **Not supported.** Edit reaches recurring rules only; a one-off already has a period and a payment behind it, and its correction path is Delete (#7). |
| 5 | `active` flag on one-offs | **`false`.** Literally true — nothing further to generate — and it keeps one-offs out of `ensureMaterialized`'s scan and out of `estimatedAnnual`, so a ₱500 laundry run cannot inflate the Est. annual figure. |
| 6 | List scope | **All recurring rules always; one-off entries for the selected month only.** Rules are a standing configuration; entries accumulate weekly and would otherwise bury the rent after a year. |
| 7 | Correcting a mistake | **Delete**, cascading payment → period → expense in one transaction. A deliberate exception to the parent spec's Decision #6, scoped strictly to `one-time`. |
| 8 | Future dates | **Rejected.** You cannot already have paid for something that has not happened. |

## 3. Why `one-time` already fits

Verified in the existing code, not assumed:

- `occurrencesBetween` (`src/lib/overheadSchedule.ts`) special-cases `one-time`: exactly one
  occurrence at `start_date`, and `dueDateFor` returns the period start when no `due_day` is
  set. A one-off needs no due day and gets none.
- `PER_YEAR["one-time"] = 0`, so `monthlyEquivalent` returns 0. A one-off contributes
  **nothing** to the trend's normalised line — correct, since a single purchase must not be
  smoothed into a monthly average. It still appears in the accrued bars.
- `overhead_expenses` requires `name`, `category_id`, `amount > 0`, `frequency` and
  `start_date`. A one-off supplies all five; `due_day`, `end_date`, `interval_*` stay NULL,
  and no CHECK constraint objects.

## 4. The write path

`POST /api/admin/overhead/spend`

Body: `{ name, category_id, amount, spent_on, method?, reference?, notes? }`

One transaction:

| Step | Row | Values |
|---|---|---|
| 1 | `overhead_expenses` | `frequency: 'one-time'`, `start_date = spent_on`, `due_day: NULL`, `active: false`, `generated_through = spent_on` |
| 2 | `overhead_expense_periods` | `period_start`/`period_end`/`due_date` all `spent_on`; `amount_due = amount`; `status: 'paid'`; `accrual_month` = first of `spent_on`'s month |
| 3 | `overhead_expense_payments` | `paid_on = spent_on`, full `amount`, optional `method` / `reference` / `notes`, `recorded_by` = actor |
| 4 | audit | `overhead_spend.created`, matching the module's other mutations |

Validation, all before the transaction opens:

- `spent_on` matches `^\d{4}-\d{2}-\d{2}$` and is **not** after today in Manila.
- `amount` is finite and > 0.
- `name` is non-empty after trimming.
- `category_id` exists and is active — a 400 with a readable message, not a foreign-key error.

`generated_through = spent_on` is set so the row is fully settled at birth; combined with
`active: false` it is invisible to `ensureMaterialized`.

## 5. The delete path

`DELETE /api/admin/overhead/spend/[id]`

Refuses with 400 unless the target's `frequency = 'one-time'`. This is what keeps the
exception narrow: `deleteExpense` on the normal route retains its 409 guard, so a recurring
bill with payment history still cannot be erased. Then, in one transaction: delete the
payments for the expense's periods, delete the periods, delete the expense. Audited as
`overhead_spend.deleted` with the amount and date, so the deletion itself leaves a trace even
though the rows do not.

## 6. Entry form

One modal, reached by one "Add expense" button.

**First control:** "Does this repeat?" — No (default) / Yes.

| Answer | Fields |
|---|---|
| **No** | What was it? · Category · Amount · Date paid (defaults today) · Method, Reference, Notes (all optional) |
| **Yes** | What was it? · Category · Amount · Repeats · Due day · Starts · Ends · Notes — the form as it exists today |

The category control keeps the inline "+ New category…" flow already built.

**Edit applies to recurring expenses only.** One-off rows offer Delete, not Edit (§7), and
editing them is out of scope (§12) — so the edit form always shows the recurring branch and
never renders the repeat toggle. `updateExpense` on the existing route is left untouched;
nothing in the UI can reach a `one-time` row through it.

## 7. List

A single table on the Expenses tab, with the existing `MonthNavigator` above it.

| Column | Recurring row | One-off row |
|---|---|---|
| Expense | name | name |
| Category | category | category |
| Amount | amount | amount |
| When | `Monthly · next due Sep 5` | `One-off · paid Aug 3` |
| Action | Edit | Delete |

Ordering: recurring rules first (category sort order, then name), then one-off entries newest
first.

The "paused" treatment — dimmed row, *paused* label — becomes conditional on the row being
recurring. A one-off carries `active: false` for the reasons in Decision #5, and rendering
that as "paused" would be meaningless.

The Payments tab lists every period for the selected month with a Status column, not unpaid
periods only — `getPeriods` filters by status only when one is supplied, and no caller
supplies one. A one-off therefore DOES appear there, marked Paid, which is truthful. An
earlier draft of this section claimed otherwise; that was wrong about how the tab works.

Left as-is deliberately. Adding a status filter would change what the Payments tab means, and
that decision belongs with whoever wants it. The cost of not filtering is that settled
one-offs accumulate alongside genuinely unpaid bills — worth revisiting if the tab gets noisy.

## 8. What needs no change

Stated explicitly, because the value of Decision #1 is everything it leaves alone:

- `overhead_expense_periods` / `overhead_expense_payments` schema and every aggregate over them
- Dashboard `accrued_total`, `paid`, `unpaid`, `overdue`, `by_category`, `trend`
- Both Profitability bases, its trend, and its empty-state detector
- `ensureMaterialized`, `materializeExpense`, and the whole schedule module
- Any migration — there is none

## 9. Edge cases

| Condition | Behaviour |
|---|---|
| `spent_on` in the future | 400, "You cannot record a payment for a date that has not happened yet." |
| Amount ≤ 0 or non-numeric | 400 from validation, before the transaction opens |
| Category missing or inactive | 400 naming the problem, rather than a raw FK violation |
| Delete attempted on a recurring expense via the spend route | 400; the normal route's 409 guard is untouched |
| A month with one-off entries but no recurring rules | Renders normally — periods exist, so every total is real |
| Selected month has no one-off entries | The recurring rules still list; no empty state for the tab as a whole |

## 10. Verification

1. Unit tests for the pure validation rules (future date, amount, month key derivation).
2. `npm run build` exit 0; lint no worse than the 94 errors / 57 warnings baseline.
3. Against live data, the reconciliation this module has needed twice before: adding a ₱500
   one-off must move `accrued_total`, `paid`, its category's line in the breakdown, and
   **both** Profitability bases by exactly ₱500 — and must move `estimated_annual` by ₱0.
4. Deleting that entry must return all five figures to their prior values.
5. A CSR session sees no Overhead tab and gets 403 from both new routes.

## 11. Files

| File | Change |
|---|---|
| `src/backend/controller/overheadSpendController.ts` | New. `createSpend`, `deleteSpend`. |
| `src/app/api/admin/overhead/spend/route.ts` | New. POST, `requireOwner`. |
| `src/app/api/admin/overhead/spend/[id]/route.ts` | New. DELETE, `requireOwner`. |
| `src/lib/overheadSpend.ts` + `.test.ts` | New. Pure validation — future-date check, amount, accrual-month derivation. |
| `src/redux/api/overheadApi.ts` | Add `createOverheadSpend`, `deleteOverheadSpend`; both invalidate `OverheadExpense`, `OverheadPeriod`, `OverheadDashboard`. |
| `src/components/admin/owners/overhead/ExpenseFormModal.tsx` | The repeat toggle and its two field branches. |
| `src/components/admin/owners/overhead/ExpenseList.tsx` | Month navigator, the *When* column, per-type actions, conditional "paused". |
| `src/backend/controller/overheadController.ts` | `getExpenses` ordering, and a `month` parameter scoping one-off rows. |

No migration. No change to any file under `src/backend/controller/overheadPeriodsController.ts`
or `overheadReportsController.ts`.

## 12. Out of scope

- Per-booking cost allocation (§16 of the parent spec) — a one-off is not yet linked to a stay.
- Editing a one-off entry. Delete-and-re-add is the correction path (Decision #7); if editing
  is wanted later it must keep the period and payment consistent with the expense.
- Receipt photo attachments.
- Bulk entry of several one-offs at once.
