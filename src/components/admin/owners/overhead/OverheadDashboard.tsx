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
