"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { mockRooms } from "@/lib/mock-data";
import { generateBookingId, addMyBookingId } from "@/lib/booking-store";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { havenToRoom } from "@/lib/haven-adapter";
import { stayTotal, isWeekendOrHoliday, addDaysISO } from "@/lib/pricing";

// ── Helpers ────────────────────────────────────────────────────
function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }

// "10:00 AM" → "10:00" (24-hour HH:MM the booking API / TIME columns expect)
function to24h(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  // Build from LOCAL parts — toISOString() shifts the date a day in +UTC zones (PH).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Read a File as a base64 data URL — sent to the booking API, which uploads it
// to Cloudinary when configured (otherwise it's skipped gracefully).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatDateLong(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// ── Icons ──────────────────────────────────────────────────────
function IcoChevLeft() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoArrowRight() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>; }
function IcoCheck() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoCheckLg() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoShield() { return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function IcoTag() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>; }
function IcoPlus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoMinus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoPhone() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function IcoCreditCard() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>; }
function IcoHome() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>; }
function IcoUpload() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>; }
function IcoStar() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>; }

const STEPS = ["Our details", "Payment", "Review"];
// Refundable security deposit collected at check-in (D'Lux house policy).
const SECURITY_DEPOSIT = 1000;

type Info = { firstName: string; lastName: string; age: string; gender: string; email: string; phone: string; facebook: string; notes: string; validIdName: string | null; validIdData: string | null };
// Additional (non-main) guests collect only name, age, gender + valid ID.
type ExtraGuest = { firstName: string; lastName: string; age: string; gender: string; validIdName: string | null; validIdData: string | null };
type Payment = { method: "gcash" | "bank"; proofName: string | null; idName: string | null; proofData: string | null; idData: string | null };

