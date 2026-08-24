"use client";

import { useState } from "react";
import { MonthNavigator, currentMonthKey } from "@/components/admin/owners/MonthNavigator";
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

// getMonthlyRevenue's own ceiling (safeIntStr(..., 6, 120) server-side) — see
// monthsToCover's doc comment in @/lib/profitability. When monthsToCover
// clamps to this value the revenue window is incomplete, not empty.
const MAX_MONTHS = 120;

const monthKeyFromIndex = (monthIndex: number): string => {
  const year = Math.floor(monthIndex / 12);
  const monthNum = monthIndex - year * 12 + 1; // 1..12
  return `${year}-${String(monthNum).padStart(2, "0")}`;
};

export function ProfitabilitySection({
  month, onMonthChange, onGoToOverhead,
}: {
  month: string | null;
  onMonthChange: (m: string | null) => void;
  onGoToOverhead: () => void;
}) {
  const [basis, setBasis] = useState<"collected" | "gross">("collected");

  // A monthly P&L has no meaningful "all time" reading: the overhead endpoint
  // and the analytics endpoint fall back to two different windows (current
  // calendar month vs. trailing 30 days) when month is null. Coerce to the
  // current month so both sides of the subtraction describe the same window.
  const effectiveMonth = month ?? currentMonthKey();

  const { data: overheadRes, isLoading: overheadLoading } =
    useGetOverheadDashboardQuery({ month: effectiveMonth });
  const { data: summaryRes, isLoading: summaryLoading } =
    useGetAnalyticsSummaryQuery({ period: "30", month: effectiveMonth });
  const monthsSpan = monthsToCover(effectiveMonth, new Date());
  const { data: monthlyRes, isLoading: monthlyLoading } =
    useGetMonthlyRevenueQuery({ months: String(monthsSpan) });

  const o = overheadRes?.data;
  const s = summaryRes?.data;
  const monthly = monthlyRes?.data ?? [];

  // A half-loaded subtraction shows a wrong number, so gate on all three —
  // the monthly-revenue query is not awaited otherwise, and its payload
  // (up to 120 months) can resolve last, briefly drawing loss bars against
  // real overhead with no revenue data.
  if (overheadLoading || summaryLoading || monthlyLoading) {
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

  const monthLabel = new Date(effectiveMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" });

  // With no expenses recorded at all — nothing accrued, nothing estimated —
  // there is no overhead data yet; point the owner at Overhead instead of
  // showing figures built from zero.
  const noExpenses = (o?.estimated_annual ?? 0) === 0 && (o?.accrued_total ?? 0) === 0;

  // Even once expenses exist, the basis-appropriate overhead figure can still
  // be genuinely zero for this month (e.g. bills accrued but nothing settled
  // yet under Collected) while revenue is positive — margin computes to an
  // exact, misleading 100%. Guard the margin cell specifically for that case;
  // Revenue/Overhead/Net stay visible because they are all truthful.
  const noOverheadForBasis = !noExpenses && overhead === 0 && revenue > 0;

  // The chart below is always accrual basis regardless of the Collected/Gross
  // toggle (see caption) — pass a fixed "gross" so the overhead side (always
  // accrued/normalized) is never paired with collected revenue.
  const fullTrend = buildTrend(o?.trend ?? [], monthly, "gross");

  // getMonthlyRevenue has its own 120-month ceiling. When monthsToCover hits
  // it, the revenue window no longer reaches back far enough to cover every
  // month the overhead trend lists — buildTrend can't tell "genuinely zero
  // revenue" from "outside the requested window" and defaults both to 0, so
  // an old selected month would otherwise draw fabricated loss bars. Drop
  // trend points older than what the revenue query actually covers instead.
  const trendClampedAtCeiling = monthsSpan === MAX_MONTHS;
  let trend = fullTrend;
  let oldestCoveredMonthLabel: string | null = null;
  if (trendClampedAtCeiling) {
    const now = new Date();
    const oldestCoveredMonthKey = monthKeyFromIndex(
      now.getFullYear() * 12 + now.getMonth() - (monthsSpan - 1),
    );
    const withinWindow = fullTrend.filter((p) => p.month >= oldestCoveredMonthKey);
    if (withinWindow.length !== fullTrend.length) {
      trend = withinWindow;
      oldestCoveredMonthLabel = new Date(oldestCoveredMonthKey + "-01")
        .toLocaleString("en", { month: "long", year: "numeric" });
    }
  }

  const maxAbs = Math.max(1, ...trend.map((p) => Math.abs(p.net)), ...trend.map((p) => Math.abs(p.netNormalized)));
  const anyLoss = trend.some((p) => p.net < 0);

  const cells = [
    { label: `Revenue · ${monthLabel}`, value: peso(revenue), color: GAIN },
    { label: `Overhead · ${monthLabel}`, value: peso(overhead), color: GAIN },
    { label: `Net ${basis === "gross" ? "profit" : "position"} · ${monthLabel}`,
      value: peso(net), color: net < 0 ? LOSS : GAIN },
    { label: "Margin", value: (margin === null || noOverheadForBasis) ? "—" : `${margin.toFixed(1)}%`,
      color: margin !== null && margin < 0 ? LOSS : GAIN },
  ];

  return (
    <div>
      <div className="flex items-center flex-wrap mb-6" style={{ gap: 12 }}>
        <div className="inline-flex" style={{ border: "1px solid #D4BFA0", background: "#F7F0E3" }}>
          <button type="button" onClick={() => setBasis("collected")}
            className="cursor-pointer"
            aria-pressed={basis === "collected"}
            style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: basis === "collected" ? "#1f1b16" : "#8a8276", background: basis === "collected" ? "#fff" : "transparent", border: "none" }}>
            Collected
          </button>
          <button type="button" onClick={() => setBasis("gross")}
            className="cursor-pointer"
            aria-pressed={basis === "gross"}
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
        <div style={{ background: "#F7F0E3", border: "1px solid #D4BFA0", padding: 24, marginBottom: 24 }}>
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

          {noOverheadForBasis && (
            <p style={{ fontSize: 12, color: "#8a8276", margin: "-16px 0 24px" }}>
              {basis === "collected"
                ? `No overhead settled for ${monthLabel} yet, so there is no meaningful margin to show.`
                : `No overhead accrued for ${monthLabel}, so there is no meaningful margin to show.`}
            </p>
          )}
        </>
      )}

      <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>
          Net profit — twelve months
        </h3>
        <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 20px" }}>
          Accrual basis. Bars are each month&apos;s revenue less the overhead that
          accrued to it; the dashed line spreads non-monthly bills evenly, so a
          quarterly or annual charge does not read as a one-month loss.
          {oldestCoveredMonthLabel && (
            <> Revenue data only reaches back to {oldestCoveredMonthLabel}; earlier months are not shown.</>
          )}
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
                      background: p.net < 0 ? LOSS : (p.month === effectiveMonth ? "#B07848" : "#E8D9C0"),
                      // Only shift when the container is centred (anyLoss): the
                      // in-flow child starts spanning [zeroLine-h/2, zeroLine+h/2],
                      // so a loss bar needs +50% (top edge onto the line) and a
                      // profit bar needs -50% (bottom edge onto the line). When the
                      // container is flex-end (no losses this range) bars already
                      // rest on the floor, so no transform must be applied at all —
                      // do not collapse this back to a sign-only ternary.
                      transform: anyLoss ? (p.net < 0 ? "translateY(50%)" : "translateY(-50%)") : "none",
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
    </div>
  );
}
