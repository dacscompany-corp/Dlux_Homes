"use client";

import { useState, useRef, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { mockRooms } from "@/lib/mock-data";
import { generateBookingId } from "@/lib/booking-store";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { havenToRoom } from "@/lib/haven-adapter";

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
  return d.toISOString().slice(0, 10);
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

const ADDONS = [
  { id: "pool", name: "Pool Pass", price: 150, unit: "per pax", desc: "Unlimited pool access during stay" },
  { id: "towels", name: "Extra Towels", price: 50, unit: "per set", desc: "Fresh towel set" },
  { id: "robe", name: "Bath Robe", price: 150, unit: "each", desc: "Plush cotton bath robe" },
  { id: "comforter", name: "Extra Comforter", price: 100, unit: "each", desc: "Heavy winter comforter" },
  { id: "kit", name: "Guest Kit", price: 75, unit: "per pax", desc: "Toothbrush, toothpaste, cotton buds" },
  { id: "slippers", name: "Slippers", price: 30, unit: "per pair", desc: "Disposable indoor slippers" },
  { id: "breakfast", name: "Breakfast for Two", price: 450, unit: "per set", desc: "Silog, coffee, fresh fruit" },
];

const STEPS = ["Our details", "Add-ons", "Payment", "Review"];

type Info = { firstName: string; lastName: string; age: string; gender: string; email: string; phone: string; facebook: string; notes: string; validIdName: string | null };
type Payment = { method: "gcash" | "bank" | "card"; proofName: string | null; idName: string | null; cardNum: string; cardName: string; cardExpiry: string; cardCvc: string };
type AddOns = Record<string, number>;

function FieldLabel({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "var(--ink)", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-2)", fontSize: 14, background: "var(--white)", color: "var(--ink)", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

function UploadField({ label, sub, value, onChange }: { label: string; sub: string; value: string | null; onChange: (name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 8 }}>{label}</div>
      <input ref={ref} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f.name); }} />
      <button onClick={() => ref.current?.click()}
        style={{ width: "100%", padding: 20, borderRadius: 14, border: value ? "1px solid var(--dlux-accent)" : "1px dashed var(--line-2)", background: value ? "rgba(176,120,72,.06)" : "var(--white)", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: value ? "var(--dlux-accent)" : "var(--bg-2)", display: "grid", placeItems: "center", color: value ? "var(--white)" : "var(--ink-2)" }}>
          {value ? <IcoCheckLg /> : <IcoUpload />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{value || "Click to upload"}</div>
          <div style={{ fontSize: 11, color: "var(--ink)" }}>{sub}</div>
        </div>
      </button>
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

function CheckoutInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const roomId = sp.get("roomId") || "1";
  const stayType = sp.get("stayType") || "21";
  const checkInTime = sp.get("checkIn") || "10:00 AM";
  const checkOutTime = sp.get("checkOut") || "7:00 AM";
  const windowLabel = sp.get("windowLabel") || "Full stay";
  const date = sp.get("date") || "";
  const adults = Number(sp.get("adults") || 2);
  const children = Number(sp.get("children") || 0);
  const infants = Number(sp.get("infants") || 0);

  // Live haven by id; fall back to mock so the page renders while loading.
  const { data: havenRes } = useGetHavenByIdQuery(roomId, { skip: !roomId });
  const liveHaven = (havenRes as { data?: Record<string, unknown> } | undefined)?.data;
  const room = liveHaven ? havenToRoom(liveHaven) : (mockRooms.find((r) => r.id === roomId) || mockRooms[0]);

  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<Info>({ firstName: "", lastName: "", age: "", gender: "Male", email: "", phone: "", facebook: "", notes: "", validIdName: null });
  const [addOns, setAddOns] = useState<AddOns>({});
  const [payment, setPayment] = useState<Payment>({ method: "gcash", proofName: null, idName: null, cardNum: "", cardName: "", cardExpiry: "", cardCvc: "" });
  const [submitting, setSubmitting] = useState(false);

  const basePrice = stayType === "10" ? room.price10hr : room.price21hr;
  const extraPax = Math.max(0, adults + children - (room.basePax ?? 2));
  const paxFee = extraPax * (room.additionalPaxFee ?? 150);
  const addOnsTotal = Object.entries(addOns).reduce((s, [id, qty]) => {
    const a = ADDONS.find((x) => x.id === id); return s + (a ? a.price * qty : 0);
  }, 0);
  const cleaning = 150;
  const subtotal = basePrice + paxFee + addOnsTotal;
  const serviceFee = Math.round(subtotal * 0.08);
  const total = subtotal + cleaning + serviceFee;
  const downPayment = Math.round(total * 0.3);

  const canNext = () => {
    if (step === 0) {
      const age = parseInt(info.age);
      const needsId = age >= 10;
      return info.firstName && info.lastName && info.age && age > 0 && info.gender && info.email && /@/.test(info.email) && info.phone && (!needsId || info.validIdName);
    }
    if (step === 1) return true;
    if (step === 2) {
      if (payment.method === "gcash" || payment.method === "bank") return !!(payment.proofName && payment.idName);
      if (payment.method === "card") return payment.cardNum.length >= 12 && !!payment.cardName && !!payment.cardExpiry && payment.cardCvc.length >= 3;
    }
    return true;
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const bookingId = generateBookingId();
    const ci = to24h(checkInTime);
    const co = to24h(checkOutTime);
    const checkInDate = date || new Date().toISOString().slice(0, 10);
    // If the check-out time is the same or earlier than check-in (e.g. an
    // overnight 21-hour stay ending the next morning), it lands on the next day.
    const checkOutDate = co <= ci ? addDays(checkInDate, 1) : checkInDate;

    const addOnItems = Object.entries(addOns)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => {
        const a = ADDONS.find((x) => x.id === id)!;
        return { name: a.name, price: a.price, quantity: qty };
      });

    const payload = {
      booking_id: bookingId,
      user_id: null,
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
      payment_method: payment.method,
      room_rate: basePrice,
      add_ons_total: addOnsTotal,
      total_amount: total,
      down_payment: downPayment,
      add_ons: addOnItems,
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
      toast.success("Booking submitted!");
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

  return (
    <div className="page-enter" style={{ backgroundColor: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(246,239,226,.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Image src="/logo.png" alt="D'Lux Homes" width={56} height={56} unoptimized style={{ objectFit: "contain" }} />
            </div>
            <div className="serif" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.02em" }}>D&apos; Lux Homes</div>
          </Link>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Step {step + 1} of {STEPS.length}</div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 60px" }}>
        {/* Back */}
        <Link href={`/rooms/${room.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--ink)", textDecoration: "none", marginBottom: 20 }}>
          <IcoChevLeft /> Back to {room.name}
        </Link>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
          <h1 className="serif" style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-.025em", margin: 0 }}>Confirm and pay</h1>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", gap: 0, marginBottom: 36, background: "var(--bg-2)", padding: 6, borderRadius: 999, width: "fit-content" }}>
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => i < step && setStep(i)}
              style={{ padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: i === step ? "var(--ink)" : "transparent", color: i === step ? "var(--white)" : i < step ? "var(--ink)" : "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6, cursor: i < step ? "pointer" : "default", border: "none" }}>
              {i < step && <IcoCheck />}
              {i >= step && <span style={{ width: 18, height: 18, borderRadius: "50%", background: i === step ? "rgba(255,255,255,.2)" : "var(--line-2)", display: "grid", placeItems: "center", fontSize: 10 }}>{i + 1}</span>}
              {s}
            </button>
          ))}
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
                    <input style={inputStyle} value={info.firstName} onChange={(e) => setInfo({ ...info, firstName: e.target.value })} placeholder="John" />
                  </FieldLabel>
                  <FieldLabel label="Last Name *">
                    <input style={inputStyle} value={info.lastName} onChange={(e) => setInfo({ ...info, lastName: e.target.value })} placeholder="Doe" />
                  </FieldLabel>
                  <FieldLabel label="Age *">
                    <input style={inputStyle} type="number" min="1" value={info.age} onChange={(e) => setInfo({ ...info, age: e.target.value })} placeholder="18" />
                  </FieldLabel>
                  <FieldLabel label="Gender *">
                    <select style={inputStyle} value={info.gender} onChange={(e) => setInfo({ ...info, gender: e.target.value })}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Email Address *">
                    <input style={inputStyle} type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} placeholder="csr@staycationhavenph.com" />
                  </FieldLabel>
                  <FieldLabel label="Phone Number *">
                    <input style={inputStyle} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} placeholder="+63 9991484954" />
                  </FieldLabel>
                  <FieldLabel label="Facebook Name or Link" span>
                    <input style={inputStyle} value={info.facebook} onChange={(e) => setInfo({ ...info, facebook: e.target.value })} placeholder="e.g. Juan Dela Cruz or facebook.com/juandelacruz" />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Alternative contact in case email is incorrect</div>
                  </FieldLabel>
                </div>
                <div style={{ marginTop: 24, padding: 28, background: "#3d3529", borderRadius: 20, border: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ color: "#D4A96A" }}><IcoShield /></span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#F6EFE2" }}>Valid ID (Required for guests 10+ years old)</div>
                  </div>
                  <div style={{ fontSize: 13, color: "#B8A68E", marginBottom: 20 }}>Accepted: Driver's License, Passport, National ID, School ID</div>
                  {!info.validIdName ? (
                    <div>
                      <div style={{ background: "#4d4337", borderRadius: 14, padding: 40, textAlign: "center", marginBottom: 16, cursor: "pointer" }} onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) setInfo({ ...info, validIdName: file.name }); }; f.click(); }}>
                        <div style={{ width: 56, height: 56, borderRadius: 12, background: "#5d5347", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "#B8A68E" }}>
                          <IcoUpload />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F6EFE2", marginBottom: 6 }}>Click to upload ID photo</div>
                        <div style={{ fontSize: 12, color: "#B8A68E" }}>PNG, JPG, JPEG up to 5MB</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#9B8B73", marginBottom: 14, fontWeight: 500 }}>OR</div>
                        <button onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.capture = "environment" as any; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) setInfo({ ...info, validIdName: file.name }); }; f.click(); }} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600, background: "#4d4337", color: "#F6EFE2", border: "1px solid #5d5347", cursor: "pointer" }}>
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
              </div>
            )}

            {/* Step 1: Add-ons */}
            {step === 1 && (
              <div className="fade-in">
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-.02em" }}>Make it yours</h2>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 22px" }}>Optional add-ons. Skip if you don&apos;t need them.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {ADDONS.map((a) => {
                    const qty = addOns[a.id] || 0;
                    return (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, background: "var(--white)", border: "1px solid var(--line)", borderRadius: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--bg-2)", display: "grid", placeItems: "center" }}>
                          <span style={{ color: "var(--accent-ink)" }}><IcoTag /></span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{a.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{a.desc}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, minWidth: 90, textAlign: "right" }}>
                          {peso(a.price)} <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>/ {a.unit}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button onClick={() => setAddOns({ ...addOns, [a.id]: Math.max(0, qty - 1) })}
                            style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--white)", display: "grid", placeItems: "center", cursor: qty === 0 ? "not-allowed" : "pointer", opacity: qty === 0 ? 0.4 : 1 }}>
                            <IcoMinus />
                          </button>
                          <div style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{qty}</div>
                          <button onClick={() => setAddOns({ ...addOns, [a.id]: qty + 1 })}
                            style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--white)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                            <IcoPlus />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Payment */}
            {step === 2 && (
              <div className="fade-in">
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>How would you like to pay?</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
                  {([
                    { id: "gcash" as const, label: "GCash", sub: "Scan & upload proof", icon: <IcoPhone /> },
                    { id: "bank" as const, label: "Bank Transfer", sub: "BPI / UnionBank", icon: <IcoHome /> },
                    { id: "card" as const, label: "Credit / Debit", sub: "Visa · Mastercard", icon: <IcoCreditCard /> },
                  ] as const).map((m) => (
                    <button key={m.id} onClick={() => setPayment({ ...payment, method: m.id })}
                      style={{ padding: 16, textAlign: "left", borderRadius: 14, border: payment.method === m.id ? "2px solid var(--ink)" : "1px solid var(--line-2)", background: "var(--white)", cursor: "pointer", color: "var(--ink)" }}>
                      {m.icon}
                      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: "var(--ink)" }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ink)", marginTop: 2 }}>{m.sub}</div>
                    </button>
                  ))}
                </div>

                {(payment.method === "gcash" || payment.method === "bank") && (
                  <div>
                    <div style={{ padding: 24, borderRadius: 20, background: "var(--white)", border: "1px dashed var(--line-2)", display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center", marginBottom: 20 }}>
                      <div style={{ width: 130, height: 130, borderRadius: 12, background: "var(--bg-2)", display: "grid", placeItems: "center", fontSize: 48 }}>📱</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)" }}>
                          {payment.method === "gcash" ? "GCash · D' Lux Homes" : "BPI · D' Lux Homes"}
                        </div>
                        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--ink)" }}>
                          {payment.method === "gcash" ? "0946 · 007 · 4015" : "0123 · 4567 · 8901"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 10, lineHeight: 1.55 }}>
                          Send a <strong>{peso(downPayment)}</strong> down payment to secure your booking. Upload the screenshot below. Balance of <strong>{peso(total - downPayment)}</strong> is due at check-in.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <UploadField label="Payment proof" sub="Screenshot of your transfer" value={payment.proofName} onChange={(name) => setPayment({ ...payment, proofName: name })} />
                      <UploadField label="Valid ID" sub="Driver's license, passport, etc." value={payment.idName} onChange={(name) => setPayment({ ...payment, idName: name })} />
                    </div>
                  </div>
                )}

                {payment.method === "card" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <FieldLabel label="Card number" span>
                      <input style={inputStyle} value={payment.cardNum} onChange={(e) => setPayment({ ...payment, cardNum: e.target.value.replace(/\D/g, "").slice(0, 16) })} placeholder="1234 5678 9012 3456" />
                    </FieldLabel>
                    <FieldLabel label="Name on card" span>
                      <input style={inputStyle} value={payment.cardName} onChange={(e) => setPayment({ ...payment, cardName: e.target.value })} placeholder="Maria Santos" />
                    </FieldLabel>
                    <FieldLabel label="Expiry (MM/YY)">
                      <input style={inputStyle} value={payment.cardExpiry} onChange={(e) => setPayment({ ...payment, cardExpiry: e.target.value.slice(0, 5) })} placeholder="09/28" />
                    </FieldLabel>
                    <FieldLabel label="CVC">
                      <input style={inputStyle} value={payment.cardCvc} onChange={(e) => setPayment({ ...payment, cardCvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="123" />
                    </FieldLabel>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
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
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{stayType}-hour stay · {adults + children} guest{adults + children > 1 ? "s" : ""}</div>
                </ReviewBlock>
                {addOnsTotal > 0 && (
                  <ReviewBlock title="Add-ons" onEdit={() => setStep(1)}>
                    {Object.entries(addOns).filter(([, q]) => q > 0).map(([id, q]) => {
                      const a = ADDONS.find((x) => x.id === id)!;
                      return <div key={id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}><span>{a.name} × {q}</span><span style={{ color: "var(--muted)" }}>{peso(a.price * q)}</span></div>;
                    })}
                  </ReviewBlock>
                )}
                <ReviewBlock title="Payment" onEdit={() => setStep(2)}>
                  <div style={{ fontSize: 14 }}>
                    {payment.method === "gcash" && "GCash — "}
                    {payment.method === "bank" && "Bank transfer — "}
                    {payment.method === "card" && "Credit card "}
                    {payment.method !== "card" && <span style={{ color: "var(--muted)" }}>30% down payment now, balance at check-in</span>}
                    {payment.method === "card" && <span>•••• {payment.cardNum.slice(-4)}</span>}
                  </div>
                </ReviewBlock>
                <div style={{ marginTop: 20, padding: 20, background: "var(--bg-2)", borderRadius: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>You&apos;re agreeing to:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7 }}>
                    <li>Check-in at {checkInTime} and check-out by {checkOutTime}</li>
                    <li>House rules — no smoking, no pets, quiet hours after 10pm</li>
                    <li>Free cancellation up to 48 hours before check-in</li>
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
                <button onClick={() => setStep(step + 1)} disabled={!canNext()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: canNext() ? "#B07848" : "#d4c5b0", color: "var(--white)", border: "none", cursor: canNext() ? "pointer" : "not-allowed", opacity: canNext() ? 1 : 0.6 }}>
                  Continue <IcoArrowRight />
                </button>
              ) : (
                <button onClick={submit} disabled={submitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "#B07848", color: "var(--white)", border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  <IcoCheckLg /> {submitting ? "Submitting…" : "Confirm booking"}
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
                <PriceRow label={`${stayType}-hour stay`} value={peso(basePrice)} />
                {paxFee > 0 && <PriceRow label="Extra guests" value={peso(paxFee)} />}
                {addOnsTotal > 0 && <PriceRow label="Add-ons" value={peso(addOnsTotal)} />}
                <PriceRow label="Cleaning fee" value={peso(cleaning)} />
                <PriceRow label="Service fee" value={peso(serviceFee)} />
              </div>
              <div style={{ padding: "16px 0 0", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
                <span>Total</span><span>{peso(total)}</span>
              </div>
              {(payment.method === "gcash" || payment.method === "bank") && step >= 2 && (
                <div style={{ marginTop: 14, padding: 12, background: "var(--bg-2)", borderRadius: 12, fontSize: 12, color: "var(--ink-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
                    <span>Down payment now</span><span>{peso(downPayment)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}>
                    <span>Balance at check-in</span><span>{peso(total - downPayment)}</span>
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
