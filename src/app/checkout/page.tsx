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
import { stayTotal, isWeekendOrHoliday, addDaysISO, extraPaxFee } from "@/lib/pricing";

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

const STEPS = ["Your details", "Payment", "Confirm", "Review"];
// Refundable security deposit collected at check-in (D'Lux house policy).
const SECURITY_DEPOSIT = 1000;

type Info = { firstName: string; lastName: string; age: string; gender: string; email: string; phone: string; facebook: string; notes: string; validIdName: string | null; validIdData: string | null };
// Additional (non-main) guests collect only name, age, gender + valid ID.
type ExtraGuest = { firstName: string; lastName: string; age: string; gender: string; validIdName: string | null; validIdData: string | null };
// A payment method configured by the owner (Admin → Payment methods).
type PayMethod = { id: string; payment_name: string; payment_method: string; provider: string; account_details: string; payment_qr_link: string | null; is_active: boolean };
type Payment = { methodId: string; method: string; reference: string; proofName: string | null; proofData: string | null; idName: string | null; idData: string | null };

function FieldLabel({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#1F160E", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, borderWidth: 1, borderStyle: "solid", borderColor: "#D4BE9A", fontSize: 14, background: "#FFFCF4", color: "#1F160E", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

function UploadField({ label, sub, value, onChange, invalid, id }: { label: string; sub: string; value: string | null; onChange: (name: string, data: string) => void; invalid?: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div id={id}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", marginBottom: 8 }}>{label}</div>
      <input ref={ref} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) fileToBase64(f).then((data) => onChange(f.name, data)); }} />
      <button onClick={() => ref.current?.click()}
        style={{ width: "100%", padding: 16, borderRadius: 14, border: invalid ? "1px solid #ef4444" : value ? "1px solid #B07848" : "1px dashed #D4BE9A", background: value ? "rgba(176,120,72,.06)" : "#FAF7F1", display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer" }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: value ? "#22C55E" : "#EFE4CE", display: "grid", placeItems: "center", color: value ? "#fff" : "#A88E63", flex: "none" }}>
          {value ? <IcoCheckLg /> : <IcoUpload />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F160E" }}>{value || "Click to upload"}</div>
          <div style={{ fontSize: 11.5, color: "#8B7458", marginTop: 2 }}>{value ? "Uploaded — tap to replace" : sub}</div>
        </div>
      </button>
      {invalid && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>Required</div>}
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div style={{ padding: "18px 0", borderBottom: "1px solid #E0CEB2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E" }}>{title}</div>
        <button onClick={onEdit} style={{ fontSize: 12, fontWeight: 600, textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer", color: "#1F160E" }}>Edit</button>
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
  const [payment, setPayment] = useState<Payment>({ methodId: "", method: "", reference: "", proofName: null, proofData: null, idName: null, idData: null });
  // Active payment methods (with QR + account details) configured by the owner.
  const [methods, setMethods] = useState<PayMethod[]>([]);
  useEffect(() => {
    fetch("/api/payment-methods")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const active: PayMethod[] = (Array.isArray(j?.data) ? j.data : []).filter((m: PayMethod) => m.is_active);
        setMethods(active);
        setPayment((p) => (p.methodId || !active[0]) ? p : { ...p, methodId: active[0].id, method: active[0].payment_method });
      })
      .catch(() => {});
  }, []);
  const selectedMethod = methods.find((m) => m.id === payment.methodId) || null;
  const [copied, setCopied] = useState(false);
  const copyAccount = () => {
    try { if (selectedMethod && navigator.clipboard) navigator.clipboard.writeText(selectedMethod.account_details); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
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
  // D'Lux pricing: base rate covers 2 pax; each extra adult/young adult adds a
  // flat per-pax fee (once per booking). "Children (7 under)" are exempt from
  // the fee. No cleaning or service fee.
  const feePax = adults + children; // adults + young adults; excludes 7-under
  const extraPaxCount = Math.max(0, feePax - room.basePax);
  const paxFee = extraPaxFee(feePax, room.basePax, room.additionalPaxFee);
  const total = basePrice + paxFee;
  const downPayment = Math.round(total * 0.5); // 50% reservation down payment
  const stepCaption = ["Step 1 of 4 — tell us who's staying", "Step 2 of 4 — send your down payment to reserve", "Step 3 of 4 — confirm the payment you sent", "Step 4 of 4 — review and submit your request"][step];

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
        // Age range by type: adults 18–120, young adults 7–17, children 7 & under.
        const ageBad = g.age === "" || isNaN(a) ||
          (t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 7 || a > 17 : a < 0 || a > 7);
        if (ageBad) e.add(`x${i}-age`);
        if (!g.gender) e.add(`x${i}-gender`);
        // Document: required when the guest is 10 or older.
        const needDoc = a >= 10;
        if (needDoc && !g.validIdName) e.add(`x${i}-validId`);
      });
    }
    // Step 1 (Payment): a payment method must be selected.
    if (step === 1 && !payment.methodId) e.add("method");
    // Step 2 (Confirm payment): reference number + receipt are required, since
    // the guest pays the 50% down payment during checkout.
    if (step === 2) {
      if (!payment.reference.trim()) e.add("reference");
      if (!payment.proofData) e.add("receipt");
    }
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
  // any Continue click. Adults 18–120, young adults 7–17, children 7 & under.
  type GType = "adult" | "child" | "infant";
  const ageInvalidNow = (value: string, t: GType): boolean => {
    if (value === "") return false;
    const a = parseInt(value);
    if (isNaN(a)) return true;
    return t === "adult" ? a < 18 || a > 120 : t === "child" ? a < 7 || a > 17 : a < 0 || a > 7;
  };
  const ageStyle = (value: string, t: GType, key: string): React.CSSProperties =>
    ageInvalidNow(value, t) || (showErrors && fieldErrors.has(key)) ? { ...inputStyle, borderColor: "#ef4444" } : inputStyle;
  const AgeNote = ({ value, t, k }: { value: string; t: GType; k: string }) => {
    if (ageInvalidNow(value, t)) {
      const a = parseInt(value);
      const msg = t === "adult"
        ? (a < 18 ? "Must be 18 or older — adults only." : "Enter a realistic age (max 120).")
        : t === "child"
        ? "Young adults must be aged 7–17."
        : "Children must be aged 7 or under.";
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
      payment_reference: payment.reference || undefined, // guest-entered reference number
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
    <div className="page-enter" style={{ backgroundColor: "#F6EFE2", color: "#1F160E", minHeight: "100vh", fontFamily: "'Geist', system-ui, -apple-system, sans-serif" }}>
      {/* HEADER — checkout step bar */}
      <header className="co-deskhdr" style={{ position: "sticky", top: 0, zIndex: 50, background: "#FAF7F1", borderBottom: "1px solid #ECE5D4", fontFamily: "'Geist', system-ui, -apple-system, sans-serif", color: "#1F160E" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
          .co-exit { color: #1F160E; text-decoration: none; border-bottom: 1px solid #1F160E; padding-bottom: 1px; }
          @media (max-width: 860px) { .co-steps { display: none !important; } }
          @keyframes co-fade { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes co-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(212,169,106,.45); } 50% { box-shadow: 0 0 0 6px rgba(212,169,106,0); } }
          .co-fade { animation: co-fade .28s cubic-bezier(.2,.7,.2,1); }
          .co-pay-now { animation: co-pulse 2.6s ease-in-out infinite; }
          .co-mobile-steps, .co-mobhdr, .co-mob-stay { display: none; }
          @media (max-width: 860px) {
            .co-wrap { padding: 14px 16px 48px !important; }
            .co-grid { grid-template-columns: 1fr !important; gap: 22px !important; }
            .co-form-grid { grid-template-columns: 1fr !important; }
            .co-aside-inner { position: static !important; top: auto !important; }
            .co-mobile-steps { display: flex !important; }
            .co-mobhdr { display: flex !important; }
            .co-mob-stay { display: flex !important; }
            .co-deskhdr { display: none !important; }
            .co-back-chip { display: none !important; }
            .co-h1 { font-size: 30px !important; }
            .co-qr { width: 168px !important; height: 168px !important; }
          }
          @media (max-width: 420px) {
            .co-pay-amt { font-size: 42px !important; }
          }
        `}</style>
        <div style={{ maxWidth: 1320, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

          {/* wordmark */}
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 30, height: 30, flex: "none", background: "#1f1b16", color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 16, fontStyle: "italic", letterSpacing: "-0.04em" }}>D</div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18 }}>D&rsquo; Lux Homes</div>
          </Link>

          {/* step indicator */}
          <div className="co-steps" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
            {STEPS.map((s, i) => {
              const done = i < step, current = i === step;
              const circle = done
                ? { background: "#1F160E", color: "#faf7f1", border: "none" as const }
                : current
                ? { background: "#B07848", color: "#FAF7F1", border: "none" as const }
                : { background: "transparent", color: "#A89B86", border: "1.5px solid #DDD2BF" };
              const labelColor = done ? "#1F160E" : current ? "#1F160E" : "#A89B86";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* connector fills in once the previous step is done */}
                  {i > 0 && <div style={{ width: 30, height: 2, borderRadius: 2, background: i <= step ? "#C9B79A" : "#E6DCCB" }} />}
                  <button onClick={() => done && setStep(i)} style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: 0, padding: 0, font: "inherit", color: labelColor, fontWeight: current ? 700 : done ? 500 : 400, cursor: done ? "pointer" : "default" }}>
                    <span style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 600, fontFamily: "'Geist Mono', ui-monospace, monospace", ...circle }}>
                      {done ? <IcoCheckLg /> : i + 1}
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

      {/* MOBILE header (back + Checkout) */}
      <div className="co-mobhdr" style={{ position: "sticky", top: 0, zIndex: 50, background: "#FAF7F1", borderBottom: "1px solid #ECE5D4", padding: "12px 12px", alignItems: "center", gap: 10 }}>
        <button onClick={() => (step === 0 ? router.back() : setStep(step - 1))} aria-label="Back" style={{ display: "inline-flex", alignItems: "center", padding: 8, border: "none", background: "transparent", color: "#6b6358", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, color: "#1F160E" }}>Checkout</div>
      </div>

      <div className="co-wrap" style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 60px" }}>
        {/* Back */}
        <style>{`
          .back-btn {
            display: inline-flex;
            gap: 8px;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: #1F160E;
            text-decoration: none;
            margin-bottom: 18px;
            padding: 9px 16px;
            border-radius: 999px;
            background: #FFFCF4;
            border: 1.5px solid #D4BE9A;
            box-shadow: 0 1px 3px rgba(31,22,14,0.05);
            transition: background 0.22s ease, border-color 0.22s ease,
              color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
          }
          .back-btn:hover {
            background: #F6EFE2;
            border-color: #8C5A2E;
            color: #8C5A2E;
            box-shadow: 0 3px 10px rgba(31,22,14,0.08);
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
        <Link href={`/rooms/${room.id}`} className="back-btn co-back-chip">
          <span className="back-btn__chev"><IcoChevLeft /></span> Back to {room.name.split(/\s*[—–-]\s*/)[0]}
        </Link>

        <h1 className="co-h1" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 46, fontWeight: 400, letterSpacing: "-.025em", margin: "0 0 4px" }}>Confirm and pay</h1>
        <p style={{ margin: "0 0 26px", fontSize: 14, color: "#8B7458" }}>{stepCaption}</p>

        <div className="co-grid" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 44, alignItems: "start" }}>
          {/* STEP CONTENT */}
          <div>
            {/* Mobile-only step dots (the header step bar hides below 860px) */}
            <div className="co-mobile-steps" style={{ alignItems: "center", gap: 5, marginBottom: 22 }}>
              {STEPS.map((s, i) => {
                const done = i < step, current = i === step;
                const shortLabel = ["Details", "Payment", "Confirm", "Review"][i];
                return (
                  <div key={i} style={{ display: "contents" }}>
                    {i > 0 && <div style={{ height: 1.5, flex: "0 0 12px", background: "#D4BE9A", marginBottom: 18 }} />}
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#1F160E" : current ? "#B07848" : "#EFE4CE", color: done || current ? "#fff" : "#8B7458", display: "grid", placeItems: "center", margin: "0 auto 6px", fontSize: 12, fontWeight: current ? 700 : 600 }}>
                        {done ? <IcoCheck /> : i + 1}
                      </div>
                      <div style={{ fontSize: 10, color: current ? "#1F160E" : "#8B7458", fontWeight: current ? 600 : 400 }}>{shortLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* MOBILE compact stay card */}
            <div className="co-mob-stay" style={{ gap: 14, background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 18, padding: 14, marginBottom: 18 }}>
              <div style={{ width: 74, height: 74, borderRadius: 12, overflow: "hidden", flexShrink: 0, position: "relative", background: "#EFE4CE" }}>
                <Image src={room.images[0]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 16, lineHeight: 1.15 }}>{room.name}</div>
                <div style={{ fontSize: 12, color: "#8B7458", marginTop: 6 }}>{stayType === "10" ? "Day / Night use" : "Overnight"} · {formatDate(date)}</div>
                <div style={{ fontSize: 12, color: "#8B7458", marginTop: 2 }}>{checkInTime} → {checkOutTime} · {adults + children + infants} guest{adults + children + infants > 1 ? "s" : ""}</div>
              </div>
            </div>

            {/* reserve-now reminder banner — sets the pay-to-reserve expectation early */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 16, background: "#2C2218", color: "#F6EFE2", marginBottom: 26 }}>
              <div style={{ width: 38, height: 38, flex: "none", borderRadius: 10, background: "#3a2e20", display: "grid", placeItems: "center", color: "#D4A96A" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Reserve today for just <span style={{ color: "#FBE9C8" }}>{peso(downPayment)}</span> — 50% down payment.</div>
                <div style={{ fontSize: 12.5, color: "#B8A68E", marginTop: 2 }}>The {peso(total - downPayment)} balance &amp; {peso(SECURITY_DEPOSIT)} refundable deposit are settled at check-in.</div>
              </div>
            </div>
            {/* Step 0: Guest info */}
            {step === 0 && (
              <div className="fade-in">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-.02em" }}>Guest information</h2>
                <p style={{ color: "#8B7458", fontSize: 14, margin: "0 0 22px" }}>Adult 1 · Main guest</p>
                <div className="co-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                    <div style={{ fontSize: 11, color: "#8B7458", marginTop: 6 }}>Alternative contact in case email is incorrect.</div>
                  </FieldLabel>
                </div>
                <div id="f-validId" style={{ marginTop: 24, border: showErrors && fieldErrors.has("validId") ? "1px solid #ef4444" : "1px solid #D4BE9A", borderRadius: 18, background: "#FFFCF4", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#EFE4CE", borderBottom: "1px solid #E0CEB2" }}>
                    <span style={{ color: "#8C5A2E", display: "inline-flex" }}><IcoShield /></span>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1F160E" }}>Valid ID <span style={{ color: "#8B7458", fontWeight: 500 }}>· required for guests 10+</span></div>
                  </div>
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 12.5, color: "#8B7458", marginBottom: 14 }}>Accepted: Driver&apos;s License, Passport, National ID, School ID.</div>
                    {showErrors && fieldErrors.has("validId") && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14 }}>Please upload a valid ID for the main guest.</div>}
                    {!info.validIdName ? (
                      <div>
                        <div style={{ border: "1px dashed #D4BE9A", borderRadius: 14, padding: 32, textAlign: "center", marginBottom: 12, cursor: "pointer", background: "#FAF7F1" }} onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => setInfo({ ...info, validIdName: file.name, validIdData: data })); }; f.click(); }}>
                          <div style={{ width: 52, height: 52, borderRadius: 12, background: "#EFE4CE", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "#A88E63" }}>
                            <IcoUpload />
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F160E", marginBottom: 6 }}>Click to upload ID photo</div>
                          <div style={{ fontSize: 12, color: "#8B7458" }}>PNG, JPG, JPEG up to 5MB</div>
                        </div>
                        <button onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.capture = "environment" as any; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => setInfo({ ...info, validIdName: file.name, validIdData: data })); }; f.click(); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, border: "1px dashed #D4BE9A", borderRadius: 12, background: "transparent", color: "#8C5A2E", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          Take photo with camera
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid #E0CEB2", borderRadius: 14, background: "#FAF7F1" }}>
                        <div style={{ position: "relative", width: 66, height: 66, flex: "none" }}>
                          <div style={{ width: "100%", height: "100%", borderRadius: 11, background: "repeating-linear-gradient(135deg,#EFE4CE,#EFE4CE 6px,#E6D8BC 6px,#E6D8BC 12px)", display: "grid", placeItems: "center", color: "#A88E63" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>
                          <div style={{ position: "absolute", right: -5, bottom: -5, width: 22, height: 22, borderRadius: "50%", background: "#22C55E", border: "2px solid #FAF7F1", display: "grid", placeItems: "center", color: "#fff" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1F160E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.validIdName}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#15803D", background: "#DCFCE7", padding: "3px 9px", borderRadius: 999 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Uploaded</span>
                          </div>
                        </div>
                        <button onClick={() => setInfo({ ...info, validIdName: null, validIdData: null })} style={{ fontSize: 12.5, fontWeight: 600, color: "#B4453C", background: "transparent", border: "none", cursor: "pointer", padding: "7px 8px" }}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional guests — name, age, gender + valid ID only */}
                {extraGuests.map((g, i) => {
                  const t = guestType(i);
                  const typeLabel = t === "adult" ? "Adult (18+)" : t === "child" ? "Young Adult (7–17)" : "Child (7 & under)";
                  const ageLabel = t === "adult" ? "Age * (18+)" : t === "child" ? "Age * (7–17)" : "Age * (7 & under)";
                  const ageMin = t === "adult" ? 18 : t === "child" ? 7 : 0;
                  const ageMax = t === "adult" ? 120 : t === "child" ? 17 : 7;
                  const agePlaceholder = t === "adult" ? "18" : t === "child" ? "12" : "5";
                  return (
                  <div key={i} style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
                    <p style={{ color: "var(--ink)", fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Guest {i + 2} <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>· {typeLabel}</span></p>
                    <div className="co-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                      title="Valid ID (Required for guests 10+ years old)"
                      requiredMsg="Please upload a valid ID for this guest."
                      onPick={(name, data) => updateGuest(i, { validIdName: name, validIdData: data })}
                      onClear={() => updateGuest(i, { validIdName: null, validIdData: null })}
                    />
                  </div>
                  );
                })}
              </div>
            )}

            {/* Step 1: Payment method */}
            {/* Step 1: choose a payment method + show its QR / account details */}
            {step === 1 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 18px", letterSpacing: "-.02em" }}>How would you like to pay?</h2>

                {methods.length === 0 ? (
                  <div style={{ padding: 20, borderRadius: 16, background: "#EFE4CE", fontSize: 13.5, color: "#4A3A2A", lineHeight: 1.6 }}>
                    No payment methods are available right now. Please contact us to arrange payment for your booking.
                  </div>
                ) : (
                  <>
                    {/* method options */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
                      {methods.map((m) => {
                        const active = payment.methodId === m.id;
                        const isG = m.payment_method === "gcash";
                        const badgeBg = isG ? "#0A6FF1" : "#9E1B32";
                        const badgeTxt = isG ? "G" : (m.provider || m.payment_name).slice(0, 3).toUpperCase();
                        return (
                          <button key={m.id} onClick={() => setPayment({ ...payment, methodId: m.id, method: m.payment_method })}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", borderRadius: 16, background: active ? "rgba(176,120,72,.06)" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                            <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: badgeBg, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: isG ? 17 : 12 }}>{badgeTxt}</div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: "#1F160E" }}>{m.payment_name}</div>
                              <div style={{ fontSize: 12.5, color: "#8B7458", marginTop: 1 }}>{m.account_details}</div>
                            </div>
                            <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>
                              {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedMethod && (
                      <div style={{ border: "1px solid #E0CEB2", borderRadius: 18, background: "#FFFCF4", overflow: "hidden" }}>
                        <div style={{ padding: "22px 22px 24px", textAlign: "center", background: "#EFE4CE" }}>
                          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", color: "#8B7458", marginBottom: 16 }}>Scan to pay {peso(downPayment)} · {selectedMethod.payment_name}</div>
                          <div className="co-qr" style={{ position: "relative", width: 184, height: 184, margin: "0 auto" }}>
                            {selectedMethod.payment_qr_link ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={selectedMethod.payment_qr_link} alt={`${selectedMethod.payment_name} QR`} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 14, background: "#FFFCF4", border: "1px solid #E6D8BC" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", borderRadius: 14, background: "#FFFCF4", display: "grid", placeItems: "center", color: "#A88E63", fontSize: 12, padding: 20, lineHeight: 1.5, textAlign: "center", border: "1px solid #E6D8BC" }}>QR code appears here once the host uploads it — meanwhile, use the number below.</div>
                            )}
                            <span style={{ position: "absolute", top: -3, left: -3, width: 26, height: 26, borderTop: "3px solid #B07848", borderLeft: "3px solid #B07848", borderRadius: "9px 0 0 0" }} />
                            <span style={{ position: "absolute", top: -3, right: -3, width: 26, height: 26, borderTop: "3px solid #B07848", borderRight: "3px solid #B07848", borderRadius: "0 9px 0 0" }} />
                            <span style={{ position: "absolute", bottom: -3, left: -3, width: 26, height: 26, borderBottom: "3px solid #B07848", borderLeft: "3px solid #B07848", borderRadius: "0 0 0 9px" }} />
                            <span style={{ position: "absolute", bottom: -3, right: -3, width: 26, height: 26, borderBottom: "3px solid #B07848", borderRight: "3px solid #B07848", borderRadius: "0 0 9px 0" }} />
                          </div>
                        </div>
                        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>{selectedMethod.payment_name} account</div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#1F160E", fontFamily: "'Geist Mono', monospace", marginTop: 3 }}>{selectedMethod.account_details}</div>
                            </div>
                            <button onClick={copyAccount} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: "8px 16px", cursor: "pointer", flex: "none", border: "none", background: copied ? "#DCFCE7" : "#2C2218", color: copied ? "#15803D" : "#F6EFE2" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> {copied ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: "1px solid #EFE4CE" }}>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Exact amount to send</div>
                              <div style={{ fontSize: 20, fontWeight: 600, color: "#8C5A2E", fontFamily: "'Fraunces', Georgia, serif", marginTop: 2 }}>{peso(downPayment)}</div>
                            </div>
                            <span style={{ fontSize: 11.5, color: "#8B7458", maxWidth: 150, textAlign: "right", lineHeight: 1.4 }}>Send this exact amount to reserve instantly.</span>
                          </div>
                        </div>
                        <div style={{ padding: "16px 22px 18px", background: "#FAF7F1", borderTop: "1px solid #EFE4CE", display: "flex", gap: 6 }}>
                          {[["1", `Open ${selectedMethod.payment_name}`], ["2", `Send ${peso(downPayment)}`], ["3", "Screenshot the receipt"]].map(([n, t]) => (
                            <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textAlign: "center" }}>
                              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#2C2218", color: "#F6EFE2", display: "grid", placeItems: "center", fontSize: 11, fontFamily: "'Geist Mono', monospace" }}>{n}</span>
                              <span style={{ fontSize: 11, color: "#4A3A2A", lineHeight: 1.3 }}>{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p style={{ textAlign: "center", fontSize: 12.5, color: "#8B7458", margin: "14px 4px 0", lineHeight: 1.5 }}>After paying, tap <strong style={{ color: "#1F160E" }}>Continue</strong> to enter your reference number and upload the receipt.</p>
                    {showErrors && fieldErrors.has("method") && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>Please choose a payment method.</div>}
                  </>
                )}
              </div>
            )}

            {/* Step 2: confirm payment — reference number + receipt upload */}
            {step === 2 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-.02em" }}>Confirm your payment</h2>
                <p style={{ fontSize: 14, color: "#4A3A2A", margin: "0 0 22px", lineHeight: 1.55 }}>
                  Add your reference number and receipt so we can verify the <strong>{peso(downPayment)}</strong> you sent{selectedMethod ? <> via <strong>{selectedMethod.payment_name}</strong></> : null} and confirm your booking.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", marginBottom: 8 }}>Payment reference number *</div>
                  <input id="f-reference" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="e.g. 0123 4567 8901" style={{ ...fieldStyle("reference"), fontFamily: "'Geist Mono', monospace", fontSize: 15, letterSpacing: ".04em", padding: "13px 14px" }} />
                  {showErrors && fieldErrors.has("reference")
                    ? <div style={{ fontSize: 11, color: "#ef4444", marginTop: 7 }}>Enter the reference number from your payment.</div>
                    : <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#8B7458", marginTop: 7 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg> Found in your {selectedMethod?.payment_name || "payment"} receipt, labelled &ldquo;Ref No.&rdquo; or &ldquo;Reference&rdquo;.</div>}
                </div>

                <UploadField label="Payment receipt *" sub="Screenshot of your GCash / bank confirmation" value={payment.proofName} onChange={(name, data) => setPayment({ ...payment, proofName: name, proofData: data })} invalid={showErrors && fieldErrors.has("receipt")} id="f-receipt" />

                <div style={{ marginTop: 22, padding: "16px 18px", borderRadius: 14, border: "1px solid #E0CEB2", background: "#FAF7F1", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "#8C5A2E", flex: "none", marginTop: 1 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                  <div style={{ fontSize: 12.5, color: "#4A3A2A", lineHeight: 1.55 }}><strong style={{ color: "#1F160E" }}>What happens next —</strong> once you submit, our host verifies your payment (usually within an hour) and emails your booking confirmation. Your dates are held in the meantime.</div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="co-fade">
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 500, margin: "0 0 18px", letterSpacing: "-.02em" }}>Double-check everything</h2>
                <ReviewBlock title="Guest" onEdit={() => setStep(0)}>
                  <div style={{ fontSize: 14 }}>{info.firstName} {info.lastName}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{info.age} years old · {info.gender}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{info.email} · {info.phone}</div>
                  {info.facebook && <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>Facebook: {info.facebook}</div>}
                </ReviewBlock>
                <ReviewBlock title="Stay" onEdit={() => router.back()}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{room.name}</div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>{formatDateLong(date)} · {checkInTime} → {checkOutTime}</div>
                  <div style={{ fontSize: 13, color: "#8B7458" }}>{stayType === "10" ? "10-hour stay" : `Overnight · ${nights} night${nights > 1 ? "s" : ""}`} · {adults + children + infants} guest{adults + children + infants > 1 ? "s" : ""}</div>
                </ReviewBlock>
                <ReviewBlock title="Payment" onEdit={() => setStep(1)}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedMethod?.payment_name || payment.method || "—"} ·</span>
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600, color: "#8C5A2E" }}>{peso(downPayment)}</span>
                    <span style={{ fontSize: 13, color: "#8B7458" }}>due now · 50% down payment</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 4 }}>Ref no. {payment.reference || "—"}{payment.proofName ? ` · receipt: ${payment.proofName}` : ""}</div>
                  <div style={{ fontSize: 13, color: "#8B7458", marginTop: 2 }}>{peso(total - downPayment)} balance + {peso(SECURITY_DEPOSIT)} deposit at check-in</div>
                </ReviewBlock>
                <div style={{ marginTop: 20, padding: 20, background: "#EFE4CE", borderRadius: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>You&apos;re agreeing to:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#4A3A2A", lineHeight: 1.75 }}>
                    <li>Check-in at {checkInTime} and check-out by {checkOutTime}</li>
                    <li>House rules — strictly no smoking/vaping, no pets, no walk-ins</li>
                    <li>50% balance + ₱1,000 refundable security deposit due at check-in</li>
                    <li>No cancellations — one free date change if requested ≥7 days before check-in, new date within 1 month</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34 }}>
              <button onClick={() => step === 0 ? router.back() : setStep(step - 1)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, background: "#FFFCF4", color: "#1F160E", border: "1px solid #D4BE9A", cursor: "pointer" }}>
                <IcoChevLeft /> {step === 0 ? "Back to stay" : "Back"}
              </button>
              {step < STEPS.length - 1 ? (
                <button onClick={() => tryAdvance(() => setStep(step + 1))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "#FFFCF4", border: "none", cursor: "pointer" }}>
                  Continue <IcoArrowRight />
                </button>
              ) : (
                <button onClick={() => tryAdvance(submit)} disabled={submitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "#FFFCF4", border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  <IcoCheckLg /> {submitting ? "Submitting…" : "Submit booking request"}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR — stay summary + pay-now hero */}
          <aside>
            <div className="co-aside-inner" style={{ position: "sticky", top: 92, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* stay summary card */}
              <div style={{ background: "#FFFCF4", borderRadius: 20, padding: 22, border: "1px solid #E0CEB2", boxShadow: "0 1px 2px rgba(31,22,14,.04), 0 2px 8px rgba(31,22,14,.04)" }}>
                <div style={{ display: "flex", gap: 14, paddingBottom: 18, borderBottom: "1px solid #E0CEB2" }}>
                  <div style={{ width: 74, height: 74, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#EFE4CE", position: "relative" }}>
                    <Image src={room.images[0]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#8C5A2E", textTransform: "uppercase", letterSpacing: ".12em" }}>Quezon City</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{room.name}</div>
                    <div style={{ fontSize: 12, color: "#8B7458", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}><IcoStar /> {room.rating} · {room.reviewCount} reviews</div>
                  </div>
                </div>
                <div style={{ padding: "16px 0", borderBottom: "1px solid #E0CEB2", fontSize: 13, display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Date</span><span style={{ fontWeight: 600 }}>{formatDate(date)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Window</span><span style={{ fontWeight: 600 }}>{checkInTime} → {checkOutTime}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#4A3A2A" }}>Guests</span><span style={{ fontWeight: 600 }}>{adults + children + infants}</span></div>
                </div>
                <div style={{ padding: "16px 0 0", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>{stayType === "10" ? `10-hour stay · ${isWeekendRate ? "Weekend/Holiday" : "Weekday"}` : `Overnight · ${nights} night${nights > 1 ? "s" : ""}`}</span><span>{peso(basePrice)}</span></div>
                  {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra pax · {extraPaxCount} × {peso(room.additionalPaxFee)}</span><span>{peso(paxFee)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 6, paddingTop: 10, borderTop: "1px solid #E0CEB2" }}><span>Total stay value</span><span>{peso(total)}</span></div>
                </div>
              </div>

              {/* PAY-NOW HERO */}
              <div className="co-pay-now" style={{ borderRadius: 20, overflow: "hidden", background: "#2C2218", color: "#F6EFE2", boxShadow: "0 10px 30px rgba(44,34,24,.22)" }}>
                <div style={{ padding: "22px 22px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4A96A", display: "inline-block" }} />
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#D4A96A" }}>Pay now to reserve</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                    <div className="co-pay-amt" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{peso(downPayment)}</div>
                    <div style={{ fontSize: 12, color: "#B8A68E", textAlign: "right", paddingBottom: 6 }}>50% down<br />payment</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#B8A68E", marginTop: 8, lineHeight: 1.5 }}>Secures your booking instantly. Send this amount first — the rest is paid when you arrive.</div>
                </div>
                <div style={{ background: "#37291c", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#E7DCC9" }}><span>Balance at check-in</span><span style={{ fontWeight: 600 }}>{peso(total - downPayment)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#E7DCC9" }}><span>Refundable deposit</span><span style={{ fontWeight: 600 }}>{peso(SECURITY_DEPOSIT)}</span></div>
                  <div style={{ fontSize: 11, color: "#9B8B73", marginTop: -4 }}>Deposit is a separate hold, returned after check-out.</div>
                </div>
              </div>

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
