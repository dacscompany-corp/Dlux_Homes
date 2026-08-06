"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { imageFileError } from "@/lib/validateImageFile";
import ImageThumb from "@/components/ImageThumb";
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
  const { data: summaryRes } = useGetAnalyticsSummaryQuery({ period: "30" });
  const { data: monthlyRes } = useGetMonthlyRevenueQuery({ months: "6" });
  const { data: roomRes } = useGetRevenueByRoomQuery({ period: "30" });
  const s = (summaryRes as unknown as { data?: Row })?.data || {};
  const monthly = dataOf(monthlyRes) as { month: string; revenue: number }[];
  const rooms = dataOf(roomRes) as { room_name: string; revenue: number; bookings: number }[];
  const maxRev = Math.max(1, ...monthly.map((m) => Number(m.revenue) || 0));
  const stats = [
    { label: "Revenue (30d)", value: peso(Number(s.total_revenue ?? 0)) },
    { label: "Bookings (30d)", value: String(s.total_bookings ?? 0) },
    { label: "Occupancy", value: `${Math.round(Number(s.occupancy_rate ?? 0))}%` },
    { label: "New Guests", value: String(s.new_guests ?? 0) },
  ];
  const totalRoomRev = Math.max(1, rooms.reduce((t, r) => t + (Number(r.revenue) || 0), 0));
  const SERIF = "'Instrument Serif', Georgia, serif";
  const MONO = "'Geist Mono', ui-monospace, monospace";
  return (
    <div>
      {/* stats — flat bordered cells */}
      <div className="grid grid-cols-2 lg:grid-cols-4 mb-6" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
        {stats.map((st) => (
          <div key={st.label} style={{ background: "#fff", padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{st.value}</div>
            <div style={{ fontSize: 12, color: "#8a8276", marginTop: 8 }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* revenue chart */}
      <div style={{ background: "#fff", border: "1px solid #ece5d4", marginBottom: 24 }}>
        <div style={{ padding: "22px 24px 0" }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue — last 6 months</h3>
        </div>
        <div style={{ padding: "18px 24px 24px" }}>
          {monthly.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>No revenue recorded yet.</p>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 200 }}>
              {monthly.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center" style={{ gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#6b6358" }}>{peso(Number(m.revenue) || 0)}</span>
                  <div className="w-full flex items-end justify-center" style={{ height: 140 }}>
                    <div style={{ width: "100%", height: `${Math.max(2, ((Number(m.revenue) || 0) / maxRev) * 100)}%`, background: "#b8754a" }} />
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

type DayBooking = { name: string; id: string; kind: StayKind; checkInTime: string; checkOutTime: string; isCheckIn: boolean; isCheckOut: boolean; isMiddle: boolean };

export function BookingCalendarSection() {
  const { data: bookingsData } = useGetBookingsQuery();
  const { data: blockedData } = useGetBlockedDatesQuery({});
  const bookings = dataOf(bookingsData);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
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
    for (const d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== month.y || d.getMonth() !== month.m) continue;
      const isCheckIn = d.getTime() === start.getTime();
      const isCheckOut = d.getTime() === last.getTime() && last.getTime() !== start.getTime();
      (dayBookings[d.getDate()] = dayBookings[d.getDate()] || []).push({
        name, id, kind, checkInTime, checkOutTime,
        isCheckIn, isCheckOut, isMiddle: !isCheckIn && !isCheckOut,
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

  // Diagonal-split day system: solid tan for Daycation, dark maroon-brown for
  // Nightcation, slate blue for Full stay/Continuing, split combos for Day+Night and checkouts.
  const COLOR = {
    blocked: "#F3C9C2",
    day: "#D9A857",    // Daycation — tan/gold
    night: "#3B2418",  // Nightcation / checkout diagonal — dark maroon-brown
    full: "#6E8A96",   // Full stay / Continuing — slate blue
    empty: "#ffffff",
  };

  // Resolve a day's bookings into the render model the reference design uses:
  // which half (day 7AM-5PM / night 7PM-5AM|4PM) is occupied, by what, and
  // what label/icon each half shows.
  function resolveDay(day: number) {
    const list = dayBookings[day] || [];
    const overnightMiddle = list.find((x) => x.kind === "overnight" && x.isMiddle);
    const overnightCheckIn = list.find((x) => x.kind === "overnight" && x.isCheckIn);
    const overnightCheckOut = list.find((x) => x.kind === "overnight" && x.isCheckOut);
    const daycation = list.find((x) => x.kind === "daycation");
    const nightcation = list.find((x) => x.kind === "nightcation" && (x.isCheckIn || x.isMiddle));
    const nightcationOut = list.find((x) => x.kind === "nightcation" && x.isCheckOut && !x.isCheckIn);

    if (overnightMiddle) return { variant: "continuing" as const, label: "Full stay", sub: "Continuing" };
    if (overnightCheckIn) return { variant: "full" as const, label: "Full stay", sub: "" };
    if (overnightCheckOut) {
      const t = fmt12h(overnightCheckOut.checkOutTime);
      // Full-stay checkout in the morning + a same-day Daycation booking that
      // afternoon — flag it so the cell can swap its corner icon to a sun.
      return { variant: "full-checkout" as const, label: t ? `Out ${t}` : "Checkout", sub: "", sameDayDaycation: !!daycation };
    }
    if (daycation && (nightcation || nightcationOut)) {
      const dIn = fmt12h(daycation.checkInTime), dOut = fmt12h(daycation.checkOutTime);
      return { variant: "day-night" as const, label: "Day + Night", sub: dIn && dOut ? `Day ${dIn}–${dOut}` : "" };
    }
    if (daycation) {
      const dIn = fmt12h(daycation.checkInTime), dOut = fmt12h(daycation.checkOutTime);
      return { variant: "day" as const, label: dIn && dOut ? `Day ${dIn}–${dOut}` : "Daycation", sub: "" };
    }
    if (nightcation) {
      const t = fmt12h(nightcation.checkInTime);
      return { variant: "night" as const, label: t ? `In ${t}` : "Night in", sub: "" };
    }
    if (nightcationOut) {
      const t = fmt12h(nightcationOut.checkOutTime);
      return { variant: "night-out" as const, label: t ? `Out ${t}` : "Night out", sub: "" };
    }
    return null;
  }

  const sel = selectedDay != null ? { day: selectedDay, list: dayBookings[selectedDay] || [], blocks: blockInfo[selectedDay] } : null;
  const selDate = selectedDay != null ? new Date(month.y, month.m, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";


  return (
    <div>
      <SectionHead title="Booking Calendar" icon={Calendar} sub="Check-ins, check-outs & blocked dates — click a day for details" />
      <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => shift(-1)} className="inline-flex items-center cursor-pointer" style={{ gap: 8, padding: "8px 14px", background: "transparent", border: "1px solid #d9d1c2", fontSize: 13, color: "#6b6358" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            <span>Prev</span>
          </button>
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, margin: 0, color: "#1f1b16" }}>{monthName}</h3>
          <button type="button" onClick={() => shift(1)} className="inline-flex items-center cursor-pointer" style={{ gap: 8, padding: "8px 14px", background: "transparent", border: "1px solid #d9d1c2", fontSize: 13, color: "#6b6358" }}>
            <span>Next</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* Legend — light cream card, stacked rows with a colored diagonal glyph per state */}
        <div style={{ background: "#FAF6EF", border: "1px solid #ece5d4", borderRadius: 8, padding: "14px 18px", marginBottom: 16 }}>
          <div className="flex flex-col" style={{ gap: 9, fontSize: 12.5, color: "#4a4034" }}>
            <div className="flex items-center" style={{ gap: 9 }}><LegendTriangle color={COLOR.blocked} /><b>Blocked</b>&nbsp;— not bookable</div>
            <div className="flex items-center" style={{ gap: 9 }}><LegendTriangle color={COLOR.day} /><b>Daycation</b>&nbsp;— 7AM–5PM, night open</div>
            <div className="flex items-center" style={{ gap: 9 }}><LegendTriangle color={COLOR.night} /><b>Nightcation</b>&nbsp;— 7PM–5AM, day open</div>
            <div className="flex items-center" style={{ gap: 9 }}><span style={{ width: 12, height: 12, background: COLOR.full, borderRadius: 2 }} /><b>Full stay</b>&nbsp;— 7PM–4PM, nothing open</div>
            <div className="flex items-center" style={{ gap: 9 }}><LegendTriangle color={COLOR.night} secondColor={COLOR.day} /><b>Day + Night</b>&nbsp;— two separate bookings, same date</div>
            <div className="flex items-center" style={{ gap: 9 }}><span style={{ width: 12, height: 12, background: COLOR.full, borderRadius: 2 }} /><b>Continuing</b>&nbsp;— full stay, guest stays through tomorrow</div>
            <div className="flex items-center" style={{ gap: 9 }}><span style={{ width: 12, height: 12, background: COLOR.night, borderRadius: 2 }} /><b>Full stay checkout</b>&nbsp;— out 4PM, evening still open for a Nightcation</div>
          </div>
        </div>

        <div className="grid grid-cols-7" style={{ gap: 0, marginBottom: 0 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8276", padding: "8px 12px" }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7" style={{ border: "1px solid #ece5d4" }}>
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} style={{ minHeight: 76, background: "#fff", border: "1px solid #f3eee2" }} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const blocked = !!blockInfo[day];
            const r = blocked ? null : resolveDay(day);
            const asterisk = r?.variant === "day-night";

            let bg = COLOR.empty;
            let split: { topLeft: string; bottomRight: string } | null = null;
            let textColor = "#4a4034";
            // Sun = a Daycation booking that day, shown at the top (its half is
            // always the top-left corner). Moon = a Nightcation/Overnight
            // booking, shown at the bottom (its half covers the bottom corners).
            // Day+Night cells carry both, since two separate bookings share the date.
            let TopIcon: React.ElementType | null = null;
            let BottomIcon: React.ElementType | null = null;

            if (blocked) { bg = COLOR.blocked; textColor = "#8a4a3a"; }
            else if (r?.variant === "full" || r?.variant === "continuing") { bg = COLOR.full; textColor = "#fff"; BottomIcon = Moon; }
            else if (r?.variant === "day") { split = { topLeft: COLOR.empty, bottomRight: COLOR.day }; textColor = "#4a3a1f"; TopIcon = Sun; }
            else if (r?.variant === "night") { split = { topLeft: COLOR.night, bottomRight: COLOR.empty }; textColor = "#fff"; BottomIcon = Moon; }
            else if (r?.variant === "night-out") { split = { topLeft: COLOR.night, bottomRight: COLOR.empty }; textColor = "#fff"; BottomIcon = Moon; }
            else if (r?.variant === "full-checkout") { split = { topLeft: COLOR.night, bottomRight: COLOR.empty }; textColor = "#fff"; BottomIcon = Moon; }
            else if (r?.variant === "day-night") { split = { topLeft: COLOR.night, bottomRight: COLOR.day }; textColor = "#fff"; TopIcon = Sun; BottomIcon = Moon; }

            // The split clip-path covers the bottom-right AND bottom-left corners —
            // only the top-left corner keeps `split.topLeft`. So content placed at
            // the top belongs to topLeft's color, and anything at the bottom sits
            // on bottomRight's color; each needs its own contrasting text color.
            const topColor = textColor;
            const bottomColor = split && split.bottomRight === COLOR.day ? "#4a3a1f" : textColor;

            return (
              <button key={day} type="button" onClick={() => setSelectedDay(day)}
                className="text-left cursor-pointer relative overflow-hidden"
                style={{ minHeight: 76, padding: 8, background: split ? split.topLeft : bg, border: "1px solid #f3eee2" }}>
                {split ? (
                  <span aria-hidden style={{ position: "absolute", inset: 0, background: split.bottomRight, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
                ) : null}
                <div className="flex items-start justify-between" style={{ position: "relative" }}>
                  <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 600, color: topColor }}>{day}</div>
                  <div className="flex items-center" style={{ gap: 3 }}>
                    {asterisk ? <span style={{ fontSize: 11, fontWeight: 700, color: topColor }}>*</span> : null}
                    {TopIcon ? <TopIcon className="w-4 h-4" strokeWidth={2.5} style={{ color: topColor, opacity: 1 }} /> : null}
                  </div>
                </div>
                <div style={{ position: "relative", marginTop: 3 }}>
                  {r?.label ? <div style={{ fontSize: 10.5, color: bottomColor, opacity: 0.95, lineHeight: 1.3 }}>{r.label}</div> : null}
                  {r?.sub ? <div style={{ fontSize: 9.5, marginTop: 1, color: bottomColor, opacity: 0.75, fontStyle: "italic" }}>{r.sub}</div> : null}
                  {blocked ? <div style={{ fontSize: 10.5, color: textColor }}>Blocked</div> : null}
                </div>
                {BottomIcon ? (
                  <div style={{ position: "absolute", bottom: 6, right: 6, color: bottomColor, opacity: 1 }}>
                    <BottomIcon className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail popover */}
      {sel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, lineHeight: 1, color: "#1f1b16", margin: 0 }}>{selDate}</h3>
              <button type="button" onClick={() => setSelectedDay(null)} title="Close" className="p-1.5 cursor-pointer" style={{ color: "#8a8276" }}><X className="w-4 h-4" /></button>
            </div>
            {sel.blocks?.length ? (
              <div className="rounded-xl border p-3 mb-3" style={{ borderColor: "#F0C9C0", backgroundColor: "#FCEEEA" }}>
                <p className="text-sm font-semibold" style={{ color: "#9C3B28" }}>Blocked</p>
                <p className="text-xs mt-0.5" style={{ color: "#9C3B28" }}>{sel.blocks.filter((r) => r !== "Blocked").join(" · ") || "Unavailable for booking"}</p>
              </div>
            ) : null}
            {sel.list.length ? sel.list.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg mb-1.5" style={{ backgroundColor: "#F7F0E3" }}>
                <div>
                  <span style={{ color: "#1a1a1a" }}>{g.name}</span>
                  <span className="block text-xs mt-0.5" style={{ color: "#8B6344" }}>
                    {g.kind === "overnight" ? "Overnight" : g.kind === "nightcation" ? "Nightcation" : "Daycation"} ·{" "}
                    {g.isCheckIn ? `Check-in ${fmt12h(g.checkInTime)}` : g.isCheckOut ? `Check-out ${fmt12h(g.checkOutTime)}` : "Staying"}
                  </span>
                </div>
                <span className="font-mono text-xs" style={{ color: "#8B6344" }}>{g.id}</span>
              </div>
            )) : null}
            {!sel.blocks?.length && !sel.list.length ? (
              <p className="text-sm text-center py-4" style={{ color: "#C9B79E" }}>No bookings or blocks on this day.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// Small diagonal glyph used in the legend — a solid triangle for single-color
// states, or two triangles side-by-side (split look) when a secondColor is given.
function LegendTriangle({ color, secondColor }: { color: string; secondColor?: string }) {
  if (secondColor) {
    return (
      <span style={{ position: "relative", display: "inline-block", width: 14, height: 12, flex: "none" }}>
        <span aria-hidden style={{ position: "absolute", inset: 0, background: color, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, background: secondColor, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
      </span>
    );
  }
  return <span style={{ display: "inline-block", width: 0, height: 0, borderStyle: "solid", borderWidth: "0 0 12px 14px", borderColor: `transparent transparent ${color} transparent`, flex: "none" }} />;
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
