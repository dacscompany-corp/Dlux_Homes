"use client";

// Cleaner portal — DESKTOP (1024px and up). This is the original sidebar
// dashboard, moved out of app/admin/cleaners/page.tsx when the phone-only
// redesign landed (2026-09-27). Below lg, that page renders CleanerMobilePortal
// instead. The LOOK is unchanged; the data behind it was corrected (MVP fix
// scope, 2026-09-28) so both views show the same work:
//   - only the signed-in cleaner's own assignments, polled every 30s;
//   - My Schedule built from real checkout-based due times (no sample rows);
//   - the checklist, photo proof and submission gate from the same
//     useAssignmentChecklist hook the phone uses;
//   - loading, empty and failed requests shown as three different things, and
//     a failed Start / Complete rolled back on screen instead of looking done.

import { useState, useEffect, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import DluxMark from "@/components/brand/DluxMark";
import toast from "react-hot-toast";
import ImageThumb from "@/components/ImageThumb";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { useSubmitReportMutation } from "@/redux/api/reportApi";
import { useGetNotificationsQuery, useUpdateNotificationsMutation, type Notification } from "@/redux/api/notificationsApi";
import { useGetStaffThreadsQuery } from "@/redux/api/messagesApi";
import StaffChatThread from "@/components/admin/messages/StaffChatThread";
import {
  useGetCleaningTasksQuery,
  useStartCleaningMutation,
  useCompleteCleaningMutation,
} from "@/redux/api/cleanersApi";
import { useAssignmentChecklist, gateErrorMessage } from "@/components/admin/cleaners/useAssignmentChecklist";
import { canStartCleaning, cleaningDueAt, groupByDueDay, startOfLocalDay } from "@/lib/cleaning-schedule";
import { translateCategory, translateTask, type ChecklistLanguage } from "@/lib/checklist-translations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, ClipboardList, MapPin, CheckSquare, AlertTriangle,
  Bell, Menu, X, LogOut, Clock, CheckCircle2, Circle,
  AlertCircle, Building2, MessageSquare, CalendarDays, BookOpen,
  Camera, Phone, Mail, Shield, Star, ChevronDown, ChevronRight, LifeBuoy, Languages,
} from "lucide-react";
import { useSignedInStaff } from "@/components/admin/useSignedInStaff";

// Simplified sidebar (owner spec, 2026-09-22): five top-level items —
// Dashboard, Tasks, Schedule, Messages, Support. "Tasks" and "Support" are
// expandable groups (collapsed by default) that fold in what used to be
// separate pages:
//   - Tasks    -> Assignments (renamed from "My Assignment"). Cleaning
//                 Checklist now lives inline on each assignment card (opened
//                 per-assignment) instead of being its own page. Property
//                 Location is no longer its own page either — each task card
//                 shows its own location inline instead.
//   - Support  -> User Guide + Report an Issue.
// Notifications moved to the header bell (already existed there); Profile
// opens from the account card at the sidebar's bottom instead of a nav row.
const navItems: Array<
  | { icon: React.ElementType; label: string; children?: undefined }
  | { icon: React.ElementType; label: string; children: { icon: React.ElementType; label: string }[] }
> = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: ClipboardList,   label: "Tasks", children: [
    { icon: ClipboardList, label: "Assignments" },
  ] },
  { icon: CalendarDays,    label: "My Schedule" },
  { icon: MessageSquare,   label: "Messages" },
  { icon: LifeBuoy,        label: "Support", children: [
    { icon: BookOpen,      label: "User Guide" },
    { icon: AlertTriangle, label: "Report an Issue" },
  ] },
];

