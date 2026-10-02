"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  useGetCleaningTasksQuery,
  useGetCleaningHistoryQuery,
  useApproveInspectionMutation,
  useRejectInspectionMutation,
  useAssignCleanerMutation,
  useGetChecklistQuery,
  useGetChecklistPhotosQuery,
  useAddChecklistTaskMutation,
  useEditChecklistTaskMutation,
  useRemoveChecklistTaskMutation,
  useGetKnownCategoriesQuery,
  type CleaningTask,
} from "@/redux/api/cleanersApi";
import { useGetEmployeesQuery } from "@/redux/api/employeeApi";
import { useGetReportsQuery, useUpdateReportStatusMutation } from "@/redux/api/reportApi";
import ImageThumb from "@/components/ImageThumb";
import { cleaningDueAt } from "@/lib/cleaning-schedule";
import { MonthNavigator, currentMonthKey } from "@/components/admin/owners/MonthNavigator";
import { sameBookingRef } from "@/components/admin/NotificationBell";
import {
  Clock, Building2, User, AlertTriangle, CheckCircle2, ChevronRight,
  Timer, ClipboardList, UserPlus, X, Plus, Pencil, Trash2, Camera, Search, ChevronDown,
  Check, Bookmark,
} from "lucide-react";

// Shared body for the Cleaning Operations view — Owner/CSR monitoring over
// the same booking_cleaning data the cleaner portal reads and writes.
// Read-only except for inspection approve/reject (the only actions that can
// move a task to Ready or send it back) and manual cleaner assignment.
//
// Rendered from two places: as the standalone /admin/cleaning-operations
// page (its own sidebar/header wrap this), and inline as the Owner portal's
// "Cleaning Operations" nav tab. Both call this component so the monitoring
// logic and markup live in exactly one place.

