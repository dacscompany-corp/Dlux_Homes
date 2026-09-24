"use client";

import { useState } from "react";
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
  type CleaningTask,
} from "@/redux/api/cleanersApi";
import { useGetEmployeesQuery } from "@/redux/api/employeeApi";
import { useGetReportsQuery, useUpdateReportStatusMutation } from "@/redux/api/reportApi";
import ImageThumb from "@/components/ImageThumb";
import {
  Clock, Building2, User, AlertTriangle, CheckCircle2, ChevronRight,
  Timer, ClipboardList, UserPlus, X, Plus, Pencil, Trash2, Camera, Search,
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

type Cleaner = { id: string; first_name: string; last_name: string };

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:               { label: "Needs Cleaning",      color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  assigned:              { label: "Assigned",            color: "#1e40af", bg: "#dbeafe", dot: "#3b82f6" },
  "in-progress":         { label: "In Progress",         color: "#8a6a2f", bg: "#F7F0E3", dot: "#B07848" },
  "awaiting-inspection": { label: "Awaiting Inspection", color: "#5b21b6", bg: "#ede9fe", dot: "#8b5cf6" },
  ready:                 { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  cleaned:               { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  inspected:             { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
};

function checkoutMoment(task: CleaningTask): Date | null {
  if (!task.check_out_date) return null;
  const time = task.check_out_time && task.check_out_time !== "00:00" ? task.check_out_time : "23:59:59";
  const d = new Date(`${String(task.check_out_date).slice(0, 10)}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
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

export function CleaningOperationsSection() {
  const { data: tasksData, isFetching } = useGetCleaningTasksQuery();
  const tasks = tasksData ?? [];

  // Manual assignment — same /assign endpoint the automatic checkout trigger
  // uses, just picked by a human here instead of by least-loaded-cleaner
  // logic. Available any time before Ready, so admin can hand-assign an
  // unassigned task or reassign one mid-flow.
  const { data: cleanersRes, error: cleanersError } = useGetEmployeesQuery({ role: "Cleaner" });
  const cleaners: Cleaner[] = (cleanersRes as { data?: Cleaner[] } | undefined)?.data ?? [];
  const cleanersLoadFailed = !!cleanersError;

  // Top-level view — "Tasks" is the existing monitoring table + drawer;
  // "Cleaning Checklist" is a dedicated view for picking a task and
  // viewing/editing its checklist directly, without opening the drawer;
  // "Reports & Issues" lists every cleaner-submitted issue report across all
  // tasks in one place, instead of only inside one task's drawer.
  const [topTab, setTopTab] = useState<"tasks" | "checklist" | "reports">("tasks");

  const [filter, setFilter] = useState<"all" | "attention" | "awaiting-inspection">("all");
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.cleaning_id === selectedId) ?? null;

  const overdueCount = tasks.filter(isOverdue).length;
  const issueCount = tasks.filter((t) => (t.open_issue_count ?? 0) > 0).length;
  const awaitingCount = tasks.filter((t) => t.cleaning_status === "awaiting-inspection").length;

  const normTaskQuery = taskQuery.trim().toLowerCase();
  const visibleTasks = tasks.filter((t) => {
    if (filter === "awaiting-inspection" && t.cleaning_status !== "awaiting-inspection") return false;
    if (filter === "attention" && !(isOverdue(t) || (t.open_issue_count ?? 0) > 0 || t.cleaning_status === "awaiting-inspection")) return false;
    return matchesQuery(normTaskQuery, [t.haven, t.booking_id, t.guest_first_name, t.guest_last_name, t.cleaner_first_name, t.cleaner_last_name]);
  });

  return (
    <div>
      {/* Top-level tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { id: "tasks", label: "Tasks" },
          { id: "checklist", label: "Cleaning Checklist" },
          { id: "reports", label: "Reports & Issues" },
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
        <ChecklistTab tasks={tasks} isFetching={isFetching} />
      ) : topTab === "reports" ? (
        <ReportsIssuesTab />
      ) : (
      <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
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

      <SearchBox value={taskQuery} onChange={setTaskQuery} placeholder="Search room, booking, guest, or cleaner…" />

      {/* Table */}
      <div className="border overflow-x-auto" style={{ borderColor: "#ece5d4" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF7F1", borderBottom: "1px solid #ece5d4" }}>
              {["Room", "Status", "Cleaner", "Checkout", "Started", "Elapsed", "Issues", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#8a6a2f" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!isFetching && visibleTasks.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "#8B6344" }}>No cleaning tasks match this filter.</td></tr>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-medium" style={{ color: "#1a1a1a" }}>
                      <Building2 className="w-3.5 h-3.5" style={{ color: "#8a6a2f" }} />{t.haven}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{t.booking_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg, color: st.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
                    </span>
                    {overdue && (
                      <span className="inline-flex items-center gap-1 ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}>
                        <AlertTriangle className="w-3 h-3" />Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {t.cleaning_status === "ready" ? (
                      <div className="flex items-center gap-1.5" style={{ color: "#5a4a3a" }}>
                        <User className="w-3.5 h-3.5" style={{ color: "#8a6a2f" }} />{cleanerName}
                      </div>
                    ) : (
                      <AssignCleanerControl task={t} cleaners={cleaners} loadFailed={cleanersLoadFailed} />
                    )}
                    <MethodBadge task={t} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "#5a4a3a" }}>
                    {t.check_out_date ? new Date(t.check_out_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} {t.check_out_time?.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#5a4a3a" }}>{fmtDateTime(t.cleaning_time_in)}</td>
                  <td className="px-4 py-3" style={{ color: "#5a4a3a" }}>
                    {t.cleaning_status === "in-progress" ? (
                      <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" style={{ color: "#B07848" }} />{elapsedSince(t.cleaning_time_in)}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(t.open_issue_count ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#ffedd5", color: "#ea580c" }}>
                        <AlertTriangle className="w-3 h-3" />{t.open_issue_count}
                      </span>
                    ) : <span style={{ color: "#D4BFA0" }}>—</span>}
                  </td>
                  <td className="px-4 py-3"><ChevronRight className="w-4 h-4" style={{ color: "#D4BFA0" }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <TaskDetailDrawer task={selectedTask} cleaners={cleaners} cleanersLoadFailed={cleanersLoadFailed} onClose={() => setSelectedId(null)} />
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
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Checkout</span><span>{task.check_out_date ? new Date(task.check_out_date).toLocaleDateString() : "—"} {task.check_out_time?.slice(0, 5)}</span></div>
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Started</span><span>{fmtDateTime(task.cleaning_time_in)}</span></div>
          <div className="flex justify-between"><span style={{ color: "#8B6344" }}>Completed</span><span>{fmtDateTime(task.cleaning_time_out)}</span></div>
        </div>

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
function ChecklistSection({ havenId, bookingUuid }: { havenId: string; bookingUuid: string }) {
  const { data: checklist, isFetching } = useGetChecklistQuery({ havenId, bookingId: bookingUuid });
  const { data: photos } = useGetChecklistPhotosQuery(checklist?.id ?? "", { skip: !checklist?.id });
  const [addTask, { isLoading: adding }] = useAddChecklistTaskMutation();
  const [editTask] = useEditChecklistTaskMutation();
  const [removeTask] = useRemoveChecklistTaskMutation();

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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
  if (!checklist || checklist.categories.length === 0) {
    return null;
  }

  const total = checklist.categories.reduce((n, c) => n + c.tasks.length, 0);
  const done = checklist.categories.reduce((n, c) => n + c.tasks.filter((t) => t.completed).length, 0);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>Cleaning Checklist</p>
        <span className="text-xs" style={{ color: "#8B6344" }}>{done} / {total} done</span>
      </div>
      <div className="border" style={{ borderColor: "#ece5d4" }}>
        {checklist.categories.map((cat, ci) => (
          <div key={cat.category} style={{ borderTop: ci > 0 ? "1px solid #ece5d4" : "none" }}>
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: "#FAF7F1", color: "#8a6a2f" }}>
              {cat.category}
            </div>
            {cat.tasks.map((item) => {
              const photo = photos?.[item.task];
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
                  {photo && <ImageThumb src={photo} alt={item.task} size={28} />}
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
