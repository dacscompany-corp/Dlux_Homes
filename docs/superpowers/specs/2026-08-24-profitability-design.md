# Profitability — revenue vs overhead

Phase 2 of the overhead work. Answers one question for the Owner: **did this month make
money?** Revenue and overhead already exist as separate, month-aware subsystems; this joins
them and adds nothing to the database.

Supersedes the `§18 profitability integration` line deferred in
[2026-08-23-overhead-expense-management-design.md](2026-08-23-overhead-expense-management-design.md).
The per-available-night and allocation items (§15–16) remain deferred and are **not** part of
this spec.

## 1. What this is, and what it is not

**Is:** a monthly profit-and-loss view. Of the business belonging to a given month, how much
was earned and how much was owed, and what is left over.

**Is not:** a cash-flow statement. It cannot answer "did my bank balance grow in August",
because both revenue and overhead are attributed to the month the *business* belongs to, not
the month money moved. A July bill settled in August belongs to July here. Building the
cash-flow view means keying both sides to transaction dates and is its own spec — see §8.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What drives the figures | The **existing Collected/Gross toggle**, promoted to a real basis switch. No new control, no new concept for the Owner to learn. |
| 2 | Month attribution | Unchanged from the sources. Revenue by **stay month** (`check_in_date`); overhead by **accrual month**. Both already mean "belongs to this month", so they pair without mixing bases. |
| 3 | Backend work | **None.** Three existing endpoints already accept `month` and already return every field needed. Adding a `cash_paid` aggregate was considered and rejected — see §7. |
| 4 | Trend basis | **Accrued, always**, and labelled so. The overhead trend series carries no per-month settled figure, and inventing one for a chart is not worth a schema or payload change. |
| 5 | Non-monthly bills in the trend | Drawn **both ways**: bars on accrued overhead, a dashed line on normalized. Honours Decision #5 of the overhead spec — a ₱6,000 annual bill accruing wholly to one month must not read as a loss that month. |
| 6 | Zero-expense state | A dedicated prompt, **not** a 100% margin. See §6. |
| 7 | Access | **Owner only**, gated identically to the Overhead tab. |

## 3. Data sources

All three are already wired, already month-aware, and need no change.

| Hook | Fields consumed |
|---|---|
| `useGetOverheadDashboardQuery({ month })` | `accrued_total`, `paid`, `trend[] { month, accrued, normalized }` |
| `useGetAnalyticsSummaryQuery({ period: "30", month })` | `total_revenue`, `total_gross_revenue` |
| `useGetMonthlyRevenueQuery({ months })` | `[] { month, revenue, gross_revenue }` |

`period` is passed only because the argument is required; whenever `month` is set the server
ignores the rolling window entirely. `months` is **computed, not fixed** — see §5.

## 4. Computation

| | **Gross** (committed) | **Collected** (settled) |
|---|---|---|
| Revenue | `total_gross_revenue` | `total_revenue` |
| Overhead | `accrued_total` | `paid` |
| Net | `revenue − overhead` | `revenue − overhead` |
| Margin | `net ÷ revenue × 100` | `net ÷ revenue × 100` |

Both columns answer the same question at different degrees of certainty: Gross is what the
month committed to, Collected is what has actually changed hands. Each column is internally
consistent; the two are never mixed.

**Guards.**

- Revenue of 0 renders margin as `—`. Never divide by zero, never render `Infinity`.
- Net is displayed in `#9a4a3a` when negative, the tone already used for overdue periods.
- Every figure is coerced with `Number(x) || 0`; the endpoints return numerics as strings.

## 5. Trend

Twelve months ending at the selected month, joining the overhead `trend[]` to monthly revenue
on the `YYYY-MM` key.

**The two series are anchored differently, and this must be handled explicitly.** The overhead
trend ends at the *selected* month, but `getMonthlyRevenue` measures back from `NOW()`
(`WHERE b.check_in_date >= NOW() - INTERVAL '<months> months'`). Requesting a fixed 12 would
therefore return nothing for the trend window whenever the Owner picks a month more than a
year back, and the chart would show a full year of fabricated ₱0 revenue against real
overhead — every month reading as a loss.

