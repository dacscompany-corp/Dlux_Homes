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