// Status pill styles for the cleaner's own view of an assignment. "completed"
// here means the cleaner-visible normalized bucket (see normCleanStatus), not
// a raw DB cleaning_status.
const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ready:                { label: "Ready",               color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "awaiting-inspection": { label: "Awaiting Inspection", color: "#5b21b6", bg: "#ede9fe", dot: "#8b5cf6" },
  "in-progress":        { label: "In Progress",         color: "#8a6a2f", bg: "#F7F0E3", dot: "#B07848" },
  pending:              { label: "Needs Cleaning",      color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
};

// Same pin/coords as the guest-facing /location page, so the "Get Directions"
// link on each task card points at the exact property, not an approximation.
// The old standalone Property Location page (map + marker + nearby-location
// cards) is gone (owner spec, 2026-09-22) — this is a single-property site,
// so the address + a directions link inline on each task card covers the one
// thing that page did that a cleaner actually needed mid-shift.
const PROPERTY_COORDS: [number, number] = [14.659186800125402, 121.02701538724116];
const PROPERTY_NAME = "D'Lux Homes — Tower 4, Grass Residences";
const PROPERTY_ADDRESS = "Grass Residences, SM North EDSA, Quezon City";
const propertyDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${PROPERTY_COORDS[0]},${PROPERTY_COORDS[1]}`;

// Each topic links to the real feature it describes — "goTo" is the nav
// target, and "openChecklist" (owner spec, 2026-09-23) additionally expands
// the Cleaning Checklist for the first assignment, since the checklist now
// lives inline on My Assignments rather than as its own page.
const guideTopics: { title: string; desc: string; icon: React.ElementType; goTo: string; openChecklist?: boolean }[] = [
  { title: "Getting Started",             desc: "How to navigate the cleaner portal and find your daily assignments.", icon: BookOpen,       goTo: "Assignments" },
  { title: "Cleaning Standards",          desc: "D'Lux Homes cleaning protocols and quality checklist guidelines.",   icon: CheckSquare,    goTo: "Assignments", openChecklist: true },
  { title: "Reporting Issues",            desc: "Step-by-step guide to submitting a maintenance or damage report.",   icon: AlertTriangle,  goTo: "Report an Issue" },
  { title: "Using the Checklist",         desc: "How to mark tasks complete and submit your cleaning report.",        icon: ClipboardList,  goTo: "Assignments", openChecklist: true },
  { title: "Communication with CSR",      desc: "How to message CSR staff and respond to instructions.",              icon: MessageSquare,  goTo: "Messages" },
  { title: "Schedule & Time Management",  desc: "Understanding your daily schedule and time slots.",                  icon: CalendarDays,   goTo: "My Schedule" },
];

// Normalize an RTK/fetch result to an array of rows, whether it arrives as a
// bare array, a { data: [...] } envelope, or undefined/error object.
function toRows(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  const d = (v as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
}

export default function CleanerDesktopPortal() {
  // The signed-in account — shown in the sidebar, header and Profile.
  const me = useSignedInStaff("Cleaner");
  const [sidebarOpen,       setSidebarOpen]       = useState(false);
  const [activeNav,         setActiveNav]         = useState("Dashboard");
  // Which expandable nav groups (Tasks, Support) are open — collapsed by
  // default (owner spec, 2026-09-22).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (label: string) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  const [issueForm, setIssueForm] = useState({ haven: "", type: "", priority: "", location: "", description: "" });
  const [issueSubmitted, setIssueSubmitted] = useState(false);

  // ── My Assignment — live cleaning tasks (booking_cleaning) ──
  // Polled so new assignments (issued when a booking is confirmed),
  // reassignments, cancellations and inspection feedback appear without a
  // refresh — the same 30s interval as the phone view.
  const {
    data: cleaningTasksData,
    isLoading: tasksLoading,
    isError: tasksFailed,
    refetch: refetchTasks,
  } = useGetCleaningTasksQuery(undefined, { pollingInterval: 30000, refetchOnMountOrArgChange: true });
  const [startCleaningM] = useStartCleaningMutation();
  const [completeCleaningM] = useCompleteCleaningMutation();
  const { data: session } = useSession();
  const cleanerId = (session?.user as { id?: string } | undefined)?.id;
  // 'cleaned'/'inspected' are the pre-workflow terminal statuses on old rows —
  // treated the same as 'ready' here since there's nothing left for the
  // cleaner to do on either.
  const normCleanStatus = (s: string) =>
    s === "cleaned" || s === "inspected" || s === "ready" ? "ready"
    : s === "awaiting-inspection" ? "awaiting-inspection"
    : s === "in-progress" ? "in-progress"
    : "pending";
  // "Done" from the cleaner's perspective — nothing left for them to do,
  // whether it's sitting with admin for inspection or already approved Ready.
  const isDoneStatus = (s: string) => s === "awaiting-inspection" || s === "ready";
  const formatDue = (d: Date | null) =>
    d ? d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  // Only this cleaner's own assignments. The server already scopes a
  // Cleaner's list to them; filtering again means a stale or admin-shaped
  // response can't put someone else's room here, and it's the same rule the
  // phone view applies — so both show exactly the same set.
  const assignments = useMemo(() => {
    const rank = (s: string) => (s === "in-progress" ? 0 : s === "pending" ? 1 : s === "awaiting-inspection" ? 2 : 3);
    return (cleaningTasksData ?? [])
      .filter((t) => !!cleanerId && String(t.assigned_cleaner_id ?? "") === cleanerId)
      .map((t) => {
        const dueAt = cleaningDueAt(t);
        return {
          id: String(t.cleaning_id ?? ""),
          room: String(t.haven ?? "—"),
          floor: String(t.booking_id ?? "—"),
          havenId: t.haven_id ? String(t.haven_id) : "",
          bookingUuid: t.booking_uuid ? String(t.booking_uuid) : "",
          scheduled_for: t.scheduled_for ?? null,
          booking_status: t.booking_status ?? null,
          check_out_date: t.check_out_date,
          check_out_time: t.check_out_time,
          dueAt,
          timeSlot: dueAt ? `Cleaning from ${formatDue(dueAt)} (guest checkout)` : "—",
          status: normCleanStatus(String(t.cleaning_status ?? "pending")),
          priority: "normal",
          notes: `Guest: ${`${t.guest_first_name ?? ""} ${t.guest_last_name ?? ""}`.trim() || "—"}`,
          inspectionNote: t.inspection_note ? String(t.inspection_note) : "",
          openIssues: Number(t.open_issue_count ?? 0),
        };
      })
      .sort((a, b) =>
        rank(a.status) - rank(b.status) ||
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  }, [cleaningTasksData, cleanerId]);

  // Today = due today, plus anything still unfinished from an earlier day (a
  // task must not vanish just because midnight passed) — the phone's rule.
  const todays = useMemo(() => {
    const today = startOfLocalDay(new Date()).getTime();
    return assignments.filter((a) => {
      const day = a.dueAt ? startOfLocalDay(a.dueAt).getTime() : today;
      return day <= today && (day === today || !isDoneStatus(a.status));
    });
  }, [assignments]);
  const todaysDone = todays.filter((a) => isDoneStatus(a.status)).length;
  const openIssueCount = assignments.reduce((n, a) => n + a.openIssues, 0);
  const schedule = useMemo(
    () => groupByDueDay(assignments.filter((a) => !isDoneStatus(a.status))),
    [assignments]
  );
  const noData = tasksFailed && !cleaningTasksData;

  // ── Report an Issue → live report_issue (feeds Owner Maintenance) ──
  const { data: havensData } = useGetHavensQuery({});
  const havenOptions = toRows(havensData).map((h) => ({
    value: String(h.uuid_id || h.id || ""),
    label: String(h.haven_name || h.name || "Haven"),
  }));
  const [submitReport, { isLoading: submittingIssue }] = useSubmitReportMutation();
  // Set when "Report Issue" is clicked from a specific assignment card, so
  // the report stays linked to that cleaning task instead of only the haven.
  const [issueAssignmentId, setIssueAssignmentId] = useState<string | null>(null);

  const submitIssue = async () => {
    if (!issueForm.haven || !issueForm.type || !issueForm.priority) {
      toast.error("Select a haven, issue type, and priority");
      return;
    }
    if (!cleanerId) { toast.error("Session not ready — please re-login"); return; }
    try {
      await submitReport({
        haven_id: issueForm.haven,
        issue_type: issueForm.type,
        priority_level: issueForm.priority,
        specific_location: issueForm.location,
        issue_description: issueForm.description,
        user_id: cleanerId,
        booking_cleaning_id: issueAssignmentId ?? undefined,
      }).unwrap();
      setIssueSubmitted(true);
      toast.success("Issue reported");
    } catch { toast.error("Could not submit the report"); }
  };

  // Notifications + Messages (live, session-scoped). Polled every 30s so a
  // new cleaning assignment (or a rejected-inspection note) shows up without
  // the cleaner having to manually refresh — matches the interval already
  // used elsewhere in the admin side for the same kind of live feed.
  const { data: notifRes } = useGetNotificationsQuery({}, { pollingInterval: 30000 });
  const [markNotificationsRead] = useUpdateNotificationsMutation();
  const notifications: Notification[] = notifRes ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Toast the moment a NEW cleaning assignment notification appears in a poll
  // — not on every unread notification (that would re-toast the same one
  // every 30s) and not on first load (that would toast every existing
  // unread notification the instant the page opens).
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!notifRes) return;
    if (seenNotificationIds === null) {
      // First successful fetch — just record what's already there, don't toast it.
      setSeenNotificationIds(new Set(notifRes.map((n) => n.id)));
      return;
    }
    const newOnes = notifRes.filter((n) => !seenNotificationIds.has(n.id));
    for (const n of newOnes) {
      if (n.rawType === "cleaning_assignment") {
        toast.success(n.title || "New cleaning assignment", { icon: "🧹" });
      } else if (n.rawType === "cleaning_rejected") {
        toast.error(n.title || "A task was sent back", { icon: "⚠️" });
      }
    }
    if (newOnes.length > 0) {
      setSeenNotificationIds(new Set(notifRes.map((n) => n.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifRes]);
  // The cleaner's one chat thread with the office (created on first load).
  // Polled on every tab so the Messages nav can show unread office replies.
  const { data: staffThreads = [] } = useGetStaffThreadsQuery(undefined, { skip: !cleanerId, pollingInterval: 30000 });
  // Only the signed-in cleaner's own thread — an Owner/CSR opening this portal
  // gets the whole office list back, and must not land in someone else's chat.
  const officeThread = staffThreads.find((t) => t.cleaner_id === cleanerId) ?? null;
  const unreadOfficeMessages = officeThread?.unread_count ?? 0;

  // Start and Complete show their result immediately (RTK's optimistic
  // update) and roll it back if the server refuses — so a failed request never
  // looks successful. The server message says why (not checked out yet, not
  // your task, checklist incomplete…).
  const startCleaning = async (id: string) => {
    const a = assignments.find((x) => x.id === id);
    if (a && !canStartCleaning(a)) {
      toast.error(`Guest still checked in — cleaning opens at checkout (${formatDue(a.dueAt)}) or once they're checked out`);
      return;
    }
    // Starting a room opens its checklist straight away — one click from
    // "Start" to ticking tasks, no separate checklist button.
    setChecklistOpenFor(id);
    try { await startCleaningM(id).unwrap(); toast.success("Cleaning started"); }
    catch (err) { toast.error(gateErrorMessage(err, "Could not start cleaning")); }
  };

  // Which assignment's checklist is expanded inline. There's no "Cleaning
  // Checklist" button any more (owner spec, 2026-09-28: one button per room):
  // it opens when cleaning starts, via "Continue checklist", and by itself for
  // the room currently being cleaned.
  const [checklistOpenFor, setChecklistOpenFor] = useState<string | null>(null);
  const activeAssignment = assignments.find((a) => a.id === checklistOpenFor);
  const inProgressId = assignments.find((a) => a.status === "in-progress")?.id ?? null;
  useEffect(() => {
    if (!checklistOpenFor && inProgressId) setChecklistOpenFor(inProgressId);
  }, [checklistOpenFor, inProgressId]);

  // ── Per-assignment checklist, photo proof and gate — the same hook the
  // phone view uses, so both agree on what's done and what's missing.
  const ck = useAssignmentChecklist(
    activeAssignment?.havenId && activeAssignment?.bookingUuid
      ? { havenId: activeAssignment.havenId, bookingUuid: activeAssignment.bookingUuid }
      : null
  );
  // English/Tagalog toggle for the checklist's category names + task text.
  // Only the fixed default-template wording is actually translated (see
  // src/lib/checklist-translations.ts) — a custom task admin adds later just
  // falls back to whatever it was typed in, since it has no dictionary entry.
  const [checklistLang, setChecklistLang] = useState<ChecklistLanguage>("en");
  const checklistCategories = ck.checklist?.categories ?? [];
  // Done = ticked AND photographed (a photo ticks its task on upload).
  const completedCount = ck.gate.doneTasks;
  const checklistTotal = ck.gate.totalTasks;
  const progressPercent = checklistTotal ? Math.round((completedCount / checklistTotal) * 100) : 0;
  const checklistEditable = activeAssignment?.status === "in-progress";

  // Completing only moves the task to Awaiting Inspection — it does NOT make
  // the room bookable again. The server re-verifies every task is ticked and
  // photographed; the client gate is only there to say what's missing before
  // the request is even sent.
  const markComplete = async (id: string) => {
    if (checklistOpenFor !== id) {
      // The gate needs this assignment's checklist loaded — open it, and let
      // the cleaner see what's outstanding before sending anything.
      setChecklistOpenFor(id);
      toast("Review the checklist — every task needs a tick and a photo.", { icon: "📋" });
      return;
    }
    if (!ck.gate.ok) {
      toast.error(ck.gate.error || "Finish the checklist first");
      return;
    }
    try {
      await completeCleaningM(id).unwrap();
      toast.success("Sent for inspection");
    } catch (err) {
      ck.refetch();
      toast.error(gateErrorMessage(err, "Could not mark complete"));
    }
  };

  // The ONE action a room card offers, by state (owner spec, 2026-09-28):
  //   guest still in      → nothing (the card says when it opens)
  //   ready to clean      → Start cleaning (starts + opens the checklist)
  //   cleaning            → Continue checklist / Fix & continue (sent back)
  //   checklist open      → nothing here; the sticky bar at the bottom of the
  //                         checklist carries progress and "Send for inspection"
  //   with the office     → status only
  // `fromDashboard` jumps to Assignments so the checklist is where they land.
  type CardAssignment = (typeof assignments)[number];
  const renderMainAction = (a: CardAssignment, fromDashboard = false) => {
    const cs = a.status;
    const base = "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white cursor-pointer";
    if (cs === "pending") {
      if (!canStartCleaning(a)) return null;
      return (
        <button type="button" className={base} style={{ background: "#1f1b16" }}
          onClick={() => { if (fromDashboard) setActiveNav("Assignments"); startCleaning(a.id); }}>
          <Circle className="w-4 h-4" />Start cleaning
        </button>
      );
    }
    if (cs === "in-progress") {
      if (!fromDashboard && checklistOpenFor === a.id) return null;
      return (
        <button type="button" className={base} style={{ background: "#B07848" }}
          onClick={() => { if (fromDashboard) setActiveNav("Assignments"); setChecklistOpenFor(a.id); }}>
          <CheckSquare className="w-4 h-4" />{a.inspectionNote ? "Fix & continue" : "Continue checklist"}
        </button>
      );
    }
    if (cs === "awaiting-inspection") {
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ backgroundColor: "#ede9fe", color: "#5b21b6", borderColor: "#c4b5fd" }}><CheckCircle2 className="w-3.5 h-3.5" />Awaiting Inspection</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}><CheckCircle2 className="w-3.5 h-3.5" />Ready</span>;
  };

  const reportIssueFor = (a: CardAssignment) => {
    setIssueAssignmentId(a.id);
    setIssueForm((prev) => ({ ...prev, haven: a.havenId || prev.haven }));
    setActiveNav("Report an Issue");
  };

  const pickChecklistPhoto = (taskId: string) => {
    if (!checklistEditable) {
      toast.error("Start cleaning this room first — photos are added while it's In Progress.");
      return;
    }
    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/png,image/jpeg,image/gif,image/webp";
    f.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const res = await ck.uploadPhoto(taskId, file);
      if (res.ok) toast.success("Photo attached");
      else toast.error(res.error || "Could not upload photo");
    };
    f.click();
  };

  return (
    <div className="min-h-screen cleaner-dashboard-root" style={{ backgroundColor: "#ffffff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap');
        /* The 1.1x zoom is a desktop-only polish — on phones it shrinks the
           usable viewport and causes text/cards to overflow or crowd. */
        @media (min-width: 1024px) {
          .cleaner-dashboard-root { zoom: 1.1; }
        }
      `}</style>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#1f1b16", borderRight: "1px solid rgba(250,247,241,0.1)" }}
      >
        <div className="px-2 py-1 flex items-center justify-between border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <Link href="/rooms" className="flex items-center min-w-0 flex-1">
            <DluxMark layout="compact" accent="gold" dark width={180} ambient={false} />
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden cursor-pointer" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#D4A96A20", color: "#D4A96A" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Cleaner Portal
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (!item.children) {
              const isActive = activeNav === item.label;
              return (
                <button key={item.label}
                  onClick={() => { setActiveNav(item.label); setSidebarOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm cursor-pointer"
                  style={{ backgroundColor: isActive ? "#B0784816" : "transparent", color: isActive ? "#E6CFA6" : "#A89080", fontWeight: isActive ? 600 : 500 }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#2f2114"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? "#D4A96A" : "#8C7660" }} />
                  {item.label}
                  {item.label === "Messages" && unreadOfficeMessages > 0 ? (
                    <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center"
                      title={`${unreadOfficeMessages} unread message${unreadOfficeMessages === 1 ? "" : "s"}`}
                      style={{ backgroundColor: "#D4A96A", color: "#1f1b16" }}>
                      {unreadOfficeMessages}
                    </span>
                  ) : isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#D4A96A" }} />}
                </button>
              );
            }
            // Expandable group (Tasks, Support) — collapsed by default. The
            // group header itself is never "active"; only its children are.
            const isOpen = !!openGroups[item.label];
            const childActive = item.children.some((c) => c.label === activeNav);
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm cursor-pointer"
                  style={{ backgroundColor: childActive ? "#B0784816" : "transparent", color: childActive ? "#E6CFA6" : "#A89080", fontWeight: childActive ? 600 : 500 }}
                  onMouseEnter={(e) => { if (!childActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#2f2114"; }}
                  onMouseLeave={(e) => { if (!childActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={childActive ? 2 : 1.5} style={{ color: childActive ? "#D4A96A" : "#8C7660" }} />
                  {item.label}
                  {isOpen ? <ChevronDown className="ml-auto w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="ml-auto w-3.5 h-3.5 flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-4 pl-3 space-y-0.5 border-l" style={{ borderColor: "rgba(250,247,241,0.12)" }}>
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = activeNav === child.label;
                      return (
                        <button key={child.label}
                          onClick={() => { setActiveNav(child.label); setSidebarOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm cursor-pointer"
                          style={{ backgroundColor: isActive ? "#B0784816" : "transparent", color: isActive ? "#E6CFA6" : "#A89080", fontWeight: isActive ? 600 : 500 }}
                          onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#2f2114"; }}
                          onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                          <ChildIcon className="w-4 h-4 flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? "#D4A96A" : "#8C7660" }} />
                          {child.label}
                          {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#D4A96A" }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          {/* Account card — clicking it opens Profile (owner spec, 2026-09-22),
              instead of Profile living in the nav list as its own row. Sign
              out is a separate hit target so a tap meant for the card can't
              accidentally sign the cleaner out. */}
          <button type="button" onClick={() => { setActiveNav("Profile"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-left"
            style={{ backgroundColor: activeNav === "Profile" ? "#B0784825" : "rgba(250,247,241,0.1)" }}
            onMouseEnter={(e) => { if (activeNav !== "Profile") (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(250,247,241,0.16)"; }}
            onMouseLeave={(e) => { if (activeNav !== "Profile") (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(250,247,241,0.1)"; }}>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: "#D4A96A", color: "#2C1F14" }}>{me.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{me.name}</p>
              <p className="text-xs truncate" style={{ color: "#6b5040" }}>{me.email}</p>
            </div>
            <span role="button" tabIndex={0} aria-label="Sign out"
              onClick={(e) => { e.stopPropagation(); signOut({ callbackUrl: "/admin/login" }); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); signOut({ callbackUrl: "/admin/login" }); } }}
              className="cursor-pointer p-1 -m-1 flex-shrink-0">
              <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: "#6b5040" }} />
            </span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4", height: 72, fontFamily: "'Geist', system-ui, sans-serif" }}>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="lg:hidden p-2 rounded-lg cursor-pointer flex-shrink-0" style={{ color: "#6b6358" }}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="hidden sm:flex items-center gap-2" style={{ fontSize: 12, color: "#8a8276" }}>
                <span className="inline-flex items-center gap-1.5" style={{ padding: "2px 8px", background: "rgba(212,169,106,0.22)", color: "#8a6a2f", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span style={{ width: 5, height: 5, background: "#d4a96a", borderRadius: "50%" }} />
                  Cleaner
                </span>
                <span>Housekeeping &middot; {assignments.length} assigned</span>
              </div>
              <h1 className="truncate" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", margin: 0, color: "#1f1b16" }}>{activeNav}</h1>
            </div>
          </div>
          <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
            {(() => {
              const total = todays.length;
              const doneN = todaysDone;
              const pct = total ? Math.round((doneN / total) * 100) : 0;
              return (
                <div className="hidden md:flex items-center gap-2.5" style={{ padding: "8px 14px", border: "1px solid #ece5d4", fontSize: 12, color: "#6b6358" }}>
                  <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{doneN} / {total}</span>
                  <span style={{ position: "relative", width: 60, height: 3, background: "#ece5d4" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "#d4a96a" }} />
                  </span>
                  <span>complete</span>
                </div>
              );
            })()}
            <span className="hidden md:block" style={{ width: 1, height: 24, background: "#e8e1d2", margin: "0 8px" }} />
            <button onClick={() => setActiveNav("Notifications")} title="Notifications" className="relative p-2.5 rounded-lg cursor-pointer transition-colors" style={{ color: "#6b6358" }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute flex items-center justify-center" style={{
                  top: 2, right: 2, minWidth: 16, height: 16, padding: "0 3px",
                  background: "#d4a96a", color: "#2c1f14", borderRadius: 999, border: "2px solid #fff",
                  fontSize: 9, fontWeight: 700, lineHeight: 1,
                }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button type="button" onClick={() => setActiveNav("Profile")} title="Profile" className="flex items-center gap-2.5 rounded-lg cursor-pointer transition-colors" style={{ padding: "6px 12px 6px 6px", background: "transparent", border: 0 }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
              <span className="flex-shrink-0" style={{ width: 28, height: 28, borderRadius: "50%", background: "#d4a96a", color: "#2c1f14", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 14 }}>{me.initials.slice(0, 1)}</span>
              <span className="hidden sm:flex flex-col items-start" style={{ lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: "#1f1b16" }}>{me.name}</span>
                <span style={{ fontSize: 11, color: "#8a8276" }}>{me.role || "Cleaner"}</span>
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* A failed poll is never papered over. With no data at all the views
              below say they couldn't load (rather than "no assignments"); with
              stale data they keep showing it under this banner. */}
          {tasksFailed && (activeNav === "Dashboard" || activeNav === "Assignments" || activeNav === "My Schedule") && (
            <div role="alert" className="flex items-center gap-3 border px-4 py-3 mb-5 text-sm"
              style={{ backgroundColor: "#fef3c7", borderColor: "#f5d9a8", color: "#92400e" }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">
                {noData ? "Couldn't load your assignments." : "Couldn't refresh your assignments — showing the last update."}
              </span>
              <button type="button" onClick={() => refetchTasks()} className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: "#92400e" }}>
                Try again
              </button>
            </div>
          )}

          {/* ── Dashboard ── */}
          {activeNav === "Dashboard" && (<>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: "Today's Assignments", value: tasksLoading || noData ? "—" : todays.length,     icon: ClipboardList, iconBg: "#F7F0E3", iconColor: "#B07848" },
                { label: "Completed Today",      value: tasksLoading || noData ? "—" : todaysDone,        icon: CheckCircle2,  iconBg: "#d1fae5", iconColor: "#059669" },
                // Open issue reports raised on this cleaner's own assignments —
                // was a hard-coded 1.
                { label: "Open Issues",          value: tasksLoading || noData ? "—" : openIssueCount,    icon: AlertCircle,   iconBg: "#fef3c7", iconColor: "#d97706" },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="border p-4 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: card.iconBg }}>
                      <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: card.iconColor }} />
                    </div>
                    <p style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{card.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{card.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Today's assignments preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Today&apos;s Assignments</h2>
                  <button onClick={() => setActiveNav("Assignments")} className="text-sm font-medium cursor-pointer" style={{ color: "#8a6a2f" }}>View All →</button>
                </div>
                {tasksLoading ? (
                  <p className="text-sm border p-4" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>Loading your assignments…</p>
                ) : noData ? null : todays.length === 0 ? (
                  <p className="text-sm border p-4" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>
                    {assignments.length ? "Nothing due today — see My Schedule for what's coming up." : "No rooms assigned to you yet."}
                  </p>
                ) : todays.map((a) => {
                  const cs = a.status;
                  const st = statusConfig[cs] || statusConfig.pending;
                  const opensLater = cs === "pending" && !canStartCleaning(a);
                  return (
                    <div key={a.id} className="border p-4" style={{ borderColor: cs === "in-progress" ? "#D4BFA0" : "#E0CEB8" }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{a.room}</p>
                          <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: "#8B6344" }}>
                            <Building2 className="w-3 h-3" />{a.floor}
                          </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "#8B6344" }}>
                        <Clock className="w-3.5 h-3.5" style={{ color: "#8a6a2f" }} />{a.timeSlot}
                      </div>
                      {/* Property location, inline per task (owner spec, 2026-09-22) —
                          replaces the old standalone Property Location page. */}
                      <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: "#8B6344" }}>
                        <MapPin className="w-3.5 h-3.5" style={{ color: "#8a6a2f" }} />{PROPERTY_ADDRESS}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {renderMainAction(a, true)}
                        {opensLater && <span className="text-xs" style={{ color: "#92400e" }}>Guest still checked in · opens {formatDue(a.dueAt)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Checklist preview */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Cleaning Checklist</h2>
                  <button onClick={() => { setActiveNav("Assignments"); setChecklistOpenFor(assignments[0]?.id ?? null); }} className="text-sm font-medium cursor-pointer" style={{ color: "#8a6a2f" }}>View →</button>
                </div>
                {assignments.length === 0 ? (
                  <div className="border p-5 text-center" style={{ borderColor: "#ece5d4" }}>
                    <p className="text-sm" style={{ color: "#8B6344" }}>No assignments yet — checklists open from My Assignments.</p>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "#8B6344" }}>
                    Each assignment has its own checklist. Attach a photo of each task — the photo ticks it off. A room can&apos;t be sent for inspection until every task has one.
                  </p>
                )}
              </div>
            </div>
          </>)}

          {/* ── Assignments (renamed from "My Assignment"; property location is
              now inline per task below instead of its own page) ── */}
          {activeNav === "Assignments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Assignments</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    {" · "}{assignments.filter((a) => !isDoneStatus(a.status)).length} to do
                  </p>
                </div>
              </div>
              {tasksLoading ? (
                <p className="text-sm border p-5" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>Loading your assignments…</p>
              ) : !noData && assignments.length === 0 ? (
                <p className="text-sm border p-5" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>
                  No rooms assigned to you yet. New assignments appear here as soon as a booking is confirmed.
                </p>
              ) : null}
              {assignments.map((a) => {
                const cs = a.status;
                const st = statusConfig[cs] || statusConfig.pending;
                const opensLater = cs === "pending" && !canStartCleaning(a);
                return (
                  <div key={a.id} className="border p-5 transition-shadow hover:shadow-md"
                    style={{ borderColor: cs === "in-progress" ? "#D4BFA0" : "#E0CEB8", borderLeftWidth: "4px", borderLeftColor: st.dot }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{a.room}</h3>
                          {a.priority === "high" && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>High Priority</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#8B6344" }}>
                          <Building2 className="w-3 h-3" />{a.floor}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                        <span className="text-xs font-semibold" style={{ color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm mb-2" style={{ color: "#5a4a3a" }}>
                      <Clock className="w-4 h-4" style={{ color: "#8a6a2f" }} />{a.timeSlot}
                    </div>
                    {/* Property location, inline per task (owner spec, 2026-09-22) —
                        replaces the old standalone Property Location page. */}
                    <div className="flex items-center justify-between gap-3 text-sm mb-3">
                      <div className="flex items-center gap-2 min-w-0" style={{ color: "#5a4a3a" }} title={PROPERTY_NAME}>
                        <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "#8a6a2f" }} />
                        <span className="truncate">{PROPERTY_ADDRESS}</span>
                      </div>
                      <button type="button" onClick={() => window.open(propertyDirectionsUrl, "_blank", "noopener")}
                        className="text-xs font-medium cursor-pointer flex-shrink-0" style={{ color: "#8a6a2f" }}>
                        Get Directions
                      </button>
                    </div>
                    {a.notes && (
                      <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#F7F0E3", borderColor: "#ece5d4" }}>
                        <p className="text-xs" style={{ color: "#6b5040" }}>{a.notes}</p>
                      </div>
                    )}
                    {a.inspectionNote && cs === "in-progress" && (
                      <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#ede9fe", borderColor: "#c4b5fd" }}>
                        <p className="text-xs font-semibold mb-0.5" style={{ color: "#5b21b6" }}>Sent back by admin — needs fixing:</p>
                        <p className="text-xs" style={{ color: "#5b21b6" }}>{a.inspectionNote}</p>
                      </div>
                    )}
                    {opensLater && (
                      <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#fef3c7", borderColor: "#f5d9a8" }}>
                        <p className="text-xs" style={{ color: "#92400e" }}>
                          Guest still checked in. You can start once they&apos;re checked out, or from the scheduled checkout — {formatDue(a.dueAt)}.
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">{renderMainAction(a)}</div>
                      {/* A quiet link, not a button — problems can come up at
                          any step, but they're not the next thing to do. */}
                      <button type="button" onClick={() => reportIssueFor(a)}
                        className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer underline underline-offset-2"
                        style={{ color: "#8B6344" }}>
                        <AlertCircle className="w-3.5 h-3.5" />Report a problem
                      </button>
                    </div>

                    {/* Cleaning Checklist — inline, scoped to this assignment.
                        Opens on Start, on "Continue checklist", or by itself
                        for the room being cleaned. */}
                    {checklistOpenFor === a.id && (
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F7F0E3" }}>
                        <div className="border p-5 mb-4" style={{ borderColor: "#ece5d4" }}>
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <span className="text-sm font-medium" style={{ color: "#5a4a3a" }}>Overall Progress</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold" style={{ color: "#8a6a2f" }}>{progressPercent}%</span>
                              {/* English/Tagalog toggle — only the fixed default-template
                                  wording is translated; a custom task admin adds shows as typed. */}
                              <button type="button" onClick={() => setChecklistLang((l) => (l === "en" ? "tl" : "en"))}
                                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer flex-shrink-0"
                                style={{ color: "#8a6a2f", border: "1px solid #D4BFA0", backgroundColor: "#FAF7F1" }}>
                                <Languages className="w-3.5 h-3.5" />{checklistLang === "en" ? "Tagalog" : "English"}
                              </button>
                            </div>
                          </div>
                          <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: "#E0CEB8" }}>
                            <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: "#d4a96a" }} />
                          </div>
                          <p className="text-xs mt-2" style={{ color: "#8B6344" }}>
                            {completedCount} of {checklistTotal} done · click a task to add its photo
                          </p>
                          {!checklistEditable && (
                            <p className="text-xs mt-2" style={{ color: "#92400e" }}>
                              {cs === "awaiting-inspection" || cs === "ready"
                                ? "Sent for inspection — this checklist is locked."
                                : "Start cleaning to tick tasks and add photos."}
                            </p>
                          )}
                        </div>
                        <div className="border overflow-hidden mb-4" style={{ borderColor: "#ece5d4" }}>
                          {checklistCategories.length === 0 ? (
                            ck.loadError ? (
                              <div role="alert" className="flex items-center gap-3 px-5 py-4 text-sm" style={{ color: "#92400e" }}>
                                <span className="flex-1">Couldn&apos;t load the checklist.</span>
                                <button type="button" onClick={() => ck.refetch()} className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: "#92400e" }}>Try again</button>
                              </div>
                            ) : (
                              <p className="text-sm px-5 py-4" style={{ color: "#8B6344" }}>
                                {ck.isLoading || ck.isFetching ? "Loading checklist…" : "This room has no checklist yet — ask the office to set one up."}
                              </p>
                            )
                          ) : checklistCategories.map((cat) => (
                            <div key={cat.category}>
                              <div className="px-3 sm:px-5 py-2 text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: "#FAF7F1", color: "#8a6a2f" }}>{translateCategory(cat.category, checklistLang)}</div>
                              {cat.tasks.map((item, idx) => {
                                const photo = ck.photoFor(item.id);
                                const upload = ck.uploadStateFor(item.id);
                                const uploadError = ck.uploadErrorFor(item.id);
                                const done = ck.isDone(item.id);
                                return (
                                <div key={item.id} style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}>
                                {/* One action per task: clicking the row attaches
                                    its photo, and the photo ticks it — no separate
                                    checkbox step. */}
                                <div role="button" tabIndex={checklistEditable ? 0 : -1}
                                  onClick={() => { if (upload !== "uploading") pickChecklistPhoto(item.id); }}
                                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && upload !== "uploading") { e.preventDefault(); pickChecklistPhoto(item.id); } }}
                                  className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3.5 transition-colors"
                                  style={{ cursor: checklistEditable ? "pointer" : "default" }}
                                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                    aria-hidden="true"
                                    style={{ borderColor: done ? "#B07848" : "#D4BFA0", backgroundColor: done ? "#B07848" : "transparent", opacity: checklistEditable || done ? 1 : 0.5 }}>
                                    {done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                  <span className="text-sm flex-1 min-w-0" style={{ color: done ? "#A89080" : "#5a4a3a", textDecoration: done ? "line-through" : "none" }}>{translateTask(item.task, checklistLang)}</span>
                                  {photo ? <ImageThumb src={photo} alt={item.task} size={32} /> : null}
                                  <button type="button"
                                    title={upload === "uploading" ? "Uploading…" : photo ? "Replace photo" : "Attach photo"}
                                    disabled={!checklistEditable || upload === "uploading"}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); pickChecklistPhoto(item.id); }}
                                    className="flex-shrink-0 p-1.5 rounded-lg cursor-pointer disabled:opacity-50"
                                    style={{
                                      color: upload === "failed" ? "#92400e" : "#8a6a2f",
                                      border: `1px solid ${upload === "failed" ? "#f5d9a8" : "#E0CEB8"}`,
                                      backgroundColor: upload === "failed" ? "#fef3c7" : "#FAF7F1",
                                    }}>
                                    {upload === "failed" ? <AlertTriangle className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                                  </button>
                                  {done && <span className="hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>Done</span>}
                                  {!photo && upload !== "uploading" && <span className="hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>Photo needed</span>}
                                </div>
                                {upload && (
                                  <p className="px-3 sm:px-5 pb-2 -mt-1 text-xs" style={{ color: upload === "failed" ? "#92400e" : "#8B6344", paddingLeft: 52 }}>
                                    {upload === "uploading" ? "Uploading photo…" : `${uploadError || "Upload failed"} — click the camera to retry.`}
                                  </p>
                                )}
                                </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        {/* Sticky finish bar — always in view while working
                            down a long checklist, so there's no scrolling back
                            up to finish. Shows progress until everything has a
                            photo, then becomes the one "Send for inspection". */}
                        {checklistEditable && checklistTotal > 0 && (
                          <div className="sticky bottom-0 z-10 -mx-5 px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3"
                            style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4", boxShadow: "0 -6px 16px rgba(31,27,22,0.06)" }}>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>
                                {completedCount} of {checklistTotal} done
                              </p>
                              {!ck.gate.ok && (
                                <p className="text-xs" style={{ color: "#92400e" }}>{ck.gate.error}</p>
                              )}
                            </div>
                            <button type="button"
                              onClick={() => markComplete(a.id)}
                              disabled={!ck.gate.ok}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:cursor-not-allowed"
                              style={{ backgroundColor: ck.gate.ok ? "#059669" : "#cfc6b6" }}>
                              <CheckCircle2 className="w-4 h-4" />Send for inspection
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Report an Issue ── */}
          {activeNav === "Report an Issue" && (
            <div className="max-w-lg">
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 24 }}>Report an Issue</h2>
              {issueSubmitted ? (
                <div className="border p-8 text-center" style={{ backgroundColor: "#d1fae5", borderColor: "#6ee7b7" }}>
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "#059669" }} />
                  <p className="font-bold text-lg" style={{ color: "#065f46" }}>Issue Reported!</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: "#059669" }}>The owner has been notified and will assign someone to resolve it.</p>
                  <button onClick={() => { setIssueSubmitted(false); setIssueForm({ haven: "", type: "", priority: "", location: "", description: "" }); setIssueAssignmentId(null); }}
                    className="px-5 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#059669" }}>
                    Report Another
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: "Haven", field: "haven", type: "select", options: havenOptions },
                    { label: "Issue Type", field: "type", type: "select", options: ["Plumbing","Electrical","HVAC","Furniture","Appliance","Pest","General"].map((o) => ({ value: o, label: o })) },
                    { label: "Priority Level", field: "priority", type: "select", options: ["Low","Medium","High","Urgent"].map((o) => ({ value: o, label: o })) },
                    { label: "Location within Unit", field: "location", type: "text", placeholder: "e.g. Master bathroom, near sink" },
                  ].map((field) => (
                    <div key={field.field}>
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "#8B6344" }}>{field.label}</label>
                      {field.type === "select" ? (
                        <div className="relative">
                          <select aria-label={String((field as { label?: string }).label ?? field.field)} value={issueForm[field.field as keyof typeof issueForm]}
                            onChange={(e) => setIssueForm(prev => ({ ...prev, [field.field]: e.target.value }))}
                            className="w-full appearance-none rounded-2xl border px-4 py-3 text-sm outline-none pr-10 cursor-pointer"
                            style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                            <option value="">Select {field.label}</option>
                            {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "#D4BFA0" }} />
                        </div>
                      ) : (
                        <input type="text" placeholder={field.placeholder}
                          value={issueForm[field.field as keyof typeof issueForm]}
                          onChange={(e) => setIssueForm(prev => ({ ...prev, [field.field]: e.target.value }))}
                          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                          style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "#8B6344" }}>Description</label>
                    <textarea rows={4} placeholder="Describe the issue in detail..."
                      value={issueForm.description}
                      onChange={(e) => setIssueForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none resize-none"
                      style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                  </div>
                  <div className="rounded-xl border border-dashed p-4 text-center cursor-pointer" style={{ borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}>
                    <Camera className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#8a6a2f" }} />
                    <p className="text-sm font-medium" style={{ color: "#8a6a2f" }}>Upload Photos (optional)</p>
                    <p className="text-xs mt-0.5" style={{ color: "#D4BFA0" }}>JPG, PNG — max 5 files</p>
                  </div>
                  <button
                    onClick={submitIssue}
                    disabled={submittingIssue}
                    className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: "#1f1b16" }}>
                    {submittingIssue ? "Submitting…" : "Submit Issue Report"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Notifications ── */}
          {activeNav === "Notifications" && (
            <div className="space-y-3 max-w-2xl">
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 16 }}>Notifications</h2>
              {notifications.length === 0 && (
                <p className="text-sm" style={{ color: "#8B6344" }}>No notifications yet.</p>
              )}
              {notifications.map((n) => {
                const iconMap: Record<string,{ icon: React.ElementType; color: string; bg: string }> = {
                  cleaning_assignment: { icon: ClipboardList,  color: "#8a6a2f", bg: "#F7F0E3" },
                  cleaning_reassigned: { icon: ClipboardList,  color: "#8a6a2f", bg: "#F7F0E3" },
                  cleaning_rejected:   { icon: AlertTriangle,  color: "#ea580c", bg: "#ffedd5" },
                  ReportIssue:         { icon: AlertTriangle,  color: "#ea580c", bg: "#ffedd5" },
                };
                const ic = iconMap[n.rawType ?? ""] || { icon: MessageSquare, color: "#059669", bg: "#d1fae5" };
                const Icon = ic.icon;
                return (
                  <div key={n.id} className="flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors"
                    style={{ backgroundColor: !n.read ? "#FDF8F3" : "#ffffff", borderColor: !n.read ? "#D4BFA0" : "#E0CEB8" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = !n.read ? "#FDF8F3" : "#ffffff"}
                    onClick={() => { if (!n.read) markNotificationsRead({ notificationIds: [n.id], markAs: "read" }); }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ic.bg }}>
                      <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: ic.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{n.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs flex-shrink-0" style={{ color: "#D4BFA0" }}>{n.timestamp}</span>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                        </div>
                      </div>
                      <p className="text-sm" style={{ color: "#8B6344" }}>{n.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── My Schedule ── */}
          {activeNav === "My Schedule" && (
            <div className="space-y-4">
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 8 }}>My Schedule</h2>
              <p className="text-sm" style={{ color: "#8B6344" }}>
                Your upcoming and unfinished cleanings, by the day the guest checks out.
              </p>
              {tasksLoading ? (
                <p className="text-sm border p-5" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>Loading your schedule…</p>
              ) : noData ? null : schedule.length === 0 ? (
                <p className="text-sm border p-5" style={{ color: "#8B6344", borderColor: "#ece5d4" }}>
                  Nothing scheduled. Rooms appear here as soon as a booking is confirmed and assigned to you.
                </p>
              ) : schedule.map((day) => (
                <div key={day.day.getTime()} className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
                  <div className="px-5 py-3 border-b" style={{ backgroundColor: "#F7F0E3", borderColor: "#ece5d4" }}>
                    <p className="font-bold text-sm" style={{ color: "#8a6a2f" }}>
                      {day.day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {day.isToday ? " (Today)" : day.isTomorrow ? " (Tomorrow)" : ""}
                    </p>
                  </div>
                  <div className="divide-y" style={{ borderColor: "#F7F0E3" }}>
                    {day.tasks.map((task) => {
                      const st = statusConfig[task.status] || statusConfig.pending;
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors"
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                          <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "#D4BFA0" }} />
                          <span className="text-sm flex-1 min-w-0" style={{ color: "#5a4a3a" }}>
                            {task.room} — {task.dueAt ? task.dueAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                            <span style={{ color: "#8B6344" }}> · {task.floor}</span>
                          </span>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── User Guide ── */}
          {activeNav === "User Guide" && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>User Guide</h2>
                <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Everything you need to know about the cleaner portal</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {guideTopics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button key={topic.title} type="button"
                      onClick={() => {
                        if (topic.openChecklist) setChecklistOpenFor(assignments[0]?.id ?? null);
                        setActiveNav(topic.goTo);
                        setSidebarOpen(false);
                      }}
                      className="border p-5 text-left cursor-pointer transition-shadow hover:shadow-md" style={{ borderColor: "#ece5d4" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#F7F0E3" }}>
                        <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: "#8a6a2f" }} />
                      </div>
                      <p className="font-bold text-sm mb-1" style={{ color: "#1a1a1a" }}>{topic.title}</p>
                      <p className="text-xs" style={{ color: "#8B6344" }}>{topic.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Messages — chat with the office (Owner/CSR) ── */}
          {activeNav === "Messages" && (
            <div className="max-w-2xl">
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 4 }}>Messages</h2>
              <p className="text-sm mb-4" style={{ color: "#8B6344" }}>
                Chat with the D&apos;Lux office. Everyone in the office (Owner and CSR) can see and answer your messages.
              </p>
              <div className="border flex flex-col" style={{ borderColor: "#ece5d4", height: 560 }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: "#ece5d4" }}>
                  <p className="text-sm font-semibold" style={{ color: "#1f1b16" }}>D&apos;Lux Office</p>
                  <p className="text-xs" style={{ color: "#8B6344" }}>Owner &amp; CSR</p>
                </div>
                {officeThread?.conversation_id ? (
                  <StaffChatThread
                    className="flex-1"
                    conversationId={officeThread.conversation_id}
                    emptyHint="No messages yet. Ask the office anything — supplies, access, a problem in a room."
                  />
                ) : (
                  <p className="p-4 text-sm" style={{ color: "#8B6344" }}>
                    {cleanerId ? "Opening your conversation with the office…" : "Sign in with a cleaner account to message the office."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Profile ── */}
          {activeNav === "Profile" && (
            <div className="max-w-lg">
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 24 }}>My Profile</h2>
              <div className="border p-6 mb-4" style={{ borderColor: "#ece5d4" }}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: "#D4A96A", color: "#2C1F14" }}>{me.initials}</div>
                  <div>
                    <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>{me.name}</p>
                    <p className="text-sm" style={{ color: "#8B6344" }}>Housekeeping Staff</p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />Active
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Mail,     label: "Email",    value: me.email || "—" },
                    { icon: Phone,    label: "Phone",    value: "+63 917 234 5678" },
                    { icon: Building2,label: "Location", value: "Mother Ignacia Ave, Diliman, QC" },
                    { icon: Shield,   label: "Role",     value: "Cleaner — Housekeeping Staff" },
                    { icon: Star,     label: "Rating",   value: "4.9 / 5.0 (32 reviews)" },
                  ].map((row) => {
                    const Icon = row.icon;
                    return (
                      <div key={row.label} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: "#F7F0E3" }}>
                        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "#D4BFA0" }} />
                        <span className="text-xs font-semibold w-16 flex-shrink-0" style={{ color: "#8B6344" }}>{row.label}</span>
                        <span className="text-sm" style={{ color: "#1a1a1a" }}>{row.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button className="w-full py-3 rounded-2xl text-sm font-semibold border cursor-pointer transition-colors"
                style={{ color: "#8a6a2f", borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}
                onClick={() => toast("Your profile is managed by the Owner. Contact them to update your details.", { icon: "ℹ️" })}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#EDE0CE"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}>
                Edit Profile
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
