"use client";

// Storefront header — "Site Headers" Claude Design (variant 01/02/03):
// a quiet 72px cream bar with a monogram wordmark, center nav, a My-bookings
// dropdown (count pill + panel), an account dropdown (avatar + sign in/out),
// and an ink Book button. Wired to the real NextAuth session + stored bookings.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getMyBookingIds } from "@/lib/booking-store";

const INK = "#1f1b16";
const CLAY = "#b8754a";
const MUTED = "#6b6358";
const SUBTLE = "#8a8276";
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, monospace";

type Row = { id: string; room: string; when: string; status: string; live: boolean };

function fmtWhen(dateISO: string, ci?: string, co?: string): string {
  let label = "";
  if (dateISO) {
    const d = new Date(dateISO + "T00:00:00");
    label = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  }
  const t12 = (t?: string) => {
    if (!t) return "";
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    let h = parseInt(m[1], 10);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  };
  const win = ci && co ? `${t12(ci)} — ${t12(co)}` : "";
  return [label, win].filter(Boolean).join(" · ");
}

export default function SiteHeader({ bookHref, bookLabel = "Book now", backHref, backLabel = "Back" }: { bookHref: string; bookLabel?: string; backHref?: string; backLabel?: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";
  const userId = session?.user?.id;
  const name = session?.user?.name || "";
  const firstName = name.split(" ")[0] || "Guest";
  const initial = (name[0] || "G").toUpperCase();
  const email = session?.user?.email || "";

  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [hoverRow, setHoverRow] = useState(-1);
  const [hoverMenu, setHoverMenu] = useState(-1);
  const [signHover, setSignHover] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // Pull the guest's bookings (same source as the My Bookings page) for the panel.
  useEffect(() => {
    if (!signedIn) { setRows([]); return; }
    let active = true;
    const ids = getMyBookingIds();
    const localFetches = ids.map((id) =>
      fetch(`/api/bookings/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => j?.data)
    );
    const accountFetch = userId
      ? fetch(`/api/bookings/user/${encodeURIComponent(userId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (Array.isArray(j?.data) ? j.data : []))
      : Promise.resolve([] as Record<string, unknown>[]);

    Promise.all([accountFetch, Promise.all(localFetches)]).then(([acct, locals]) => {
      if (!active) return;
      const all = [...(acct as Record<string, unknown>[]), ...(locals.filter(Boolean) as Record<string, unknown>[])];
      const byId = new Map<string, Record<string, unknown>>();
      all.forEach((d) => { const id = String(d.booking_id ?? ""); if (id) byId.set(id, d); });
      const list = Array.from(byId.values())
        .map((d) => {
          const st = String(d.status ?? "pending");
          return {
            id: String(d.booking_id ?? ""),
            room: String(d.room_name ?? "Your stay"),
            when: fmtWhen(String(d.check_in_date ?? "").slice(0, 10), d.check_in_time as string, d.check_out_time as string),
            status: st.charAt(0).toUpperCase() + st.slice(1),
            live: ["confirmed", "checked-in", "approved"].includes(st),
          } as Row;
        })
        .filter((r) => ["Pending", "Confirmed", "Approved", "Checked-in"].includes(r.status));
      setRows(list);
    });
    return () => { active = false; };
  }, [signedIn, userId]);

  // Click-to-toggle dropdowns: close when clicking outside either panel.
  const bookingsRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bookingsOpen && !accountOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (bookingsOpen && bookingsRef.current && !bookingsRef.current.contains(t)) setBookingsOpen(false);
      if (accountOpen && accountRef.current && !accountRef.current.contains(t)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bookingsOpen, accountOpen]);

  const goBook = () => {
    if (bookHref.startsWith("#")) document.querySelector(bookHref)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push(bookHref);
  };

  const panelBase: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 12px)", right: 0,
    background: "#faf7f1", border: "1px solid #ece5d4",
    boxShadow: "0 24px 60px -20px rgba(40,30,18,.30)", borderRadius: 2,
    overflow: "hidden", zIndex: 60, transformOrigin: "top right",
    transition: "opacity .22s ease, transform .26s cubic-bezier(.2,.8,.2,1)",
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#faf7f1", borderBottom: "1px solid #ece5d4", fontFamily: "'Geist', system-ui, -apple-system, sans-serif", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
        @keyframes dluxDot{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes shBackIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes shBookIn{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes shBookGlow{0%,100%{box-shadow:0 0 0 0 rgba(184,117,74,0)}50%{box-shadow:0 0 0 6px rgba(184,117,74,.14)}}
        @keyframes shBackArrow{0%,100%{transform:translateX(0)}50%{transform:translateX(-3px)}}
        .sh-tap { transition: background .18s ease, color .15s ease; }
        .sh-tap:hover { background: #f3eee2; }
        .sh-back { animation: shBackIn .4s cubic-bezier(.2,.8,.2,1) both; transition: background .18s ease, color .15s ease, transform .18s ease; }
        .sh-back:hover { background: #f3eee2; color: ${INK}; transform: translateX(-2px); }
        .sh-back:active { transform: scale(.96); }
        .sh-back svg { transition: transform .2s ease; }
        .sh-back:hover svg { animation: shBackArrow .9s ease-in-out infinite; }
        .sh-book { animation: shBookIn .45s cubic-bezier(.2,.8,.2,1) both, shBookGlow 3.2s ease-in-out 1s infinite; transition: background .2s ease, transform .18s ease, box-shadow .2s ease; }
        .sh-book:hover { background: #9a6840; transform: translateY(-2px); box-shadow: 0 8px 20px -6px rgba(154,104,64,.55); animation: none; }
        .sh-book:active { transform: translateY(0) scale(.97); }
        .sh-book svg { transition: transform .2s ease; }
        .sh-book:hover svg { transform: translateX(4px); }
        @media (prefers-reduced-motion: reduce) {
          .sh-back, .sh-book { animation: none; }
          .sh-back svg, .sh-book svg { transition: none; }
          .sh-back:hover svg { animation: none; }
        }
        @media (max-width: 720px) { .sh-acct-text, .sh-mybk-text { display: none !important; } }
      `}</style>

      <div style={{ maxWidth: 1320, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

        {/* LEFT — optional back + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {backHref && (
            <>
              <Link href={backHref} className="sh-back" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", textDecoration: "none", color: MUTED, fontSize: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                <span>{backLabel}</span>
              </Link>
              <span style={{ width: 1, height: 24, background: "#e8e1d2" }} />
            </>
          )}
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: backHref ? 30 : 34, height: backHref ? 30 : 34, flex: "none", background: INK, color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: backHref ? 16 : 18, fontStyle: "italic", letterSpacing: "-0.04em" }}>D</div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontFamily: SERIF, fontSize: backHref ? 18 : 20, letterSpacing: "-0.01em" }}>D&rsquo; Lux Homes</div>
              {!backHref && <div style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: SUBTLE, marginTop: 4 }}>Staycations &middot; PH</div>}
            </div>
          </Link>
        </div>

        {/* RIGHT — bookings + account + book */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* MY BOOKINGS — only when signed in */}
          {signedIn && (
            <div ref={bookingsRef} style={{ position: "relative" }}>
              <button className="sh-tap" onClick={() => { setBookingsOpen((v) => !v); setAccountOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "transparent", border: 0, cursor: "pointer", font: "inherit", color: INK, fontSize: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span className="sh-mybk-text">My bookings</span>
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", background: CLAY, color: "#faf7f1", fontSize: 11, fontWeight: 500, display: "grid", placeItems: "center", borderRadius: 9, fontFamily: MONO }}>{rows.length}</span>
              </button>

              <div style={{ ...panelBase, width: 320, opacity: bookingsOpen ? 1 : 0, transform: bookingsOpen ? "translateY(0) scale(1)" : "translateY(-6px) scale(.97)", pointerEvents: bookingsOpen ? "auto" : "none" }}>
                <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #ece5d4", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: SERIF, fontSize: 18, color: INK }}>Your stays</span>
                  <span style={{ fontSize: 11, letterSpacing: "1.4px", color: "#a99c84", fontFamily: MONO }}>{rows.length} UPCOMING</span>
                </div>
                <div>
                  {rows.length === 0 ? (
                    <div style={{ padding: "22px", fontSize: 13.5, color: SUBTLE }}>No upcoming stays yet.</div>
                  ) : rows.map((b, i) => (
                    <button key={b.id} onClick={() => router.push("/my-bookings")} onMouseEnter={() => setHoverRow(i)} onMouseLeave={() => setHoverRow(-1)}
                      style={{ display: "flex", gap: 12, width: "100%", padding: "14px 22px", background: hoverRow === i ? "#f3eee2" : "transparent", border: "none", borderBottom: "1px solid #ece5d4", cursor: "pointer", textAlign: "left", transition: "background .2s ease", alignItems: "flex-start" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.live ? CLAY : "#c7b9a1", flex: "none", marginTop: 7 }} />
                      <span style={{ flex: 1, textAlign: "left" }}>
                        <span style={{ display: "block", fontFamily: SERIF, fontSize: 16, color: INK, lineHeight: 1.2 }}>{b.room}</span>
                        <span style={{ display: "block", fontSize: 12, color: SUBTLE, marginTop: 3, letterSpacing: ".2px" }}>{b.when}</span>
                      </span>
                      <span style={{ flex: "none", alignSelf: "center", fontSize: 10.5, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 9px", color: b.live ? CLAY : "#a18d70", background: b.live ? "rgba(184,117,74,.12)" : "rgba(58,51,39,.06)", border: `1px solid ${b.live ? "rgba(184,117,74,.3)" : "rgba(58,51,39,.12)"}` }}>{b.status}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => router.push("/my-bookings")} style={{ width: "100%", padding: 13, background: "none", border: "none", borderTop: "1px solid #ece5d4", fontSize: 12, letterSpacing: "1.6px", color: "#9a6a39", cursor: "pointer", textTransform: "uppercase", fontFamily: MONO }}>View all bookings</button>
              </div>
            </div>
          )}

          {/* divider (between bookings and account, signed in only) */}
          {signedIn && <span style={{ width: 1, height: 20, background: "#e8e1d2", margin: "0 6px" }} />}

          {/* ACCOUNT / SIGN IN */}
          {signedIn ? (
            <div ref={accountRef} style={{ position: "relative" }}>
              <button className="sh-tap" onClick={() => { setAccountOpen((v) => !v); setBookingsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 6px 8px", background: "transparent", border: 0, cursor: "pointer", font: "inherit", color: INK }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", flex: "none", background: CLAY, color: "#faf7f1", display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: 14 }}>{initial}</span>
                <span className="sh-acct-text" style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, color: INK }}>{firstName}</span>
                  <span style={{ fontSize: 11, color: SUBTLE, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5b9e6b", display: "inline-block", animation: "dluxDot 2.4s ease-in-out infinite" }} />
                    Account
                  </span>
                </span>
              </button>

              <div style={{ ...panelBase, width: 236, opacity: accountOpen ? 1 : 0, transform: accountOpen ? "translateY(0) scale(1)" : "translateY(-6px) scale(.97)", pointerEvents: accountOpen ? "auto" : "none" }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #ece5d4" }}>
                  <div style={{ fontFamily: SERIF, fontSize: 16, color: INK }}>{name || "Guest"}</div>
                  {email && <div style={{ fontSize: 12, color: SUBTLE, marginTop: 2 }}>{email}</div>}
                </div>
                {["Profile & preferences", "Payment methods"].map((label, i) => (
                  <button key={label} onClick={() => router.push("/my-bookings")} onMouseEnter={() => setHoverMenu(i)} onMouseLeave={() => setHoverMenu(-1)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 18px", paddingLeft: hoverMenu === i ? 24 : 18, background: hoverMenu === i ? "#f3eee2" : "transparent", border: "none", borderBottom: "1px solid #ece5d4", cursor: "pointer", fontSize: 13.5, color: "#544a3a", transition: "background .18s ease, padding-left .2s ease" }}>{label}</button>
                ))}
                <button onClick={() => signOut({ callbackUrl: "/rooms" })} onMouseEnter={() => setSignHover(true)} onMouseLeave={() => setSignHover(false)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 18px", background: signHover ? "rgba(168,70,55,.08)" : "transparent", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 500, letterSpacing: ".3px", color: "#a8492f", transition: "background .18s ease" }}>Sign out</button>
              </div>
            </div>
          ) : (
            <Link href="/login" className="sh-tap" style={{ padding: "12px 16px", textDecoration: "none", color: INK, fontSize: 14 }}>Sign in</Link>
          )}

          {/* BOOK — primary */}
          <button className="sh-book" onClick={goBook}
            style={{ marginLeft: 8, background: CLAY, color: "#faf7f1", border: 0, padding: "12px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>{bookLabel}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}