type Cleaner = { id: string; first_name: string; last_name: string; status?: string | null };

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:               { label: "Needs Cleaning",      color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  assigned:              { label: "Assigned",            color: "#1e40af", bg: "#dbeafe", dot: "#3b82f6" },
  "in-progress":         { label: "In Progress",         color: "#8a6a2f", bg: "#F7F0E3", dot: "#B07848" },
  "awaiting-inspection": { label: "Awaiting Inspection", color: "#5b21b6", bg: "#ede9fe", dot: "#8b5cf6" },
  ready:                 { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  cleaned:               { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  inspected:             { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
};

// When the cleaning is due — the guest's checkout, via the same helper both
// cleaner portals use, so "overdue" here and "can start" there always agree.
function checkoutMoment(task: CleaningTask): Date | null {
  return cleaningDueAt(task);
}

// ── Status / assignment filters ──────────────────────────────────────────────
// Both are the same multi-select panel as the Bookings status filter.
type CleaningStatusKey = "pending" | "assigned" | "in-progress" | "awaiting-inspection" | "ready";
type AssignKey = "automatic" | "manual" | "unassigned";

type FilterItem<K extends string> = { key: K; label: string; dot: string };
/** `wide` groups span the full panel width, on a row of their own. */
type FilterGroup<K extends string> = { title: string; items: FilterItem<K>[]; wide?: boolean };

const statusItem = (key: CleaningStatusKey): FilterItem<CleaningStatusKey> => ({
  key, label: STATUS_LABELS[key].label, dot: STATUS_LABELS[key].dot,
});

// Grouped like the Bookings status panel.
const STATUS_FILTER_GROUPS: FilterGroup<CleaningStatusKey>[] = [
  { title: "To clean", items: [statusItem("pending"), statusItem("assigned"), statusItem("in-progress")] },
  { title: "After cleaning", items: [statusItem("awaiting-inspection"), statusItem("ready")] },
];

// Colours match the Automatic / Manual badges in the Cleaner column.
const ASSIGN_FILTER_GROUPS: FilterGroup<AssignKey>[] = [
  {
    title: "Assignment",
    wide: true,
    items: [
      { key: "automatic", label: "Automatic", dot: "#3b82f6" },
      { key: "manual", label: "Manual", dot: "#f59e0b" },
      { key: "unassigned", label: "Not assigned", dot: "#a8a29e" },
    ],
  },
];

const CLEANING_STATUS_KEYS = STATUS_FILTER_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const ASSIGN_KEYS = ASSIGN_FILTER_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const STATUS_FILTER_STORAGE = "dlux-cleaning-status-filter";
const ASSIGN_FILTER_STORAGE = "dlux-cleaning-assignment-filter";

/** Legacy 'cleaned' / 'inspected' rows count as Ready, same as the status pill. */
function statusGroup(status: string): CleaningStatusKey {
  return status === "cleaned" || status === "inspected" ? "ready" : (status as CleaningStatusKey);
}

/** How the task got its cleaner: automatic rotation, by hand, or not yet. */
function assignmentKind(task: CleaningTask): AssignKey {
  if (!task.assigned_cleaner_id) return "unassigned";
  return task.assignment_method === "automatic" ? "automatic" : "manual";
}

/**
 * A multi-select filter remembered in this browser, like the Bookings status
 * filter. Restored after mount, not in useState's initialiser: reading
 * localStorage during the first render would make server and client markup
 * disagree (hydration mismatch). Unknown keys from an older version are dropped
 * so a stale filter can never silently hide everything.
 */
function useRememberedFilter<K extends string>(storageKey: string, validKeys: readonly K[]) {
  const [value, setValue] = useState<K[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) {
        const valid = saved.filter((k): k is K => validKeys.includes(k));
        if (valid.length) setValue(valid);
      }
    } catch { /* storage blocked — start unfiltered */ }
    // validKeys is a module constant; storageKey never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apply = (next: K[]) => {
    setValue(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return [value, apply] as const;
}

/**
 * The filter button and panel, built to match the Bookings table's Status
 * filter: grouped checkboxes with a colour dot and count, Select all / Clear,
 * and a summary footer. Rendered through a portal so no clipping ancestor can
 * cut it off, positioned under (or, near the bottom of the window, above) the
 * button.
 */
function MultiFilterButton<K extends string>({ label, title, groups, value, onChange, counts, resultCount }: {
  label: string;
  title: string;
  groups: FilterGroup<K>[];
  value: K[];
  onChange: (next: K[]) => void;
  counts: Record<string, number>;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setRect(r);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const width = groups.length > 1 ? 460 : 300;
  const PANEL_H = 300;
  const up = !!rect && window.innerHeight - rect.bottom < PANEL_H && rect.top > window.innerHeight - rect.bottom;
  const toggle = (key: K) => onChange(value.includes(key) ? value.filter((s) => s !== key) : [...value, key]);

  return (
    <div style={{ position: "relative" }}>
      <button type="button" ref={btnRef} onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium cursor-pointer"
        style={{ backgroundColor: "#F7F0E3", color: "#5a4a3a", border: "1px solid #D4BFA0" }}>
        {label}
        {value.length > 0 && (
          <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, padding: "1px 6px", background: "#1f1b16", color: "#faf7f1" }}>{value.length}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
          <div role="dialog" aria-label={title} style={{
            position: "fixed",
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 16 - Math.min(width, window.innerWidth - 32))),
            ...(up ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
            zIndex: 70, width, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", overflowY: "auto",
            background: "#ffffff", border: "1px solid #e4dac5", boxShadow: "0 24px 56px -18px rgba(40,30,18,.34)", borderRadius: 6,
          }}>
            <div style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #F2EADA", background: "#FCFAF5" }}>
              <span style={{ whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 600, color: "#8B6344", textTransform: "uppercase", letterSpacing: ".06em" }}>{title}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => onChange(allKeys)} style={{ fontFamily: "inherit", fontSize: 12.5, color: "#5a4a3a", background: "transparent", border: 0, cursor: "pointer" }}>Select all</button>
                <span style={{ width: 1, height: 12, background: "#e4dac5" }} />
                <button type="button" onClick={() => onChange([])} style={{ fontFamily: "inherit", fontSize: 12.5, color: "#B07848", background: "transparent", border: 0, cursor: "pointer" }}>Clear</button>
              </div>
            </div>
            {/* The 1px gaps over a sand background draw the dividers between groups. */}
            <div style={{ display: "grid", gridTemplateColumns: groups.length > 1 ? "1fr 1fr" : "1fr", gap: 1, background: "#F2EADA" }}>
              {groups.map((g) => (
                <div key={g.title} style={{ background: "#fff", padding: "14px 8px 14px 14px", gridColumn: g.wide ? "1 / -1" : undefined }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px 9px" }}>
                    <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em", color: "#a2957f", whiteSpace: "nowrap" }}>{g.title}</span>
                    <span style={{ flex: 1, height: 1, background: "#F2EADA" }} />
                  </div>
                  {/* A wide group lays its options out in a row instead of a column. */}
                  <div style={g.wide
                    ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 1 }
                    : { display: "flex", flexDirection: "column", gap: 1 }}>
                    {g.items.map((item) => {
                      const checked = value.includes(item.key);
                      return (
                        <label key={item.key} onClick={() => toggle(item.key)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 4, fontSize: 13.5, color: "#1f1b16", cursor: "pointer", background: checked ? "#FAF6EE" : "transparent" }}
                          onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "#FAF6EE"; }}
                          onMouseLeave={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <span style={{ width: 16, height: 16, flex: "none", borderRadius: 4, display: "grid", placeItems: "center", border: `1.5px solid ${checked ? "#1f1b16" : "#D4BFA0"}`, background: checked ? "#1f1b16" : "transparent" }}>
                            {checked && <Check className="w-[11px] h-[11px]" style={{ color: "#fff" }} />}
                          </span>
                          <span style={{ width: 7, height: 7, flex: "none", borderRadius: "50%", background: item.dot }} />
                          <span style={{ flex: 1, whiteSpace: "nowrap" }}>{item.label}</span>
                          <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11.5, color: "#a2957f" }}>{counts[item.key] ?? 0}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "11px 18px", borderTop: "1px solid #F2EADA", background: "#FCFAF5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "#8a8276" }}>
                {value.length ? `${value.length} selected · ${resultCount} tasks` : "Nothing selected — showing everything"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a2957f", whiteSpace: "nowrap" }}>
                <Bookmark className="w-3 h-3" /> Filter is remembered
              </span>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// Tasks table columns. Lower-priority ones hide on narrower screens so the
// table always fits without a sideways scroll; the task panel shows them all.
const TASK_COLUMNS: { h: string; cls: string }[] = [
  { h: "Room", cls: "" },
  { h: "Status", cls: "" },
  { h: "Cleaner", cls: "" },
  { h: "Checkout", cls: "hidden sm:table-cell" },
  { h: "Started", cls: "hidden xl:table-cell" },
  { h: "Elapsed", cls: "hidden lg:table-cell" },
  { h: "Issues", cls: "hidden md:table-cell" },
  { h: "", cls: "" },
];

/** 'YYYY-MM' of the task's checkout in Manila time (the property's clock), or null. */
function taskMonthKey(task: CleaningTask): string | null {
  const due = checkoutMoment(task);
  return due ? due.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7) : null;
}

/**
 * Why a task has no cleaner, in words an Owner/CSR can act on. A task created
 * at booking time is expected to be unassigned until the booking is confirmed;
 * after that, the stored reason from the rotation says what went wrong.
 */
function unassignedExplanation(task: CleaningTask): string | null {
  if (task.assigned_cleaner_id) return null;
  if (task.booking_status === "pending") return "Waiting for booking confirmation — assigned automatically when confirmed.";
  return task.unassigned_reason || "Not assigned yet — pick a cleaner.";
}

/** A confirmed booking whose cleaning nobody holds — needs a human. */
function needsAssignment(task: CleaningTask): boolean {
  return !task.assigned_cleaner_id && task.booking_status !== "pending" && task.cleaning_status !== "ready";
}

// Overdue: checkout has passed and cleaning hasn't even started yet.
function isOverdue(task: CleaningTask): boolean {
  if (!["pending", "assigned"].includes(task.cleaning_status)) return false;
  const co = checkoutMoment(task);
  return !!co && co.getTime() < Date.now();
}

function elapsedSince(iso: string | null): string {
  if (!iso) return "—";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// True if `query` (already trimmed/lowercased by the caller) appears in any
// of `fields`. Empty query always matches, so search boxes below default to
// showing everything until the admin types something.
function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
  if (!query) return true;
  return fields.some((f) => f?.toLowerCase().includes(query));
}

// Shared search input used at the top of each tab — same look everywhere,
// each tab owns its own query string and filters its own data with it.
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-4 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#D4BFA0" }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm outline-none pl-9 pr-3 py-2 border"
        style={{ borderColor: "#ece5d4", color: "#1a1a1a", backgroundColor: "#ffffff" }}
      />
    </div>
  );
}

export function CleaningOperationsSection({ initialTab = "tasks", focusBookingRef = null }: {
  /** Tab to open on — e.g. Reports & Issues when coming from an issue notification. */
  initialTab?: "tasks" | "checklist" | "reports" | "workload";
  /** Open this booking's cleaning task straight away (from a notification). */
  focusBookingRef?: string | null;
} = {}) {
  // Polled, so a new confirmation's assignment, a cleaner's hand-in and a
  // cancellation all show up without a refresh.
  const { data: tasksData, isFetching, isLoading: tasksLoading, isError: tasksFailed, refetch: refetchTasks } =
    useGetCleaningTasksQuery(undefined, { pollingInterval: 30000 });
  const tasks = tasksData ?? [];

  // Manual assignment — same /assign endpoint the automatic checkout trigger
  // uses, just picked by a human here instead of by least-loaded-cleaner
  // logic. Available any time before Ready, so admin can hand-assign an
  // unassigned task or reassign one mid-flow.
  const { data: cleanersRes, error: cleanersError } = useGetEmployeesQuery({ role: "Cleaner" });
  // Only active accounts can receive work — the assign endpoint refuses an
  // inactive one, so offering it would just produce an error.
  const cleaners: Cleaner[] = ((cleanersRes as { data?: Cleaner[] } | undefined)?.data ?? [])
    .filter((c) => (c.status ?? "active") === "active");
  const cleanersLoadFailed = !!cleanersError;

  // Top-level view — "Tasks" is the existing monitoring table + drawer;
  // "Cleaning Checklist" is a dedicated view for picking a task and
  // viewing/editing its checklist directly, without opening the drawer;
  // "Reports & Issues" lists every cleaner-submitted issue report across all
  // tasks in one place, instead of only inside one task's drawer.
  const [topTab, setTopTab] = useState<"tasks" | "checklist" | "reports" | "workload">(initialTab);

  const [filter, setFilter] = useState<"all" | "attention" | "awaiting-inspection">("all");
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A booking a notification pointed at: its task opens as soon as the task
  // list has loaded (it may still be loading on the first render).
  const [focusRef, setFocusRef] = useState<string | null>(focusBookingRef);
  const selectedTask =
    tasks.find((t) => t.cleaning_id === selectedId)
    ?? (focusRef ? tasks.find((t) => sameBookingRef(t.booking_id, focusRef)) ?? null : null);
  const closeTask = () => { setSelectedId(null); setFocusRef(null); };

  // The month the whole page shows ('YYYY-MM', by the guest's checkout in
  // Manila time); null = All time. One setting for every tab — the summary
  // cards, the task table, the checklist picker and the workload ranking all
  // show only the chosen month, and everything when it's All time.
  const [month, setMonth] = useState<string | null>(() => currentMonthKey());
  const monthsWithTasks = [...new Set(tasks.map(taskMonthKey).filter((k): k is string => !!k))];
  const monthTasks = month ? tasks.filter((t) => taskMonthKey(t) === month) : tasks;

  const overdueCount = monthTasks.filter(isOverdue).length;
  const issueCount = monthTasks.filter((t) => (t.open_issue_count ?? 0) > 0).length;
  const awaitingCount = monthTasks.filter((t) => t.cleaning_status === "awaiting-inspection").length;
  const unassignedCount = monthTasks.filter(needsAssignment).length;

  // Status and Assignment filters — the same multi-select panel as the
  // Bookings table, each remembered between visits. Empty = no filter.
  const [statusFilters, applyStatusFilters] = useRememberedFilter<CleaningStatusKey>(STATUS_FILTER_STORAGE, CLEANING_STATUS_KEYS);
  const [assignFilters, applyAssignFilters] = useRememberedFilter<AssignKey>(ASSIGN_FILTER_STORAGE, ASSIGN_KEYS);

  // Month, filter bar and search apply to everything; each panel's counts then
  // leave out that panel's own filter, so they say how many rows ticking it
  // would show.
  const normTaskQuery = taskQuery.trim().toLowerCase();
  const baseTasks = tasks.filter((t) => {
    if (month && taskMonthKey(t) !== month) return false;
    if (filter === "awaiting-inspection" && t.cleaning_status !== "awaiting-inspection") return false;
    if (filter === "attention" && !(isOverdue(t) || needsAssignment(t) || (t.open_issue_count ?? 0) > 0 || t.cleaning_status === "awaiting-inspection")) return false;
    return matchesQuery(normTaskQuery, [t.haven, t.booking_id, t.guest_first_name, t.guest_last_name, t.cleaner_first_name, t.cleaner_last_name]);
  });
  const statusOk = (t: CleaningTask) => !statusFilters.length || statusFilters.includes(statusGroup(t.cleaning_status));
  const assignOk = (t: CleaningTask) => !assignFilters.length || assignFilters.includes(assignmentKind(t));
  const countBy = (list: CleaningTask[], keyOf: (t: CleaningTask) => string) =>
    list.reduce<Record<string, number>>((acc, t) => {
      const k = keyOf(t);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const statusCounts = countBy(baseTasks.filter(assignOk), (t) => statusGroup(t.cleaning_status));
  const assignCounts = countBy(baseTasks.filter(statusOk), assignmentKind);
  const visibleTasks = baseTasks.filter((t) => statusOk(t) && assignOk(t));

  // Every active filter as a removable chip.
  const activeChips = [
    ...statusFilters.map((key) => ({
      id: `s-${key}`, label: STATUS_LABELS[key].label, dot: STATUS_LABELS[key].dot,
      remove: () => applyStatusFilters(statusFilters.filter((s) => s !== key)),
    })),
    ...assignFilters.map((key) => {
      const item = ASSIGN_FILTER_GROUPS[0].items.find((i) => i.key === key)!;
      return {
        id: `a-${key}`, label: item.label, dot: item.dot,
        remove: () => applyAssignFilters(assignFilters.filter((s) => s !== key)),
      };
    }),
  ];

  return (
    <div>
      {/* Top-level tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { id: "tasks", label: "Tasks" },
          { id: "checklist", label: "Cleaning Checklist" },
          { id: "reports", label: "Reports & Issues" },
          { id: "workload", label: "Cleaner Workload" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setTopTab(t.id)}
            className="px-4 py-2 text-sm font-medium border cursor-pointer transition-colors"
            style={{
              backgroundColor: topTab === t.id ? "#1f1b16" : "#ffffff",
              color: topTab === t.id ? "#ffffff" : "#6b6358",
              borderColor: topTab === t.id ? "#1f1b16" : "#ece5d4",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {topTab === "checklist" ? (
        <>
          <div className="mb-4">
            <MonthNavigator value={month} onChange={setMonth} monthsWithData={monthsWithTasks} />
          </div>
          <ChecklistTab key={month ?? "all"} tasks={monthTasks} isFetching={isFetching} />
        </>
      ) : topTab === "reports" ? (
        <ReportsIssuesTab />
      ) : topTab === "workload" ? (
        <CleanerWorkloadTab tasks={tasks} cleaners={cleaners} isLoading={tasksLoading}
          month={month} onMonthChange={setMonth} monthsWithTasks={monthsWithTasks} />
      ) : (
      <>
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Needs Assignment",    value: unassignedCount, icon: UserPlus,   iconBg: "#fef3c7", iconColor: "#d97706", onClick: () => setFilter("attention") },
          { label: "Overdue",             value: overdueCount, icon: AlertTriangle, iconBg: "#fee2e2", iconColor: "#dc2626", onClick: () => setFilter("attention") },
          { label: "Open Issues",         value: issueCount,   icon: AlertTriangle, iconBg: "#ffedd5", iconColor: "#ea580c", onClick: () => setFilter("attention") },
          { label: "Awaiting Inspection", value: awaitingCount,icon: ClipboardList, iconBg: "#ede9fe", iconColor: "#7c3aed", onClick: () => setFilter("awaiting-inspection") },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.label} onClick={card.onClick} className="border p-4 text-center cursor-pointer transition-colors" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: card.iconBg }}>
                <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: card.iconColor }} />
              </div>
              <p style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{card.value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{card.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        {([
          { id: "all", label: "All Tasks" },
          { id: "attention", label: "Needs Attention" },
          { id: "awaiting-inspection", label: "Awaiting Inspection" },
        ] as const).map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors"
            style={{
              backgroundColor: filter === f.id ? "#1f1b16" : "#ffffff",
              color: filter === f.id ? "#ffffff" : "#6b6358",
              borderColor: filter === f.id ? "#1f1b16" : "#ece5d4",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Search + month, side by side */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[14rem] max-w-sm [&>div]:mb-0">
          <SearchBox value={taskQuery} onChange={setTaskQuery} placeholder="Search room, booking, guest, or cleaner…" />
        </div>
        <MonthNavigator value={month} onChange={setMonth} monthsWithData={monthsWithTasks} />
        {/* One Status button: the statuses plus an Assignment group in the same panel. */}
        <MultiFilterButton<CleaningStatusKey | AssignKey>
          label="Status" title="Filter by status"
          groups={[...STATUS_FILTER_GROUPS, ...ASSIGN_FILTER_GROUPS]}
          value={[...statusFilters, ...assignFilters]}
          onChange={(next) => {
            applyStatusFilters(next.filter((k): k is CleaningStatusKey => (CLEANING_STATUS_KEYS as string[]).includes(k)));
            applyAssignFilters(next.filter((k): k is AssignKey => (ASSIGN_KEYS as string[]).includes(k)));
          }}
          counts={{ ...statusCounts, ...assignCounts }}
          resultCount={visibleTasks.length} />
      </div>

      {/* Active filters, restated outside the panels (as on Bookings) so a
          remembered filter never looks like "the tasks disappeared". */}
      {activeChips.length > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, border: "1px solid #F2EADA", background: "#FCFAF5" }}>
          <span style={{ fontSize: 12, color: "#8a8276", marginRight: 2 }}>Showing</span>
          {activeChips.map((chip) => (
            <span key={chip.id} onClick={chip.remove}
              role="button" tabIndex={0} aria-label={`Remove ${chip.label} filter`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") chip.remove(); }}
              style={{ display: "inline-flex", flex: "none", whiteSpace: "nowrap", alignItems: "center", gap: 7, padding: "4px 8px 4px 9px", borderRadius: 999, fontSize: 12.5, color: "#4a4034", background: "#fff", border: "1px solid #e4dac5", cursor: "pointer" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: chip.dot }} />
              {chip.label}
              <X className="w-[11px] h-[11px]" style={{ color: "#a2957f" }} />
            </span>
          ))}
          <button type="button" onClick={() => { applyStatusFilters([]); applyAssignFilters([]); }}
            style={{ fontFamily: "inherit", fontSize: 12.5, color: "#B07848", background: "transparent", border: 0, cursor: "pointer", padding: "4px 2px" }}>Clear all</button>
        </div>
      )}

      {/* Table — fits its container, no sideways scroll. On narrower screens
          the lower-priority columns hide; the task panel still shows them. */}
      <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF7F1", borderBottom: "1px solid #ece5d4" }}>
              {TASK_COLUMNS.map(({ h, cls }) => (
                <th key={h} className={`text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider ${cls}`} style={{ color: "#8a6a2f" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasksLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#8B6344" }}>Loading cleaning tasks…</td></tr>
            ) : tasksFailed && !tasksData ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#dc2626" }}>
                Couldn&apos;t load cleaning tasks.{" "}
                <button type="button" onClick={() => refetchTasks()} className="underline cursor-pointer">Try again</button>
              </td></tr>
            ) : !isFetching && visibleTasks.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#8B6344" }}>No cleaning tasks match this filter.</td></tr>
            ) : null}
            {tasksFailed && tasksData && (
              <tr><td colSpan={8} className="px-4 py-2 text-xs" style={{ color: "#92400e", backgroundColor: "#fef3c7" }}>
                Couldn&apos;t refresh — showing the last update.{" "}
                <button type="button" onClick={() => refetchTasks()} className="underline cursor-pointer">Try again</button>
              </td></tr>
            )}
            {visibleTasks.map((t) => {
              const st = STATUS_LABELS[t.cleaning_status] || STATUS_LABELS.pending;
              const overdue = isOverdue(t);
              const cleanerName = t.cleaner_first_name ? `${t.cleaner_first_name} ${t.cleaner_last_name ?? ""}`.trim() : "Unassigned";
              return (
                <tr key={t.cleaning_id} className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid #F7F0E3" }}
                  onClick={() => setSelectedId(t.cleaning_id)}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#FAF7F1"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-1.5 font-medium break-words" style={{ color: "#1a1a1a" }}>
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#8a6a2f" }} /><span className="min-w-0">{t.haven}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{t.booking_id}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}>
                          <AlertTriangle className="w-3 h-3" />Overdue
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {t.cleaning_status === "ready" ? (
                      <div className="flex items-center gap-1.5" style={{ color: "#5a4a3a" }}>
                        <User className="w-3.5 h-3.5" style={{ color: "#8a6a2f" }} />{cleanerName}
                      </div>
                    ) : (
                      <AssignCleanerControl task={t} cleaners={cleaners} loadFailed={cleanersLoadFailed} />
                    )}
                    <MethodBadge task={t} />
                    {unassignedExplanation(t) && (
                      <p className="text-xs mt-1 max-w-[16rem]" style={{ color: needsAssignment(t) ? "#b45309" : "#8B6344" }}>
                        {unassignedExplanation(t)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell" style={{ color: "#5a4a3a" }}>
                    {(() => {
                      const due = checkoutMoment(t);
                      return due ? due.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
                    })()}
                  </td>
                  <td className="px-3 py-3 hidden xl:table-cell" style={{ color: "#5a4a3a" }}>{fmtDateTime(t.cleaning_time_in)}</td>
                  <td className="px-3 py-3 hidden lg:table-cell" style={{ color: "#5a4a3a" }}>
                    {t.cleaning_status === "in-progress" ? (
                      <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" style={{ color: "#B07848" }} />{elapsedSince(t.cleaning_time_in)}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    {(t.open_issue_count ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#ffedd5", color: "#ea580c" }}>
                        <AlertTriangle className="w-3 h-3" />{t.open_issue_count}
                      </span>
                    ) : <span style={{ color: "#D4BFA0" }}>—</span>}
                  </td>
                  <td className="px-3 py-3"><ChevronRight className="w-4 h-4" style={{ color: "#D4BFA0" }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <TaskDetailDrawer task={selectedTask} cleaners={cleaners} cleanersLoadFailed={cleanersLoadFailed} onClose={closeTask} />
      )}
      </>
      )}
    </div>
  );
}

function TaskDetailDrawer({ task, cleaners, cleanersLoadFailed, onClose }: { task: CleaningTask; cleaners: Cleaner[]; cleanersLoadFailed: boolean; onClose: () => void }) {
  const { data: history } = useGetCleaningHistoryQuery(task.cleaning_id);
  const [approve, { isLoading: approving }] = useApproveInspectionMutation();
  const [reject, { isLoading: rejecting }] = useRejectInspectionMutation();
  const [note, setNote] = useState("");
  const st = STATUS_LABELS[task.cleaning_status] || STATUS_LABELS.pending;
  const cleanerName = task.cleaner_first_name ? `${task.cleaner_first_name} ${task.cleaner_last_name ?? ""}`.trim() : "Unassigned";

  const handleApprove = async () => {
    try { await approve(task.cleaning_id).unwrap(); toast.success("Inspection approved — room is Ready"); onClose(); }
    catch (err) { toast.error((err as { data?: { error?: string } })?.data?.error || "Could not approve inspection"); }
  };
  const handleReject = async () => {
    if (!note.trim()) { toast.error("Add a note explaining what needs to be fixed"); return; }
    try { await reject({ taskId: task.cleaning_id, note: note.trim() }).unwrap(); toast.success("Sent back to In Progress"); onClose(); }
    catch (err) { toast.error((err as { data?: { error?: string } })?.data?.error || "Could not send back"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto p-6" style={{ backgroundColor: "#ffffff", borderLeft: "1px solid #ece5d4" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>{task.haven}</h2>
            <p className="text-xs mt-1" style={{ color: "#8B6344" }}>{task.booking_id}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer" style={{ color: "#8B6344" }}><X className="w-5 h-5" /></button>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-4" style={{ backgroundColor: st.bg, color: st.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
        </span>

        <div className="space-y-2 text-sm mb-6" style={{ color: "#5a4a3a" }}>
          <div className="flex justify-between items-center">
            <span style={{ color: "#8B6344" }}>Cleaner</span>
            {task.cleaning_status === "ready" ? <span>{cleanerName}</span> : <AssignCleanerControl task={task} cleaners={cleaners} loadFailed={cleanersLoadFailed} />}
          </div>
          {task.assignment_method && (
            <div className="flex justify-between items-center">
              <span style={{ color: "#8B6344" }}>Assignment</span>
              <div className="flex items-center gap-2">
                <MethodBadge task={task} />
                {task.assignment_method === "manual" && task.assigned_by_first_name && (
                  <span className="text-xs" style={{ color: "#8B6344" }}>
                    by {task.assigned_by_first_name} {task.assigned_by_last_name}
                  </span>
                )}
              </div>
            </div>
          )}
          {task.assignment_method === "manual" && task.assigned_at && (
            <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Assigned at</span><span>{fmtDateTime(task.assigned_at)}</span></div>
          )}
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Guest</span><span>{`${task.guest_first_name ?? ""} ${task.guest_last_name ?? ""}`.trim() || "—"}</span></div>
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Cleaning due (checkout)</span><span>{fmtDateTime(checkoutMoment(task)?.toISOString() ?? null)}</span></div>
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Started</span><span>{fmtDateTime(task.cleaning_time_in)}</span></div>
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Completed</span><span>{fmtDateTime(task.cleaning_time_out)}</span></div>
        </div>

        {unassignedExplanation(task) && (
          <div className="rounded-xl p-3 mb-4 border" style={{ backgroundColor: "#fef3c7", borderColor: "#f5d9a8" }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "#92400e" }}>
              {needsAssignment(task) ? "Needs manual assignment" : "Not assigned yet"}
            </p>
            <p className="text-xs" style={{ color: "#92400e" }}>{unassignedExplanation(task)}</p>
          </div>
        )}

        {task.inspection_note && (
          <div className="rounded-xl p-3 mb-4 border" style={{ backgroundColor: "#ede9fe", borderColor: "#c4b5fd" }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "#5b21b6" }}>Last inspection note</p>
            <p className="text-xs" style={{ color: "#5b21b6" }}>{task.inspection_note}</p>
          </div>
        )}

        {task.cleaning_status === "awaiting-inspection" && (
          <div className="border p-4 mb-6" style={{ borderColor: "#ece5d4" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "#1f1b16" }}>Inspection</p>
            <button onClick={handleApprove} disabled={approving || rejecting}
              className="w-full py-2.5 mb-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: "#059669" }}>
              <CheckCircle2 className="w-4 h-4 inline mr-1.5" />Approve — Mark Ready
            </button>
            <textarea rows={2} placeholder="What needs to be fixed…" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none mb-2" style={{ borderColor: "#ece5d4" }} />
            <button onClick={handleReject} disabled={approving || rejecting}
              className="w-full py-2.5 text-sm font-semibold border cursor-pointer disabled:opacity-60"
              style={{ color: "#dc2626", borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
              Send Back to In Progress
            </button>
          </div>
        )}

        {task.haven_id && task.booking_uuid && (
          <ChecklistSection havenId={task.haven_id} bookingUuid={task.booking_uuid} />
        )}

        <IssueReportsSection cleaningTaskId={task.cleaning_id} />

        <p className="text-sm font-semibold mb-2" style={{ color: "#1f1b16" }}>Status History</p>
        <div className="space-y-3">
          {(history ?? []).length === 0 && <p className="text-xs" style={{ color: "#D4BFA0" }}>No history yet.</p>}
          {(history ?? []).map((h) => (
            <div key={h.id} className="flex gap-3 text-xs">
              <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#D4BFA0" }} />
              <div>
                <p style={{ color: "#1a1a1a" }}>
                  {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                  {h.changed_by_first_name && <span style={{ color: "#8B6344" }}> by {h.changed_by_first_name} {h.changed_by_last_name}</span>}
                </p>
                {h.note && <p style={{ color: "#5b21b6" }}>{h.note}</p>}
                <p style={{ color: "#D4BFA0" }}>{fmtDateTime(h.changed_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Small "Automatic" / "Manual" pill next to the cleaner. Reads
// task.assignment_method directly — round-robin (processCheckoutCleaning)
// writes 'automatic', the /assign route (used here and by the dropdown
// below) writes 'manual', so this always reflects who actually made the
// current assignment, not just who's currently in the seat.
function MethodBadge({ task }: { task: CleaningTask }) {
  if (!task.assignment_method) return null;
  const isAuto = task.assignment_method === "automatic";
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1"
      style={{ backgroundColor: isAuto ? "#dbeafe" : "#fef3c7", color: isAuto ? "#1e40af" : "#92400e" }}
    >
      {isAuto ? "Automatic" : "Manual"}
    </span>
  );
}

// Manual assign/reassign — a dropdown that calls the same /assign endpoint
// the automatic checkout trigger uses. Shown anywhere except 'ready', so
// admin can hand-assign an unassigned (pending) task or swap the cleaner on
// one already in progress. The server still runs its own time-conflict check
// and rejects the pick with a 409 if the chosen cleaner is double-booked.
function AssignCleanerControl({ task, cleaners, loadFailed }: { task: CleaningTask; cleaners: Cleaner[]; loadFailed: boolean }) {
  const [assign, { isLoading }] = useAssignCleanerMutation();
  const currentId = task.assigned_cleaner_id ?? "";

  const handleChange = async (cleanerId: string) => {
    if (!cleanerId || cleanerId === currentId) return;
    try {
      await assign({ taskId: task.cleaning_id, cleanerId }).unwrap();
      toast.success("Cleaner assigned");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not assign cleaner");
    }
  };

  if (loadFailed) {
    return <span className="text-xs" style={{ color: "#dc2626" }}>Could not load cleaner list</span>;
  }
  if (cleaners.length === 0) {
    return <span className="text-xs" style={{ color: "#8B6344" }}>No Cleaner accounts found</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <UserPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8a6a2f" }} />
      <select
        aria-label="Assign cleaner"
        value={currentId}
        disabled={isLoading}
        onChange={(e) => handleChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="text-sm outline-none cursor-pointer disabled:opacity-50"
        style={{ color: "#5a4a3a", background: "transparent", border: "1px solid #ece5d4", borderRadius: 6, padding: "3px 6px" }}
      >
        <option value="">Unassigned</option>
        {cleaners.map((c) => (
          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
        ))}
      </select>
    </div>
  );
}

// Dedicated "Cleaning Checklist" tab — pick a task from a compact list, see
// and edit its checklist directly (same ChecklistSection the task drawer
// uses), without opening the drawer. Tasks that are Ready have nothing left
// to check off, so they're left out of the picker.
function ChecklistTab({ tasks, isFetching }: { tasks: CleaningTask[]; isFetching: boolean }) {
  const relevant = tasks.filter((t) => t.cleaning_status !== "ready");
  const [query, setQuery] = useState("");
  const normQuery = query.trim().toLowerCase();
  const filtered = relevant.filter((t) =>
    matchesQuery(normQuery, [t.haven, t.booking_id, t.guest_first_name, t.guest_last_name, t.cleaner_first_name, t.cleaner_last_name])
  );
  const [pickedId, setPickedId] = useState<string | null>(relevant[0]?.cleaning_id ?? null);
  const picked = filtered.find((t) => t.cleaning_id === pickedId) ?? filtered[0] ?? null;

  if (!isFetching && relevant.length === 0) {
    return <p className="text-sm" style={{ color: "#8B6344" }}>No active cleaning tasks to check.</p>;
  }

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search room, booking, guest, or cleaner…" />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Task picker */}
      <div className="border overflow-hidden self-start" style={{ borderColor: "#ece5d4" }}>
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-xs" style={{ color: "#8B6344" }}>No tasks match your search.</p>
        )}
        {filtered.map((t, i) => {
          const st = STATUS_LABELS[t.cleaning_status] || STATUS_LABELS.pending;
          const isActive = picked?.cleaning_id === t.cleaning_id;
          return (
            <button key={t.cleaning_id} onClick={() => setPickedId(t.cleaning_id)}
              className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors"
              style={{
                borderTop: i > 0 ? "1px solid #F7F0E3" : "none",
                backgroundColor: isActive ? "#FAF7F1" : "transparent",
              }}>
              <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#1a1a1a" }}>
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8a6a2f" }} />
                <span className="truncate">{t.haven}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />
                <span className="text-xs" style={{ color: "#8B6344" }}>{st.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected task's checklist */}
      <div>
        {picked ? (
          <>
            <div className="mb-3">
              <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>{picked.haven}</p>
              <p className="text-xs" style={{ color: "#8B6344" }}>{picked.booking_id}</p>
            </div>
            {picked.haven_id && picked.booking_uuid ? (
              <ChecklistSection havenId={picked.haven_id} bookingUuid={picked.booking_uuid} />
            ) : (
              <p className="text-xs" style={{ color: "#8B6344" }}>This task is missing haven/booking data needed to load its checklist.</p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "#8B6344" }}>Select a task to view its checklist.</p>
        )}
      </div>
      </div>
    </div>
  );
}

// Checklist for this specific assignment — what the cleaner sees and works
// through in My Assignments, plus the proof photos they attach per category.
// Admin can add/edit/remove individual tasks here (per-assignment
// customization, e.g. "deep clean the oven" for just this booking) without
// touching the template every other room's checklist is built from.
// Sentinel value for the "Add Category" dropdown's custom-name option — kept
// out of band from any real category name (which are free text and could in
// principle collide with a short string like "other").
const CUSTOM_CATEGORY = "__custom__";

function ChecklistSection({ havenId, bookingUuid }: { havenId: string; bookingUuid: string }) {
  const { data: checklist, isFetching } = useGetChecklistQuery({ havenId, bookingId: bookingUuid });
  const { data: photos } = useGetChecklistPhotosQuery(checklist?.id ?? "", { skip: !checklist?.id });
  const [addTask, { isLoading: adding }] = useAddChecklistTaskMutation();
  const [editTask] = useEditChecklistTaskMutation();
  const [removeTask] = useRemoveChecklistTaskMutation();
  // Every category name already in use anywhere (the 5 template ones plus
  // any custom category some other checklist already created) — the "Add
  // Category" picker below offers these instead of a blank text box, so
  // admin doesn't fragment "Bedroom" vs "bedroom" across rooms.
  const { data: knownCategories } = useGetKnownCategoriesQuery();

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // Creating a brand-new category (title), e.g. "Bedroom", "Bathroom" — not
  // adding a task under one that already exists. A category only exists at
  // all because a task carries it, so "add a category" is really "add its
  // first task under a category name that doesn't exist yet."
  const [addingCategory, setAddingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(CUSTOM_CATEGORY);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryTask, setNewCategoryTask] = useState("");
  const usedCategoryNames = new Set((checklist?.categories ?? []).map((c) => c.category));
  // Only offer categories this checklist doesn't already have — no point
  // suggesting "Bedroom" if it's already one of the sections above.
  const availableCategories = (knownCategories ?? []).filter((c) => !usedCategoryNames.has(c));

  const submitAdd = async (category: string) => {
    if (!checklist?.id || !newTaskText.trim()) return;
    try {
      await addTask({ checklistId: checklist.id, category, taskDescription: newTaskText.trim() }).unwrap();
      setNewTaskText("");
      setAddingFor(null);
      toast.success("Task added");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not add task");
    }
  };

  const submitNewCategory = async () => {
    const category = selectedCategory === CUSTOM_CATEGORY ? newCategoryName.trim() : selectedCategory;
    if (!checklist?.id || !category || !newCategoryTask.trim()) return;
    try {
      await addTask({ checklistId: checklist.id, category, taskDescription: newCategoryTask.trim() }).unwrap();
      setNewCategoryName("");
      setNewCategoryTask("");
      setSelectedCategory(CUSTOM_CATEGORY);
      setAddingCategory(false);
      toast.success("Category added");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not add category");
    }
  };

  const submitEdit = async (taskId: string) => {
    if (!editText.trim()) return;
    try {
      await editTask({ taskId, taskDescription: editText.trim() }).unwrap();
      setEditingId(null);
      toast.success("Task updated");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not update task");
    }
  };

  const handleRemove = async (taskId: string) => {
    try {
      await removeTask({ taskId }).unwrap();
      toast.success("Task removed");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Could not remove task");
    }
  };

  if (isFetching) {
    return <p className="text-xs mb-4" style={{ color: "#8B6344" }}>Loading checklist…</p>;
  }
  if (!checklist) {
    return null;
  }

  const total = checklist.categories.reduce((n, c) => n + c.tasks.length, 0);
  const done = checklist.categories.reduce((n, c) => n + c.tasks.filter((t) => t.completed).length, 0);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 gap-3">
        <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>Cleaning Checklist</p>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "#8B6344" }}>{done} / {total} done</span>
          <button onClick={() => {
            setAddingCategory((v) => !v);
            setSelectedCategory(availableCategories[0] ?? CUSTOM_CATEGORY);
            setNewCategoryName("");
            setNewCategoryTask("");
          }}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer"
            style={{ color: "#8a6a2f", backgroundColor: "#FAF7F1" }}>
            <Plus className="w-3.5 h-3.5" />Add Category
          </button>
        </div>
      </div>

      {addingCategory && (
        <div className="border p-3 space-y-2 mb-3" style={{ borderColor: "#D4BFA0", backgroundColor: "#FAF7F1" }}>
          <select
            aria-label="Category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full text-sm outline-none border-b py-1 cursor-pointer"
            style={{ borderColor: "#D4BFA0", color: "#1a1a1a", backgroundColor: "transparent" }}
          >
            {availableCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={CUSTOM_CATEGORY}>+ New category…</option>
          </select>
          {selectedCategory === CUSTOM_CATEGORY && (
            <input autoFocus placeholder="Category name (e.g. Rooftop, Garage)…" value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full text-sm outline-none border-b py-1" style={{ borderColor: "#D4BFA0", color: "#1a1a1a", backgroundColor: "transparent" }} />
          )}
          <input placeholder="First task in this category…" value={newCategoryTask}
            onChange={(e) => setNewCategoryTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNewCategory(); if (e.key === "Escape") setAddingCategory(false); }}
            className="w-full text-sm outline-none border-b py-1" style={{ borderColor: "#D4BFA0", color: "#1a1a1a", backgroundColor: "transparent" }} />
          <div className="flex items-center gap-3">
            <button onClick={submitNewCategory} disabled={adding} className="text-xs font-medium cursor-pointer disabled:opacity-50" style={{ color: "#059669" }}>Add Category</button>
            <button onClick={() => setAddingCategory(false)} className="text-xs cursor-pointer" style={{ color: "#8B6344" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="border" style={{ borderColor: "#ece5d4" }}>
        {checklist.categories.length === 0 && (
          <p className="px-3 py-4 text-xs" style={{ color: "#8B6344" }}>No categories yet — add one above (e.g. Bedroom, Bathroom, Kitchen).</p>
        )}
        {checklist.categories.map((cat, ci) => (
          <div key={cat.category} style={{ borderTop: ci > 0 ? "1px solid #ece5d4" : "none" }}>
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: "#FAF7F1", color: "#8a6a2f" }}>
              {cat.category}
            </div>
            {cat.tasks.map((item) => {
              // Keyed by the task's id (photos are linked to the exact task they
              // prove), falling back to the url the checklist itself carries.
              const photo = item.photo_url || photos?.[item.id]?.url || null;
              return (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderTop: "1px solid #F7F0E3" }}>
                  {item.completed
                    ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#059669" }} />
                    : <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full border" style={{ borderColor: "#D4BFA0" }} />}
                  {editingId === item.id ? (
                    <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitEdit(item.id); if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 min-w-0 text-sm outline-none border-b" style={{ borderColor: "#D4BFA0", color: "#1a1a1a" }} />
                  ) : (
                    <span className="flex-1 min-w-0" style={{ color: item.completed ? "#A89080" : "#5a4a3a", textDecoration: item.completed ? "line-through" : "none" }}>
                      {item.task}
                    </span>
                  )}
                  {photo
                    ? <ImageThumb src={photo} alt={item.task} size={28} />
                    : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>No photo</span>}
                  {editingId === item.id ? (
                    <button onClick={() => submitEdit(item.id)} className="text-xs font-medium cursor-pointer flex-shrink-0" style={{ color: "#059669" }}>Save</button>
                  ) : (
                    <>
                      <button title="Edit task" onClick={() => { setEditingId(item.id); setEditText(item.task); }}
                        className="flex-shrink-0 cursor-pointer" style={{ color: "#8B6344" }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button title="Remove task" onClick={() => handleRemove(item.id)}
                        className="flex-shrink-0 cursor-pointer" style={{ color: "#dc2626" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {addingFor === cat.category ? (
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #F7F0E3" }}>
                <input autoFocus placeholder="New task…" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitAdd(cat.category); if (e.key === "Escape") setAddingFor(null); }}
                  className="flex-1 min-w-0 text-sm outline-none border-b" style={{ borderColor: "#D4BFA0", color: "#1a1a1a" }} />
                <button onClick={() => submitAdd(cat.category)} disabled={adding} className="text-xs font-medium cursor-pointer disabled:opacity-50" style={{ color: "#059669" }}>Add</button>
                <button onClick={() => setAddingFor(null)} className="text-xs cursor-pointer" style={{ color: "#8B6344" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => { setAddingFor(cat.category); setNewTaskText(""); }}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer" style={{ borderTop: "1px solid #F7F0E3", color: "#8a6a2f" }}>
                <Plus className="w-3.5 h-3.5" />Add task to {cat.category}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Cleaner-submitted issue reports (with photos) linked to this specific
// assignment via report_issue.booking_cleaning_id — the maintenance/damage
// reports filed from My Assignments -> Report Issue.
function IssueReportsSection({ cleaningTaskId }: { cleaningTaskId: string }) {
  const { data: reportsRes, isFetching } = useGetReportsQuery({ booking_cleaning_id: cleaningTaskId });
  const reports = (reportsRes as { data?: ReportRow[] } | undefined)?.data ?? [];

  if (isFetching) return <p className="text-xs mb-4" style={{ color: "#8B6344" }}>Loading issue reports…</p>;
  if (reports.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-sm font-semibold mb-2" style={{ color: "#1f1b16" }}>
        Issue Reports <span className="font-normal" style={{ color: "#8B6344" }}>({reports.length})</span>
      </p>
      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r.report_id} className="border p-3" style={{ borderColor: "#ece5d4" }}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ea580c" }} />
                <span className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>{r.issue_type}</span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#ffedd5", color: "#ea580c" }}>{r.priority_level}</span>
              </div>
              <span className="text-xs" style={{ color: "#D4BFA0" }}>{fmtDateTime(r.created_at)}</span>
            </div>
            {r.specific_location && <p className="text-xs mb-1" style={{ color: "#8B6344" }}>{r.specific_location}</p>}
            <p className="text-xs mb-2" style={{ color: "#5a4a3a" }}>{r.issue_description}</p>
            {r.images?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Camera className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8a6a2f" }} />
                {r.images.map((img, i) => (
                  <ImageThumb key={i} src={img.image_url} alt={`${r.issue_type} photo ${i + 1}`} size={40} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type ReportRow = {
  report_id: string;
  issue_type: string;
  priority_level: string;
  specific_location: string;
  issue_description: string;
  status: string;
  created_at: string;
  haven_name?: string | null;
  linked_booking_id?: string | null;
  booking_cleaning_id?: string | null;
  reporter_first_name?: string | null;
  reporter_last_name?: string | null;
  images: { image_url: string }[];
};

const REPORT_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  Open:          { color: "#dc2626", bg: "#fee2e2" },
  Pending:       { color: "#92400e", bg: "#fef3c7" },
  "In Progress": { color: "#8a6a2f", bg: "#F7F0E3" },
  Resolved:      { color: "#065f46", bg: "#d1fae5" },
  Closed:        { color: "#6b6358", bg: "#ece5d4" },
};
const REPORT_STATUSES = ["Open", "Pending", "In Progress", "Resolved", "Closed"];

// All issue reports across every cleaning task, in one place — the
// per-task IssueReportsSection above only shows a single task's reports;
// this is the "everything, with status control" view.
// "Cleaner Workload" — who received the most rooms to clean, for a month (by
// the guest's checkout) or all time. Built from the same task list the Tasks
// tab shows, so the numbers always agree with it. Every active cleaner is
// listed, including anyone with nothing yet, so an uneven split is visible.
function CleanerWorkloadTab({ tasks, cleaners, isLoading, month, onMonthChange, monthsWithTasks }: {
  tasks: CleaningTask[];
  cleaners: Cleaner[];
  isLoading: boolean;
  /** The page-wide month (shared with the other tabs); null = All time. */
  month: string | null;
  onMonthChange: (month: string | null) => void;
  monthsWithTasks: string[];
}) {
  const setMonth = onMonthChange;
  const inPeriod = tasks.filter((t) => !month || taskMonthKey(t) === month);

  type Row = {
    id: string; name: string; total: number; done: number; active: number; toDo: number;
    automatic: number; manual: number; inactive: boolean;
  };
  const rows = new Map<string, Row>();
  const blank = (id: string, name: string, inactive = false): Row =>
    ({ id, name, total: 0, done: 0, active: 0, toDo: 0, automatic: 0, manual: 0, inactive });
  for (const c of cleaners) rows.set(c.id, blank(c.id, `${c.first_name} ${c.last_name}`.trim()));

  let unassigned = 0;
  for (const t of inPeriod) {
    if (!t.assigned_cleaner_id) { unassigned++; continue; }
    const id = t.assigned_cleaner_id;
    // A cleaner who has since been deactivated still keeps the rooms they had.
    const row = rows.get(id) ?? blank(id, `${t.cleaner_first_name ?? ""} ${t.cleaner_last_name ?? ""}`.trim() || "Former cleaner", true);
    rows.set(id, row);
    row.total++;
    const s = statusGroup(t.cleaning_status);
    if (s === "awaiting-inspection" || s === "ready") row.done++;
    else if (s === "in-progress") row.active++;
    else row.toDo++;
    if (t.assignment_method === "automatic") row.automatic++; else row.manual++;
  }

  const ranked = [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  // The cleaner whose detail panel is open.
  const [selectedCleaner, setSelectedCleaner] = useState<string | null>(null);
  const selectedRow = ranked.find((r) => r.id === selectedCleaner) ?? null;
  const assignedTotal = ranked.reduce((n, r) => n + r.total, 0);
  const max = Math.max(1, ...ranked.map((r) => r.total));
  const top = ranked[0]?.total ? ranked[0] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MonthNavigator value={month} onChange={setMonth} monthsWithData={monthsWithTasks} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Rooms assigned", value: String(assignedTotal) },
          { label: "Not assigned yet", value: String(unassigned) },
          { label: "Cleaners", value: String(ranked.length) },
          { label: "Top cleaner", value: top ? top.name : "—", small: true },
        ].map((card) => (
          <div key={card.label} className="border p-4" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }}>
            <p className="truncate" style={{ fontFamily: card.small ? "inherit" : "'Geist Mono', ui-monospace, monospace", fontSize: card.small ? 16 : 24, fontWeight: card.small ? 600 : 500, lineHeight: 1.1, color: "#1f1b16" }}>{card.value}</p>
            <p className="text-xs mt-1" style={{ color: "#8B6344" }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Ranking — fits its container, no sideways scroll. On narrow screens
          the detail columns hide; the panel behind each row still has them. */}
      <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF7F1", borderBottom: "1px solid #ece5d4" }}>
              {[
                { h: "#", cls: "" },
                { h: "Cleaner", cls: "" },
                { h: "Rooms received", cls: "" },
                { h: "Done", cls: "hidden sm:table-cell" },
                { h: "Cleaning now", cls: "hidden md:table-cell" },
                { h: "To do", cls: "hidden md:table-cell" },
                { h: "Auto / Manual", cls: "hidden lg:table-cell" },
                { h: "", cls: "" },
              ].map(({ h, cls }) => (
                <th key={h} className={`text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider ${cls}`} style={{ color: "#8a6a2f" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#8B6344" }}>Loading…</td></tr>
            ) : ranked.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#8B6344" }}>No cleaner accounts yet.</td></tr>
            ) : ranked.map((r, i) => {
              const share = assignedTotal ? Math.round((r.total / assignedTotal) * 100) : 0;
              const leader = i === 0 && r.total > 0;
              return (
                <tr key={r.id} className="cursor-pointer transition-colors"
                  tabIndex={0} aria-label={`Open ${r.name}'s workload`}
                  onClick={() => setSelectedCleaner(r.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCleaner(r.id); } }}
                  style={{ borderBottom: "1px solid #F7F0E3", backgroundColor: leader ? "#FDF8F3" : "transparent" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#FAF7F1")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = leader ? "#FDF8F3" : "transparent")}>
                  <td className="px-3 py-3" style={{ color: leader ? "#B07848" : "#a2957f", fontFamily: "'Geist Mono', ui-monospace, monospace", fontWeight: leader ? 700 : 400 }}>{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium" style={{ color: "#1a1a1a" }}>
                      <User className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8a6a2f" }} />
                      <span className="break-words min-w-0">{r.name}</span>
                      {leader && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}>Top cleaner</span>}
                      {r.inactive && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#f3f0ea", color: "#8a8276" }}>Inactive</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 w-[40%]">
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 600, color: "#1f1b16", minWidth: 20 }}>{r.total}</span>
                      <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F2EADA", minWidth: 30 }} aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${(r.total / max) * 100}%`, backgroundColor: leader ? "#B07848" : "#d4a96a" }} />
                      </span>
                      <span className="text-xs" style={{ color: "#8a8276", minWidth: 32 }}>{share}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell" style={{ color: "#065f46" }}>{r.done}</td>
                  <td className="px-3 py-3 hidden md:table-cell" style={{ color: "#8a6a2f" }}>{r.active}</td>
                  <td className="px-3 py-3 hidden md:table-cell" style={{ color: "#1e40af" }}>{r.toDo}</td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap hidden lg:table-cell" style={{ color: "#6b6358" }}>
                    <span style={{ color: "#1e40af" }}>{r.automatic}</span> / <span style={{ color: "#92400e" }}>{r.manual}</span>
                  </td>
                  <td className="px-3 py-3"><ChevronRight className="w-4 h-4" style={{ color: "#D4BFA0" }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: "#8a8276" }}>
        Counted by the month of the guest&apos;s checkout. &quot;Done&quot; includes rooms waiting for inspection. Click a cleaner to see their rooms.
      </p>

      {selectedRow && (
        <CleanerWorkloadDrawer
          name={selectedRow.name}
          inactive={selectedRow.inactive}
          periodLabel={month ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "All time"}
          tasks={inPeriod.filter((t) => t.assigned_cleaner_id === selectedRow.id)}
          onClose={() => setSelectedCleaner(null)}
        />
      )}
    </div>
  );
}

/** Minutes a cleaning took, from start to hand-in; null if it hasn't finished. */
function cleaningMinutes(t: CleaningTask): number | null {
  const end = t.cleaning_time_out ?? t.cleaned_at;
  if (!t.cleaning_time_in || !end) return null;
  const mins = (new Date(end).getTime() - new Date(t.cleaning_time_in).getTime()) / 60000;
  return Number.isFinite(mins) && mins >= 0 ? Math.round(mins) : null;
}

const fmtMinutes = (mins: number) => (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);

// One cleaner's workload for the chosen period: the numbers, how long their
// cleanings take, and every room they were given.
function CleanerWorkloadDrawer({ name, inactive, periodLabel, tasks, onClose }: {
  name: string;
  inactive: boolean;
  periodLabel: string;
  tasks: CleaningTask[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = [...tasks].sort((a, b) => (checkoutMoment(a)?.getTime() ?? 0) - (checkoutMoment(b)?.getTime() ?? 0));
  const groups = { done: 0, active: 0, toDo: 0 };
  for (const t of tasks) {
    const s = statusGroup(t.cleaning_status);
    if (s === "awaiting-inspection" || s === "ready") groups.done++;
    else if (s === "in-progress") groups.active++;
    else groups.toDo++;
  }
  const durations = tasks.map(cleaningMinutes).filter((m): m is number => m != null);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;
  const openIssues = tasks.reduce((n, t) => n + (t.open_issue_count ?? 0), 0);
  const sentBack = tasks.filter((t) => !!t.inspection_note).length;
  const automatic = tasks.filter((t) => t.assignment_method === "automatic").length;

  const stat = (label: string, value: string, color = "#1f1b16") => (
    <div className="border p-3" style={{ borderColor: "#ece5d4" }}>
      <p style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 500, lineHeight: 1, color }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: "#8B6344" }}>{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-label={`${name} workload`} className="relative w-full max-w-lg h-full overflow-y-auto p-6"
        style={{ backgroundColor: "#ffffff", borderLeft: "1px solid #ece5d4" }}>
        <div className="flex items-start justify-between mb-5">
          <div className="min-w-0">
            <h2 className="truncate" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, lineHeight: 1.1, color: "#1f1b16" }}>{name}</h2>
            <p className="text-xs mt-1" style={{ color: "#8B6344" }}>
              Cleaner workload · {periodLabel}{inactive ? " · Inactive account" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer" style={{ color: "#8B6344" }}><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {stat("Rooms received", String(tasks.length))}
          {stat("Done", String(groups.done), "#065f46")}
          {stat("Cleaning now", String(groups.active), "#8a6a2f")}
          {stat("To do", String(groups.toDo), "#1e40af")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {stat("Avg. cleaning time", avg != null ? fmtMinutes(avg) : "—")}
          {stat("Fastest / slowest", fastest != null && slowest != null ? `${fmtMinutes(fastest)} / ${fmtMinutes(slowest)}` : "—")}
          {stat("Sent back to fix", String(sentBack), sentBack ? "#5b21b6" : "#1f1b16")}
          {stat("Open issues", String(openIssues), openIssues ? "#ea580c" : "#1f1b16")}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>Rooms ({tasks.length})</p>
          <p className="text-xs" style={{ color: "#8a8276" }}>{automatic} automatic · {tasks.length - automatic} manual</p>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm border p-4" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>
            No rooms for this cleaner in {periodLabel === "All time" ? "any period" : periodLabel}.
          </p>
        ) : (
          <div className="border divide-y" style={{ borderColor: "#ece5d4" }}>
            {sorted.map((t) => {
              const st = STATUS_LABELS[t.cleaning_status] || STATUS_LABELS.pending;
              const due = checkoutMoment(t);
              const mins = cleaningMinutes(t);
              return (
                <div key={t.cleaning_id} className="px-4 py-3" style={{ borderColor: "#F7F0E3" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#1a1a1a" }}>{t.haven}</p>
                      <p className="text-xs" style={{ color: "#8B6344" }}>{t.booking_id}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "#6b6358" }}>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" style={{ color: "#8a6a2f" }} />
                      Checkout {due ? due.toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                    </span>
                    {t.cleaning_time_in && <span>Started {fmtDateTime(t.cleaning_time_in)}</span>}
                    {mins != null && <span className="flex items-center gap-1"><Timer className="w-3 h-3" style={{ color: "#B07848" }} />Took {fmtMinutes(mins)}</span>}
                    <span style={{ color: t.assignment_method === "automatic" ? "#1e40af" : "#92400e" }}>
                      {t.assignment_method === "automatic" ? "Automatic" : "Manual"}
                    </span>
                    {(t.open_issue_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1" style={{ color: "#ea580c" }}><AlertTriangle className="w-3 h-3" />{t.open_issue_count} issue{t.open_issue_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  {t.inspection_note && (
                    <p className="text-xs mt-1.5" style={{ color: "#5b21b6" }}>Sent back: {t.inspection_note}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportsIssuesTab() {
  const { data: reportsRes, isFetching } = useGetReportsQuery(undefined);
  const reports = (reportsRes as { data?: ReportRow[] } | undefined)?.data ?? [];
  const [updateStatus] = useUpdateReportStatusMutation();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const normQuery = query.trim().toLowerCase();
  const visible = reports.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return matchesQuery(normQuery, [r.issue_type, r.haven_name, r.linked_booking_id, r.reporter_first_name, r.reporter_last_name, r.specific_location]);
  });
  const openCount = reports.filter((r) => r.status === "Open" || r.status === "Pending").length;

  const handleStatusChange = async (reportId: string, status: string) => {
    try {
      await updateStatus({ reportId, status }).unwrap();
      toast.success("Status updated");
    } catch {
      toast.error("Could not update status");
    }
  };

  if (isFetching) {
    return <p className="text-sm" style={{ color: "#8B6344" }}>Loading reports…</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setStatusFilter("all")}
          className="px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors"
          style={{ backgroundColor: statusFilter === "all" ? "#1f1b16" : "#ffffff", color: statusFilter === "all" ? "#ffffff" : "#6b6358", borderColor: statusFilter === "all" ? "#1f1b16" : "#ece5d4" }}>
          All ({reports.length})
        </button>
        {REPORT_STATUSES.map((s) => {
          const count = reports.filter((r) => r.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors"
              style={{ backgroundColor: statusFilter === s ? "#1f1b16" : "#ffffff", color: statusFilter === s ? "#ffffff" : "#6b6358", borderColor: statusFilter === s ? "#1f1b16" : "#ece5d4" }}>
              {s} ({count})
            </button>
          );
        })}
        {openCount > 0 && statusFilter === "all" && (
          <span className="text-xs" style={{ color: "#dc2626" }}>{openCount} need attention</span>
        )}
      </div>

      <SearchBox value={query} onChange={setQuery} placeholder="Search issue type, room, booking, or reporter…" />

      {visible.length === 0 ? (
        <p className="text-sm" style={{ color: "#8B6344" }}>No reports match this filter.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const st = REPORT_STATUS_STYLE[r.status] || REPORT_STATUS_STYLE.Open;
            const reporterName = r.reporter_first_name ? `${r.reporter_first_name} ${r.reporter_last_name ?? ""}`.trim() : "Unknown";
            return (
              <div key={r.report_id} className="border p-4" style={{ borderColor: "#ece5d4" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#ea580c" }} />
                      <span className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>{r.issue_type}</span>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#ffedd5", color: "#ea580c" }}>{r.priority_level}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "#8B6344" }}>
                      {r.haven_name && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{r.haven_name}</span>}
                      {r.linked_booking_id && <span>· {r.linked_booking_id}</span>}
                    </div>
                  </div>
                  <select
                    aria-label="Report status"
                    value={r.status}
                    onChange={(e) => handleStatusChange(r.report_id, e.target.value)}
                    className="text-xs font-semibold outline-none cursor-pointer flex-shrink-0"
                    style={{ backgroundColor: st.bg, color: st.color, border: "none", borderRadius: 999, padding: "4px 10px" }}
                  >
                    {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {r.specific_location && <p className="text-xs mb-1" style={{ color: "#8B6344" }}>{r.specific_location}</p>}
                <p className="text-sm mb-2" style={{ color: "#5a4a3a" }}>{r.issue_description}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs" style={{ color: "#D4BFA0" }}>Reported by {reporterName} · {fmtDateTime(r.created_at)}</span>
                </div>
                {r.images?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <Camera className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8a6a2f" }} />
                    {r.images.map((img, i) => (
                      <ImageThumb key={i} src={img.image_url} alt={`${r.issue_type} photo ${i + 1}`} size={48} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
