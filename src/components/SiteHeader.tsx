"use client";

// Storefront header implementing the "D'Lux Header" Claude Design:
// cream bar, monogram logo, a My-bookings dropdown (count + panel), an account
// dropdown (avatar + sign in/out), a divider, and a magnetic Book-now button.
// Wired to the real NextAuth session and the guest's stored bookings.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getMyBookingIds } from "@/lib/booking-store";

const ACCENT = "var(--dlux-accent)";
const SERIF = "var(--font-fraunces), Georgia, serif";

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
    // Account bookings (cross-device) + legacy localStorage bookings, deduped.
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

  // Magnetic Book-now button + arrow + shimmer.
  const bookRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const bookMove = (e: React.MouseEvent) => {
    const el = bookRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    el.style.transform = `translate(${x * 0.22}px, ${y * 0.4}px)`;
  };
  const bookEnter = () => {
    if (arrowRef.current) arrowRef.current.style.transform = "translateX(4px)";
    const f = fillRef.current;
    if (f) { f.style.transition = "none"; f.style.transform = "translateX(-100%)"; requestAnimationFrame(() => { f.style.transition = "transform .7s ease"; f.style.transform = "translateX(100%)"; }); }
  };
  const bookLeave = () => {
    if (bookRef.current) bookRef.current.style.transform = "translate(0,0)";
    if (arrowRef.current) arrowRef.current.style.transform = "translateX(0)";
  };

  const panelBase: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 14px)", right: 0,
    background: "#fbf6ec", border: "1px solid rgba(58,51,39,.12)",
    boxShadow: "0 24px 60px -20px rgba(40,30,18,.42)", borderRadius: 4,
    overflow: "hidden", zIndex: 60, transformOrigin: "top right",
    transition: "opacity .26s ease, transform .3s cubic-bezier(.2,.8,.2,1)",
  };
  const linkBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
    cursor: "pointer", padding: "8px 14px", font: "inherit", fontFamily: SERIF, fontSize: 16.5, color: "#332d22",
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#f3eadb", borderBottom: "1px solid rgba(58,51,39,.10)" }}>
      <style>{`@keyframes dluxDot{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
      <div style={{ maxWidth: 1320, margin: "0 auto", height: 76, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

        {/* left: optional back + logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {backHref && (
          <Link href={backHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "#544a3a", textDecoration: "none", whiteSpace: "nowrap" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            {backLabel}
          </Link>
        )}
        <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
          <div style={{ width: 48, height: 48, border: "1px solid rgba(58,51,39,.28)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <span style={{ fontFamily: SERIF, fontSize: 13, letterSpacing: ".5px", color: "#3a3327" }}>DLH</span>
          </div>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 23, color: "#332d22", letterSpacing: ".2px" }}>D&rsquo;&#8201;Lux Homes</div>
            <div style={{ fontSize: 10, letterSpacing: "3.4px", color: "#8a7d68", marginTop: 3, whiteSpace: "nowrap" }}>STAYCATIONS &nbsp;&middot;&nbsp; PH</div>
          </div>
        </Link>
        </div>

        {/* nav cluster */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* MY BOOKINGS — only when signed in */}
          {signedIn && (
            <div ref={bookingsRef} style={{ position: "relative" }}>
              <button onClick={() => { setBookingsOpen((v) => !v); setAccountOpen(false); }} style={linkBtn}>
                <span style={{ position: "relative", display: "inline-block" }}>My bookings
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 1.5, background: ACCENT, transformOrigin: "left", transform: bookingsOpen ? "scaleX(1)" : "scaleX(0)", transition: "transform .34s cubic-bezier(.2,.8,.2,1)" }} />
                </span>
                <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 20, background: bookingsOpen ? ACCENT : "rgba(58,51,39,.10)", color: bookingsOpen ? "#fff" : "#6f6555", fontSize: 11.5, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .25s ease, color .25s ease" }}>{rows.length}</span>
              </button>

              <div style={{ ...panelBase, width: 320, opacity: bookingsOpen ? 1 : 0, transform: bookingsOpen ? "translateY(0) scale(1)" : "translateY(-6px) scale(.97)", pointerEvents: bookingsOpen ? "auto" : "none" }}>
                <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid rgba(58,51,39,.10)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: SERIF, fontSize: 17, color: "#332d22" }}>Your stays</span>
                  <span style={{ fontSize: 11, letterSpacing: "1.4px", color: "#a99c84" }}>{rows.length} UPCOMING</span>
                </div>
                <div>
                  {rows.length === 0 ? (
                    <div style={{ padding: "22px", fontSize: 13.5, color: "#8a7d68" }}>No upcoming stays yet.</div>
                  ) : rows.map((b, i) => (
                    <button key={b.id} onClick={() => router.push("/my-bookings")} onMouseEnter={() => setHoverRow(i)} onMouseLeave={() => setHoverRow(-1)}
                      style={{ display: "flex", gap: 12, width: "100%", padding: "14px 22px", background: hoverRow === i ? "rgba(176,125,68,.07)" : "transparent", border: "none", borderBottom: "1px solid rgba(58,51,39,.07)", cursor: "pointer", textAlign: "left", transition: "background .2s ease", alignItems: "flex-start" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.live ? ACCENT : "#c7b9a1", flex: "none", marginTop: 7 }} />
                      <span style={{ flex: 1, textAlign: "left" }}>
                        <span style={{ display: "block", fontFamily: SERIF, fontSize: 16, color: "#332d22", lineHeight: 1.2 }}>{b.room}</span>
                        <span style={{ display: "block", fontSize: 12, color: "#8a7d68", marginTop: 3, letterSpacing: ".2px" }}>{b.when}</span>
                      </span>
                      <span style={{ flex: "none", alignSelf: "center", fontSize: 10.5, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 9px", borderRadius: 20, color: b.live ? ACCENT : "#a18d70", background: b.live ? "rgba(176,125,68,.12)" : "rgba(58,51,39,.06)", border: `1px solid ${b.live ? "rgba(176,125,68,.3)" : "rgba(58,51,39,.12)"}` }}>{b.status}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => router.push("/my-bookings")} style={{ width: "100%", padding: 13, background: "none", border: "none", borderTop: "1px solid rgba(58,51,39,.10)", fontSize: 12.5, letterSpacing: "1.6px", color: "#9a6a39", cursor: "pointer", textTransform: "uppercase" }}>View all bookings</button>
              </div>
            </div>
          )}

          {/* ACCOUNT / SIGN IN-OUT */}
          <div ref={accountRef} style={{ position: "relative", marginLeft: 6 }}>
            <button onClick={() => (signedIn ? (setAccountOpen((v) => !v), setBookingsOpen(false)) : router.push("/login"))} style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", cursor: "pointer", padding: "7px 12px", borderRadius: 40, transition: "background .2s ease" }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: signedIn ? ACCENT : "transparent", border: signedIn ? "none" : `1.4px dashed ${ACCENT}`, color: signedIn ? "#fff" : ACCENT, fontFamily: SERIF, fontSize: 16, transition: "all .3s ease" }}>{signedIn ? initial : "+"}</span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
                <span style={{ fontFamily: SERIF, fontSize: 16, color: "#332d22" }}>{signedIn ? firstName : "Sign in"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, letterSpacing: ".4px", color: "#9a8d77", marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: signedIn ? "#5b9e6b" : "#bcae96", display: "inline-block", animation: "dluxDot 2.4s ease-in-out infinite" }} />
                  {signedIn ? "Signed in" : "Guest"}
                </span>
              </span>
            </button>

            {signedIn && (
              <div style={{ ...panelBase, width: 236, opacity: accountOpen ? 1 : 0, transform: accountOpen ? "translateY(0) scale(1)" : "translateY(-6px) scale(.97)", pointerEvents: accountOpen ? "auto" : "none" }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(58,51,39,.10)" }}>
                  <div style={{ fontFamily: SERIF, fontSize: 16, color: "#332d22" }}>{name || "Guest"}</div>
                  {email && <div style={{ fontSize: 12, color: "#8a7d68", marginTop: 2 }}>{email}</div>}
                </div>
                {["Profile & preferences", "Payment methods"].map((label, i) => (
                  <button key={label} onClick={() => router.push("/my-bookings")} onMouseEnter={() => setHoverMenu(i)} onMouseLeave={() => setHoverMenu(-1)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 18px", paddingLeft: hoverMenu === i ? 24 : 18, background: hoverMenu === i ? "rgba(176,125,68,.07)" : "transparent", border: "none", borderBottom: "1px solid rgba(58,51,39,.07)", cursor: "pointer", fontSize: 13.5, color: "#544a3a", transition: "background .18s ease, padding-left .2s ease" }}>{label}</button>
                ))}
                <button onClick={() => signOut({ callbackUrl: "/rooms" })} onMouseEnter={() => setSignHover(true)} onMouseLeave={() => setSignHover(false)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 18px", background: signHover ? "rgba(168,70,55,.08)" : "transparent", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 500, letterSpacing: ".3px", color: "#a8492f", transition: "background .18s ease" }}>Sign out</button>
              </div>
            )}
          </div>

          <span style={{ width: 1, height: 30, background: "rgba(58,51,39,.18)", margin: "0 12px" }} />

          {/* BOOK NOW — magnetic */}
          <button ref={bookRef} onClick={() => { if (bookHref.startsWith("#")) document.querySelector(bookHref)?.scrollIntoView({ behavior: "smooth", block: "start" }); else router.push(bookHref); }} onMouseMove={bookMove} onMouseEnter={bookEnter} onMouseLeave={bookLeave}
            style={{ position: "relative", overflow: "hidden", cursor: "pointer", border: "none", padding: "14px 26px", borderRadius: 40, color: "#fff", background: ACCENT, boxShadow: "0 10px 26px -10px rgba(140,90,40,.7)", transition: "transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease" }}>
            <span ref={fillRef} style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(120deg, rgba(255,255,255,0), rgba(255,255,255,.22), rgba(255,255,255,0))", transform: "translateX(-100%)" }} />
            <span style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 11, fontFamily: SERIF, fontSize: 16.5, letterSpacing: ".2px" }}>
              {bookLabel}
              <span ref={arrowRef} style={{ display: "inline-flex", transition: "transform .42s cubic-bezier(.2,.8,.2,1)" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>
              </span>
            </span>
          </button>

        </nav>
      </div>
    </header>
  );
}