So `months` is computed to reach the older end of the window:

```
months = monthsBetween(selectedMonth − 11 months, today) + 1, clamped to [12, 120]
```

120 is the endpoint's own ceiling (`safeIntStr(..., 6, 120)`). A window reaching further back
than 120 months is out of range; those months render as "no data" rather than as ₱0.

Within the covered window, a month present in one series and absent from the other contributes
0 for the missing side rather than being dropped, so a month with revenue and no overhead
still appears.

- **Bars** — net profit against accrued overhead. Point-in-time truth.
- **Dashed line** — net profit against normalized overhead. The smoothed line the eye should
  follow.

Negative bars render downward from the zero baseline in `#9a4a3a`. The zero line is drawn
whenever any month is negative, and omitted when none are, so a healthy trend stays quiet.

The trend is labelled *accrual basis* and does not follow the toggle (Decision #4).

## 6. Empty and edge states

| Condition | Behaviour |
|---|---|
| No active overhead expenses at all | Replace the figures with a prompt to add expenses, linking to the Overhead tab. **Never show a 100% margin** — with no costs recorded it is arithmetically true and completely misleading. |
| Expenses exist, none accrued this month | A genuine ₱0 overhead. Display normally. |
| Revenue 0, overhead > 0 | Net is negative, margin `—`. This is a real and important state — a month with bills and no bookings. |
| Either query still loading | Section-level loading line; no partial P&L, since a half-loaded subtraction shows a wrong number. |

## 7. Rejected: a `cash_paid` aggregate

An earlier draft proposed adding `SUM(amount) FROM overhead_expense_payments WHERE paid_on`
within the month, to drive the Collected column.

Rejected because it measures a different thing. `paid_on` totals are cash-flow timing — money
leaving the bank during August, including a July bill settled late. The revenue it would be
subtracted from is attributed by **stay month**. Pairing them produces a figure that is
neither cash flow nor profit, which is the same defect class as the `created_at` vs
`check_in_date` mismatch fixed on 2026-08-24, where the KPI cards read ₱0 for a month the
chart reported ₱14,241.

The existing `paid` field — settled bills, scoped to accrual month — is the correct partner
for stay-attributed collected revenue. Both mean "the settled portion of this month's
business".

## 8. Out of scope

Tracked so nothing is silently dropped.

- **Cash-flow view** — money in and out by transaction date, both sides. Needs revenue keyed
  to payment dates, which the booking payment tables support but no query does today.
- **Overhead per available night** and **break-even nights** — §15–16, still deferred. If both
  land, the client-side join in this spec should be reconsidered in favour of a dedicated
  `/api/admin/overhead/profitability` endpoint; at that point the shared computation stops
  being duplication and becomes the right home.
- **Per-booking overhead allocation** — §16, unchanged in its deferral.

## 9. Files

| File | Change |
|---|---|
| `src/components/admin/owners/finance/ProfitabilitySection.tsx` | New. The whole feature. |
| `src/app/admin/owners/page.tsx` | Fifth Finance sub-tab, `isOwner`-gated, sharing `selectedMonth`. |

The section renders its own `MonthNavigator` in the same row position as the other Finance
tabs. It binds to the page-level `selectedMonth`, so a month chosen here is reflected on
Revenue Management and Overview, matching the behaviour those tabs already have with each
other.

No controller, route, slice, migration or dependency changes.

## 10. Verification

1. `npm run build` — exit 0.
2. `npm run lint` — no worse than the 94 errors / 57 warnings baseline.
3. Reconcile against live data, as done for the November mismatch: for a chosen month confirm
   `net === revenue − overhead` in **both** toggle positions, and that the trend's bars match
   the Overhead dashboard's own figures for the same months.
4. Confirm the zero-expense state shows the prompt rather than a 100% margin.
5. Confirm a CSR session cannot see the tab.
