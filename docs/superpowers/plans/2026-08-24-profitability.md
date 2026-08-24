# Profitability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance → Profitability tab showing monthly revenue minus overhead, with a twelve-month net-profit trend.

**Architecture:** All arithmetic lives in a pure, unit-tested module (`src/lib/profitability.ts`); the React component only fetches and renders. Three existing month-aware endpoints supply the data — there is no controller, route, slice, migration or dependency work in this plan.

**Tech Stack:** Next.js 16 App Router, TypeScript, RTK Query, vitest (dev), inline styles matching the owner dashboard.

**Spec:** [docs/superpowers/specs/2026-08-24-profitability-design.md](../specs/2026-08-24-profitability-design.md)

## Global Constraints

- **Git is manual.** The user stages and commits. No task commits, pushes, or creates branches. Each task ends by reporting what changed.
- **`npm run build` must pass** before any task is considered done. Vercel fails the deploy on any TS or lint error.
- **Lint baseline is 94 errors / 57 warnings.** New code must not raise those counts. Verify with `npm run lint 2>&1 | tail -3`.
- **No backend changes.** No file under `src/backend/`, `src/app/api/`, or `src/redux/` may be modified. If a task appears to need one, stop and report — it means the spec was wrong.
- **No new npm dependencies.**
- **Currency is PHP only.**
- **Owner-only.** The tab is hidden for non-Owner sessions via the existing `isOwner` flag.
- **Never divide by zero.** Margin is `null` (rendered `—`) whenever revenue is 0.
- **No setState inside an effect.** The React Compiler lint rule is part of the baseline; seed state from props or `useState` initialisers instead.

---

### Task 1: Pure profitability module with vitest

**Files:**
- Create: `src/lib/profitability.ts`
- Create: `src/lib/profitability.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `monthsToCover(selectedMonth: string | null, today: Date): number`
  - `netProfit(revenue: number, overhead: number): number`
  - `marginPct(revenue: number, net: number): number | null`
  - `interface TrendPoint { month: string; revenue: number; overheadAccrued: number; overheadNormalized: number; net: number; netNormalized: number }`
  - `buildTrend(overheadTrend: OverheadTrendRow[], revenueRows: RevenueRow[], basis: "gross" | "collected"): TrendPoint[]`
  - `type OverheadTrendRow = { month: string; accrued: number; normalized: number }`
  - `type RevenueRow = { month: string; revenue: number | string; gross_revenue: number | string }`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/profitability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  monthsToCover,
  netProfit,
  marginPct,
  buildTrend,
  type OverheadTrendRow,
  type RevenueRow,
} from "./profitability";

describe("netProfit", () => {
  it("subtracts overhead from revenue", () => {
    expect(netProfit(24500, 12000)).toBe(12500);
  });

  it("goes negative when overhead exceeds revenue", () => {
    expect(netProfit(5000, 12000)).toBe(-7000);
  });

  it("treats missing figures as zero", () => {
    expect(netProfit(NaN, 12000)).toBe(-12000);
    expect(netProfit(5000, NaN)).toBe(5000);
  });
});

describe("marginPct", () => {
  it("expresses net as a percentage of revenue", () => {
    expect(marginPct(24500, 12500)).toBeCloseTo(51.02, 1);
  });

  it("returns null when revenue is zero so the caller renders a dash", () => {
    expect(marginPct(0, -12000)).toBeNull();
  });

  it("returns null rather than Infinity for a negative-zero revenue", () => {
    expect(marginPct(-0, 500)).toBeNull();
  });

  it("can be negative", () => {
    expect(marginPct(10000, -5000)).toBeCloseTo(-50, 5);
  });
});

describe("monthsToCover", () => {
  const today = new Date(2026, 7, 24); // August 2026, local time

  it("asks for at least twelve months when the current month is selected", () => {
    expect(monthsToCover("2026-08", today)).toBe(12);
  });

  it("reaches back far enough to cover a window ending a year ago", () => {
    // Window starts 2024-09; that is 23 months before 2026-08, +1 = 24.
    expect(monthsToCover("2025-08", today)).toBe(24);
  });

  it("never returns fewer than twelve", () => {
    expect(monthsToCover("2026-12", today)).toBe(12);
  });

  it("clamps to the endpoint's 120-month ceiling", () => {
    expect(monthsToCover("2000-01", today)).toBe(120);
  });

  it("falls back to twelve when no month is selected", () => {
    expect(monthsToCover(null, today)).toBe(12);
  });
});

describe("buildTrend", () => {
  const overhead: OverheadTrendRow[] = [
    { month: "2026-07", accrued: 10000, normalized: 9000 },
    { month: "2026-08", accrued: 12000, normalized: 9000 },
  ];
  const revenue: RevenueRow[] = [
    { month: "2026-07", revenue: "8000", gross_revenue: "20000" },
    { month: "2026-08", revenue: "19890", gross_revenue: "24500" },
  ];

  it("joins on the month key and computes net per month", () => {
    const out = buildTrend(overhead, revenue, "gross");
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      month: "2026-08",
      revenue: 24500,
      overheadAccrued: 12000,
      net: 12500,
    });
  });

  it("uses collected revenue when the basis is collected", () => {
    const out = buildTrend(overhead, revenue, "collected");
    expect(out[1].revenue).toBe(19890);
    expect(out[1].net).toBe(7890);
  });

  it("keeps the overhead trend's month ordering", () => {
    const out = buildTrend(overhead, revenue, "gross");
    expect(out.map((p) => p.month)).toEqual(["2026-07", "2026-08"]);
  });

  it("contributes zero revenue for a month the revenue series lacks", () => {
    const out = buildTrend(overhead, [revenue[1]], "gross");
    expect(out[0]).toMatchObject({ month: "2026-07", revenue: 0, net: -10000 });
  });

  it("carries a normalized net alongside the accrued one", () => {
    const out = buildTrend(overhead, revenue, "gross");
    expect(out[1].netNormalized).toBe(24500 - 9000);
  });

  it("coerces string numerics from the API", () => {
    const out = buildTrend(overhead, revenue, "collected");
    expect(typeof out[0].revenue).toBe("number");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- profitability`
