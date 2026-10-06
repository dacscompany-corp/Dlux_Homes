"use client";

// Month view of the cleaner's own assignments for My Schedule (desktop).
// Each cleaning sits on the day it's due — the guest's checkout — which is the
// same rule the day-by-day list below it uses, so the two always agree. Done
// cleanings stay on the calendar as a record; the list only shows what's open.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { startOfLocalDay } from "@/lib/cleaning-schedule";

export type CalendarTask = {
  id: string;
  room: string;
  floor: string;
  dueAt: Date | null;
  status: string;
};

type StatusStyle = { label: string; color: string; bg: string; dot: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LINE = "#ece5d4";
const MUTED = "#8B6344";
const GOLD_INK = "#8a6a2f";

const dayKey = (d: Date) => startOfLocalDay(d).getTime();

export default function CleanerMonthCalendar({
  tasks,
  statusConfig,
}: {
  tasks: CalendarTask[];
  statusConfig: Record<string, StatusStyle>;
}) {
  const todayKey = dayKey(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<number>(todayKey);

  // Tasks bucketed by local day, each day in due-time order.
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarTask[]>();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const k = dayKey(t.dueAt);
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
    return map;
  }, [tasks]);

  // 6 rows × 7 days starting on the Sunday on/before the 1st, so every month
  // fits and the grid height never jumps between months.
  const cells = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(todayKey);
  };

  const monthCount = cells.reduce(
    (n, d) => n + (d.getMonth() === month.getMonth() ? byDay.get(dayKey(d))?.length ?? 0 : 0),
    0,
  );
  const selectedTasks = byDay.get(selected) ?? [];
  const selectedDate = new Date(selected);

  const navBtn: React.CSSProperties = {
    width: 32, height: 32, display: "grid", placeItems: "center", border: `1px solid ${LINE}`,
    background: "#fff", color: GOLD_INK, cursor: "pointer",
  };

  return (
    <div className="border overflow-hidden" style={{ borderColor: LINE, background: "#fff" }}>
      {/* Header: month + navigation */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: LINE, backgroundColor: "#F7F0E3" }}>
        <div>
          <p className="font-bold text-sm" style={{ color: GOLD_INK }}>
            {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <p className="text-xs" style={{ color: MUTED }}>
            {monthCount === 0 ? "No cleanings this month" : `${monthCount} cleaning${monthCount === 1 ? "" : "s"} this month`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={goToday} className="text-xs font-semibold px-3 cursor-pointer"
            style={{ height: 32, border: `1px solid ${LINE}`, background: "#fff", color: GOLD_INK }}>
            Today
          </button>
          <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} style={navBtn}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} style={navBtn}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: LINE }}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-xs font-semibold py-2" style={{ color: MUTED }}>{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month.getMonth();
          const dayTasks = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          const isSelected = k === selected;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              aria-label={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}: ${dayTasks.length} cleaning${dayTasks.length === 1 ? "" : "s"}`}
              aria-pressed={isSelected}
              className={`flex flex-col items-center justify-start gap-1.5 cursor-pointer transition-colors ${isSelected ? "" : "hover:bg-[#FBF7EF]"}`}
              style={{
                height: 60, padding: "8px 4px",
                borderRight: (i + 1) % 7 ? `1px solid ${LINE}` : 0,
                borderBottom: i < 35 ? `1px solid ${LINE}` : 0,
                background: isSelected ? "#F7F0E3" : undefined,
                boxShadow: isSelected ? "inset 0 0 0 1.5px #D4BFA0" : undefined,
              }}
            >
              <span className="inline-flex items-center justify-center"
                style={{
                  width: 24, height: 24, borderRadius: 8,
                  fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, fontWeight: isToday ? 700 : 500,
                  background: isToday ? "#D4A96A" : "transparent",
                  color: isToday ? "#2C1F14" : inMonth ? "#1f1b16" : "#C9BBA6",
                }}>
                {d.getDate()}
              </span>
              {dayTasks.length > 0 && (
                <span className="flex items-center gap-0.5" style={{ opacity: inMonth ? 1 : 0.5 }}>
                  {dayTasks.slice(0, 3).map((t) => (
                    <span key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ background: (statusConfig[t.status] || statusConfig.pending).dot }} />
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] font-semibold leading-none ml-0.5" style={{ color: GOLD_INK }}>+{dayTasks.length - 3}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      {/* Same header + row treatment as a day in the Upcoming list. */}
      <div className="border-t" style={{ borderColor: LINE }}>
        <div className="px-5 py-3 border-b" style={{ backgroundColor: "#F7F0E3", borderColor: LINE }}>
          <p className="font-bold text-sm" style={{ color: GOLD_INK }}>
            {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            {selected === todayKey ? " (Today)" : ""}
          </p>
        </div>
        {selectedTasks.length === 0 ? (
          <p className="px-5 py-3.5 text-sm" style={{ color: MUTED }}>No cleanings on this day.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F7F0E3" }}>
            {selectedTasks.map((t) => {
              const st = statusConfig[t.status] || statusConfig.pending;
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#F7F0E3]">
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "#D4BFA0" }} />
                  <span className="text-sm flex-1 min-w-0" style={{ color: "#5a4a3a" }}>
                    {t.room} — {t.dueAt ? t.dueAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                    <span style={{ color: MUTED }}> · {t.floor}</span>
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-2.5 border-t text-xs" style={{ borderColor: LINE, color: MUTED, backgroundColor: "#FDFBF7" }}>
        {["pending", "in-progress", "awaiting-inspection", "ready"].map((k) => statusConfig[k] && (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: statusConfig[k].dot }} />{statusConfig[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
