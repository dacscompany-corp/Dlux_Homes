"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery, useUpdateBookingStatusMutation } from "@/redux/api/bookingsApi";
import { useGetHavensQuery, useCreateHavenMutation, useUpdateHavenMutation } from "@/redux/api/roomApi";
import { useGetEmployeesQuery, useCreateEmployeeMutation } from "@/redux/api/employeeApi";
import { useGetReviewsQuery } from "@/redux/api/reviewsApi";
import { useGetReportsQuery } from "@/redux/api/reportApi";
import { useGetConversationsQuery } from "@/redux/api/messagesApi";
import {
  AnalyticsSection, BookingCalendarSection, BlockedDatesSection, CleaningManagementSection,
  PaymentMethodsSection, GuestAssistanceSection, UserManagementSection, PartnerManagementSection,
} from "@/components/admin/owners/OwnerModules";
import HavenWizard from "@/components/admin/owners/HavenWizard";
import NewBookingWizard from "@/components/admin/NewBookingWizard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  PhilippinePeso,
  MessageSquare,
  Users,
  Settings,
  Bell,
  TrendingUp,
  Star,
  BedDouble,
  UserCheck,
  Menu,
  X,
  LogOut,
  BarChart3,
  ArrowUpRight,
  Eye,
  Check,
  XCircle,
  Wrench,
  UserCog,
  Shield,
  Mail,
  Plus,
  AlertCircle,
  FileText,
  MapPin,
  Phone,
  Calendar,
  CalendarOff,
  Sparkles,
  Headphones,
  CreditCard,
  Handshake,
  UsersRound,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CalendarDays, label: "Bookings" },
  { icon: Building2, label: "Property" },
  { icon: PhilippinePeso, label: "Finance" },
  { icon: MessageSquare, label: "Communication" },
  { icon: Users, label: "Team" },
  { icon: Settings, label: "System" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:      { label: "Pending",     color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  confirmed:    { label: "Confirmed",   color: "#B07848", bg: "#F7F0E3", dot: "#B07848" },
  "checked-in": { label: "Checked In", color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "checked-out":{ label: "Checked Out",color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
  rejected:     { label: "Rejected",   color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
};


export default function OwnerDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [propertyTab, setPropertyTab] = useState<"havens"|"maintenance"|"cleaning">("havens");
  const [commTab, setCommTab]         = useState<"reviews"|"messages"|"guest">("reviews");
  const [systemTab, setSystemTab]     = useState<"settings"|"logs">("settings");
  const [overviewTab, setOverviewTab] = useState<"dashboard"|"analytics">("dashboard");
  const [bookingsTab, setBookingsTab] = useState<"list"|"calendar"|"blocked">("list");
  const [financeTab, setFinanceTab]   = useState<"revenue"|"methods">("revenue");
  const [teamTab, setTeamTab]         = useState<"staff"|"users"|"partners">("staff");

  // ── Live data from the Supabase-backed API (RTK Query) ──
  const { data: summaryRes }   = useGetAnalyticsSummaryQuery({ period: "30" });
  const { data: monthlyRes }   = useGetMonthlyRevenueQuery({ months: "6" });
  const { data: bookingsData, refetch: refetchBookings } = useGetBookingsQuery();
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const { data: havensData }   = useGetHavensQuery({});
  const { data: employeesRes } = useGetEmployeesQuery({});
  const { data: reviewsRes }   = useGetReviewsQuery();
  const { data: reportsRes }   = useGetReportsQuery({});
  const { data: session }      = useSession();
  const ownerId = (session?.user as { id?: string } | undefined)?.id;
  const { data: conversationsRes } = useGetConversationsQuery(
    { userId: ownerId || "" },
    { skip: !ownerId }
  );

  // ── Actions / mutations ──
  const [updateBookingStatus, { isLoading: bookingUpdating }] = useUpdateBookingStatusMutation();
  const [createEmployee, { isLoading: creatingStaff }] = useCreateEmployeeMutation();
  const [createHaven] = useCreateHavenMutation();
  const [updateHaven] = useUpdateHavenMutation();

  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string; reason: string }>({ open: false, id: "", reason: "" });

  const emptyStaff = { first_name: "", last_name: "", email: "", password: "", role: "CSR", phone: "" };
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState(emptyStaff);

  const [havenModalOpen, setHavenModalOpen] = useState(false);
  const [editHaven, setEditHaven] = useState<Record<string, unknown> | null>(null);
  const openHavenWizard = () => { setEditHaven(null); setHavenModalOpen(true); };
  const openHavenEdit = (raw: Record<string, unknown>) => { setEditHaven(raw); setHavenModalOpen(true); };
  const closeHavenWizard = () => { setHavenModalOpen(false); setEditHaven(null); };
  const [detailModal, setDetailModal] = useState<{ title: string; subtitle?: string; rows: { label: string; value: string }[] } | null>(null);

  const handleApproveBooking = async (id: string) => {
    try { await updateBookingStatus({ id, status: "approved" }).unwrap(); toast.success("Booking approved"); }
    catch { toast.error("Could not approve booking"); }
  };
  const submitRejectBooking = async () => {
    try {
      await updateBookingStatus({ id: rejectModal.id, status: "rejected", rejection_reason: rejectModal.reason.trim() || "Rejected by admin" }).unwrap();
      toast.success("Booking rejected");
      setRejectModal({ open: false, id: "", reason: "" });
    } catch { toast.error("Could not reject booking"); }
  };
  const submitStaff = async () => {
    if (!staffForm.first_name || !staffForm.last_name || !staffForm.email || !staffForm.password) {
      toast.error("First name, last name, email and password are required");
      return;
    }
    try {
      await createEmployee({
        ...staffForm,
        employment_id: "EMP-" + staffForm.email.split("@")[0].toUpperCase(),
        hire_date: new Date().toISOString().slice(0, 10),
      }).unwrap();
      toast.success("Staff account created");
      setStaffModalOpen(false);
      setStaffForm(emptyStaff);
    } catch { toast.error("Could not create staff (email may already exist)"); }
  };

  const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
  const pct  = (n: number) => (n ? `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)}%` : "—");

  // KPI cards (Overview)
  const s = summaryRes?.data;
  const havensList = (havensData as Record<string, unknown>[]) || [];
  const reviewsList = (reviewsRes?.data as unknown as Record<string, unknown>[]) || [];
  const kpis = [
    { label: "Total Bookings", value: String(s?.total_bookings ?? 0),            change: pct(s?.bookings_change ?? 0),  icon: CalendarDays, iconBg: "#F7F0E3", iconColor: "#B07848" },
    { label: "Total Revenue",  value: peso(s?.total_revenue ?? 0),               change: pct(s?.revenue_change ?? 0),   icon: PhilippinePeso,   iconBg: "#d1fae5", iconColor: "#059669" },
    { label: "Occupancy Rate", value: `${Math.round(s?.occupancy_rate ?? 0)}%`,  change: pct(s?.occupancy_change ?? 0), icon: TrendingUp,   iconBg: "#ede9fe", iconColor: "#7c3aed" },
    { label: "Total Guests",   value: String(s?.new_guests ?? 0),                change: pct(s?.guests_change ?? 0),    icon: UserCheck,    iconBg: "#ffedd5", iconColor: "#ea580c" },
    { label: "Reviews",        value: String(reviewsList.length),                change: "—",                           icon: Star,         iconBg: "#fef9c3", iconColor: "#ca8a04" },
    { label: "Active Havens",  value: String(havensList.length),                 change: "—",                           icon: BedDouble,    iconBg: "#ccfbf1", iconColor: "#0d9488" },
  ];

  // Revenue chart — normalize monthly revenue to bar heights (Overview + Finance)
  const monthly = (monthlyRes?.data as { month: string; revenue: number }[]) || [];
  const maxRev = Math.max(1, ...monthly.map((m) => Number(m.revenue) || 0));
  const revenueData = monthly.map((m) => ({
    month: /^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "short" }) : m.month,
    value: Math.round(((Number(m.revenue) || 0) / maxRev) * 100),
  }));

  // Backend statuses → UI statuses the design's statusConfig expects
  const normalizeBookingStatus = (st: string) =>
    st === "approved" ? "confirmed" : st === "completed" ? "checked-out" : st === "on-going" ? "checked-in" : st;

  // Bookings table (Overview + Bookings)
  const allAdminBookings = ((bookingsData as unknown as Record<string, unknown>[]) || []).map((b) => ({
    id: String(b.id || b.booking_id || ""),            // UUID — used by status mutations
    displayId: String(b.booking_id || b.id || ""),     // friendly BK-… id for display
    guest: `${b.guest_first_name ?? ""} ${b.guest_last_name ?? ""}`.trim() || "Guest",
    room: String(b.room_name ?? "—"),
    checkIn: b.check_in_date ? new Date(String(b.check_in_date)).toLocaleDateString() : "—",
    stayType: b.check_in_time && b.check_out_time ? `${b.check_in_time}–${b.check_out_time}` : "Stay",
    amount: Number(b.total_amount ?? b.down_payment ?? 0),
    status: normalizeBookingStatus(String(b.status ?? "pending")),
    email: String(b.guest_email ?? ""),
  }));

  // Haven table (Property)
  const havens = havensList.map((h) => ({
    id: String(h.uuid_id || h.id || ""),
    name: String(h.haven_name || h.name || "Haven"),
    type: String(h.haven_type || h.type || "Unit"),
    floor: [h.tower, h.floor].filter(Boolean).join(", ") || String(h.location || "—"),
    rate: Number(h.price_per_night ?? h.price ?? h.rate ?? 0),
    status: String(h.listing_status || h.status || "available"),
    occupancy: Number(h.occupancy ?? 0),
    raw: h, // full record, used to pre-fill the edit wizard
  }));

  // Staff table (Team)
  const staffMembers = ((employeesRes?.data as Record<string, unknown>[]) || []).map((e) => ({
    id: String(e.employment_id || e.id || ""),
    name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Staff",
    role: String(e.role ?? ""),
    email: String(e.email ?? ""),
    phone: String(e.phone || "—"),
    status: String(e.status || "active"),
    joined: e.hire_date ? new Date(String(e.hire_date)).toLocaleDateString("en", { month: "short", year: "numeric" }) : "—",
  }));

  // Reviews (Communication)
  const reviews = reviewsList.map((r, i) => ({
    id: (r.id as number) ?? i,
    guest: String(r.guest_name || r.name || "Guest"),
    haven: String(r.haven_name || r.room_name || "—"),
    rating: Number(r.rating ?? 0),
    comment: String(r.comment || r.review || ""),
    date: r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : "",
  }));

  // Audit logs (System) — no RTK slice; fetch the activity feed directly
  const [auditLogs, setAuditLogs] = useState<{ id: string; actor: string; action: string; time: string; type: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/audit-logs")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (!active) return;
        setAuditLogs(
          ((j.data as Record<string, unknown>[]) || []).map((l) => ({
            id: String(l.id ?? ""),
            actor: String(l.user || l.actor || "System"),
            action: String(l.action ?? "") + (l.details ? ` — ${l.details}` : ""),
            time: String(l.timestamp ?? ""),
            type: String(l.type || "booking"),
          }))
        );
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Booking Rates & Windows (System → Settings) — derived from the haven's
  // actual rates so this mirrors exactly what guests are charged (no separate,
  // drifting config). Three D'Lux stay types per the rate card.
  const h0 = (havensList[0] as Record<string, unknown>) || {};
  const rnum = (v: unknown) => Number(v ?? 0);
  const stayRates = [
    { name: "Daycation (10h)",  window: "07:00 – 17:00", weekday: rnum(h0.ten_hour_rate), weekend: rnum(h0.six_hour_rate) },
    { name: "Nightcation (10h)", window: "19:00 – 05:00", weekday: rnum(h0.ten_hour_rate), weekend: rnum(h0.six_hour_rate) },
    { name: "Overnight (21h)",  window: "19:00 – 16:00", weekday: rnum(h0.weekday_rate), weekend: rnum(h0.weekend_rate) },
  ];

  // Today's Snapshot — derived from the live bookings + havens (no extra API)
  const today = new Date().toDateString();
  const sameDay = (d: unknown) => !!d && new Date(String(d)).toDateString() === today;
  const rawBookings = (bookingsData as unknown as Record<string, unknown>[]) || [];
  const checkInsToday  = rawBookings.filter((b) => sameDay(b.check_in_date)  && ["approved", "confirmed", "checked-in"].includes(String(b.status))).length;
  const checkOutsToday = rawBookings.filter((b) => sameDay(b.check_out_date) && ["checked-in", "completed", "checked-out"].includes(String(b.status))).length;
  const pendingApproval = rawBookings.filter((b) => String(b.status) === "pending").length;
  const activeGuests = rawBookings.filter((b) => String(b.status) === "checked-in").length;
  const occupiedRooms = new Set(rawBookings.filter((b) => String(b.status) === "checked-in").map((b) => b.room_name)).size;
  const availableRooms = Math.max(0, havensList.length - occupiedRooms);
  const snapshot = [
    { label: "Check-ins Today",  value: String(checkInsToday),   dot: "#10b981" },
    { label: "Check-outs Today", value: String(checkOutsToday),  dot: "#B07848" },
    { label: "Pending Approval", value: String(pendingApproval), dot: "#f59e0b" },
    { label: "Active Guests",    value: String(activeGuests),    dot: "#7c3aed" },
    { label: "Available Rooms",  value: String(availableRooms),  dot: "#0d9488" },
  ];

  // Maintenance (Property) — from the report-issue feed
  const maintenanceIssues = ((reportsRes?.data as Record<string, unknown>[]) || []).map((r) => ({
    id: String(r.report_id ?? ""),
    haven: String(r.haven_name || "—"),
    type: String(r.issue_type || "General"),
    priority: String(r.priority_level || "low").toLowerCase(),
    issueStatus: String(r.status || "open").toLowerCase().replace(/\s+/g, "-"),
    reported: r.created_at ? new Date(String(r.created_at)).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—",
    assignedTo: String(r.assigned_to || "Unassigned"),
  }));

  // Internal Messages (Communication) — owner's conversation threads
  const internalMessages = ((conversationsRes?.data as unknown as Record<string, unknown>[]) || []).map((c, i) => ({
    id: (c.id as number | string) ?? i,
    sender: String(c.name || "Conversation"),
    role: String(c.role || "csr"),
    content: String(c.last_message || "No messages yet"),
    time: c.last_message_time ? new Date(String(c.last_message_time)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    unread: Number(c.unread_count ?? 0) > 0,
  }));

  // Reusable minimalist sub-tab bar — icon + label, hairline borders
  const tabBar = (tabs: { id: string; label: string; icon?: React.ElementType }[], active: string, onPick: (id: string) => void) => (
    <div className="flex gap-1.5 mb-6 flex-wrap">
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = active === t.id;
        return (
          <button key={t.id} type="button" onClick={() => onPick(t.id)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer"
            style={{ backgroundColor: on ? "#B07848" : "transparent", color: on ? "#ffffff" : "#8B6344", borderColor: on ? "#B07848" : "#EADFCB" }}>
            {Icon && <Icon className="w-4 h-4" style={{ opacity: on ? 1 : 0.75 }} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff", zoom: "1.1" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — always fixed; lg:translate-x-0 keeps it visible on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#2C1F14", borderRight: "1px solid #3a2510" }}
      >
        {/* Top accent */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #B07848, #D4A96A)" }} />

        {/* Logo */}
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: "#3a2510" }}>
          <Link href="/rooms" className="flex items-center gap-2.5">
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#f9fafb" }}>
              <Image src="/logo.png" alt="D'Lux Homes" width={80} height={28} className="mix-blend-multiply" style={{ width: "80px", height: "28px", objectFit: "cover" }} />
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-5 py-3 border-b" style={{ borderColor: "#3a2510" }}>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "#B0784820", color: "#D4A96A" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Owner Portal
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button
                key={item.label}
                onClick={() => { setActiveNav(item.label); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm"
                style={{
                  backgroundColor: isActive ? "#B0784816" : "transparent",
                  color: isActive ? "#E6CFA6" : "#A89080",
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#2f2114"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? "#D4A96A" : "#8C7660" }} />
                {item.label}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#D4A96A" }} />}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t" style={{ borderColor: "#3a2510" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#3a2510" }}>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-white text-xs font-bold" style={{ backgroundColor: "#B07848" }}>AO</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Admin Owner</p>
              <p className="text-xs truncate" style={{ color: "#6b5040" }}>owner@dluxhomes.com</p>
            </div>
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} aria-label="Sign out" className="cursor-pointer">
              <LogOut className="w-4 h-4 flex-shrink-0 transition-colors" style={{ color: "#6b5040" }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main — offset by sidebar width on desktop */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header
          className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl transition-colors"
              style={{ color: "#8B6344" }}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>{activeNav}</h1>
              <p className="text-xs" style={{ color: "#8B6344" }}>Welcome back, Admin Owner</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveNav("Communication"); setSidebarOpen(false); }}
              title="Messages & notifications"
              className="relative p-2 rounded-xl transition-colors"
              style={{ color: "#8B6344" }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold leading-none">3</span>
              </span>
            </button>
            <Avatar className="w-9 h-9 cursor-pointer">
              <AvatarFallback className="text-white text-xs font-bold" style={{ backgroundColor: "#B07848" }}>AO</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* ── Overview ── */}
          {activeNav === "Overview" && (<>
          {tabBar([{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "analytics", label: "Analytics & Reports", icon: BarChart3 }], overviewTab, (id) => setOverviewTab(id as "dashboard" | "analytics"))}
          {overviewTab === "analytics" && <AnalyticsSection />}
          {overviewTab === "dashboard" && (<>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border p-5 transition-shadow hover:shadow-md"
                  style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.iconBg }}>
                      <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: kpi.iconColor }} />
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: "#d1fae5" }}>
                      <ArrowUpRight className="w-3 h-3" style={{ color: "#059669" }} />
                      <span className="text-xs font-medium" style={{ color: "#059669" }}>{kpi.change}</span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{kpi.value}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>{kpi.label}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Revenue Chart */}
            <div
              className="xl:col-span-2 rounded-2xl border p-6"
              style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Revenue Overview</h3>
                  <p className="text-sm" style={{ color: "#8B6344" }}>Last 6 months</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ backgroundColor: "#F7F0E3", borderColor: "#EDE3D2" }}>
                  <BarChart3 className="w-4 h-4" style={{ color: "#B07848" }} />
                  <span className="font-semibold text-sm" style={{ color: "#B07848" }}>{peso(monthly.reduce((t, m) => t + (Number(m.revenue) || 0), 0))}</span>
                </div>
              </div>
              <div className="flex items-end gap-3 h-40">
                {revenueData.map((item) => (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center" style={{ height: "120px" }}>
                      <div
                        className="w-full rounded-t-lg transition-all cursor-pointer"
                        style={{
                          height: `${item.value}%`,
                          background: "linear-gradient(to top, #B07848, #D4A96A)",
                        }}
                        title={`${item.month}: ${item.value}%`}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: "#8B6344" }}>{item.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Snapshot */}
            <div
              className="rounded-2xl border p-6"
              style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}
            >
              <h3 className="font-bold mb-5" style={{ color: "#1a1a1a" }}>Today&apos;s Snapshot</h3>
              <div className="space-y-4">
                {snapshot.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.dot }} />
                      <span className="text-sm" style={{ color: "#5a4a3a" }}>{item.label}</span>
                    </div>
                    <span className="font-bold" style={{ color: "#1a1a1a" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#EDE3D2" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Recent Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{allAdminBookings.length} total records</p>
              </div>
              <button
                onClick={() => { setActiveNav("Bookings"); setSidebarOpen(false); }}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl border transition-colors"
                style={{ color: "#B07848", borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}
              >
                <Eye className="w-3.5 h-3.5" />
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Booking ID", "Guest", "Room", "Check-in", "Stay Type", "Amount", "Status", "Actions"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                          i === 2 ? "hidden sm:table-cell" : i === 3 ? "hidden lg:table-cell" : i === 4 ? "hidden md:table-cell" : ""
                        }`}
                        style={{ color: "#8B6344" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allAdminBookings.map((booking, idx) => {
                    const st = statusConfig[booking.status] || statusConfig.pending;
                    return (
                      <tr
                        key={booking.id}
                        className="transition-colors"
                        style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs" style={{ color: "#8B6344" }}>{booking.displayId}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f9fafb" }}>
                              <span className="text-xs font-bold" style={{ color: "#B07848" }}>
                                {booking.guest.split(" ").map((n) => n[0]).join("")}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{booking.guest}</p>
                              <p className="text-xs hidden sm:block" style={{ color: "#8B6344" }}>{booking.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          <p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.room}</p>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.checkIn}</p>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}
                          >
                            {booking.stayType}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{booking.amount.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: st.bg, color: st.color }}
                            >
                              {st.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setDetailModal({ title: booking.guest, subtitle: booking.displayId, rows: [
                                { label: "Email", value: booking.email || "—" },
                                { label: "Room", value: booking.room },
                                { label: "Check-in", value: booking.checkIn },
                                { label: "Stay", value: booking.stayType },
                                { label: "Amount", value: `₱${booking.amount.toLocaleString()}` },
                                { label: "Status", value: booking.status },
                              ] })}
                              title="View booking"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: "#8B6344" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"; (e.currentTarget as HTMLElement).style.color = "#B07848"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#8B6344"; }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {booking.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproveBooking(booking.id)}
                                  disabled={bookingUpdating}
                                  title="Approve booking"
                                  className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  style={{ color: "#6b7280" }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d1fae5"; (e.currentTarget as HTMLElement).style.color = "#059669"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectModal({ open: true, id: booking.id, reason: "" })}
                                  disabled={bookingUpdating}
                                  title="Reject booking"
                                  className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  style={{ color: "#6b7280" }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#fee2e2"; (e.currentTarget as HTMLElement).style.color = "#dc2626"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          </>)}
          </>)}

          {/* ── Bookings ── */}
          {activeNav === "Bookings" && (<>
          {tabBar([{ id: "list", label: "Reservations", icon: CalendarDays }, { id: "calendar", label: "Booking Calendar", icon: Calendar }, { id: "blocked", label: "Blocked Dates", icon: CalendarOff }], bookingsTab, (id) => setBookingsTab(id as "list" | "calendar" | "blocked"))}
          {bookingsTab === "calendar" && <BookingCalendarSection />}
          {bookingsTab === "blocked" && <BlockedDatesSection />}
          {bookingsTab === "list" && (
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#EDE3D2" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>All Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{allAdminBookings.length} total records</p>
              </div>
              <button onClick={() => setNewBookingOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> New Booking
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Booking ID","Guest","Room","Check-in","Stay Type","Amount","Status","Actions"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${i===2?"hidden sm:table-cell":i===3?"hidden lg:table-cell":i===4?"hidden md:table-cell":""}`} style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allAdminBookings.map((booking, idx) => {
                    const st = statusConfig[booking.status] || statusConfig.pending;
                    return (
                      <tr key={booking.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{booking.displayId}</span></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f9fafb" }}>
                              <span className="text-xs font-bold" style={{ color: "#B07848" }}>{booking.guest.split(" ").map((n)=>n[0]).join("")}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{booking.guest}</p>
                              <p className="text-xs hidden sm:block" style={{ color: "#8B6344" }}>{booking.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden sm:table-cell"><p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.room}</p></td>
                        <td className="px-4 py-3.5 hidden lg:table-cell"><p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.checkIn}</p></td>
                        <td className="px-4 py-3.5 hidden md:table-cell"><span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}>{booking.stayType}</span></td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{booking.amount.toLocaleString()}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button title="View booking"
                              onClick={() => setDetailModal({ title: booking.guest, subtitle: booking.displayId, rows: [
                                { label: "Email", value: booking.email || "—" },
                                { label: "Room", value: booking.room },
                                { label: "Check-in", value: booking.checkIn },
                                { label: "Stay", value: booking.stayType },
                                { label: "Amount", value: `₱${booking.amount.toLocaleString()}` },
                                { label: "Status", value: booking.status },
                              ] })}
                              className="p-1.5 rounded-lg transition-colors" style={{ color: "#8B6344" }}
                              onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3";}}
                              onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";}}><Eye className="w-3.5 h-3.5"/></button>
                            {booking.status === "pending" && (<>
                              <button type="button" onClick={() => handleApproveBooking(booking.id)} disabled={bookingUpdating} title="Approve booking" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><Check className="w-3.5 h-3.5"/></button>
                              <button type="button" onClick={() => setRejectModal({ open: true, id: booking.id, reason: "" })} disabled={bookingUpdating} title="Reject booking" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#fee2e2";(e.currentTarget as HTMLElement).style.color="#dc2626";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><XCircle className="w-3.5 h-3.5"/></button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
          </>)}

          {/* ── Finance ── */}
          {activeNav === "Finance" && (<>
          {tabBar([{ id: "revenue", label: "Revenue Management", icon: PhilippinePeso }, { id: "methods", label: "Payment Methods", icon: CreditCard }], financeTab, (id) => setFinanceTab(id as "revenue" | "methods"))}
          {financeTab === "methods" && <PaymentMethodsSection />}
          {financeTab === "revenue" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Revenue",  value: peso(Number(s?.total_revenue ?? 0)), sub: "Last 30 days", color: "#059669", bg: "#d1fae5" },
                { label: "This Month",     value: peso(monthly.length ? Number(monthly[monthly.length - 1].revenue) || 0 : 0), sub: new Date().toLocaleString("en", { month: "long", year: "numeric" }), color: "#B07848", bg: "#F7F0E3" },
                { label: "Pending Bookings", value: String(allAdminBookings.filter((b) => b.status === "pending").length), sub: "awaiting approval", color: "#ca8a04", bg: "#fef9c3" },
                { label: "Avg per Booking", value: peso(Number(s?.total_bookings) ? Math.round(Number(s?.total_revenue ?? 0) / Number(s?.total_bookings)) : 0), sub: `${Number(s?.total_bookings ?? 0)} bookings`, color: "#7c3aed", bg: "#ede9fe" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: item.bg }}>
                    <PhilippinePeso className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{item.value}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>{item.label}</p>
                  <p className="text-xs mt-1" style={{ color: "#D4BFA0" }}>{item.sub}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
              <h3 className="font-bold mb-6" style={{ color: "#1a1a1a" }}>Revenue Overview — Last 6 Months</h3>
              <div className="flex items-end gap-3 h-48">
                {revenueData.map((item) => (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: "#5a4a3a" }}>₱{Math.round(item.value * 12)}K</span>
                    <div className="w-full flex items-end justify-center" style={{ height: "140px" }}>
                      <div className="w-full rounded-t-lg cursor-pointer" style={{ height: `${item.value}%`, background: "linear-gradient(to top, #B07848, #D4A96A)" }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: "#8B6344" }}>{item.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}
          </>)}

          {/* ── Property ── */}
          {activeNav === "Property" && (<>
            {tabBar([{ id: "havens", label: "Haven Management", icon: Building2 }, { id: "maintenance", label: "Maintenance", icon: Wrench }, { id: "cleaning", label: "Cleaning Management", icon: Sparkles }], propertyTab, (id) => setPropertyTab(id as "havens" | "maintenance" | "cleaning"))}
            {propertyTab === "cleaning" && <CleaningManagementSection />}
            {propertyTab === "havens" && (
              <div className="flex justify-end mb-4">
                <button type="button" onClick={openHavenWizard} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                  <Plus className="w-4 h-4" /> Add Haven
                </button>
              </div>
            )}

            {propertyTab === "havens" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#EDE3D2" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                      {["Haven","Type","Location","Rate / night","Occupancy","Status","Actions"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {havens.map((h, idx) => (
                        <tr key={h.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{h.name}</p>
                            <p className="text-xs font-mono" style={{ color: "#D4BFA0" }}>{h.id}</p>
                          </td>
                          <td className="px-4 py-3.5"><span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}>{h.type}</span></td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-sm" style={{ color: "#5a4a3a" }}>
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D4BFA0" }} />{h.floor}
                            </div>
                          </td>
                          <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{h.rate.toLocaleString()}</span></td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#E0CEB8", minWidth: "60px" }}>
                                <div className="h-1.5 rounded-full" style={{ width: `${h.occupancy}%`, backgroundColor: "#B07848" }} />
                              </div>
                              <span className="text-xs font-medium" style={{ color: "#8B6344" }}>{h.occupancy}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                              style={{ backgroundColor: h.status === "available" ? "#d1fae5" : h.status === "occupied" ? "#F7F0E3" : "#fee2e2", color: h.status === "available" ? "#065f46" : h.status === "occupied" ? "#B07848" : "#991b1b" }}>
                              {h.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1">
                              <button title="View haven"
                                onClick={() => setDetailModal({ title: h.name, subtitle: h.id, rows: [
                                  { label: "Type", value: h.type },
                                  { label: "Location", value: h.floor },
                                  { label: "Rate", value: `₱${h.rate.toLocaleString()} / night` },
                                  { label: "Occupancy", value: `${h.occupancy}%` },
                                  { label: "Status", value: h.status },
                                ] })}
                                className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button title="Edit haven"
                                onClick={() => openHavenEdit(h.raw)}
                                className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {propertyTab === "maintenance" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#EDE3D2" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                      {["Issue ID","Haven","Type","Priority","Assigned To","Reported","Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {maintenanceIssues.map((issue, idx) => {
                        const pColor = issue.priority === "urgent" ? "#991b1b" : issue.priority === "high" ? "#92400e" : issue.priority === "medium" ? "#B07848" : "#065f46";
                        const pBg   = issue.priority === "urgent" ? "#fee2e2" : issue.priority === "high" ? "#fef3c7" : issue.priority === "medium" ? "#F7F0E3" : "#d1fae5";
                        const sColor = issue.issueStatus === "open" ? "#991b1b" : issue.issueStatus === "in-progress" ? "#B07848" : issue.issueStatus === "resolved" ? "#065f46" : "#374151";
                        const sBg   = issue.issueStatus === "open" ? "#fee2e2" : issue.issueStatus === "in-progress" ? "#F7F0E3" : issue.issueStatus === "resolved" ? "#d1fae5" : "#f3f4f6";
                        return (
                          <tr key={issue.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                            <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{issue.id}</span></td>
                            <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#1a1a1a" }}>{issue.haven}</span></td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" style={{ color: "#D4BFA0" }} /><span className="text-sm" style={{ color: "#5a4a3a" }}>{issue.type}</span></div>
                            </td>
                            <td className="px-4 py-3.5"><span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: pBg, color: pColor }}>{issue.priority}</span></td>
                            <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#5a4a3a" }}>{issue.assignedTo}</span></td>
                            <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{issue.reported}</span></td>
                            <td className="px-4 py-3.5"><span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: sBg, color: sColor }}>{issue.issueStatus.replace("-"," ")}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>)}

          {/* ── Communication ── */}
          {activeNav === "Communication" && (<>
            {tabBar([{ id: "guest", label: "Guest Assistance", icon: Headphones }, { id: "reviews", label: "Reviews & Feedback", icon: Star }, { id: "messages", label: "Internal Messages", icon: MessageSquare }], commTab, (id) => setCommTab(id as "reviews" | "messages" | "guest"))}
            {commTab === "guest" && <GuestAssistanceSection />}

            {commTab === "reviews" && (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F7F0E3" }}>
                          <span className="text-xs font-bold" style={{ color: "#B07848" }}>{r.guest.split(" ").map((n)=>n[0]).join("")}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{r.guest}</p>
                          <p className="text-xs" style={{ color: "#8B6344" }}>{r.haven}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><Star key={i} className="w-3.5 h-3.5" style={{ color: i < r.rating ? "#D4A96A" : "#E0CEB8" }} fill={i < r.rating ? "#D4A96A" : "none"} />)}</div>
                        <span className="text-xs" style={{ color: "#D4BFA0" }}>{r.date}</span>
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: "#5a4a3a" }}>{r.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {commTab === "messages" && (
              <div className="space-y-3">
                {internalMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-4 p-4 rounded-2xl border transition-colors cursor-pointer"
                    style={{ backgroundColor: msg.unread ? "#FDF8F3" : "#ffffff", borderColor: msg.unread ? "#D4BFA0" : "#E0CEB8" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = msg.unread ? "#FDF8F3" : "#ffffff"}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: msg.role === "csr" ? "#d1fae5" : "#F7F0E3" }}>
                      <span className="text-xs font-bold" style={{ color: msg.role === "csr" ? "#059669" : "#B07848" }}>{msg.sender.split(" ").map((n)=>n[0]).join("")}</span>
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
          </>)}

          {/* ── Team ── */}
          {activeNav === "Team" && (<>
            {tabBar([{ id: "staff", label: "Staff Management", icon: Users }, { id: "users", label: "User Management", icon: UsersRound }, { id: "partners", label: "Partner Management", icon: Handshake }], teamTab, (id) => setTeamTab(id as "staff" | "users" | "partners"))}
            {teamTab === "users" && <UserManagementSection />}
            {teamTab === "partners" && <PartnerManagementSection />}
            {teamTab === "staff" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Staff Management</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{staffMembers.length} staff members</p>
              </div>
              <button type="button" onClick={() => setStaffModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#EDE3D2" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Employee","Role","Contact","Joined","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {staffMembers.map((staff, idx) => (
                      <tr key={staff.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F7F0E3" }}>
                              <span className="text-xs font-bold" style={{ color: "#B07848" }}>{staff.name.split(" ").map((n)=>n[0]).join("")}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{staff.name}</p>
                              <p className="text-xs font-mono" style={{ color: "#D4BFA0" }}>{staff.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <UserCog className="w-3.5 h-3.5" style={{ color: "#D4BFA0" }} />
                            <span className="text-sm" style={{ color: "#5a4a3a" }}>{staff.role}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "#8B6344" }}><Mail className="w-3 h-3" />{staff.email}</div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#8B6344" }}><Phone className="w-3 h-3" />{staff.phone}</div>
                        </td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{staff.joined}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: staff.status === "active" ? "#d1fae5" : "#f3f4f6", color: staff.status === "active" ? "#065f46" : "#374151" }}>
                            {staff.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button title="View employee"
                              onClick={() => setDetailModal({ title: staff.name, subtitle: staff.id, rows: [
                                { label: "Role", value: staff.role },
                                { label: "Email", value: staff.email },
                                { label: "Phone", value: staff.phone },
                                { label: "Joined", value: staff.joined },
                                { label: "Status", value: staff.status === "active" ? "Active" : "Inactive" },
                              ] })}
                              className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button title="View activity logs"
                              onClick={() => { setActiveNav("System"); setSystemTab("logs"); setSidebarOpen(false); }}
                              className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}
          </>)}

          {/* ── System ── */}
          {activeNav === "System" && (<>
            {tabBar([{ id: "settings", label: "Settings", icon: Settings }, { id: "logs", label: "Audit Logs", icon: Shield }], systemTab, (id) => setSystemTab(id as "settings" | "logs"))}

            {systemTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Booking Rates &amp; Windows</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>
                    The live rates guests are charged. Weekend/holiday pricing applies on Fri, Sat, Sun &amp; PH holidays. Edit via Property → haven → Pricing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {stayRates.map((rate) => (
                    <div key={rate.name} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#F7F0E3" }}>
                        <CalendarDays className="w-5 h-5" style={{ color: "#B07848" }} />
                      </div>
                      <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{rate.name}</p>
                      <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: "#8B6344" }}>
                        <span>Check-in</span><span className="font-medium" style={{ color: "#5a4a3a" }}>{rate.window}</span>
                      </div>
                      <div className="mt-4 pt-3 space-y-2 text-sm border-t" style={{ borderColor: "#F7F0E3" }}>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#8B6344" }}>Weekday</span>
                          <span className="font-bold" style={{ color: "#1a1a1a" }}>{peso(rate.weekday)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#8B6344" }}>Weekend / Holiday</span>
                          <span className="font-bold" style={{ color: "#B07848" }}>{peso(rate.weekend)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {systemTab === "logs" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#EDE3D2" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                      {["Log ID","Actor","Action","Time","Type"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {auditLogs.map((log, idx) => {
                        const typeColor: Record<string,{color:string;bg:string}> = {
                          booking:     { color: "#B07848", bg: "#F7F0E3" },
                          property:    { color: "#0d9488", bg: "#ccfbf1" },
                          maintenance: { color: "#ea580c", bg: "#ffedd5" },
                          finance:     { color: "#059669", bg: "#d1fae5" },
                        };
                        const tc = typeColor[log.type] || typeColor.booking;
                        return (
                          <tr key={log.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                            <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#D4BFA0" }}>{log.id}</span></td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D4BFA0" }} />
                                <span className="text-sm font-medium" style={{ color: "#1a1a1a" }}>{log.actor}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#5a4a3a" }}>{log.action}</span></td>
                            <td className="px-4 py-3.5"><span className="text-xs" style={{ color: "#8B6344" }}>{log.time}</span></td>
                            <td className="px-4 py-3.5"><span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: tc.bg, color: tc.color }}>{log.type}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>)}

        </main>
      </div>

      {/* ── Reject Booking modal ── */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setRejectModal({ open: false, id: "", reason: "" })}>
          <div className="w-full max-w-md rounded-3xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Reject Booking</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Add a reason for the rejection. The guest will be notified.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((m) => ({ ...m, reason: e.target.value }))}
              placeholder="e.g. Payment proof could not be verified"
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setRejectModal({ open: false, id: "", reason: "" })} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#EDE3D2", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitRejectBooking} disabled={bookingUpdating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#dc2626" }}>{bookingUpdating ? "Rejecting…" : "Reject Booking"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Staff modal ── */}
      {staffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setStaffModalOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Staff Member</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Create a CSR or Cleaner account.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={staffForm.first_name} onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="Last name" value={staffForm.last_name} onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <input type="email" placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input type="password" placeholder="Temporary password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input placeholder="Phone (optional)" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#EDE3D2", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                <option value="CSR">CSR</option>
                <option value="Cleaner">Cleaner</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setStaffModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#EDE3D2", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitStaff} disabled={creatingStaff} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{creatingStaff ? "Creating…" : "Create Staff"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Haven wizard (9-step) */}
      <HavenWizard open={havenModalOpen} onClose={closeHavenWizard} createHaven={createHaven} updateHaven={updateHaven} editHaven={editHaven} />
      <NewBookingWizard open={newBookingOpen} onClose={() => setNewBookingOpen(false)} onCreated={refetchBookings} />

      {/* Reusable detail modal (booking / haven / employee views) */}
      {detailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setDetailModal(null)}>
          <div className="w-full max-w-md rounded-3xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#EDE3D2" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>{detailModal.title}</h3>
                {detailModal.subtitle && <p className="font-mono text-xs mt-0.5" style={{ color: "#8B6344" }}>{detailModal.subtitle}</p>}
              </div>
              <button type="button" onClick={() => setDetailModal(null)} title="Close" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2.5">
              {detailModal.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#FAFAF7" }}>
                  <span className="text-xs font-medium w-24 flex-shrink-0" style={{ color: "#8B6344" }}>{row.label}</span>
                  <span className="text-sm flex-1 text-right truncate capitalize" style={{ color: "#1a1a1a" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