function FieldLabel({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "var(--ink)", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, borderWidth: 1, borderStyle: "solid", borderColor: "var(--line-2)", fontSize: 14, background: "var(--white)", color: "var(--ink)", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

function UploadField({ label, sub, value, onChange, invalid, id }: { label: string; sub: string; value: string | null; onChange: (name: string, data: string) => void; invalid?: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div id={id}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 8 }}>{label}</div>
      <input ref={ref} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) fileToBase64(f).then((data) => onChange(f.name, data)); }} />
      <button onClick={() => ref.current?.click()}
        style={{ width: "100%", padding: 20, borderRadius: 14, border: invalid ? "1px solid #ef4444" : value ? "1px solid var(--dlux-accent)" : "1px dashed var(--line-2)", background: value ? "rgba(176,120,72,.06)" : "var(--white)", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: value ? "var(--dlux-accent)" : "var(--bg-2)", display: "grid", placeItems: "center", color: value ? "var(--white)" : "var(--ink-2)" }}>
          {value ? <IcoCheckLg /> : <IcoUpload />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{value || "Click to upload"}</div>
          <div style={{ fontSize: 11, color: "var(--ink)" }}>{sub}</div>
        </div>
      </button>
      {invalid && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>Required</div>}
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div style={{ padding: "20px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)" }}>{title}</div>
        <button onClick={onEdit} style={{ fontSize: 12, fontWeight: 600, textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer" }}>Edit</button>
      </div>
      {children}
    </div>
  );
}

// Compact dark valid-ID uploader reused for each additional guest.
function GuestIdUpload({ valueName, onPick, onClear, invalid, id, title = "Valid ID (Required for guests 10+ years old)", accepted, requiredMsg = "Please upload a valid ID for this guest." }: { valueName: string | null; onPick: (name: string, data: string) => void; onClear: () => void; invalid?: boolean; id?: string; title?: string; accepted?: string; requiredMsg?: string }) {
  const pick = (capture?: boolean) => {
    const f = document.createElement("input");
    f.type = "file";
    f.accept = "image/*";
    if (capture) (f as unknown as { capture: string }).capture = "environment";
    f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => onPick(file.name, data)); };
    f.click();
  };
  const btn: React.CSSProperties = { flex: 1, minWidth: 150, padding: 14, borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#4d4337", color: "#F6EFE2", border: "1px solid #5d5347", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
  return (
    <div id={id} style={{ marginTop: 16, padding: 20, background: "#3d3529", borderRadius: 16, border: invalid ? "1px solid #ef4444" : "1px solid transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: accepted ? 6 : 14 }}>
        <span style={{ color: "#D4A96A" }}><IcoShield /></span>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#F6EFE2" }}>{title}</div>
      </div>
      {accepted && <div style={{ fontSize: 12, color: "#B8A68E", marginBottom: 14 }}>{accepted}</div>}
      {invalid && <div style={{ fontSize: 11, color: "#ff8f8f", marginBottom: 12 }}>{requiredMsg}</div>}
      {!valueName ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => pick(false)} style={btn}><IcoUpload /> Upload ID photo</button>
          <button onClick={() => pick(true)} style={btn}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Take photo
          </button>
        </div>
      ) : (
        <div style={{ background: "#4d4337", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#22c55e", display: "grid", placeItems: "center", color: "white", flexShrink: 0 }}><IcoCheckLg /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#F6EFE2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valueName}</div>
            <div style={{ fontSize: 12, color: "#B8A68E" }}>ID uploaded successfully</div>
          </div>
          <button onClick={onClear} style={{ fontSize: 13, color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}>Remove</button>
        </div>
      )}
    </div>
  );
}

function CheckoutInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Checkout requires an account: send guests to sign in/up first, then back here.
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      const cb = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?callbackUrl=${cb}`);
    }
  }, [authStatus, router]);

  const roomId = sp.get("roomId") || "1";
  const stayType = sp.get("stayType") || "21";
  const checkInTime = sp.get("checkIn") || "7:00 PM";
  const checkOutTime = sp.get("checkOut") || "4:00 PM";
  const windowLabel = sp.get("windowLabel") || "Full stay";
  const date = sp.get("date") || "";
  const adults = Number(sp.get("adults") || 2);
  const children = Number(sp.get("children") || 0);
  const infants = Number(sp.get("infants") || 0);
  // Overnight (21h) stays can span multiple nights; 10h sessions are always 1.
  const nights = stayType === "10" ? 1 : Math.max(1, Number(sp.get("nights") || 1));

  // Live haven by id; fall back to mock so the page renders while loading.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId ?? "");
  const { data: havenRes } = useGetHavenByIdQuery(roomId, { skip: !roomId || !isUuid });
  const liveHaven = (havenRes as { data?: Record<string, unknown> } | undefined)?.data;
  const room = liveHaven ? havenToRoom(liveHaven) : (mockRooms.find((r) => r.id === roomId) || mockRooms[0]);

  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<Info>({ firstName: "", lastName: "", age: "", gender: "Male", email: "", phone: "", facebook: "", notes: "", validIdName: null, validIdData: null });
  const [payment, setPayment] = useState<Payment>({ method: "gcash", proofName: null, idName: null, proofData: null, idData: null });
  const [submitting, setSubmitting] = useState(false);
  // Show field markings only after a failed Continue/Confirm; clear on step change.
  const [showErrors, setShowErrors] = useState(false);
  useEffect(() => { setShowErrors(false); }, [step]);

  // Each booking covers every named guest (adults + children + infants); guest 1
  // is the main guest above, so collect reduced details for everyone beyond the first.
  const extraCount = Math.max(0, adults + children + infants - 1);
  const [extraGuests, setExtraGuests] = useState<ExtraGuest[]>([]);
  useEffect(() => {
    setExtraGuests((prev) => {
      const next = prev.slice(0, extraCount);
      while (next.length < extraCount) next.push({ firstName: "", lastName: "", age: "", gender: "Male", validIdName: null, validIdData: null });
      return next;
    });
  }, [extraCount]);
  const updateGuest = (i: number, patch: Partial<ExtraGuest>) =>
    setExtraGuests((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  // Guests are ordered adults → children → infants. The main guest is adult #1,
  // so an extra guest's type follows its overall position (i + 2, main = 1).
  const guestType = (i: number): "adult" | "child" | "infant" => {
    const pos = i + 2;
    if (pos <= adults) return "adult";
    if (pos <= adults + children) return "child";
    return "infant";
  };

  // Weekday vs weekend/holiday rate based on the check-in date.
  const isWeekendRate = isWeekendOrHoliday(date);
  // Stay price: 10h single session, or 21h × nights (each night priced by its own date).
  const basePrice = stayTotal(stayType, date, nights, room);
  // D'Lux pricing: the base rate covers 1–4 pax — no per-pax, cleaning, or
  // service fee. Total is just the stay rate.
  const total = basePrice;
  const downPayment = Math.round(total * 0.5); // 50% reservation down payment

  // Per-field validation for the current step. Returns the set of invalid field
  // keys so the Continue button can stay clickable while we mark exactly what's
  // still missing (instead of silently disabling the button).
  const fieldErrors = ((): Set<string> => {
    const e = new Set<string>();
    if (step === 0) {
      const age = parseInt(info.age);
      if (!info.firstName) e.add("firstName");
      if (!info.lastName) e.add("lastName");
      // Main guest is Adult 1 — must be a realistic adult age (18–120).
      if (!info.age || isNaN(age) || age < 18 || age > 120) e.add("age");
      if (!info.gender) e.add("gender");
      if (!info.email || !/@/.test(info.email)) e.add("email");
      if (!/^\d{11}$/.test(info.phone)) e.add("phone");
      if (age >= 10 && !info.validIdName) e.add("validId");
      extraGuests.forEach((g, i) => {
        const a = Number(g.age);
        const t = guestType(i);
        if (!g.firstName) e.add(`x${i}-firstName`);
        if (!g.lastName) e.add(`x${i}-lastName`);
        // Age range by type: adults 18–120, children 2–17, infants under 2.
        const ageBad = g.age === "" || isNaN(a) ||
          (t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 2 || a > 17 : a < 0 || a > 1);
        if (ageBad) e.add(`x${i}-age`);
        if (!g.gender) e.add(`x${i}-gender`);
        // Document: infants always need an ID/birth certificate; others when 10+.
        const needDoc = t === "infant" || a >= 10;
        if (needDoc && !g.validIdName) e.add(`x${i}-validId`);
      });
    }
    // Step 2 (Payment): only the method is needed — payment proof is collected
    // later, after the host approves the documents. Nothing to validate here.
    return e;
  })();

  // Run `action` only when the step is valid; otherwise surface the markings.
  const tryAdvance = (action: () => void) => {
    if (fieldErrors.size > 0) {
      setShowErrors(true);
      toast.error(`Please complete the ${fieldErrors.size} highlighted field${fieldErrors.size > 1 ? "s" : ""} before continuing.`);
      // Jump to the first missing field (Set keeps form order).
      const firstKey = fieldErrors.values().next().value;
      setTimeout(() => {
        const el = document.getElementById(`f-${firstKey}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el && "focus" in el) (el as HTMLElement).focus({ preventScroll: true });
      }, 60);
      return;
    }
    setShowErrors(false);
    action();
  };

  // Style/marking helpers driven by a failed Continue attempt.
  const fieldStyle = (key: string): React.CSSProperties =>
    showErrors && fieldErrors.has(key) ? { ...inputStyle, borderColor: "#ef4444" } : inputStyle;
  const Req = ({ k, msg = "Required" }: { k: string; msg?: string }) =>
    showErrors && fieldErrors.has(k) ? <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{msg}</div> : null;

  // Live age feedback — warns the moment an out-of-range value is typed, before
  // any Continue click. Adults 18–120, children 2–17.
  type GType = "adult" | "child" | "infant";
  const ageInvalidNow = (value: string, t: GType): boolean => {
    if (value === "") return false;
    const a = parseInt(value);
    if (isNaN(a)) return true;
    return t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 2 || a > 17 : a < 0 || a > 1;
  };
  const ageStyle = (value: string, t: GType, key: string): React.CSSProperties =>
    ageInvalidNow(value, t) || (showErrors && fieldErrors.has(key)) ? { ...inputStyle, borderColor: "#ef4444" } : inputStyle;
  const AgeNote = ({ value, t, k }: { value: string; t: GType; k: string }) => {
    if (ageInvalidNow(value, t)) {
      const a = parseInt(value);
      const msg = t === "adult"
        ? (a < 18 ? "Must be 18 or older — adults only." : "Enter a realistic age (max 120).")
        : t === "child"
        ? "Children must be aged 2–17."
        : "Infants must be under 2 (age 0 or 1).";
      return <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{msg}</div>;
    }
    if (showErrors && fieldErrors.has(k) && value === "") return <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>Enter the age.</div>;
    return null;
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const bookingId = generateBookingId();
    const ci = to24h(checkInTime);
    const co = to24h(checkOutTime);
    const now = new Date();
    const checkInDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Multi-night overnight stays check out `nights` days later. For a same-day
    // 10h session that ends earlier than it starts, roll to the next day.
    const checkOutDate = stayType === "10"
      ? (co <= ci ? addDays(checkInDate, 1) : checkInDate)
      : addDaysISO(checkInDate, nights);

    const payload = {
      booking_id: bookingId,
      user_id: session?.user?.id ?? null, // tie the booking to the signed-in account
      haven_id: roomId, // enables the blocked-dates check on the server
      room_name: room.name,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      check_in_time: ci,
      check_out_time: co,
      adults,
      children,
      infants,
      guest_first_name: info.firstName,
      guest_last_name: info.lastName,
      guest_email: info.email,
      guest_phone: info.phone,
      guest_age: parseInt(info.age, 10) || null,
      guest_gender: info.gender,
      facebook_link: info.facebook || null,
      valid_id: info.validIdData || undefined,           // base64; uploaded to Cloudinary when configured
      additional_guests: extraGuests.map((g) => ({       // non-main guests: name, age, gender, ID
        firstName: g.firstName,
        lastName: g.lastName,
        age: g.age,
        gender: g.gender,
        validId: g.validIdData || undefined,
      })),
      payment_proof: payment.proofData || undefined,     // base64; uploaded to Cloudinary when configured
      payment_method: payment.method,
      room_rate: basePrice,
      add_ons_total: 0,
      total_amount: total,
      down_payment: downPayment,
      add_ons: [],
    };

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        toast.error(json.error || "Could not complete your booking. Please try again.");
        setSubmitting(false);
        return;
      }
      const confirmedId = json.data?.booking_id || bookingId;
      addMyBookingId(confirmedId);
      toast.success("Booking request submitted! The host will review your documents.");
      router.push(`/my-bookings/confirmed?id=${confirmedId}`);
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  const PriceRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "var(--ink-2)", fontSize: 13 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  // Gate: until the session is confirmed (and the guest is signed in), don't
  // render the form — unauthenticated users are redirected to sign in/up above.
  if (authStatus !== "authenticated") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>
        {authStatus === "loading" ? "Checking your session…" : "Please sign in to continue — redirecting…"}
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ backgroundColor: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* HEADER — checkout step bar (Site Headers design · 04) */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontFamily: "'Geist', system-ui, -apple-system, sans-serif", color: "#1f1b16" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
          .co-exit { color: #1f1b16; text-decoration: none; border-bottom: 1px solid #1f1b16; padding-bottom: 1px; }
          @media (max-width: 860px) { .co-steps { display: none !important; } }
        `}</style>
        <div style={{ maxWidth: 1320, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

          {/* wordmark */}
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 30, height: 30, flex: "none", background: "#1f1b16", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 16, fontStyle: "italic", letterSpacing: "-0.04em" }}>D</div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18 }}>D&rsquo; Lux Homes</div>
          </Link>

          {/* step indicator */}
          <div className="co-steps" style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
            {STEPS.map((s, i) => {
              const done = i < step, current = i === step;
              const circle = done
                ? { background: "#1f1b16", color: "#faf7f1", border: "none" as const }
                : current
                ? { background: "#b8754a", color: "#faf7f1", border: "none" as const }
                : { background: "transparent", color: "#8a8276", border: "1px solid #d9d1c2" };
              const labelColor = done ? "#6b6358" : current ? "#1f1b16" : "#8a8276";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {i > 0 && <div style={{ width: 32, height: 1, background: "#d9d1c2" }} />}
                  <button onClick={() => done && setStep(i)} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, padding: 0, font: "inherit", color: labelColor, cursor: done ? "pointer" : "default" }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontFamily: "'Geist Mono', ui-monospace, monospace", ...circle }}>
                      {done ? <IcoCheck /> : i + 1}
                    </span>
                    <span>{s}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* secure + exit */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span>Secure checkout</span>
            </div>
            <Link href={`/rooms/${room.id}`} className="co-exit">Exit</Link>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 60px" }}>
        {/* Back */}
        <style>{`
          .back-btn {
            display: inline-flex;
            gap: 8px;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: var(--ink);
            text-decoration: none;
            margin-bottom: 20px;
            padding: 9px 16px;
            border-radius: 999px;
            background: var(--white);
            border: 1.5px solid var(--line-2);
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            transition: background 0.22s ease, border-color 0.22s ease,
              color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
          }
          .back-btn:hover {
            background: var(--bg-2);
            border-color: var(--accent-ink);
            color: var(--accent-ink);
            box-shadow: 0 3px 10px rgba(0,0,0,0.08);
            transform: translateX(-3px);
          }
          .back-btn .back-btn__chev {
            display: inline-flex;
            transition: transform 0.22s ease;
          }
          .back-btn:hover .back-btn__chev {
            transform: translateX(-3px);
          }
          @media (prefers-reduced-motion: reduce) {
            .back-btn, .back-btn .back-btn__chev { transition: none; }
            .back-btn:hover { transform: none; }
            .back-btn:hover .back-btn__chev { transform: none; }
          }
        `}</style>
        <Link href={`/rooms/${room.id}`} className="back-btn">
          <span className="back-btn__chev"><IcoChevLeft /></span> Back to {room.name}
        </Link>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
          <h1 className="serif" style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-.025em", margin: 0 }}>Confirm and pay</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 48 }}>
          {/* STEP CONTENT */}
          <div>
            {/* Step 0: Guest info */}
            {step === 0 && (
              <div className="fade-in">
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-.02em" }}>Guest Information</h2>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 22px" }}>Adult 1 (Main Guest)</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <FieldLabel label="First Name *">
                    <input id="f-firstName" style={fieldStyle("firstName")} value={info.firstName} onChange={(e) => setInfo({ ...info, firstName: e.target.value })} placeholder="John" />
                    <Req k="firstName" msg="Enter the first name" />
                  </FieldLabel>
                  <FieldLabel label="Last Name *">
                    <input id="f-lastName" style={fieldStyle("lastName")} value={info.lastName} onChange={(e) => setInfo({ ...info, lastName: e.target.value })} placeholder="Doe" />
                    <Req k="lastName" msg="Enter the last name" />
                  </FieldLabel>
                  <FieldLabel label="Age * (18+)">
                    <input id="f-age" style={ageStyle(info.age, "adult", "age")} type="number" min="18" max="120" value={info.age} onChange={(e) => setInfo({ ...info, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="18" />
                    <AgeNote value={info.age} t="adult" k="age" />
                  </FieldLabel>
                  <FieldLabel label="Gender *">
                    <select style={inputStyle} value={info.gender} onChange={(e) => setInfo({ ...info, gender: e.target.value })}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Email Address *">
                    <input id="f-email" style={fieldStyle("email")} type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} placeholder="csr@staycationhavenph.com" />
                    <Req k="email" msg="Enter a valid email address" />
                  </FieldLabel>
                  <FieldLabel label="Phone Number *">
                    <input id="f-phone" style={fieldStyle("phone")} type="tel" inputMode="numeric" maxLength={11} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="09991484954" />
                    <Req k="phone" msg="Enter an 11-digit phone number" />
                  </FieldLabel>
                  <FieldLabel label="Facebook Name or Link" span>
                    <input style={inputStyle} value={info.facebook} onChange={(e) => setInfo({ ...info, facebook: e.target.value })} placeholder="e.g. Juan Dela Cruz or facebook.com/juandelacruz" />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Alternative contact in case email is incorrect</div>
                  </FieldLabel>
                </div>
                <div id="f-validId" style={{ marginTop: 24, padding: 28, background: "#3d3529", borderRadius: 20, border: showErrors && fieldErrors.has("validId") ? "1px solid #ef4444" : "1px solid transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ color: "#D4A96A" }}><IcoShield /></span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#F6EFE2" }}>Valid ID (Required for guests 10+ years old)</div>
                  </div>
                  <div style={{ fontSize: 13, color: "#B8A68E", marginBottom: 20 }}>Accepted: Driver's License, Passport, National ID, School ID</div>
                  {showErrors && fieldErrors.has("validId") && <div style={{ fontSize: 12, color: "#ff8f8f", marginBottom: 16 }}>Please upload a valid ID for the main guest.</div>}
                  {!info.validIdName ? (
                    <div>
                      <div style={{ background: "#4d4337", borderRadius: 14, padding: 40, textAlign: "center", marginBottom: 16, cursor: "pointer" }} onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => setInfo({ ...info, validIdName: file.name, validIdData: data })); }; f.click(); }}>
                        <div style={{ width: 56, height: 56, borderRadius: 12, background: "#5d5347", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "#B8A68E" }}>
                          <IcoUpload />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F6EFE2", marginBottom: 6 }}>Click to upload ID photo</div>
                        <div style={{ fontSize: 12, color: "#B8A68E" }}>PNG, JPG, JPEG up to 5MB</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#9B8B73", marginBottom: 14, fontWeight: 500 }}>OR</div>
                        <button onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.capture = "environment" as any; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => setInfo({ ...info, validIdName: file.name, validIdData: data })); }; f.click(); }} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600, background: "#4d4337", color: "#F6EFE2", border: "1px solid #5d5347", cursor: "pointer" }}>
                          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          Take photo with camera
                        </button>
                        <div style={{ fontSize: 12, color: "#9B8B73", marginTop: 10 }}>Use device camera to capture ID</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#4d4337", borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "#22c55e", display: "grid", placeItems: "center", color: "white", flexShrink: 0 }}>
                        <IcoCheckLg />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F6EFE2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.validIdName}</div>
                        <div style={{ fontSize: 12, color: "#B8A68E" }}>ID uploaded successfully</div>
                      </div>
                      <button onClick={() => setInfo({ ...info, validIdName: null })} style={{ fontSize: 13, color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}>Remove</button>
                    </div>
                  )}
                </div>

                {/* Additional guests — name, age, gender + valid ID only */}
                {extraGuests.map((g, i) => {
                  const t = guestType(i);
                  const typeLabel = t === "adult" ? "Adult (18+)" : t === "child" ? "Child (2–17)" : "Infant (under 2)";
                  const ageLabel = t === "adult" ? "Age * (18+)" : t === "child" ? "Age * (2–17)" : "Age * (under 2)";
                  const ageMin = t === "adult" ? 18 : t === "child" ? 2 : 0;
                  const ageMax = t === "adult" ? 120 : t === "child" ? 17 : 1;
                  const agePlaceholder = t === "adult" ? "18" : t === "child" ? "10" : "1";
                  const isInfant = t === "infant";
                  return (
                  <div key={i} style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
                    <p style={{ color: "var(--ink)", fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Guest {i + 2} <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>· {typeLabel}</span></p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <FieldLabel label="First Name *">
                        <input id={`f-x${i}-firstName`} style={fieldStyle(`x${i}-firstName`)} value={g.firstName} onChange={(e) => updateGuest(i, { firstName: e.target.value })} placeholder="Jane" />
                        <Req k={`x${i}-firstName`} msg="Enter the first name" />
                      </FieldLabel>
                      <FieldLabel label="Last Name *">
                        <input id={`f-x${i}-lastName`} style={fieldStyle(`x${i}-lastName`)} value={g.lastName} onChange={(e) => updateGuest(i, { lastName: e.target.value })} placeholder="Doe" />
                        <Req k={`x${i}-lastName`} msg="Enter the last name" />
                      </FieldLabel>
                      <FieldLabel label={ageLabel}>
                        <input id={`f-x${i}-age`} style={ageStyle(g.age, t, `x${i}-age`)} type="number" min={ageMin} max={ageMax} value={g.age} onChange={(e) => updateGuest(i, { age: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder={agePlaceholder} />
                        <AgeNote value={g.age} t={t} k={`x${i}-age`} />
                      </FieldLabel>
                      <FieldLabel label="Gender *">
                        <select aria-label={`Guest ${i + 2} gender`} style={inputStyle} value={g.gender} onChange={(e) => updateGuest(i, { gender: e.target.value })}>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </FieldLabel>
                    </div>
                    <GuestIdUpload
                      id={`f-x${i}-validId`}
                      valueName={g.validIdName}
                      invalid={showErrors && fieldErrors.has(`x${i}-validId`)}
                      title={isInfant ? "Valid ID or Birth Certificate (Required)" : "Valid ID (Required for guests 10+ years old)"}
                      accepted={isInfant ? "Accepted: PSA Birth Certificate, Passport, or any valid ID" : undefined}
                      requiredMsg={isInfant ? "Please upload the infant's ID or birth certificate." : "Please upload a valid ID for this guest."}
                      onPick={(name, data) => updateGuest(i, { validIdName: name, validIdData: data })}
                      onClear={() => updateGuest(i, { validIdName: null, validIdData: null })}
                    />
                  </div>
                  );
                })}
              </div>
            )}

            {/* Step 1: Payment method */}
            {step === 1 && (
              <div className="fade-in">
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>Add a payment method</h2>
                <div style={{ border: "1px solid var(--line-2)", borderRadius: 18, overflow: "hidden", background: "var(--white)", marginBottom: 24 }}>
                  {([
                    { id: "gcash" as const, label: "GCash", sub: "0946 007 4015", logo: "/images/gcash.svg" },
                    { id: "bank" as const, label: "Bank Transfer", sub: "BPI", logo: "/images/bpi.svg" },
                  ] as const).map((m, i) => {
                    const active = payment.method === m.id;
                    return (
                      <button key={m.id} onClick={() => setPayment({ ...payment, method: m.id })}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "transparent", borderWidth: 0, borderTopWidth: i > 0 ? 1 : 0, borderStyle: "solid", borderColor: "var(--line)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Image src={m.logo} alt={m.label} width={34} height={34} unoptimized style={{ objectFit: "contain" }} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{m.sub}</div>
                        </div>
                        <span style={{ width: 20, height: 20, borderRadius: "50%", borderWidth: 2, borderStyle: "solid", borderColor: active ? "var(--ink)" : "var(--line-2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          {active && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ink)" }} />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ padding: 20, borderRadius: 16, background: "var(--bg-2)", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>What happens next</div>
                  <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.8 }}>
                    <li>Submit your booking request — <strong>no payment yet</strong>.</li>
                    <li>The host reviews your valid IDs &amp; documents.</li>
                    <li>Once approved, you&apos;ll receive {payment.method === "gcash" ? "GCash" : "BPI bank transfer"} details to send the <strong>{peso(downPayment)}</strong> down payment (50%).</li>
                    <li>The <strong>{peso(total - downPayment)}</strong> balance + ₱1,000 refundable deposit are paid at check-in.</li>
                  </ol>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: "rgba(176,120,72,.08)", border: "1px solid var(--line-2)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  Your reservation isn&apos;t final until the host approves your documents and your down payment is confirmed. We&apos;ll notify you with {payment.method === "gcash" ? "GCash" : "bank"} payment instructions after approval.
                </div>
              </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
              <div className="fade-in">
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>Double-check everything</h2>
                <ReviewBlock title="Guest" onEdit={() => setStep(0)}>
                  <div style={{ fontSize: 14 }}>{info.firstName} {info.lastName}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{info.age} years old · {info.gender}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{info.email} · {info.phone}</div>
                  {info.facebook && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Facebook: {info.facebook}</div>}
                </ReviewBlock>
                <ReviewBlock title="Stay" onEdit={() => router.back()}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{room.name}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{formatDateLong(date)} · {checkInTime} → {checkOutTime}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{stayType === "10" ? "10-hour stay" : `Overnight · ${nights} night${nights > 1 ? "s" : ""}`} · {adults + children} guest{adults + children > 1 ? "s" : ""}</div>
                </ReviewBlock>
                <ReviewBlock title="Payment" onEdit={() => setStep(1)}>
                  <div style={{ fontSize: 14 }}>
                    {payment.method === "gcash" ? "GCash" : "BPI bank transfer"}
                    <span style={{ color: "var(--muted)" }}> — pay the 50% down payment ({peso(downPayment)}) after the host approves your documents</span>
                  </div>
                </ReviewBlock>
                <div style={{ marginTop: 20, padding: 20, background: "var(--bg-2)", borderRadius: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>You&apos;re agreeing to:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7 }}>
                    <li>Check-in at {checkInTime} and check-out by {checkOutTime}</li>
                    <li>House rules — strictly no smoking/vaping, no pets, no walk-ins</li>
                    <li>50% balance + ₱1,000 refundable security deposit due at check-in</li>
                    <li>No cancellations — one free date change if requested ≥7 days before check-in, new date within 1 month</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
              <button onClick={() => step === 0 ? router.back() : setStep(step - 1)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--line-2)", cursor: "pointer" }}>
                <IcoChevLeft /> {step === 0 ? "Back to stay" : "Back"}
              </button>
              {step < STEPS.length - 1 ? (
                <button onClick={() => tryAdvance(() => setStep(step + 1))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "var(--white)", border: "none", cursor: "pointer" }}>
                  Continue <IcoArrowRight />
                </button>
              ) : (
                <button onClick={() => tryAdvance(submit)} disabled={submitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "var(--white)", border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  <IcoCheckLg /> {submitting ? "Submitting…" : "Submit booking request"}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <aside>
            <div style={{ position: "sticky", top: 90, background: "var(--white)", borderRadius: 20, padding: 22, border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ display: "flex", gap: 14, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
                <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "var(--bg-2)", position: "relative" }}>
                  <Image src={room.images[0]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-ink)", textTransform: "uppercase", letterSpacing: ".12em" }}>Quezon City</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name}</div>
                  <div style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><IcoStar /> {room.rating} · {room.reviewCount} reviews</div>
                </div>
              </div>
              <div style={{ padding: "16px 0", borderBottom: "1px solid var(--line)", fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--ink)" }}>Date</span><span style={{ fontWeight: 600 }}>{formatDate(date)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--ink)" }}>Window</span><span style={{ fontWeight: 600 }}>{checkInTime} → {checkOutTime}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--ink)" }}>Guests</span><span style={{ fontWeight: 600 }}>{adults + children}</span></div>
              </div>
              <div style={{ padding: "16px 0", borderBottom: "1px solid var(--line)", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                <PriceRow label={stayType === "10" ? `10-hour stay · ${isWeekendRate ? "Weekend/Holiday" : "Weekday"}` : `Overnight · ${nights} night${nights > 1 ? "s" : ""}`} value={peso(basePrice)} />
              </div>
              <div style={{ padding: "16px 0 0", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
                <span>Total</span><span>{peso(total)}</span>
              </div>
              {step >= 1 && (
                <div style={{ marginTop: 14, padding: 12, background: "var(--bg-2)", borderRadius: 12, fontSize: 12, color: "var(--ink-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
                    <span>Down payment (50%, after approval)</span><span>{peso(downPayment)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}>
                    <span>Room balance at check-in</span><span>{peso(total - downPayment)}</span>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                      <span>Security deposit (separate)</span><span>{peso(SECURITY_DEPOSIT)}</span>
                    </div>
                    <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11 }}>Refundable hold collected at check-in and returned after check-out not part of the room price.</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>Loading checkout…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}
