"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Today's month as 'YYYY-MM', in the viewer's own timezone. Deliberately not
 * toISOString().slice(0,7): that reports UTC, so in Manila (UTC+8) the first
 * eight hours of every month would still name the previous one.
 */
export const currentMonthKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * One control for picking a month: arrows step, the label opens a year grid.
 * `null` means "All time".
 *
 * `monthsWithData` are the 'YYYY-MM' keys the caller actually holds figures
 * for — they get a dot in the grid, so the picker only advertises months the
 * consumer can genuinely show. Open/year state lives here because nothing
 * outside the control reads it.
 */
export function MonthNavigator({
  value, onChange, monthsWithData,
}: {
  value: string | null;
  onChange: (month: string | null) => void;
  monthsWithData: string[];
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const now = new Date();
  const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthKey = toKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const base = value ? new Date(value + "-01") : new Date(now.getFullYear(), now.getMonth(), 1);
  const shift = (n: number) => toKey(new Date(base.getFullYear(), base.getMonth() + n, 1));
  const label = value
    ? base.toLocaleString("en", { month: "long", year: "numeric" })
    : "All time";
  const titleOf = (k: string) =>
    new Date(k + "-01").toLocaleString("en", { month: "long", year: "numeric" });
  const withData = new Set(monthsWithData);

  const openPicker = () => {
    setYear(value ? Number(value.slice(0, 4)) : now.getFullYear());
    setOpen((v) => !v);
  };

  return (
    <div style={{ position: "relative" }}>
      <div className="inline-flex items-stretch" style={{ border: "1px solid #D4BFA0", background: "#fff" }}>
        <button type="button" onClick={() => onChange(shift(-1))}
          aria-label="Previous month" title={titleOf(shift(-1))}
          className="grid place-items-center cursor-pointer"
          style={{ width: 34, background: "transparent", border: "none", borderRight: "1px solid #EADFC8", color: "#B07848" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#F7F0E3")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <button type="button" onClick={openPicker}
          className="inline-flex items-center justify-center cursor-pointer"
          style={{ gap: 9, padding: "9px 14px", minWidth: 150, background: "transparent", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#1f1b16" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#FBF7EF")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
          <CalendarDays className="w-3.5 h-3.5" style={{ color: "#B07848" }} />
          {label}
          <ChevronDown className="w-3 h-3" style={{ color: "#8a8276", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
        </button>

        <button type="button" onClick={() => onChange(shift(1))}
          aria-label="Next month" title={titleOf(shift(1))}
          className="grid place-items-center cursor-pointer"
          style={{ width: 34, background: "transparent", border: "none", borderLeft: "1px solid #EADFC8", color: "#B07848" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#F7F0E3")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {open && (
        <>
          {/* click-away */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 70, width: 296, background: "#fff", border: "1px solid #ece5d4", boxShadow: "0 18px 44px -16px rgba(40,30,18,.30)", borderRadius: 4, overflow: "hidden" }}>
            <div className="flex items-center justify-between" style={{ padding: "10px 12px", borderBottom: "1px solid #F7F0E3" }}>
              <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year"
                className="grid place-items-center cursor-pointer"
                style={{ width: 26, height: 26, background: "transparent", border: "none", color: "#B07848" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#1f1b16", fontVariantNumeric: "tabular-nums" }}>{year}</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year"
                className="grid place-items-center cursor-pointer"
                style={{ width: 26, height: 26, background: "transparent", border: "none", color: "#B07848" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, padding: 1, background: "#F7F0E3" }}>
              {MONTHS.map((name, i) => {
                const k = `${year}-${String(i + 1).padStart(2, "0")}`;
                const active = value === k;
                const hasData = withData.has(k);
                return (
                  <button key={k} type="button"
                    onClick={() => { onChange(k); setOpen(false); }}
                    className="flex items-center justify-center cursor-pointer"
                    style={{ gap: 5, padding: "11px 0", border: "none", fontFamily: "inherit", fontSize: 12.5,
                      background: active ? "#1f1b16" : "#fff",
                      color: active ? "#faf7f1" : hasData ? "#1f1b16" : "#b3aa9c",
                      fontWeight: active ? 600 : hasData ? 500 : 400 }}>
                    {name}
                    {hasData && !active && (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#B07848" }} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between" style={{ padding: "9px 12px", borderTop: "1px solid #F7F0E3" }}>
              <button type="button" onClick={() => { onChange(thisMonthKey); setOpen(false); }}
                className="cursor-pointer"
                style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, color: "#B07848", background: "transparent", border: "none", padding: "2px 0" }}>
                This month
              </button>
              <button type="button" onClick={() => { onChange(null); setOpen(false); }}
                className="cursor-pointer"
                style={{ fontFamily: "inherit", fontSize: 12.5, color: "#8a8276", background: "transparent", border: "none", padding: "2px 0" }}>
                All time
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
