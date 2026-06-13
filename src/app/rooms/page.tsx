"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { mockRooms, mockReviews } from "@/lib/mock-data";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { havenToRoom } from "@/lib/haven-adapter";

const stayWindows = [
  { stayType: "10", checkIn: "9:00 AM", checkOut: "7:00 PM", label: "Daycation" },
  { stayType: "10", checkIn: "9:00 PM", checkOut: "7:00 AM", label: "Nightcation" },
  { stayType: "21", checkIn: "10:00 AM", checkOut: "7:00 AM", label: "Full stay" },
];

// ── Amenity icons ──────────────────────────────────────────────
function AiWifi()      { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>; }
function AiWind()      { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>; }
function AiTv()        { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>; }
function AiBalcony()   { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V8h14v13"/><path d="M5 12h14"/><path d="M9 21v-5"/><path d="M15 21v-5"/></svg>; }
function AiDroplet()   { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>; }
function AiUtensils()  { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h2v11h2V2"/><path d="M18 2v7h-2V2"/><path d="M18 11v11"/></svg>; }
function AiFridge()    { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="5" y1="10" x2="19" y2="10"/><line x1="8" y1="6" x2="8" y2="8"/><line x1="8" y1="14" x2="8" y2="18"/></svg>; }
function AiMicrowave() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8"/><circle cx="18" cy="10" r="0.5" fill="currentColor"/><circle cx="18" cy="12" r="0.5" fill="currentColor"/><circle cx="18" cy="14" r="0.5" fill="currentColor"/></svg>; }
function AiGames()     { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17" cy="13" r="1" fill="currentColor"/></svg>; }

const AMENITIES = [
  { icon: AiWifi,      label: "Unlimited Fibre WiFi" },
  { icon: AiWind,      label: "Air Conditioning" },
  { icon: AiTv,        label: "Smart TV · Netflix" },
  { icon: AiBalcony,   label: "Private Balcony" },
  { icon: AiDroplet,   label: "Hot/Cold Shower & Bidet" },
  { icon: AiUtensils,  label: "Kitchenette" },
  { icon: AiFridge,    label: "Refrigerator" },
  { icon: AiMicrowave, label: "Microwave" },
  { icon: AiGames,     label: "Board Games & Videoke" },
];

const WELCOME_PACK = ["Dental kit", "Shampoo & bath soap", "Drinking water", "Fresh towels"];

function IcoMapPin() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function IcoStar({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>;
}
function IcoArrowRight({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
}
function IcoClock() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function IcoCheck() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function IcoQuote() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.96v7c0 1.25.75 2.04 2 2.04h.93L3 21z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.96v7c0 1.25.75 2.04 2 2.04h.93L15 21z" /></svg>;
}
function IcoHeart({ filled }: { filled: boolean }) {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}

export default function BrowsePage() {
  const [heroImg, setHeroImg] = useState(0);
  const [wished, setWished] = useState(false);

  // Live haven (single-property storefront) — falls back to mock while loading / if none exist
  const { data: havensData } = useGetHavensQuery({});
  const liveHaven = (havensData as Record<string, unknown>[] | undefined)?.[0];
  const room = liveHaven ? havenToRoom(liveHaven) : mockRooms[0];

  useEffect(() => {
    const id = setInterval(() => setHeroImg((i) => (i + 1) % room.images.length), 5500);
    return () => clearInterval(id);
  }, [room.images.length]);

  return (
    <div className="page-enter" style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(246,239,226,.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Image src="/logo.png" alt="D'Lux Homes" width={56} height={56} unoptimized style={{ objectFit: "contain" }} />
            </div>
            <div style={{ lineHeight: 1.05 }}>
              <div className="serif" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.02em" }}>D&apos; Lux Homes</div>
              <div style={{ fontSize: 10, color: "var(--ink)", textTransform: "uppercase", letterSpacing: ".15em" }}>Staycations · PH</div>
            </div>
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/my-bookings" style={{ padding: "9px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>My bookings</Link>
            <Link href={`/rooms/${room.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, background: "var(--dlux-accent)", color: "var(--white)", textDecoration: "none" }}>
              Book now <IcoArrowRight size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: "relative", height: "min(720px, 88vh)", overflow: "hidden" }}>
        {room.images.map((src, i) => (
          <Image key={i} src={src} alt="" fill unoptimized
            style={{ objectFit: "cover", opacity: i === heroImg ? 1 : 0, transition: "opacity 1.2s ease", zIndex: i === heroImg ? 1 : 0 }}
          />
        ))}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(31,22,14,.35) 0%,rgba(31,22,14,.05) 40%,rgba(31,22,14,.75) 100%)", zIndex: 2 }} />
        <div style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "32px 28px", maxWidth: 1320, margin: "0 auto", left: 0, right: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", color: "var(--white)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(255,255,255,.15)", backdropFilter: "blur(10px)", fontSize: 12, fontWeight: 600 }}>
              <IcoMapPin /> {room.location}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(255,255,255,.15)", backdropFilter: "blur(10px)", fontSize: 12, fontWeight: 600 }}>
              <IcoStar size={13} /> {room.rating} · {room.reviewCount} reviews
            </div>
          </div>
          <div style={{ color: "var(--white)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".2em", opacity: 0.85, marginBottom: 14 }}>A D&apos; Lux Homes staycation</div>
            <h1 className="serif" style={{ fontSize: "clamp(48px,8vw,104px)", fontWeight: 400, letterSpacing: "-.035em", lineHeight: 0.92, margin: 0, maxWidth: 900 }}>
              The city, <em style={{ color: "var(--gold)" }}>on pause.</em>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.55, marginTop: 22, maxWidth: 540, opacity: 0.92 }}>
              One quiet home on the 14th floor of Grass Residences. Book by the hour. Check in in minutes. Leave rested.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => document.getElementById("book-section")?.scrollIntoView({ behavior: "smooth" })}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}>
                Check availability <IcoArrowRight size={18} />
              </button>
              <button onClick={() => setWished((w) => !w)}
                style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 22px", borderRadius: 999, background: "rgba(255,255,255,.14)", backdropFilter: "blur(10px)", color: "var(--white)", fontSize: 14, fontWeight: 600, border: "1px solid rgba(255,255,255,.25)", cursor: "pointer" }}>
                <span style={{ color: wished ? "var(--dlux-accent)" : "var(--white)" }}><IcoHeart filled={wished} /></span>
                {wished ? "Saved" : "Save this stay"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 32 }}>
              {room.images.map((_, i) => (
                <button key={i} onClick={() => setHeroImg(i)}
                  style={{ width: i === heroImg ? 32 : 8, height: 4, borderRadius: 2, background: i === heroImg ? "var(--white)" : "rgba(255,255,255,.4)", border: "none", padding: 0, cursor: "pointer", transition: "width .3s" }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SNAPSHOT STRIP */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "56px 28px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 28, paddingBottom: 40, borderBottom: "1px solid var(--line)" }}>
          {[
            { h: "28 sqm", s: "1 bedroom · balcony" },
            { h: "Up to 4", s: "Full double + pull-out" },
            { h: "10 or 21 hrs", s: "Pick your window" },
            { h: "₱1,399", s: "Starting rate" },
          ].map((item) => (
            <div key={item.h}>
              <div className="serif" style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, color: "var(--ink)" }}>{item.h}</div>
              <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 6 }}>{item.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* EDITORIAL 2-COL */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "80px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 64, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 18 }}>About this home</div>
            <h2 className="serif" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: 0 }}>
              A corner of the sky, <em>set aside for you.</em>
            </h2>
            <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.7, marginTop: 20 }}>{room.description}</p>
            <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.7, marginTop: 16 }}>
              We keep it small on purpose — one home, obsessively looked after, so every guest gets the version we&apos;d want to stay in ourselves. Hosted since 2022.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Balcony", "City view", "Netflix", "Pet-free"].map((t) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", fontSize: 13, fontWeight: 500, borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", color: "var(--ink-2)" }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ borderRadius: 20, overflow: "hidden", aspectRatio: "3/4", background: "var(--bg-2)", gridRow: "span 2", position: "relative" }}>
              <Image src={room.images[1]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
            </div>
            <div style={{ borderRadius: 20, overflow: "hidden", aspectRatio: "4/3", background: "var(--bg-2)", position: "relative" }}>
              <Image src={room.images[2]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
            </div>
            <div style={{ borderRadius: 20, overflow: "hidden", aspectRatio: "4/3", background: "var(--bg-2)", position: "relative" }}>
              <Image src={room.images[0]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
            </div>
          </div>
        </div>
      </section>

      {/* PICK YOUR WINDOW */}
      <section id="book-section" style={{ background: "var(--ink)", color: "var(--white)", padding: "80px 28px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end", marginBottom: 44 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--gold)", marginBottom: 16 }}>How we do stays</div>
              <h2 className="serif" style={{ fontSize: 64, fontWeight: 400, letterSpacing: "-.03em", lineHeight: 0.95, margin: 0 }}>
                Pick the <em>window</em> that fits your day.
              </h2>
            </div>
            <p style={{ fontSize: 16, color: "rgba(255,255,252,.75)", lineHeight: 1.6, margin: 0 }}>
              Three preset check-in windows. No &quot;4pm check-in / 11am check-out&quot; nonsense. Show up, settle in, leave rested.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {stayWindows.map((w, i) => (
              <Link key={i} href={`/rooms/${room.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{ padding: 28, borderRadius: 20, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "var(--white)", cursor: "pointer", transition: "all .22s" }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(255,255,255,.1)"; el.style.borderColor = "var(--gold)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(255,255,255,.05)"; el.style.borderColor = "rgba(255,255,255,.12)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--gold)" }}>{w.stayType}-hour</div>
                    <IcoArrowRight size={16} />
                  </div>
                  <div className="serif" style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-.02em", marginTop: 14, lineHeight: 1 }}>{w.label}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <IcoClock /> {w.checkIn} → {w.checkOut}
                  </div>
                  <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.12)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>From</span>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>₱{(w.stayType === "10" ? room.price10hr : room.price21hr).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* AMENITIES */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "80px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 64 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 16 }}>What&apos;s inside</div>
            <h2 className="serif" style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: "0 0 20px" }}>Everything you&apos;d reach for.</h2>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.65 }}>Kitchenette, balcony, Netflix, videoke — and a welcome pack that means you can walk in with just a backpack.</p>
            <div style={{ marginTop: 28, padding: 20, background: "var(--bg-2)", borderRadius: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 12 }}>On the house</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WELCOME_PACK.map((w) => (
                  <div key={w} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "var(--accent-ink)" }}><IcoCheck /></span> {w}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 2, background: "var(--line)", borderRadius: 20, overflow: "hidden", alignSelf: "start" }}>
            {AMENITIES.map((a) => (
              <div key={a.label} style={{ padding: "24px 18px", background: "var(--white)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-2)", display: "grid", placeItems: "center", color: "var(--ink-2)" }}><a.icon /></div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{a.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section style={{ background: "var(--bg-2)", padding: "80px 28px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 14 }}>Guests say</div>
            <h2 className="serif" style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <IcoStar size={36} /> {room.rating} from {room.reviewCount} stays
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {mockReviews.map((r) => (
              <div key={r.id} style={{ background: "var(--white)", borderRadius: 18, padding: 22, border: "1px solid var(--line)" }}>
                <span style={{ color: "var(--line-2)" }}><IcoQuote /></span>
                <p style={{ fontSize: 14, lineHeight: 1.65, margin: "10px 0 16px", color: "var(--ink-2)" }}>&ldquo;{r.comment}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-deep)", color: "var(--white)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{r.avatar}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.author}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.date}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "100px 28px 80px", textAlign: "center" }}>
        <h2 className="serif" style={{ fontSize: "clamp(48px,7vw,96px)", fontWeight: 400, letterSpacing: "-.03em", lineHeight: 0.95, margin: 0 }}>
          Ready to <em style={{ color: "var(--accent-ink)" }}>pause?</em>
        </h2>
        <p style={{ fontSize: 17, color: "var(--ink-2)", maxWidth: 520, margin: "22px auto 32px", lineHeight: 1.55 }}>
          Our calendar fills up 2–3 weeks out. Pick your window and we&apos;ll hold it.
        </p>
        <Link href={`/rooms/${room.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
          See the home · Book now <IcoArrowRight size={18} />
        </Link>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "48px 28px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40 }}>
            <div>
              <div className="serif" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1 }}>Come home to <em>rest.</em></div>
              <p style={{ color: "var(--ink)", fontSize: 13, maxWidth: 360, marginTop: 12, lineHeight: 1.6 }}>
                One staycation unit at Grass Residences, SM North EDSA, Quezon City. Book by the hour. Leave rested.
              </p>
            </div>
            {[
              { h: "Stay", items: ["10-Hour Daycation", "10-Hour Nightcation", "21-Hour Full Stay"] },
              { h: "Info", items: ["House rules", "Amenities", "Nearby places"] },
              { h: "Contact", items: ["0946 007 4015", "havenphstaycation@gmail.com", "Tower 4, Grass Residences, QC"] },
            ].map((col) => (
              <div key={col.h}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 14, fontWeight: 600 }}>{col.h}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {col.items.map((item) => <li key={item} style={{ fontSize: 13, color: "var(--ink)" }}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink)" }}>
            <div>© 2026 D&apos; Lux Homes · Metro Manila, PH</div>
            <div>Made with care for rest.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
