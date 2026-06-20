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
  const [pay, setPay] = useState<{ down: number; method: string; proofUrl: string | null }>({ down: 0, method: "gcash", proofUrl: null });
  const [proofName, setProofName] = useState<string | null>(null);
  const [proofData, setProofData] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
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
          } as ExtendedBooking);
          setPay({
            down: Number(d.down_payment ?? Math.round(Number(d.total_amount ?? 0) * 0.5)),
            method: String(d.payment_method ?? "gcash"),
            proofUrl: (d.payment_proof_url as string) ?? null,
          });
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
  const canChange = ["pending", "approved", "confirmed", "on-going"].includes(String(booking.status));

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>
      {/* HEADER */}
      <SiteHeader bookHref="/rooms" bookLabel="Book again" backHref="/rooms" backLabel="Back to home" />

      <div className="page-enter" style={{ maxWidth: 860, margin: "0 auto", padding: "60px 28px 80px" }}>
        {/* Hero check */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--ink)", color: "var(--white)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
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
          <h1 className="serif" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.03em", margin: 0, lineHeight: 1 }}>
            You&apos;re in. <em>Rest is coming.</em>
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 16, maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
            {guestEmail && <>Confirmation emailed to <strong>{guestEmail}</strong>. </>}
            {guestName && guestPhone && <>{guestName}, we&apos;ll text check-in details to {guestPhone} the day before.</>}
          </p>
        </div>

        {/* Faster-review Messenger nudge while the request is still pending */}
        {String(booking.status) === "pending" && (
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
        {String(booking.status) === "approved" && (
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
          <div style={{ padding: 32, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
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
              <div className="serif" style={{ fontSize: 24, fontWeight: 500, marginTop: 6, letterSpacing: "-.015em" }}>{booking.guests.adults + booking.guests.children}</div>
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
            <input aria-label="New check-in date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
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
