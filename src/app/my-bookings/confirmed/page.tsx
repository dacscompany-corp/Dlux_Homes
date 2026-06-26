"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import SiteHeader from "@/components/SiteHeader";
import type { StoredBooking } from "@/lib/booking-store";

function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }
function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Down-payment account details by method.
const PAY_ACCOUNTS: Record<string, { label: string; number: string }> = {
  gcash: { label: "GCash · D' Lux Homes", number: "0946 007 4015" },
  bank: { label: "BPI · D' Lux Homes", number: "0123 4567 8901" },
};

// Direct link to the D'Lux Homes Facebook page Messenger.
const MESSENGER_URL = "https://www.facebook.com/messages/t/270893736109969";
function IcoMessenger({ size = 18, inverted = false }: { size?: number; inverted?: boolean }) {
  // inverted = on a blue button → white bubble, blue swoosh (so it stays visible).
  const bubble = inverted ? "#fff" : "#0A7CFF";
  const swoosh = inverted ? "#0A7CFF" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 2.6C9.4 2.6 2.7 8.9 2.7 17.1c0 4.3 1.9 8.1 5 10.7v5.6l4.7-2.6c1.2.3 2.4.5 3.6.5 8.6 0 15.3-6.3 15.3-14.5S26.6 2.6 18 2.6z" fill={bubble} />
      <path d="M8.9 21.9l4.6-7.3 5.2 3.9 4.5-3.9-4.6 7.3-5.1-3.9-4.6 3.9z" fill={swoosh} />
    </svg>
  );
}
function IcoCheck() { return <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoCalendar() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>; }
function IcoArrowRight() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>; }

const ROOM_IMAGE = "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1600&q=80";

type ExtendedBooking = StoredBooking & {
  checkInTime?: string;
  checkOutTime?: string;
  windowLabel?: string;
  notes?: string;
  dateChangeCount?: number;
};

