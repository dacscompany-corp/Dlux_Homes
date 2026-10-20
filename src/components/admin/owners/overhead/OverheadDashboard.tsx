"use client";

import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { useGetOverheadDashboardQuery } from "@/redux/api/overheadApi";

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
const MONO = "'Geist Mono', ui-monospace, monospace";
const monthName = (key: string, style: "short" | "long" = "short") =>
  new Date(key + "-01").toLocaleString("en", { month: style, ...(style === "long" ? { year: "numeric" } : {}) });

export function OverheadDashboard({ month, onGoToPayments }: { month: string; onGoToPayments: () => void }) {
  const { data, isLoading } = useGetOverheadDashboardQuery({ month });
  const d = data?.data;

  if (isLoading) return <p style={{ fontSize: 13, color: "#8a8276" }}>Loading…</p>;
  if (!d) return null;

  const change = d.previous_month_total
    ? ((d.accrued_total - d.previous_month_total) / d.previous_month_total) * 100
    : null;
  const billed = d.paid + d.unpaid;
  const paidPct = billed > 0 ? Math.round((d.paid / billed) * 100) : 0;
  const maxTrend = Math.max(...d.trend.map((t) => Math.max(t.accrued, t.normalized)), 1);
  const maxCat = Math.max(...d.by_category.map((c) => c.amount), 1);
  const catTotal = d.by_category.reduce((n, c) => n + c.amount, 0) || 1;

  return (
    <div>
      {/* Overdue bills come first — the one thing that needs doing today. */}
      {d.overdue > 0 && (
        <div role="alert" className="flex items-center flex-wrap mb-5"
          style={{ gap: 12, padding: "14px 16px", background: "#fbecea", border: "1px solid #e3c9c2", color: "#9a4a3a" }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}>
            <strong>{peso(d.overdue)}</strong> in bills is overdue. Pay them and record the payment so the totals stay right.
          </span>
          <button type="button" onClick={onGoToPayments} className="inline-flex items-center cursor-pointer"
            style={{ gap: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#fff", background: "#9a4a3a", border: "none", fontFamily: "inherit" }}>
            See bills to pay <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* This month at a glance: what it cost, and how much of it is paid. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 mb-5" style={{ gap: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 22 }}>
          <div style={{ fontSize: 12, color: "#8a8276" }}>Running costs for {monthName(d.month, "long")}</div>
          <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#1f1b16", marginTop: 6 }}>
            {peso(d.accrued_total)}
          </div>
          {change === null ? (
            <div style={{ fontSize: 12.5, color: "#8a8276", marginTop: 8 }}>No figures for last month to compare with.</div>
          ) : (
            <div className="inline-flex items-center" style={{ gap: 6, fontSize: 12.5, marginTop: 8, color: change > 0 ? "#9a4a3a" : "#4a6a3a" }}>
              {change > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {change > 0 ? "Up" : "Down"} {Math.abs(change).toFixed(1)}% from last month ({peso(d.previous_month_total)})
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 22 }}>
          <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
            <span style={{ fontSize: 12, color: "#8a8276" }}>Bills this month</span>
            <span style={{ fontSize: 12, color: "#8a8276" }}>{paidPct}% paid</span>
          </div>
          <div style={{ height: 12, background: "#f3eee2", marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${paidPct}%`, background: "#7a8c5a", transition: "width .3s" }} />
          </div>
          <div className="grid grid-cols-2" style={{ gap: 12, marginTop: 14 }}>
            <div>
              <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: "#4a6a3a" }}>
                <span style={{ width: 8, height: 8, background: "#7a8c5a" }} />Paid
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: "#1f1b16", marginTop: 4 }}>{peso(d.paid)}</div>
            </div>
            <div>
              <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: d.overdue ? "#9a4a3a" : "#8a6a2f" }}>
                <span style={{ width: 8, height: 8, background: "#f3eee2", border: "1px solid #d9d1c2" }} />Still to pay
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, color: "#1f1b16", marginTop: 4 }}>{peso(d.unpaid)}</div>
              {d.overdue > 0 && <div style={{ fontSize: 11.5, color: "#9a4a3a", marginTop: 2 }}>{peso(d.overdue)} overdue</div>}
            </div>
          </div>
        </div>
      </div>

      {/* The bigger picture, each figure with a line saying what it means. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 mb-6" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
        {[
          { label: "Last month", value: peso(d.previous_month_total), note: d.previous_month_total ? "Total running costs" : "No figures recorded" },
          { label: "This year so far", value: peso(d.ytd_total), note: "From January up to this month" },
          { label: "Expected for the year", value: peso(d.estimated_annual), note: "If all regular bills continue as set up" },
        ].map((k) => (
          <div key={k.label} style={{ background: "#fff", padding: 18 }}>
            <div style={{ fontSize: 12, color: "#8a8276", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: "#8a8276", marginTop: 8 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: 20 }}>
        <div className="xl:col-span-2" style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>
            Month by month
          </h3>
          <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 12px" }}>
            How much each month cost. Hover a bar to see the amount.
          </p>
          {/* Legend, so the dashed line isn't a mystery. */}
          <div className="flex flex-wrap items-center" style={{ gap: 16, fontSize: 11.5, color: "#6b6358", marginBottom: 14 }}>
            <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: "#E8D9C0" }} />Month&apos;s cost</span>
            <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: "#B07848" }} />Selected month</span>
            <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 14, borderTop: "1px dashed #8B6344" }} />Usual monthly average (yearly bills spread out)</span>
          </div>
          <div className="flex items-end" style={{ gap: 6, height: 160 }}>
            {d.trend.map((t) => (
              <div key={t.month} className="flex-1 flex flex-col items-center" style={{ gap: 6 }}
                title={`${monthName(t.month, "long")}: ${peso(t.accrued)} (average ${peso(t.normalized)})`}>
                <div style={{ width: "100%", height: 130, display: "flex", alignItems: "flex-end", position: "relative" }}>
                  <div style={{ width: "100%", height: `${(t.accrued / maxTrend) * 100}%`, background: t.month === d.month ? "#B07848" : "#E8D9C0" }} />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(t.normalized / maxTrend) * 100}%`, borderTop: "1px dashed #8B6344" }} />
                </div>
                <span style={{ fontSize: 10.5, color: t.month === d.month ? "#1f1b16" : "#8a8276", fontWeight: t.month === d.month ? 600 : 400 }}>
                  {monthName(t.month)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>
            Where the money goes
          </h3>
          <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 14px" }}>{monthName(d.month, "long")}, biggest first.</p>
          {d.by_category.length === 0 && (
            <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>No costs recorded for this month.</p>
          )}
          {[...d.by_category].sort((a, b) => b.amount - a.amount).map((c) => (
            <div key={c.name} style={{ padding: "8px 0" }}>
              <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                <span style={{ fontSize: 13, color: "#5a4a3a" }}>{c.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: "#1f1b16" }}>
                  {peso(c.amount)} <span style={{ color: "#8a8276", fontSize: 11 }}>· {Math.round((c.amount / catTotal) * 100)}%</span>
                </span>
              </div>
              <div style={{ height: 6, background: "#f3eee2", marginTop: 6 }}>
                <div style={{ height: "100%", width: `${(c.amount / maxCat) * 100}%`, background: "#d4a96a" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
