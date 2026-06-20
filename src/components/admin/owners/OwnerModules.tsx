"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BarChart3, Calendar, CalendarOff, Sparkles, CreditCard, Headphones, UsersRound, Handshake, Plus, Trash2, Power, X } from "lucide-react";
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
function Empty({ label }: { label: string }) {
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
export function BookingCalendarSection() {
  const { data: bookingsData } = useGetBookingsQuery();
  const { data: blockedData } = useGetBlockedDatesQuery({});
  const bookings = dataOf(bookingsData);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = first.getDay();
  const sameMonth = (d: unknown) => { if (!d) return null; const dt = new Date(String(d)); return dt.getFullYear() === month.y && dt.getMonth() === month.m ? dt.getDate() : null; };

  // Per-day check-ins / check-outs + the full occupied span, with guest + id.
  type Entry = { name: string; id: string };
  const dayInfo: Record<number, { ins: Entry[]; outs: Entry[] }> = {};
  const occupiedByDay: Record<number, Entry[]> = {};
  bookings.forEach((b) => {
    if (["rejected", "cancelled"].includes(String(b.status))) return;
    const name = `${b.guest_first_name ?? ""} ${b.guest_last_name ?? ""}`.trim() || "Guest";
    const id = String(b.booking_id ?? b.id ?? "");
    const ci = sameMonth(b.check_in_date); const co = sameMonth(b.check_out_date);
    if (ci) (dayInfo[ci] = dayInfo[ci] || { ins: [], outs: [] }).ins.push({ name, id });
    if (co) (dayInfo[co] = dayInfo[co] || { ins: [], outs: [] }).outs.push({ name, id });
    // Shade every day of the stay (check-in through check-out).
    const start = new Date(String(b.check_in_date)); start.setHours(0, 0, 0, 0);
    const end = new Date(String(b.check_out_date)); end.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime())) return;
    for (const d = new Date(start); d <= (isNaN(end.getTime()) ? start : end); d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === month.y && d.getMonth() === month.m) (occupiedByDay[d.getDate()] = occupiedByDay[d.getDate()] || []).push({ name, id });
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
  const sel = selectedDay != null ? { day: selectedDay, info: dayInfo[selectedDay], blocks: blockInfo[selectedDay], occ: occupiedByDay[selectedDay] } : null;
  const selDate = selectedDay != null ? new Date(month.y, month.m, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";

  return (
    <div>
      <SectionHead title="Booking Calendar" icon={Calendar} sub="Check-ins, check-outs & blocked dates — click a day for details" />
      <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
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
        <div className="grid grid-cols-7" style={{ gap: 6, marginBottom: 6 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8276", padding: "6px 0" }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7" style={{ gap: 6 }}>
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1; const ev = dayInfo[day]; const blocked = !!blockInfo[day];
            const occupied = !!occupiedByDay[day]?.length;
            const boundary = !!(ev?.ins.length || ev?.outs.length);
            const cellBg = blocked ? "#f7e9e5" : boundary ? "#faf0e6" : occupied ? "#eaf2e3" : "#fff";
            const cellBorder = blocked ? "#e0b8ad" : boundary ? "#e6c9a8" : occupied ? "#c2d6b0" : "#ece5d4";
            return (
              <button key={day} type="button" onClick={() => setSelectedDay(day)}
                className="text-left cursor-pointer"
                style={{ border: `1px solid ${cellBorder}`, background: cellBg, padding: 8, minHeight: 64 }}>
                <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: blocked ? "#9a4a3a" : "#4a4034" }}>{day}</div>
                {blocked ? <div style={{ fontSize: 10, marginTop: 4, padding: "1px 6px", background: "#f0d8d0", color: "#9a4a3a", display: "inline-block" }}>Blocked</div> : null}
                {ev?.ins.length ? <div style={{ fontSize: 10, marginTop: 4, padding: "1px 6px", background: "#eaf2e3", color: "#4a6a3a", display: "inline-block" }}>{ev.ins.length} in</div> : null}
                {ev?.outs.length ? <div style={{ fontSize: 10, marginTop: 4, padding: "1px 6px", background: "#faf0e6", color: "#8a6a2f", display: "inline-block" }}>{ev.outs.length} out</div> : null}
                {occupied && !ev?.ins.length && !ev?.outs.length ? <div style={{ fontSize: 10, marginTop: 4, padding: "1px 6px", background: "#eaf2e3", color: "#4a6a3a", display: "inline-block" }}>Booked</div> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap" style={{ gap: 24, marginTop: 20, paddingTop: 18, borderTop: "1px solid #f3eee2", fontSize: 12, color: "#6b6358" }}>
          <div className="flex items-center" style={{ gap: 8 }}><span style={{ width: 10, height: 10, background: "#eaf2e3", border: "1px solid #c2d6b0" }} />Booked / staying</div>
          <div className="flex items-center" style={{ gap: 8 }}><span style={{ width: 10, height: 10, background: "#faf0e6", border: "1px solid #e6c9a8" }} />Check-in / out</div>
          <div className="flex items-center" style={{ gap: 8 }}><span style={{ width: 10, height: 10, background: "#f7e9e5", border: "1px solid #e0b8ad" }} />Blocked</div>
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
            {sel.info?.ins.length ? (
              <div className="mb-3">
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#065f46" }}>Check-ins</p>
                {sel.info.ins.map((g, i) => <div key={i} className="flex justify-between text-sm py-1.5 px-3 rounded-lg mb-1" style={{ backgroundColor: "#ECFDF3" }}><span style={{ color: "#1a1a1a" }}>{g.name}</span><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{g.id}</span></div>)}
              </div>
            ) : null}
            {sel.info?.outs.length ? (
              <div className="mb-1">
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#B07848" }}>Check-outs</p>
                {sel.info.outs.map((g, i) => <div key={i} className="flex justify-between text-sm py-1.5 px-3 rounded-lg mb-1" style={{ backgroundColor: "#F7F0E3" }}><span style={{ color: "#1a1a1a" }}>{g.name}</span><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{g.id}</span></div>)}
              </div>
            ) : null}
            {(() => {
              const boundary = new Set([...(sel.info?.ins || []), ...(sel.info?.outs || [])].map((g) => g.id));
              const staying = (sel.occ || []).filter((g) => !boundary.has(g.id));
              return staying.length ? (
                <div className="mb-1">
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#065f46" }}>Staying</p>
                  {staying.map((g, i) => <div key={i} className="flex justify-between text-sm py-1.5 px-3 rounded-lg mb-1" style={{ backgroundColor: "#ECFDF3" }}><span style={{ color: "#1a1a1a" }}>{g.name}</span><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{g.id}</span></div>)}
                </div>
              ) : null;
            })()}
            {!sel.blocks?.length && !sel.info?.ins.length && !sel.info?.outs.length && !sel.occ?.length ? (
              <p className="text-sm text-center py-4" style={{ color: "#C9B79E" }}>No bookings or blocks on this day.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
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
const emptyPM = { payment_name: "", payment_method: "GCash", provider: "", account_details: "", description: "", qr: null as File | null };

export function PaymentMethodsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPM);

  const reload = () =>
    fetch("/api/payment-methods").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => setRows(arr(j.data))).catch(() => {});
  useEffect(() => { reload(); }, []);

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
      fd.append("is_active", "true");
      if (form.qr) fd.append("qr_image", form.qr);
      const res = await fetch("/api/payment-methods", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      toast.success("Payment method added");
      setModal(false); setForm(emptyPM); reload();
    } catch { toast.error("Could not add payment method"); }
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
        <button onClick={() => setModal(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer flex-shrink-0" style={{ backgroundColor: "#1f1b16" }}>
          <Plus className="w-4 h-4" /> Add Payment Method
        </button>
      </div>
      {rows.length === 0 ? <Empty label="No payment methods configured yet." /> : (
        <Table headers={["Method", "Provider", "Account details", "Status", "Actions"]}>
          {rows.map((m, i) => (
            <tr key={String(m.id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(m.payment_name ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(m.provider ?? m.payment_method ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm font-mono" style={{ color: "#5a4a3a" }}>{String(m.account_details ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={m.is_active ? "active" : "inactive"} tone={m.is_active ? "good" : "neutral"} /></td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => toggle(m.id)} title={m.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg cursor-pointer" style={{ color: m.is_active ? "#92400e" : "#065f46" }}><Power className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(m.id)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setModal(false)}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Payment Method</h3>
                <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>A channel guests can pay through.</p>
              </div>
              <button type="button" onClick={() => setModal(false)} title="Close" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Display name</label>
                <input value={form.payment_name} onChange={(e) => setForm((f) => ({ ...f, payment_name: e.target.value }))} placeholder="GCash – Main" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Type</label>
                  <select aria-label="Payment type" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                    {PM_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Provider</label>
                  <input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="GCash / BPI…" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Account details</label>
                <input value={form.account_details} onChange={(e) => setForm((f) => ({ ...f, account_details: e.target.value }))} placeholder="0917 123 4567 · Juan Dela Cruz" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none font-mono" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Notes (optional)</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. for down payments only" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>QR image (optional)</label>
                <input aria-label="QR image" type="file" accept="image/*" onChange={(e) => setForm((f) => ({ ...f, qr: e.target.files?.[0] || null }))} className="w-full mt-1 text-sm" style={{ color: "#5a4a3a" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setModal(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#1f1b16" }}>{saving ? "Adding…" : "Add Method"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 6. Guest Assistance ───────────────────────────────────────────────────
export function GuestAssistanceSection() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/report").then((r) => (r.ok ? r.json() : { data: [] })).then((j) => { if (active) setRows(arr(j.data)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const tone = (s: string) => (s === "resolved" || s === "closed" ? "good" : s === "in-progress" ? "neutral" : "bad");
  return (
    <div>
      <SectionHead title="Guest Assistance" icon={Headphones} sub="Support requests and reported issues across the property" />
      {rows.length === 0 ? <Empty label="No assistance requests." /> : (
        <Table headers={["Haven", "Type", "Priority", "Description", "Status", "Reported"]}>
          {rows.map((r, i) => (
            <tr key={String(r.report_id ?? i)} style={{ borderTop: i > 0 ? "1px solid #F7F0E3" : "none" }}>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#1a1a1a" }}>{String(r.haven_name ?? "—")}</td>
              <td className="px-4 py-3.5 text-sm" style={{ color: "#5a4a3a" }}>{String(r.issue_type ?? "—")}</td>
              <td className="px-4 py-3.5"><Pill text={String(r.priority_level ?? "low")} tone="warn" /></td>
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
