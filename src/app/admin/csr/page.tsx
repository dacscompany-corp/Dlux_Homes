"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetBookingsQuery, useUpdateBookingStatusMutation } from "@/redux/api/bookingsApi";
import { useGetBookingPaymentsQuery, useUpdateBookingPaymentMutation } from "@/redux/api/bookingPaymentsApi";
import { useGetActivityLogsQuery } from "@/redux/api/activityLogApi";
import { useGetCleaningTasksQuery } from "@/redux/api/cleanersApi";
import { useGetNotificationsQuery } from "@/redux/api/notificationsApi";
import { useGetConversationsQuery } from "@/redux/api/messagesApi";
import { getDeposits, getDeliverables, getDiscounts } from "@/app/admin/csr/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, CalendarDays, MessageSquare, ClipboardList, Settings, Bell,
  Menu, X, LogOut, ChevronRight, Check, XCircle, Eye, UserCheck, UserMinus,
  Clock, Sun, Users, ChevronDown, CreditCard, Package, Tag, Truck, Wrench,
  BarChart2, Bell as BellIcon, User, Star, MapPin, Plus, FileText, AlertCircle,
  Mail, Phone, Shield, DollarSign, CheckCircle2,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: CalendarDays,    label: "Bookings" },
  { icon: CalendarDays,    label: "Calendar" },
  { icon: CreditCard,      label: "Payments" },
  { icon: Shield,          label: "Deposits" },
  { icon: Tag,             label: "Discounts" },
  { icon: Truck,           label: "Deliverables" },
  { icon: Wrench,          label: "Cleaners" },
  { icon: Package,         label: "Inventory" },
  { icon: MessageSquare,   label: "Messages" },
  { icon: BarChart2,       label: "Activity Logs" },
  { icon: BellIcon,        label: "Notifications" },
  { icon: Settings,        label: "Settings" },
  { icon: User,            label: "Profile" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:       { label: "Pending",     color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  confirmed:     { label: "Confirmed",   color: "#B07848", bg: "#F7F0E3", dot: "#B07848" },
  "checked-in":  { label: "Checked In", color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "checked-out": { label: "Checked Out",color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
  rejected:      { label: "Rejected",   color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
};

const calendarDays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const messages = [
  { id: 1, sender: "Maria Santos",   role: "guest",   content: "Hi! Can I request an early check-in at 11am?",           time: "10:32 AM", unread: true },
  { id: 2, sender: "Admin Owner",    role: "owner",   content: "Please prioritize the booking from BK-2024-009.",         time: "9:15 AM",  unread: true },
  { id: 3, sender: "Juan dela Cruz", role: "guest",   content: "Thank you for the smooth check-out. Will book again!",    time: "Yesterday", unread: false },
  { id: 4, sender: "Cleaner Staff",  role: "cleaner", content: "Azure Haven Suite is ready for the 2PM check-in.",         time: "Yesterday", unread: false },
];

const notifications = [
  { id: 1, title: "New Booking Submitted",    desc: "BK-2024-009 from Liza Gomez awaits approval.",      time: "5 min ago",  read: false, type: "booking" },
  { id: 2, title: "Payment Proof Uploaded",   desc: "Juan Cruz uploaded proof for BK-2024-002.",          time: "22 min ago", read: false, type: "payment" },
  { id: 3, title: "Cleaning Complete",        desc: "Ana Reyes completed Pearl Executive Room turnover.",  time: "1 hr ago",   read: true,  type: "cleaning" },
  { id: 4, title: "Issue Reported",           desc: "Plumbing issue reported in Azure Haven Suite.",       time: "3 hrs ago",  read: true,  type: "issue" },
];

export default function CSRDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Live bookings + status workflow ──
  const { data: session } = useSession();
  const { data: bookingsData } = useGetBookingsQuery();
  const [updateBookingStatus, { isLoading: bookingUpdating }] = useUpdateBookingStatusMutation();
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string; reason: string }>({ open: false, id: "", reason: "" });

  // Backend statuses → UI statuses the design expects
  const normalizeStatus = (s: string) =>
    s === "completed" ? "checked-out" : s === "approved" ? "confirmed" : s === "on-going" ? "checked-in" : s;

  const rawBookings = (bookingsData as unknown as Record<string, unknown>[]) || [];
  const bookings = rawBookings.map((b) => ({
    id: String(b.id || b.booking_id || ""),            // UUID — used by status mutations
    displayId: String(b.booking_id || b.id || ""),     // friendly BK-… id for display
    guest: `${b.guest_first_name ?? ""} ${b.guest_last_name ?? ""}`.trim() || "Guest",
    room: String(b.room_name ?? "—"),
    checkIn: b.check_in_date ? new Date(String(b.check_in_date)).toLocaleDateString() : "—",
    stayType: b.check_in_time && b.check_out_time ? `${b.check_in_time}–${b.check_out_time}` : "Stay",
    amount: Number(b.total_amount ?? b.down_payment ?? 0),
    status: normalizeStatus(String(b.status ?? "pending")),
    email: String(b.guest_email ?? ""),
    rawCheckIn: b.check_in_date,
    rawCheckOut: b.check_out_date,
  }));

  const setStatus = async (id: string, status: string, okMsg: string, rejection_reason?: string) => {
    try {
      await updateBookingStatus({ id, status, ...(rejection_reason ? { rejection_reason } : {}) }).unwrap();
      toast.success(okMsg);
    } catch { toast.error("Action failed. Please try again."); }
  };
  const approveBooking  = (id: string) => setStatus(id, "approved", "Booking approved");
  const rejectBooking   = (id: string) => setRejectModal({ open: true, id, reason: "" });
  const submitReject    = async () => {
    await setStatus(rejectModal.id, "rejected", "Booking rejected", rejectModal.reason.trim() || "Rejected by CSR");
    setRejectModal({ open: false, id: "", reason: "" });
  };
  const checkInBooking  = (id: string) => setStatus(id, "checked-in", "Guest checked in");
  const checkOutBooking = (id: string) => setStatus(id, "completed", "Guest checked out");

  const filteredBookings = bookings.filter((b) => filterStatus === "all" || b.status === filterStatus);

  const todayStr = new Date().toDateString();
  const sameDay = (d: unknown) => !!d && new Date(String(d)).toDateString() === todayStr;
  const stats = {
    todayCheckIns:  bookings.filter((b) => sameDay(b.rawCheckIn) && ["confirmed", "checked-in"].includes(b.status)).length,
    todayCheckOuts: bookings.filter((b) => sameDay(b.rawCheckOut) && ["checked-in", "checked-out"].includes(b.status)).length,
    pending: bookings.filter((b) => b.status === "pending").length,
    activeGuests: bookings.filter((b) => b.status === "checked-in").length,
  };

  // Activity Logs — live employee activity feed
  const { data: activityRes } = useGetActivityLogsQuery({});
  const activityLogs = (((activityRes as { data?: Record<string, unknown>[] } | undefined)?.data) || []).map((l, i) => ({
    id: String(l.id ?? i),
    action: String(l.description || l.activity_type || "Activity"),
    time: l.created_at ? new Date(String(l.created_at)).toLocaleString() : "",
    type: String(l.activity_type || "booking").toLowerCase(),
  }));

  // Inventory — live stock list
  const [inventory, setInventory] = useState<{ id: string; item: string; haven: string; qty: number; minQty: number; status: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/inventory")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (!active) return;
        setInventory(((j.data as Record<string, unknown>[]) || []).map((it) => {
          const qty = Number(it.current_stock ?? 0);
          const min = Number(it.minimum_stock ?? 0);
          return {
            id: String(it.item_id ?? ""),
            item: String(it.item_name ?? "Item"),
            haven: String(it.category ?? "—"),
            qty,
            minQty: min,
            status: qty <= 0 ? "out" : qty < min ? "low" : "ok",
          };
        }));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Payments — live payment submissions + verify/reject
  const { data: paymentsData } = useGetBookingPaymentsQuery();
  const [updateBookingPayment, { isLoading: paymentUpdating }] = useUpdateBookingPaymentMutation();
  const normalizePaymentStatus = (s: string) =>
    s.startsWith("approved") ? "verified" : s.startsWith("rejected") ? "rejected" : s.startsWith("pending") ? "pending" : s;
  const payments = ((paymentsData as unknown as Record<string, unknown>[]) || []).map((p) => ({
    id: String(p.id ?? ""),
    booking: String(p.booking_id ?? "—"),
    guest: `${p.guest_first_name ?? ""} ${p.guest_last_name ?? ""}`.trim() || "Guest",
    amount: Number(p.total_amount ?? p.down_payment ?? 0),
    method: String(p.payment_method ?? "—"),
    proof: p.payment_proof_url ? "View proof" : "—",
    proofUrl: String(p.payment_proof_url ?? ""),
    rawStatus: String(p.payment_status ?? ""),
    status: normalizePaymentStatus(String(p.payment_status ?? "pending")),
    date: p.created_at ? new Date(String(p.created_at)).toLocaleDateString() : "—",
  }));
  // The DB constraint requires approved_down_payment / approved_full_payment, not a bare "approved".
  const verifyPayment = async (id: string, rawStatus: string) => {
    const target = rawStatus.includes("full") ? "approved_full_payment" : "approved_down_payment";
    try { await updateBookingPayment({ id, payment_status: target }).unwrap(); toast.success("Payment verified"); }
    catch { toast.error("Could not verify payment"); }
  };
  const rejectPayment = async (id: string) => {
    try { await updateBookingPayment({ id, payment_status: "rejected" }).unwrap(); toast.success("Payment rejected"); }
    catch { toast.error("Could not reject payment"); }
  };

  // Deposits / Deliverables / Discounts — CSR server actions
  const [deposits, setDeposits] = useState<{ id: string; booking: string; guest: string; amount: number; status: string; released: string | null }[]>([]);
  const [deliverables, setDeliverables] = useState<{ id: string; booking: string; guest: string; item: string; status: string; date: string }[]>([]);
  const [discounts, setDiscounts] = useState<{ id: string; code: string; type: string; value: number; uses: number; limit: number; status: string; expires: string }[]>([]);
  useEffect(() => {
    let active = true;
    getDeposits().then((rows) => { if (active) setDeposits(rows.map((d) => ({ id: d.deposit_id || d.id, booking: d.booking_id, guest: d.guest, amount: Number(d.deposit_amount || 0), status: d.status, released: d.status === "returned" ? "Returned" : null }))); }).catch(() => {});
    getDeliverables().then((rows) => { if (active) setDeliverables(rows.map((d) => ({ id: d.deliverable_id || d.id, booking: d.booking_id, guest: d.guest, item: d.items?.length ? (d.items.length === 1 ? d.items[0].name : `${d.items.length} items`) : "—", status: d.overall_status, date: d.checkin_date }))); }).catch(() => {});
    getDiscounts().then((rows) => { if (active) setDiscounts(rows.map((d) => ({ id: d.id, code: d.discount_code, type: d.discount_type === "percentage" ? "percent" : "flat", value: Number(d.discount_value || 0), uses: Number(d.used_count || 0), limit: Number(d.max_uses || 0), status: d.active ? "active" : "inactive", expires: d.expires_at ? new Date(d.expires_at).toLocaleDateString() : "—" }))); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Notifications + Messages (live, session-scoped)
  const { data: notifRes } = useGetNotificationsQuery({});
  const notifications = (((notifRes as { data?: Record<string, unknown>[] } | undefined)?.data) || []).map((n, i) => ({
    id: (n.notification_id as string) ?? i,
    title: String(n.title || "Notification"),
    desc: String(n.message || ""),
    time: n.created_at ? new Date(String(n.created_at)).toLocaleString() : "",
    read: Boolean(n.is_read),
    type: String(n.notification_type || "booking"),
  }));
  const csrUserId = (session?.user as { id?: string } | undefined)?.id;
  const { data: convRes } = useGetConversationsQuery({ userId: csrUserId || "" }, { skip: !csrUserId });
  const messages = (((convRes as unknown as { data?: Record<string, unknown>[] } | undefined)?.data) || []).map((c, i) => ({
    id: (c.id as string | number) ?? i,
    sender: String(c.name || "Guest"),
    role: String(c.role || "guest"),
    content: String(c.last_message || "No messages yet"),
    time: c.last_message_time ? new Date(String(c.last_message_time)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    unread: Number(c.unread_count ?? 0) > 0,
  }));

  // Calendar — mark days with check-ins / check-outs this month from live bookings
  const calNow = new Date();
  const dayHasEvent = (day: number, field: string) =>
    rawBookings.some((b) => { const v = b[field]; if (!v) return false; const dt = new Date(String(v)); return dt.getDate() === day && dt.getMonth() === calNow.getMonth() && dt.getFullYear() === calNow.getFullYear(); });
  const calendarData = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, event: dayHasEvent(i + 1, "check_in_date") ? "check-in" : dayHasEvent(i + 1, "check_out_date") ? "check-out" : null }));

  // Cleaners — live cleaning tasks (from booking_cleaning)
  const { data: cleaningTasksData } = useGetCleaningTasksQuery();
  const cleanerAssignments = ((cleaningTasksData as unknown as Record<string, unknown>[]) || []).map((t) => ({
    id: String(t.cleaning_id ?? ""),
    cleaner: `${t.cleaner_first_name ?? ""} ${t.cleaner_last_name ?? ""}`.trim() || "Unassigned",
    haven: String(t.haven ?? "—"),
    time: t.check_in_time && t.check_out_time ? `${t.check_in_time}–${t.check_out_time}` : "—",
    status: String(t.cleaning_status ?? "pending"),
  }));

  const Placeholder = ({ label, icon: Icon }: { label: string; icon: React.ElementType }) => (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "#F7F0E3" }}>
        <Icon className="w-7 h-7" style={{ color: "#B07848" }} />
      </div>
      <h3 className="font-bold text-lg mb-1" style={{ color: "#1a1a1a" }}>{label}</h3>
      <p className="text-sm" style={{ color: "#8B6344" }}>This section is coming soon.</p>
    </div>
  );

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
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: "#3a2510" }}>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#10b98120", color: "#10b981" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            CSR Portal
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button
                key={item.label}
                onClick={() => { setActiveNav(item.label); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer"
                style={{ backgroundColor: isActive ? "#B07848" : "transparent", color: isActive ? "#1F160E" : "#A89080" }}
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
        <div className="px-3 py-4 border-t" style={{ borderColor: "#3a2510" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#3a2510" }}>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-white text-xs font-bold" style={{ backgroundColor: "#059669" }}>CS</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">CSR Staff</p>
              <p className="text-xs truncate" style={{ color: "#6b5040" }}>csr@dluxhomes.com</p>
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
              <p className="text-xs" style={{ color: "#8B6344" }}>Customer Service Representative</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border" style={{ backgroundColor: "#F7F0E3", borderColor: "#E0CEB8", color: "#5a4a3a" }}>
                <Clock className="w-3.5 h-3.5" style={{ color: "#B07848" }} />
                <span className="font-medium">10:09 AM</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border" style={{ backgroundColor: "#F7F0E3", borderColor: "#E0CEB8", color: "#5a4a3a" }}>
                <Sun className="w-3.5 h-3.5" style={{ color: "#D4A96A" }} />
                <span className="font-medium">29°C Sunny</span>
              </div>
            </div>
            <button className="relative p-2 rounded-xl cursor-pointer" style={{ color: "#8B6344" }}>
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold leading-none">{notifications.filter(n=>!n.read).length}</span>
              </span>
            </button>
            <Avatar className="w-9 h-9 cursor-pointer">
              <AvatarFallback className="text-white text-xs font-bold" style={{ backgroundColor: "#059669" }}>CS</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* ── Dashboard ── */}
          {activeNav === "Dashboard" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Today's Check-ins",  value: stats.todayCheckIns,  icon: UserCheck, iconBg: "#d1fae5", iconColor: "#059669" },
                { label: "Today's Check-outs", value: stats.todayCheckOuts, icon: UserMinus, iconBg: "#F7F0E3", iconColor: "#B07848" },
                { label: "Pending Bookings",   value: stats.pending,        icon: Clock,     iconBg: "#fef3c7", iconColor: "#d97706" },
                { label: "Active Guests",      value: stats.activeGuests,   icon: Users,     iconBg: "#ede9fe", iconColor: "#7c3aed" },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border p-5" style={{ backgroundColor: "#ffffff", borderColor: "#E0CEB8" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: card.iconBg }}>
                      <Icon className="w-5 h-5" style={{ color: card.iconColor }} />
                    </div>
                    <p className="text-3xl font-bold" style={{ color: "#1a1a1a" }}>{card.value}</p>
                    <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>{card.label}</p>
                  </div>
                );
              })}
            </div>
            {/* Recent bookings preview */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#E0CEB8" }}>
                <div>
                  <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Bookings Queue</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{bookings.filter(b=>b.status==="pending").length} pending action</p>
                </div>
                <button onClick={() => setActiveNav("Bookings")} className="text-sm font-medium cursor-pointer" style={{ color: "#B07848" }}>View All →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Booking","Guest","Amount","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bookings.slice(0,5).map((b, idx) => {
                      const st = statusConfig[b.status] || statusConfig.pending;
                      return (
                        <tr key={b.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                          <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{b.displayId}</span></td>
                          <td className="px-4 py-3.5"><p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{b.guest}</p></td>
                          <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{b.amount.toLocaleString()}</span></td>
                          <td className="px-4 py-3.5"><span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span></td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1">
                              {b.status === "pending" && (<>
                                <button onClick={() => approveBooking(b.id)} className="px-2 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>Approve</button>
                                <button onClick={() => rejectBooking(b.id)}  className="px-2 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}>Reject</button>
                              </>)}
                              {b.status === "confirmed" && (
                                <button onClick={() => checkInBooking(b.id)} className="px-2 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#F7F0E3", color: "#B07848", borderColor: "#D4BFA0" }}>Check In</button>
                              )}
                              {b.status === "checked-in" && (
                                <button onClick={() => checkOutBooking(b.id)} className="px-2 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#f3f4f6", color: "#374151", borderColor: "#d1d5db" }}>Check Out</button>
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
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "#E0CEB8" }}>
                <div>
                  <h3 className="font-bold" style={{ color: "#1a1a1a" }}>All Bookings</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{filteredBookings.length} records</p>
                </div>
                <div className="relative">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                    className="appearance-none text-sm rounded-xl px-3 py-2 pr-8 outline-none border cursor-pointer"
                    style={{ backgroundColor: "#F7F0E3", borderColor: "#D4BFA0", color: "#5a4a3a" }}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="checked-in">Checked In</option>
                    <option value="checked-out">Checked Out</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#8B6344" }} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Booking","Guest","Room","Check-in","Amount","Status","Actions"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${i===2?"hidden sm:table-cell":i===3?"hidden md:table-cell":""}`} style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredBookings.map((b, idx) => {
                      const st = statusConfig[b.status] || statusConfig.pending;
                      return (
                        <tr key={b.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                          <td className="px-4 py-4"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{b.displayId}</span></td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f9fafb" }}>
                                <span className="text-xs font-bold" style={{ color: "#B07848" }}>{b.guest.split(" ").map((n)=>n[0]).join("")}</span>
                              </div>
                              <div>
                                <p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{b.guest}</p>
                                <p className="text-xs" style={{ color: "#8B6344" }}>{b.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden sm:table-cell"><p className="text-sm max-w-36 truncate" style={{ color: "#5a4a3a" }}>{b.room}</p></td>
                          <td className="px-4 py-4 hidden md:table-cell"><p className="text-sm" style={{ color: "#5a4a3a" }}>{b.checkIn}</p></td>
                          <td className="px-4 py-4"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{b.amount.toLocaleString()}</span></td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.dot }} />
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";}}>
                                <Eye className="w-4 h-4" />
                              </button>
                              {b.status === "pending" && (<>
                                <button onClick={() => approveBooking(b.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}
                                  onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#a7f3d0"}
                                  onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5"}>
                                  <Check className="w-3 h-3" /> Approve
                                </button>
                                <button onClick={() => rejectBooking(b.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}
                                  onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#fecaca"}
                                  onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#fee2e2"}>
                                  <XCircle className="w-3 h-3" /> Reject
                                </button>
                              </>)}
                              {b.status === "confirmed" && (
                                <button onClick={() => checkInBooking(b.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#F7F0E3", color: "#B07848", borderColor: "#D4BFA0" }}
                                  onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#EDE0CE"}
                                  onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3"}>
                                  <UserCheck className="w-3 h-3" /> Check In
                                </button>
                              )}
                              {b.status === "checked-in" && (
                                <button onClick={() => checkOutBooking(b.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#f3f4f6", color: "#374151", borderColor: "#d1d5db" }}
                                  onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#e5e7eb"}
                                  onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#f3f4f6"}>
                                  <UserMinus className="w-3 h-3" /> Check Out
                                </button>
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
          )}

          {/* ── Calendar ── */}
          {activeNav === "Calendar" && (
            <div className="rounded-2xl border p-6" style={{ borderColor: "#E0CEB8" }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>April 2026</h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: "#10b981" }} />Check-in</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: "#B07848" }} />Check-out</div>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {calendarDays.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold py-2" style={{ color: "#8B6344" }}>{d}</div>
                ))}
              </div>
              {/* offset: April 1 = Wednesday = col 4 */}
              <div className="grid grid-cols-7 gap-1">
                {[...Array(3)].map((_,i) => <div key={`pad-${i}`} />)}
                {calendarData.map((cell) => (
                  <div key={cell.day}
                    className="aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium cursor-pointer transition-all"
                    style={{
                      backgroundColor: cell.day === 20 ? "#B07848" : cell.event ? (cell.event === "check-in" ? "#d1fae520" : "#F7F0E3") : "transparent",
                      color: cell.day === 20 ? "#ffffff" : "#1a1a1a",
                      border: cell.event ? `1px solid ${cell.event === "check-in" ? "#6ee7b7" : "#D4BFA0"}` : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (cell.day !== 20) (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"; }}
                    onMouseLeave={(e) => { if (cell.day !== 20) (e.currentTarget as HTMLElement).style.backgroundColor = cell.event ? (cell.event === "check-in" ? "#d1fae520" : "#F7F0E3") : "transparent"; }}>
                    {cell.day}
                    {cell.event && (
                      <span className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ backgroundColor: cell.event === "check-in" ? "#10b981" : "#B07848" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Payments ── */}
          {activeNav === "Payments" && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#E0CEB8" }}>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Payment Submissions</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{payments.filter(p=>p.status==="pending").length} awaiting verification</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Pay ID","Booking","Guest","Amount","Method","Proof Ref","Date","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {payments.map((p, idx) => (
                      <tr key={p.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{p.id}</span></td>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#D4BFA0" }}>{p.booking}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#1a1a1a" }}>{p.guest}</span></td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{p.amount.toLocaleString()}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#5a4a3a" }}>{p.method}</span></td>
                        <td className="px-4 py-3.5">{p.proofUrl ? (<a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs underline" style={{ color: "#B07848" }}>{p.proof}</a>) : (<span className="font-mono text-xs" style={{ color: "#8B6344" }}>{p.proof}</span>)}</td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{p.date}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ backgroundColor: p.status === "verified" ? "#d1fae5" : p.status === "pending" ? "#fef3c7" : "#fee2e2", color: p.status === "verified" ? "#065f46" : p.status === "pending" ? "#92400e" : "#991b1b" }}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {p.status === "pending" && (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => verifyPayment(p.id, p.rawStatus)} disabled={paymentUpdating} className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>Verify</button>
                              <button type="button" onClick={() => rejectPayment(p.id)} disabled={paymentUpdating} className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer disabled:opacity-50" style={{ backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}>Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Deposits ── */}
          {activeNav === "Deposits" && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#E0CEB8" }}>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Security Deposits</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{deposits.filter(d=>d.status==="held").length} currently held</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Deposit ID","Booking","Guest","Amount","Status","Released","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {deposits.map((d, idx) => (
                      <tr key={d.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{d.id}</span></td>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#D4BFA0" }}>{d.booking}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#1a1a1a" }}>{d.guest}</span></td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>₱{d.amount.toLocaleString()}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ backgroundColor: d.status === "held" ? "#fef3c7" : d.status === "released" ? "#d1fae5" : "#fee2e2", color: d.status === "held" ? "#92400e" : d.status === "released" ? "#065f46" : "#991b1b" }}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{d.released ?? "—"}</span></td>
                        <td className="px-4 py-3.5">
                          {d.status === "held" && (
                            <button className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>Release</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Discounts ── */}
          {activeNav === "Discounts" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Discount Codes</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{discounts.filter(d=>d.status==="active").length} active codes</p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> New Code
              </button>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Code","Type","Value","Usage","Expires","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {discounts.map((d, idx) => (
                      <tr key={d.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><span className="font-mono font-semibold text-sm" style={{ color: "#B07848" }}>{d.code}</span></td>
                        <td className="px-4 py-3.5"><span className="text-xs px-2.5 py-1 rounded-full capitalize" style={{ backgroundColor: "#F7F0E3", color: "#B07848" }}>{d.type}</span></td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{d.type === "percent" ? `${d.value}%` : `₱${d.value}`}</span></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm" style={{ color: "#5a4a3a" }}>{d.uses}/{d.limit}</span>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#E0CEB8", width: "48px" }}>
                              <div className="h-1.5 rounded-full" style={{ width: `${(d.uses/d.limit)*100}%`, backgroundColor: "#B07848" }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{d.expires}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ backgroundColor: d.status === "active" ? "#d1fae5" : "#f3f4f6", color: d.status === "active" ? "#065f46" : "#374151" }}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <button className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}
                            onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3"}
                            onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="transparent"}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}

          {/* ── Deliverables ── */}
          {activeNav === "Deliverables" && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#E0CEB8" }}>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Guest Deliverables</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{deliverables.filter(d=>d.status==="pending").length} pending</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["ID","Booking","Guest","Item","Date","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {deliverables.map((d, idx) => (
                      <tr key={d.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#8B6344" }}>{d.id}</span></td>
                        <td className="px-4 py-3.5"><span className="font-mono text-xs" style={{ color: "#D4BFA0" }}>{d.booking}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#1a1a1a" }}>{d.guest}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#5a4a3a" }}>{d.item}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{d.date}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ backgroundColor: d.status === "delivered" ? "#d1fae5" : d.status === "in-transit" ? "#F7F0E3" : "#fef3c7", color: d.status === "delivered" ? "#065f46" : d.status === "in-transit" ? "#B07848" : "#92400e" }}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {d.status !== "delivered" && (
                            <button className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>
                              <CheckCircle2 className="w-3 h-3 inline mr-1" />Mark Delivered
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Cleaners ── */}
          {activeNav === "Cleaners" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Cleaner Assignments</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>Today's schedule</p>
                </div>
              </div>
              {cleanerAssignments.map((ca) => (
                <div key={ca.id} className="rounded-2xl border p-5 flex items-center gap-4" style={{ borderColor: "#E0CEB8" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F7F0E3" }}>
                    <span className="text-sm font-bold" style={{ color: "#B07848" }}>{ca.cleaner.split(" ").map((n)=>n[0]).join("")}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{ca.cleaner}</p>
                    <p className="text-xs" style={{ color: "#8B6344" }}>{ca.haven}</p>
                    <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: "#D4BFA0" }}>
                      <Clock className="w-3 h-3" />{ca.time}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                    style={{ backgroundColor: ca.status === "completed" ? "#d1fae5" : ca.status === "in-progress" ? "#F7F0E3" : "#fef3c7", color: ca.status === "completed" ? "#065f46" : ca.status === "in-progress" ? "#B07848" : "#92400e" }}>
                    {ca.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Inventory ── */}
          {activeNav === "Inventory" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: "#1a1a1a" }}>Inventory</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{inventory.filter(i=>i.status !== "ok").length} items need restocking</p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: "#B07848" }}>
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#f9fafb" }}>
                    {["Item","Haven","Qty","Min Qty","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B6344" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {inventory.map((item, idx) => (
                      <tr key={item.id} className="transition-colors" style={{ borderTop: idx > 0 ? "1px solid #F7F0E3" : "none" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                        <td className="px-4 py-3.5"><p className="font-medium text-sm" style={{ color: "#1a1a1a" }}>{item.item}</p></td>
                        <td className="px-4 py-3.5"><span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "#F7F0E3", color: "#8B6344" }}>{item.haven}</span></td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-sm" style={{ color: item.qty === 0 ? "#dc2626" : "#1a1a1a" }}>{item.qty}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8B6344" }}>{item.minQty}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ backgroundColor: item.status === "ok" ? "#d1fae5" : item.status === "low" ? "#fef3c7" : "#fee2e2", color: item.status === "ok" ? "#065f46" : item.status === "low" ? "#92400e" : "#991b1b" }}>
                            {item.status === "out" ? "Out of Stock" : item.status === "low" ? "Low Stock" : "OK"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {item.status !== "ok" && (
                            <button className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#F7F0E3", color: "#B07848", borderColor: "#D4BFA0" }}>Restock</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}

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
                    style={{ backgroundColor: msg.role === "owner" ? "#F7F0E3" : msg.role === "cleaner" ? "#ccfbf1" : "#d1fae5" }}>
                    <span className="text-xs font-bold" style={{ color: msg.role === "owner" ? "#B07848" : msg.role === "cleaner" ? "#0d9488" : "#059669" }}>
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

          {/* ── Activity Logs ── */}
          {activeNav === "Activity Logs" && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E0CEB8" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#E0CEB8" }}>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>Activity Logs</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>All actions performed by CSR staff</p>
              </div>
              <div className="divide-y" style={{ borderColor: "#F7F0E3" }}>
                {activityLogs.map((log) => {
                  const typeColor: Record<string,{color:string;bg:string}> = {
                    booking:   { color: "#B07848", bg: "#F7F0E3" },
                    payment:   { color: "#059669", bg: "#d1fae5" },
                    "check-in": { color: "#065f46", bg: "#d1fae5" },
                    "check-out":{ color: "#374151", bg: "#f3f4f6" },
                    discount:  { color: "#7c3aed", bg: "#ede9fe" },
                  };
                  const tc = typeColor[log.type] || typeColor.booking;
                  return (
                    <div key={log.id} className="flex items-center gap-4 px-6 py-4 transition-colors"
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tc.bg }}>
                        <FileText className="w-4 h-4" style={{ color: tc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: "#1a1a1a" }}>{log.action}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{log.time}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0" style={{ backgroundColor: tc.bg, color: tc.color }}>{log.type}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeNav === "Notifications" && (
            <div className="space-y-3 max-w-2xl">
              <h2 className="font-bold text-lg mb-4" style={{ color: "#1a1a1a" }}>Notifications</h2>
              {notifications.map((n) => {
                const iconMap: Record<string,{ icon: React.ElementType; color: string; bg: string }> = {
                  booking:  { icon: CalendarDays, color: "#B07848", bg: "#F7F0E3" },
                  payment:  { icon: CreditCard,   color: "#059669", bg: "#d1fae5" },
                  cleaning: { icon: Wrench,        color: "#0d9488", bg: "#ccfbf1" },
                  issue:    { icon: AlertCircle,   color: "#ea580c", bg: "#ffedd5" },
                };
                const ic = iconMap[n.type] || iconMap.booking;
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

          {/* ── Settings ── */}
          {activeNav === "Settings" && (
            <div className="max-w-lg space-y-4">
              <h2 className="font-bold text-lg mb-6" style={{ color: "#1a1a1a" }}>Account Settings</h2>
              {[
                { label: "Email Notifications", desc: "Receive alerts for new bookings and status changes", enabled: true },
                { label: "Auto-approve Confirmed Payments", desc: "Automatically confirm bookings when payment is verified", enabled: false },
                { label: "Dark Mode", desc: "Switch to dark theme for lower eye strain", enabled: false },
              ].map((setting) => (
                <div key={setting.label} className="flex items-center justify-between p-5 rounded-2xl border" style={{ borderColor: "#E0CEB8" }}>
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{setting.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{setting.desc}</p>
                  </div>
                  <div className="w-11 h-6 rounded-full flex-shrink-0 relative cursor-pointer"
                    style={{ backgroundColor: setting.enabled ? "#B07848" : "#E0CEB8" }}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: setting.enabled ? "calc(100% - 20px)" : "4px" }} />
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
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: "#059669" }}>CS</div>
                  <div>
                    <p className="font-bold text-lg" style={{ color: "#1a1a1a" }}>CSR Staff</p>
                    <p className="text-sm" style={{ color: "#8B6344" }}>Customer Service Representative</p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: "#d1fae5", color: "#065f46" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />Active
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Mail,  label: "Email",  value: "csr@dluxhomes.com" },
                    { icon: Phone, label: "Phone",  value: "+63 912 345 6789" },
                    { icon: MapPin,label: "Office", value: "Mother Ignacia Ave, Diliman, QC" },
                    { icon: Shield,label: "Role",   value: "CSR — Customer Service Representative" },
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
              <button className="w-full py-3 rounded-2xl text-sm font-semibold border cursor-pointer transition-colors" style={{ color: "#B07848", borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#EDE0CE"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}>
                Edit Profile
              </button>
            </div>
          )}

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
              <button type="button" onClick={submitReject} disabled={bookingUpdating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#dc2626" }}>{bookingUpdating ? "Rejecting…" : "Reject Booking"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