Expected: FAIL — `Failed to resolve import "./profitability"`.

- [ ] **Step 3: Implement the module**

Create `src/lib/profitability.ts`:

```ts
/**
 * Profit arithmetic for the Finance → Profitability tab.
 *
 * Pure by design: the component fetches and renders, this decides what the
 * numbers mean. See docs/superpowers/specs/2026-08-24-profitability-design.md.
 */

export type OverheadTrendRow = { month: string; accrued: number; normalized: number };
export type RevenueRow = { month: string; revenue: number | string; gross_revenue: number | string };

export interface TrendPoint {
  month: string;
  revenue: number;
  overheadAccrued: number;
  overheadNormalized: number;
  net: number;
  netNormalized: number;
}

/** The API returns numerics as strings; anything unparseable is zero. */
const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function netProfit(revenue: number, overhead: number): number {
  return num(revenue) - num(overhead);
}

/**
 * Net as a percentage of revenue, or null when revenue is zero — the caller
 * renders a dash. Returning null rather than 0 keeps "no margin to speak of"
 * distinct from "a genuine 0% margin".
 */
export function marginPct(revenue: number, net: number): number | null {
  const r = num(revenue);
  if (r === 0) return null;
  return (num(net) / r) * 100;
}

const MIN_MONTHS = 12;
const MAX_MONTHS = 120; // the endpoint's own ceiling: safeIntStr(..., 6, 120)

/**
 * How many months of revenue history to request so the twelve-month trend
 * window is fully covered.
 *
 * The two series are anchored differently: the overhead trend ends at the
 * SELECTED month, but getMonthlyRevenue measures back from NOW(). Requesting a
 * flat 12 would return nothing for the window whenever an older month is
 * picked, and the chart would draw a year of fabricated zero revenue against
 * real overhead — every month reading as a loss.
 */
export function monthsToCover(selectedMonth: string | null, today: Date): number {
  if (!selectedMonth) return MIN_MONTHS;

  const [y, m] = selectedMonth.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return MIN_MONTHS;

  // Oldest month the trend will draw.
  const windowStart = y * 12 + (m - 1) - 11;
  const now = today.getFullYear() * 12 + today.getMonth();

  const span = now - windowStart + 1;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, span));
}

/**
 * One point per month of the overhead trend, joined to revenue on the month
 * key. The overhead series drives the ordering and membership: a month it
 * lists but revenue lacks contributes zero revenue rather than vanishing, so
 * a month with bills and no bookings still shows as the loss it is.
 */
export function buildTrend(
  overheadTrend: OverheadTrendRow[],
  revenueRows: RevenueRow[],
  basis: "gross" | "collected",
): TrendPoint[] {
  const byMonth = new Map(
    revenueRows.map((r) => [
      r.month,
      basis === "gross" ? num(r.gross_revenue) : num(r.revenue),
    ]),
  );

  return overheadTrend.map((o) => {
    const revenue = byMonth.get(o.month) ?? 0;
    const overheadAccrued = num(o.accrued);
    const overheadNormalized = num(o.normalized);
    return {
      month: o.month,
      revenue,
      overheadAccrued,
      overheadNormalized,
      net: revenue - overheadAccrued,
      netNormalized: revenue - overheadNormalized,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- profitability`
