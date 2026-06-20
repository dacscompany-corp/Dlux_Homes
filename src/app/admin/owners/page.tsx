"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery, useGetRevenueByRoomQuery } from "@/redux/api/analyticsApi";
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
  Search,
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

// Normalize an RTK/fetch result to an array of rows, whether it arrives as a
// bare array, a { data: [...] } envelope, or undefined/error object.
function toRows(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  const d = (v as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
}

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
  const { data: roomRevRes }   = useGetRevenueByRoomQuery({ period: "30" });
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
  // Revenue by haven (Finance) + y-axis ticks for the bar chart
  const roomRev = ((roomRevRes as unknown as { data?: { room_name: string; revenue: number; bookings: number }[] })?.data) || [];
  const totalRoomRev = Math.max(1, roomRev.reduce((t, r) => t + (Number(r.revenue) || 0), 0));
  const revYticks = [1, 0.75, 0.5, 0.25, 0].map((f) => `₱${Math.round((maxRev * f) / 1000)}k`);

  // Backend statuses → UI statuses the design's statusConfig expects
  const normalizeBookingStatus = (st: string) =>
    st === "approved" ? "confirmed" : st === "completed" ? "checked-out" : st === "on-going" ? "checked-in" : st;

  // Bookings table (Overview + Bookings)
  const allAdminBookings = toRows(bookingsData).map((b) => ({
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
  const staffMembers = toRows(employeesRes).map((e) => ({
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
          toRows(j.data).map((l) => ({
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
  const maintenanceIssues = toRows(reportsRes).map((r) => ({
    id: String(r.report_id ?? ""),
    haven: String(r.haven_name || "—"),
    type: String(r.issue_type || "General"),
    priority: String(r.priority_level || "low").toLowerCase(),
    issueStatus: String(r.status || "open").toLowerCase().replace(/\s+/g, "-"),
    reported: r.created_at ? new Date(String(r.created_at)).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—",
    assignedTo: String(r.assigned_to || "Unassigned"),
  }));

  // Internal Messages (Communication) — owner's conversation threads
  const internalMessages = toRows(conversationsRes).map((c, i) => ({
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
            className="inline-flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
            style={{ backgroundColor: on ? "#1f1b16" : "transparent", color: on ? "#faf7f1" : "#6b6358", border: `1px solid ${on ? "#1f1b16" : "#d9d1c2"}`, fontWeight: on ? 500 : 400 }}>
            {Icon && <Icon className="w-4 h-4" style={{ opacity: on ? 1 : 0.7 }} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff", zoom: "1.1" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap');`}</style>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — always fixed; lg:translate-x-0 keeps it visible on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#1f1b16", borderRight: "1px solid rgba(250,247,241,0.1)" }}
      >

        {/* Logo */}
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
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
        <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
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
        <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(250,247,241,0.1)" }}>
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
          className="px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4", height: 72, fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          {/* left: hamburger + breadcrumb + title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg transition-colors"
              style={{ color: "#6b6358" }}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#8a8276" }}>
                <span>Overview</span>
                <span style={{ opacity: 0.5 }}>/</span>
                <span style={{ color: "#1f1b16" }}>{activeNav}</span>
              </div>
              <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", margin: 0, color: "#1f1b16" }}>{activeNav}</h1>
            </div>
          </div>

          {/* center: search */}
          <div className="hidden md:flex items-center gap-2.5" style={{ flex: "0 1 360px", padding: "9px 14px", background: "#faf7f1", border: "1px solid #ece5d4", color: "#8a8276" }}>
            <Search className="w-[15px] h-[15px]" />
            <span style={{ fontSize: 13, flex: 1 }}>Search bookings, guests, havens…</span>
            <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, padding: "2px 6px", background: "#fff", border: "1px solid #e8e1d2", color: "#6b6358" }}>⌘K</span>
          </div>

          {/* right: bell + account */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setActiveNav("Communication"); setSidebarOpen(false); }}
              title="Messages & notifications"
              className="relative p-2.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: "#6b6358" }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
            >
              <Bell className="w-[18px] h-[18px]" />
              <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, background: "#b8754a", borderRadius: "50%", border: "2px solid #fff" }} />
            </button>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-lg transition-colors cursor-pointer"
              style={{ padding: "6px 12px 6px 6px", background: "transparent", border: 0 }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
            >
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#b8754a", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 14 }}>A</span>
              <span className="flex flex-col items-start" style={{ lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: "#1f1b16" }}>Admin Owner</span>
                <span style={{ fontSize: 11, color: "#8a8276" }}>Owner</span>
              </span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* ── Overview ── */}
          {activeNav === "Overview" && (<>
          {tabBar([{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "analytics", label: "Analytics & Reports", icon: BarChart3 }], overviewTab, (id) => setOverviewTab(id as "dashboard" | "analytics"))}
          {overviewTab === "analytics" && <AnalyticsSection />}
          {overviewTab === "dashboard" && (<>

          {/* KPI Cards — flat bordered cells, mono numbers */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-6" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              const down = kpi.change.startsWith("-");
              const up = kpi.change.startsWith("+");
              const dc = down ? "#9a4a3a" : up ? "#5a7a4a" : "#8a8276";
              return (
                <div key={kpi.label} style={{ background: "#fff", padding: "18px 20px" }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                    <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} style={{ color: "#8a8276" }} />
                    <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: dc }}>{kpi.change}</span>
                  </div>
                  <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{kpi.value}</div>
                  <div style={{ fontSize: 12, color: "#8a8276", marginTop: 6 }}>{kpi.label}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Revenue Chart */}
            <div className="xl:col-span-2" style={{ background: "#fff", border: "1px solid #ece5d4" }}>
              <div className="flex items-end justify-between" style={{ padding: "22px 24px 0" }}>
                <div>
                  <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue overview</h3>
                  <p style={{ fontSize: 12, color: "#8a8276", margin: "8px 0 0" }}>Last 6 months</p>
                </div>
                <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", color: "#1f1b16" }}>{peso(monthly.reduce((t, m) => t + (Number(m.revenue) || 0), 0))}</div>
              </div>
              <div style={{ padding: "18px 24px 24px" }}>
                <div className="flex items-end gap-3" style={{ height: 160 }}>
                  {revenueData.map((item) => (
                    <div key={item.month} className="flex-1 flex flex-col items-center" style={{ gap: 8 }}>
                      <div className="w-full flex items-end justify-center" style={{ height: 120 }}>
                        <div style={{ width: "100%", height: `${item.value}%`, background: "#b8754a" }} title={`${item.month}: ${item.value}%`} />
                      </div>
                      <span style={{ fontSize: 11, color: "#8a8276" }}>{item.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Snapshot */}
            <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: "22px 24px" }}>
              <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>Today&apos;s snapshot</h3>
              <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 12px" }}>Live counts</p>
              <div className="flex flex-col">
                {snapshot.map((item) => (
                  <div key={item.label} className="flex items-center justify-between" style={{ padding: "13px 0", borderBottom: "1px solid #f3eee2" }}>
                    <div className="flex items-center" style={{ gap: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.dot, flex: "none" }} />
                      <span style={{ fontSize: 13.5, color: "#4a4034" }}>{item.label}</span>
                    </div>
                    <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 500, color: "#1f1b16" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
            <div className="flex items-center justify-between" style={{ padding: "18px 24px", borderBottom: "1px solid #ece5d4" }}>
              <div>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Recent bookings</h3>
                <p style={{ fontSize: 12, color: "#8a8276", margin: "7px 0 0" }}>{allAdminBookings.length} total records</p>
              </div>
              <button
                onClick={() => { setActiveNav("Bookings"); setSidebarOpen(false); }}
                className="inline-flex items-center transition-colors"
                style={{ gap: 8, padding: "9px 16px", background: "transparent", border: "1px solid #d9d1c2", fontSize: 13, color: "#1f1b16", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1f1b16"; (e.currentTarget as HTMLElement).style.background = "#f3eee2"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#d9d1c2"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span>View all</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#faf7f1" }}>
                    {["Booking ID", "Guest", "Room", "Check-in", "Stay Type", "Amount", "Status", "Actions"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-left text-xs uppercase ${
                          i === 2 ? "hidden sm:table-cell" : i === 3 ? "hidden lg:table-cell" : i === 4 ? "hidden md:table-cell" : ""
                        }`}
                        style={{ color: "#8a8276", letterSpacing: "0.08em", fontWeight: 400 }}
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
                        style={{ borderTop: idx > 0 ? "1px solid #f3eee2" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#faf7f1"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
                      >
                        <td className="px-4 py-3.5">
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>{booking.displayId}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f3eee2" }}>
                              <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 13, color: "#b8754a" }}>
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
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>₱{booking.amount.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center" style={{ gap: 7, fontSize: 12, color: st.dot }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flex: "none" }} />
                            {st.label}
                          </span>
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
          <div className="border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#ece5d4" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>All Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{allAdminBookings.length} total records</p>
              </div>
              <button onClick={() => setNewBookingOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                <Plus className="w-4 h-4" /> New Booking
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Booking ID","Guest","Room","Check-in","Stay Type","Amount","Status","Actions"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em] ${i===2?"hidden sm:table-cell":i===3?"hidden lg:table-cell":i===4?"hidden md:table-cell":""}`} style={{ color: "#8B6344" }}>{h}</th>
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
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f3eee2" }}>
                              <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 13, color: "#b8754a" }}>{booking.guest.split(" ").map((n)=>n[0]).join("")}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{booking.guest}</p>
                              <p className="text-xs hidden sm:block" style={{ color: "#8B6344" }}>{booking.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden sm:table-cell"><p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.room}</p></td>
                        <td className="px-4 py-3.5 hidden lg:table-cell"><p className="text-sm" style={{ color: "#5a4a3a" }}>{booking.checkIn}</p></td>
                        <td className="px-4 py-3.5 hidden md:table-cell"><span style={{ fontSize: 12, color: "#8a8276" }}>{booking.stayType}</span></td>
                        <td className="px-4 py-3.5"><span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16" }}>₱{booking.amount.toLocaleString()}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center" style={{ gap: 7, fontSize: 12, color: st.dot }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flex: "none" }} />
                            {st.label}
                          </span>
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
            {/* stat cells */}
            <div className="grid grid-cols-2 lg:grid-cols-4 mb-6" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
              {[
                { label: "Revenue · 30d", value: peso(Number(s?.total_revenue ?? 0)) },
                { label: "Bookings · 30d", value: String(s?.total_bookings ?? 0) },
                { label: "Occupancy", value: `${Math.round(Number(s?.occupancy_rate ?? 0))}%` },
                { label: "New guests", value: String(s?.new_guests ?? 0) },
              ].map((item) => (
                <div key={item.label} style={{ background: "#fff", padding: "20px 22px" }}>
                  <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: "#8a8276", marginTop: 8 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* revenue chart with y-axis */}
            <div className="mb-6" style={{ background: "#fff", border: "1px solid #ece5d4" }}>
              <div style={{ padding: "22px 24px 0" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue — last 6 months</h3>
              </div>
              <div style={{ padding: "18px 24px 24px" }}>
                {monthly.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#8a8276", margin: 0 }}>No revenue recorded yet.</p>
                ) : (
                  <div className="flex" style={{ gap: 14, height: 220 }}>
                    <div className="flex flex-col justify-between" style={{ paddingBottom: 22, fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 10, color: "#b8b1a6", textAlign: "right" }}>
                      {revYticks.map((y, i) => <span key={i}>{y}</span>)}
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 22 }}>
                        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 25}%`, height: 1, background: "#f3eee2" }} />)}
                      </div>
                      <div style={{ position: "relative", zIndex: 1, display: "flex", height: "100%" }}>
                        {monthly.map((m) => {
                          const label = /^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "short" }) : m.month;
                          return (
                            <div key={m.month} className="flex-1 flex flex-col items-center">
                              <div className="w-full flex items-end justify-center" style={{ flex: 1 }}>
                                <div title={`${label}: ${peso(Number(m.revenue) || 0)}`} style={{ width: "52%", height: `${Math.max(1, ((Number(m.revenue) || 0) / maxRev) * 100)}%`, background: "#b8754a" }} />
                              </div>
                              <div style={{ height: 22, display: "flex", alignItems: "center", fontSize: 11, color: "#8a8276" }}>{label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* revenue by haven */}
            <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #ece5d4" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue by haven</h3>
              </div>
              <div className="grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.4fr", gap: 16, padding: "12px 24px", background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8276" }}>
                <span>Haven</span><span style={{ textAlign: "right" }}>Bookings</span><span style={{ textAlign: "right" }}>Revenue</span><span>Share</span>
              </div>
              {roomRev.length === 0 ? (
                <div style={{ padding: "22px 24px", fontSize: 13, color: "#8a8276" }}>No room revenue yet.</div>
              ) : roomRev.map((r, i) => {
                const share = Math.round(((Number(r.revenue) || 0) / totalRoomRev) * 100);
                return (
                  <div key={i} className="grid items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.4fr", gap: 16, padding: "15px 24px", borderBottom: "1px solid #f3eee2", fontSize: 13.5 }}>
                    <span style={{ color: "#1f1b16" }}>{r.room_name}</span>
                    <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358", textAlign: "right" }}>{r.bookings}</span>
                    <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, color: "#1f1b16", textAlign: "right" }}>{peso(Number(r.revenue) || 0)}</span>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <div style={{ flex: 1, height: 4, background: "#f3eee2" }}><div style={{ width: `${share}%`, height: "100%", background: "#b8754a" }} /></div>
                      <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#8a8276", width: 32, textAlign: "right" }}>{share}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
          </>)}

          {/* ── Property ── */}
          {activeNav === "Property" && (<>
            {tabBar([{ id: "havens", label: "Haven Management", icon: Building2 }, { id: "maintenance", label: "Maintenance", icon: Wrench }, { id: "cleaning", label: "Cleaning Management", icon: Sparkles }], propertyTab, (id) => setPropertyTab(id as "havens" | "maintenance" | "cleaning"))}
            {propertyTab === "cleaning" && <CleaningManagementSection />}
            {propertyTab === "havens" && (
              <div className="flex justify-end mb-4">
                <button type="button" onClick={openHavenWizard} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                  <Plus className="w-4 h-4" /> Add Haven
                </button>
              </div>
            )}

            {propertyTab === "havens" && (
              <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                      {["Haven","Type","Location","Rate / night","Occupancy","Status","Actions"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
              <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                      {["Issue ID","Haven","Type","Priority","Assigned To","Reported","Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
              <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20 }}>
                {reviews.map((r) => (
                  <div key={r.id} style={{ background: "#fff", border: "1px solid #ece5d4", padding: "22px 24px" }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                      <div className="flex items-center" style={{ gap: 12 }}>
                        <span style={{ width: 38, height: 38, borderRadius: "50%", flex: "none", background: "#f3eee2", color: "#b8754a", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 17 }}>{r.guest.split(" ").map((n)=>n[0]).join("")}</span>
                        <div style={{ lineHeight: 1.3 }}>
                          <div style={{ fontSize: 14, color: "#1f1b16" }}>{r.guest}</div>
                          <div style={{ fontSize: 12, color: "#8a8276" }}>{r.haven}</div>
                        </div>
                      </div>
                      <div className="flex" style={{ gap: 2 }}>
                        {Array.from({length:5}).map((_,i)=><span key={i} style={{ color: i < r.rating ? "#d4a96a" : "#e0d6c4", fontSize: 14, lineHeight: 1 }}>★</span>)}
                      </div>
                    </div>
                    <p style={{ fontSize: 13.5, color: "#4a4034", lineHeight: 1.6, margin: "0 0 14px" }}>{r.comment}</p>
                    <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#b8b1a6" }}>{r.date}</div>
                  </div>
                ))}
              </div>
            )}

            {commTab === "messages" && (
              <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
                {internalMessages.map((msg) => {
                  const csr = msg.role === "csr";
                  return (
                    <div key={msg.id} className="flex items-center cursor-pointer" style={{ gap: 16, padding: "18px 24px", borderBottom: "1px solid #f3eee2" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#faf7f1"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", flex: "none", background: csr ? "rgba(47,157,107,0.14)" : "#f3eee2", color: csr ? "#2f7d56" : "#b8754a", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 17 }}>{msg.sender.split(" ").map((n)=>n[0]).join("")}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center" style={{ gap: 10 }}>
                          <span style={{ fontSize: 14, color: "#1f1b16" }}>{msg.sender}</span>
                          {msg.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#b8754a" }} />}
                        </div>
                        <div className="truncate" style={{ fontSize: 13, color: "#8a8276", marginTop: 3 }}>{msg.content}</div>
                      </div>
                      <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#b8b1a6", flex: "none" }}>{msg.time}</span>
                    </div>
                  );
                })}
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
              <button type="button" onClick={() => setStaffModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            </div>
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Employee","Role","Contact","Joined","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
                  <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, lineHeight: 1, color: "#1f1b16", margin: 0 }}>Booking rates &amp; windows</h2>
                  <p style={{ fontSize: 13, color: "#8a8276", margin: "10px 0 0", lineHeight: 1.55 }}>
                    The live rates guests are charged. Weekend/holiday pricing applies on Fri, Sat, Sun &amp; PH holidays. Edit via Property → haven → Pricing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
                  {stayRates.map((rate) => (
                    <div key={rate.name} style={{ background: "#fff", padding: "22px 24px" }}>
                      <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, color: "#1f1b16" }}>{rate.name}</div>
                      <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: "#8a8276", marginTop: 6 }}>
                        <span>Check-in</span><span style={{ color: "#4a4034" }}>{rate.window}</span>
                      </div>
                      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f3eee2", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 13, color: "#8a8276" }}>Weekday</span>
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 14, color: "#1f1b16" }}>{peso(rate.weekday)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 13, color: "#8a8276" }}>Weekend / Holiday</span>
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 14, color: "#b8754a" }}>{peso(rate.weekend)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {systemTab === "logs" && (
              <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                      {["Log ID","Actor","Action","Time","Type"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Reject Booking</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Add a reason for the rejection. The guest will be notified.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((m) => ({ ...m, reason: e.target.value }))}
              placeholder="e.g. Payment proof could not be verified"
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setRejectModal({ open: false, id: "", reason: "" })} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitRejectBooking} disabled={bookingUpdating} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#9a4a3a" }}>{bookingUpdating ? "Rejecting…" : "Reject Booking"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Staff modal ── */}
      {staffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setStaffModalOpen(false)}>
          <div className="w-full max-w-md border p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Add Staff Member</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Create a CSR or Cleaner account.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" value={staffForm.first_name} onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                <input placeholder="Last name" value={staffForm.last_name} onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <input type="email" placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input type="password" placeholder="Temporary password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <input placeholder="Phone (optional)" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                <option value="CSR">CSR</option>
                <option value="Cleaner">Cleaner</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setStaffModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitStaff} disabled={creatingStaff} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#1f1b16" }}>{creatingStaff ? "Creating…" : "Create Staff"}</button>
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
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
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
