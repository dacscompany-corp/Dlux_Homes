"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import SiteHeader from "@/components/SiteHeader";
import { getMyBookingIds } from "@/lib/booking-store";
import type { StoredBooking } from "@/lib/booking-store";

type BookingRow = StoredBooking & { checkInTime?: string; checkOutTime?: string };
// Map an API booking record into the shape the page renders.
function mapBooking(d: Record<string, unknown>): BookingRow {
  return {
    id: String(d.booking_id ?? ""),
    roomId: "",
    roomName: String(d.room_name ?? ""),
    checkIn: String(d.check_in_date ?? "").slice(0, 10),
    checkOut: String(d.check_out_date ?? "").slice(0, 10),
    stayType: "",
    guests: { adults: Number(d.adults ?? 0), children: Number(d.children ?? 0), infants: Number(d.infants ?? 0) },
    status: String(d.status ?? "pending") as StoredBooking["status"],
    totalAmount: Number(d.total_amount ?? 0),
    addOns: [],
    createdAt: String(d.created_at ?? ""),
    guestInfo: {
      firstName: String(d.guest_first_name ?? ""),
      lastName: String(d.guest_last_name ?? ""),
      email: String(d.guest_email ?? ""),
      phone: String(d.guest_phone ?? ""),
    },
    checkInTime: (d.check_in_time as string) ?? undefined,
    checkOutTime: (d.check_out_time as string) ?? undefined,
  } as BookingRow;
}

function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }
function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IcoArrowRight() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>; }
function IcoCalendar() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>; }
function IcoClock() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>; }
function IcoUsers() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function IcoTag() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>; }

const statusStyle = (s: string): { bg: string; ink: string; label: string } => ({
  pending:      { bg: "#F8E8C4", ink: "#7A5A18", label: "Pending approval" },
  approved:     { bg: "#DDE9D4", ink: "#3B5A24", label: "Approved — pay to confirm" },
  confirmed:    { bg: "#DDE9D4", ink: "#3B5A24", label: "Confirmed" },
  "on-going":   { bg: "var(--ink)", ink: "var(--white)", label: "On-going" },
  "checked-in": { bg: "var(--ink)", ink: "var(--white)", label: "Checked in" },
  "checked-out":{ bg: "var(--bg-2)", ink: "var(--muted)", label: "Completed" },
  cancelled:    { bg: "#EFD9D4", ink: "#7A2B18", label: "Cancelled" },
  rejected:     { bg: "#EFD9D4", ink: "#7A2B18", label: "Rejected" },
}[s] || { bg: "var(--bg-2)", ink: "var(--muted)", label: s });

const ROOM_IMAGE = "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80";

function BookingCard({ booking }: { booking: StoredBooking & { checkInTime?: string; checkOutTime?: string } }) {
  const s = statusStyle(booking.status);
  const image = ROOM_IMAGE;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 24, background: "var(--white)", borderRadius: 20, border: "1px solid var(--line)", overflow: "hidden" }}>
      <div style={{ background: "var(--bg-2)", position: "relative" }}>
        <Image src={image} alt="" fill unoptimized style={{ objectFit: "cover" }} />
      </div>
      <div style={{ padding: "22px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.ink, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{booking.id}</span>
        </div>
        <div className="serif" style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-.015em" }}>{booking.roomName}</div>
        <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--ink-2)", marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><IcoCalendar /> {formatDate(booking.checkIn)}</span>
          {booking.checkInTime && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><IcoClock /> {booking.checkInTime} → {booking.checkOutTime}</span>
          )}
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><IcoUsers /> {booking.guests.adults + booking.guests.children} guest{booking.guests.adults + booking.guests.children > 1 ? "s" : ""}</span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><IcoTag /> {booking.stayType}</span>
        </div>
      </div>
      <div style={{ padding: "22px 24px 22px 0", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{peso(booking.totalAmount)}</div>
        </div>
        <Link href={`/my-bookings/confirmed?id=${booking.id}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", fontSize: 13, fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
          View details <IcoArrowRight />
        </Link>
      </div>
    </div>
  );
}

export default function MyBookingsPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    // Wait until NextAuth resolves the session, otherwise we'd fetch with an
    // unknown userId and briefly render the empty state before account data loads.
    if (status === "loading") return;
    let active = true;
    setLoading(true);
    // Account bookings (works across devices) + legacy localStorage bookings.
    const ids = getMyBookingIds();
    const localFetches = ids.map((id) =>
      fetch(`/api/bookings/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => j?.data)
    );
    const accountFetch = userId
      ? fetch(`/api/bookings/user/${encodeURIComponent(userId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (Array.isArray(j?.data) ? j.data : []))
      : Promise.resolve([] as Record<string, unknown>[]);

    Promise.all([accountFetch, Promise.all(localFetches)]).then(([acct, locals]) => {
      if (!active) return;
      const rows = [...(acct as Record<string, unknown>[]), ...locals.filter(Boolean) as Record<string, unknown>[]];
      const byId = new Map<string, Record<string, unknown>>();
      rows.forEach((d) => { const id = String(d.booking_id ?? ""); if (id) byId.set(id, d); });
      setBookings(Array.from(byId.values()).map(mapBooking));
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId, status]);

  const upcoming = bookings.filter((b) => ["pending", "approved", "confirmed", "on-going", "checked-in"].includes(b.status));
  const past = bookings.filter((b) => ["checked-out", "cancelled", "rejected"].includes(b.status));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--bg)", color: "var(--ink)" }}>
      {/* HEADER */}
      <SiteHeader bookHref="/rooms" bookLabel="Book again" backHref="/rooms" backLabel="Back to home" />

      <div className="page-enter" style={{ flex: 1, width: "100%", maxWidth: 1180, margin: "0 auto", padding: "40px 28px 80px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 10 }}>Your journeys</div>
          <h1 className="serif" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.025em", margin: 0, lineHeight: 1 }}>My bookings</h1>
        </div>

        <div style={{ display: "flex", gap: 4, padding: 5, background: "var(--bg-2)", borderRadius: 999, width: "fit-content", marginBottom: 28 }}>
          {([["upcoming", loading ? "Upcoming" : `Upcoming (${upcoming.length})`], ["past", loading ? "Past" : `Past (${past.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: tab === id ? "var(--ink)" : "transparent", color: tab === id ? "var(--white)" : "var(--ink-2)", border: "none", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <style>{`@keyframes bkPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } } .bk-sk { animation: bkPulse 1.3s ease-in-out infinite; }`}</style>
            {[0, 1].map((i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, background: "var(--white)", borderRadius: 20, border: "1px solid var(--line)", overflow: "hidden", minHeight: 164 }}>
                <div className="bk-sk" style={{ background: "var(--bg-2)" }} />
                <div style={{ padding: "26px 0", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="bk-sk" style={{ width: 140, height: 16, borderRadius: 6, background: "var(--bg-2)" }} />
                  <div className="bk-sk" style={{ width: 240, height: 26, borderRadius: 6, background: "var(--bg-2)" }} />
                  <div className="bk-sk" style={{ width: 320, height: 14, borderRadius: 6, background: "var(--bg-2)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 80, textAlign: "center", background: "var(--white)", borderRadius: 24, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
            <div className="serif" style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-.02em" }}>No {tab} stays yet</div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>When you book, you&apos;ll see it here.</p>
            <Link href="/rooms/1" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "11px 20px", borderRadius: 999, background: "var(--ink)", color: "var(--white)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Browse stays
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {list.map((b) => <BookingCard key={b.id} booking={b as StoredBooking & { checkInTime?: string; checkOutTime?: string }} />)}
          </div>
        )}
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