Expected: PASS, 18 tests.

- [ ] **Step 5: Verify the build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint no worse than 94 errors / 57 warnings.

- [ ] **Step 6: Report**

Report the test count, build status and lint counts. Do not commit.

---

### Task 2: The Profitability section component

**Files:**
- Create: `src/components/admin/owners/finance/ProfitabilitySection.tsx`

**Interfaces:**
- Consumes: `monthsToCover`, `netProfit`, `marginPct`, `buildTrend` from `@/lib/profitability`; `MonthNavigator` from `@/components/admin/owners/MonthNavigator`; `useGetOverheadDashboardQuery` from `@/redux/api/overheadApi`; `useGetAnalyticsSummaryQuery`, `useGetMonthlyRevenueQuery` from `@/redux/api/analyticsApi`
- Produces: `export function ProfitabilitySection({ month, onMonthChange, onGoToOverhead }: { month: string | null; onMonthChange: (m: string | null) => void; onGoToOverhead: () => void }): JSX.Element`

Note the component does **not** own the month. `page.tsx` holds `selectedMonth` for the whole Finance area, so the tab receives it and reports changes upward — that is what keeps Revenue Management and Profitability in step.

- [ ] **Step 1: Write the component**

Create `src/components/admin/owners/finance/ProfitabilitySection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MonthNavigator } from "@/components/admin/owners/MonthNavigator";
import { useGetOverheadDashboardQuery } from "@/redux/api/overheadApi";
import {
  useGetAnalyticsSummaryQuery,
  useGetMonthlyRevenueQuery,
} from "@/redux/api/analyticsApi";
import {
  monthsToCover,
  netProfit,
  marginPct,
  buildTrend,
} from "@/lib/profitability";

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, monospace";

const LOSS = "#9a4a3a";   // same tone the overhead queue uses for overdue
const GAIN = "#1f1b16";

export function ProfitabilitySection({
  month, onMonthChange, onGoToOverhead,
}: {
  month: string | null;
  onMonthChange: (m: string | null) => void;
  onGoToOverhead: () => void;
}) {
  const [basis, setBasis] = useState<"collected" | "gross">("collected");

  const { data: overheadRes, isLoading: overheadLoading } =
    useGetOverheadDashboardQuery({ month: month ?? undefined });
  const { data: summaryRes, isLoading: summaryLoading } =
    useGetAnalyticsSummaryQuery({ period: "30", month });
  const { data: monthlyRes } =
    useGetMonthlyRevenueQuery({ months: String(monthsToCover(month, new Date())) });

  const o = overheadRes?.data;
  const s = summaryRes?.data;
  const monthly = monthlyRes?.data ?? [];

  // A half-loaded subtraction shows a wrong number, so gate on both.
  if (overheadLoading || summaryLoading) {
    return <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>;
  }

  const revenue = basis === "gross"
    ? Number(s?.total_gross_revenue ?? 0)
    : Number(s?.total_revenue ?? 0);
  const overhead = basis === "gross"
    ? Number(o?.accrued_total ?? 0)
    : Number(o?.paid ?? 0);

  const net = netProfit(revenue, overhead);
  const margin = marginPct(revenue, net);

  const monthLabel = month
    ? new Date(month + "-01").toLocaleString("en", { month: "long", year: "numeric" })
    : "Last 30 days";

  // With no expenses recorded the margin is arithmetically 100% and completely
  // misleading, so say so plainly instead of showing a figure.
  const noExpenses = (o?.estimated_annual ?? 0) === 0 && (o?.accrued_total ?? 0) === 0;

  const trend = buildTrend(o?.trend ?? [], monthly, basis);
  const maxAbs = Math.max(1, ...trend.map((p) => Math.abs(p.net)), ...trend.map((p) => Math.abs(p.netNormalized)));
  const anyLoss = trend.some((p) => p.net < 0);

  const cells = [
    { label: `Revenue · ${monthLabel}`, value: peso(revenue), color: GAIN },
    { label: `Overhead · ${monthLabel}`, value: peso(overhead), color: GAIN },
    { label: `Net ${basis === "gross" ? "profit" : "position"} · ${monthLabel}`,
      value: peso(net), color: net < 0 ? LOSS : GAIN },
    { label: "Margin", value: margin === null ? "—" : `${margin.toFixed(1)}%`,
      color: margin !== null && margin < 0 ? LOSS : GAIN },
  ];

  return (
    <div>
      <div className="flex items-center flex-wrap mb-6" style={{ gap: 12 }}>
        <div className="inline-flex" style={{ border: "1px solid #D4BFA0", background: "#F7F0E3" }}>
          <button type="button" onClick={() => setBasis("collected")}
            className="cursor-pointer"
            style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: basis === "collected" ? "#1f1b16" : "#8a8276", background: basis === "collected" ? "#fff" : "transparent", border: "none" }}>
            Collected
          </button>
          <button type="button" onClick={() => setBasis("gross")}
            className="cursor-pointer"
            style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: basis === "gross" ? "#1f1b16" : "#8a8276", background: basis === "gross" ? "#fff" : "transparent", border: "none", borderLeft: "1px solid #D4BFA0" }}>
            Gross Revenue
          </button>
        </div>
        <MonthNavigator
          value={month}
          onChange={onMonthChange}
          monthsWithData={monthly.map((m) => m.month)}
        />
      </div>

      <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 16px" }}>
        {basis === "gross"
          ? "Full booked value of this month's stays, less every bill due for the month."
          : "Payments received for this month's stays, less the bills for the month already settled."}
      </p>

      {noExpenses ? (
        <div style={{ background: "#F7F0E3", border: "1px solid #D4BFA0", padding: 24 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: "0 0 8px", lineHeight: 1, color: "#1f1b16" }}>
            No overhead recorded yet
          </h3>
          <p style={{ fontSize: 13, color: "#5a4a3a", margin: 0, maxWidth: 560 }}>
            Profit needs costs to subtract. Add your recurring expenses — rent, utilities,
            internet, association dues — and this month&apos;s figures will appear here.
            Until then the margin would read 100%, which is arithmetically true and badly
            misleading.
          </p>
          <button type="button" onClick={onGoToOverhead}
            className="cursor-pointer"
            style={{ marginTop: 16, padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#faf7f1", background: "#1f1b16", border: "none", fontFamily: "inherit" }}>
            Add overhead expenses
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 mb-6"
            style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
            {cells.map((c) => (
              <div key={c.label} style={{ background: "#fff", padding: "20px 22px" }}>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: c.color }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 12, color: "#8a8276", marginTop: 8 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
            <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>
              Net profit — twelve months
            </h3>
            <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 20px" }}>
              Accrual basis. Bars are each month&apos;s revenue less the overhead that
              accrued to it; the dashed line spreads non-monthly bills evenly, so a
              quarterly or annual charge does not read as a one-month loss.
            </p>

            {trend.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>No data for this range.</p>
            ) : (
              <div className="flex items-end" style={{ gap: 6, height: 190 }}>
                {trend.map((p) => {
                  const barPct = (Math.abs(p.net) / maxAbs) * 100;
                  const normPct = (p.netNormalized / maxAbs) * 100;
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center" style={{ gap: 6 }}>
                      <div style={{ width: "100%", height: 150, position: "relative", display: "flex", flexDirection: "column", justifyContent: anyLoss ? "center" : "flex-end" }}>
                        {anyLoss && (
                          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px solid #ece5d4" }} />
                        )}
                        <div style={{
                          width: "100%",
                          height: `${Math.max(1, barPct / (anyLoss ? 2 : 1))}%`,
                          alignSelf: "flex-end",
                          background: p.net < 0 ? LOSS : (p.month === month ? "#B07848" : "#E8D9C0"),
                          transform: p.net < 0 ? "translateY(100%)" : "none",
                        }} />
                        <div style={{
                          position: "absolute", left: 0, right: 0,
                          bottom: anyLoss ? `calc(50% + ${normPct / 2}%)` : `${Math.max(0, normPct)}%`,
                          borderTop: "1px dashed #8B6344",
                        }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: "#b0a695" }}>
                        {p.month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint no worse than 94 errors / 57 warnings.

The component is not reachable yet — Task 3 wires the tab. That is expected.

- [ ] **Step 3: Report**

Report build and lint. Do not commit.

---

### Task 3: Wire the Finance → Profitability tab

**Files:**
- Modify: `src/app/admin/owners/page.tsx`

**Interfaces:**
- Consumes: `ProfitabilitySection` from Task 2; the existing `selectedMonth` / `setSelectedMonth` state and `isOwner` flag
- Produces: a reachable Owner-only tab

- [ ] **Step 1: Add the import**

In `src/app/admin/owners/page.tsx`, beside the other owner-component imports (next to the `MonthNavigator` import added earlier):

```tsx
import { ProfitabilitySection } from "@/components/admin/owners/finance/ProfitabilitySection";
```

- [ ] **Step 2: Widen the finance tab union**

At line ~158, change:

```tsx
  const [financeTab, setFinanceTab]   = useState<"revenue"|"methods"|"promotions"|"overhead">("revenue");
