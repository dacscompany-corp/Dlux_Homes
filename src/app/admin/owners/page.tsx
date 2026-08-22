"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import DluxMark from "@/components/brand/DluxMark";
import toast from "react-hot-toast";
import { useGetAnalyticsSummaryQuery, useGetMonthlyRevenueQuery, useGetRevenueByRoomQuery } from "@/redux/api/analyticsApi";
import { useGetBookingsQuery, useUpdateBookingStatusMutation } from "@/redux/api/bookingsApi";
import { updateDepositStatusByBookingId, approveDownPaymentByBookingId } from "@/app/admin/csr/actions";
import {
  getPromotions, createPromotion, updatePromotion, deletePromotion, togglePromotionStatus,
  type PromotionRecord,
} from "@/app/admin/csr/actions";
import ImageThumb from "@/components/ImageThumb";
import { imageFileError } from "@/lib/validateImageFile";
import { useGetHavensQuery, useCreateHavenMutation, useUpdateHavenMutation } from "@/redux/api/roomApi";
import { useGetEmployeesQuery, useCreateEmployeeMutation } from "@/redux/api/employeeApi";
import { useGetReviewsQuery } from "@/redux/api/reviewsApi";
import { useGetReportsQuery } from "@/redux/api/reportApi";
import { useGetConversationsQuery } from "@/redux/api/messagesApi";
import { fmtWindow, fmtSpan } from "@/lib/stay-window";
import { BUNDLE_TIER1_LABEL, BUNDLE_TIER2_LABEL, BUNDLE_TIER3_LABEL, BUNDLE_TIER4_LABEL, securityDepositFor, DEPOSIT_DEFAULT } from "@/lib/pricing";
import PromotionModal, { type PromotionFormState } from "@/components/admin/PromotionModal";
import { checkInOpensLabel, isCheckInOpen } from "@/lib/checkin-window";
import {
  AnalyticsSection, BookingCalendarSection, BlockedDatesSection, CleaningManagementSection,
  PaymentMethodsSection, GuestAssistanceSection, UserManagementSection, PartnerManagementSection,
  PricingCalendarSection, Empty,
} from "@/components/admin/owners/OwnerModules";
import HavenWizard from "@/components/admin/owners/HavenWizard";
import NewBookingWizard from "@/components/admin/NewBookingWizard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DluxLoaderOverlay } from "@/components/brand/DluxLoader";
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
  Wallet,
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
  Pencil,
  ImageIcon,
  Trash2,
  CheckCircle2,
  Send,
  ChevronDown,
  Info,
  SlidersHorizontal,
  Bookmark,
} from "lucide-react";