function ConfirmedInner() {
  const sp = useSearchParams();
  const bookingId = sp.get("id") || "";
  const [booking, setBooking] = useState<ExtendedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChange, setShowChange] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [changeReason, setChangeReason] = useState("");
  // Down-payment (paid after admin pre-approval).
  const [pay, setPay] = useState<{ down: number; method: string; proofUrl: string | null; paymentStatus: string }>({ down: 0, method: "gcash", proofUrl: null, paymentStatus: "" });
  const [proofName, setProofName] = useState<string | null>(null);
  const [proofData, setProofData] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // Guest review (unlocked once the stay is completed). uuid/havenId come from
  // the booking API and are what the reviews table keys on.
  const [reviewMeta, setReviewMeta] = useState<{ uuid: string; havenId: string }>({ uuid: "", havenId: "" });
  const [review, setReview] = useState<{ rating: number; comment: string; busy: boolean; done: boolean }>({ rating: 0, comment: "", busy: false, done: false });
  const [reviewHover, setReviewHover] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const requestDateChange = async () => {
    if (!booking) return;
    if (!newDate) { toast.error("Please pick a new date."); return; }
    setChanging(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/request-date-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_date: newDate, reason: changeReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || "Could not submit your request"); setChanging(false); return; }
      setShowChange(false); setNewDate(""); setChangeReason("");
      toast.success(data?.message || "Date-change request sent.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setChanging(false);
    }
  };

  useEffect(() => {
    if (!bookingId) { setLoading(false); return; }
    let active = true;
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active) return;
        const d = j?.data;
        if (d) {
          setBooking({
            id: String(d.booking_id ?? bookingId),
            roomId: "",
            roomName: String(d.room_name ?? ""),
            checkIn: String(d.check_in_date ?? "").slice(0, 10),
            checkOut: String(d.check_out_date ?? "").slice(0, 10),
            stayType: "",
            guests: { adults: Number(d.adults ?? 0), children: Number(d.children ?? 0), infants: Number(d.infants ?? 0) },
            status: d.status ?? "pending",
            totalAmount: Number(d.total_amount ?? 0),
            addOns: [],
            createdAt: String(d.created_at ?? ""),
            guestInfo: {
              firstName: String(d.guest_first_name ?? ""),
              lastName: String(d.guest_last_name ?? ""),
              email: String(d.guest_email ?? ""),
              phone: String(d.guest_phone ?? ""),
            },
            checkInTime: d.check_in_time ?? undefined,
            checkOutTime: d.check_out_time ?? undefined,
            dateChangeCount: Number(d.date_change_count ?? 0),
          } as ExtendedBooking);
          setPay({
            down: Number(d.down_payment ?? Math.round(Number(d.total_amount ?? 0) * 0.5)),
            method: String(d.payment_method ?? "gcash"),
            proofUrl: (d.payment_proof_url as string) ?? null,
            paymentStatus: String(d.payment_status ?? ""),
          });
          setReviewMeta({ uuid: String(d.id ?? ""), havenId: String(d.haven_id ?? "") });
        }
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId, reloadKey]);

  const submitPayment = async () => {
    if (!booking) return;
    if (!proofData) { toast.error("Please upload your payment screenshot."); return; }
    setPaying(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id, payment_method: pay.method, payment_proof: proofData }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) { toast.error(json?.error || "Could not submit your payment. Please try again."); setPaying(false); return; }
      toast.success("Payment submitted! We'll confirm your booking shortly.");
      setProofData(null); setProofName(null);
      setReloadKey((k) => k + 1); // re-fetch to reflect the saved proof
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  // Submit the guest review for a completed stay. One rating drives all six
  // categories; the API requires the booking to be 'completed' and de-dupes.
  const submitReview = async () => {
    if (!booking) return;
    if (!review.rating) { toast.error("Please pick a star rating."); return; }
    setReview((r) => ({ ...r, busy: true }));
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: reviewMeta.uuid || booking.id,
          haven_id: reviewMeta.havenId,
          comment: review.comment.trim() || null,
          cleanliness_rating: review.rating,
          communication_rating: review.rating,
          checkin_rating: review.rating,
          accuracy_rating: review.rating,
          location_rating: review.rating,
          value_rating: review.rating,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.success) {
        toast.success("Thanks for your feedback!");
        setReview((r) => ({ ...r, done: true, busy: false }));
      } else if (String(j?.error || "").toLowerCase().includes("already exists")) {
        setReview((r) => ({ ...r, done: true, busy: false }));
      } else {
        toast.error(j?.error || "Could not submit your review.");
        setReview((r) => ({ ...r, busy: false }));
      }
    } catch {
      toast.error("Could not submit your review.");
      setReview((r) => ({ ...r, busy: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>
        Loading your confirmation…
      </div>
    );
  }

  if (!booking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14, textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ marginBottom: 12 }}>We couldn&apos;t find that booking.</p>
          <Link href="/rooms" style={{ color: "var(--dlux-accent)", fontWeight: 600 }}>Back to rooms</Link>
        </div>
      </div>
    );
  }

  const guestName = booking.guestInfo?.firstName
    ? `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`.trim()
    : "";
  const guestEmail = booking.guestInfo?.email || "";
  const guestPhone = booking.guestInfo?.phone || "";
  const isCancelled = String(booking.status) === "cancelled";
  // Days until check-in (local-midnight comparison, avoids UTC drift in PH).
  const daysUntilCheckIn = (() => {
    if (!booking.checkIn) return Infinity;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ci = new Date(booking.checkIn + "T00:00:00");
    return Math.floor((ci.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  })();
  // Mirror the server policy: active booking, ONE-TIME only, and requested at
  // least 7 days before check-in — so a past or too-soon stay hides the button.
  const canChange = ["pending", "approved", "confirmed", "on-going"].includes(String(booking.status))
    && Number(booking.dateChangeCount ?? 0) < 1
    && daysUntilCheckIn >= 7;
  // Constrain the date picker to the allowed window: today → original + 1 month.
  const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const minChangeDate = isoDay(new Date());
  const maxChangeDate = booking.checkIn
    ? isoDay(new Date(new Date(booking.checkIn + "T00:00:00").getTime() + 30 * 24 * 60 * 60 * 1000))
    : undefined;
  // The stay has ended once the check-out date is in the past — no more payment
  // prompts or date changes should appear for it.
  const stayEnded = (() => {
    const end = booking.checkOut || booking.checkIn;
    if (!end) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(end + "T00:00:00").getTime() < today.getTime();
  })();
  // Check-in date already in the past (local midnight, avoids UTC drift in PH).
  const checkInPast = (() => {
    if (!booking.checkIn) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(booking.checkIn + "T00:00:00").getTime() < today.getTime();
  })();
  // A booking that lapsed: either the stay ended, OR it's still unconfirmed
  // (pending / approved-unpaid / awaiting) and its check-in date has already
  // passed — the guest never completed it in time. Mirrors the admin "Expired".
  const dpApproved = (pay.paymentStatus || "").startsWith("approved");
  const expiredUnpaid = checkInPast && (
    String(booking.status) === "pending"
    || String(booking.status) === "awaiting-payment"
    || (String(booking.status) === "approved" && !dpApproved)
  );
  const lapsed = expiredUnpaid || (stayEnded && ["pending", "approved", "confirmed", "on-going", "checked-in"].includes(String(booking.status)));
  // The stay is finished and on record — guest can leave a review.
  const isCompleted = ["completed", "checked-out"].includes(String(booking.status));
  // Confirmed = down payment approved (or the booking is already past that point).
  // From here the guest just waits for check-in day and settles the rest then.
  const isConfirmed = !lapsed && !isCompleted && (dpApproved || ["confirmed", "on-going", "checked-in"].includes(String(booking.status)));
  // Remaining balance + ₱1,000 refundable deposit are collected at check-in.
  const remainingBalance = Math.max(0, (booking.totalAmount || 0) - (pay.down || 0));
  const checkInDeposit = 1000;

  // ── Booking Confirmed design (shown once the down payment is approved) ──
  if (isConfirmed) {
    const SERIF = "'Fraunces', Georgia, serif";
    const MONO = "'Geist Mono', ui-monospace, monospace";
    const accent = "#B07848";
    const fmtWd = (iso?: string) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
    const fmt12 = (t?: string) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, "0")} ${ap}`; };
    const shortRoom = booking.roomName.replace(/^\s*D[’‘'`]?\s*Lux\s*Homes\s*[—–-]\s*/i, "").trim() || booking.roomName;
    const totalGuests = (booking.guests?.adults || 0) + (booking.guests?.children || 0) + (booking.guests?.infants || 0);
    const overnight = !!(booking.checkOut && booking.checkIn && booking.checkOut !== booking.checkIn);
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#F6EFE2", color: "#1F160E", display: "flex", flexDirection: "column" }}>
        <style>{`
          @keyframes cfIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes cfPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
          .cf-enter{animation:cfIn .5s cubic-bezier(.2,.7,.2,1)}
          .cf-btn{transition:transform .16s ease, box-shadow .2s ease, background .18s ease}
          .cf-btn:hover{transform:translateY(-2px)}
          .cf-btn:active{transform:translateY(0) scale(.98)}
          @media (max-width:680px){
            .cf2-wrap{padding:36px 16px 64px !important}
            .cf2-h1{font-size:40px !important}
            .cf2-grid3{grid-template-columns:1fr !important;gap:0 !important}
            .cf2-grid3>div{padding:16px 0 !important;border-bottom:1px solid #E0CEB2}
            .cf2-actions{flex-direction:column !important;align-items:stretch !important}
            .cf2-actions a, .cf2-actions button{justify-content:center !important}
            .cf2-payrow{flex-direction:column !important;align-items:flex-start !important;gap:6px !important}
          }
        `}</style>

        <SiteHeader bookHref="/rooms" bookLabel="Book again" backHref="/rooms" backLabel="Back to home" />

        <main className="cf2-wrap" style={{ flex: 1, width: "100%", maxWidth: 680, margin: "0 auto", padding: "56px 24px 88px" }}>

          {/* HERO */}
          <div className="cf-enter" style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#5B9E6B", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 22px", boxShadow: "0 0 0 10px rgba(91,158,107,.16)", animation: "cfPop .55s cubic-bezier(.2,.8,.2,1)" }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#8C5A2E", marginBottom: 14 }}>Booking confirmed</div>
            <h1 className="cf2-h1" style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 400, letterSpacing: "-.03em", lineHeight: 1.04, margin: 0 }}>You&rsquo;re all set{guestName ? <>, {guestName}</> : null}.</h1>
            <p style={{ fontSize: 17, color: "#4A3A2A", lineHeight: 1.6, margin: "18px auto 0", maxWidth: 440 }}>
              Your stay is locked in.{guestEmail ? <> We&rsquo;ve emailed everything to <strong>{guestEmail}</strong> —</> : <> We&rsquo;ve emailed everything over —</>} and we&rsquo;ll text you the night before with how to get in.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "8px 16px", borderRadius: 999, background: "#fff", border: "1px solid #E0CEB2", fontSize: 13, color: "#4A3A2A", fontFamily: MONO }}>
              Booking <span style={{ color: "#1F160E", fontWeight: 500 }}>{booking.id}</span>
            </div>
          </div>

          {/* YOUR STAY CARD */}
          <div className="cf-enter" style={{ background: "#FFFCF4", borderRadius: 22, border: "1px solid #E0CEB2", overflow: "hidden", boxShadow: "0 4px 16px rgba(31,22,14,.05)" }}>
            <div style={{ position: "relative", aspectRatio: "16 / 7" }}>
              <Image src={ROOM_IMAGE} alt="" fill unoptimized style={{ objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.58))" }} />
              <div style={{ position: "absolute", left: 26, bottom: 20, right: 26, color: "#FFFCF4" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.92 }}>14F · Tower 4 · Grass Residences</div>
                <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, letterSpacing: "-.02em", marginTop: 5 }}>{shortRoom}</div>
              </div>
            </div>
            <div className="cf2-grid3" style={{ padding: "28px 30px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 22 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Check in</div>
                <div style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{fmtWd(booking.checkIn)}</div>
                <div style={{ fontSize: 13.5, color: "#4A3A2A", marginTop: 3 }}>{booking.checkInTime ? `from ${fmt12(booking.checkInTime)}` : "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Check out</div>
                <div style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{fmtWd(booking.checkOut)}</div>
                <div style={{ fontSize: 13.5, color: "#4A3A2A", marginTop: 3 }}>{booking.checkOutTime ? `by ${fmt12(booking.checkOutTime)}` : "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Guests</div>
                <div style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{totalGuests || 1} guest{(totalGuests || 1) > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 13.5, color: "#4A3A2A", marginTop: 3 }}>{overnight ? "overnight stay" : "day stay"}</div>
              </div>
            </div>
          </div>

          {/* PAY AT CHECK-IN */}
          <div className="cf-enter" style={{ marginTop: 22, background: "#FFFCF4", border: `2px solid ${accent}`, borderRadius: 22, overflow: "hidden", boxShadow: "0 14px 34px rgba(176,120,72,.20)" }}>
            <div className="cf2-payrow" style={{ padding: "20px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, background: accent, color: "#FFFCF4" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.92 }}>Bring this on check-in day</div>
                <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, marginTop: 4 }}>Pay when you arrive</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap" }}>{peso(remainingBalance + checkInDeposit)}</div>
              </div>
            </div>
            <div style={{ padding: "8px 26px 6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                <span style={{ fontSize: 14.5, color: "#4A3A2A" }}>Down payment <span style={{ color: "#8B7458" }}>(50%, already paid)</span></span>
                <span style={{ fontSize: 14.5, fontWeight: 500, color: "#5B9E6B" }}>Paid · {peso(pay.down)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                <span style={{ fontSize: 14.5, color: "#4A3A2A" }}>Remaining balance</span>
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{peso(remainingBalance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0" }}>
                <span style={{ fontSize: 14.5, color: "#4A3A2A" }}>Refundable deposit</span>
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{peso(checkInDeposit)}</span>
              </div>
            </div>
            <div style={{ margin: "0 26px 22px", display: "flex", gap: 10, alignItems: "flex-start", background: "#F6EFE2", borderRadius: 12, padding: "13px 15px" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5B9E6B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
              <span style={{ fontSize: 13.5, color: "#4A3A2A", lineHeight: 1.5 }}>The {peso(checkInDeposit)} deposit comes back to you at checkout. Nothing more to pay online — you&rsquo;re fully booked.</span>
            </div>
          </div>

          {/* WHAT HAPPENS NEXT */}
          <div className="cf-enter" style={{ marginTop: 22 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, letterSpacing: "-.015em", margin: "0 0 12px" }}>What happens next</h2>
            <div style={{ background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 18, padding: "4px 22px" }}>
              {[
                ["We’ll text you the night before", "Address, unit number & door code by SMS — no app to download."],
                ["Bring a valid ID on check-in day", "Show it at the lobby — staff hand you the keys and walk you up."],
                ["Pay the rest when you arrive", "Balance & deposit at check-in — cash or GCash, whatever’s easiest."],
              ].map(([t, s], i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: i < 2 ? "1px solid #EFE4CE" : "none" }}>
                  <span style={{ fontFamily: SERIF, flex: "none", width: 34, height: 34, borderRadius: 10, background: "#F6EFE2", border: "1px solid #E0CEB2", display: "grid", placeItems: "center", fontSize: 16, color: "#8C5A2E" }}>{i + 1}</span>
                  <div><div style={{ fontSize: 15, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 13.5, color: "#8B7458", marginTop: 2 }}>{s}</div></div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="cf-enter cf2-actions" style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" className="cf-btn" style={{ flex: 1, minWidth: 200, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "16px 22px", borderRadius: 14, background: "#0A7CFF", color: "#fff", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
              <IcoMessenger size={19} inverted /> Message us anytime
            </a>
            <Link href="/my-bookings" className="cf-btn" style={{ flex: 1, minWidth: 200, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "16px 22px", borderRadius: 14, background: "#1F160E", color: "#FFFCF4", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
              <IcoCalendar /> View my booking
            </Link>
          </div>

          {/* CHANGE / HELP */}
          <div className="cf-enter" style={{ marginTop: 18, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#8B7458", lineHeight: 1.6, margin: 0 }}>
              Need to move your dates? You can change them once, free, up to 7 days before check-in.<br />
              {canChange ? (
                <button type="button" onClick={() => setShowChange(true)} style={{ background: "none", border: "none", padding: "1px 0 1px", color: "#8C5A2E", fontWeight: 500, fontSize: 14, cursor: "pointer", borderBottom: "1px solid #D4BE9A", fontFamily: "inherit" }}>Change my dates</button>
              ) : (
                <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#8C5A2E", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #D4BE9A", paddingBottom: 1 }}>Message us to reschedule</a>
              )}
            </p>
          </div>

        </main>

        <footer style={{ borderTop: "1px solid #E0CEB2", background: "#F6EFE2" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "22px 24px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#8B7458" }}>
            <span>© 2026 D&rsquo; Lux Homes · Metro Manila, PH</span>
            <span>Made with care for rest.</span>
          </div>
        </footer>

        {/* Date-change request modal (reused) */}
        {showChange && (
          <div onClick={() => !changing && setShowChange(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 440, background: "#FFFCF4", borderRadius: 20, border: "1px solid #E0CEB2", padding: 28 }}>
              <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, letterSpacing: "-.015em" }}>Request a date change</div>
              <p style={{ fontSize: 14, color: "#4A3A2A", lineHeight: 1.6, marginTop: 8 }}>
                Bookings can&apos;t be cancelled, but you can move <strong>{booking.id}</strong> once — if requested at least <strong>7 days</strong> before check-in, to a date <strong>within 1 month</strong> of the original. Our team will confirm availability.
              </p>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8B7458", marginTop: 16, marginBottom: 4 }}>New check-in date</label>
              <input aria-label="New check-in date" type="date" value={newDate} min={minChangeDate} max={maxChangeDate} onChange={(e) => setNewDate(e.target.value)}
                style={{ width: "100%", borderRadius: 12, border: "1px solid #D4BE9A", background: "#F6EFE2", padding: "10px 12px", fontSize: 14, color: "#1F160E", outline: "none", fontFamily: "inherit" }} />
              <textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Reason (optional)" rows={2}
                style={{ width: "100%", marginTop: 12, borderRadius: 12, border: "1px solid #D4BE9A", background: "#F6EFE2", padding: "10px 12px", fontSize: 14, color: "#1F160E", resize: "none", outline: "none", fontFamily: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button type="button" onClick={() => setShowChange(false)} disabled={changing}
                  style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#1F160E", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Close
                </button>
                <button type="button" onClick={requestDateChange} disabled={changing}
                  style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: changing ? 0.7 : 1 }}>
                  {changing ? "Sending…" : "Send request"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Stay Complete design (shown once the stay is checked out / completed) ──
  if (isCompleted) {
    const SERIF = "'Fraunces', Georgia, serif";
    const accent = "#B07848";
    const fmtWd = (iso?: string) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
    const shortRoom = booking.roomName.replace(/^\s*D[’‘'`]?\s*Lux\s*Homes\s*[—–-]\s*/i, "").trim() || booking.roomName;
    const totalGuests = (booking.guests?.adults || 0) + (booking.guests?.children || 0) + (booking.guests?.infants || 0);
    const active = reviewHover || review.rating;
    const ratingLabels = ["Tap a star to rate your stay", "We’re sorry it fell short", "Not quite what you hoped", "It was a good stay", "Great stay — glad you enjoyed it!", "Loved it — thank you!"];
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#F6EFE2", color: "#1F160E", display: "flex", flexDirection: "column" }}>
        <style>{`
          @keyframes cfIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes cfPop{0%{transform:scale(.6)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
          .cf-enter{animation:cfIn .5s cubic-bezier(.2,.7,.2,1)}
          .cf-btn{transition:transform .16s ease, box-shadow .2s ease, background .18s ease}
          .cf-btn:hover{transform:translateY(-2px)}
          .cf-btn:active{transform:translateY(0) scale(.98)}
          .cf-star{transition:transform .12s ease}
          .cf-star:hover{transform:scale(1.18)}
          @media (max-width:680px){
            .cf2-wrap{padding:36px 16px 64px !important}
            .cf2-h1{font-size:40px !important}
            .cf2-grid3{grid-template-columns:1fr !important;gap:0 !important}
            .cf2-grid3>div{padding:14px 0 !important;border-bottom:1px solid #E0CEB2}
            .cf2-totalrow{flex-direction:column !important;align-items:flex-start !important;gap:14px !important}
          }
        `}</style>

        <SiteHeader bookHref="/rooms" bookLabel="Book again" backHref="/rooms" backLabel="Back to home" />

        <main className="cf2-wrap" style={{ flex: 1, width: "100%", maxWidth: 680, margin: "0 auto", padding: "56px 24px 88px" }}>

          {/* HERO */}
          <div className="cf-enter" style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: accent, color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 22px", boxShadow: "0 0 0 10px rgba(176,120,72,.14)", animation: "cfPop .55s cubic-bezier(.2,.8,.2,1)" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.2 5c2 0 3.4 1.2 4.3 2.5C10.4 6.2 11.8 5 13.8 5 17 5 18.6 8.4 17 11.7 14.5 16.4 12 21 12 21z" /></svg>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#8C5A2E", marginBottom: 14 }}>Stay complete</div>
            <h1 className="cf2-h1" style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 400, letterSpacing: "-.03em", lineHeight: 1.04, margin: 0 }}>Thanks for staying{guestName ? <>, {guestName}</> : null}.</h1>
            <p style={{ fontSize: 17, color: "#4A3A2A", lineHeight: 1.6, margin: "18px auto 0", maxWidth: 430 }}>We hope you rested well. Your deposit has been refunded — nothing left to settle. Come back anytime.</p>
          </div>

          {/* REVIEW CARD */}
          <div className="cf-enter" style={{ background: "#FFFCF4", border: `2px solid ${accent}`, borderRadius: 22, overflow: "hidden", boxShadow: "0 14px 34px rgba(176,120,72,.18)" }}>
            <div style={{ padding: "20px 26px", background: accent, color: "#FFFCF4" }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.92 }}>Help future guests</div>
              <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, marginTop: 4 }}>How was your stay?</div>
            </div>
            {review.done ? (
              <div style={{ padding: "30px 26px", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ flex: "none", width: 46, height: 46, borderRadius: "50%", background: "#5B9E6B", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500 }}>Thank you{guestName ? <>, {guestName}</> : null}!</div>
                  <div style={{ fontSize: 14, color: "#8B7458", marginTop: 2 }}>Your review helps the next guest book with confidence.</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 26 }}>
                <div style={{ fontSize: 14, color: "#8B7458", marginBottom: 14 }}>{ratingLabels[active] || ratingLabels[0]}</div>
                <div onMouseLeave={() => setReviewHover(0)} style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setReview((r) => ({ ...r, rating: n }))} onMouseEnter={() => setReviewHover(n)} className="cf-star" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill={n <= active ? "#E2A23C" : "none"} stroke={n <= active ? "#E2A23C" : "#D4BE9A"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>
                    </button>
                  ))}
                </div>
                <textarea value={review.comment} onChange={(e) => setReview((r) => ({ ...r, comment: e.target.value }))} placeholder="Tell us about your stay (optional)…" rows={3}
                  style={{ width: "100%", borderRadius: 14, border: "1px solid #D4BE9A", background: "#F6EFE2", padding: "13px 15px", fontSize: 15, fontFamily: "inherit", color: "#1F160E", resize: "vertical", outline: "none" }} />
                <button type="button" onClick={submitReview} disabled={review.busy || !review.rating} className="cf-btn"
                  style={{ marginTop: 18, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "16px 22px", borderRadius: 14, background: "#1F160E", color: "#FFFCF4", fontSize: 15, fontWeight: 500, border: "none", cursor: (review.busy || !review.rating) ? "not-allowed" : "pointer", opacity: (review.busy || !review.rating) ? 0.6 : 1 }}>
                  {review.busy ? "Sending…" : "Send my review"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              </div>
            )}
          </div>

          {/* YOUR STAY SUMMARY */}
          <div className="cf-enter" style={{ marginTop: 22, background: "#FFFCF4", borderRadius: 22, border: "1px solid #E0CEB2", overflow: "hidden", boxShadow: "0 4px 16px rgba(31,22,14,.05)" }}>
            <div style={{ position: "relative", aspectRatio: "16 / 6" }}>
              <Image src={ROOM_IMAGE} alt="" fill unoptimized style={{ objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.58))" }} />
              <div style={{ position: "absolute", left: 26, bottom: 18, right: 26, color: "#FFFCF4" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.92 }}>14F · Tower 4 · Grass Residences</div>
                <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, letterSpacing: "-.02em", marginTop: 4 }}>{shortRoom}</div>
              </div>
            </div>
            <div className="cf2-grid3" style={{ padding: "24px 30px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 22 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Checked in</div>
                <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 500, marginTop: 5, letterSpacing: "-.015em" }}>{fmtWd(booking.checkIn)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Checked out</div>
                <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 500, marginTop: 5, letterSpacing: "-.015em" }}>{fmtWd(booking.checkOut)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Guests</div>
                <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 500, marginTop: 5, letterSpacing: "-.015em" }}>{totalGuests || 1} guest{(totalGuests || 1) > 1 ? "s" : ""}</div>
              </div>
            </div>
            <div className="cf2-totalrow" style={{ borderTop: "1px solid #E0CEB2", padding: "22px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".12em", color: "#8B7458" }}>Total paid</div>
                <div style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 500, marginTop: 3 }}>{peso(booking.totalAmount || 0)}</div>
              </div>
              <Link href="/rooms" className="cf-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px 24px", borderRadius: 14, background: accent, color: "#FFFCF4", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
                Book this again
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
            </div>
          </div>

          {/* HELP */}
          <div className="cf-enter" style={{ marginTop: 18, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#8B7458", lineHeight: 1.6, margin: 0 }}>Left something behind or have a question? <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#8C5A2E", fontWeight: 500, textDecoration: "none", borderBottom: "1px solid #D4BE9A", paddingBottom: 1 }}>Message us</a></p>
          </div>

        </main>

        <footer style={{ borderTop: "1px solid #E0CEB2", background: "#F6EFE2" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "22px 24px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#8B7458" }}>
            <span>© 2026 D&rsquo; Lux Homes · Metro Manila, PH</span>
            <span>Made with care for rest.</span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>
      {/* HEADER */}
      <SiteHeader bookHref="/rooms" bookLabel="Book again" backHref="/rooms" backLabel="Back to home" />

      <div className="page-enter cf-wrap" style={{ maxWidth: 860, margin: "0 auto", padding: "60px 28px 80px" }}>
        <style>{`
          .cf-mobhero { display: none; }
          @media (max-width: 640px) {
            .cf-wrap { padding: 40px 16px 64px !important; }
            .cf-hero-h1 { font-size: 40px !important; }
            .cf-3col { gap: 12px !important; padding: 22px !important; }
            .cf-deskhero { display: none !important; }
            .cf-mobhero { display: block !important; }
          }
        `}</style>

        {/* MOBILE dark success hero */}
        <div className="cf-mobhero" style={{ background: lapsed ? "#3a352e" : "#1F160E", color: "#FFFCF4", padding: "52px 24px 32px", textAlign: "center", margin: "-40px -16px 24px" }}>
          <div style={{ width: 66, height: 66, borderRadius: "50%", background: lapsed ? "#9ca3af" : "#5B9E6B", display: "grid", placeItems: "center", margin: "0 auto 18px", color: "#fff", boxShadow: lapsed ? "none" : "0 0 0 8px rgba(91,158,107,.18)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 400, fontSize: 30, letterSpacing: "-.02em", margin: 0 }}>{isCompleted ? "Thanks for staying." : lapsed ? "This stay has passed." : "You’re all set."}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,252,.78)", margin: "12px auto 0", maxWidth: 280 }}>{lapsed ? "These dates are in the past and the booking wasn’t completed." : "We’ve received your payment for review. A confirmation will arrive shortly."}</p>
          <div style={{ display: "inline-block", marginTop: 16, padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,.1)", fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: ".05em" }}>{booking.id}</div>
        </div>

        {/* Hero check (desktop) */}
        <div className="cf-deskhero" style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: lapsed ? "#9ca3af" : "var(--ink)", color: "var(--white)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
            <IcoCheck />
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)" }}>
              Booking {booking.id}
            </span>
            {isCancelled && (
              <span style={{ padding: "3px 10px", borderRadius: 999, background: "#EFD9D4", color: "#7A2B18", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>Cancelled</span>
            )}
          </div>
          <h1 className="serif cf-hero-h1" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.03em", margin: 0, lineHeight: 1 }}>
            {isCompleted ? <>Thanks for <em>staying.</em></> : lapsed ? <>This stay has <em>passed.</em></> : <>You&apos;re in. <em>Rest is coming.</em></>}
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 16, maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
            {lapsed ? (
              <>These dates are in the past and the booking wasn&apos;t completed. Message us if you need help, or book again for a new stay.</>
            ) : (
              <>
                {guestEmail && <>Confirmation emailed to <strong>{guestEmail}</strong>. </>}
                {guestName && guestPhone && <>{guestName}, we&apos;ll text check-in details to {guestPhone} the day before.</>}
              </>
            )}
          </p>
        </div>

        {/* Faster-review Messenger nudge while the request is still pending */}
        {String(booking.status) === "pending" && !lapsed && (
          <div style={{ marginBottom: 28, borderRadius: 24, border: "1px solid var(--line)", background: "var(--white)", padding: 24, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="serif" style={{ fontSize: 20, fontWeight: 500 }}>Want a faster review?</div>
              <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>Your request is in. Message us on Messenger so we can verify your documents and approve your booking sooner.</div>
            </div>
            <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 999, background: "#0A7CFF", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
              <IcoMessenger size={20} inverted /> Message us
            </a>
          </div>
        )}

        {/* PAY AFTER APPROVAL — shown once the host pre-approves the documents */}
        {String(booking.status) === "approved" && !lapsed && !isConfirmed && (
          <div style={{ marginBottom: 28, borderRadius: 24, border: "1px solid var(--dlux-accent)", background: "rgba(176,120,72,.05)", overflow: "hidden" }}>
            <div style={{ padding: "18px 28px", background: "var(--dlux-accent)", color: "var(--white)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.9 }}>Approved — next step</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}>Complete your down payment</div>
            </div>
            {pay.proofUrl ? (
              <div style={{ padding: 28, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: "#22c55e", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><IcoCheck /></span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Payment submitted</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>We&apos;re verifying your payment — your booking will be confirmed shortly.</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 28 }}>
                <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 18px" }}>
                  Send the <strong>{peso(pay.down)}</strong> down payment (50%) to secure your booking, then upload your receipt below. The balance + ₱1,000 refundable deposit are paid at check-in.
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderRadius: 14, background: "var(--white)", border: "1px solid var(--line)", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>{PAY_ACCOUNTS[pay.method]?.label || "Payment account"}</div>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, fontWeight: 700, marginTop: 4 }}>{PAY_ACCOUNTS[pay.method]?.number || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>Pay now</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--dlux-accent)" }}>{peso(pay.down)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <button type="button" onClick={() => { const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) fileToBase64(file).then((data) => { setProofName(file.name); setProofData(data); }); }; f.click(); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 999, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--line-2)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    {proofName ? `✓ ${proofName.length > 22 ? proofName.slice(0, 22) + "…" : proofName}` : "Upload payment proof"}
                  </button>
                  <button type="button" onClick={submitPayment} disabled={!proofData || paying}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", border: "none", fontSize: 14, fontWeight: 700, cursor: (!proofData || paying) ? "not-allowed" : "pointer", opacity: (!proofData || paying) ? 0.6 : 1 }}>
                    {paying ? "Submitting…" : "Submit payment"} <IcoArrowRight />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIRMED — down payment approved; remaining balance reminder for check-in day */}
        {isConfirmed && (
          <div style={{ marginBottom: 28, borderRadius: 24, border: "1px solid var(--dlux-accent)", background: "rgba(176,120,72,.05)", overflow: "hidden" }}>
            <div style={{ padding: "18px 28px", background: "var(--dlux-accent)", color: "var(--white)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.9 }}>Confirmed — you&apos;re all set</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}>See you on your check-in day</div>
            </div>
            <div style={{ padding: 28 }}>
              <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 18px" }}>
                Your down payment is approved and your stay is locked in{booking.checkIn ? <> for <strong>{formatDate(booking.checkIn)}</strong></> : null}. Just settle the rest when you arrive — no need to pay anything more online.
              </p>
              <div style={{ borderRadius: 16, background: "var(--white)", border: "1px solid var(--line)", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>Down payment</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#15803D" }}>Paid · {peso(pay.down)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>Remaining balance</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{peso(remainingBalance)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>Refundable deposit</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{peso(checkInDeposit)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px", background: "rgba(176,120,72,.06)" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>Pay at check-in</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "var(--dlux-accent)" }}>{peso(remainingBalance + checkInDeposit)}</span>
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>
                The ₱{checkInDeposit.toLocaleString("en-PH")} deposit is refundable on checkout. We&apos;ll text your check-in details the day before.
              </p>
            </div>
          </div>
        )}

        {/* Booking card */}
        <div style={{ background: "var(--white)", borderRadius: 24, overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ position: "relative", aspectRatio: "3/1" }}>
            <Image src={ROOM_IMAGE} alt="" fill unoptimized style={{ objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent, rgba(0,0,0,.5))" }} />
            <div style={{ position: "absolute", left: 28, bottom: 20, color: "var(--white)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", opacity: 0.9 }}>14F · Tower 4 · Grass Residences</div>
              <div className="serif" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-.02em", marginTop: 4 }}>{booking.roomName}</div>
            </div>
          </div>
          <div className="cf-3col" style={{ padding: 32, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>Check-in</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{formatDate(booking.checkIn)}</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{booking.checkInTime || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>Check-out</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{formatDate(booking.checkOut)}</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{booking.checkOutTime || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>Guests</div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{booking.guests.adults + booking.guests.children + booking.guests.infants}</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{booking.stayType} stay</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--line)", padding: 28, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)" }}>Total</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{peso(booking.totalAmount)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 999, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--line-2)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                <IcoMessenger /> Message us
              </a>
              {canChange && (
                <button type="button" onClick={() => setShowChange(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--line-2)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Request date change
                </button>
              )}
              <Link href="/my-bookings"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, background: "var(--ink)", color: "var(--white)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                <IcoCalendar /> My bookings
              </Link>
              <Link href="/rooms/1"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                Book again <IcoArrowRight />
              </Link>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ marginTop: 32, padding: 24, background: "var(--bg-2)", borderRadius: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)", marginBottom: 18 }}>Before you arrive</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {[
              { h: "Date changes", t: "No cancellations. One free date change if requested at least 7 days before check-in (new date within 1 month)." },
              { h: "24 hrs before", t: "Your host sends unit access codes and building instructions via SMS." },
              { h: "Check-in day", t: "Bring a valid ID at the lobby. Settle the 50% balance + ₱1,000 deposit, then start resting." },
            ].map((b) => (
              <div key={b.h}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-ink)" }}>{b.h}</div>
                <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 6 }}>{b.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 28px", display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", flexWrap: "wrap", gap: 12 }}>
          <div>© 2026 D&apos; Lux Homes · Metro Manila, PH</div>
          <div>Made with care for rest.</div>
        </div>
      </footer>

      {/* Date-change request modal */}
      {showChange && (
        <div onClick={() => !changing && setShowChange(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: "var(--white)", borderRadius: 20, border: "1px solid var(--line)", padding: 28 }}>
            <div className="serif" style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-.015em" }}>Request a date change</div>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 8 }}>
              Bookings can&apos;t be cancelled, but you can move <strong>{booking.id}</strong> once — if requested at least <strong>7 days</strong> before check-in, to a date <strong>within 1 month</strong> of the original. Our team will confirm availability.
            </p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginTop: 16, marginBottom: 4 }}>New check-in date</label>
            <input aria-label="New check-in date" type="date" value={newDate} min={minChangeDate} max={maxChangeDate} onChange={(e) => setNewDate(e.target.value)}
              style={{ width: "100%", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg)", padding: "10px 12px", fontSize: 14, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
            <textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Reason (optional)" rows={2}
              style={{ width: "100%", marginTop: 12, borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--bg)", padding: "10px 12px", fontSize: 14, color: "var(--ink)", resize: "none", outline: "none", fontFamily: "inherit" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowChange(false)} disabled={changing}
                style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", color: "var(--ink)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Close
              </button>
              <button type="button" onClick={requestDateChange} disabled={changing}
                style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: "var(--dlux-accent)", color: "var(--white)", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: changing ? 0.7 : 1 }}>
                {changing ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>Loading…</div>}>
      <ConfirmedInner />
    </Suspense>
  );
}