```

to:

```tsx
  const [financeTab, setFinanceTab]   = useState<"revenue"|"methods"|"promotions"|"overhead"|"profitability">("revenue");
```

- [ ] **Step 3: Add the tab and render the section**

Replace the existing finance `tabBar(...)` call and the line after it:

```tsx
          {tabBar([
            { id: "revenue", label: "Revenue Management", icon: PhilippinePeso },
            { id: "methods", label: "Payment Methods", icon: CreditCard },
            { id: "promotions", label: "Promotions", icon: Sparkles },
            ...(isOwner ? [{ id: "overhead", label: "Overhead", icon: Receipt }] : []),
          ], financeTab, (id) => setFinanceTab(id as "revenue" | "methods" | "promotions" | "overhead"))}
          {financeTab === "overhead" && isOwner && <OverheadSection />}
```

with:

```tsx
          {tabBar([
            { id: "revenue", label: "Revenue Management", icon: PhilippinePeso },
            { id: "methods", label: "Payment Methods", icon: CreditCard },
            { id: "promotions", label: "Promotions", icon: Sparkles },
            ...(isOwner ? [{ id: "overhead", label: "Overhead", icon: Receipt }] : []),
            ...(isOwner ? [{ id: "profitability", label: "Profitability", icon: TrendingUp }] : []),
          ], financeTab, (id) => setFinanceTab(id as "revenue" | "methods" | "promotions" | "overhead" | "profitability"))}
          {financeTab === "overhead" && isOwner && <OverheadSection />}
          {financeTab === "profitability" && isOwner && (
            <ProfitabilitySection
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              onGoToOverhead={() => setFinanceTab("overhead")}
            />
          )}