// PromotionRecord types start_date/end_date as string, but server actions return
// raw pg rows where TIMESTAMP columns are Date objects (no JSON serialization
// in between) — normalize either shape to a yyyy-mm-dd <input type="date"> value.
function toDateInputValue(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

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
  "awaiting-payment": { label: "Awaiting Payment", color: "#9a3412", bg: "#ffedd5", dot: "#f97316" },
  "down-paid":  { label: "Down Paid",   color: "#3730a3", bg: "#e0e7ff", dot: "#6366f1" },
  confirmed:    { label: "Confirmed",   color: "#B07848", bg: "#F7F0E3", dot: "#B07848" },
  "checked-in": { label: "Checked In", color: "#065f46", bg: "#d1fae5", dot: "#10b981" },
  "checked-out":{ label: "Checked Out",color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
  rejected:     { label: "Rejected",   color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
  expired:      { label: "Expired",    color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
};

// The status filter groups the eight statuses by what the owner has to DO about
// them, rather than listing them flat — the old panel was an alphabetical-ish
// scroll where "Pending" (needs action now) sat next to "Expired" (needs
// nothing). "Closed" spans both columns because it is the row nobody is
// looking for and shouldn't take a whole column of prime space.
//
// Keys must exist in statusConfig above; STATUS_FILTER_KEYS is derived from
// these groups so "Select all" can never fall out of sync with what is shown.
const STATUS_GROUPS: { title: string; keys: string[]; span: number }[] = [
  { title: "Needs your action", keys: ["pending", "awaiting-payment"], span: 1 },
  { title: "In progress", keys: ["down-paid", "confirmed", "checked-in"], span: 1 },
  { title: "Closed", keys: ["checked-out", "rejected", "expired"], span: 2 },
];
const STATUS_FILTER_KEYS = STATUS_GROUPS.flatMap((g) => g.keys);

// Remembered across visits — the owner works the same queue every day, and
// re-picking "Pending + Awaiting Payment" on every page load was pure friction.
const STATUS_FILTER_KEY = "dlux-admin-status-filters";

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
  // Booking guide starts open, matching the design — it is reference material an
  // owner can collapse once the flow is familiar.
  const [guideOpen, setGuideOpen] = useState(false);
  const [financeTab, setFinanceTab]   = useState<"revenue"|"methods"|"promotions">("revenue");
  const [teamTab, setTeamTab]         = useState<"staff"|"users"|"partners">("staff");

  // ── Live data from the Supabase-backed API (RTK Query) ──
  const REVENUE_RANGES: Record<string, { name: string; label: string; months: string; days: string }> = {
    weekly:      { name: "Weekly",      label: "Last 4 weeks",     months: "1",  days: "28" },
    monthly:     { name: "Monthly",     label: "Last 6 months",    months: "6",  days: "180" },
    quarterly:   { name: "Quarterly",   label: "Last 3 quarters",  months: "9",  days: "270" },
    semiannual:  { name: "Semi-Annual", label: "Last 2 half-years",months: "12", days: "360" },
    annual:      { name: "Annual",      label: "Last 2 years",     months: "24", days: "730" },
  };
  const [revenueRange, setRevenueRange] = useState<keyof typeof REVENUE_RANGES>("monthly");
  const [revenueRangeOpen, setRevenueRangeOpen] = useState(false);
  const [monthlyBreakdownOpen, setMonthlyBreakdownOpen] = useState(false);
  // null = show all-time / range; a "YYYY-MM" string = filter to that month
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  // Overview KPI toggle: "collected" (cash actually received — down payments +
  // full payments already approved) vs "gross" (the full booked value of every
  // incoming booking, whether or not any payment has landed yet). Same window
  // and status filter as Total Revenue; only which payment-status branch of
  // the SQL SUM() is used differs (see analyticsController.ts summaryStatsQuery).
  const [revenueBasis, setRevenueBasis] = useState<"collected" | "gross">("collected");
  const { data: summaryRes }   = useGetAnalyticsSummaryQuery({ period: REVENUE_RANGES[revenueRange].days });
  const { data: monthlyRes }   = useGetMonthlyRevenueQuery({ months: "24" });
  const { data: roomRevRes }   = useGetRevenueByRoomQuery({ period: REVENUE_RANGES[revenueRange].days });
  const { data: bookingsData, refetch: refetchBookings } = useGetBookingsQuery();
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  // The panel is rendered through a PORTAL rather than inline, because the
  // bookings card it sits in is `overflow-hidden` (it needs to be, to clip the
  // table against its own border) — which silently cut the panel off at the
  // card's bottom edge. No amount of flipping or max-height fixes a clipping
  // ancestor; the panel has to leave the subtree entirely.
  //
  // Portalling means position:fixed in viewport coordinates, so this tracks the
  // button's rect and re-reads it whenever the page moves under it.
  const statusFilterBtnRef = useRef<HTMLButtonElement | null>(null);
  const [statusBtnRect, setStatusBtnRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!statusFilterOpen) return;
    const measure = () => {
      const r = statusFilterBtnRef.current?.getBoundingClientRect();
      if (r) setStatusBtnRect(r);
    };
    measure();
    window.addEventListener("resize", measure);
    // Capture phase: the dashboard scrolls in an inner container, not the
    // window, so a bubbling listener would never hear it.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [statusFilterOpen]);
  // Estimated height — enough to choose a side. Measuring the real node would
  // need a first paint to size against, which shows as a visible jump.
  const STATUS_PANEL_H = 430;
  const statusFilterUp = !!statusBtnRect
    && window.innerHeight - statusBtnRect.bottom < STATUS_PANEL_H
    && statusBtnRect.top > window.innerHeight - statusBtnRect.bottom;
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  // Restore in an effect rather than in useState's initialiser: reading
  // localStorage during the first render makes the server and client markup
  // disagree and React throws a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STATUS_FILTER_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      // Drop anything no longer in the group list, so a renamed or retired
      // status can't leave the owner with an invisible filter that silently
      // hides every booking.
      if (Array.isArray(parsed)) setStatusFilters(parsed.filter((k) => STATUS_FILTER_KEYS.includes(k)));
    } catch { /* ignore malformed/unavailable storage */ }
  }, []);
  const applyStatusFilters = useCallback((next: string[]) => {
    setStatusFilters(next);
    try { localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);
  const [recentStatusFilterOpen, setRecentStatusFilterOpen] = useState(false);
  const [recentStatusFilters, setRecentStatusFilters] = useState<string[]>([]);
  const { data: havensData }   = useGetHavensQuery({});
  const { data: employeesRes } = useGetEmployeesQuery({});
  const { data: reviewsRes }   = useGetReviewsQuery();
  const { data: reportsRes }   = useGetReportsQuery({});
  const { data: session }      = useSession();
  const ownerId = (session?.user as { id?: string } | undefined)?.id;

  // Promotions (auto-displayed banners) — same server actions as the CSR
  // dashboard's Promotions tab; requireAdmin() covers the Owner role too.
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const reloadPromotions = () => getPromotions().then(setPromotions).catch(() => {});
  useEffect(() => { reloadPromotions(); }, []);
  const togglePromotion = async (id: string, currentlyActive: boolean) => {
    try { await togglePromotionStatus(id, !currentlyActive); toast.success(currentlyActive ? "Promotion deactivated" : "Promotion activated"); reloadPromotions(); }
    catch { toast.error("Could not update promotion"); }
  };
  const removePromotion = async (id: string) => {
    try { await deletePromotion(id); toast.success("Promotion deleted"); reloadPromotions(); }
    catch { toast.error("Could not delete promotion"); }
  };
  const [promotionModal, setPromotionModal] = useState(false);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const emptyPromotion: PromotionFormState = { title: "", description: "", discount_type: "", discount_value: "", start_date: "", end_date: "", applies_to: [], redemption: "automatic", discount_code: "", per_night: false, max_discount: "" };
  const [promotionForm, setPromotionForm] = useState<PromotionFormState>(emptyPromotion);
  const [promotionImage, setPromotionImage] = useState<File | null>(null);
  const openCreatePromotion = () => { setEditingPromotionId(null); setPromotionForm(emptyPromotion); setPromotionImage(null); setPromotionModal(true); };
  const openEditPromotion = (p: PromotionRecord) => {
    setEditingPromotionId(p.id);
    setPromotionForm({
      title: p.title, description: p.description || "",
      discount_type: p.discount_type || "", discount_value: p.discount_value != null ? String(p.discount_value) : "",
      start_date: toDateInputValue(p.start_date), end_date: toDateInputValue(p.end_date),
      applies_to: p.applies_to ?? [],
      redemption: p.redemption ?? "automatic",
      discount_code: p.discount_code ?? "",
      per_night: p.per_night ?? false,
      max_discount: p.max_discount != null ? String(p.max_discount) : "",
    });
    setPromotionImage(null);
    setPromotionModal(true);
  };
  const submitPromotion = async () => {
    if (!promotionForm.title.trim() || !promotionForm.start_date || !promotionForm.end_date) {
      toast.error("Please fill in the title and the date range."); return;
    }
    if (promotionImage) {
      const err = imageFileError(promotionImage);
      if (err) { toast.error(err); return; }
    }
    setPromotionSaving(true);
    try {
      const fd = new FormData();
      fd.set("title", promotionForm.title.trim());
      fd.set("description", promotionForm.description.trim());
      fd.set("discount_type", promotionForm.discount_type);
      fd.set("discount_value", promotionForm.discount_value);
      fd.set("start_date", promotionForm.start_date);
      fd.set("end_date", promotionForm.end_date);
      // Repeated entries — the server reads these with formData.getAll().
      promotionForm.applies_to.forEach((t) => fd.append("applies_to", t));
      fd.set("redemption", promotionForm.redemption);
      fd.set("discount_code", promotionForm.discount_code);
      fd.set("per_night", promotionForm.per_night ? "true" : "false");
      fd.set("max_discount", promotionForm.max_discount);
      if (promotionImage) fd.set("image", promotionImage);

      if (editingPromotionId) await updatePromotion(editingPromotionId, fd);
      else await createPromotion(fd);

      toast.success(editingPromotionId ? "Promotion updated" : "Promotion created");
      setPromotionModal(false); setPromotionForm(emptyPromotion); setPromotionImage(null); setEditingPromotionId(null);
      reloadPromotions();
    } catch (err) {
      // Surface the real reason — a bare "Could not save promotion" hid a
      // framework-level body-size rejection here for a long time.
      toast.error(err instanceof Error && err.message ? err.message : "Could not save promotion");
    }
    finally { setPromotionSaving(false); }
  };
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
    requestedNewDate: string;
    // Empty until the self check-in instructions have actually gone out. Drives
    // the manual "Send instructions now" backstop after an early check-in.
    selfCheckinEmailSentAt: string;
    // Everyone on the booking beyond the main guest, each with their own ID.
    additionalGuests: { name: string; age: string; gender: string; validIdUrl: string }[];
  };
  const [bookingModal, setBookingModal] = useState<AdminBookingRow | null>(null);

  // Guest-record PDF download. Fetched as a blob rather than navigated to, so a
  // 401/500 surfaces as a toast instead of the browser replacing the dashboard
  // with a raw error page — and so the button can show progress while the
  // server pulls each ID photo from Cloudinary.
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadGuestRecord = async (displayId: string) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(displayId)}/guest-record`);
      if (!res.ok) {
        let msg = `Could not build the PDF (error ${res.status}).`;
        try { msg = (await res.json())?.error || msg; } catch { /* non-JSON error page */ }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guest-record-${displayId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Freeze the page behind the booking board. Without this the dashboard keeps
  // its own scrollbar and scrolls under the overlay — the wheel moves the page
  // instead of the board, which reads as the modal being broken. Restores the
  // previous value rather than assuming "visible", so it nests safely with any
  // other component that locks scrolling.
  useEffect(() => {
    if (!bookingModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [bookingModal]);
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

  // Report the status change AND whether the guest was actually emailed about
  // it. These are two separate outcomes: the booking moves regardless, but a
  // guest who was never told is a real problem the owner has to know about —
  // it used to be swallowed into a plain "Booking approved" toast. `res` is the
  // updateBookingStatus response; emailStatus is null when the status sends no
  // email at all, which is a success, not a silent failure.
  type StatusEmailResult = { emailStatus?: { kind: string; ok: boolean; detail?: string } | null };
  const reportStatusChange = (res: unknown, okMessage: string) => {
    const email = (res as StatusEmailResult | undefined)?.emailStatus;
    if (email && !email.ok) {
      toast(`${okMessage}, but the ${email.kind} email did NOT reach the guest.`,
        { icon: "⚠️", duration: 9000 });
      // The detail carries the URL and the failure body — the thing that
      // actually identifies a misconfigured NEXTAUTH_URL or a blocked route.
      console.error(`Email send failed (${email.kind}):`, email.detail);
      return;
    }
    toast.success(okMessage);
  };

  const handleApproveBooking = async (id: string) => {
    try {
      const res = await updateBookingStatus({ id, status: "approved" }).unwrap();
      reportStatusChange(res, "Booking approved");
    }
    catch { toast.error("Could not approve booking"); }
  };
  // Approve the down payment → moves an "Awaiting Payment" booking to Confirmed.
  // Two steps (same as CSR): approveDownPayment flips status to "on-going" and
  // marks the payment approved, then setting status back to "approved" with the
  // payment already approved normalizes to "confirmed" (ready to check in).
  const handleConfirmPayment = async (id: string) => {
    try {
      await approveDownPaymentByBookingId(id);
      const res = await updateBookingStatus({ id, status: "approved" }).unwrap();
      reportStatusChange(res, "Down payment approved — booking confirmed");
      refetchBookings();
    } catch { toast.error("Could not confirm the down payment"); }
  };
  const submitRejectBooking = async () => {
    try {
      const res = await updateBookingStatus({ id: rejectModal.id, status: "rejected", rejection_reason: rejectModal.reason.trim() || "Rejected by admin" }).unwrap();
      reportStatusChange(res, "Booking rejected");
      setRejectModal({ open: false, id: "", reason: "" });
    } catch { toast.error("Could not reject booking"); }
  };

  // Check-in collects the remaining 50% balance + refundable deposit, then
  // flips the booking to checked-in (settles the balance on booking_payments and
  // records the deposit as held). Mirrors the CSR check-in flow. Deposit scales
  // with nights booked (securityDepositFor()) — carried in state so the modal
  // and confirmCollect() don't need to re-derive it from the booking list.
  const [checkIn, setCheckIn] = useState<{ open: boolean; id: string; displayId: string; guest: string; remaining: number; deposit: number; method: string; busy: boolean }>(
    { open: false, id: "", displayId: "", guest: "", remaining: 0, deposit: DEPOSIT_DEFAULT, method: "Cash", busy: false }
  );
  const openCheckIn = (b: { id: string; displayId: string; guest: string; remaining: number; checkInRaw: string; checkOutRaw: string }) =>
    setCheckIn({ open: true, id: b.id, displayId: b.displayId, guest: b.guest, remaining: Math.max(0, b.remaining), deposit: securityDepositFor(nightsBetween(b.checkInRaw, b.checkOutRaw), undefined, depositRates), method: "Cash", busy: false });
  // Send the self check-in instructions — the four steps, what to pay on
  // arrival, and where to send it. House rules are not part of this email; they
  // go out with Collect. The route re-stamps self_checkin_email_sent_at, so the
  // cron won't then send a duplicate. Best-effort: a mail failure mustn't read
  // as a failed check-in.
  const sendCheckInInstructions = (id: string) =>
    fetch("/api/send-self-checkin-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: id }),
    }).catch(() => {});

  // Check in — arrival only, no money. Collecting the balance is a separate
  // step (see confirmCollect) so a guest can be marked arrived without waiting
  // on payment.
  //
  // Marking someone arrived is always allowed, including days ahead — the owner
  // may know the guest is coming early. The check-in *window* governs the email
  // only: sending a guest their door code a week out would be a real leak, so
  // an early check-in defers the mail to the cron, which releases it at the
  // normal moment (it matches 'checked-in' rows too — see the cron's status
  // filter). If the cron isn't running, the Bookings row keeps a manual
  // "Send instructions now" button as the backstop.
  const handleCheckInOnly = async (b: { id: string; checkInRaw: string; checkInTime: string }) => {
    const { id } = b;
    try {
      await updateBookingStatus({ id, status: "checked-in" }).unwrap();
      if (isCheckInOpen(b.checkInRaw, b.checkInTime)) {
        sendCheckInInstructions(id);
        toast.success("Guest checked in — check-in instructions sent");
      } else {
        const opensAt = checkInOpensLabel(b.checkInRaw, b.checkInTime);
        toast.success(
          opensAt
            ? `Guest checked in early — instructions send ${opensAt}`
            : "Guest checked in early — instructions not sent yet",
        );
      }
      refetchBookings();
    } catch {
      toast.error("Could not check the guest in");
    }
  };

  // Backstop for an early check-in whose instructions are still pending. The
  // cron that would normally release them runs off an external pinger, so if
  // that isn't live the guest would otherwise get nothing at all. Unlike the
  // automatic path this reports failure — the owner is sending deliberately and
  // needs to know if it didn't land.
  const [sendingInstructions, setSendingInstructions] = useState<string | null>(null);
  const handleSendInstructionsNow = async (id: string) => {
    if (sendingInstructions) return;
    setSendingInstructions(id);
    try {
      const res = await fetch("/api/send-self-checkin-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Check-in instructions sent");
      refetchBookings();
    } catch {
      toast.error("Could not send the check-in instructions");
    } finally {
      setSendingInstructions(null);
    }
  };

  // Collect the remaining balance + refundable deposit in one handover, then
  // send the house-rules email.
  const confirmCollect = async () => {
    setCheckIn((c) => ({ ...c, busy: true }));
    try {
      const collected = checkIn.remaining + checkIn.deposit;
      await updateDepositStatusByBookingId(checkIn.id, "Paid", undefined, undefined, collected, checkIn.method, "owner");
      // Best-effort: the money is already recorded, so a mail failure must not
      // look like the collection failed.
      fetch(`/api/send-checkin-email/for-booking/${encodeURIComponent(checkIn.id)}`, { method: "POST" })
        .catch(() => {});
      toast.success("Balance & deposit collected — house rules sent");
      setCheckIn({ open: false, id: "", displayId: "", guest: "", remaining: 0, deposit: DEPOSIT_DEFAULT, method: "Cash", busy: false });
      refetchBookings();
    } catch {
      toast.error("Could not record the payment");
      setCheckIn((c) => ({ ...c, busy: false }));
    }
  };
  // Check out → completes the booking (keeps the record + unlocks guest review).
  const handleCheckOut = async (id: string) => {
    try {
      const res = await updateBookingStatus({ id, status: "completed" }).unwrap();
      reportStatusChange(res, "Guest checked out — booking completed");
      refetchBookings();
    }
    catch { toast.error("Could not check out the guest"); }
  };
  const decideDateChange = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/date-change`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not process the date-change request"); return; }
      toast.success(action === "approve" ? "Date change approved" : "Date change rejected");
      refetchBookings();
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
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

  // Revenue chart — normalize monthly revenue to bar heights (Overview + Finance)
  const monthly = (monthlyRes?.data as { month: string; revenue: number; gross_revenue: number }[]) || [];

  // When a month is selected, derive KPI values from that month's data only.
  const monthEntry = selectedMonth ? monthly.find((m) => m.month === selectedMonth) : null;
  const monthBookings = selectedMonth
    ? toRows(bookingsData).filter((b) => b.check_in_date && String(b.check_in_date).slice(0, 7) === selectedMonth).length
    : null;
  const monthRevenue = monthEntry ? Number(monthEntry.revenue) || 0 : null;
  const monthGrossRevenue = monthEntry ? Number(monthEntry.gross_revenue) || 0 : null;
  const monthLabel = selectedMonth
    ? new Date(selectedMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" })
    : null;

  const kpis = [
    { label: "Total Bookings", value: selectedMonth ? String(monthBookings ?? 0) : String(s?.total_bookings ?? 0), change: selectedMonth ? "—" : pct(s?.bookings_change ?? 0), icon: CalendarDays, iconBg: "#F7F0E3", iconColor: "#B07848" },
    revenueBasis === "gross"
      ? { label: "Gross Revenue", value: selectedMonth ? peso(monthGrossRevenue ?? 0) : peso(s?.total_gross_revenue ?? 0), change: selectedMonth ? "—" : pct(s?.gross_revenue_change ?? 0), icon: PhilippinePeso, iconBg: "#d1fae5", iconColor: "#059669" }
      : { label: "Total Revenue", value: selectedMonth ? peso(monthRevenue ?? 0) : peso(s?.total_revenue ?? 0), change: selectedMonth ? "—" : pct(s?.revenue_change ?? 0), icon: PhilippinePeso, iconBg: "#d1fae5", iconColor: "#059669" },
    { label: "Occupancy Rate", value: `${Math.round(s?.occupancy_rate ?? 0)}%`, change: selectedMonth ? "—" : pct(s?.occupancy_change ?? 0), icon: TrendingUp, iconBg: "#ede9fe", iconColor: "#7c3aed" },
    { label: "Total Guests",   value: String(s?.new_guests ?? 0), change: selectedMonth ? "—" : pct(s?.guests_change ?? 0), icon: UserCheck, iconBg: "#ffedd5", iconColor: "#ea580c" },
    { label: "Reviews",        value: String(reviewsList.length), change: "—", icon: Star,      iconBg: "#fef9c3", iconColor: "#ca8a04" },
    { label: "Active Rooms",   value: String(havensList.length),  change: "—", icon: BedDouble, iconBg: "#ccfbf1", iconColor: "#0d9488" },
  ];
  const maxRev = Math.max(1, ...monthly.map((m) => Number(m.revenue) || 0));
  // Overview chart only: reads gross_revenue and its own max when the
  // Collected/Gross toggle is set to "gross", collected revenue otherwise.
  // Finance's chart below (monthly/maxRev directly) always stays collected.
  const maxGrossRev = Math.max(1, ...monthly.map((m) => Number(m.gross_revenue) || 0));
  const overviewRevenueSource = selectedMonth ? monthly.filter((m) => m.month === selectedMonth) : monthly;
  const overviewRevenueData = overviewRevenueSource.map((m) => {
    const amount = revenueBasis === "gross" ? Number(m.gross_revenue) || 0 : Number(m.revenue) || 0;
    const max = revenueBasis === "gross" ? maxGrossRev : maxRev;
    return {
      month: /^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "short" }) : m.month,
      amount,
      value: Math.round((amount / max) * 100),
    };
  });
  const overviewRevenueTotal = overviewRevenueData.reduce((t, m) => t + m.amount, 0);
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
    requestedNewDate: b.requested_new_date ? String(b.requested_new_date) : "",
    selfCheckinEmailSentAt: b.self_checkin_email_sent_at ? String(b.self_checkin_email_sent_at) : "",
    additionalGuests: (Array.isArray(b.additional_guests) ? b.additional_guests : []).map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return {
        name: `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim(),
        age: x.age == null ? "" : String(x.age),
        gender: String(x.gender ?? ""),
        validIdUrl: String(x.valid_id_url ?? ""),
      };
    }),
  }));
  const filteredAdminBookings = statusFilters.length
    ? allAdminBookings.filter((b) => statusFilters.includes(b.status))
    : allAdminBookings;
  // Counts come from the UNFILTERED list on purpose: they tell the owner how
  // much is in each status, so counting only what survives the current filter
  // would show 0 against every box they haven't ticked.
  const statusCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of allAdminBookings) out[b.status] = (out[b.status] ?? 0) + 1;
    return out;
  }, [allAdminBookings]);
  const recentAdminBookings = recentStatusFilters.length
    ? allAdminBookings.filter((b) => recentStatusFilters.includes(b.status))
    : allAdminBookings;

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

  // Reviews (Communication) — field names mirror /api/reviews/all exactly:
  // guest_first_name/guest_last_name and overall_rating (not guest_name/rating).
  const reviews = reviewsList.map((r, i) => ({
    id: (r.id as number) ?? i,
    guest: `${r.guest_first_name ?? ""} ${r.guest_last_name ?? ""}`.trim() || "Guest",
    haven: String(r.haven_name || r.room_name || "—"),
    rating: Math.round(Number(r.overall_rating ?? 0)),
    comment: String(r.comment || ""),
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
  // Owner-configured security deposit tiers, for securityDepositFor(). Single-
  // property app — h0 is the haven — so this is a plain snake_case -> camelCase
  // pluck rather than a full havenToRoom() conversion.
  const depositRates = {
    securityDeposit: h0.security_deposit != null ? Number(h0.security_deposit) : undefined,
    depositTier1Amount: h0.deposit_tier1_amount != null ? Number(h0.deposit_tier1_amount) : undefined,
    depositTier2Amount: h0.deposit_tier2_amount != null ? Number(h0.deposit_tier2_amount) : undefined,
    depositTier3Amount: h0.deposit_tier3_amount != null ? Number(h0.deposit_tier3_amount) : undefined,
    depositTier4Amount: h0.deposit_tier4_amount != null ? Number(h0.deposit_tier4_amount) : undefined,
  };
  const rnum = (v: unknown) => Number(v ?? 0);
  // Overnight-only long-term stay tiers — flat rate, no weekday/weekend
  // split. null entries mean that tier isn't configured yet.
  const rnumOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const longtermActive = h0.longterm_active !== false;
  const overnightBundles = [
    { label: `Tier 1 (${BUNDLE_TIER1_LABEL})`, rate: rnumOrNull(h0.longterm_tier1_rate) },
    { label: `Tier 2 (${BUNDLE_TIER2_LABEL})`, rate: rnumOrNull(h0.longterm_tier2_rate) },
    { label: `Tier 3 (${BUNDLE_TIER3_LABEL})`, rate: rnumOrNull(h0.longterm_tier3_rate) },
    { label: `Tier 4 (${BUNDLE_TIER4_LABEL})`, rate: rnumOrNull(h0.longterm_tier4_rate) },
  ];
  const stayRates = [
    // Name, window and length all come from the haven row. These were literal
    // strings ("19:00 – 16:00", "21h"), so this card claimed to show "the live
    // rates guests are charged" while ignoring the saved times entirely.
    // `key` is what the bundle block below keys off — never the display name.
    { key: "day", name: "Daycation", window: fmtWindow(h0.ten_hour_check_in, h0.ten_hour_check_out), span: fmtSpan(h0.ten_hour_check_in, h0.ten_hour_check_out), weekday: rnum(h0.ten_hour_rate), weekend: rnum(h0.six_hour_rate) },
    { key: "night", name: "Nightcation", window: fmtWindow(h0.six_hour_check_in, h0.six_hour_check_out), span: fmtSpan(h0.six_hour_check_in, h0.six_hour_check_out), weekday: rnum(h0.ten_hour_rate), weekend: rnum(h0.six_hour_rate) },
    { key: "overnight", name: "Overnight", window: fmtWindow(h0.twenty_one_hour_check_in, h0.twenty_one_hour_check_out), span: fmtSpan(h0.twenty_one_hour_check_in, h0.twenty_one_hour_check_out), weekday: rnum(h0.weekday_rate), weekend: rnum(h0.weekend_rate) },
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
    // conversations rows carry `type` ("internal" | "guest"), not a role column
    kind: String(c.type || "internal"),
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

      {/* The 4-page guest record is built server-side and takes seconds. The
          mark doesn't read at button size, so the feedback goes here instead of
          inside the button. Blocking is deliberate: `downloadGuestRecord`
          already bails on a second call while one is running, and an overlay
          makes that guard visible rather than swallowing the click silently. */}
      {pdfBusy && (
        <DluxLoaderOverlay
          label={"Building\nguest record"}
          note="Assembling the 4-page PDF. Your download will start automatically."
        />
      )}

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
        <div className="px-2 py-1 flex items-center justify-between border-b" style={{ borderColor: "rgba(250,247,241,0.1)" }}>
          <Link href="/rooms" className="flex items-center min-w-0 flex-1">
            <DluxMark layout="compact" accent="gold" dark width={180} ambient={false} />
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
          <div className="flex items-center justify-between mb-6 flex-wrap" style={{ gap: 12 }}>
            <div className="mb-0">
              {tabBar([{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "analytics", label: "Analytics & Reports", icon: BarChart3 }], overviewTab, (id) => setOverviewTab(id as "dashboard" | "analytics"))}
            </div>
            {overviewTab === "dashboard" && (
              <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
                {/* Collected (cash actually received) vs Gross (full value of
                    every incoming booking, before any payment lands) — swaps
                    what the "Total/Gross Revenue" KPI card above shows. */}
                <div className="inline-flex" style={{ border: "1px solid #D4BFA0", background: "#F7F0E3" }}>
                  <button type="button" onClick={() => setRevenueBasis("collected")}
                    className="cursor-pointer"
                    style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: revenueBasis === "collected" ? "#1f1b16" : "#8a8276", background: revenueBasis === "collected" ? "#fff" : "transparent", border: "none" }}>
                    Collected
                  </button>
                  <button type="button" onClick={() => setRevenueBasis("gross")}
                    className="cursor-pointer"
                    style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, color: revenueBasis === "gross" ? "#1f1b16" : "#8a8276", background: revenueBasis === "gross" ? "#fff" : "transparent", border: "none", borderLeft: "1px solid #D4BFA0" }}>
                    Gross Revenue
                  </button>
                </div>
                {/* Month navigator: prev | current | next + Today */}
                {(() => {
                  const now = new Date();
                  const base = selectedMonth
                    ? new Date(selectedMonth + "-01")
                    : new Date(now.getFullYear(), now.getMonth(), 1);
                  const prevDate = new Date(base.getFullYear(), base.getMonth() - 1, 1);
                  const nextDate = new Date(base.getFullYear(), base.getMonth() + 1, 1);
                  const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const prevLabel = prevDate.toLocaleString("en", { month: "long" });
                  const nextLabel = nextDate.toLocaleString("en", { month: "long" });
                  const currentLabel = base.toLocaleString("en", { month: "long", year: "numeric" });
                  return (
                    <div className="inline-flex" style={{ border: "1px solid #D4BFA0" }}>
                      <button type="button" onClick={() => setSelectedMonth(toKey(prevDate))}
                        className="inline-flex items-center cursor-pointer"
                        style={{ gap: 5, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: "#B07848", background: "#F7F0E3", border: "none", borderRight: "1px solid #D4BFA0", fontFamily: "inherit" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#efe4ce"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#F7F0E3"}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        {prevLabel}
                      </button>
                      <div style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#1f1b16", background: "#fff", borderRight: "1px solid #D4BFA0", minWidth: 148, textAlign: "center" }}>
                        {currentLabel}
                      </div>
                      <button type="button" onClick={() => setSelectedMonth(toKey(nextDate))}
                        className="inline-flex items-center cursor-pointer"
                        style={{ gap: 5, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: "#B07848", background: "#F7F0E3", border: "none", borderRight: selectedMonth ? "1px solid #D4BFA0" : "none", fontFamily: "inherit" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#efe4ce"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#F7F0E3"}>
                        {nextLabel}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                      {selectedMonth && (
                        <button type="button" onClick={() => setSelectedMonth(null)}
                          className="cursor-pointer"
                          style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#B07848", background: "#F7F0E3", border: "none", fontFamily: "inherit" }}
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "#efe4ce"}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#F7F0E3"}>
                          All
                        </button>
                      )}
                    </div>
                  );
                })()}
                <div style={{ position: "relative" }}>
                <button type="button" onClick={() => setRevenueRangeOpen((v) => !v)}
                  className="inline-flex items-center cursor-pointer"
                  style={{ gap: 8, padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#5a4a3a", background: "#F7F0E3", border: "1px solid #D4BFA0" }}>
                  {REVENUE_RANGES[revenueRange].name}
                  <ChevronDown className="w-3.5 h-3.5" style={{ transform: revenueRangeOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
                </button>
                {revenueRangeOpen && (
                  <>
                    <div onClick={() => setRevenueRangeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70, width: 176, background: "#ffffff", border: "1px solid #ece5d4", boxShadow: "0 18px 44px -16px rgba(40,30,18,.30)", borderRadius: 4, overflow: "hidden" }}>
                      {(Object.keys(REVENUE_RANGES) as (keyof typeof REVENUE_RANGES)[]).map((key) => (
                        <button key={key} type="button" onClick={() => { setRevenueRange(key); setRevenueRangeOpen(false); }}
                          className="w-full text-left cursor-pointer"
                          style={{ display: "block", padding: "9px 14px", fontSize: 13, color: key === revenueRange ? "#1f1b16" : "#5a4a3a", fontWeight: key === revenueRange ? 600 : 400, background: key === revenueRange ? "#F7F0E3" : "transparent", border: "none" }}
                          onMouseEnter={(e) => { if (key !== revenueRange) (e.currentTarget as HTMLElement).style.backgroundColor = "#faf7f1"; }}
                          onMouseLeave={(e) => { if (key !== revenueRange) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                          {REVENUE_RANGES[key].name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                </div>
              </div>
            )}
          </div>
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
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Revenue overview</h3>
                    {/* Identifies which figure the bars/total below are showing
                        — follows the Collected/Gross Revenue toggle above. */}
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
                      padding: "2px 8px", borderRadius: 999,
                      color: revenueBasis === "gross" ? "#8C5A2E" : "#059669",
                      background: revenueBasis === "gross" ? "#F3E4CB" : "#d1fae5",
                    }}>
                      {revenueBasis === "gross" ? "Gross" : "Collected"}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#8a8276", margin: "8px 0 0" }}>{selectedMonth ? monthLabel : REVENUE_RANGES[revenueRange].label}</p>
                </div>
                <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", color: "#1f1b16" }}>{peso(overviewRevenueTotal)}</div>
              </div>
              <div style={{ padding: "18px 24px 24px" }}>
                <div className="flex items-end gap-3" style={{ height: 160 }}>
                  {overviewRevenueData.map((item) => (
                    <div key={item.month} className="flex-1 flex flex-col items-center" style={{ gap: 8 }}>
                      <div className="w-full flex items-end justify-center" style={{ height: 120 }}>
                        <div style={{ width: "100%", height: `${item.value}%`, background: "#b8754a" }} />
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
                <p style={{ fontSize: 12, color: "#8a8276", margin: "7px 0 0" }}>{recentAdminBookings.length} total records</p>
              </div>
              <div className="flex items-center" style={{ gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <button type="button" onClick={() => setRecentStatusFilterOpen((v) => !v)}
                    className="flex items-center gap-1.5 cursor-pointer"
                    style={{ gap: 8, padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#5a4a3a", background: "#F7F0E3", border: "1px solid #D4BFA0" }}>
                    Status{recentStatusFilters.length > 0 ? ` (${recentStatusFilters.length})` : ""}
                    <ChevronDown className="w-3.5 h-3.5" style={{ transform: recentStatusFilterOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
                  </button>
                  {recentStatusFilterOpen && (
                    <>
                      <div onClick={() => setRecentStatusFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
                      <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70, width: 220, background: "#ffffff", border: "1px solid #ece5d4", boxShadow: "0 18px 44px -16px rgba(40,30,18,.30)", borderRadius: 4, overflow: "hidden" }}>
                        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #F7F0E3" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8B6344", textTransform: "uppercase", letterSpacing: ".06em" }}>Filter by status</span>
                          {recentStatusFilters.length > 0 && (
                            <button type="button" onClick={() => setRecentStatusFilters([])} style={{ fontSize: 11.5, color: "#B07848", cursor: "pointer", background: "transparent", border: "none" }}>Clear</button>
                          )}
                        </div>
                        <div style={{ maxHeight: 260, overflowY: "auto" }}>
                          {Object.entries(statusConfig).map(([key, cfg]) => {
                            const checked = recentStatusFilters.includes(key);
                            return (
                              <label key={key} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                                style={{ fontSize: 13, color: "#1f1b16" }}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "#faf7f1"}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}>
                                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? "#1f1b16" : "#D4BFA0"}`, background: checked ? "#1f1b16" : "transparent", display: "grid", placeItems: "center", flex: "none" }}>
                                  {checked && <Check className="w-3 h-3" style={{ color: "#fff" }} />}
                                </span>
                                <input type="checkbox" checked={checked} onChange={() => setRecentStatusFilters((prev) => checked ? prev.filter((s) => s !== key) : [...prev, key])} style={{ display: "none" }} />
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flex: "none" }} />
                                {cfg.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
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
                  {recentAdminBookings.map((booking, idx) => {
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
                                onClick={() => openCheckIn({ id: booking.id, displayId: booking.displayId, guest: booking.guest, remaining: booking.balance, checkInRaw: booking.checkInRaw, checkOutRaw: booking.checkOutRaw })}
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
                            {booking.status === "checked-in" && booking.balance > 0 && (
                              <button
                                type="button"
                                onClick={() => openCheckIn({ id: booking.id, displayId: booking.displayId, guest: booking.guest, remaining: booking.balance, checkInRaw: booking.checkInRaw, checkOutRaw: booking.checkOutRaw })}
                                disabled={bookingUpdating}
                                title="Collect remaining balance + deposit (sends the house rules)"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                style={{ color: "#6b7280" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#fef3c7"; (e.currentTarget as HTMLElement).style.color = "#b45309"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Check-out only opens once the balance is settled —
                                Collect has to happen first, so the two never
                                show side by side. */}
                            {booking.status === "checked-in" && booking.balance <= 0 && (
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
                  {recentAdminBookings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-14 text-center">
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F7F0E3", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                          {allAdminBookings.length === 0
                            ? <CalendarDays className="w-5 h-5" style={{ color: "#B07848" }} />
                            : <Search className="w-5 h-5" style={{ color: "#B07848" }} />}
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "#5a4a3a" }}>
                          {allAdminBookings.length === 0 ? "No bookings yet" : "No bookings match this filter"}
                        </p>
                        <p style={{ fontSize: 12.5, color: "#8B6344", marginTop: 4 }}>
                          {allAdminBookings.length === 0
                            ? "New bookings will show up here."
                            : "Try clearing or changing the status filter."}
                        </p>
                        {recentStatusFilters.length > 0 && (
                          <button type="button" onClick={() => setRecentStatusFilters([])}
                            className="cursor-pointer"
                            style={{ marginTop: 14, fontSize: 12.5, fontWeight: 500, color: "#5a4a3a", background: "#F7F0E3", border: "1px solid #D4BFA0", borderRadius: 4, padding: "7px 14px" }}>
                            Clear status filter
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
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
          {bookingsTab === "list" && (<>
          {/* Booking guide. Collapsible — it is long, and an owner who already
              knows the flow shouldn't have to scroll past it every visit. */}
          <section className="mb-5" style={{ background: "#fff", border: "1px solid #ece5d4" }}>
            <div className="flex items-start justify-between gap-6 px-6 py-5" style={{ borderBottom: guideOpen ? "1px solid #f2ece0" : "none" }}>
              <div style={{ maxWidth: 640 }}>
                <h3 style={{ fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 400, fontSize: 22, lineHeight: 1, margin: "0 0 8px", color: "#1f1b16" }}>
                  What each booking button does
                </h3>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "#6b6358" }}>
                  A booking moves through five steps, from a new request to the guest leaving. In the table
                  below, you only ever see the buttons for the step a booking is on right now — so if a
                  button isn&rsquo;t there, it isn&rsquo;t your turn yet.
                </p>
              </div>
              <button type="button" onClick={() => setGuideOpen((v) => !v)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f3eee2"; e.currentTarget.style.color = "#1f1b16"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#faf7f1"; e.currentTarget.style.color = "#6b6358"; }}
                style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: "#6b6358", background: "#faf7f1", border: "1px solid #e8e1d2", cursor: "pointer" }}>
                {guideOpen ? "Hide guide" : "Show guide"}
                <ChevronDown className="w-3.5 h-3.5" style={{ transform: guideOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
              </button>
            </div>

            {guideOpen && (
              <div className="p-6">
                <div style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8B6344", marginBottom: 16 }}>
                  The five steps, in order
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {[
                    { n: 1, label: "Approve", icon: Check, bg: "#10b981", desc: "Say yes to a new booking request. The guest is told their dates are accepted and is asked to pay the down payment." },
                    { n: 2, label: "Confirm payment", icon: CheckCircle2, bg: "#059669", desc: "Use this once the down payment has landed. The booking status changes to Confirmed and the room is held for the guest." },
                    { n: 3, label: "Check in", icon: LogIn, bg: "#3b82f6", desc: "Mark that the guest has arrived. You can do this at any time, even days before their stay starts." },
                    { n: 4, label: "Collect", icon: Wallet, bg: "#b45309", desc: "Take what's still owed plus the refundable security deposit (scales with nights booked). The house rules are emailed to the guest for you." },
                    { n: 5, label: "Check out", icon: LogOut, bg: "#ef4444", desc: "The guest has left and the stay is finished. This closes the booking for good." },
                  ].map((s) => (
                    <div key={s.n} style={{ background: "#faf7f1", border: "1px solid #f0e9db", padding: "18px 16px 16px" }}>
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="grid place-items-center rounded-full" style={{ width: 30, height: 30, flex: "none", background: s.bg }}>
                          <s.icon className="w-[15px] h-[15px] text-white" />
                        </span>
                        <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, color: "#b0a695" }}>STEP {s.n}</span>
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#1f1b16" }}>{s.label}</p>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#6b6358" }}>{s.desc}</p>
                    </div>
                  ))}
                </div>

                {/* The least obvious behaviour in the flow, so it gets its own callout. */}
                <div className="flex gap-3 items-start mt-4" style={{ padding: "14px 16px", background: "#fdf6ec", border: "1px solid #f0e2cb" }}>
                  <Info className="w-[17px] h-[17px] mt-px" style={{ flex: "none", color: "#b8754a" }} />
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#6b5b45" }}>
                    <strong style={{ color: "#4a3d2c", fontWeight: 600 }}>About the arrival email.</strong>{" "}
                    Door codes and arrival instructions are sent to the guest automatically, 2 hours before
                    check-in time. If you check someone in early, the email is not rushed out ahead of
                    schedule — they are simply marked as arrived.
                  </p>
                </div>

                <div style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8B6344", margin: "28px 0 6px" }}>
                  If something else comes up
                </div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8a8276" }}>
                  These aren&rsquo;t part of the normal order. They show up next to the step buttons when they apply.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {[
                    { label: "View", icon: Eye, bg: "#8B6344", desc: "Open the whole booking — guest, dates, room and payments. Always available." },
                    { label: "Send instructions", icon: Send, bg: "#b08968", desc: "Send the arrival email yourself. Only appears while the automatic one hasn't gone out yet." },
                    { label: "Reject", icon: XCircle, bg: "#dc2626", desc: "Turn down a new request. You'll be asked to give a reason, which the guest receives." },
                    { label: "Approve date change", icon: CalendarDays, bg: "#059669", desc: "The guest asked to move their stay. This accepts their new dates." },
                    { label: "Reject date change", icon: CalendarOff, bg: "#b91c1c", desc: "Say no to the move. The stay keeps the dates that were originally booked." },
                  ].map((s) => (
                    <div key={s.label} style={{ border: "1px solid #f0e9db", padding: 16 }}>
                      <span className="grid place-items-center rounded-full mb-2.5" style={{ width: 26, height: 26, background: s.bg }}>
                        <s.icon className="w-[13px] h-[13px] text-white" />
                      </span>
                      <p style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 600, color: "#1f1b16" }}>{s.label}</p>
                      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#6b6358" }}>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <div className="border overflow-hidden" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#ece5d4" }}>
              <div>
                <h3 className="font-bold" style={{ color: "#1a1a1a" }}>All Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: "#8B6344" }}>
                  {statusFilters.length
                    ? `${filteredAdminBookings.length} of ${allAdminBookings.length} records`
                    : `${allAdminBookings.length} total records`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div style={{ position: "relative" }}>
                  <button type="button" ref={statusFilterBtnRef} onClick={() => setStatusFilterOpen((v) => !v)}
                    className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: "#F7F0E3", color: "#5a4a3a", border: "1px solid #D4BFA0" }}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Status
                    {statusFilters.length > 0 && (
                      <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, padding: "1px 6px", background: "#1f1b16", color: "#faf7f1" }}>{statusFilters.length}</span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5" style={{ transform: statusFilterOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
                  </button>
                  {statusFilterOpen && statusBtnRect && typeof document !== "undefined" && createPortal(
                    <>
                      <div onClick={() => setStatusFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
                      {/* Wide enough to show all eight statuses at once — the old
                          220px panel scrolled, so half the statuses were hidden
                          behind a scrollbar the owner had to discover. Capped
                          against the viewport so it can't overflow a narrow window. */}
                      <div style={{
                        position: "fixed",
                        // Right-aligned to the button, in viewport coordinates.
                        right: Math.max(16, window.innerWidth - statusBtnRect.right),
                        ...(statusFilterUp
                          ? { bottom: window.innerHeight - statusBtnRect.top + 8 }
                          : { top: statusBtnRect.bottom + 8 }),
                        zIndex: 70, width: 520, maxWidth: "calc(100vw - 32px)",
                        // Last-resort clamp: on a genuinely short window neither
                        // side fits, and an unreachable footer is worse than a
                        // scrollbar the design would rather not have.
                        maxHeight: "calc(100vh - 32px)", overflowY: "auto",
                        background: "#ffffff", border: "1px solid #e4dac5", boxShadow: "0 24px 56px -18px rgba(40,30,18,.34)", borderRadius: 6,
                      }}>
                        <div style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #F2EADA", background: "#FCFAF5" }}>
                          <span style={{ flex: "none", whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 600, color: "#8B6344", textTransform: "uppercase", letterSpacing: ".06em" }}>Filter by status</span>
                          <div style={{ display: "flex", flex: "none", alignItems: "center", gap: 14, whiteSpace: "nowrap" }}>
                            <button type="button" onClick={() => applyStatusFilters(STATUS_FILTER_KEYS)} style={{ fontFamily: "inherit", fontSize: 12.5, color: "#5a4a3a", background: "transparent", border: 0, cursor: "pointer" }}>Select all</button>
                            <span style={{ width: 1, height: 12, background: "#e4dac5" }} />
                            <button type="button" onClick={() => applyStatusFilters([])} style={{ fontFamily: "inherit", fontSize: 12.5, color: "#B07848", background: "transparent", border: 0, cursor: "pointer" }}>Clear</button>
                          </div>
                        </div>
                        {/* The 1px gap over a sand background is what draws the
                            dividers between groups — no borders to keep aligned. */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1px", background: "#F2EADA" }}>
                          {STATUS_GROUPS.map((g) => (
                            <div key={g.title} style={{ background: "#fff", padding: "14px 8px 14px 14px", gridColumn: `span ${g.span}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px 9px" }}>
                                <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em", color: "#a2957f" }}>{g.title}</span>
                                <span style={{ flex: 1, height: 1, background: "#F2EADA" }} />
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {g.keys.map((key) => {
                                  const cfg = statusConfig[key];
                                  if (!cfg) return null;
                                  const checked = statusFilters.includes(key);
                                  return (
                                    <label key={key}
                                      onClick={() => applyStatusFilters(checked ? statusFilters.filter((s) => s !== key) : [...statusFilters, key])}
                                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 4, fontSize: 13.5, color: "#1f1b16", cursor: "pointer", background: checked ? "#FAF6EE" : "transparent" }}
                                      onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "#FAF6EE"; }}
                                      onMouseLeave={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                                      <span style={{ width: 16, height: 16, flex: "none", borderRadius: 4, display: "grid", placeItems: "center", border: `1.5px solid ${checked ? "#1f1b16" : "#D4BFA0"}`, background: checked ? "#1f1b16" : "transparent" }}>
                                        {checked && <Check className="w-[11px] h-[11px]" style={{ color: "#fff" }} />}
                                      </span>
                                      <span style={{ width: 7, height: 7, flex: "none", borderRadius: "50%", background: cfg.dot }} />
                                      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{cfg.label}</span>
                                      {statusFilters.length > 0 && (
                                        <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11.5, color: "#a2957f" }}>{statusCounts[key] ?? 0}</span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ padding: "11px 18px", borderTop: "1px solid #F2EADA", background: "#FCFAF5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12.5, color: "#8a8276" }}>
                            {statusFilters.length
                              ? `${statusFilters.length} selected · ${filteredAdminBookings.length} bookings`
                              : "Nothing selected — showing everything"}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a2957f" }}>
                            <Bookmark className="w-3 h-3" /> Filter is remembered
                          </span>
                        </div>
                      </div>
                    </>,
                    document.body,
                  )}
                </div>
                <button onClick={() => setNewBookingOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                  <Plus className="w-4 h-4" /> New Booking
                </button>
              </div>
            </div>
            {/* Active filters, restated outside the panel. Once the dropdown
                closes the only trace of a filter was a number on the button —
                so a remembered filter from a previous visit looked like
                "the bookings have disappeared". */}
            {statusFilters.length > 0 && (
              <div style={{ padding: "11px 24px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #F2EADA", background: "#FCFAF5" }}>
                <span style={{ fontSize: 12, color: "#8a8276", marginRight: 2 }}>Showing</span>
                {statusFilters.map((key) => {
                  const cfg = statusConfig[key];
                  if (!cfg) return null;
                  return (
                    <span key={key} onClick={() => applyStatusFilters(statusFilters.filter((s) => s !== key))}
                      style={{ display: "inline-flex", flex: "none", whiteSpace: "nowrap", alignItems: "center", gap: 7, padding: "4px 8px 4px 9px", borderRadius: 999, fontSize: 12.5, color: "#4a4034", background: "#fff", border: "1px solid #e4dac5", cursor: "pointer" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
                      {cfg.label}
                      <X className="w-[11px] h-[11px]" style={{ color: "#a2957f" }} />
                    </span>
                  );
                })}
                <button type="button" onClick={() => applyStatusFilters([])} style={{ fontFamily: "inherit", fontSize: 12.5, color: "#B07848", background: "transparent", border: 0, cursor: "pointer", padding: "4px 2px" }}>Clear all</button>
              </div>
            )}

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
                  {filteredAdminBookings.map((booking, idx) => {
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
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><CheckCircle2 className="w-3.5 h-3.5"/></button>
                            )}
                            {(booking.status === "confirmed" || booking.status === "down-paid") && (() => {
                              // Always clickable — the owner may be letting the
                              // guest in ahead of schedule. The window only
                              // decides whether the email rides along now or
                              // waits (see handleCheckInOnly).
                              const open = isCheckInOpen(booking.checkInRaw, booking.checkInTime);
                              const opensAt = checkInOpensLabel(booking.checkInRaw, booking.checkInTime);
                              return (
                                <button type="button" onClick={() => handleCheckInOnly(booking)} disabled={bookingUpdating}
                                  title={open
                                    ? "Check in (sends the check-in instructions)"
                                    : `Check in early — instructions send ${opensAt}`}
                                  className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: open ? "#6b7280" : "#b08968" }}
                                  onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                  onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color=open ? "#6b7280" : "#b08968";}}><LogIn className="w-3.5 h-3.5"/></button>
                              );
                            })()}
                            {/* Early check-in leaves the instructions pending.
                                They should arrive on the cron, but that runs off
                                an external pinger on this plan — so offer a
                                manual send rather than risk the guest getting
                                nothing. */}
                            {booking.status === "checked-in" && !booking.selfCheckinEmailSentAt && (
                              <button type="button" onClick={() => handleSendInstructionsNow(booking.id)} disabled={sendingInstructions === booking.id}
                                title="Check-in instructions haven't gone out yet — send them now"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#b08968" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#b08968";}}><Send className="w-3.5 h-3.5"/></button>
                            )}
                            {booking.status === "checked-in" && booking.balance > 0 && (
                              <button type="button" onClick={() => openCheckIn({ id: booking.id, displayId: booking.displayId, guest: booking.guest, remaining: booking.balance, checkInRaw: booking.checkInRaw, checkOutRaw: booking.checkOutRaw })} disabled={bookingUpdating}
                                title="Collect remaining balance + deposit (sends the house rules)"
                                className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#fef3c7";(e.currentTarget as HTMLElement).style.color="#b45309";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><Wallet className="w-3.5 h-3.5"/></button>
                            )}
                            {/* Check-out only opens once the balance is settled —
                                Collect has to happen first, so the two never
                                show side by side. */}
                            {booking.status === "checked-in" && booking.balance <= 0 && (
                              <button type="button" onClick={() => handleCheckOut(booking.id)} disabled={bookingUpdating} title="Check out (complete booking)" className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#f3f4f6";(e.currentTarget as HTMLElement).style.color="#374151";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><LogOut className="w-3.5 h-3.5"/></button>
                            )}
                            {booking.requestedNewDate && (<>
                              <button type="button" onClick={() => decideDateChange(booking.id, "approve")} title={`Approve date change → ${fmtDate(booking.requestedNewDate)}`} className="p-1.5 rounded-lg transition-colors" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#d1fae5";(e.currentTarget as HTMLElement).style.color="#059669";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><CalendarDays className="w-3.5 h-3.5"/></button>
                              <button type="button" onClick={() => decideDateChange(booking.id, "reject")} title={`Reject date change → ${fmtDate(booking.requestedNewDate)}`} className="p-1.5 rounded-lg transition-colors" style={{ color: "#6b7280" }}
                                onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="#fee2e2";(e.currentTarget as HTMLElement).style.color="#dc2626";}}
                                onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.backgroundColor="transparent";(e.currentTarget as HTMLElement).style.color="#6b7280";}}><CalendarOff className="w-3.5 h-3.5"/></button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAdminBookings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-14 text-center">
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F7F0E3", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                          {allAdminBookings.length === 0
                            ? <CalendarDays className="w-5 h-5" style={{ color: "#B07848" }} />
                            : <Search className="w-5 h-5" style={{ color: "#B07848" }} />}
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "#5a4a3a" }}>
                          {allAdminBookings.length === 0 ? "No bookings yet" : "No bookings match this filter"}
                        </p>
                        <p style={{ fontSize: 12.5, color: "#8B6344", marginTop: 4 }}>
                          {allAdminBookings.length === 0
                            ? "New bookings will show up here."
                            : "Try clearing or changing the status filter."}
                        </p>
                        {statusFilters.length > 0 && (
                          <button type="button" onClick={() => applyStatusFilters([])}
                            className="cursor-pointer"
                            style={{ marginTop: 14, fontSize: 12.5, fontWeight: 500, color: "#5a4a3a", background: "#F7F0E3", border: "1px solid #D4BFA0", borderRadius: 4, padding: "7px 14px" }}>
                            Clear status filter
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>)}
          </>)}

          {/* ── Finance ── */}
          {activeNav === "Finance" && (<>
          {tabBar([{ id: "revenue", label: "Revenue Management", icon: PhilippinePeso }, { id: "methods", label: "Payment Methods", icon: CreditCard }, { id: "promotions", label: "Promotions", icon: Sparkles }], financeTab, (id) => setFinanceTab(id as "revenue" | "methods" | "promotions"))}
          {financeTab === "methods" && <PaymentMethodsSection />}
          {financeTab === "promotions" && (<>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1, color: "#1f1b16" }}>Promotions</h2>
                <p className="text-sm" style={{ color: "#8a8276" }}>{promotions.filter(p=>p.status==="Active").length} active on the site</p>
              </div>
              <button onClick={openCreatePromotion} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: "#1f1b16" }}>
                <Plus className="w-4 h-4" /> New Promotion
              </button>
            </div>
            <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#faf7f1", borderBottom: "1px solid #ece5d4" }}>
                    {["Banner","Title","Discount","Dates","Status","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: "#8a8276" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {promotions.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-sm text-center" style={{ color: "#8a8276" }}>No promotions yet.</td></tr>
                    )}
                    {promotions.map((p, idx) => (
                      <tr key={p.id} style={{ borderTop: idx > 0 ? "1px solid #f3eee2" : "none" }}>
                        <td className="px-4 py-3.5">
                          {p.image_url
                            ? <ImageThumb src={p.image_url} alt={p.title} />
                            : <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "#F7F0E3", color: "#B07848" }}><ImageIcon className="w-4 h-4" /></span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-sm" style={{ color: "#1f1b16" }}>{p.title}</div>
                          {p.description && <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: "#8a8276" }}>{p.description}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          {p.discount_value != null
                            ? <span className="text-sm font-semibold" style={{ color: "#1f1b16" }}>{p.discount_type === "percentage" ? `${p.discount_value}%` : peso(p.discount_value)}</span>
                            : <span className="text-sm" style={{ color: "#8a8276" }}>—</span>}
                        </td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: "#8a8276" }}>{new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{
                              backgroundColor: p.status === "Active" ? "#d1fae5" : p.status === "Scheduled" ? "#dbeafe" : p.status === "Expired" ? "#f3f4f6" : "#fef3c7",
                              color: p.status === "Active" ? "#065f46" : p.status === "Scheduled" ? "#1e40af" : p.status === "Expired" ? "#374151" : "#92400e",
                            }}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditPromotion(p)} title="Edit" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#1f1b16" }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => togglePromotion(p.id, p.active)} title={p.active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg cursor-pointer" style={{ color: p.active ? "#92400e" : "#065f46" }}>
                              {p.active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => removePromotion(p.id)} title="Delete" className="p-1.5 rounded-lg cursor-pointer" style={{ color: "#991b1b" }}>
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

            {commTab === "reviews" && (reviews.length === 0 ? <Empty label="No guest reviews yet." /> : (
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
            ))}

            {commTab === "messages" && (internalMessages.length === 0 ? <Empty label="No internal conversations yet." /> : (
              <div style={{ background: "#fff", border: "1px solid #ece5d4" }}>
                {internalMessages.map((msg) => {
                  const csr = msg.kind === "internal";
                  // Read-only for now — no thread view is wired up yet, so this
                  // row is deliberately not presented as clickable.
                  return (
                    <div key={msg.id} className="flex items-center" style={{ gap: 16, padding: "18px 24px", borderBottom: "1px solid #f3eee2" }}>
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
            ))}
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
                    The live rates guests are charged. Weekday vs. weekend/holiday is decided by the calendar below. Edit rate amounts via Property → haven → Pricing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 1, background: "#ece5d4", border: "1px solid #ece5d4" }}>
                  {stayRates.map((rate) => (
                    <div key={rate.key} style={{ background: "#fff", padding: "22px 24px" }}>
                      <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, color: "#1f1b16" }}>{rate.name}{rate.span && <span style={{ color: "#a08a6c" }}> ({rate.span})</span>}</div>
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
                        {rate.key === "overnight" && (
                          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px dashed #f3eee2", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#c2ad88" }}>
                              Long-term stay pricing
                              {!longtermActive && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#a0632f", backgroundColor: "#f6e9d9", padding: "1px 6px", borderRadius: 999 }}>Off</span>}
                            </div>
                            {overnightBundles.map((b) => (
                              <div key={b.label} className="flex items-center justify-between" style={{ fontSize: 12.5, opacity: longtermActive ? 1 : 0.55 }}>
                                <span style={{ color: "#8a8276" }}>{b.label}</span>
                                <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", color: "#4a4034", textDecoration: longtermActive ? "none" : "line-through" }}>
                                  {b.rate != null ? `${peso(b.rate)}/night` : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <PricingCalendarSection />
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

      {/* ── Monthly Breakdown Modal ── */}
      {monthlyBreakdownOpen && (() => {
        const totalRev = monthly.reduce((t, m) => t + (Number(m.revenue) || 0), 0);
        const totalBookings = allAdminBookings.length;
        return (
          <div onClick={() => setMonthlyBreakdownOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(31,27,22,0.45)" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 680, maxHeight: "85vh", background: "#fff", border: "1px solid #ece5d4", boxShadow: "0 24px 64px rgba(31,22,14,.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #ece5d4", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 22, margin: 0, lineHeight: 1, color: "#1f1b16" }}>Monthly Breakdown</h3>
                  <p style={{ fontSize: 12, color: "#8a8276", margin: "6px 0 0" }}>Confirmed &amp; paid bookings only</p>
                </div>
                <button type="button" onClick={() => setMonthlyBreakdownOpen(false)} style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "1px solid #e7dcc5", background: "transparent", color: "#8a6f4d", cursor: "pointer" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* KPI summary row */}
              <div className="grid grid-cols-3" style={{ gap: 1, background: "#ece5d4", borderBottom: "1px solid #ece5d4", flexShrink: 0 }}>
                {[
                  { label: "Total Bookings", value: String(s?.total_bookings ?? totalBookings) },
                  { label: "Total Revenue", value: peso(Number(s?.total_revenue ?? totalRev)) },
                  { label: "Occupancy Rate", value: `${Math.round(Number(s?.occupancy_rate ?? 0))}%` },
                  { label: "Total Guests", value: String(s?.new_guests ?? 0) },
                  { label: "Reviews", value: String(reviewsList.length) },
                  { label: "Active Rooms", value: String(havensList.length) },
                ].map((item) => (
                  <div key={item.label} style={{ background: "#fff", padding: "14px 18px" }}>
                    <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 500, color: "#1f1b16", letterSpacing: "-0.02em" }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: "#8a8276", marginTop: 4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
              {/* Monthly table */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1.6fr", padding: "10px 24px", background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8276", position: "sticky", top: 0 }}>
                  <span>Month</span><span style={{ textAlign: "right" }}>Revenue</span><span style={{ paddingLeft: 16 }}>Share of total</span>
                </div>
                {monthly.length === 0 && (
                  <div style={{ padding: "32px 24px", textAlign: "center" }}>
                    <PhilippinePeso className="w-5 h-5" style={{ color: "#B07848", margin: "0 auto 10px" }} />
                    <p style={{ fontSize: 14, color: "#5a4a3a" }}>No revenue recorded yet</p>
                  </div>
                )}
                {monthly.map((m) => {
                  const rev = Number(m.revenue) || 0;
                  const share = totalRev > 0 ? Math.round((rev / totalRev) * 100) : 0;
                  const label = /^\d{4}-\d{2}/.test(m.month) ? new Date(m.month + "-01").toLocaleString("en", { month: "long", year: "numeric" }) : m.month;
                  return (
                    <div key={m.month} className="grid items-center" style={{ gridTemplateColumns: "1fr 1fr 1.6fr", padding: "13px 24px", borderBottom: "1px solid #f3eee2", fontSize: 13.5 }}>
                      <span style={{ color: "#1f1b16", fontWeight: 500 }}>{label}</span>
                      <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 14, color: "#1f1b16", textAlign: "right", fontWeight: 600 }}>{peso(rev)}</span>
                      <div className="flex items-center" style={{ gap: 10, paddingLeft: 16 }}>
                        <div style={{ flex: 1, height: 6, background: "#f3eee2", borderRadius: 999 }}>
                          <div style={{ width: `${share}%`, height: "100%", background: "#b8754a", borderRadius: 999 }} />
                        </div>
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, color: "#8a8276", width: 32, textAlign: "right" }}>{share}%</span>
                      </div>
                    </div>
                  );
                })}
                {monthly.length > 0 && (
                  <div className="grid items-center" style={{ gridTemplateColumns: "1fr 1fr 1.6fr", padding: "16px 24px", background: "#F7F0E3", borderTop: "2px solid #D4BFA0" }}>
                    <span style={{ color: "#1f1b16", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", fontSize: 12 }}>Total Revenue</span>
                    <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 16, color: "#B07848", textAlign: "right", fontWeight: 700 }}>{peso(totalRev)}</span>
                    <span style={{ paddingLeft: 16, fontSize: 12, color: "#8a8276" }}>across {monthly.length} month{monthly.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Create/edit promotion modal ── */}
      <PromotionModal
        open={promotionModal}
        editing={!!editingPromotionId}
        form={promotionForm}
        setForm={setPromotionForm}
        image={promotionImage}
        setImage={setPromotionImage}
        saving={promotionSaving}
        onCancel={() => setPromotionModal(false)}
        onSubmit={submitPromotion}
      />

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

      {/* ── Check-in: collect remaining balance + refundable deposit ── */}
      {checkIn.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => !checkIn.busy && setCheckIn((c) => ({ ...c, open: false }))}>
          <div className="w-full max-w-md border p-6" style={{ backgroundColor: "#ffffff", borderColor: "#ece5d4" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 19, lineHeight: 1, color: "#1f1b16" }}>Collect Payment</h3>
            <p className="text-sm mt-0.5" style={{ color: "#8B6344" }}>Collect the remaining balance and refundable deposit. This also emails the guest the house rules.</p>

            <div className="border p-4 mt-4 mb-4" style={{ backgroundColor: "#FAFAF7", borderColor: "#ece5d4" }}>
              <div className="flex items-center justify-between text-sm"><span style={{ color: "#8B6344" }}>Booking</span><span className="font-mono text-xs" style={{ color: "#1a1a1a" }}>{checkIn.displayId}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Guest</span><span style={{ color: "#1a1a1a" }}>{checkIn.guest}</span></div>
              <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t" style={{ borderColor: "#ece5d4" }}><span style={{ color: "#8B6344" }}>Remaining balance</span><span style={{ color: "#1a1a1a" }}>₱{checkIn.remaining.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span style={{ color: "#8B6344" }}>Security deposit (refundable)</span><span style={{ color: "#1a1a1a" }}>₱{checkIn.deposit.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t font-bold" style={{ borderColor: "#ece5d4" }}><span style={{ color: "#1a1a1a" }}>Total to collect</span><span style={{ color: "#B07848" }}>₱{(checkIn.remaining + checkIn.deposit).toLocaleString()}</span></div>
            </div>

            <label className="text-xs font-semibold" style={{ color: "#8B6344" }}>Payment method</label>
            <select aria-label="Payment method" value={checkIn.method} onChange={(e) => setCheckIn((c) => ({ ...c, method: e.target.value }))} className="w-full mt-1 rounded-xl border px-3 py-2 text-sm outline-none cursor-pointer" style={{ borderColor: "#ece5d4", backgroundColor: "#FAFAFA", color: "#1a1a1a" }}>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Bank">BPI bank transfer</option>
            </select>

            <p className="text-xs mt-3 leading-relaxed" style={{ color: "#8B6344" }}>The ₱{checkIn.deposit.toLocaleString()} deposit is refundable on checkout. Confirming marks the balance fully paid and checks the guest in.</p>

            <div className="flex justify-between gap-2 mt-5">
              <button type="button" onClick={() => setCheckIn((c) => ({ ...c, open: false }))} disabled={checkIn.busy} className="px-4 py-2 text-sm font-medium border cursor-pointer disabled:opacity-60" style={{ color: "#8B6344", borderColor: "#ece5d4", backgroundColor: "#ffffff" }}>Cancel</button>
              <button type="button" onClick={confirmCollect} disabled={checkIn.busy} className="px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ backgroundColor: "#B07848" }}>{checkIn.busy ? "Recording…" : `Collect ₱${(checkIn.remaining + checkIn.deposit).toLocaleString()}`}</button>
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

        // "Booking Board" layout (imported from the Claude Design project). The
        // old modal was one long 480px scroll; this puts the three things the
        // owner actually acts on — the stay, the money, and who is arriving with
        // which IDs — side by side, so nothing needs scrolling past.
        //
        // Everyone on the booking, booker first. guest_index 0 is the booker.
        const boardGuests = [
          { name: bk.guest, sub: "Main guest · booked", validIdUrl: bk.validIdUrl, main: true },
          ...bk.additionalGuests.map((g) => ({
            name: g.name,
            sub: [g.age && `${g.age}`, g.gender].filter(Boolean).join(" · ") || "Guest",
            validIdUrl: g.validIdUrl,
            main: false,
          })),
        ];
        // Under-10s don't need an ID (house rule), so they aren't "missing" one.
        const needsId = (g: { sub: string; main: boolean }) => {
          const age = parseInt(g.sub, 10);
          return g.main || isNaN(age) || age >= 10;
        };
        const missingIds = boardGuests.filter((g) => needsId(g) && !g.validIdUrl).length;
        const attention = missingIds + (bk.paymentProofUrl ? 0 : 1);
        // Match the Bookings table exactly: the same statuses, the same action.
        // This button used to open the collect-balance flow despite being
        // labelled "Check guest in", so the two entry points disagreed.
        const canCheckIn = ["confirmed", "down-paid"].includes((bk.status || "").toLowerCase());
        const checkInIsOpen = isCheckInOpen(bk.checkInRaw, bk.checkInTime);

        return (
          <div onClick={() => setBookingModal(null)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(31,27,22,0.45)", overflow: "auto" }}>
            <style>{`
              @keyframes vb-pop{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}
              .bb-cols{display:grid;grid-template-columns:1fr 1fr 1fr;min-height:0;flex:1}
              .bb-col{padding:20px 22px;border-right:1px solid #F1E7D4;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
              .bb-col:last-child{border-right:none}
              /* The design is a fixed 1040x640 board. Below that it has to become
                 a single scrolling column, or it is unusable on the phone the
                 owner actually carries. */
              @media (max-width:1100px){
                .bb-card{width:100% !important;height:auto !important;max-height:92vh}
                .bb-cols{grid-template-columns:1fr;overflow-y:auto}
                .bb-col{border-right:none;border-bottom:1px solid #F1E7D4;overflow:visible}
                .bb-head{flex-wrap:wrap}
                .bb-actions{margin-left:0 !important;width:100%}
              }
            `}</style>
            {/* The design specifies a fixed 640px board. Held literally it runs
                past the bottom of a laptop window, so the whole modal scrolls —
                grow into the viewport instead and never exceed it. */}
            <div className="bb-card" onClick={(e) => e.stopPropagation()} style={{ width: 1040, height: "min(700px, calc(100vh - 48px))", maxWidth: "100%", flex: "none", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 24, boxShadow: "0 24px 64px rgba(31,22,14,.28)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "vb-pop .45s cubic-bezier(.2,.7,.3,1) both", margin: "auto" }}>

              {/* ── Header ─────────────────────────────────────────── */}
              <div className="bb-head" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderBottom: "1px solid #E9DCC4", background: "#FBF5E9" }}>
                <div style={{ width: 48, height: 48, flex: "none", borderRadius: 13, background: "#b8754a", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 21 }}>{initials(bk.guest)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.1, color: "#1f1b16" }}>{bk.guest}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "#9b8870", marginTop: 5 }}>{bk.displayId}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 9px", borderRadius: 999, background: sp.bg, color: sp.color, fontSize: 12, fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sp.dot }} />{sp.label}
                </span>
                {attention > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "#FFF8E8", border: "1px solid #F0DFB8", color: "#8C5A2E", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {attention} item{attention > 1 ? "s" : ""} need{attention > 1 ? "" : "s"} you
                  </span>
                )}
                <div className="bb-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  {canCheckIn && (
                    <button type="button"
                      onClick={() => { setBookingModal(null); handleCheckInOnly(bk); }}
                      title={checkInIsOpen
                        ? "Check in (sends the check-in instructions)"
                        : `Check in early — instructions send ${checkInOpensLabel(bk.checkInRaw, bk.checkInTime)}`}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#9C6739"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#B07848"; }}
                      style={{ padding: "11px 18px", borderRadius: 11, border: "none", background: "#B07848", color: "#FFFCF4", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", transition: "background .15s" }}>
                      {checkInIsOpen ? "Check guest in" : "Check in early"}
                    </button>
                  )}
                  <a href={bk.email ? `mailto:${bk.email}` : undefined}
                    style={{ padding: "11px 18px", borderRadius: 11, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#5A4632", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", cursor: bk.email ? "pointer" : "not-allowed", textDecoration: "none", opacity: bk.email ? 1 : .5 }}>
                    Message
                  </a>
                  {/* The PDF is built server-side (the ID photos live on
                      Cloudinary and the route is admin-guarded), so this is a
                      plain download rather than a client-side render. */}
                  <button type="button" disabled={pdfBusy}
                    onClick={() => downloadGuestRecord(bk.displayId)}
                    title="Download booking + one page per guest with their valid ID"
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 18px", borderRadius: 11, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#5A4632", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", cursor: pdfBusy ? "wait" : "pointer", opacity: pdfBusy ? .6 : 1 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 12l5 5 5-5" /><path d="M5 21h14" /></svg>
                    {pdfBusy ? "Preparing…" : "PDF"}
                  </button>
                  <button type="button" onClick={() => setBookingModal(null)} title="Close"
                    style={{ width: 32, height: 32, flex: "none", display: "grid", placeItems: "center", border: "1px solid #e7dcc5", borderRadius: 9, background: "rgba(255,255,255,.6)", color: "#8a6f4d", cursor: "pointer" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>

              <div className="bb-cols">

                {/* ── Column 1 · the stay ──────────────────────────── */}
                <div className="bb-col">
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a" }}>The stay</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ padding: "12px 14px", background: "#faf7f1", border: "1px solid #E9DCC4", borderRadius: "14px 14px 4px 4px" }}>
                      <div style={{ fontSize: 11, color: "#a08a6c" }}>Arrives</div>
                      <div style={{ fontFamily: serif, fontSize: 19, marginTop: 3, color: "#1f1b16" }}>{fmtDate(bk.checkInRaw)}</div>
                      <div style={{ fontSize: 12, color: "#8a7556", marginTop: 3 }}>{fmtTime(bk.checkInTime) || "—"}</div>
                    </div>
                    <div style={{ padding: "12px 14px", background: "#faf7f1", border: "1px solid #E9DCC4", borderRadius: "4px 4px 14px 14px" }}>
                      <div style={{ fontSize: 11, color: "#a08a6c" }}>Leaves</div>
                      <div style={{ fontFamily: serif, fontSize: 19, marginTop: 3, color: "#1f1b16" }}>{fmtDate(bk.checkOutRaw)}</div>
                      <div style={{ fontSize: 12, color: "#8a7556", marginTop: 3 }}>
                        {fmtTime(bk.checkOutTime) || "—"}{nights > 0 ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "#1f1b16" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b8754a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>
                    <span style={{ fontWeight: 500 }}>{dash(bk.room)}</span>
                  </div>

                  {bk.requestedNewDate && (
                    <div style={{ padding: "10px 13px", border: "1px solid #F0DFB8", background: "#FFF8E8", borderRadius: 12, fontSize: 12, color: "#8C5A2E" }}>
                      Date-change requested → <strong>{fmtDate(bk.requestedNewDate)}</strong>
                    </div>
                  )}

                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a", marginTop: 4 }}>Reach the guest</div>
                  <a href={bk.email ? `mailto:${bk.email}` : undefined}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", border: "1px solid #E9DCC4", borderRadius: 12, textDecoration: "none", color: "#1f1b16", background: "transparent", transition: "background .15s" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a08a6c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                    <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dash(bk.email)}</span>
                  </a>
                  <a href={bk.phone ? `tel:${bk.phone}` : undefined}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", border: "1px solid #E9DCC4", borderRadius: 12, textDecoration: "none", color: "#1f1b16", background: "transparent", transition: "background .15s" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a08a6c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l-1 4a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
                    <span style={{ fontSize: 12.5 }}>{dash(bk.phone)}</span>
                  </a>
                </div>

                {/* ── Column 2 · money ─────────────────────────────── */}
                <div className="bb-col" style={{ gap: 11 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a" }}>Money</div>
                  <div>
                    <div style={{ fontSize: 11.5, color: "#8B7458" }}>Total for this stay</div>
                    <div style={{ fontFamily: serif, fontSize: 29, lineHeight: 1.1, marginTop: 2, color: "#1f1b16" }}>{peso(total)}</div>
                    <div style={{ height: 8, borderRadius: 999, background: "#EFE4CE", overflow: "hidden", marginTop: 10 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "#B07848" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 12 }}>
                      <span style={{ color: "#3F7A4F", fontWeight: 600 }}>{peso(paid)} paid</span>
                      <span style={{ color: "#8C5A2E", fontWeight: 600 }}>{peso(bk.balance)} left</span>
                    </div>
                  </div>

                  {bk.paymentReference && (
                    <div style={{ background: "#F6EFE2", border: "1.5px dashed #B07848", borderRadius: 14, padding: "11px 14px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "#8C5A2E" }}>{dash(bk.paymentMethod)} ref.</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
                        <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 500, letterSpacing: ".04em", color: "#1f1b16", overflow: "hidden", textOverflow: "ellipsis" }}>{bk.paymentReference}</div>
                        <button type="button" onClick={() => copyRef(bk.paymentReference)}
                          style={{ flex: "none", padding: "7px 12px", borderRadius: 9, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#8C5A2E", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {refCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}

                  {bk.paymentProofUrl ? (
                    <a href={bk.paymentProofUrl} target="_blank" rel="noopener noreferrer"
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#D4BE9A"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#faf7f1"; e.currentTarget.style.borderColor = "#E9DCC4"; }}
                      style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid #E9DCC4", borderRadius: 13, padding: "9px 11px", background: "#faf7f1", textDecoration: "none", color: "#1f1b16", transition: "all .15s" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bk.paymentProofUrl} alt="Payment proof" style={{ width: 44, height: 38, flex: "none", borderRadius: 8, objectFit: "cover" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Payment proof</div>
                        <div style={{ fontSize: 11, color: "#2f7d55", marginTop: 2 }}>Uploaded · tap to view</div>
                      </div>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a08a6c" strokeWidth="1.9" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                    </a>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 11, border: "1px dashed #e0d2b8", borderRadius: 13, padding: "9px 11px", background: "#fcfaf5" }}>
                      <div style={{ width: 44, height: 38, flex: "none", borderRadius: 8, display: "grid", placeItems: "center", background: "#f6efe2" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9b58f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Payment proof</div>
                        <div style={{ fontSize: 11, color: "#B4453C", marginTop: 2 }}>Not uploaded</div>
                      </div>
                    </div>
                  )}

                  <div style={{ border: "1px solid #EFE4CE", borderRadius: 14, padding: "2px 14px 8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A3A2A", padding: "7px 0" }}>
                      <span>Room{nights > 0 ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}</span><span>{peso(bk.roomRate || total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A3A2A", padding: "7px 0", borderTop: "1px solid #F4EBD9" }}>
                      <span>Add-ons</span><span style={{ color: "#8B7458" }}>{peso(bk.addOns)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A3A2A", padding: "7px 0", borderTop: "1px solid #F4EBD9" }}>
                      <span>Security deposit</span>
                      <span style={{ color: "#8B7458" }}>{peso(bk.deposit)}{bk.depositStatus ? ` · ${dp.label.toLowerCase()}` : " · pending"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A3A2A", padding: "7px 0", borderTop: "1px solid #F4EBD9" }}>
                      <span>Paid by</span>
                      <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{dash(bk.paymentMethod)}</span>
                    </div>
                    {bk.paymentStatus && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#4A3A2A", padding: "7px 0", borderTop: "1px solid #F4EBD9" }}>
                        <span>Payment</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: pp.bg, color: pp.color, fontSize: 11, fontWeight: 600 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: pp.dot }} />{pp.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Column 3 · guests & IDs ──────────────────────── */}
                <div className="bb-col" style={{ gap: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#b8754a" }}>
                    Guests &amp; IDs · {boardGuests.length}
                  </div>
                  {boardGuests.map((g, i) => {
                    const idUrls = (g.validIdUrl || "").split("\n").map((u) => u.trim()).filter(Boolean);
                    const required = needsId(g);
                    return (
                      <div key={i} style={{ border: "1px solid #E9DCC4", borderRadius: 16, overflow: "hidden", flex: "none", background: g.main ? "#FBF5E9" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px" }}>
                          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: g.main ? "#b8754a" : "#C9A87C", color: "#fff", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 14 }}>{initials(g.name)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1f1b16" }}>{g.name || "—"}</div>
                            <div style={{ fontSize: 11, color: "#8B7458", marginTop: 2 }}>{g.sub}</div>
                          </div>
                          {idUrls.length > 0 ? (
                            <span style={{ padding: "4px 9px", borderRadius: 999, background: "#E6F4EA", color: "#2f7d55", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>ID ok</span>
                          ) : required ? (
                            <span style={{ padding: "4px 9px", borderRadius: 999, background: "#FDECEA", color: "#B4453C", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>No ID</span>
                          ) : (
                            // Under 10 — an ID was never required, so this is not a gap.
                            <span style={{ padding: "4px 9px", borderRadius: 999, background: "#F1EAD9", color: "#8B7458", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>No ID needed</span>
                          )}
                        </div>
                        {/* Thumbnails only when there ARE IDs, and with no caption
                            underneath — the pill above already says "ID ok" / "No
                            ID". The caption plus an empty-state block cost ~90px a
                            guest, which is what pushed three guests into a scroll. */}
                        {idUrls.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(idUrls.length, 3)}, 1fr)`, gap: 8, padding: "0 11px 11px" }}>
                            {idUrls.map((u, k) => (
                              <a key={k} href={u} target="_blank" rel="noopener noreferrer"
                                title={idUrls.length > 1 ? `Valid ID ${k + 1} — open full size` : "Valid ID — open full size"}
                                style={{ border: "1px solid #f1ead9", borderRadius: 10, overflow: "hidden", background: "#FFFCF4", textDecoration: "none", display: "block" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={idUrls.length > 1 ? `Valid ID ${k + 1}` : "Valid ID"} style={{ height: 58, width: "100%", objectFit: "cover", display: "block" }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
        // Length comes from this haven’s own overnight window, not a literal.
        const nightSpan = fmtSpan(r.twenty_one_hour_check_in, r.twenty_one_hour_check_out);
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
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1b16", marginBottom: 8 }}>Overnight{nightSpan && <span style={{ color: "#a08a6c", fontWeight: 400 }}> · {nightSpan}</span>}</div>
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
