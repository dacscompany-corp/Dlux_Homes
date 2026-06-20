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
import {
  getDeposits, getDeliverables, getDiscounts,
  updateDepositStatus, markBookingDeliverablesDelivered,
  createDiscount, toggleDiscountStatus, deleteDiscount,
  approveDownPaymentByBookingId,
} from "@/app/admin/csr/actions";
import NewBookingWizard from "@/components/admin/NewBookingWizard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, CalendarDays, MessageSquare, ClipboardList, Settings, Bell, Search,
  Menu, X, LogOut, Check, XCircle, Eye, UserCheck, UserMinus,
  Clock, Sun, Users, ChevronDown, CreditCard, Package, Tag, Truck, Wrench,
  BarChart2, Bell as BellIcon, User, Star, MapPin, Plus, FileText, AlertCircle,
  Mail, Phone, Shield, PhilippinePeso, CheckCircle2, Trash2,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CalendarDays,    label: "Bookings" },
  { icon: CreditCard,      label: "Payments" },
  { icon: Package,         label: "Operations" },
  { icon: MessageSquare,   label: "Messages" },
  { icon: BarChart2,       label: "Activity" },
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

// Normalize an RTK/fetch result to an array of rows, whether it arrives as a
// bare array, a { data: [...] } envelope, or undefined/error object.
function toRows(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  const d = (v as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
}

export default function CSRDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [bkTab, setBkTab] = useState<"all" | "calendar">("all");
  const [payTab, setPayTab] = useState<"payments" | "deposits" | "discounts">("payments");
  const [opsTab, setOpsTab] = useState<"deliverables" | "cleaning" | "inventory">("deliverables");
  const [filterStatus, setFilterStatus] = useState("all");

  // Sub-tab bar (design: active = ink, inactive = outlined)
  const SubTabs = ({ tabs, active, onPick }: { tabs: { id: string; label: string }[]; active: string; onPick: (id: string) => void }) => (
    <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 24 }}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button key={t.id} type="button" onClick={() => onPick(t.id)}
            style={{ padding: "9px 16px", border: `1px solid ${on ? "#1f1b16" : "#e0d8c8"}`, fontFamily: "inherit", fontSize: 13, cursor: "pointer", background: on ? "#1f1b16" : "transparent", color: on ? "#faf7f1" : "#6b6358" }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
  const PanelHead = ({ title, sub }: { title: string; sub: string }) => (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 26, lineHeight: 1, letterSpacing: "-0.01em", color: "#1f1b16", margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 13, color: "#8a8276", margin: "10px 0 0" }}>{sub}</p>
    </div>
  );

  // ── Live bookings + status workflow ──
  const { data: session } = useSession();
  const { data: bookingsData, refetch: refetchBookings } = useGetBookingsQuery();
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [updateBookingStatus, { isLoading: bookingUpdating }] = useUpdateBookingStatusMutation();
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string; reason: string }>({ open: false, id: "", reason: "" });
  const [viewBooking, setViewBooking] = useState<{ displayId: string; guest: string; email: string; room: string; checkIn: string; stayType: string; amount: number; status: string } | null>(null);

  // Backend statuses → UI statuses the design expects
  const normalizeStatus = (s: string) =>
    s === "completed" ? "checked-out" : s === "approved" ? "confirmed" : s === "on-going" ? "checked-in" : s;

  const rawBookings = toRows(bookingsData);
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
  // Two-step approval: 1) approve the down payment, 2) approve the booking.
  const [approval, setApproval] = useState<{ open: boolean; step: 1 | 2; id: string; displayId: string; guest: string; amount: number; busy: boolean }>(
    { open: false, step: 1, id: "", displayId: "", guest: "", amount: 0, busy: false }
  );
  const openApproval = (b: { id: string; displayId: string; guest: string; amount: number }) =>
    setApproval({ open: true, step: 1, id: b.id, displayId: b.displayId, guest: b.guest, amount: b.amount, busy: false });
  const approveDownStep = async () => {
    setApproval((a) => ({ ...a, busy: true }));
    try {
      await approveDownPaymentByBookingId(approval.id);
      toast.success("Down payment approved");
      setApproval((a) => ({ ...a, step: 2, busy: false }));
    } catch { toast.error("Could not approve down payment"); setApproval((a) => ({ ...a, busy: false })); }
  };
  const approveFinalStep = async () => {
    setApproval((a) => ({ ...a, busy: true }));
    try {
      await updateBookingStatus({ id: approval.id, status: "approved" }).unwrap();
      toast.success("Booking approved");
      setApproval({ open: false, step: 1, id: "", displayId: "", guest: "", amount: 0, busy: false });
    } catch { toast.error("Could not approve booking"); setApproval((a) => ({ ...a, busy: false })); }
  };
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
  const activityLogs = toRows(activityRes).map((l, i) => ({
    id: String(l.id ?? i),
    action: String(l.description || l.activity_type || "Activity"),
    time: l.created_at ? new Date(String(l.created_at)).toLocaleString() : "",
    type: String(l.activity_type || "booking").toLowerCase(),
  }));

  // Inventory — live stock list (full CRUD via /api/inventory)
  const [inventory, setInventory] = useState<{ id: string; item: string; haven: string; qty: number; minQty: number; unit: string; price: number; status: string }[]>([]);
  const reloadInventory = () =>
    fetch("/api/inventory")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        setInventory(toRows(j.data).map((it) => {
          const qty = Number(it.current_stock ?? 0);
          const min = Number(it.minimum_stock ?? 0);
          return {
            id: String(it.item_id ?? ""),
            item: String(it.item_name ?? "Item"),
            haven: String(it.category ?? "—"),
            qty,
            minQty: min,
            unit: String(it.unit_type ?? "pcs"),
            price: Number(it.price_per_unit ?? 0),
            status: qty <= 0 ? "out" : qty < min ? "low" : "ok",
          };
        }));
      })
      .catch(() => {});
  useEffect(() => { reloadInventory(); }, []);

  // Inventory — Add Item + Restock
  const INVENTORY_CATEGORIES = ["Guest Amenities", "Bathroom Supplies", "Cleaning Supplies", "Linens & Bedding", "Kitchen Supplies", "Add ons"];
  const [invModal, setInvModal] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const emptyInv = { item_name: "", category: "Guest Amenities", current_stock: "", minimum_stock: "", unit_type: "pcs", price_per_unit: "" };
  const [invForm, setInvForm] = useState(emptyInv);
  const submitInventory = async () => {
    if (!invForm.item_name.trim() || invForm.current_stock === "" || invForm.minimum_stock === "") {
      toast.error("Please fill in item name, stock, and minimum stock."); return;
    }
    setInvSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: invForm.item_name.trim(),
          category: invForm.category,
          current_stock: Number(invForm.current_stock),
          minimum_stock: Number(invForm.minimum_stock),
          unit_type: invForm.unit_type.trim() || "pcs",
          price_per_unit: invForm.price_per_unit ? Number(invForm.price_per_unit) : 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Inventory item added");
      setInvModal(false); setInvForm(emptyInv); reloadInventory();
    } catch { toast.error("Could not add item"); }
    finally { setInvSaving(false); }
  };
  const [restockModal, setRestockModal] = useState<{ open: boolean; item: typeof inventory[number] | null; qty: string }>({ open: false, item: null, qty: "" });
  const submitRestock = async () => {
    const it = restockModal.item;
    if (!it) return;
    const add = Number(restockModal.qty);
    if (!Number.isFinite(add) || add <= 0) { toast.error("Enter a quantity to add."); return; }
    try {
      const res = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: it.id, item_name: it.item, category: it.haven,
          current_stock: it.qty + add, minimum_stock: it.minQty,
          unit_type: it.unit, price_per_unit: it.price,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Restocked +${add} ${it.unit}`);
      setRestockModal({ open: false, item: null, qty: "" }); reloadInventory();
    } catch { toast.error("Could not restock item"); }
  };

  // Payments — live payment submissions + verify/reject
  const { data: paymentsData } = useGetBookingPaymentsQuery();
  const [updateBookingPayment, { isLoading: paymentUpdating }] = useUpdateBookingPaymentMutation();
  const normalizePaymentStatus = (s: string) =>
    s.startsWith("approved") ? "verified" : s.startsWith("rejected") ? "rejected" : s.startsWith("pending") ? "pending" : s;
  const payments = toRows(paymentsData).map((p) => ({
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
  const [deposits, setDeposits] = useState<{ id: string; uuid: string; booking: string; guest: string; amount: number; status: string; released: string | null }[]>([]);
  const [deliverables, setDeliverables] = useState<{ id: string; bookingUuid: string; booking: string; guest: string; item: string; status: string; date: string }[]>([]);
  const [discounts, setDiscounts] = useState<{ id: string; code: string; type: string; value: number; uses: number; limit: number; status: string; expires: string }[]>([]);
  const reloadDeposits = () => getDeposits().then((rows) => setDeposits(rows.map((d) => ({
    id: d.deposit_id || d.id, uuid: d.id, booking: d.booking_id, guest: d.guest,
    amount: Number(d.deposit_amount || 0),
    status: d.status === "Paid" ? "held" : d.status === "Returned" ? "released" : d.status.toLowerCase(),
    released: d.returned_at ? new Date(d.returned_at).toLocaleDateString() : null,
  })))).catch(() => {});
  const reloadDeliverables = () => getDeliverables().then((rows) => setDeliverables(rows.map((d) => ({
    id: d.deliverable_id || d.id, bookingUuid: d.booking_uuid, booking: d.booking_id, guest: d.guest,
    item: d.items?.length ? (d.items.length === 1 ? d.items[0].name : `${d.items.length} items`) : "—",
    status: (d.overall_status || "pending").toLowerCase(), date: d.checkin_date,
  })))).catch(() => {});
  const reloadDiscounts = () => getDiscounts().then((rows) => setDiscounts(rows.map((d) => ({
    id: d.id, code: d.discount_code, type: d.discount_type === "percentage" ? "percent" : "flat",
    value: Number(d.discount_value || 0), uses: Number(d.used_count || 0), limit: Number(d.max_uses || 0),
    status: d.active ? "active" : "inactive", expires: d.expires_at ? new Date(d.expires_at).toLocaleDateString() : "—",
  })))).catch(() => {});
  useEffect(() => { reloadDeposits(); reloadDeliverables(); reloadDiscounts(); }, []);

  const employeeId = (session?.user as { id?: string } | undefined)?.id;
  const releaseDeposit = async (uuid: string) => {
    try { await updateDepositStatus(uuid, "Returned", employeeId); toast.success("Deposit released"); reloadDeposits(); }
    catch { toast.error("Could not release deposit"); }
  };
  const markDelivered = async (bookingUuid: string) => {
    try { await markBookingDeliverablesDelivered(bookingUuid); toast.success("Marked as delivered"); reloadDeliverables(); }
    catch { toast.error("Could not update deliverable"); }
  };
  const toggleDiscount = async (id: string, currentlyActive: boolean) => {
    try { await toggleDiscountStatus(id, !currentlyActive, employeeId); toast.success(currentlyActive ? "Discount deactivated" : "Discount activated"); reloadDiscounts(); }
    catch { toast.error("Could not update discount"); }
  };
  const removeDiscount = async (id: string) => {
    try { await deleteDiscount(id, employeeId); toast.success("Discount deleted"); reloadDiscounts(); }
    catch { toast.error("Could not delete discount"); }
  };

  // Discount create modal
  const [discountModal, setDiscountModal] = useState(false);
  const [discountSaving, setDiscountSaving] = useState(false);
  const emptyDiscount = { code: "", name: "", discount_type: "percentage" as "percentage" | "fixed", discount_value: "", max_uses: "", start_date: "", end_date: "" };
  const [discountForm, setDiscountForm] = useState(emptyDiscount);
  const submitDiscount = async () => {
    if (!discountForm.code.trim() || !discountForm.name.trim() || !discountForm.discount_value || !discountForm.start_date || !discountForm.end_date) {
      toast.error("Please fill in code, name, value, and the date range."); return;
    }
    setDiscountSaving(true);
    try {
      await createDiscount({
        code: discountForm.code.trim().toUpperCase(),
        name: discountForm.name.trim(),
        discount_type: discountForm.discount_type,
        discount_value: Number(discountForm.discount_value),
        max_uses: discountForm.max_uses ? Number(discountForm.max_uses) : undefined,
        start_date: discountForm.start_date,
        end_date: discountForm.end_date,
        employeeId,
      });
      toast.success("Discount code created");
      setDiscountModal(false); setDiscountForm(emptyDiscount); reloadDiscounts();
    } catch { toast.error("Could not create discount"); }
    finally { setDiscountSaving(false); }
  };

  // Notifications + Messages (live, session-scoped)
  const { data: notifRes } = useGetNotificationsQuery({});
  const notifications = toRows(notifRes).map((n, i) => ({
    id: (n.notification_id as string) ?? i,
    title: String(n.title || "Notification"),
    desc: String(n.message || ""),
    time: n.created_at ? new Date(String(n.created_at)).toLocaleString() : "",
    read: Boolean(n.is_read),
    type: String(n.notification_type || "booking"),
  }));
  const csrUserId = (session?.user as { id?: string } | undefined)?.id;
  const { data: convRes } = useGetConversationsQuery({ userId: csrUserId || "" }, { skip: !csrUserId });
  const messages = toRows(convRes).map((c, i) => ({
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
  const cleanerAssignments = toRows(cleaningTasksData).map((t) => ({
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
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff", zoom: "1.1" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap');`}</style>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "#1f1b16", borderRight: "1px solid rgba(250,247,241,0.1)" }}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <Link href="/rooms">
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#f9fafb" }}>
              <Image src="/logo.png" alt="D'Lux Homes" width={80} height={28} className="mix-blend-multiply" style={{ width: "80px", height: "28px", objectFit: "cover" }} />
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden" style={{ color: "#6b5040" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(47,157,107,0.18)", color: "#5cc08c" }}>
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm cursor-pointer"
                style={{ backgroundColor: isActive ? "rgba(47,157,107,0.16)" : "transparent", color: isActive ? "#faf7f1" : "rgba(250,247,241,0.6)", fontWeight: isActive ? 600 : 500 }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(250,247,241,0.06)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? "#5cc08c" : "rgba(250,247,241,0.45)" }} />
                {item.label}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#5cc08c" }} />}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(250,247,241,0.1)" }}>
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
        <header className="px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 border-b"
          style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4", height: 72, fontFamily: "'Geist', system-ui, sans-serif" }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg cursor-pointer" style={{ color: "#6b6358" }}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#8a8276" }}>
                <span className="inline-flex items-center gap-1.5" style={{ padding: "2px 8px", background: "rgba(47,157,107,0.14)", color: "#2f7d56", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span style={{ width: 5, height: 5, background: "#3a9d68", borderRadius: "50%" }} />
                  CSR
                </span>
                <span>Customer Service Representative</span>
              </div>
              <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", margin: 0, color: "#1f1b16" }}>{activeNav}</h1>
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <div className="hidden md:flex items-center" style={{ gap: 6 }}>
              <div className="flex items-center gap-1.5" style={{ padding: "8px 12px", border: "1px solid #ece5d4", fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                <Clock className="w-3.5 h-3.5" />
                <span>10:09</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ padding: "8px 12px", border: "1px solid #ece5d4", fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>
                <Sun className="w-3.5 h-3.5" style={{ color: "#d49b73" }} />
                <span>29° · Sunny</span>
              </div>
            </div>
            <span style={{ width: 1, height: 24, background: "#e8e1d2", margin: "0 8px" }} />
            <button onClick={() => setActiveNav("Notifications")} title="Notifications" className="relative p-2.5 rounded-lg cursor-pointer transition-colors" style={{ color: "#6b6358" }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
              <Bell className="w-[18px] h-[18px]" />
              <span style={{ position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, padding: "0 4px", background: "#2f9e6b", color: "#faf7f1", fontSize: 10, fontWeight: 500, display: "grid", placeItems: "center", borderRadius: 8, border: "2px solid #fff", fontFamily: "'Geist Mono', ui-monospace, monospace" }}>{notifications.filter(n=>!n.read).length}</span>
            </button>
            <button type="button" onClick={() => setActiveNav("Profile")} title="Profile & settings" className="flex items-center gap-2.5 rounded-lg cursor-pointer transition-colors" style={{ padding: "6px 12px 6px 6px", background: "transparent", border: 0 }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#2f9e6b", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 14 }}>C</span>
              <span className="flex flex-col items-start" style={{ lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: "#1f1b16" }}>CSR Staff</span>
                <span style={{ fontSize: 11, color: "#8a8276" }}>On shift</span>
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">

          {/* ── Dashboard ── */}
          {activeNav === "Overview" && (() => {
            const paymentsToVerify = payments.filter((p) => p.status === "pending").length;
            const unreadMessages = messages.filter((m) => m.unread).length;
            const openRequests = notifications.filter((n) => !n.read).length;
            const cleaningInProgress = cleanerAssignments.filter((t) => t.status === "in-progress").length;
            const kpis = [
              { label: "Check-ins today",   value: stats.todayCheckIns,  icon: UserCheck },
              { label: "Check-outs today",  value: stats.todayCheckOuts, icon: UserMinus },
              { label: "Pending approval",  value: stats.pending,        icon: Clock },
              { label: "Active guests",     value: stats.activeGuests,   icon: Users },
              { label: "Payments to verify", value: paymentsToVerify,    icon: CreditCard },
              { label: "Open requests",     value: openRequests,         icon: AlertCircle },
            ];
            const snapshot = [
              { label: "Awaiting approval",    value: stats.pending,      dot: "#d4a96a" },
              { label: "Payments to verify",   value: paymentsToVerify,   dot: "#2f7d55" },
              { label: "Checked-in now",       value: stats.activeGuests, dot: "#1f1b16" },
              { label: "Cleaning in progress", value: cleaningInProgress, dot: "#5aa57c" },
              { label: "Unread messages",      value: unreadMessages,     dot: "#b8754a" },
            ];
            const arrDep = [
              ...bookings.filter((b) => sameDay(b.rawCheckIn) && ["confirmed", "checked-in"].includes(b.status)).map((b) => ({ ...b, kind: "Arrival", isIn: true })),
              ...bookings.filter((b) => sameDay(b.rawCheckOut) && ["checked-in", "checked-out"].includes(b.status)).map((b) => ({ ...b, kind: "Departure", isIn: false })),
            ];
            const queue = bookings.filter((b) => ["pending", "confirmed", "checked-in"].includes(b.status)).slice(0, 6);
            const btnEm: React.CSSProperties = { padding: "7px 14px", background: "#2f7d55", color: "#fff", border: 0, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" };
            const btnNeutral: React.CSSProperties = { padding: "7px 14px", background: "transparent", color: "#1f1b16", border: "1px solid #d9d1c2", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
            const btnDanger: React.CSSProperties = { padding: "7px 14px", background: "transparent", color: "#9a4a3a", border: "1px solid #e0b8ad", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
            return (
              <div>
                {/* KPI grid — 6 cells */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-6" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
                  {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                      <div key={k.label} style={{ background: "#fff", padding: "20px 22px" }}>
                        <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} style={{ color: "#2f7d55", marginBottom: 16 }} />
                        <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: "#1f1b16" }}>{k.value}</div>
                        <div style={{ fontSize: 12, color: "#8a8276", marginTop: 6 }}>{k.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* arrivals & departures + snapshot */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                  <div className="xl:col-span-2" style={{ background: "#fff", border: "1px solid #ece5d4" }}>
                    <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #ece5d4" }}>
                      <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Arrivals &amp; departures</h3>
                      <p style={{ fontSize: 12, color: "#8a8276", margin: "8px 0 0" }}>Today</p>
                    </div>
                    {arrDep.length === 0 ? (
                      <div style={{ padding: "22px 24px", fontSize: 13, color: "#8a8276" }}>No arrivals or departures today.</div>
                    ) : arrDep.map((a, i) => (
                      <div key={a.id + a.kind + i} className="flex items-center" style={{ gap: 16, padding: "15px 24px", borderBottom: "1px solid #f3eee2" }}>
                        <span className="inline-flex items-center" style={{ gap: 8, width: 104, flex: "none", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: a.isIn ? "#2f7d55" : "#8a6a2f" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.isIn ? "#5aa57c" : "#d4a96a" }} />{a.kind}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: "#1f1b16", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.guest}</div>
                          <div style={{ fontSize: 12, color: "#8a8276", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.room}</div>
                        </div>
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358", flex: "none" }}>{a.checkIn}</span>
                        <button type="button" style={a.isIn ? btnEm : btnNeutral} onClick={() => a.isIn ? checkInBooking(a.id) : checkOutBooking(a.id)}>{a.isIn ? "Check in" : "Check out"}</button>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "#fff", border: "1px solid #ece5d4", padding: "22px 24px" }}>
                    <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: "0 0 4px", lineHeight: 1, color: "#1f1b16" }}>Today&apos;s snapshot</h3>
                    <p style={{ fontSize: 12, color: "#8a8276", margin: "0 0 12px" }}>Live counts</p>
                    <div className="flex flex-col">
                      {snapshot.map((s) => (
                        <div key={s.label} className="flex items-center justify-between" style={{ padding: "13px 0", borderBottom: "1px solid #f3eee2" }}>
                          <div className="flex items-center" style={{ gap: 12 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flex: "none" }} />
                            <span style={{ fontSize: 13.5, color: "#4a4034" }}>{s.label}</span>
                          </div>
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 500, color: "#1f1b16" }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* bookings queue */}
                <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
                  <div className="flex items-center justify-between" style={{ padding: "18px 24px", borderBottom: "1px solid #ece5d4" }}>
                    <div>
                      <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Bookings queue</h3>
                      <p style={{ fontSize: 12, color: "#8a8276", margin: "7px 0 0" }}>{bookings.filter((b) => b.status === "pending").length} pending action</p>
                    </div>
                    <button onClick={() => setActiveNav("Bookings")} className="inline-flex items-center transition-colors" style={{ gap: 8, padding: "9px 16px", background: "transparent", border: "1px solid #d9d1c2", fontSize: 13, color: "#1f1b16", cursor: "pointer" }}>
                      <span>All bookings</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: "130px 1.6fr 120px 130px 210px", gap: 16, padding: "12px 24px", background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8276" }}>
                    <span>Booking ID</span><span>Guest</span><span style={{ textAlign: "right" }}>Amount</span><span>Status</span><span>Action</span>
                  </div>
                  {queue.length === 0 ? (
                    <div style={{ padding: "22px 24px", fontSize: 13, color: "#8a8276" }}>No bookings need action.</div>
                  ) : queue.map((b) => {
                    const st = statusConfig[b.status] || statusConfig.pending;
                    return (
                      <div key={b.id} className="grid items-center" style={{ gridTemplateColumns: "130px 1.6fr 120px 130px 210px", gap: 16, padding: "14px 24px", borderBottom: "1px solid #f3eee2", fontSize: 13.5 }}>
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#6b6358" }}>{b.displayId}</span>
                        <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
                          <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: "#e9f2ec", color: "#2f7d55", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 13 }}>{(b.guest[0] || "?").toUpperCase()}</span>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.guest}</span>
                        </div>
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13, textAlign: "right" }}>₱{b.amount.toLocaleString()}</span>
                        <span className="inline-flex items-center" style={{ gap: 7, fontSize: 12, color: st.dot }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flex: "none" }} />{st.label}
                        </span>
                        <div className="flex" style={{ gap: 6 }}>
                          {b.status === "pending" && (<>
                            <button type="button" style={btnEm} onClick={() => openApproval(b)}>Approve</button>
                            <button type="button" style={btnDanger} onClick={() => rejectBooking(b.id)}>Reject</button>
                          </>)}
                          {b.status === "confirmed" && <button type="button" style={btnEm} onClick={() => checkInBooking(b.id)}>Check in</button>}
                          {b.status === "checked-in" && <button type="button" style={btnNeutral} onClick={() => checkOutBooking(b.id)}>Check out</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Bookings ── */}
          {activeNav === "Bookings" && (<>
            <SubTabs tabs={[{ id: "all", label: "All bookings" }, { id: "calendar", label: "Calendar" }]} active={bkTab} onPick={(id) => setBkTab(id as "all" | "calendar")} />
            {bkTab === "all" && (<>
            <PanelHead title="All bookings" sub="Every reservation across havens" />
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "#ece5d4" }}>
                <div>
                  <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>All Bookings</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{filteredBookings.length} records</p>
                </div>
                <div className="flex items-center gap-2">
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
                  <button onClick={() => setNewBookingOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                    <Plus className="w-4 h-4" /> New Booking
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Booking","Guest","Room","Check-in","Amount","Status","Actions"].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em] ${i===2?"hidden sm:table-cell":i===3?"hidden md:table-cell":""}`} style={{ color: "#8B6344" }}>{h}</th>
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
                              <span style={{ fontSize: 12, color: st.dot }}>{st.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewBooking(b)} title="View booking" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";}}>
                                <Eye className="w-4 h-4" />
                              </button>
                              {b.status === "pending" && (<>
                                <button onClick={() => openApproval(b)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}
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
            </>)}
            {bkTab === "calendar" && (<>
            <PanelHead title="Booking calendar" sub="Check-ins, check-outs and blocked dates" />
            <div className="border p-6" style={{ borderColor: "#ece5d4" }}>
              <div className="flex items-center justify-between mb-6">
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>April 2026</h3>
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
            </>)}
          </>)}

          {/* ── Payments ── */}
          {activeNav === "Payments" && (<>
            <SubTabs tabs={[{ id: "payments", label: "Payments" }, { id: "deposits", label: "Deposits" }, { id: "discounts", label: "Discounts" }]} active={payTab} onPick={(id) => setPayTab(id as "payments" | "deposits" | "discounts")} />
            {payTab === "payments" && (<>
            <PanelHead title="Payments" sub="Guest payments and uploaded proofs" />
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#ece5d4" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Payment Submissions</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{payments.filter(p=>p.status==="pending").length} awaiting verification</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Pay ID","Booking","Guest","Amount","Method","Proof Ref","Date","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
            </>)}
            {payTab === "deposits" && (<>
            <PanelHead title="Security deposits" sub="Held, released and forfeited" />
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#ece5d4" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Security Deposits</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{deposits.filter(d=>d.status==="held").length} currently held</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Deposit ID","Booking","Guest","Amount","Status","Released","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
                            <button onClick={() => releaseDeposit(d.uuid)} className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>Release</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>)}
            {payTab === "discounts" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Discount Codes</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{discounts.filter(d=>d.status==="active").length} active codes</p>
              </div>
              <button onClick={() => setDiscountModal(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                <Plus className="w-4 h-4" /> New Code
              </button>
            </div>
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Code","Type","Value","Usage","Expires","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
                          <div className="flex items-center gap-1">
                            <button onClick={() => toggleDiscount(d.id, d.status === "active")} title={d.status === "active" ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg cursor-pointer" style={{ color: d.status === "active" ? "#92400e" : "#065f46" }}
                              onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#F7F0E3"}
                              onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="transparent"}>
                              {d.status === "active" ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => removeDiscount(d.id)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}
                              onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="#fee2e2"}
                              onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.backgroundColor="transparent"}>
                              <Trash2 className="w-3.5 h-3.5" />
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

          {/* ── Operations ── */}
          {activeNav === "Operations" && (<>
            <SubTabs tabs={[{ id: "deliverables", label: "Deliverables" }, { id: "cleaning", label: "Cleaning" }, { id: "inventory", label: "Inventory" }]} active={opsTab} onPick={(id) => setOpsTab(id as "deliverables" | "cleaning" | "inventory")} />
            {opsTab === "deliverables" && (<>
            <PanelHead title="Deliverables" sub="Welcome kits and guest add-ons" />
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#ece5d4" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Guest Deliverables</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>{deliverables.filter(d=>d.status==="pending").length} pending</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["ID","Booking","Guest","Item","Date","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
                            <button onClick={() => markDelivered(d.bookingUuid)} className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}>
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
            </>)}
            {opsTab === "cleaning" && (<>
            <PanelHead title="Cleaning" sub="Turnover tasks across all havens" />
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Cleaner Assignments</h2>
                  <p className="text-sm" style={{ color: "#8B6344" }}>Today's schedule</p>
                </div>
              </div>
              {cleanerAssignments.map((ca) => (
                <div key={ca.id} className="border p-5 flex items-center gap-4" style={{ borderColor: "#ece5d4" }}>
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
            </>)}
            {opsTab === "inventory" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Inventory</h2>
                <p className="text-sm" style={{ color: "#8B6344" }}>{inventory.filter(i=>i.status !== "ok").length} items need restocking</p>
              </div>
              <button onClick={() => setInvModal(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Item","Haven","Qty","Min Qty","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8B6344" }}>{h}</th>
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
                            <button onClick={() => setRestockModal({ open: true, item, qty: "" })} className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer" style={{ backgroundColor: "#F7F0E3", color: "#B07848", borderColor: "#D4BFA0" }}>Restock</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}
          </>)}

          {/* ── Messages ── */}
          {activeNav === "Messages" && (
            <div>
              <PanelHead title="Messages" sub={`${messages.length} conversations · ${messages.filter((m) => m.unread).length} unread`} />
              <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
                {messages.map((msg) => {
                  const tint = msg.role === "owner" ? { bg: "#f3eee2", c: "#b8754a" } : msg.role === "cleaner" ? { bg: "#e9f2ec", c: "#2f7d55" } : { bg: "#e9f2ec", c: "#2f7d55" };
                  return (
                    <div key={msg.id} className="flex items-center cursor-pointer" style={{ gap: 16, padding: "18px 24px", borderBottom: "1px solid #f3eee2" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#faf7f1"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", flex: "none", background: tint.bg, color: tint.c, display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 17 }}>{msg.sender.split(" ").map((n)=>n[0]).join("")}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center" style={{ gap: 10 }}>
                          <span style={{ fontSize: 14, color: "#1f1b16" }}>{msg.sender}</span>
                          {msg.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2f7d55" }} />}
                        </div>
                        <div className="truncate" style={{ fontSize: 13, color: "#8a8276", marginTop: 3 }}>{msg.content}</div>
                      </div>
                      <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#b8b1a6", flex: "none" }}>{msg.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Activity Logs ── */}
          {activeNav === "Activity" && (
            <div className="border overflow-hidden" style={{ borderColor: "#ece5d4" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "#ece5d4" }}>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Activity Logs</h3>
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
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 16 }}>Notifications</h2>
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
                      <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: ic.color }} />
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
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 24 }}>Account Settings</h2>
              {[
                { label: "Email Notifications", desc: "Receive alerts for new bookings and status changes", enabled: true },
                { label: "Auto-approve Confirmed Payments", desc: "Automatically confirm bookings when payment is verified", enabled: false },
                { label: "Dark Mode", desc: "Switch to dark theme for lower eye strain", enabled: false },
              ].map((setting) => (
                <div key={setting.label} className="flex items-center justify-between p-5 rounded-2xl border" style={{ borderColor: "#ece5d4" }}>
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
              <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16", marginBottom: 24 }}>My Profile</h2>
              <div className="border p-6 mb-4" style={{ borderColor: "#ece5d4" }}>
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
              <button onClick={() => toast("Your profile is managed by the Owner. Contact them to update your details.", { icon: "ℹ️" })} className="w-full py-3 rounded-2xl text-sm font-semibold border cursor-pointer transition-colors" style={{ color: "#B07848", borderColor: "#D4BFA0", backgroundColor: "#F7F0E3" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#EDE0CE"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F0E3"}>
                Edit Profile
              </button>
            </div>
          )}

        </main>
      </div>

      {/* ── Reject Booking modal ── */}
      {/* Two-step booking approval */}
      {approval.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => !approval.busy && setApproval((a) => ({ ...a, open: false }))}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Approve Booking</h3>
            <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Step {approval.step} of 2 · {approval.step === 1 ? "Approve down payment" : "Final approval"}</p>

            {/* Stepper */}
            <div className="flex items-center gap-2 mt-4 mb-5">
              {[1, 2].map((n, i) => {
                const active = approval.step === n;
                const done = approval.step > n;
                return (
                  <div key={n} className="flex items-center gap-2 flex-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: done ? "#059669" : active ? "#d1fae5" : "#F3EEE4", color: done ? "#fff" : active ? "#065f46" : "#C9B79E", border: active ? "1.5px solid #059669" : "none" }}>
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: active || done ? "#065f46" : "#C9B79E" }}>{n === 1 ? "Down Payment" : "Approve"}</span>
                    {i < 1 && <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: done ? "#059669" : "#EDE3D2" }} />}
                  </div>
                );
              })}
            </div>

            <div className="border p-4 mb-4" style={{ backgroundColor: "#FAFAF7", borderColor: "#ece5d4" }}>
              <div className="flex items-center justify-between text-sm"><span style={{ color: "#8B6344" }}>Booking</span><span className="font-mono text-xs" style={{ color: "#1a1a1a" }}>{approval.displayId}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Guest</span><span style={{ color: "#1a1a1a" }}>{approval.guest}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Amount</span><span className="font-semibold" style={{ color: "#1a1a1a" }}>₱{approval.amount.toLocaleString()}</span></div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: "#5a4a3a" }}>
              {approval.step === 1
                ? "Confirm the guest's down payment has been received and verified. This marks the payment approved."
                : "Down payment approved. Approve the booking to confirm the reservation — the guest will be notified."}
            </p>

            <div className="flex justify-between gap-2 mt-6">
              <button type="button" onClick={() => setApproval((a) => ({ ...a, open: false }))} disabled={approval.busy} className="px-4 py-2 text-sm font-medium border cursor-pointer disabled:opacity-60" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              {approval.step === 1 ? (
                <button type="button" onClick={approveDownStep} disabled={approval.busy} className="px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#059669" }}>{approval.busy ? "Approving…" : "Approve Down Payment"}</button>
              ) : (
                <button type="button" onClick={approveFinalStep} disabled={approval.busy} className="px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#059669" }}>{approval.busy ? "Approving…" : "Approve Booking"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setRejectModal({ open: false, id: "", reason: "" })}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Reject Booking</h3>
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
              <button type="button" onClick={() => setRejectModal({ open: false, id: "", reason: "" })} className="px-4 py-2 text-sm font-medium border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitReject} disabled={bookingUpdating} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#dc2626" }}>{bookingUpdating ? "Rejecting…" : "Reject Booking"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create discount code modal */}
      {discountModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setDiscountModal(false)}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>New Discount Code</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Create a promo code guests can apply at checkout.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Code</label>
                  <input value={discountForm.code} onChange={(e) => setDiscountForm((f) => ({ ...f, code: e.target.value }))} placeholder="SUMMER20" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none uppercase" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Name</label>
                  <input value={discountForm.name} onChange={(e) => setDiscountForm((f) => ({ ...f, name: e.target.value }))} placeholder="Summer Sale" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Type</label>
                  <select aria-label="Discount type" value={discountForm.discount_type} onChange={(e) => setDiscountForm((f) => ({ ...f, discount_type: e.target.value as "percentage" | "fixed" }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (₱)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Value</label>
                  <input type="number" value={discountForm.discount_value} onChange={(e) => setDiscountForm((f) => ({ ...f, discount_value: e.target.value }))} placeholder={discountForm.discount_type === "percentage" ? "20" : "500"} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Start date</label>
                  <input aria-label="Start date" type="date" value={discountForm.start_date} onChange={(e) => setDiscountForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>End date</label>
                  <input aria-label="End date" type="date" value={discountForm.end_date} onChange={(e) => setDiscountForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Max uses (optional)</label>
                <input type="number" value={discountForm.max_uses} onChange={(e) => setDiscountForm((f) => ({ ...f, max_uses: e.target.value }))} placeholder="Unlimited" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setDiscountModal(false)} className="px-4 py-2 text-sm font-medium border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitDiscount} disabled={discountSaving} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#1f1b16" }}>{discountSaving ? "Creating…" : "Create Code"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add inventory item modal */}
      {invModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setInvModal(false)}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Add Inventory Item</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Track a new supply or amenity.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Item name</label>
                <input value={invForm.item_name} onChange={(e) => setInvForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="Bath towels" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Category</label>
                <select aria-label="Category" value={invForm.category} onChange={(e) => setInvForm((f) => ({ ...f, category: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
                  {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Current stock</label>
                  <input type="number" value={invForm.current_stock} onChange={(e) => setInvForm((f) => ({ ...f, current_stock: e.target.value }))} placeholder="50" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Minimum stock</label>
                  <input type="number" value={invForm.minimum_stock} onChange={(e) => setInvForm((f) => ({ ...f, minimum_stock: e.target.value }))} placeholder="10" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Unit</label>
                  <input value={invForm.unit_type} onChange={(e) => setInvForm((f) => ({ ...f, unit_type: e.target.value }))} placeholder="pcs" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Price/unit (₱)</label>
                  <input type="number" value={invForm.price_per_unit} onChange={(e) => setInvForm((f) => ({ ...f, price_per_unit: e.target.value }))} placeholder="0" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setInvModal(false)} className="px-4 py-2 text-sm font-medium border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitInventory} disabled={invSaving} className="px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#1f1b16" }}>{invSaving ? "Adding…" : "Add Item"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Restock modal */}
      {restockModal.open && restockModal.item && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setRestockModal({ open: false, item: null, qty: "" })}>
          <div className="w-full max-w-sm border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Restock {restockModal.item.item}</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: "#8B6344" }}>Current: {restockModal.item.qty} {restockModal.item.unit} · min {restockModal.item.minQty}</p>
            <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Quantity to add</label>
            <input type="number" value={restockModal.qty} onChange={(e) => setRestockModal((m) => ({ ...m, qty: e.target.value }))} placeholder="20" className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }} />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setRestockModal({ open: false, item: null, qty: "" })} className="px-4 py-2 text-sm font-medium border cursor-pointer" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={submitRestock} className="px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>Restock</button>
            </div>
          </div>
        </div>
      )}

      <NewBookingWizard open={newBookingOpen} onClose={() => setNewBookingOpen(false)} onCreated={refetchBookings} />

      {/* Booking detail modal */}
      {viewBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setViewBooking(null)}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>{viewBooking.guest}</h3>
                <p className="font-mono text-xs mt-0.5" style={{ color: "#8B6344" }}>{viewBooking.displayId}</p>
              </div>
              <button type="button" onClick={() => setViewBooking(null)} title="Close" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#8B6344" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2.5">
              {[
                { icon: Mail, label: "Email", value: viewBooking.email || "—" },
                { icon: MapPin, label: "Room", value: viewBooking.room },
                { icon: CalendarDays, label: "Check-in", value: viewBooking.checkIn },
                { icon: Clock, label: "Stay", value: viewBooking.stayType },
                { icon: PhilippinePeso, label: "Amount", value: `₱${viewBooking.amount.toLocaleString()}` },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#FAFAF7" }}>
                  <row.icon className="w-4 h-4 flex-shrink-0" style={{ color: "#B07848" }} strokeWidth={1.75} />
                  <span className="text-xs font-medium w-20" style={{ color: "#8B6344" }}>{row.label}</span>
                  <span className="text-sm flex-1 text-right truncate" style={{ color: "#1a1a1a" }}>{row.value}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#FAFAF7" }}>
                <Shield className="w-4 h-4 flex-shrink-0" style={{ color: "#B07848" }} strokeWidth={1.75} />
                <span className="text-xs font-medium w-20" style={{ color: "#8B6344" }}>Status</span>
                <span className="ml-auto" style={{ fontSize: 12, color: (statusConfig[viewBooking.status] || statusConfig.pending).dot }}>{(statusConfig[viewBooking.status] || statusConfig.pending).label}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
