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
