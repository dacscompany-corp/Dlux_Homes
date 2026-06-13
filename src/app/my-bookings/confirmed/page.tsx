"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getStoredBookings } from "@/lib/booking-store";
import type { StoredBooking } from "@/lib/booking-store";

function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }
function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  useEffect(() => {
    const all = getStoredBookings() as ExtendedBooking[];
    const found = all.find((b) => b.id === bookingId);
    setBooking(found || null);
  }, [bookingId]);

  if (!booking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>
        Loading your confirmation…
      </div>
    );
  }

  const guestName = booking.guestInfo?.firstName
    ? `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`.trim()
    : "";
  const guestEmail = booking.guestInfo?.email || "";
  const guestPhone = booking.guestInfo?.phone || "";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>
      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(246,239,226,.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ink)", color: "var(--white)", display: "grid", placeItems: "center", fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 700, fontSize: 20, fontStyle: "italic" }}>d</div>
            <div className="serif" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.02em" }}>D&apos; Lux Homes</div>
          </Link>
          <Link href="/my-bookings" style={{ padding: "9px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>My bookings</Link>
        </div>
      </header>

      <div className="page-enter" style={{ maxWidth: 860, margin: "0 auto", padding: "60px 28px 80px" }}>
        {/* Hero check */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--ink)", color: "var(--white)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
            <IcoCheck />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 10 }}>
            Booking {booking.id}
          </div>
          <h1 className="serif" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.03em", margin: 0, lineHeight: 1 }}>
            You&apos;re in. <em>Rest is coming.</em>
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 16, maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
            {guestEmail && <>Confirmation emailed to <strong>{guestEmail}</strong>. </>}
            {guestName && guestPhone && <>{guestName}, we&apos;ll text check-in details to {guestPhone} the day before.</>}
          </p>
        </div>

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
            <div style={{ display: "flex", gap: 8 }}>
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
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted)", marginBottom: 16 }}>Before you arrive</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {[
              { h: "48 hrs before", t: "Cancel for free up to this point. After that, the first-night fee applies." },
              { h: "24 hrs before", t: "Your host sends unit access codes and building instructions via SMS." },
              { h: "Check-in day", t: "Bring a valid ID at the lobby. Head up, settle in, start resting." },
            ].map((b) => (
              <div key={b.h}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-ink)" }}>{b.h}</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 4 }}>{b.t}</div>
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