```

`TrendingUp` is already imported in this file for the Occupancy Rate KPI — do **not** add another import for it.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build` then `npm run lint 2>&1 | tail -3`
Expected: build exit 0, `/admin/owners` still compiles; lint no worse than 94 errors / 57 warnings.

- [ ] **Step 5: Report**

Report build and lint, and confirm the tab appears in the route output. Do not commit.

---

### Task 4: Verification against live data

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm test`
Expected: all tests pass — the 34 existing `overheadSchedule` tests plus the 18 from Task 1.

- [ ] **Step 2: Confirm the empty state**

With `npm run dev` and an Owner session, go to Finance → Profitability.

Expected, while `overhead_expenses` is empty: the "No overhead recorded yet" panel, **not** a 100% margin.

- [ ] **Step 3: Add a real expense and reconcile**

Under Finance → Overhead, add a monthly expense — for example Property / "Condo rent" / ₱15,000 / monthly / due day 5 / starting the 1st of the current month. Return to Profitability.

Expected: the four cells appear. Check by hand that `Net = Revenue − Overhead` and that `Margin = Net ÷ Revenue × 100`, in **both** toggle positions. The two positions should differ, because collected revenue is lower than gross and a newly added bill is unpaid.

- [ ] **Step 4: Cross-check the trend against the overhead dashboard**

Note the bar values for two or three months on the Profitability trend, then open Finance → Overhead → Dashboard for the same months.

Expected: `profitability bar = that month's revenue − the overhead dashboard's accrued figure`. If a bar disagrees, the month-key join in `buildTrend` is at fault — not the arithmetic, which Task 1 covers.

- [ ] **Step 5: Check an old month does not fabricate losses**

Pick a month more than twelve months back in the navigator.

Expected: revenue for the covered months is real, not a uniform ₱0 producing twelve identical loss bars. This is the `monthsToCover` behaviour; if every bar is a loss of exactly the overhead amount, the computed `months` argument is not reaching the window.

- [ ] **Step 6: Confirm access control**

Sign in as a CSR.

Expected: no Profitability tab in Finance.

- [ ] **Step 7: Report the summary**

Report each check with its result, the final build status, and lint counts before and after. Note that no migration is needed for this feature, since it adds no tables or columns.

---

## Out of scope

Carried forward from the spec, so nothing is silently dropped:

- Cash-flow view (money in and out by transaction date, both sides)
- Overhead per available night and break-even nights (§15–16)
- Per-booking overhead allocation (§16)
- A dedicated `/api/admin/overhead/profitability` endpoint — revisit if the per-night work lands
