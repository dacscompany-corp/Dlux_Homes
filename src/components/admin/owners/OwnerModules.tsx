"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { imageFileError } from "@/lib/validateImageFile";
import ImageThumb from "@/components/ImageThumb";
import { MonthNavigator, currentMonthKey } from "@/components/admin/owners/MonthNavigator";
import { useGetOverheadDashboardQuery } from "@/redux/api/overheadApi";
import { useSession } from "next-auth/react";
import { BarChart3, Calendar, CalendarOff, Sparkles, CreditCard, Headphones, UsersRound, Handshake, Plus, Trash2, Power, Pencil, X, Moon, Sun } from "lucide-react";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery, useGetRevenueByRoomQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery } from "@/redux/api/bookingsApi";
import { useGetBlockedDatesQuery, useCreateBlockedDateMutation, useDeleteBlockedDateMutation } from "@/redux/api/blockedDatesApi";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { useGetCleaningTasksQuery } from "@/redux/api/cleanersApi";
import { useGetAdminUsersQuery } from "@/redux/api/adminUsersApi";
import { useGetPartnersQuery } from "@/redux/api/partnersApi";
type DateRange = { from?: Date; to?: Date };

// Range-picker calendar styled to match the Booking Calendar (big wall-calendar
// cells). Click a start date, then an end date, to select a range to block.
function RangeCalendar({ value, onChange }: { value?: DateRange; onChange: (r: DateRange) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = first.getDay();
  const monthName = first.toLocaleString("en", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const from = value?.from, to = value?.to;
  const same = (a?: Date, b?: Date) => !!a && !!b && a.toDateString() === b.toDateString();
  const inRange = (d: Date) => !!from && !!to && d > from && d < to;
  const click = (d: Date) => {
    if (!from || (from && to)) onChange({ from: d, to: undefined });
    else if (d < from) onChange({ from: d, to: undefined });
    else onChange({ from, to: d });
  };

  const navCls = "px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer";
  const navStyle = { color: "#B07848", borderColor: "#ece5d4", backgroundColor: "#F7F0E3" } as const;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => shift(-1)} className={navCls} style={navStyle}>← Prev</button>
        <h3 className="font-bold" style={{ color: "#1a1a1a" }}>{monthName}</h3>
        <button type="button" onClick={() => shift(1)} className={navCls} style={navStyle}>Next →</button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-center text-xs font-semibold py-2" style={{ color: "#8B6344" }}>{d}</div>)}
        {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const d = new Date(month.y, month.m, day);
          const isPast = d < today;
          const isEnd = same(d, from) || same(d, to);
          const mid = inRange(d);
          return (
            <button key={day} type="button" disabled={isPast} onClick={() => click(d)}
              className="rounded-lg border p-2 min-h-[64px] text-left transition-colors"
              style={{
                borderColor: isEnd ? "#B07848" : "#F0E6D6",
                backgroundColor: isEnd ? "#B07848" : mid ? "#F7F0E3" : "#ffffff",
                cursor: isPast ? "not-allowed" : "pointer",
                opacity: isPast ? 0.45 : 1,
              }}
              onMouseEnter={(e) => { if (!isPast && !isEnd && !mid) (e.currentTarget as HTMLElement).style.backgroundColor = "#FDF8F3"; }}
              onMouseLeave={(e) => { if (!isEnd) (e.currentTarget as HTMLElement).style.backgroundColor = mid ? "#F7F0E3" : "#ffffff"; }}>
              <div className="text-xs font-semibold" style={{ color: isEnd ? "#ffffff" : mid ? "#B07848" : "#5a4a3a" }}>{day}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
type Row = Record<string, unknown>;
const arr = (x: unknown): Row[] => (Array.isArray(x) ? (x as Row[]) : []);
const dataOf = (x: unknown): Row[] => arr((x as { data?: unknown })?.data ?? x);

// ── shared bits ──────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={className} style={{ backgroundColor: "#fff", border: "1px solid #ece5d4" }}>{children}</div>;
}
function SectionHead({ title, sub }: { title: string; sub?: string; icon?: React.ElementType }) {
  return (
    <div className="mb-6">
      <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, lineHeight: 1, letterSpacing: "-0.01em", color: "#1f1b16", margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 13, color: "#8a8276", margin: "10px 0 0", lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}
export function Empty({ label }: { label: string }) {
  return <div className="text-center" style={{ background: "#fff", border: "1px solid #ece5d4", padding: 40 }}><p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>{label}</p></div>;
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
            {headers.map((h) => <th key={h} className="px-6 py-3 text-left uppercase" style={{ color: "#8a8276", fontSize: 11, letterSpacing: "0.08em", fontWeight: 400 }}>{h}</th>)}
          </tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}
function Pill({ text, tone = "neutral" }: { text: string; tone?: "good" | "warn" | "bad" | "neutral" | "muted" }) {
  const map = {
    good:    { c: "#4a6a3a", dot: "#7a8c5a" },
    warn:    { c: "#8a6a2f", dot: "#d4a96a" },
    bad:     { c: "#9a4a3a", dot: "#b85a4a" },
    neutral: { c: "#9a6233", dot: "#b8754a" },
    muted:   { c: "#8a8276", dot: "#c9c1b2" },
  }[tone];
  return (
    <span className="inline-flex items-center capitalize" style={{ gap: 7, fontSize: 12, color: map.c }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: map.dot, flex: "none" }} />{text}
    </span>
  );
}
const fmtDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString() : "—");

// ── 1. Analytics & Reports ────────────────────────────────────────────────
export function AnalyticsSection() {
  // Opens on the current month. null falls back to the rolling 30-day window,
  // reachable via "All time" in the picker; a 'YYYY-MM' key pins every figure
  // on this screen — cards, haven table and chart — to that calendar month.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(() => currentMonthKey());
  const { data: summaryRes } = useGetAnalyticsSummaryQuery({ period: "30", month: selectedMonth });
  const { data: monthlyRes } = useGetMonthlyRevenueQuery({ months: "6" });
  const { data: roomRes } = useGetRevenueByRoomQuery({ period: "30", month: selectedMonth });
  const s = (summaryRes as unknown as { data?: Row })?.data || {};
  const monthly = dataOf(monthlyRes) as { month: string; revenue: number; gross_revenue: number }[];
  const rooms = dataOf(roomRes) as { room_name: string; revenue: number; bookings: number }[];
  // Collected = cash actually received (down payments + full payments already
  // approved). Gross = the full booked value of every incoming booking, even
  // before any payment has landed — see analyticsController.ts summaryStatsQuery.
  const [revenueBasis, setRevenueBasis] = useState<"collected" | "gross">("collected");
  const revenueNow = (m: { revenue: number; gross_revenue: number }) =>
    revenueBasis === "gross" ? Number(m.gross_revenue) || 0 : Number(m.revenue) || 0;
  const chartMonthEntry = selectedMonth ? monthly.find((m) => m.month === selectedMonth) : null;
  const monthLabel = selectedMonth
    ? new Date(selectedMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" })
    : "";
  const maxRev = Math.max(1, ...monthly.map(revenueNow));
  // Cards name the span they cover, so the figures can never be read against
  // the wrong window.
  const span = selectedMonth ? monthLabel : "30d";
  // Overhead and profit. Owner-only: the overhead endpoint 403s for a CSR, so
  // an ungated Profit cell would read revenue minus zero and overstate the
  // business badly. `skip` keeps a CSR from firing the request at all.
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string } | undefined)?.role === "Owner";
  const { data: overheadRes, isLoading: overheadLoading } = useGetOverheadDashboardQuery(
    { month: selectedMonth ?? undefined },
    { skip: !isOwner },
  );
  const oh = overheadRes?.data;
  // Until the overhead payload lands, profit would briefly equal full revenue.
  // Both cells render an em dash rather than a figure that is wrong for a frame.
  const overheadReady = isOwner && !overheadLoading && !!oh;
  // Pair like with like, as the Profitability tab does: collected revenue
  // against bills actually settled, gross against everything due.
  const overheadFigure = revenueBasis === "gross"
    ? Number(oh?.accrued_total ?? 0)
    : Number(oh?.paid ?? 0);
  const revenueFigure = revenueBasis === "gross"
    ? Number(s.total_gross_revenue ?? 0)
    : Number(s.total_revenue ?? 0);
  const profit = revenueFigure - overheadFigure;
  const signedPeso = (n: number) => (n < 0 ? "-₱" : "₱") + Math.abs(n).toLocaleString();

  const stats = [
    { label: `${revenueBasis === "gross" ? "Gross Revenue" : "Revenue"} (${span})`, value: peso(revenueBasis === "gross" ? Number(s.total_gross_revenue ?? 0) : Number(s.total_revenue ?? 0)) },
    { label: `Bookings (${span})`, value: String(s.total_bookings ?? 0) },
    { label: `Occupancy (${span})`, value: `${Math.round(Number(s.occupancy_rate ?? 0))}%` },
    { label: `New Guests (${span})`, value: String(s.new_guests ?? 0) },
    ...(isOwner ? [
      { label: `${revenueBasis === "gross" ? "Overhead due" : "Overhead paid"} (${span})`,
        value: overheadReady ? peso(overheadFigure) : "—" },
      { label: `Profit (${span})`, value: overheadReady ? signedPeso(profit) : "—" },
    ] : []),
  ];
  const totalRoomRev = Math.max(1, rooms.reduce((t, r) => t + (Number(r.revenue) || 0), 0));
  const SERIF = "'Instrument Serif', Georgia, serif";
  const MONO = "'Geist Mono', ui-monospace, monospace";
  return (
    <div>
      {/* Collected (cash actually received) vs Gross (full value of every
          incoming booking, before any payment lands) — swaps the "Revenue
          (30d)" stat and the chart below between the two figures. */}
      <div className="flex items-center flex-wrap mb-6" style={{ gap: 12 }}>
      <div className="inline-flex" style={{ border: "1px solid #D4BFA0", background: "#F7F0E3" }}>
        <button type="button" onClick={() => setRevenueBasis("collected")}
          className="cursor-pointer"
          style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: revenueBasis === "collected" ? "#1f1b16" : "#8a8276", background: revenueBasis === "collected" ? "#fff" : "transparent", border: "none" }}>
          Collected
        </button>
        <button type="button" onClick={() => setRevenueBasis("gross")}
          className="cursor-pointer"
          style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: revenueBasis === "gross" ? "#1f1b16" : "#8a8276", background: revenueBasis === "gross" ? "#fff" : "transparent", border: "none", borderLeft: "1px solid #D4BFA0" }}>
          Gross Revenue
        </button>
      </div>
      {/* Same row as the basis toggle, matching the Dashboard tab. */}
      <MonthNavigator
        value={selectedMonth}
        onChange={setSelectedMonth}
        monthsWithData={monthly.map((m) => m.month)}
      />
      </div>

      {/* stats — flat bordered cells */}
      {/* Six cells for an Owner (two clean rows of three), four for a CSR. */}
      <div className={`grid grid-cols-2 ${isOwner ? "lg:grid-cols-3" : "lg:grid-cols-4"} mb-6`} style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
        {stats.map((st) => (
          <div key={st.label} style={{ background: "#fff", padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1,
              color: st.label.startsWith("Profit") && overheadReady && profit < 0 ? "#9a4a3a" : "#1f1b16" }}>{st.value}</div>
            <div style={{ fontSize: 12, color: "#8a8276", marginTop: 8 }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* revenue chart */}
      <div style={{ background: "#fff", border: "1px solid #ece5d4", marginBottom: 24 }}>
        <div className="flex items-center" style={{ padding: "22px 24px 0", gap: 8 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue — last 6 months</h3>
          <span style={{
            fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
            padding: "2px 8px", borderRadius: 999,
            color: revenueBasis === "gross" ? "#8C5A2E" : "#059669",
            background: revenueBasis === "gross" ? "#F3E4CB" : "#d1fae5",
          }}>
            {revenueBasis === "gross" ? "Gross" : "Collected"}
          </span>
        </div>
        {selectedMonth && (
          <p style={{ fontSize: 12, color: "#8a8276", margin: "10px 24px 0" }}>
            {chartMonthEntry
              ? `${monthLabel} · ${peso(revenueNow(chartMonthEntry))} ${revenueBasis === "gross" ? "gross" : "collected"}`
              : `No revenue recorded for ${monthLabel} in this range`}
          </p>
        )}
        <div style={{ padding: "18px 24px 24px" }}>
          {monthly.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>No revenue recorded yet.</p>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 200 }}>
              {monthly.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center" style={{ gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#6b6358" }}>{peso(revenueNow(m))}</span>
                  <div className="w-full flex items-end justify-center" style={{ height: 140 }}>
                    <div style={{ width: "100%", height: `${Math.max(2, (revenueNow(m) / maxRev) * 100)}%`, background: selectedMonth && m.month !== selectedMonth ? "#e8d9c0" : "#b8754a" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#8a8276" }}>{/^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "short" }) : m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* revenue by haven */}
      <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #ece5d4" }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue by haven</h3>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.4fr", gap: 16, padding: "12px 24px", background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8276" }}>
          <span>Haven</span><span style={{ textAlign: "right" }}>Bookings</span><span style={{ textAlign: "right" }}>Revenue</span><span>Share</span>
        </div>
        {rooms.length === 0 ? (
          <div style={{ padding: "22px 24px", fontSize: 13, color: "#8a8276" }}>No room revenue yet.</div>
        ) : rooms.map((r, i) => {
          const share = Math.round(((Number(r.revenue) || 0) / totalRoomRev) * 100);
          return (
            <div key={i} className="grid items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.4fr", gap: 16, padding: "15px 24px", borderBottom: "1px solid #f3eee2", fontSize: 13.5 }}>
              <span style={{ color: "#1f1b16" }}>{r.room_name}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#6b6358", textAlign: "right" }}>{r.bookings}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#1f1b16", textAlign: "right" }}>{peso(Number(r.revenue) || 0)}</span>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div style={{ flex: 1, height: 4, background: "#f3eee2" }}><div style={{ width: `${share}%`, height: "100%", background: "#b8754a" }} /></div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a8276", width: 32, textAlign: "right" }}>{share}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 2. Booking Calendar ───────────────────────────────────────────────────

// Stay type from the booking's check-in/out clock times (business rules:
// Daycation 7AM–5PM, Nightcation 7PM–5AM, Overnight/Full-stay 7PM–4PM).
// The `booking` table has no stay_type column, so this is the only signal.
type StayKind = "daycation" | "nightcation" | "overnight";
function stayKind(checkInTime: string, checkOutTime: string): StayKind {
  const ci = parseInt(String(checkInTime || "").slice(0, 2), 10);
  const co = parseInt(String(checkOutTime || "").slice(0, 2), 10);
  if (ci >= 15) return co <= 6 ? "nightcation" : "overnight"; // 19:00 start
  return "daycation"; // 07:00 start
}
const fmt12h = (t: string) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let hr = parseInt(m[1], 10);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}${m[2] === "00" ? "" : ":" + m[2]}${ap}`;
};

// One reservation as it touches one date. The trailing fields exist only for
// the day-detail panel, which shows the whole booking behind a half.
type DayBooking = {
  name: string; id: string; kind: StayKind; checkInTime: string; checkOutTime: string;
  isCheckIn: boolean; isCheckOut: boolean; isMiddle: boolean;
  haven: string; party: string; phone: string; stay: string; total: string; balance: string; status: string;
};

const initialsOf = (n: string) => String(n || "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const titleCase = (s: string) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// A pending booking with a green dot would read as settled, so the dot follows
// the status rather than always claiming confirmed.
const statusTone = (s: string) =>
  /confirm|checked|complete|paid/i.test(s) ? { dot: "#7a8c5a", fg: "#4a6a3a" }
  : /pending|review|request/i.test(s) ? { dot: "#C08A3E", fg: "#8C5A2E" }
  : { dot: "#a09789", fg: "#6b6358" };

// Every cell is split along one diagonal: the upper-left triangle is the
// DAYTIME half (7AM–5PM), the lower-right triangle is the NIGHT half
// (7PM–5AM). This clip-path paints the night half over the day half, and the
// legend uses the same geometry so a swatch always matches a real cell.
const NIGHT_CLIP = "polygon(100% 0, 100% 100%, 0 100%)";

// Solid tan for Daycation, dark maroon-brown for Nightcation, slate for a full
// stay, lighter slate for a mid-stay (continuing) day.
const COLOR = {
  blocked: "#F3C9C2",
  day: "#D9A857",        // Daycation — tan/gold
  night: "#3B2418",      // Nightcation — dark maroon-brown
  full: "#6E8A96",       // Full stay — slate blue
  continuing: "#A9D8B4", // Continuing (mid-stay) / fully booked all day — light green
  empty: "#ffffff",      // half is open / bookable
};

// Contrast colour for text and icons drawn on top of each fill.
const TEXT_ON: Record<string, string> = {
  [COLOR.blocked]: "#8a4a3a",
  [COLOR.day]: "#4a3a1f",
  [COLOR.night]: "#ffffff",
  [COLOR.full]: "#ffffff",
  [COLOR.continuing]: "#1f1b16",
  [COLOR.empty]: "#4a4034",
};
const textOn = (fill: string) => TEXT_ON[fill] ?? "#4a4034";

// The render model for one day: which half is held by what, plus the label,
// icons and marker the cell shows. `dayText`/`nightText` restate the same
// booking one half at a time, for the layouts that give each half its own row.
type DayCell = {
  dayFill: string; nightFill: string; label: string; sub: string;
  sun?: boolean; moon?: boolean; asterisk?: boolean;
  dayText?: string; nightText?: string;
  // Which reservation actually holds each half — the day-detail panel shows
  // the booking behind a fill, so the fill alone isn't enough.
  dayBooking?: DayBooking | null; nightBooking?: DayBooking | null;
};
const cell = (dayFill: string, nightFill: string, label: string, sub: string, extra: Omit<DayCell, "dayFill" | "nightFill" | "label" | "sub"> = {}): DayCell =>
  ({ dayFill, nightFill, label, sub, ...extra });

// Three ways to draw the same day. "split" is the diagonal cell; "rows" gives
// each half its own labelled band; "strip" states the day in plain words over a
// day/night bar. Owners read cells differently, so the choice is theirs.
type CalLayout = "split" | "rows" | "strip";
const LAYOUTS: { id: CalLayout; label: string; paths: string[] }[] = [
  { id: "split", label: "Diagonal", paths: ["M3 3h18v18H3z", "M21 3L3 21"] },
  { id: "rows", label: "Two rows", paths: ["M3 4h18v7H3z", "M3 13h18v7H3z"] },
  { id: "strip", label: "Plain words", paths: ["M3 5h18", "M3 12h12", "M3 19h18"] },
];

// Fill for a half that nothing holds, in the strip layout's day/night bar —
// the bar is always two solid segments, so "open" needs a colour of its own.
const OPEN_SEGMENT = "#eef1ec";

const Glyph = ({ paths, size = 14, sw = 1.6 }: { paths: string[]; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

// The legend answers "what is happening on this date", not "which product was
// sold" — so the entries are guest movements rather than stay-type names. The
// swatch still carries the geometry: which half is filled says which half is
// gone, whatever colour the booking's stay type painted it.
const LEGEND: { dayFill: string; nightFill: string; name: string; desc: string }[] = [
  { dayFill: COLOR.empty, nightFill: COLOR.empty, name: "Free", desc: "nothing booked" },
  { dayFill: COLOR.empty, nightFill: COLOR.full, name: "Guest arrives", desc: "night taken" },
  { dayFill: COLOR.full, nightFill: COLOR.empty, name: "Guest leaves", desc: "day taken" },
  { dayFill: COLOR.continuing, nightFill: COLOR.continuing, name: "Fully booked", desc: "guest in unit all day" },
  { dayFill: COLOR.blocked, nightFill: COLOR.blocked, name: "Blocked", desc: "not bookable" },
];

// The hairline along the split, so two same-coloured halves still read as two.
const Diagonal = ({ color }: { color: string }) => (
  <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block" }}>
    <line x1={0} y1={100} x2={100} y2={0} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
  </svg>
);

export function BookingCalendarSection() {
  const { data: bookingsData } = useGetBookingsQuery();
  const { data: blockedData } = useGetBlockedDatesQuery({});
  const bookings = dataOf(bookingsData);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [layout, setLayout] = useState<CalLayout>("split");
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = first.getDay();

  // Per-day bookings touching this date, each tagged with its stay kind and
  // whether this day is its check-in day, check-out day, or a middle
  // (continuing) day of the stay.
  const dayBookings: Record<number, DayBooking[]> = {};
  bookings.forEach((b) => {
    if (["rejected", "cancelled"].includes(String(b.status))) return;
    const name = `${b.guest_first_name ?? ""} ${b.guest_last_name ?? ""}`.trim() || "Guest";
    const id = String(b.booking_id ?? b.id ?? "");
    const checkInTime = String(b.check_in_time ?? "");
    const checkOutTime = String(b.check_out_time ?? "");
    const kind = stayKind(checkInTime, checkOutTime);
    const start = new Date(String(b.check_in_date)); start.setHours(0, 0, 0, 0);
    const end = new Date(String(b.check_out_date)); end.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime())) return;
    const last = isNaN(end.getTime()) ? start : end;

    // Booking-wide facts, resolved once rather than per touched date.
    const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const nights = Math.round((last.getTime() - start.getTime()) / 86400000);
    const stay = nights > 0 ? `${md(start)} – ${md(last)} · ${nights} night${nights > 1 ? "s" : ""}` : `${md(start)} · Day use`;
    const counts: [number, string, string][] = [
      [Number(b.adults ?? 0), "adult", "adults"],
      [Number(b.children ?? 0), "child", "children"],
      [Number(b.infants ?? 0), "infant", "infants"],
    ];
    const party = counts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(" · ") || "—";
    const remaining = Number(b.remaining_balance ?? 0);

    for (const d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== month.y || d.getMonth() !== month.m) continue;
      const isCheckIn = d.getTime() === start.getTime();
      const isCheckOut = d.getTime() === last.getTime() && last.getTime() !== start.getTime();
      (dayBookings[d.getDate()] = dayBookings[d.getDate()] || []).push({
        name, id, kind, checkInTime, checkOutTime,
        isCheckIn, isCheckOut, isMiddle: !isCheckIn && !isCheckOut,
        haven: String(b.room_name ?? "—"),
        party, phone: String(b.guest_phone ?? "") || "—", stay,
        total: peso(Number(b.total_amount ?? b.down_payment ?? 0)),
        balance: remaining > 0 ? `${peso(remaining)} due on arrival` : "Fully paid",
        status: titleCase(String(b.status ?? "")),
      });
    }
  });

  // Blocked days in this month + their reasons. Parse the date in LOCAL time
  // (matches the list display) so a PH-stored date doesn't shift a day back.
  const blockInfo: Record<number, string[]> = {};
  dataOf(blockedData).forEach((b) => {
    const from = new Date(String(b.from_date)); from.setHours(0, 0, 0, 0);
    const to = new Date(String(b.to_date)); to.setHours(0, 0, 0, 0);
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === month.y && d.getMonth() === month.m) {
        (blockInfo[d.getDate()] = blockInfo[d.getDate()] || []).push(String(b.reason || "").trim() || "Blocked");
      }
    }
  });

  const monthName = first.toLocaleString("en", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const adjacentName = (n: number) => new Date(month.y, month.m + n, 1).toLocaleString("en", { month: "long" });
  const goToday = () => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); };

  // Only mark "today" when the grid is actually showing the current month.
  const now = new Date();
  const todayNum = now.getFullYear() === month.y && now.getMonth() === month.m ? now.getDate() : null;

  // Resolve a day's bookings into a DayCell: which half is held, by what, and
  // what label/icon it shows. A half is only filled when a booking actually
  // holds it — an open half stays white so the owner can see what's still
  // sellable on that date.
  function resolveDay(day: number): DayCell | null {
    const list = dayBookings[day] || [];
    const overnightMiddle = list.find((x) => x.kind === "overnight" && x.isMiddle);
    const overnightCheckIn = list.find((x) => x.kind === "overnight" && x.isCheckIn);
    const overnightCheckOut = list.find((x) => x.kind === "overnight" && x.isCheckOut);
    const daycation = list.find((x) => x.kind === "daycation");
    const nightcation = list.find((x) => x.kind === "nightcation" && (x.isCheckIn || x.isMiddle));
    const nightcationOut = list.find((x) => x.kind === "nightcation" && x.isCheckOut && !x.isCheckIn);
    // Every cell reads the same way: the stay's name on the first line (the
    // same wording the legend uses), its timing on the second. The fills
    // already say which half is open, so the label never repeats that.
    const dayRange = daycation && fmt12h(daycation.checkInTime) && fmt12h(daycation.checkOutTime)
      ? `${fmt12h(daycation.checkInTime)}–${fmt12h(daycation.checkOutTime)}` : "";

    // Mid-stay day of a multi-night full stay — both halves held, but a lighter
    // slate so a pass-through day reads apart from the check-in day.
    if (overnightMiddle) return cell(COLOR.continuing, COLOR.continuing, "Full stay", "Continuing", { moon: true, dayText: "Guest in unit", nightText: "Guest in unit", dayBooking: overnightMiddle, nightBooking: overnightMiddle });

    // Full-stay check-in: the guest only arrives 7PM, so the daytime is still
    // sellable as a Daycation — a 7AM–5PM stay plus its 2h turnover lands
    // exactly on 7PM, which the availability check in createBooking allows.
    // Only fill the day half when a Daycation has actually taken it.
    if (overnightCheckIn) {
      const t = fmt12h(overnightCheckIn.checkInTime);
      const arrives = t ? `Arrives ${t}` : "Arrives";
      if (daycation) return cell(COLOR.day, COLOR.full, "Day + Full", dayRange, { sun: true, moon: true, asterisk: true, dayText: "Daycation", nightText: arrives, dayBooking: daycation, nightBooking: overnightCheckIn });
      return cell(COLOR.empty, COLOR.full, "Full stay", t ? `In ${t}` : "", { moon: true, nightText: arrives, nightBooking: overnightCheckIn });
    }

    // Full-stay checkout (out 4PM): the daytime is held to checkout, the
    // evening is still sellable as a Nightcation — unless one already took it.
    if (overnightCheckOut) {
      const t = fmt12h(overnightCheckOut.checkOutTime);
      const sub = t ? `Out ${t}` : "Checkout";
      const leaves = t ? `Leaves ${t}` : "Leaves";
      if (nightcation) return cell(COLOR.full, COLOR.night, "Full + Night", sub, { moon: true, asterisk: true, dayText: leaves, nightText: "Nightcation", dayBooking: overnightCheckOut, nightBooking: nightcation });
      return cell(COLOR.full, COLOR.empty, "Full stay", sub, { dayText: leaves, dayBooking: overnightCheckOut });
    }

    // Two separate bookings sharing the date: Daycation by day, Nightcation at night.
    if (daycation && nightcation) return cell(COLOR.day, COLOR.night, "Day + Night", dayRange, { sun: true, moon: true, asterisk: true, dayText: "Daycation", nightText: "Nightcation", dayBooking: daycation, nightBooking: nightcation });

    // Daycation holds the morning; the evening stays open. A Nightcation that
    // ended 5AM that morning is only a note — it holds neither half of today.
    if (daycation) return cell(COLOR.day, COLOR.empty, "Daycation", dayRange, { sun: true, dayText: dayRange || "Daycation", dayBooking: daycation });

    if (nightcation) {
      const t = fmt12h(nightcation.checkInTime);
      return cell(COLOR.empty, COLOR.night, "Nightcation", t ? `In ${t}` : "", { moon: true, nightText: t ? `Arrives ${t}` : "Nightcation", nightBooking: nightcation });
    }

    // Nightcation checkout at 5AM — the whole date is back on the market, so
    // neither half is filled; the label is just a heads-up about the departure.
    if (nightcationOut) {
      const t = fmt12h(nightcationOut.checkOutTime);
      return cell(COLOR.empty, COLOR.empty, "Nightcation", t ? `Out ${t}` : "Checkout");
    }
    return null;
  }

  // ── Day detail — the same date told as two halves: what the daytime is
  // doing and what the night is doing, each with the reservation behind it.
  const selDateObj = selectedDay != null ? new Date(month.y, month.m, selectedDay) : null;
  const selBlocks = selectedDay != null ? blockInfo[selectedDay] : undefined;
  const selReason = selBlocks ? selBlocks.filter((r) => r !== "Blocked").join(" · ") || "not bookable" : "";
  const selCell = selectedDay != null && !selBlocks ? resolveDay(selectedDay) : null;
  const selDayBooking = selCell?.dayBooking ?? null;
  const selNightBooking = selCell?.nightBooking ?? null;

  // A Nightcation that ended 5AM holds neither half of this date, so it never
  // reaches selCell's fills — but the owner still wants to know someone left.
  const earlyOut = selectedDay != null && !selBlocks
    ? (dayBookings[selectedDay] || []).find((x) => x.kind === "nightcation" && x.isCheckOut && !x.isCheckIn)
    : undefined;

  const banner = selBlocks ? { text: `Blocked — ${selReason}`, bg: "#FCEEEA", fg: "#9C3B28" }
    : selDayBooking && selNightBooking ? { text: "Fully booked", bg: "#faf7f1", fg: "#1f1b16" }
    : selDayBooking ? { text: "Night is still free", bg: "#faf7f1", fg: "#1f1b16" }
    : selNightBooking ? { text: "Daytime is still free", bg: "#faf7f1", fg: "#1f1b16" }
    : { text: "Free all day — nothing booked", bg: "#F1F5EE", fg: "#4a6a3a" };

  const detailBlocks = [
    {
      isNight: false, title: "Daytime", hours: "7AM – 5PM",
      booking: selBlocks ? null : selDayBooking,
      freeText: selBlocks ? `Blocked — ${selReason}` : "Nobody booked. Open for a Daycation.",
    },
    {
      isNight: true, title: "Night", hours: "7PM – 5AM",
      booking: selBlocks ? null : selNightBooking,
      freeText: selBlocks ? `Blocked — ${selReason}`
        : earlyOut ? `${earlyOut.name} checked out ${fmt12h(earlyOut.checkOutTime)}. Now open for a Nightcation or a full-stay check-in.`
        : "Nobody booked. Open for a Nightcation or a full-stay check-in.",
    },
  ];

  // Month at a glance. "Completely free" counts only days where BOTH halves are
  // still sellable — a date with an open evening isn't a free day, and the
  // owner's question here is how much of the month is untouched.
  let freeDays = 0, arrivals = 0, departures = 0, blockedDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (blockInfo[d]) { blockedDays++; continue; }
    const r = resolveDay(d);
    if (!r || (r.dayFill === COLOR.empty && r.nightFill === COLOR.empty)) freeDays++;
    for (const b of dayBookings[d] || []) {
      if (b.isCheckIn) arrivals++;
      if (b.isCheckOut) departures++;
    }
  }
  const summary = [
    { value: freeDays, unit: "days", label: "Completely free to book" },
    { value: arrivals, unit: "this month", label: "Guests arriving" },
    { value: departures, unit: "this month", label: "Guests leaving" },
    { value: blockedDays, unit: "days", label: "Blocked for maintenance" },
  ];

  // Plain words needs less room than two stacked bands.
  const cellHeight = layout === "strip" ? 112 : 132;

  // The "How to read a day" swatch restates whichever layout is active, so the
  // explanation and the grid can never drift apart.
  const anatomy: Record<CalLayout, { node: React.ReactNode; text: string }> = {
    split: {
      node: (
        <>
          <span style={{ position: "absolute", inset: 0 }}><Diagonal color="#e2dccd" /></span>
          <span style={{ position: "absolute", top: 4, left: 5, fontSize: 8.5, letterSpacing: "0.06em", color: "#8a8276" }}>DAY</span>
          <span style={{ position: "absolute", bottom: 4, right: 5, fontSize: 8.5, letterSpacing: "0.06em", color: "#8a8276" }}>NIGHT</span>
        </>
      ),
      text: "Top-left = 7AM–5PM · bottom-right = 7PM–5AM",
    },
    rows: {
      node: (
        <span style={{ position: "absolute", inset: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ flex: 1, border: "1px solid #ded6c6", display: "flex", alignItems: "center", paddingLeft: 4, fontSize: 8, letterSpacing: "0.06em", color: "#8a8276" }}>DAY</span>
          <span style={{ flex: 1, border: "1px solid #ded6c6", display: "flex", alignItems: "center", paddingLeft: 4, fontSize: 8, letterSpacing: "0.06em", color: "#8a8276" }}>NIGHT</span>
        </span>
      ),
      text: "One row for the daytime, one for the night",
    },
    strip: {
      node: (
        <span style={{ position: "absolute", inset: 6, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 3 }}>
          <span style={{ fontSize: 8, color: "#8a8276" }}>Free all day</span>
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ flex: 1, height: 5, background: OPEN_SEGMENT }} />
            <span style={{ flex: 1, height: 5, background: COLOR.full }} />
          </span>
        </span>
      ),
      text: "Plain-language status, with a bar for day and night",
    },
  };


  return (
    <div>
      <SectionHead title="Booking Calendar" icon={Calendar} sub="Each day is split in two — the daytime half and the night half. White means that half is still free to sell." />
      <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>

        {/* Toolbar — month paging on the left with the layout switcher, the
            month itself set large on the right. */}
        <div className="flex items-center justify-between flex-wrap" style={{ gap: 16, padding: "18px 24px", borderBottom: "1px solid #ece5d4" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
            <button type="button" onClick={() => shift(-1)} className="inline-flex items-center cursor-pointer" style={{ gap: 8, padding: "9px 14px", background: "#fff", border: "1px solid #d9d1c2", fontSize: 13, color: "#4a4034" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              <span>{adjacentName(-1)}</span>
            </button>
            <button type="button" onClick={() => shift(1)} className="inline-flex items-center cursor-pointer" style={{ gap: 8, padding: "9px 14px", background: "#fff", border: "1px solid #d9d1c2", fontSize: 13, color: "#4a4034" }}>
              <span>{adjacentName(1)}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button type="button" onClick={goToday} className="inline-flex items-center cursor-pointer" style={{ padding: "9px 14px", background: "#faf7f1", border: "1px solid #d9d1c2", fontSize: 13, color: "#6b6358" }}>Today</button>
            <span style={{ width: 1, height: 26, background: "#ece5d4", margin: "0 4px" }} />
            {LAYOUTS.map((l) => {
              const on = l.id === layout;
              return (
                <button key={l.id} type="button" onClick={() => setLayout(l.id)} title={`Draw each day as: ${l.label}`}
                  className="inline-flex items-center cursor-pointer"
                  style={{ gap: 7, padding: "9px 13px", fontSize: 13, background: on ? "#1f1b16" : "#fff", color: on ? "#faf7f1" : "#6b6358", border: `1px solid ${on ? "#1f1b16" : "#d9d1c2"}`, fontWeight: on ? 500 : 400 }}>
                  <Glyph paths={l.paths} sw={on ? 1.8 : 1.5} />
                  {l.label}
                </button>
              );
            })}
          </div>
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 26, margin: 0, color: "#1f1b16" }}>{monthName}</h3>
        </div>

        {/* Month at a glance */}
        <div className="flex flex-wrap" style={{ borderBottom: "1px solid #ece5d4", background: "#faf7f1" }}>
          {summary.map((s) => (
            <div key={s.label} style={{ flex: 1, minWidth: 150, padding: "16px 24px", borderRight: "1px solid #ece5d4" }}>
              <div className="flex items-baseline" style={{ gap: 8 }}>
                <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: "#1f1b16" }}>{s.value}</span>
                <span style={{ fontSize: 12, color: "#8a8276" }}>{s.unit}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#6b6358", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* How to read a day + legend. Every swatch is a miniature cell drawn by
            the same rule as the grid, so it re-draws with the layout. */}
        <div className="flex flex-wrap items-stretch" style={{ borderBottom: "1px solid #ece5d4", background: "#fdfcf9" }}>
          <div className="flex items-center" style={{ gap: 14, flex: "0 0 auto", padding: "18px 24px", borderRight: "1px solid #ece5d4" }}>
            <span style={{ position: "relative", display: "inline-block", width: 60, height: 48, flex: "none", border: "1px solid #ded6c6", background: "#fff" }}>{anatomy[layout].node}</span>
            <div style={{ fontSize: 12.5, color: "#4a4034", lineHeight: 1.55, maxWidth: 190 }}>
              <b style={{ display: "block", color: "#1f1b16", fontSize: 13 }}>How to read a day</b>
              <span style={{ color: "#6b6358" }}>{anatomy[layout].text}</span>
            </div>
          </div>
          {/* A grid, not a wrap: entries of uneven width flow ragged and leave
              the block beside them stranded on its own line. Fixed tracks keep
              the swatches in columns. */}
          <div style={{ flex: 1, minWidth: 320, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", columnGap: 24, rowGap: 12, padding: "18px 24px", alignContent: "center", fontSize: 12.5, color: "#4a4034" }}>
            {LEGEND.map((l) => (
              <span key={l.name} className="inline-flex items-start" style={{ gap: 10, minWidth: 0 }}>
                <span style={{ marginTop: 1 }}><LegendCell dayFill={l.dayFill} nightFill={l.nightFill} layout={layout} /></span>
                <span style={{ lineHeight: 1.45 }}>
                  <b style={{ fontWeight: 600, color: "#1f1b16" }}>{l.name}</b>
                  <span style={{ color: "#8a8276" }}> — {l.desc}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8276", padding: "0 0 10px" }}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} style={{ minHeight: cellHeight, background: "#fdfcfa", border: "1px solid #f3eee2" }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const reasons = blockInfo[day];
              const blocked = !!reasons;
              const blockNote = blocked ? reasons.filter((x) => x !== "Blocked").join(" · ") : "";
              const r = blocked ? null : resolveDay(day);

              // A blocked day overrides both halves; a free day is white on both.
              const dayFill = blocked ? COLOR.blocked : r?.dayFill ?? COLOR.empty;
              const nightFill = blocked ? COLOR.blocked : r?.nightFill ?? COLOR.empty;
              const dayHeld = dayFill !== COLOR.empty;
              const nightHeld = nightFill !== COLOR.empty;
              const solid = dayFill === nightFill;
              const isToday = day === todayNum;
              const bothFree = !blocked && !dayHeld && !nightHeld;

              // Today is a filled chip rather than a tint, so it survives being
              // drawn on top of any of the six fills.
              const number = (color: string) => (
                <span style={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, fontWeight: 600, lineHeight: 1,
                  color: isToday ? "#ffffff" : color,
                  background: isToday ? "#1f1b16" : "transparent",
                  padding: isToday ? "4px 6px" : 0, borderRadius: isToday ? 4 : 0,
                }}>{day}</span>
              );

              // ── Diagonal ──────────────────────────────────────────────────
              // A label has to sit inside the band its booking actually
              // occupies, and each triangle is only wide enough for text at one
              // end: the upper-left (daytime) triangle is widest along the TOP,
              // the lower-right (night) triangle is widest along the BOTTOM. So
              // a daytime label anchors top-left, and a night-only label
              // anchors bottom-right — neither ever reaches the diagonal.
              const labelInNight = !dayHeld && nightHeld;

              const heading = (color: string) => (
                <div className="flex items-center" style={{ gap: 6 }}>
                  {number(color)}
                  {blocked ? <span style={{ fontSize: 10.5, color }}>Blocked</span> : null}
                  {!labelInNight && r?.label ? <span style={{ fontSize: 10.5, color, opacity: 0.95 }}>{r.label}</span> : null}
                  {r?.asterisk ? <span style={{ fontSize: 11, fontWeight: 700, color }}>*</span> : null}
                  {r?.sun ? <Sun className="w-4 h-4" strokeWidth={2.5} style={{ color }} /> : null}
                </div>
              );

              // Drawn twice in identical absolute boxes — once in the day
              // half's colour, once in the night half's clipped to the night
              // triangle — so whichever band a run of text lands in, it is
              // already the right colour for that fill.
              const content = (color: string) => (
                <>
                  {heading(color)}
                  {blocked && blockNote ? <div style={{ fontSize: 9.5, marginTop: 3, color, opacity: 0.8 }}>{blockNote}</div> : null}
                  {labelInNight ? (
                    <div style={{ position: "absolute", right: 8, bottom: 6, textAlign: "right" }}>
                      <div className="flex items-center justify-end" style={{ gap: 4 }}>
                        {r?.moon ? <Moon className="w-4 h-4" strokeWidth={2.5} style={{ color }} /> : null}
                        {r?.label ? <span style={{ fontSize: 10.5, color, opacity: 0.95, lineHeight: 1.3 }}>{r.label}</span> : null}
                      </div>
                      {r?.sub ? <div style={{ fontSize: 9.5, marginTop: 1, color, opacity: 0.75, fontStyle: "italic" }}>{r.sub}</div> : null}
                    </div>
                  ) : (
                    <>
                      {r?.sub ? <div style={{ fontSize: 9.5, marginTop: 3, color, opacity: 0.75, fontStyle: "italic" }}>{r.sub}</div> : null}
                      {r?.moon ? (
                        <div style={{ position: "absolute", bottom: 6, right: 8, color }}>
                          <Moon className="w-4 h-4" strokeWidth={2.5} />
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              );

              const splitNode = (
                <>
                  {solid ? null : <span aria-hidden style={{ position: "absolute", inset: 0, background: nightFill, clipPath: NIGHT_CLIP }} />}
                  {solid ? null : <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><Diagonal color="rgba(255,255,255,0.55)" /></span>}
                  <div style={{ position: "absolute", inset: 0, padding: 8 }}>{content(textOn(dayFill))}</div>
                  {solid ? null : <div aria-hidden style={{ position: "absolute", inset: 0, padding: 8, clipPath: NIGHT_CLIP }}>{content(textOn(nightFill))}</div>}
                </>
              );

              // ── Two rows ──────────────────────────────────────────────────
              // Each half gets a full-width band with its own clock range, so
              // nothing has to be inferred from a triangle.
              const band = (held: boolean, fill: string, text: string, isNight: boolean) => {
                const bg = held ? fill : "#ffffff";
                const fg = held ? textOn(fill) : "#4a4034";
                return (
                  <div className="flex items-center justify-between" style={{ gap: 6, padding: "0 8px", height: 34, background: bg, color: fg, border: `1px solid ${held ? "transparent" : "#eae3d4"}` }}>
                    <span className="flex items-center" style={{ gap: 5, minWidth: 0, overflow: "hidden" }}>
                      {isNight ? <Moon className="w-3.5 h-3.5" strokeWidth={2} style={{ flex: "none" }} /> : <Sun className="w-3.5 h-3.5" strokeWidth={2} style={{ flex: "none" }} />}
                      <span style={{ fontSize: 10.5, letterSpacing: "0.02em", opacity: 0.85, whiteSpace: "nowrap" }}>{isNight ? "7PM–5AM" : "7AM–5PM"}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
                  </div>
                );
              };

              const rowsNode = (
                <div style={{ position: "absolute", inset: 0, padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div className="flex items-center justify-between" style={{ gap: 6 }}>
                    {number("#1f1b16")}
                    {blocked && blockNote ? <span style={{ fontSize: 10, color: "#8a4a3a", opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{blockNote}</span> : null}
                  </div>
                  {band(blocked || dayHeld, dayFill, blocked ? "Blocked" : r?.dayText ?? "", false)}
                  {band(blocked || nightHeld, nightFill, blocked ? "Blocked" : r?.nightText ?? "", true)}
                </div>
              );

              // ── Plain words ───────────────────────────────────────────────
              // One line of plain language, over a two-part bar showing which
              // half of the date is gone.
              const seg = (held: boolean, fill: string) => (blocked ? COLOR.blocked : held ? fill : OPEN_SEGMENT);
              const headline = blocked ? "Blocked"
                : bothFree ? "Free all day"
                : dayHeld && nightHeld ? "Fully booked"
                : dayHeld ? "Night still free" : "Day still free";
              const detail = blocked ? (blockNote || "Unavailable for booking")
                : [r?.label, r?.sub].filter(Boolean).join(" · ");

              const stripNode = (
                <div style={{ position: "absolute", inset: 0, padding: "9px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div className="flex items-start justify-between" style={{ gap: 6 }}>
                    {number("#1f1b16")}
                    <span style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: blocked ? "#8a4a3a" : bothFree ? "#4a6a3a" : "#1f1b16" }}>{headline}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "#6b6358", marginBottom: 7, lineHeight: 1.35 }}>{detail}</div>
                    <div className="flex" style={{ gap: 3 }}>
                      <span style={{ flex: 1, height: 7, background: seg(dayHeld, dayFill) }} />
                      <span style={{ flex: 1, height: 7, background: seg(nightHeld, nightFill) }} />
                    </div>
                    <div className="flex" style={{ gap: 3, marginTop: 3, fontSize: 8.5, letterSpacing: "0.06em", color: "#a09789" }}>
                      <span style={{ flex: 1 }}>DAY</span><span style={{ flex: 1 }}>NIGHT</span>
                    </div>
                  </div>
                </div>
              );

              return (
                <button key={day} type="button" onClick={() => setSelectedDay(day)}
                  className="text-left cursor-pointer relative overflow-hidden"
                  style={{ minHeight: cellHeight, background: layout === "split" ? dayFill : "#ffffff", border: `1px solid ${isToday ? "#1f1b16" : "#e8e1d2"}` }}>
                  {layout === "rows" ? rowsNode : layout === "strip" ? stripNode : splitNode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail */}
      {selDateObj && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(31,27,22,0.45)", padding: 24 }} onClick={() => setSelectedDay(null)}>
          <div className="w-full overflow-y-auto" style={{ maxWidth: 540, maxHeight: "100%", background: "#fff", border: "1px solid #ece5d4", boxShadow: "0 24px 70px rgba(31,27,22,0.22)" }} onClick={(e) => e.stopPropagation()}>

            <div className="flex items-start justify-between" style={{ gap: 16, padding: "22px 24px 18px" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a09789" }}>{selDateObj.toLocaleDateString("en-US", { weekday: "long" })}</div>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 27, lineHeight: 1.1, margin: "6px 0 0", color: "#1f1b16" }}>
                  {selDateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>
              <button type="button" onClick={() => setSelectedDay(null)} title="Close" className="grid place-items-center cursor-pointer" style={{ width: 32, height: 32, flex: "none", border: "1px solid #ece5d4", background: "transparent", color: "#8a8276" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div style={{ padding: "11px 24px", background: banner.bg, borderTop: "1px solid #ece5d4", borderBottom: "1px solid #ece5d4", fontSize: 13, fontWeight: 600, color: banner.fg }}>{banner.text}</div>

            {detailBlocks.map((b) => {
              const tone = b.booking ? statusTone(b.booking.status) : null;
              return (
                <div key={b.title} className="flex" style={{ gap: 14, padding: "18px 24px", borderBottom: "1px solid #f5f0e6" }}>
                  <span className="grid place-items-center" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: "#faf7f1", color: "#8a7a66" }}>
                    {b.isNight ? <Moon className="w-4 h-4" strokeWidth={1.8} /> : <Sun className="w-4 h-4" strokeWidth={1.8} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-baseline flex-wrap" style={{ gap: 8 }}>
                      <b style={{ fontSize: 13.5, color: "#1f1b16" }}>{b.title}</b>
                      <span style={{ fontSize: 11.5, color: "#a09789" }}>{b.hours}</span>
                    </div>

                    {b.booking ? (
                      <div style={{ marginTop: 11, background: "#faf7f1", border: "1px solid #efe9dd" }}>
                        <div className="flex items-center" style={{ gap: 12, padding: "12px 14px", borderBottom: "1px solid #efe9dd" }}>
                          <span className="grid place-items-center" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: "#b8754a", color: "#faf7f1", fontSize: 12, fontWeight: 600 }}>{initialsOf(b.booking.name)}</span>
                          <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                            <span style={{ display: "block", fontSize: 13.5, color: "#1f1b16" }}>{b.booking.name}</span>
                            <span style={{ display: "block", fontSize: 11.5, color: "#8a8276", marginTop: 2 }}>
                              {b.booking.isCheckIn ? `Checks in ${fmt12h(b.booking.checkInTime)}` : b.booking.isCheckOut ? `Checks out ${fmt12h(b.booking.checkOutTime)}` : "Staying through"}
                            </span>
                          </span>
                          <span className="flex flex-col items-end" style={{ gap: 4 }}>
                            {b.booking.status ? (
                              <span className="inline-flex items-center" style={{ gap: 6, fontSize: 11.5, color: tone!.fg }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone!.dot }} />{b.booking.status}
                              </span>
                            ) : null}
                            <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#8a8276", whiteSpace: "nowrap" }}>{b.booking.id}</span>
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", columnGap: 16, rowGap: 10, padding: "13px 14px" }}>
                          {([["Haven", b.booking.haven], ["Stay", b.booking.stay], ["Guests", b.booking.party], ["Contact", b.booking.phone], ["Total", b.booking.total], ["Balance", b.booking.balance]] as [string, string][]).map(([k, v]) => (
                            <div key={k} style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a09789" }}>{k}</div>
                              <div style={{ fontSize: 12.5, color: "#1f1b16", marginTop: 3 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 7, fontSize: 12.5, color: "#6b6358", lineHeight: 1.5 }}>{b.freeText}</div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end" style={{ padding: "16px 24px" }}>
              <button type="button" onClick={() => setSelectedDay(null)} className="inline-flex items-center cursor-pointer" style={{ padding: "9px 18px", background: "#1f1b16", color: "#faf7f1", fontSize: 13, border: "none" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A legend swatch is a miniature calendar cell — same fills, same geometry, so
// a swatch and the day it describes are always drawn by the same rule. That
// means it has to follow the layout switcher: a diagonal swatch next to a grid
// of two-row cells would be a lie.
function LegendCell({ dayFill, nightFill, layout }: { dayFill: string; nightFill: string; layout: CalLayout }) {
  if (layout === "rows") {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 1, width: 22, height: 18, flex: "none" }}>
        <span style={{ flex: 1, background: dayFill, border: "1px solid #ded6c6" }} />
        <span style={{ flex: 1, background: nightFill, border: "1px solid #ded6c6" }} />
      </span>
    );
  }
  if (layout === "strip") {
    return (
      <span style={{ display: "inline-flex", gap: 1, width: 22, height: 18, flex: "none", alignItems: "flex-end" }}>
        <span style={{ flex: 1, height: 7, background: dayFill === COLOR.empty ? OPEN_SEGMENT : dayFill }} />
        <span style={{ flex: 1, height: 7, background: nightFill === COLOR.empty ? OPEN_SEGMENT : nightFill }} />
      </span>
    );
  }
  return (
    <span style={{ position: "relative", display: "inline-block", width: 22, height: 18, flex: "none", background: dayFill, border: "1px solid #ded6c6" }}>
      {dayFill === nightFill ? null : (
        <span aria-hidden style={{ position: "absolute", inset: 0, background: nightFill, clipPath: NIGHT_CLIP }} />
      )}
    </span>
  );
}

// ── 3. Blocked Dates ──────────────────────────────────────────────────────
export function BlockedDatesSection() {
  const { data: blockedRes } = useGetBlockedDatesQuery({});
  const { data: havensData } = useGetHavensQuery({});
  const [createBlocked, { isLoading: creating }] = useCreateBlockedDateMutation();
  const [deleteBlocked] = useDeleteBlockedDateMutation();
  const rows = dataOf(blockedRes);
  const havens = arr(havensData).map((h) => ({ id: String(h.uuid_id || h.id || ""), name: String(h.haven_name || "Haven") }));
  const [haven_id, setHavenId] = useState("");
  const [reason, setReason] = useState("");
  const [range, setRange] = useState<DateRange | undefined>();
  // Single-property site: with exactly one haven there's nothing to choose —
  // use it automatically and hide the selector.
  const singleHaven = havens.length === 1 ? havens[0] : null;
  const effectiveHavenId = singleHaven ? singleHaven.id : haven_id;

  // Local YYYY-MM-DD (avoid the UTC shift toISOString causes).
  const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromD = range?.from, toD = range?.to ?? range?.from;

  const submit = async () => {
    if (!effectiveHavenId) { toast.error("Select a haven"); return; }
    if (!fromD) { toast.error("Pick a date range on the calendar"); return; }
    try {
      await createBlocked({ haven_id: effectiveHavenId, from_date: toISO(fromD), to_date: toISO(toD!), reason }).unwrap();
      toast.success("Dates blocked");
      setRange(undefined); setReason("");
    } catch { toast.error("Could not block dates"); }
  };
  const remove = async (id: string) => { try { await deleteBlocked(id).unwrap(); toast.success("Removed"); } catch { toast.error("Could not remove"); } };

  const inputCls = "rounded-xl border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" } as const;
  const niceDate = (d?: Date) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  return (
    <div>
      <SectionHead title="Blocked Dates" icon={CalendarOff} sub="Mark dates unavailable for booking (maintenance, events, holidays)" />
      <Card className="p-5 mb-6">
        <div className={`grid grid-cols-1 ${singleHaven ? "" : "md:grid-cols-2"} gap-3 mb-4`}>
          {!singleHaven && (
            <select aria-label="Select haven" value={haven_id} onChange={(e) => setHavenId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Select haven</option>
              {havens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div className="border p-5" style={{ borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>
          <RangeCalendar value={range} onChange={setRange} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-sm" style={{ color: "#8B6344" }}>
            {fromD ? <>Blocking <span className="font-semibold" style={{ color: "#1a1a1a" }}>{niceDate(fromD)}{toD && toD !== fromD ? ` → ${niceDate(toD)}` : ""}</span></> : "Click a start and end date on the calendar."}
          </p>
          <button type="button" onClick={submit} disabled={creating} className="px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#1f1b16" }}>{creating ? "Blocking…" : "Block dates"}</button>
        </div>
      </Card>
      {rows.length === 0 ? <Empty label="No blocked dates." /> : (
        <Table headers={["Haven", "From", "To", "Reason", "Status", ""]}>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(r.haven_name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{fmtDate(r.from_date)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{fmtDate(r.to_date)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(r.reason ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.status ?? "active")} tone="warn" /></td>
              <td className="px-4 py-3.5">
                <button type="button" onClick={() => remove(String(r.id))} title="Remove" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#fee2e2"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 4. Cleaning Management ────────────────────────────────────────────────
export function CleaningManagementSection() {
  const { data: tasksData } = useGetCleaningTasksQuery();
  const rows = dataOf(tasksData);
  const tone = (s: string) => (s === "cleaned" || s === "inspected" ? "good" : s === "in-progress" ? "neutral" : "warn");
  return (
    <div>
      <SectionHead title="Cleaning Management" icon={Sparkles} sub="Turnover tasks across all havens" />
      {rows.length === 0 ? <Empty label="No cleaning tasks yet — they appear after bookings are made." /> : (
        <Table headers={["Haven", "Guest", "Cleaner", "Window", "Status"]}>
          {rows.map((t, i) => (
            <tr key={String(t.cleaning_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(t.haven ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{`${t.guest_first_name ?? ""} ${t.guest_last_name ?? ""}`.trim() || "—"}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{`${t.cleaner_first_name ?? ""} ${t.cleaner_last_name ?? ""}`.trim() || "Unassigned"}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{t.check_in_time && t.check_out_time ? `${t.check_in_time}–${t.check_out_time}` : "—"}</td>
              <td className="px-4 py-3.5"><Pill text={String(t.cleaning_status ?? "pending").replace("-", " ")} tone={tone(String(t.cleaning_status))} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 5. Payment Methods ────────────────────────────────────────────────────
const PM_METHODS = ["GCash", "Bank Transfer", "Maya", "Card", "Cash", "Other"];
const emptyPM = { payment_name: "", payment_method: "GCash", provider: "", account_details: "", description: "", qr: null as File | null, qrUrl: "", is_active: true };

export function PaymentMethodsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPM);
  const [editId, setEditId] = useState<string | null>(null);

  const reload = () =>
    fetch("/api/payment-methods").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => setRows(arr(j.data))).catch(() => {});
  useEffect(() => { reload(); }, []);

  const openAdd = () => { setEditId(null); setForm(emptyPM); setModal(true); };
  const closeModal = () => { setModal(false); setEditId(null); setForm(emptyPM); };
  const startEdit = (m: Row) => {
    setEditId(String(m.id));
    setForm({
      payment_name: String(m.payment_name ?? ""),
      payment_method: String(m.payment_method ?? "GCash"),
      provider: String(m.provider ?? ""),
      account_details: String(m.account_details ?? ""),
      description: String(m.description ?? ""),
      qr: null,
      qrUrl: String(m.payment_qr_link ?? ""),
      is_active: Boolean(m.is_active),
    });
    setModal(true);
  };

  const submit = async () => {
    if (!form.payment_name.trim() || !form.provider.trim() || !form.account_details.trim()) {
      toast.error("Fill in name, provider and account details"); return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("payment_name", form.payment_name.trim());
      fd.append("payment_method", form.payment_method);
      fd.append("provider", form.provider.trim());
      fd.append("account_details", form.account_details.trim());
      fd.append("description", form.description.trim());
      fd.append("is_active", String(form.is_active));
      if (form.qr) fd.append("qr_image", form.qr);
      const res = editId
        ? await fetch(`/api/payment-methods/${editId}`, { method: "PUT", body: fd })
        : await fetch("/api/payment-methods", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      toast.success(editId ? "Payment method updated" : "Payment method added");
      closeModal(); reload();
    } catch { toast.error(editId ? "Could not update payment method" : "Could not add payment method"); }
    finally { setSaving(false); }
  };

  const toggle = async (id: unknown) => {
    try { const r = await fetch(`/api/payment-methods/${id}/toggle-status`, { method: "PATCH" }); if (!r.ok) throw new Error(); reload(); }
    catch { toast.error("Could not update status"); }
  };
  const remove = async (id: unknown) => {
    try { const r = await fetch(`/api/payment-methods/${id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); toast.success("Payment method deleted"); reload(); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <SectionHead title="Payment Methods" icon={CreditCard} sub="Channels guests can pay through (GCash, bank, etc.)" />
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer flex-shrink-0" style={{ backgroundColor: "#1f1b16" }}>
          <Plus className="w-4 h-4" /> Add Payment Method
        </button>
      </div>
      {rows.length === 0 ? <Empty label="No payment methods configured yet." /> : (
        <Table headers={["Method", "Provider", "Account details", "Status", "Actions"]}>
          {rows.map((m, i) => (
            <tr key={String(m.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(m.payment_name ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(m.provider ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm font-mono" style={{ color: "#5a4a3a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {m.payment_qr_link ? <ImageThumb src={String(m.payment_qr_link)} alt="Payment QR code" size={38} /> : null}
                  <span>{String(m.account_details ?? "—")}</span>
                </div>
              </td>
              <td className="px-4 py-3.5"><Pill text={m.is_active ? "active" : "inactive"} tone={m.is_active ? "good" : "neutral"} /></td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(m)} title="Edit" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#5a4a3a" }}><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggle(m.id)} title={m.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg cursor-pointer" style={{ color: m.is_active ? "#92400e" : "#065f46" }}><Power className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(m.id)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {modal && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "rgba(31,27,22,0.45)" }}>
          <style>{`@keyframes vb-pop{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}`}</style>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#ffffff", border: "1px solid #ece5d4", borderRadius: 16, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45), 0 4px 14px -6px rgba(58,42,24,.18)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%", animation: "vb-pop .35s cubic-bezier(.2,.7,.3,1) both" }}>

            {/* Header */}
            <div style={{ position: "relative", padding: "20px 22px 16px", background: "linear-gradient(180deg, #f3e7d2 0%, rgba(255,255,255,0) 100%)", flexShrink: 0 }}>
              <button type="button" onClick={closeModal} title="Close"
                onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "#fff"; t.style.color = "#1f1b16"; }}
                onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "rgba(255,255,255,.7)"; t.style.color = "#8a6f4d"; }}
                style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: "50%", background: "rgba(255,255,255,.7)", color: "#8a6f4d", cursor: "pointer", transition: "all .15s" }}>
                <X className="w-3.5 h-3.5" />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 40 }}>
                <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "#1f1b16", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 6px 14px -6px rgba(31,27,22,.5)" }}>
                  <CreditCard className="w-[19px] h-[19px]" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", color: "#1f1b16" }}>{editId ? "Edit Payment Method" : "Add Payment Method"}</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9b8870" }}>A channel guests can pay through.</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "4px 22px 20px", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Display name</label>
                <input value={form.payment_name} onChange={(e) => setForm((f) => ({ ...f, payment_name: e.target.value }))} placeholder="GCash — Main" style={{ width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Type</label>
                  <div style={{ position: "relative", marginTop: 7 }}>
                    <select aria-label="Payment type" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} style={{ width: "100%", borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 30px 10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer" }}>
                      {PM_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a08a6c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M6 9l6 6 6-6" /></svg>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Provider</label>
                  <input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="GCash / BPI…" style={{ width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Account details</label>
                <input value={form.account_details} onChange={(e) => setForm((f) => ({ ...f, account_details: e.target.value }))} placeholder="0917 123 4567 · Juan Dela Cruz" style={{ width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none", fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }} />
              </div>

              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Notes <span style={{ color: "#c2ad88", fontWeight: 500, letterSpacing: 0 }}>· optional</span></label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. for down payments only" style={{ width: "100%", marginTop: 7, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "10px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" }} />
              </div>

              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>QR image <span style={{ color: "#c2ad88", fontWeight: 500, letterSpacing: 0 }}>· optional</span></label>
                {form.qrUrl && !form.qr && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7, padding: "10px 12px", borderRadius: 12, border: "1px solid #ece5d4", background: "#fbf8f2" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.qrUrl} alt="Current QR" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: "1px solid #ece5d4", flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#6f5c44" }}>Current QR image · choose a file below to replace it.</span>
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 7, padding: "15px 16px", borderRadius: 12, border: `1px ${form.qr ? "solid #dcebe0" : "dashed #d8c8a8"}`, background: form.qr ? "#f1f7f2" : "#fcfaf5", cursor: "pointer" }}>
                  <span style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: form.qr ? "#dcebe0" : "#f1ead9", color: form.qr ? "#2f7d55" : "#b8754a", display: "grid", placeItems: "center" }}>
                    {form.qr ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></svg>
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, color: "#1f1b16", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {form.qr ? form.qr.name : (<>Drop a QR image, or <span style={{ color: "#b8754a", textDecoration: "underline" }}>browse</span></>)}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: form.qr ? "#2f7d55" : "#a08a6c", marginTop: 1 }}>{form.qr ? "Ready to upload" : "PNG or JPG · helps guests pay faster"}</span>
                  </span>
                  <input aria-label="QR image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { const file = e.target.files?.[0] || null; if (file) { const err = imageFileError(file); if (err) { toast.error(err); e.target.value = ""; return; } } setForm((f) => ({ ...f, qr: file })); }} style={{ display: "none" }} />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "13px 22px", borderTop: "1px solid #f4ecdd", background: "#fff", flexShrink: 0 }}>
              <button type="button" onClick={closeModal} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", background: "transparent", color: "#6f5c44", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={submit} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", background: "#1f1b16", color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{editId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{saving ? (editId ? "Saving…" : "Adding…") : (editId ? "Save Changes" : "Add Method")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5b. Pricing Calendar (Weekend & Holiday rules) ─────────────────────────
// Owner-editable version of what src/lib/pricing.ts used to hardcode: which
// weekdays count as "weekend" and which specific dates count as "holiday"
// for weekend/holiday-rate pricing. Rate AMOUNTS are still edited via
// Property → haven → Pricing — this only controls which days/dates qualify.
const DOW = [
  { n: 0, label: "Sun" }, { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" },
  { n: 4, label: "Thu" }, { n: 5, label: "Fri" }, { n: 6, label: "Sat" },
];
// "YYYY-MM-DD" → local-midnight display date (avoids the UTC-parse day-shift
// that plain `new Date(iso)` + toLocaleDateString() can cause in -UTC zones).
const fmtHolidayDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export function PricingCalendarSection() {
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);
  const [holidays, setHolidays] = useState<{ date: string; label: string }[]>([]);
  const [savingDays, setSavingDays] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: "", label: "" });
  const [addingHoliday, setAddingHoliday] = useState(false);

  const reload = () =>
    fetch("/api/admin/pricing-calendar")
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => {
        if (!j?.data) return;
        setWeekendDays(((j.data.weekendDays || []) as unknown[]).map(Number));
        setHolidays(arr(j.data.holidays) as unknown as { date: string; label: string }[]);
      })
      .catch(() => {});
  useEffect(() => { reload(); }, []);

  const toggleDay = (n: number) => {
    setWeekendDays((prev) => (prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort((a, b) => a - b)));
  };

  const saveWeekendDays = async () => {
    if (weekendDays.length === 0) { toast.error("Pick at least one weekend day"); return; }
    setSavingDays(true);
    try {
      const res = await fetch("/api/admin/pricing-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekendDays }),
      });
      if (!res.ok) throw new Error();
      toast.success("Weekend days updated");
    } catch { toast.error("Could not update weekend days"); }
    finally { setSavingDays(false); }
  };

  const addHoliday = async () => {
    if (!newHoliday.date) { toast.error("Pick a date"); return; }
    setAddingHoliday(true);
    try {
      const res = await fetch("/api/admin/pricing-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newHoliday.date, label: newHoliday.label.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Holiday added");
      setNewHoliday({ date: "", label: "" });
      reload();
    } catch { toast.error("Could not add holiday"); }
    finally { setAddingHoliday(false); }
  };

  const removeHoliday = async (date: string) => {
    try {
      const res = await fetch(`/api/admin/pricing-calendar?date=${encodeURIComponent(date)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Holiday removed");
      reload();
    } catch { toast.error("Could not remove holiday"); }
  };

  return (
    <div>
      <SectionHead title="Weekend &amp; Holiday Calendar" sub="Which days &amp; dates guests are charged the weekend/holiday rate. Rate amounts are edited via Property → haven → Pricing." />

      <Card className="p-6 mb-6">
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16", marginBottom: 12 }}>Weekend days</div>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {DOW.map((d) => {
            const on = weekendDays.includes(d.n);
            return (
              <button key={d.n} type="button" onClick={() => toggleDay(d.n)}
                style={{
                  padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: on ? "1px solid #B07848" : "1px solid #ece5d4",
                  background: on ? "#B07848" : "#fff", color: on ? "#fff" : "#5a4a3a",
                }}>
                {d.label}
              </button>
            );
          })}
          <button type="button" onClick={saveWeekendDays} disabled={savingDays}
            style={{ marginLeft: 8, padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: "none", background: "#1f1b16", color: "#fff", cursor: "pointer", opacity: savingDays ? 0.6 : 1 }}>
            {savingDays ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>

      <div style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16", marginBottom: 12 }}>Holidays</div>
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end" style={{ gap: 10 }}>
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Date</label>
            <input aria-label="Holiday date" type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((f) => ({ ...f, date: e.target.value }))}
              style={{ display: "block", marginTop: 6, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "9px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" }} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#b8754a" }}>Label <span style={{ color: "#c2ad88", fontWeight: 500, letterSpacing: 0 }}>· optional</span></label>
            <input value={newHoliday.label} onChange={(e) => setNewHoliday((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Founding Anniversary"
              style={{ width: "100%", marginTop: 6, borderRadius: 10, border: "1px solid #f1ead9", background: "#faf7f1", padding: "9px 12px", fontSize: 13.5, color: "#1f1b16", outline: "none" }} />
          </div>
          <button type="button" onClick={addHoliday} disabled={addingHoliday}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", background: "#1f1b16", color: "#fff", cursor: "pointer", opacity: addingHoliday ? 0.6 : 1 }}>
            <Plus className="w-3.5 h-3.5" />{addingHoliday ? "Adding…" : "Add holiday"}
          </button>
        </div>
      </Card>

      {holidays.length === 0 ? <Empty label="No holidays configured yet." /> : (
        <Table headers={["Date", "Label", "Actions"]}>
          {holidays.map((h, i) => (
            <tr key={h.date} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm font-mono" style={{ color: "#1a1a1a" }}>{fmtHolidayDate(h.date)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{h.label || "—"}</td>
              <td className="px-4 py-3.5">
                <button onClick={() => removeHoliday(h.date)} title="Remove holiday" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}><Trash2 className="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 6. Guest Assistance ───────────────────────────────────────────────────
export function GuestAssistanceSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/report")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (active) setRows(arr(j.data)); })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  const tone = (s: string) => (s === "resolved" || s === "closed" ? "good" : s === "in-progress" ? "neutral" : "bad");
  // Match the Property → Maintenance colour scale so the same issue doesn't
  // read as a different severity depending on which tab you opened it from.
  const priorityTone = (p: string) =>
    p === "urgent" ? "bad" : p === "high" ? "warn" : p === "medium" ? "neutral" : "good";
  return (
    <div>
      <SectionHead title="Guest Assistance" icon={Headphones} sub="Support requests and reported issues across the property" />
      {rows.length === 0 ? <Empty label={loaded ? "No assistance requests." : "Loading assistance requests…"} /> : (
        <Table headers={["Haven", "Type", "Priority", "Description", "Status", "Reported"]}>
          {rows.map((r, i) => (
            <tr key={String(r.report_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(r.haven_name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(r.issue_type ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.priority_level ?? "low")} tone={priorityTone(String(r.priority_level ?? "low").toLowerCase())} /></td>
              <td className="px-4 py-3.5 text-sm max-w-xs truncate" style={{ color: "#8B6344" }}>{String(r.issue_description ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.status ?? "open")} tone={tone(String(r.status))} /></td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 7. User Management ────────────────────────────────────────────────────
export function UserManagementSection() {
  const { data: usersRes } = useGetAdminUsersQuery({});
  const rows = dataOf(usersRes);
  return (
    <div>
      <SectionHead title="User Management" icon={UsersRound} sub="Registered guest accounts" />
      {rows.length === 0 ? <Empty label="No registered users yet." /> : (
        <Table headers={["Name", "Email", "Role", "Signed up via", "Joined", "Last login"]}>
          {rows.map((u, i) => (
            <tr key={String(u.user_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#1a1a1a" }}>{String(u.name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(u.email ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(u.user_role ?? "Guest")} /></td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(u.register_as ?? "credentials")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{fmtDate(u.created_at)}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{u.last_login ? fmtDate(u.last_login) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── 8. Partner Management ─────────────────────────────────────────────────
export function PartnerManagementSection() {
  const { data: partnersRes } = useGetPartnersQuery({});
  const rows = dataOf(partnersRes);
  const tone = (s: string) => (s === "active" ? "good" : s === "pending" ? "warn" : "bad");
  return (
    <div>
      <SectionHead title="Partner Management" icon={Handshake} sub="Business partners and affiliates" />
      {rows.length === 0 ? <Empty label="No partners yet." /> : (
        <Table headers={["Partner", "Email", "Phone", "Type", "Commission", "Status"]}>
          {rows.map((p, i) => (
            <tr key={String(p.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm font-medium" style={{ color: "#1a1a1a" }}>{String(p.fullname ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(p.email ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(p.phone ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#8B6344" }}>{String(p.type ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{p.commission_rate != null ? `${p.commission_rate}%` : "—"}</td>
              <td className="px-4 py-3.5"><Pill text={String(p.status ?? "pending")} tone={tone(String(p.status))} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
