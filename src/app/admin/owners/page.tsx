"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery, useUpdateBookingStatusMutation } from "@/redux/api/bookingsApi";
import { useGetHavensQuery, useCreateHavenMutation } from "@/redux/api/roomApi";
import { useGetEmployeesQuery, useCreateEmployeeMutation } from "@/redux/api/employeeApi";
import { useGetReviewsQuery } from "@/redux/api/reviewsApi";
import { useGetReportsQuery } from "@/redux/api/reportApi";
import { useGetConversationsQuery } from "@/redux/api/messagesApi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  DollarSign,
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
  ChevronRight,
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
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CalendarDays, label: "Bookings" },
  { icon: Building2, label: "Property" },
  { icon: DollarSign, label: "Finance" },
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
  const [propertyTab, setPropertyTab] = useState<"havens"|"maintenance">("havens");
  const [commTab, setCommTab]         = useState<"reviews"|"messages">("reviews");
  const [systemTab, setSystemTab]     = useState<"settings"|"logs">("settings");

  // ── Live data from the Supabase-backed API (RTK Query) ──
  const { data: summaryRes }   = useGetAnalyticsSummaryQuery({ period: "30" });
  const { data: monthlyRes }   = useGetMonthlyRevenueQuery({ months: "6" });
  const { data: bookingsData } = useGetBookingsQuery();
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
  const [createHaven, { isLoading: creatingHaven }] = useCreateHavenMutation();

  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string; reason: string }>({ open: false, id: "", reason: "" });

  const emptyStaff = { first_name: "", last_name: "", email: "", password: "", role: "CSR", phone: "" };
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState(emptyStaff);

  const emptyHaven = { haven_name: "", tower: "", floor: "", view_type: "", capacity: "", room_size: "", beds: "", description: "", ten_hour_rate: "", weekend_rate: "" };
  const [havenModalOpen, setHavenModalOpen] = useState(false);
  const [havenForm, setHavenForm] = useState(emptyHaven);

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
  const submitHaven = async () => {
    const f = havenForm;
    if (!f.haven_name || !f.tower || !f.floor || !f.view_type || !f.capacity || !f.room_size || !f.beds || !f.description) {
      toast.error("Please fill in all required haven fields");
      return;
    }
    if (!f.ten_hour_rate && !f.weekend_rate) {
      toast.error("Enter at least one rate");
      return;
    }
    try {
      await createHaven({
        haven_name: f.haven_name, tower: f.tower, floor: f.floor, view_type: f.view_type,
        capacity: Number(f.capacity), room_size: Number(f.room_size), beds: f.beds, description: f.description,
        ten_hour_rate: f.ten_hour_rate ? Number(f.ten_hour_rate) : undefined,
        weekend_rate: f.weekend_rate ? Number(f.weekend_rate) : undefined,
      }).unwrap();
      toast.success("Haven created");
      setHavenModalOpen(false);
      setHavenForm(emptyHaven);
    } catch { toast.error("Could not create haven"); }
  };

  const peso = (n: number) => "₱" + Number(n || 0).toLocaleString();
  const pct  = (n: number) => (n ? `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)}%` : "—");

  // KPI cards (Overview)
  const s = summaryRes?.data;
  const havensList = (havensData as Record<string, unknown>[]) || [];
  const reviewsList = (reviewsRes?.data as unknown as Record<string, unknown>[]) || [];
  const kpis = [
    { label: "Total Bookings", value: String(s?.total_bookings ?? 0),            change: pct(s?.bookings_change ?? 0),  icon: CalendarDays, iconBg: "#F7F0E3", iconColor: "#B07848" },
    { label: "Total Revenue",  value: peso(s?.total_revenue ?? 0),               change: pct(s?.revenue_change ?? 0),   icon: DollarSign,   iconBg: "#d1fae5", iconColor: "#059669" },
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

  // Booking Rates & Windows (System → Settings) — booking_time_categories
  const [bookingRates, setBookingRates] = useState<{ id: string; name: string; duration: number; price: number; window: string; days: string }[]>([]);
  useEffect(() => {
    let active = true;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    fetch("/api/admin/booking-settings")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (!active) return;
        setBookingRates(
          ((j.data as Record<string, unknown>[]) || []).map((r) => {
            let days: number[] = [];
            try {
              days = Array.isArray(r.available_days)
                ? (r.available_days as number[])
                : JSON.parse(String(r.available_days || "[]"));
            } catch { /* leave empty */ }
            return {
              id: String(r.id ?? ""),
              name: String(r.name ?? "Booking"),
              duration: Number(r.duration_hours ?? 0),
              price: Number(r.price ?? 0),
              window: `${String(r.first_check_in ?? "").slice(0, 5)}–${String(r.last_check_in ?? "").slice(0, 5)}`,
              days: days.length >= 7 ? "Every day" : days.map((d) => dayNames[d]).filter(Boolean).join(", ") || "—",
            };
          })
        );
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff" }}>
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium"
                style={{
                  backgroundColor: isActive ? "#B07848" : "transparent",
                  color: isActive ? "#1F160E" : "#A89080",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "#3a2510"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
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
          style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}
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

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border p-5 transition-shadow hover:shadow-md"
                  style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.iconBg }}>
                      <Icon className="w-5 h-5" style={{ color: kpi.iconColor }} />
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
              style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Revenue Overview</h3>
                  <p className="text-sm" style={{ color: "#8B6344" }}>Last 6 months</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ backgroundColor: "#F7F0E3", borderColor: "#E0CEB8" }}>
                  <BarChart3 className="w-4 h-4" style={{ color: "#B07848" }} />
                  <span className="font-semibold text-sm" style={{ color: "#B07848" }}>₱1.24M</span>
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
              style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}
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
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#E0CEB8" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Recent Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{allAdminBookings.length} total records</p>
              </div>
              <button
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

          {/* ── Bookings ── */}
          {activeNav === "Bookings" && (
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#E0CEB8" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>All Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{allAdminBookings.length} total records</p>
              </div>
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
                            <button className="p-1.5 rounded-lg transition-colors" style={{ color: "#8B6344" }}
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

          {/* ── Finance ── */}
          {activeNav === "Finance" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Revenue", value: "₱1,240,500", sub: "All time", color: "#059669", bg: "#d1fae5" },
                { label: "This Month",    value: "₱148,200",   sub: "March 2026", color: "#B07848", bg: "#F7F0E3" },
                { label: "Pending Payout",value: "₱34,500",    sub: "3 bookings", color: "#ca8a04", bg: "#fef9c3" },
                { label: "Avg per Booking",value:"₱5,002",     sub: "248 bookings",color:"#7c3aed",bg:"#ede9fe" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: item.bg }}>
                    <DollarSign className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{item.value}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>{item.label}</p>
                  <p className="text-xs mt-1" style={{ color: "#D4BFA0" }}>{item.sub}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
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

          {/* ── Property ── */}
          {activeNav === "Property" && (<>
            <div className="flex gap-2 mb-6">
              {(["havens","maintenance"] as const).map((tab) => (
                <button key={tab} onClick={() => setPropertyTab(tab)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all capitalize"
                  style={{ backgroundColor: propertyTab === tab ? "#B07848" : "#ffffff", color: propertyTab === tab ? "#ffffff" : "#8B6344", borderColor: propertyTab === tab ? "#B07848" : "#E0CEB8" }}>
                  {tab === "havens" ? "Haven Management" : "Maintenance"}
                </button>
              ))}
              <button type="button" onClick={() => setHavenModalOpen(true)} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> Add Haven
              </button>
            </div>

            {propertyTab === "havens" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
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
                            <button className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {propertyTab === "maintenance" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
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
            <div className="flex gap-2 mb-6">
              {(["reviews","messages"] as const).map((tab) => (
                <button key={tab} onClick={() => setCommTab(tab)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all capitalize"
                  style={{ backgroundColor: commTab === tab ? "#B07848" : "#ffffff", color: commTab === tab ? "#ffffff" : "#8B6344", borderColor: commTab === tab ? "#B07848" : "#E0CEB8" }}>
                  {tab === "reviews" ? "Reviews & Feedback" : "Internal Messages"}
                </button>
              ))}
            </div>

            {commTab === "reviews" && (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
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
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Staff Management</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{staffMembers.length} staff members</p>
              </div>
              <button type="button" onClick={() => setStaffModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
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
                            <button className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 rounded-lg" style={{ color: "#8B6344" }}
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

          {/* ── System ── */}
          {activeNav === "System" && (<>
            <div className="flex gap-2 mb-6">
              {(["settings","logs"] as const).map((tab) => (
                <button key={tab} onClick={() => setSystemTab(tab)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all capitalize"
                  style={{ backgroundColor: systemTab === tab ? "#B07848" : "#ffffff", color: systemTab === tab ? "#ffffff" : "#8B6344", borderColor: systemTab === tab ? "#B07848" : "#E0CEB8" }}>
                  {tab === "settings" ? "Settings" : "Audit Logs"}
                </button>
              ))}
            </div>

            {systemTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Booking Rates &amp; Windows</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>
                    {bookingRates.length} stay {bookingRates.length === 1 ? "type" : "types"} configured
                  </p>
                </div>

                {bookingRates.length === 0 ? (
                  <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
                    <p className="text-sm" style={{ color: "#8B6344" }}>No booking rates configured yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bookingRates.map((rate) => (
                      <div key={rate.id} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F7F0E3" }}>
                            <CalendarDays className="w-5 h-5" style={{ color: "#B07848" }} />
                          </div>
                          <span className="text-lg font-bold" style={{ color: "#B07848" }}>₱{rate.price.toLocaleString()}</span>
                        </div>
                        <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{rate.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{rate.duration}-hour stay</p>
                        <div className="mt-4 pt-3 space-y-2 text-xs border-t" style={{ borderColor: "#F7F0E3" }}>
                          <div className="flex items-center justify-between">
                            <span style={{ color: "#8B6344" }}>Check-in window</span>
                            <span className="font-medium" style={{ color: "#5a4a3a" }}>{rate.window}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span style={{ color: "#8B6344" }}>Available</span>
                            <span className="font-medium" style={{ color: "#5a4a3a" }}>{rate.days}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {systemTab === "logs" && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
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
          <div className="w-full max-w-md rounded-3xl border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Reject Booking</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Add a reason for the rejection. The guest will be notified.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((m) => ({ ...m, reason: e.target.value }))}
              placeholder="e.g. Payment proof could not be verified"
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setRejectModal({ open: false, id: "", reason: "" })} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#E0CEB8", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitRejectBooking} disabled={bookingUpdating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#dc2626" }}>{bookingUpdating ? "Rejecting…" : "Reject Booking"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Staff modal ── */}
      {staffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setStaffModalOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Staff Member</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Create a CSR or Cleaner account.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={staffForm.first_name} onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="Last name" value={staffForm.last_name} onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <input type="email" placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input type="password" placeholder="Temporary password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input placeholder="Phone (optional)" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                <option value="CSR">CSR</option>
                <option value="Cleaner">Cleaner</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setStaffModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#E0CEB8", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitStaff} disabled={creatingStaff} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{creatingStaff ? "Creating…" : "Create Staff"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Haven modal ── */}
      {havenModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setHavenModalOpen(false)}>
          <div className="w-full max-w-lg rounded-3xl border p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Haven</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Register a new unit. All fields except rates are required.</p>
            <div className="space-y-3">
              <input placeholder="Haven name" value={havenForm.haven_name} onChange={(e) => setHavenForm({ ...havenForm, haven_name: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Tower" value={havenForm.tower} onChange={(e) => setHavenForm({ ...havenForm, tower: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="Floor" value={havenForm.floor} onChange={(e) => setHavenForm({ ...havenForm, floor: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="View type (e.g. City View)" value={havenForm.view_type} onChange={(e) => setHavenForm({ ...havenForm, view_type: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="Beds (e.g. 1 Queen)" value={havenForm.beds} onChange={(e) => setHavenForm({ ...havenForm, beds: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input type="number" placeholder="Capacity (pax)" value={havenForm.capacity} onChange={(e) => setHavenForm({ ...havenForm, capacity: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input type="number" placeholder="Room size (sqm)" value={havenForm.room_size} onChange={(e) => setHavenForm({ ...havenForm, room_size: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <textarea placeholder="Description" rows={2} value={havenForm.description} onChange={(e) => setHavenForm({ ...havenForm, description: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="10-hour rate ₱" value={havenForm.ten_hour_rate} onChange={(e) => setHavenForm({ ...havenForm, ten_hour_rate: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input type="number" placeholder="Weekend rate ₱" value={havenForm.weekend_rate} onChange={(e) => setHavenForm({ ...havenForm, weekend_rate: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#E0CEB8", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setHavenModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#E0CEB8", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitHaven} disabled={creatingHaven} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{creatingHaven ? "Creating…" : "Create Haven"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
