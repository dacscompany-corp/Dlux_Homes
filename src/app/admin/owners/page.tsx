"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery, useGetRevenueByRoomQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery, useUpdateBookingStatusMutation } from "@/redux/api/bookingsApi";
import { updateDepositStatusByBookingId, approveDownPaymentByBookingId } from "@/app/admin/csr/actions";
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
  LogIn,
  BadgeCheck,
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

const SECURITY_DEPOSIT = 1000; // refundable, collected at check-in

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:      { label: "Pending",     color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  "awaiting-payment": { label: "Awaiting Payment", color: "#9a3412", bg: "#ffedd5", dot: "#f97316" },
  "down-paid":  { label: "Down Paid",   color: "#3730a3", bg: "#e0e7ff", dot: "#6366f1" },
  confirmed:    { label: "Confirmed",   color: "#B07848", bg: "#F7F0E3", dot: "#B07848" },
  "checked-in": { label: "Checked In", color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "checked-out":{ label: "Checked Out",color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
  rejected:     { label: "Rejected",   color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
  expired:      { label: "Expired",    color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
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
  type AdminBookingRow = {
    id: string; displayId: string; guest: string; room: string;
    checkIn: string; stayType: string; amount: number; status: string; email: string;
    checkOut: string; phone: string; roomRate: number; addOns: number;
    downPayment: number; balance: number; paymentMethod: string; paymentStatus: string;
    deposit: number; depositStatus: string; depositMethod: string;
    validIdUrl: string; paymentProofUrl: string; paymentReference: string;
    checkInRaw: string; checkOutRaw: string; checkInTime: string; checkOutTime: string;
  };
  const [bookingModal, setBookingModal] = useState<AdminBookingRow | null>(null);
  const [refCopied, setRefCopied] = useState(false);
  const copyRef = (ref: string) => { try { navigator.clipboard?.writeText(ref); } catch { /* ignore */ } setRefCopied(true); setTimeout(() => setRefCopied(false), 1500); };
  type AdminHaven = {
    id: string; name: string; type: string; floor: string;
    rate: number; status: string; occupancy: number;
    raw: Record<string, unknown>;
  };
  const [havenModal, setHavenModal] = useState<AdminHaven | null>(null);
  // Generic detail modal, still used by the Staff (Team) view.
  const [detailModal, setDetailModal] = useState<{ title: string; subtitle?: string; rows: { label: string; value: string }[] } | null>(null);

  // ── Command-palette search (⌘K / Ctrl+K) ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleApproveBooking = async (id: string) => {
    try { await updateBookingStatus({ id, status: "approved" }).unwrap(); toast.success("Booking approved"); }
    catch { toast.error("Could not approve booking"); }
  };
  // Approve the down payment → moves an "Awaiting Payment" booking to Confirmed.
  // Two steps (same as CSR): approveDownPayment flips status to "on-going" and
  // marks the payment approved, then setting status back to "approved" with the
  // payment already approved normalizes to "confirmed" (ready to check in).
  const handleConfirmPayment = async (id: string) => {
    try {
      await approveDownPaymentByBookingId(id);
      await updateBookingStatus({ id, status: "approved" }).unwrap();
      toast.success("Down payment approved — booking confirmed");
      refetchBookings();
    } catch { toast.error("Could not confirm the down payment"); }
  };
  const submitRejectBooking = async () => {
    try {
      await updateBookingStatus({ id: rejectModal.id, status: "rejected", rejection_reason: rejectModal.reason.trim() || "Rejected by admin" }).unwrap();
      toast.success("Booking rejected");
      setRejectModal({ open: false, id: "", reason: "" });
    } catch { toast.error("Could not reject booking"); }
  };

  // Check-in collects the remaining 50% balance + ₱1,000 refundable deposit, then
  // flips the booking to checked-in (settles the balance on booking_payments and
  // records the deposit as held). Mirrors the CSR check-in flow.
  const [checkIn, setCheckIn] = useState<{ open: boolean; id: string; displayId: string; guest: string; remaining: number; method: string; busy: boolean }>(
    { open: false, id: "", displayId: "", guest: "", remaining: 0, method: "Cash", busy: false }
  );
  const openCheckIn = (b: { id: string; displayId: string; guest: string; remaining: number }) =>
    setCheckIn({ open: true, id: b.id, displayId: b.displayId, guest: b.guest, remaining: Math.max(0, b.remaining), method: "Cash", busy: false });
  const confirmCheckIn = async () => {
    setCheckIn((c) => ({ ...c, busy: true }));
    try {
      const collected = checkIn.remaining + SECURITY_DEPOSIT;
      await updateDepositStatusByBookingId(checkIn.id, "Paid", undefined, undefined, collected, checkIn.method, "owner");
      await updateBookingStatus({ id: checkIn.id, status: "checked-in" }).unwrap();
      toast.success("Checked in — balance & deposit collected");
      setCheckIn({ open: false, id: "", displayId: "", guest: "", remaining: 0, method: "Cash", busy: false });
      refetchBookings();
    } catch {
      toast.error("Could not complete check-in");
      setCheckIn((c) => ({ ...c, busy: false }));
    }
  };
  // Check out → completes the booking (keeps the record + unlocks guest review).
  const handleCheckOut = async (id: string) => {
    try { await updateBookingStatus({ id, status: "completed" }).unwrap(); toast.success("Guest checked out — booking completed"); refetchBookings(); }
    catch { toast.error("Could not check out the guest"); }
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

  // Backend statuses → UI statuses the design's statusConfig expects.
  // "on-going" = down payment approved, awaiting final approval — NOT checked in.
  // "approved" is only "confirmed" once the down payment is approved; until then
  // it's "awaiting-payment" (host pre-approved, guest hasn't paid yet).
  const normalizeBookingStatus = (st: string, ps = "") =>
    st === "completed" ? "checked-out"
      : st === "on-going" ? "down-paid"
      : st === "approved" ? (ps.startsWith("approved") ? "confirmed" : "awaiting-payment")
      : st;

  // Local today as YYYY-MM-DD (DATE columns come back as plain date strings).
  const nowD = new Date();
  const todayISO = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  // A still-unpaid booking whose check-in date has passed is treated as expired.
  const deriveStatus = (rawStatus: string, ps: string, checkInISO: string) => {
    const normalized = normalizeBookingStatus(rawStatus, ps);
    const unpaid = normalized === "pending" || normalized === "awaiting-payment";
    return unpaid && checkInISO && checkInISO < todayISO ? "expired" : normalized;
  };

  // Bookings table (Overview + Bookings)
  const allAdminBookings = toRows(bookingsData).map((b) => ({
    id: String(b.id || b.booking_id || ""),            // UUID — used by status mutations
    displayId: String(b.booking_id || b.id || ""),     // friendly BK-… id for display
    guest: `${b.guest_first_name ?? ""} ${b.guest_last_name ?? ""}`.trim() || "Guest",
    room: String(b.room_name ?? "—"),
    checkIn: b.check_in_date ? new Date(String(b.check_in_date)).toLocaleDateString() : "—",
    stayType: b.check_in_time && b.check_out_time ? `${b.check_in_time}–${b.check_out_time}` : "Stay",
    amount: Number(b.total_amount ?? b.down_payment ?? 0),
    status: deriveStatus(String(b.status ?? "pending"), String(b.payment_status ?? ""), b.check_in_date ? String(b.check_in_date).slice(0, 10) : ""),
    email: String(b.guest_email ?? ""),
    checkOut: b.check_out_date ? new Date(String(b.check_out_date)).toLocaleDateString() : "—",
    phone: String(b.guest_phone ?? ""),
    roomRate: Number(b.room_rate ?? 0),
    addOns: Number(b.add_ons_total ?? 0),
    downPayment: Number(b.down_payment ?? 0),
    balance: Number(b.remaining_balance ?? 0),
    paymentMethod: String(b.payment_method ?? ""),
    paymentStatus: String(b.payment_status ?? ""),
    deposit: Number(b.security_deposit ?? 0),
    depositStatus: String(b.deposit_status ?? ""),
    depositMethod: String(b.security_deposit_payment_method ?? ""),
    validIdUrl: String(b.valid_id_url ?? ""),
    paymentProofUrl: String(b.payment_proof_url ?? ""),
    paymentReference: String(b.payment_reference ?? ""),
    checkInRaw: b.check_in_date ? String(b.check_in_date) : "",
    checkOutRaw: b.check_out_date ? String(b.check_out_date) : "",
    checkInTime: String(b.check_in_time ?? ""),
    checkOutTime: String(b.check_out_time ?? ""),
  }));

  // ── Helpers for the redesigned booking detail modal ──
  // (peso formatter is defined above.)
  const dash = (v: string) => (v && v.trim() ? v : "—");
  const fmtDate = (raw: string) =>
    raw ? new Date(raw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const fmtTime = (t: string) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hr = parseInt(h, 10);
    if (Number.isNaN(hr)) return t;
    const ap = hr >= 12 ? "PM" : "AM";
    const h12 = hr % 12 || 12;
    return `${h12}:${m ?? "00"} ${ap}`;
  };
  const nightsBetween = (a: string, b: string) => {
    if (!a || !b) return 0;
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : 0;
  };
  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "G";
  // Status → pill colors, shared by the header status + section pills.
  // Turn a raw status enum into a clean, human label.
  const prettyStatus = (raw: string) => {
    const map: Record<string, string> = {
      approved_down_payment: "Approved",
      pending_down_payment: "Awaiting payment",
      pending_verification: "Verifying",
      pending: "Pending",
      paid: "Paid",
      held: "Held",
      returned: "Returned",
      refunded: "Refunded",
      partial: "Partial",
      forfeited: "Forfeited",
    };
    const key = (raw || "").toLowerCase();
    if (map[key]) return map[key];
    return raw ? raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Pending";
  };
  const statusPill = (raw: string): { bg: string; color: string; dot: string; label: string } => {
    const s = (raw || "").toLowerCase();
    const label = prettyStatus(raw);
    // Negative states first — "inactive" contains "active" as a substring.
    if (s.includes("reject") || s.includes("cancel") || s.includes("inactive") || s.includes("suspend") || s.includes("disable") || s.includes("forfeit")) return { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444", label };
    if (s.includes("confirm") || s.includes("approv") || s.includes("active") || s.includes("available") || s.includes("paid") || s.includes("held") || s.includes("return")) return { bg: "#d1fae5", color: "#065f46", dot: "#10b981", label };
    if (s.includes("checked-in") || s === "on-going") return { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label };
    if (s.includes("checked-out") || s.includes("complete")) return { bg: "#f3f0ea", color: "#6f5c44", dot: "#b0a187", label };
    return { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b", label };
  };

  // Haven table (Property)
  const havens = havensList.map((h) => ({
    id: String(h.uuid_id || h.id || ""),
    name: String(h.haven_name || h.name || "Haven"),
    type: String(h.haven_type || h.type || "Unit"),
    floor: [h.tower, h.floor].filter(Boolean).join(", ") || String(h.location || "—"),
    rate: Number(h.price_per_night ?? h.price ?? h.rate ?? h.weekday_rate ?? h.ten_hour_rate ?? 0),
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
  // Exclude past-dated (expired) pendings — they're no longer actionable.
  const pendingApproval = rawBookings.filter((b) => String(b.status) === "pending" && (!b.check_in_date || String(b.check_in_date).slice(0, 10) >= todayISO)).length;
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
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden" style={{ color: "#6b5040" }}>
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
              aria-label="Open menu"
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
          <button type="button" onClick={() => setSearchOpen(true)} className="hidden md:flex items-center gap-2.5 cursor-pointer text-left" style={{ flex: "0 1 360px", padding: "9px 14px", background: "#faf7f1", border: "1px solid #ece5d4", color: "#8a8276" }}>
            <Search className="w-[15px] h-[15px]" />
            <span style={{ fontSize: 13, flex: 1 }}>Search bookings, guests, havens…</span>
            <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, padding: "2px 6px", background: "#fff", border: "1px solid #e8e1d2", color: "#6b6358" }}>⌘K</span>
          </button>

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
                              onClick={() => setBookingModal(booking)}
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
                            {booking.status === "awaiting-payment" && (
                              <button
                                type="button"
                                onClick={() => handleConfirmPayment(booking.id)}
                                disabled={bookingUpdating}
                                title="Confirm down payment (mark paid → Confirmed)"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                style={{ color: "#6b7280" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d1fae5"; (e.currentTarget as HTMLElement).style.color = "#059669"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                              >
                                <BadgeCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(booking.status === "confirmed" || booking.status === "down-paid") && (
                              <button
                                type="button"
                                onClick={() => openCheckIn({ id: booking.id, displayId: booking.displayId, guest: booking.guest, remaining: booking.balance })}
                                disabled={bookingUpdating}
                                title="Check in (collect balance + deposit)"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                style={{ color: "#6b7280" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d1fae5"; (e.currentTarget as HTMLElement).style.color = "#059669"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                              >
                                <LogIn className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {booking.status === "checked-in" && (
                              <button
                                type="button"
                                onClick={() => handleCheckOut(booking.id)}
                                disabled={bookingUpdating}
                                title="Check out (complete booking)"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                style={{ color: "#6b7280" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#f3f4f6"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                              >
                                <LogOut className="w-3.5 h-3.5" />
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
                              onClick={() => setBookingModal(booking)}
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
                            {booking.status === "awaiting-payment" && (
                              <button type="button" onClick={() => handleConfirmPayment(booking.id)} disabled={bookingUpdating} title="Confirm down payment (mark paid → Confirmed)" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><BadgeCheck className="w-3.5 h-3.5"/></button>
                            )}
                            {(booking.status === "confirmed" || booking.status === "down-paid") && (
                              <button type="button" onClick={() => openCheckIn({ id: booking.id, displayId: booking.displayId, guest: booking.guest, remaining: booking.balance })} disabled={bookingUpdating} title="Check in (collect balance + deposit)" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><LogIn className="w-3.5 h-3.5"/></button>
                            )}
                            {booking.status === "checked-in" && (
                              <button type="button" onClick={() => handleCheckOut(booking.id)} disabled={bookingUpdating} title="Check out (complete booking)" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#f3f4f6";(e.currentTarget as HTMLElement).style.color="#374151";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><LogOut className="w-3.5 h-3.5"/></button>
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
                                onClick={() => setHavenModal(h)}
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

      {/* ── Check-in: collect remaining balance + ₱1,000 deposit ── */}
      {checkIn.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => !checkIn.busy && setCheckIn((c) => ({ ...c, open: false }))}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Check In Guest</h3>
            <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Collect the remaining balance and refundable deposit.</p>

            <div className="border p-4 mt-4 mb-4" style={{ backgroundColor: "#FAFAF7", borderColor: "#ece5d4" }}>
              <div className="flex items-center justify-between text-sm"><span style={{ color: "#8B6344" }}>Booking</span><span className="font-mono text-xs" style={{ color: "#1a1a1a" }}>{checkIn.displayId}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Guest</span><span style={{ color: "#1a1a1a" }}>{checkIn.guest}</span></div>
              <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t" style={{ borderColor: "#ece5d4" }}><span style={{ color: "#8B6344" }}>Remaining balance</span><span style={{ color: "#1a1a1a" }}>₱{checkIn.remaining.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Security deposit (refundable)</span><span style={{ color: "#1a1a1a" }}>₱{SECURITY_DEPOSIT.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t font-bold" style={{ borderColor: "#ece5d4" }}><span style={{ color: "#1a1a1a" }}>Total to collect</span><span style={{ color: "#B07848" }}>₱{(checkIn.remaining + SECURITY_DEPOSIT).toLocaleString()}</span></div>
            </div>

            <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Payment method</label>
            <select aria-label="Payment method" value={checkIn.method} onChange={(e) => setCheckIn((c) => ({ ...c, method: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none cursor-pointer" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Bank">BPI bank transfer</option>
            </select>

            <p className="text-xs mt-3 leading-relaxed" style={{ color: "#8B6344" }}>The ₱{SECURITY_DEPOSIT.toLocaleString()} deposit is refundable on checkout. Confirming marks the balance fully paid and checks the guest in.</p>

            <div className="flex justify-between gap-2 mt-5">
              <button type="button" onClick={() => setCheckIn((c) => ({ ...c, open: false }))} disabled={checkIn.busy} className="px-4 py-2 text-sm font-medium border cursor-pointer disabled:opacity-60" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={confirmCheckIn} disabled={checkIn.busy} className="px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{checkIn.busy ? "Checking in…" : `Collect ₱${(checkIn.remaining + SECURITY_DEPOSIT).toLocaleString()} & Check In`}</button>
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
              <select aria-label="Staff role" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
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

      {/* Command-palette search (⌘K) — bookings, guests, havens */}
      {searchOpen && (() => {
        const q = searchQuery.trim().toLowerCase();
        const bookingHits = q
          ? allAdminBookings.filter((b) =>
              [b.displayId, b.guest, b.email, b.room].some((f) => String(f).toLowerCase().includes(q))
            ).slice(0, 8)
          : [];
        const havenHits = q
          ? havens.filter((h) =>
              [h.name, h.id, h.type, h.floor].some((f) => String(f).toLowerCase().includes(q))
            ).slice(0, 6)
          : [];
        const total = bookingHits.length + havenHits.length;
        const closeSearch = () => { setSearchOpen(false); setSearchQuery(""); };
        const openBooking = (b: AdminBookingRow) => { closeSearch(); setBookingModal(b); };
        const openHaven = (h: AdminHaven) => { closeSearch(); setHavenModal(h); };
        const rowBase: React.CSSProperties = { display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "10px 12px", borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" };
        const hov = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => { e.currentTarget.style.background = on ? "#faf7f1" : "transparent"; };

        return (
          <div onClick={closeSearch} style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 24px 24px", background: "rgba(31,27,22,0.45)" }}>
            <style>{`@keyframes vb-pop{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}`}</style>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "#ffffff", border: "1px solid #ece5d4", borderRadius: 16, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45), 0 4px 14px -6px rgba(58,42,24,.18)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%", animation: "vb-pop .3s cubic-bezier(.2,.7,.3,1) both" }}>

              {/* Input */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderBottom: "1px solid #f1ead9", flexShrink: 0 }}>
                <Search className="w-[17px] h-[17px]" style={{ color: "#b8754a" }} />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search bookings, guests, havens…"
                  className="flex-1 outline-none"
                  style={{ fontSize: 15, color: "#1f1b16", background: "transparent", border: "none" }}
                />
                <button type="button" onClick={closeSearch} title="Close (Esc)" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, padding: "3px 7px", background: "#faf7f1", border: "1px solid #e8e1d2", borderRadius: 6, color: "#6b6358", cursor: "pointer" }}>Esc</button>
              </div>

              {/* Results */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 8px 10px" }}>
                {!q ? (
                  <div style={{ padding: "26px 16px", textAlign: "center", fontSize: 13, color: "#a08a6c" }}>Type to search bookings, guests, and havens.</div>
                ) : total === 0 ? (
                  <div style={{ padding: "26px 16px", textAlign: "center", fontSize: 13, color: "#a08a6c" }}>No matches for “{searchQuery.trim()}”.</div>
                ) : (
                  <>
                    {bookingHits.length > 0 && (
                      <>
                        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", padding: "8px 12px 6px" }}>Bookings</div>
                        {bookingHits.map((b) => (
                          <button key={`b-${b.id}`} type="button" onClick={() => openBooking(b)} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)} style={rowBase}>
                            <span style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "#f1ead9", color: "#8a6f4d", display: "grid", placeItems: "center" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13.5, color: "#1f1b16", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.guest}</span>
                              <span style={{ display: "block", fontSize: 11.5, color: "#a08a6c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.displayId} · {b.room}</span>
                            </span>
                            <span style={{ fontSize: 11, color: "#9b8870", textTransform: "capitalize", flex: "none" }}>{b.status}</span>
                          </button>
                        ))}
                      </>
                    )}
                    {havenHits.length > 0 && (
                      <>
                        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", padding: "10px 12px 6px" }}>Havens</div>
                        {havenHits.map((h) => (
                          <button key={`h-${h.id}`} type="button" onClick={() => openHaven(h)} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)} style={rowBase}>
                            <span style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "#f1ead9", color: "#8a6f4d", display: "grid", placeItems: "center" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13.5, color: "#1f1b16", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                              <span style={{ display: "block", fontSize: 11.5, color: "#a08a6c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "capitalize" }}>{h.type} · {h.floor}</span>
                            </span>
                            <span style={{ fontSize: 11, color: "#9b8870", textTransform: "capitalize", flex: "none" }}>{h.status}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Redesigned booking detail modal */}
      {bookingModal && (() => {
        const bk = bookingModal;
        const sp = statusPill(bk.status);
        const pp = statusPill(bk.paymentStatus);
        const dp = statusPill(bk.depositStatus);
        const nights = nightsBetween(bk.checkInRaw, bk.checkOutRaw);
        const total = bk.amount;
        const paid = total > 0 ? Math.min(total, Math.max(0, total - bk.balance)) : bk.downPayment;
        const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((paid / total) * 100))) : 0;
        const serif = "var(--font-fraunces), Georgia, serif";
        const mono = "var(--font-geist-mono), ui-monospace, monospace";
        const docCard = (name: string, url: string) => {
          // A document field may hold several newline-separated URLs (e.g. front
          // & back of an ID, or multiple IDs). Render one card per image.
          const urls = (url || "").split("\n").map((u) => u.trim()).filter(Boolean);
          return urls.length > 0 ? (
            <>
              {urls.map((u, idx) => (
                <a key={idx} href={u} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", border: "1px solid #f1ead9", borderRadius: 12, overflow: "hidden", background: "#faf7f1", display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={urls.length > 1 ? `${name} ${idx + 1}` : name} style={{ height: 92, width: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px" }}>
                    <span style={{ fontSize: 12, color: "#1f1b16" }}>{urls.length > 1 ? `${name} ${idx + 1}` : name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2f7d55" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Uploaded
                    </span>
                  </div>
                </a>
              ))}
            </>
          ) : (
            <div style={{ border: "1px dashed #e0d2b8", borderRadius: 12, overflow: "hidden", background: "#fcfaf5" }}>
              <div style={{ height: 92, display: "grid", placeItems: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9b58f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px" }}>
                <span style={{ fontSize: 12, color: "#1f1b16" }}>{name}</span>
                <span style={{ fontSize: 11, color: "#b0a187" }}>Not uploaded</span>
              </div>
            </div>
          );
        };

        return (
          <div onClick={() => setBookingModal(null)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "rgba(31,27,22,0.45)" }}>
            <style>{`@keyframes vb-pop{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}`}</style>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 24, boxShadow: "0 24px 64px rgba(31,22,14,.16)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%", animation: "vb-pop .45s cubic-bezier(.2,.7,.3,1) both" }}>

              {/* Header band */}
              <div style={{ position: "relative", padding: "24px 26px 22px", background: "#FFFCF4", borderBottom: "1px solid #E0CEB2", flexShrink: 0 }}>
                <button type="button" onClick={() => setBookingModal(null)} title="Close"
                  onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "#fff"; t.style.color = "#1f1b16"; t.style.borderColor = "#d8c8a8"; }}
                  onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "rgba(255,255,255,.6)"; t.style.color = "#8a6f4d"; t.style.borderColor = "#e7dcc5"; }}
                  style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: 9, background: "rgba(255,255,255,.6)", color: "#8a6f4d", cursor: "pointer", transition: "all .15s" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 90 }}>
                  <div style={{ width: 52, height: 52, flex: "none", borderRadius: 14, background: "#b8754a", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 23, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18), 0 6px 14px -6px rgba(184,117,74,.6)" }}>{initials(bk.guest)}</div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 27, lineHeight: 1, letterSpacing: "-.01em", color: "#1f1b16" }}>{bk.guest}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".02em", color: "#9b8870" }}>{bk.displayId}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 9px", borderRadius: 999, background: sp.bg, color: sp.color, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: sp.dot }} />{sp.label}
                  </span>
                  {nights > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "#fff", border: "1px solid #ece5d4", color: "#6f5c44", fontSize: 12, fontWeight: 500 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
                      {nights} night{nights > 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontFamily: serif, fontSize: 22, color: "#1f1b16" }}>{peso(total)}</span>
                </div>
              </div>

              {/* Scroll body */}
              <div style={{ padding: "20px 22px 24px", flex: 1, minHeight: 0, overflowY: "auto" }}>

                {/* Contact */}
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginBottom: 10 }}>Contact</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
                  <div style={{ padding: "12px 13px", background: "#faf7f1", border: "1px solid #f1ead9", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a08a6c", fontSize: 11, marginBottom: 5 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>Email
                    </div>
                    <div style={{ fontSize: 13, color: "#1f1b16", wordBreak: "break-all" }}>{dash(bk.email)}</div>
                  </div>
                  <div style={{ padding: "12px 13px", background: "#faf7f1", border: "1px solid #f1ead9", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a08a6c", fontSize: 11, marginBottom: 5 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l-1 4a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>Phone
                    </div>
                    <div style={{ fontSize: 13, color: "#1f1b16" }}>{dash(bk.phone)}</div>
                  </div>
                </div>

                {/* Stay */}
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginBottom: 10 }}>Stay</div>
                <div style={{ border: "1px solid #f1ead9", borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "stretch" }}>
                    <div style={{ flex: 1, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, color: "#a08a6c", marginBottom: 4 }}>Check-in</div>
                      <div style={{ fontFamily: serif, fontSize: 20, color: "#1f1b16", lineHeight: 1 }}>{fmtDate(bk.checkInRaw)}</div>
                      {bk.checkInTime && <div style={{ fontSize: 12, color: "#8a7556", marginTop: 5 }}>{fmtTime(bk.checkInTime)}</div>}
                    </div>
                    <div style={{ display: "grid", placeItems: "center", padding: "0 4px", color: "#c9b58f" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </div>
                    <div style={{ flex: 1, padding: "14px 16px", textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#a08a6c", marginBottom: 4 }}>Check-out</div>
                      <div style={{ fontFamily: serif, fontSize: 20, color: "#1f1b16", lineHeight: 1 }}>{fmtDate(bk.checkOutRaw)}</div>
                      {bk.checkOutTime && <div style={{ fontSize: 12, color: "#8a7556", marginTop: 5 }}>{fmtTime(bk.checkOutTime)}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", background: "#faf7f1", borderTop: "1px solid #f1ead9", color: "#6f5c44", fontSize: 12.5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>
                    <span style={{ color: "#1f1b16", fontWeight: 500 }}>{bk.room}</span>
                  </div>
                </div>

                {/* Payment */}
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginBottom: 14 }}>Payment</div>

                {/* reference no. (copy) */}
                {bk.paymentReference && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F6EFE2", border: "1.5px dashed #B07848", borderRadius: 14, padding: "13px 16px", marginBottom: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#8C5A2E" }}>{((bk.paymentMethod || "Payment").charAt(0).toUpperCase() + (bk.paymentMethod || "Payment").slice(1))} reference no.</div>
                      <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 500, letterSpacing: ".08em", marginTop: 3, color: "#1f1b16", wordBreak: "break-all" }}>{bk.paymentReference}</div>
                    </div>
                    <button type="button" onClick={() => copyRef(bk.paymentReference)} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#8C5A2E", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      {refCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}

                {/* totals */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#4A3A2A", padding: "5px 0" }}><span>Room rate{nights > 0 ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}</span><span>{peso(bk.roomRate || total)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#4A3A2A", padding: "5px 0" }}><span>Add-ons</span><span style={{ color: "#8B7458" }}>{peso(bk.addOns)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 14px", borderTop: "1px solid #EFE4CE", marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                  <span style={{ fontFamily: serif, fontSize: 22, fontWeight: 500 }}>{peso(total)}</span>
                </div>

                {/* progress */}
                <div style={{ height: 8, borderRadius: 999, background: "#EFE4CE", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "#B07848" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#8B7458", marginTop: 7 }}><span>{peso(paid)} paid</span><span>{pct}%</span></div>

                {/* down / balance */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                  <div style={{ background: "rgba(91,158,107,.09)", border: "1px solid rgba(91,158,107,.28)", borderRadius: 14, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#3F7A4F" }}>Down payment</div>
                    <div style={{ fontFamily: serif, fontSize: 21, fontWeight: 500, color: "#3F7A4F", marginTop: 4 }}>{peso(bk.downPayment)}</div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7, padding: "3px 10px", borderRadius: 999, background: "rgba(91,158,107,.18)", color: "#3F7A4F", fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5B9E6B" }} />{(bk.paymentStatus || "").startsWith("approved") ? "Paid & approved" : "Paid"}</span>
                  </div>
                  <div style={{ background: "rgba(176,120,72,.08)", border: "1px solid rgba(176,120,72,.28)", borderRadius: 14, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#8C5A2E" }}>Balance due</div>
                    <div style={{ fontFamily: serif, fontSize: 21, fontWeight: 500, color: "#8C5A2E", marginTop: 4 }}>{peso(bk.balance)}</div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7, padding: "3px 10px", borderRadius: 999, background: "rgba(176,120,72,.16)", color: "#8C5A2E", fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B07848" }} />{bk.balance > 0 ? "Due at check-in" : "Settled"}</span>
                  </div>
                </div>

                {/* method / deposit */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, marginBottom: 22 }}>
                  <div style={{ padding: "13px 15px", border: "1px solid #E0CEB2", borderRadius: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#8B7458" }}>Method</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0A7CFF" }} />{dash(bk.paymentMethod)}</div>
                    {bk.paymentStatus ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "3px 10px", borderRadius: 999, background: pp.bg, color: pp.color, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: pp.dot }} />{pp.label}</span>
                    ) : (
                      <div style={{ fontSize: 11.5, color: "#8B7458", marginTop: 5 }}>e-wallet transfer</div>
                    )}
                  </div>
                  <div style={{ padding: "13px 15px", border: "1px solid #E0CEB2", borderRadius: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#8B7458" }}>Security deposit</div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>{peso(bk.deposit)} <span style={{ fontWeight: 400, color: "#8B7458", fontSize: 12.5 }}>refundable</span></div>
                    {bk.depositStatus ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "3px 10px", borderRadius: 999, background: dp.bg, color: dp.color, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: dp.dot }} />{dp.label}</span>
                    ) : (
                      <div style={{ fontSize: 11.5, color: "#8C5A2E", marginTop: 5 }}>Collected at check-in</div>
                    )}
                  </div>
                </div>

                {/* Documents */}
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginBottom: 10 }}>Documents</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {docCard("Valid ID", bk.validIdUrl)}
                  {docCard("Payment proof", bk.paymentProofUrl)}
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* Redesigned haven (Property) detail modal */}
      {havenModal && (() => {
        const hv = havenModal;
        const r = hv.raw;
        const num = (v: unknown) => Number(v ?? 0);
        const str = (v: unknown) => String(v ?? "").trim();
        const serif = "var(--font-fraunces), Georgia, serif";
        const mono = "var(--font-geist-mono), ui-monospace, monospace";
        const sp = statusPill(hv.status);

        const amenityRows = Array.isArray(r.verified_amenities) ? (r.verified_amenities as Record<string, unknown>[]) : [];
        const amenities = amenityRows.map((a) => str(a.label) || str(a.key)).filter(Boolean);

        const basePax = num(r.base_pax) || 0;
        const capacity = num(r.capacity) || basePax;
        const paxLabel = basePax && capacity && capacity !== basePax ? `${basePax}–${capacity} pax` : capacity ? `${capacity} pax` : "—";
        const beds = str(r.beds) || "—";
        const roomSize = num(r.room_size) ? `${num(r.room_size)} sqm` : "—";
        const description = str(r.description);
        const locationText = str(r.google_map_address) || hv.floor || "—";
        const rating = num(r.rating);
        const reviewCount = num(r.review_count);

        // D'Lux 4-rate model (see haven-adapter): 10h Daycation + 21h Overnight,
        // each with weekday & weekend prices, plus an extra-pax fee.
        const dayWeekday = num(r.ten_hour_rate);
        const dayWeekend = num(r.six_hour_rate) || dayWeekday;
        const nightWeekday = num(r.weekday_rate);
        const nightWeekend = num(r.weekend_rate) || nightWeekday;
        const extraPax = num(r.extra_pax_fee);
        const headlineRate = nightWeekday || hv.rate;
        const occ = Math.min(100, Math.max(0, hv.occupancy));

        const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginBottom: 10 };
        const statCard: React.CSSProperties = { padding: "12px 13px", background: "#faf7f1", border: "1px solid #f1ead9", borderRadius: 12 };
        const statCap: React.CSSProperties = { fontSize: 11, color: "#a08a6c", marginBottom: 4 };
        const statVal: React.CSSProperties = { fontSize: 14, color: "#1f1b16", fontWeight: 500 };

        return (
          <div onClick={() => setHavenModal(null)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "rgba(31,27,22,0.45)" }}>
            <style>{`@keyframes vb-pop{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}`}</style>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "#ffffff", border: "1px solid #ece5d4", borderRadius: 18, boxShadow: "0 32px 70px -28px rgba(58,42,24,.45), 0 4px 14px -6px rgba(58,42,24,.18)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "100%", animation: "vb-pop .45s cubic-bezier(.2,.7,.3,1) both" }}>

              {/* Header band */}
              <div style={{ position: "relative", padding: "22px 22px 20px", background: "linear-gradient(165deg, #faf5ea 0%, #f4ead6 100%)", borderBottom: "1px solid #eee2cb", flexShrink: 0 }}>
                <button type="button" onClick={() => setHavenModal(null)} title="Close"
                  onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = "#fff"; t.style.color = "#1f1b16"; t.style.borderColor = "#d8c8a8"; }}
                  onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = "rgba(255,255,255,.6)"; t.style.color = "#8a6f4d"; t.style.borderColor = "#e7dcc5"; }}
                  style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: 9, background: "rgba(255,255,255,.6)", color: "#8a6f4d", cursor: "pointer", transition: "all .15s" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 90 }}>
                  <div style={{ width: 52, height: 52, flex: "none", borderRadius: 14, background: "#b8754a", color: "#faf7f1", display: "grid", placeItems: "center", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18), 0 6px 14px -6px rgba(184,117,74,.6)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 24, lineHeight: 1.1, letterSpacing: "-.01em", color: "#1f1b16" }}>{hv.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".02em", color: "#9b8870" }}>{hv.id}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 9px", borderRadius: 999, background: sp.bg, color: sp.color, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: sp.dot }} />{sp.label}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "#fff", border: "1px solid #ece5d4", color: "#6f5c44", fontSize: 12, fontWeight: 500 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    {paxLabel}
                  </span>
                  {reviewCount > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, background: "#fff", border: "1px solid #ece5d4", color: "#6f5c44", fontSize: 12, fontWeight: 500 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#f5b301" stroke="#f5b301" strokeWidth="1.2" strokeLinejoin="round"><path d="M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.6 3.2L6.7 14l-5-4.8 7-.9z" /></svg>
                      {rating.toFixed(1)} ({reviewCount})
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", textAlign: "right" }}>
                    <span style={{ fontFamily: serif, fontSize: 22, color: "#1f1b16" }}>{peso(headlineRate)}</span>
                    <span style={{ fontSize: 11, color: "#8a7556", marginLeft: 3 }}>/night</span>
                  </span>
                </div>
              </div>

              {/* Scroll body */}
              <div style={{ padding: "20px 22px 24px", flex: 1, minHeight: 0, overflowY: "auto" }}>

                {/* Overview */}
                <div style={sectionLabel}>Overview</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={statCard}><div style={statCap}>Type</div><div style={{ ...statVal, textTransform: "capitalize" }}>{hv.type || "—"}</div></div>
                  <div style={statCard}><div style={statCap}>Capacity</div><div style={statVal}>{paxLabel}</div></div>
                  <div style={statCard}><div style={statCap}>Bed</div><div style={{ ...statVal, textTransform: "capitalize" }}>{beds}</div></div>
                  <div style={statCard}><div style={statCap}>Room size</div><div style={statVal}>{roomSize}</div></div>
                  <div style={{ ...statCard, gridColumn: "1 / -1" }}>
                    <div style={{ ...statCap, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>Location
                    </div>
                    <div style={statVal}>{locationText}</div>
                  </div>
                </div>

                {/* Occupancy */}
                <div style={{ ...statCard, marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                    <span style={statCap}>Occupancy</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1b16" }}>{occ}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: "#eee2cb", overflow: "hidden" }}><div style={{ width: `${occ}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #c8915a, #b8754a)" }} /></div>
                </div>

                {/* Rates */}
                <div style={sectionLabel}>Rates</div>
                <div style={{ border: "1px solid #f1ead9", borderRadius: 14, overflow: "hidden", marginBottom: 22, background: "linear-gradient(180deg, #fffdf9 0%, #faf6ed 100%)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    <div style={{ padding: "14px 16px", borderRight: "1px solid #f1ead9" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1b16", marginBottom: 8 }}>Daycation <span style={{ color: "#a08a6c", fontWeight: 400 }}>· 10h</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#6f5c44", padding: "3px 0" }}><span>Weekday</span><span style={{ color: "#1f1b16" }}>{peso(dayWeekday)}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#6f5c44", padding: "3px 0" }}><span>Weekend</span><span style={{ color: "#1f1b16" }}>{peso(dayWeekend)}</span></div>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1b16", marginBottom: 8 }}>Overnight <span style={{ color: "#a08a6c", fontWeight: 400 }}>· 21h</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#6f5c44", padding: "3px 0" }}><span>Weekday</span><span style={{ color: "#1f1b16" }}>{peso(nightWeekday)}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#6f5c44", padding: "3px 0" }}><span>Weekend</span><span style={{ color: "#1f1b16" }}>{peso(nightWeekend)}</span></div>
                    </div>
                  </div>
                  {extraPax > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: "#faf7f1", borderTop: "1px solid #f1ead9", fontSize: 12.5, color: "#6f5c44" }}>
                      <span>Extra pax fee</span>
                      <span style={{ color: "#1f1b16", fontWeight: 500 }}>{peso(extraPax)} <span style={{ color: "#a08a6c", fontWeight: 400 }}>/ pax</span></span>
                    </div>
                  )}
                </div>

                {/* Amenities */}
                <div style={sectionLabel}>Verified Amenities</div>
                {amenities.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: description ? 22 : 0 }}>
                    {amenities.map((a) => (
                      <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, background: "#faf7f1", border: "1px solid #f1ead9", color: "#5f4f3a", fontSize: 12, textTransform: "capitalize" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2f7d55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: "#b0a187", marginBottom: description ? 22 : 0 }}>No verified amenities yet</div>
                )}

                {/* Description */}
                {description && (
                  <>
                    <div style={sectionLabel}>Description</div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#5f4f3a" }}>{description}</p>
                  </>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {/* Generic detail modal — Staff (Team) view */}
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
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
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
