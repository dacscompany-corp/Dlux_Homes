"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { useSubmitReportMutation } from "@/redux/api/reportApi";
import { useGetNotificationsQuery } from "@/redux/api/notificationsApi";
import { useGetConversationsQuery } from "@/redux/api/messagesApi";
import { useGetCleaningTasksQuery, useStartCleaningMutation, useCompleteCleaningMutation } from "@/redux/api/cleanersApi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, ClipboardList, MapPin, CheckSquare, AlertTriangle,
  Bell, Menu, X, LogOut, ChevronRight, Clock, CheckCircle2, Circle,
  AlertCircle, Building2, MessageSquare, User, CalendarDays, BookOpen,
  Camera, Phone, Mail, Shield, Star, ChevronDown,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: ClipboardList,   label: "My Assignment" },
  { icon: MapPin,          label: "Property Location" },
  { icon: CheckSquare,     label: "Cleaning Checklist" },
  { icon: AlertTriangle,   label: "Report an Issue" },
  { icon: Bell,            label: "Notifications" },
  { icon: CalendarDays,    label: "My Schedule" },
  { icon: BookOpen,        label: "User Guide" },
  { icon: MessageSquare,   label: "Messages" },
  { icon: User,            label: "Profile" },
];

const checklistItems = [
  { id: 1,  label: "Change bed linens & pillowcases",  done: true  },
  { id: 2,  label: "Clean & sanitize bathroom",         done: true  },
  { id: 3,  label: "Vacuum floors & carpets",           done: true  },
  { id: 4,  label: "Wipe all surfaces & mirrors",       done: false },
  { id: 5,  label: "Restock toiletries & amenities",    done: false },
  { id: 6,  label: "Empty trash bins",                  done: false },
  { id: 7,  label: "Check mini bar & restock",          done: false },
  { id: 8,  label: "Inspect AC & TV remotes",           done: false },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  completed:    { label: "Completed",   color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "in-progress":{ label: "In Progress", color: "#B07848", bg: "#F7F0E3", dot: "#B07848" },
  pending:      { label: "Pending",     color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
};

const scheduleData = [
  { date: "Apr 20 (Today)",   tasks: ["Azure Haven Suite — 9:00 AM", "Pearl Executive Room — 11:30 AM", "Ruby Standard Room — 2:00 PM"] },
  { date: "Apr 21 (Tomorrow)",tasks: ["Golden Penthouse — 10:00 AM", "Sapphire Studio — 1:00 PM"] },
  { date: "Apr 22",           tasks: ["Emerald Deluxe Room — 9:00 AM", "Azure Haven Suite — 2:00 PM"] },
];

const guideTopics = [
  { title: "Getting Started",             desc: "How to navigate the cleaner portal and find your daily assignments.", icon: BookOpen },
  { title: "Cleaning Standards",          desc: "D'Lux Homes cleaning protocols and quality checklist guidelines.",   icon: CheckSquare },
  { title: "Reporting Issues",            desc: "Step-by-step guide to submitting a maintenance or damage report.",   icon: AlertTriangle },
  { title: "Using the Checklist",         desc: "How to mark tasks complete and submit your cleaning report.",        icon: ClipboardList },
  { title: "Communication with CSR",      desc: "How to message CSR staff and respond to instructions.",              icon: MessageSquare },
  { title: "Schedule & Time Management",  desc: "Understanding your daily schedule and time slots.",                  icon: CalendarDays },
];

export default function CleanerDashboard() {
  const [sidebarOpen,       setSidebarOpen]       = useState(false);
  const [activeNav,         setActiveNav]         = useState("Dashboard");
  const [checklist,         setChecklist]         = useState(checklistItems);
  const [assignmentStatuses,setAssignmentStatuses]= useState<Record<string, string>>({});
  const [issueForm, setIssueForm] = useState({ haven: "", type: "", priority: "", location: "", description: "" });
  const [issueSubmitted, setIssueSubmitted] = useState(false);

  // ── My Assignment — live cleaning tasks (booking_cleaning) ──
  const { data: cleaningTasksData } = useGetCleaningTasksQuery();
  const [startCleaningM] = useStartCleaningMutation();
  const [completeCleaningM] = useCompleteCleaningMutation();
  const normCleanStatus = (s: string) => (s === "cleaned" || s === "inspected" ? "completed" : s === "in-progress" ? "in-progress" : "pending");
  const assignments = ((cleaningTasksData as unknown as Record<string, unknown>[]) || []).map((t) => ({
    id: String(t.cleaning_id ?? ""),
    room: String(t.haven ?? "—"),
    floor: String(t.booking_id ?? "—"),
    timeSlot: t.check_in_time && t.check_out_time ? `${t.check_in_time} – ${t.check_out_time}` : "—",
    status: normCleanStatus(String(t.cleaning_status ?? "pending")),
    priority: "normal",
    notes: `Guest: ${`${t.guest_first_name ?? ""} ${t.guest_last_name ?? ""}`.trim() || "—"}`,
  }));
  useEffect(() => {
    setAssignmentStatuses(Object.fromEntries(assignments.map((a) => [a.id, a.status])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaningTasksData]);

  // ── Report an Issue → live report_issue (feeds Owner Maintenance) ──
  const { data: session } = useSession();
  const cleanerId = (session?.user as { id?: string } | undefined)?.id;
  const { data: havensData } = useGetHavensQuery({});
  const havenOptions = ((havensData as Record<string, unknown>[]) || []).map((h) => ({
    value: String(h.uuid_id || h.id || ""),
    label: String(h.haven_name || h.name || "Haven"),
  }));
  const [submitReport, { isLoading: submittingIssue }] = useSubmitReportMutation();

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
      }).unwrap();
      setIssueSubmitted(true);
      toast.success("Issue reported");
    } catch { toast.error("Could not submit the report"); }
  };

  // Notifications + Messages (live, session-scoped)
  const { data: notifRes } = useGetNotificationsQuery({});
  const notifications = (((notifRes as { data?: Record<string, unknown>[] } | undefined)?.data) || []).map((n, i) => ({
    id: (n.notification_id as string) ?? i,
    title: String(n.title || "Notification"),
    desc: String(n.message || ""),
    time: n.created_at ? new Date(String(n.created_at)).toLocaleString() : "",
    read: Boolean(n.is_read),
    type: String(n.notification_type || "assignment"),
  }));
  const { data: convRes } = useGetConversationsQuery({ userId: cleanerId || "" }, { skip: !cleanerId });
  const messages = (((convRes as unknown as { data?: Record<string, unknown>[] } | undefined)?.data) || []).map((c, i) => ({
    id: (c.id as string | number) ?? i,
    sender: String(c.name || "Staff"),
    role: String(c.role || "csr"),
    content: String(c.last_message || "No messages yet"),
    time: c.last_message_time ? new Date(String(c.last_message_time)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    unread: Number(c.unread_count ?? 0) > 0,
  }));

  const toggleChecklistItem = (id: number) =>
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));

  const startCleaning = async (id: string) => {
    setAssignmentStatuses((prev) => ({ ...prev, [id]: "in-progress" }));
    try { await startCleaningM(id).unwrap(); toast.success("Cleaning started"); }
    catch { toast.error("Could not start cleaning"); }
  };
  const markComplete = async (id: string) => {
    setAssignmentStatuses((prev) => ({ ...prev, [id]: "completed" }));
    try { await completeCleaningM(id).unwrap(); toast.success("Marked complete"); }
    catch { toast.error("Could not mark complete"); }
  };

  const completedCount  = checklist.filter((i) => i.done).length;
  const progressPercent = Math.round((completedCount / checklist.length) * 100);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#2C1F14", borderRight: "1px solid #3a2510" }}
      >
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #B07848, #D4A96A)" }} />
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: "#3a2510" }}>
          <Link href="/rooms">
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#f9fafb" }}>
              <Image src="/logo.png" alt="D'Lux Homes" width={80} height={28} className="mix-blend-multiply" style={{ width: "80px", height: "28px", objectFit: "cover" }} />
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden cursor-pointer" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: "#3a2510" }}>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#D4A96A20", color: "#D4A96A" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Cleaner Portal
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button key={item.label}
                onClick={() => { setActiveNav(item.label); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer"
                style={{ backgroundColor: isActive ? "#B07848" : "transparent", color: isActive ? "#1F160E" : "#A89080" }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#3a2510"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t" style={{ borderColor: "#3a2510" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#3a2510" }}>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: "#D4A96A", color: "#2C1F14" }}>CL</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Cleaner Staff</p>
              <p className="text-xs truncate" style={{ color: "#6b5040" }}>cleaner@dluxhomes.com</p>
            </div>
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} aria-label="Sign out" className="cursor-pointer">
              <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: "#6b5040" }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl cursor-pointer" style={{ color: "#8B6344" }}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>{activeNav}</h1>
              <p className="text-xs" style={{ color: "#8B6344" }}>Housekeeping Staff</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-xl cursor-pointer" style={{ color: "#8B6344" }}>
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold leading-none">{notifications.filter(n=>!n.read).length}</span>
              </span>
            </button>
            <Avatar className="w-9 h-9 cursor-pointer">
              <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: "#D4A96A", color: "#2C1F14" }}>CL</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* ── Dashboard ── */}
          {activeNav === "Dashboard" && (<>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Today's Assignments", value: assignments.length,                                                               icon: ClipboardList, iconBg: "#F7F0E3", iconColor: "#B07848" },
                { label: "Completed Today",      value: Object.values(assignmentStatuses).filter((s) => s === "completed").length,      icon: CheckCircle2,  iconBg: "#d1fae5", iconColor: "#059669" },
                { label: "Pending Issues",        value: 1,                                                                              icon: AlertCircle,   iconBg: "#fef3c7", iconColor: "#d97706" },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border p-4 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: card.iconBg }}>
                      <Icon className="w-5 h-5" style={{ color: card.iconColor }} />
                    </div>
                    <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{card.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{card.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Today's assignments preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Today&apos;s Assignments</h2>
                  <button onClick={() => setActiveNav("My Assignment")} className="text-sm font-medium cursor-pointer" style={{ color: "#B07848" }}>View All →</button>
                </div>
                {assignments.map((a) => {
                  const cs = assignmentStatuses[a.id];
                  const st = statusConfig[cs];
                  return (
                    <div key={a.id} className="rounded-2xl border p-4" style={{ borderColor: cs === "in-progress" ? "#D4BFA0" : "#E0CEB8" }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{a.room}</p>
                          <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: "#8B6344" }}>
                            <Building2 className="w-3 h-3" />{a.floor}
                          </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: "#8B6344" }}>
                        <Clock className="w-3.5 h-3.5" style={{ color: "#B07848" }} />{a.timeSlot}
                      </div>
                      <div className="flex gap-2">
                        {cs === "pending"     && <button onClick={() => startCleaning(a.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ background: "linear-gradient(135deg,#B07848,#C8924E)" }}><Circle className="w-3 h-3 inline mr-1" />Start</button>}
                        {cs === "in-progress" && <button onClick={() => markComplete(a.id)}  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ backgroundColor: "#059669" }}><CheckCircle2 className="w-3 h-3 inline mr-1" />Complete</button>}
                        {cs === "completed"   && <span className="px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}><CheckCircle2 className="w-3 h-3 inline mr-1" />Done</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Checklist preview */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Cleaning Checklist</h2>
                  <button onClick={() => setActiveNav("Cleaning Checklist")} className="text-sm font-medium cursor-pointer" style={{ color: "#B07848" }}>View Full →</button>
                </div>
                <div className="rounded-2xl border p-5 mb-4" style={{ borderColor: "#E0CEB8" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: "#5a4a3a" }}>Overall Progress</span>
                    <span className="text-sm font-bold" style={{ color: "#B07848" }}>{progressPercent}%</span>
                  </div>
                  <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: "#E0CEB8" }}>
                    <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg,#B07848,#D4A96A)" }} />
                  </div>
                  <p className="text-xs mt-2" style={{ color: "#8B6344" }}>{completedCount} of {checklist.length} tasks completed</p>
                </div>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
                  {checklist.slice(0,4).map((item, idx) => (
                    <label key={item.id} className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                      style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ borderColor: item.done ? "#B07848" : "#D4BFA0", backgroundColor: item.done ? "#B07848" : "transparent" }}
                        onClick={() => toggleChecklistItem(item.id)}>
                        {item.done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="text-sm flex-1" style={{ color: item.done ? "#A89080" : "#5a4a3a", textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                    </label>
                  ))}
                  <div className="px-5 py-3 border-t text-center" style={{ borderColor: "#F7F0E3" }}>
                    <button onClick={() => setActiveNav("Cleaning Checklist")} className="text-xs font-medium cursor-pointer" style={{ color: "#B07848" }}>+ {checklist.length - 4} more tasks</button>
                  </div>
                </div>
              </div>
            </div>
          </>)}

          {/* ── My Assignment ── */}
          {activeNav === "My Assignment" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>My Assignments</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>April 20, 2026 — Today</p>
                </div>
              </div>
              {assignments.map((a) => {
                const cs = assignmentStatuses[a.id];
                const st = statusConfig[cs];
                return (
                  <div key={a.id} className="rounded-2xl border p-5 transition-shadow hover:shadow-md"
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
                    <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#5a4a3a" }}>
                      <Clock className="w-4 h-4" style={{ color: "#B07848" }} />{a.timeSlot}
                    </div>
                    {a.notes && (
                      <div className="rounded-xl p-3 mb-3 border" style={{ backgroundColor: "#F7F0E3", borderColor: "#E0CEB8" }}>
                        <p className="text-xs" style={{ color: "#6b5040" }}>{a.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {cs === "pending"     && <button onClick={() => startCleaning(a.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ background: "linear-gradient(135deg,#B07848,#C8924E)" }}><Circle className="w-3.5 h-3.5" />Start Cleaning</button>}
                      {cs === "in-progress" && <button onClick={() => markComplete(a.id)}  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ backgroundColor: "#059669" }}><CheckCircle2 className="w-3.5 h-3.5" />Mark Complete</button>}
                      {cs === "completed"   && <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}><CheckCircle2 className="w-3.5 h-3.5" />Completed</div>}
                      <button onClick={() => setActiveNav("Report an Issue")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-colors"
                        style={{ backgroundColor: "#F7F0E3", color: "#8B6344", borderColor: "#D4BFA0" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#EDE0CE"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}>
                        <AlertCircle className="w-3.5 h-3.5" />Report Issue
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Property Location ── */}
          {activeNav === "Property Location" && (
            <div className="space-y-4">
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
                {/* Map placeholder */}
                <div className="relative flex items-center justify-center" style={{ height: "320px", backgroundColor: "#f0ebe3", backgroundImage: "repeating-linear-gradient(0deg,#E0CEB820 0px,#E0CEB820 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#E0CEB820 0px,#E0CEB820 1px,transparent 1px,transparent 40px)" }}>
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#B07848" }}>
                      <MapPin className="w-8 h-8 text-white" />
                    </div>
                    <p className="font-bold" style={{ color: "#1a1a1a" }}>D&apos;Lux Homes — Tower 4 Grass Residences</p>
                    <p className="text-sm mt-1" style={{ color: "#8B6344" }}>Grass Residences, SM North EDSA, Quezon City</p>
                    <button className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                      Open in Google Maps
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Tower 4",       address: "Grass Residences — 1BR Unit with Balcony (City View)", color: "#B07848", bg: "#F7F0E3" },
                  { label: "SM North EDSA", address: "Walking distance — shopping & groceries",                color: "#059669", bg: "#d1fae5" },
                  { label: "Lobby / CSR",   address: "Ground Floor — Reception & CSR Desk",                   color: "#7c3aed", bg: "#ede9fe" },
                  { label: "Amenities",     address: "Pool · Gym · Basketball Court · Kids Playground",       color: "#0d9488", bg: "#ccfbf1" },
                ].map((loc) => (
                  <div key={loc.label} className="rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: "#E0CEB8" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: loc.bg }}>
                      <Building2 className="w-5 h-5" style={{ color: loc.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{loc.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{loc.address}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Cleaning Checklist ── */}
          {activeNav === "Cleaning Checklist" && (
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Cleaning Checklist</h2>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border" style={{ backgroundColor: "#F7F0E3", color: "#B07848", borderColor: "#D4BFA0" }}>
                  Azure Haven Suite
                </span>
              </div>
              <div className="rounded-2xl border p-5 mb-4" style={{ borderColor: "#E0CEB8" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: "#5a4a3a" }}>Overall Progress</span>
                  <span className="text-sm font-bold" style={{ color: "#B07848" }}>{progressPercent}%</span>
                </div>
                <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: "#E0CEB8" }}>
                  <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg,#B07848,#D4A96A)" }} />
                </div>
                <p className="text-xs mt-2" style={{ color: "#8B6344" }}>{completedCount} of {checklist.length} tasks completed</p>
              </div>
              <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: "#E0CEB8" }}>
                {checklist.map((item, idx) => (
                  <label key={item.id} className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                    style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ borderColor: item.done ? "#B07848" : "#D4BFA0", backgroundColor: item.done ? "#B07848" : "transparent" }}
                      onClick={() => toggleChecklistItem(item.id)}>
                      {item.done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm flex-1" style={{ color: item.done ? "#A89080" : "#5a4a3a", textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                    {item.done && <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>Done</span>}
                  </label>
                ))}
              </div>
              {progressPercent === 100 ? (
                <div className="p-5 rounded-2xl border text-center" style={{ backgroundColor: "#d1fae5", borderColor: "#6ee7b7" }}>
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#059669" }} />
                  <p className="font-bold" style={{ color: "#065f46" }}>All tasks completed!</p>
                  <p className="text-sm mt-0.5" style={{ color: "#059669" }}>Room is ready for the next guest</p>
                  <button className="mt-3 px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#059669" }}>Submit Report</button>
                </div>
              ) : (
                <p className="text-xs text-center" style={{ color: "#D4BFA0" }}>Complete all tasks before submitting the report</p>
              )}
            </div>
          )}

          {/* ── Report an Issue ── */}
          {activeNav === "Report an Issue" && (
            <div className="max-w-lg">
              <h2 className="font-bold text-lg mb-6" style={{ color: "#1a1a1a" }}>Report an Issue</h2>
              {issueSubmitted ? (
                <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: "#d1fae5", borderColor: "#6ee7b7" }}>
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "#059669" }} />
                  <p className="font-bold text-lg" style={{ color: "#065f46" }}>Issue Reported!</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: "#059669" }}>The owner has been notified and will assign someone to resolve it.</p>
                  <button onClick={() => { setIssueSubmitted(false); setIssueForm({ haven: "", type: "", priority: "", location: "", description: "" }); }}
                    className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#059669" }}>
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
                          <select value={issueForm[field.field as keyof typeof issueForm]}
                            onChange={(e) => setIssueForm(prev => ({ ...prev, [field.field]: e.target.value }))}
                            className="w-full appearance-none rounded-2xl border px-4 py-3 text-sm outline-none pr-10 cursor-pointer"
                            style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
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
                          style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "#8B6344" }}>Description</label>
                    <textarea rows={4} placeholder="Describe the issue in detail..."
                      value={issueForm.description}
                      onChange={(e) => setIssueForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none resize-none"
                      style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                  </div>
                  <div className="rounded-xl border border-dashed p-4 text-center cursor-pointer" style={{ borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}>
                    <Camera className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#B07848" }} />
                    <p className="text-sm font-medium" style={{ color: "#B07848" }}>Upload Photos (optional)</p>
                    <p className="text-xs mt-0.5" style={{ color: "#D4BFA0" }}>JPG, PNG — max 5 files</p>
                  </div>
                  <button
                    onClick={submitIssue}
                    disabled={submittingIssue}
                    className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: "#B07848" }}>
                    {submittingIssue ? "Submitting…" : "Submit Issue Report"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Notifications ── */}
          {activeNav === "Notifications" && (
            <div className="space-y-3 max-w-2xl">
              <h2 className="font-bold text-lg mb-4" style={{ color: "#1a1a1a" }}>Notifications</h2>
              {notifications.map((n) => {
                const iconMap: Record<string,{ icon: React.ElementType; color: string; bg: string }> = {
                  assignment: { icon: ClipboardList, color: "#B07848", bg: "#F7F0E3" },
                  issue:      { icon: AlertTriangle, color: "#ea580c", bg: "#ffedd5" },
                  schedule:   { icon: CalendarDays,  color: "#7c3aed", bg: "#ede9fe" },
                  message:    { icon: MessageSquare, color: "#059669", bg: "#d1fae5" },
                };
                const ic = iconMap[n.type] || iconMap.assignment;
                const Icon = ic.icon;
                return (
                  <div key={n.id} className="flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors"
                    style={{ backgroundColor: !n.read ? "#FDF8F3" : "#ffffff", borderColor: !n.read ? "#D4BFA0" : "#E0CEB8" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = !n.read ? "#FDF8F3" : "#ffffff"}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ic.bg }}>
                      <Icon className="w-5 h-5" style={{ color: ic.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{n.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs flex-shrink-0" style={{ color: "#D4BFA0" }}>{n.time}</span>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                        </div>
                      </div>
                      <p className="text-sm" style={{ color: "#8B6344" }}>{n.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── My Schedule ── */}
          {activeNav === "My Schedule" && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg mb-2" style={{ color: "#1a1a1a" }}>My Schedule</h2>
              {scheduleData.map((day) => (
                <div key={day.date} className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
                  <div className="px-5 py-3 border-b" style={{ backgroundColor: "#F7F0E3", borderColor: "#E0CEB8" }}>
                    <p className="font-bold text-sm" style={{ color: "#B07848" }}>{day.date}</p>
                  </div>
                  <div className="divide-y" style={{ borderColor: "#F7F0E3" }}>
                    {day.tasks.map((task, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3.5 transition-colors"
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "#D4BFA0" }} />
                        <span className="text-sm" style={{ color: "#5a4a3a" }}>{task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── User Guide ── */}
          {activeNav === "User Guide" && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>User Guide</h2>
                <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Everything you need to know about the cleaner portal</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {guideTopics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <div key={topic.title} className="rounded-2xl border p-5 cursor-pointer transition-shadow hover:shadow-md" style={{ borderColor: "#E0CEB8" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#F7F0E3" }}>
                        <Icon className="w-5 h-5" style={{ color: "#B07848" }} />
                      </div>
                      <p className="font-bold text-sm mb-1" style={{ color: "#1a1a1a" }}>{topic.title}</p>
                      <p className="text-xs" style={{ color: "#8B6344" }}>{topic.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          {activeNav === "Messages" && (
            <div className="space-y-3 max-w-2xl">
              <h2 className="font-bold text-lg mb-4" style={{ color: "#1a1a1a" }}>Messages</h2>
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors"
                  style={{ backgroundColor: msg.unread ? "#FDF8F3" : "#ffffff", borderColor: msg.unread ? "#D4BFA0" : "#E0CEB8" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = msg.unread ? "#FDF8F3" : "#ffffff"}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: msg.role === "owner" ? "#F7F0E3" : "#d1fae5" }}>
                    <span className="text-xs font-bold" style={{ color: msg.role === "owner" ? "#B07848" : "#059669" }}>
                      {msg.sender.split(" ").map((n)=>n[0]).join("")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{msg.sender}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: "#D4BFA0" }}>{msg.time}</span>
                        {msg.unread && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                      </div>
                    </div>
                    <p className="text-sm truncate" style={{ color: "#8B6344" }}>{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Profile ── */}
          {activeNav === "Profile" && (
            <div className="max-w-lg">
              <h2 className="font-bold text-lg mb-6" style={{ color: "#1a1a1a" }}>My Profile</h2>
              <div className="rounded-2xl border p-6 mb-4" style={{ borderColor: "#E0CEB8" }}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: "#D4A96A", color: "#2C1F14" }}>CL</div>
                  <div>
                    <p className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Cleaner Staff</p>
                    <p className="text-sm" style={{ color: "#8B6344" }}>Housekeeping Staff</p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />Active
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Mail,     label: "Email",    value: "cleaner@dluxhomes.com" },
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
                style={{ color: "#B07848", borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}
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
