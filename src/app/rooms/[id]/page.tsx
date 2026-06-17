"use client";

import { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { mockRooms, mockReviews } from "@/lib/mock-data";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { havenToRoom } from "@/lib/haven-adapter";

// ── Inline SVG icons ───────────────────────────────────────────
function IcoChevLeft() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoChevDown() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>; }
function IcoChevLeftLg() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoChevRightLg() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>; }
function IcoStar({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>; }
function IcoMapPin() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function IcoUsers() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function IcoHeart({ filled }: { filled: boolean }) { return <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>; }
function IcoClock() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>; }
function IcoCalendar() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>; }
function IcoCheck() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoInfo() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>; }
function IcoFlame() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5C5.5 11 7 7 12 3c0 4 4 6 4 10.5a4 4 0 0 1-7.5 1z" /></svg>; }
function IcoSquare() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" /></svg>; }
function IcoX() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function IcoPlus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoMinus() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function IcoArrowRight() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>; }
function IcoWarning() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth={2} strokeLinecap="round" /><circle cx="12" cy="17" r="1" fill="#fff" /></svg>; }
function IcoQuote() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.96v7c0 1.25.75 2.04 2 2.04h.93L3 21z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.96v7c0 1.25.75 2.04 2 2.04h.93L15 21z" /></svg>; }
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

// ── Helpers ────────────────────────────────────────────────────
function peso(n: number) { return "₱" + n.toLocaleString("en-PH"); }

const availableWindows = [
  { stayType: "10", checkIn: "7:00 AM",  checkOut: "5:00 PM", label: "Daycation" },
  { stayType: "10", checkIn: "9:00 PM",  checkOut: "5:00 AM", label: "Nightcation" },
  { stayType: "21", checkIn: "10:00 AM", checkOut: "7:00 AM", label: "Overnight" },
];

type Window = typeof availableWindows[0];
type Guests = { adults: number; children: number; infants: number };

function formatDateLong(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// ── Calendar ──────────────────────────────────────────────────
function Calendar({ selected, onSelect, blocked }: { selected: string; onSelect: (d: string) => void; blocked: string[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const blockedSet = new Set(blocked);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  const name = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setViewMonth(new Date(y, m - 1, 1))} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--line-2)", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}><IcoChevLeftLg /></button>
          <button onClick={() => setViewMonth(new Date(y, m + 1, 1))} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--line-2)", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}><IcoChevRightLg /></button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, fontSize: 11, color: "var(--muted)", marginBottom: 6, textAlign: "center", fontWeight: 600 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isPast = d < today;
          const key = iso(d);
          const isBlocked = blockedSet.has(key);
          const isSel = selected === key;
          const disabled = isPast || isBlocked;
          return (
            <button key={i} disabled={disabled} onClick={() => onSelect(key)}
              style={{ height: 36, borderRadius: 10, fontSize: 13, fontWeight: 500, background: isSel ? "var(--ink)" : "transparent", color: isSel ? "var(--white)" : disabled ? "var(--line-2)" : "var(--ink)", textDecoration: isBlocked ? "line-through" : "none", cursor: disabled ? "not-allowed" : "pointer", border: "1px solid transparent" }}
              onMouseEnter={(e) => { if (!disabled && !isSel) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"; }}
              onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Guest counter ─────────────────────────────────────────────
function GuestCounter({ guests, setGuests, max }: { guests: Guests; setGuests: (g: Guests) => void; max: number }) {
  const total = guests.adults + guests.children;
  const row = (label: string, sub: string, key: keyof Guests, min = 0, limitedByMax = false) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setGuests({ ...guests, [key]: Math.max(min, guests[key] - 1) })}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--white)", display: "grid", placeItems: "center", opacity: guests[key] <= min ? 0.4 : 1, cursor: guests[key] <= min ? "not-allowed" : "pointer" }}>
          <IcoMinus />
        </button>
        <div style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{guests[key]}</div>
        <button onClick={() => { if (limitedByMax && total >= max) return; setGuests({ ...guests, [key]: guests[key] + 1 }); }}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--white)", display: "grid", placeItems: "center", opacity: limitedByMax && total >= max ? 0.4 : 1, cursor: limitedByMax && total >= max ? "not-allowed" : "pointer" }}>
          <IcoPlus />
        </button>
      </div>
    </div>
  );
  return (
    <div>
      {row("Adults", "Age 13+", "adults", 1, true)}
      {row("Children", "Ages 2–12", "children", 0, true)}
      {row("Infants", "Under 2", "infants", 0, false)}
    </div>
  );
}

// ── Gallery modal ─────────────────────────────────────────────
function GalleryModal({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const [dir, setDir] = useState<"left" | "right">("right");
  const [animKey, setAnimKey] = useState(0);
  const thumbRef = useRef<HTMLDivElement>(null);

  const goTo = (next: number, d: "left" | "right") => {
    const total = images.length;
    setDir(d);
    setIdx((next + total) % total);
    setAnimKey((k) => k + 1);
  };

  // Scroll active thumb into view
  useEffect(() => {
    const el = thumbRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [idx]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")  goTo(idx - 1, "left");
      if (e.key === "ArrowRight") goTo(idx + 1, "right");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [idx, images.length, onClose]);

  return (
    <>
      <style>{`
        @keyframes modalSlideRight { from { opacity:0; transform:translateX(60px) scale(.97); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes modalSlideLeft  { from { opacity:0; transform:translateX(-60px) scale(.97); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes modalFadeIn     { from { opacity:0; } to { opacity:1; } }
        .modal-img-anim-right { animation: modalSlideRight 0.38s cubic-bezier(.25,.85,.25,1) both; }
        .modal-img-anim-left  { animation: modalSlideLeft  0.38s cubic-bezier(.25,.85,.25,1) both; }
        .modal-nav:hover { background: rgba(255,255,255,.25) !important; transform: translateY(-50%) scale(1.1) !important; }
        .modal-thumb:hover { opacity: 1 !important; transform: scale(1.05); }
      `}</style>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,.96)", zIndex: 9998, animation: "modalFadeIn 0.22s ease both", display: "flex", flexDirection: "column" }}
        onClick={onClose}
      >
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            <IcoX /> Close
          </button>
          <span style={{ color: "rgba(255,255,255,.7)", fontSize: 14, fontWeight: 600 }}>
            {idx + 1} <span style={{ color: "rgba(255,255,255,.35)" }}>/ {images.length}</span>
          </span>
        </div>

        {/* Main image area */}
        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "0 80px" }} onClick={(e) => e.stopPropagation()}>
          {/* Image */}
          <div
            key={animKey}
            className={dir === "right" ? "modal-img-anim-right" : "modal-img-anim-left"}
            style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <img
              src={images[idx]}
              alt={`Photo ${idx + 1}`}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}
            />
          </div>

          {/* Prev */}
          <button
            className="modal-nav"
            onClick={() => goTo(idx - 1, "left")}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", transition: "all 0.2s", zIndex: 2 }}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          {/* Next */}
          <button
            className="modal-nav"
            onClick={() => goTo(idx + 1, "right")}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", transition: "all 0.2s", zIndex: 2 }}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* Thumbnail strip */}
        <div
          ref={thumbRef}
          style={{ display: "flex", gap: 8, justifyContent: "center", overflowX: "auto", padding: "16px 24px", flexShrink: 0, scrollbarWidth: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((src, n) => (
            <button
              key={n}
              className="modal-thumb"
              onClick={() => goTo(n, n > idx ? "right" : "left")}
              style={{ width: 80, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0, padding: 0, cursor: "pointer", border: n === idx ? "2px solid #fff" : "2px solid rgba(255,255,255,.15)", opacity: n === idx ? 1 : 0.55, transition: "all 0.2s", transform: "scale(1)" }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Live haven by id; fall back to a matching mock (legacy ids) or the first
  // property so the single-property storefront always renders.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: havenRes } = useGetHavenByIdQuery(id, { skip: !id || !isUuid });
  const liveHaven = (havenRes as { data?: Record<string, unknown> } | undefined)?.data;
  const room = liveHaven ? havenToRoom(liveHaven) : (mockRooms.find((r) => r.id === id) || mockRooms[0]);

  const [galleryIdx, setGalleryIdx] = useState(0);
  const [galleryDir, setGalleryDir] = useState<"left" | "right">("right");
  const [animId, setAnimId] = useState(0);
  const animKey = useRef(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  const goTo = (nextIdx: number, dir: "left" | "right") => {
    const total = room.images.length;
    setGalleryDir(dir);
    setGalleryIdx((nextIdx + total) % total);
    animKey.current += 1;
    setAnimId(animKey.current);
  };

  useEffect(() => {
    if (carouselPaused || showGallery) return;
    const t = setTimeout(() => goTo(galleryIdx + 1, "right"), 4000);
    return () => clearTimeout(t);
  }, [galleryIdx, carouselPaused, showGallery]);

  const [dateOpen, setDateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [wished, setWished] = useState(false);

  const [selectedWindow, setSelectedWindow] = useState<Window>(availableWindows[2]);
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState<Guests>({ adults: 2, children: 0, infants: 0 });
  const [customCheckIn, setCustomCheckIn] = useState("");
  const [customCheckOut, setCustomCheckOut] = useState("");

  const basePrice = selectedWindow.stayType === "10" ? room.price10hr : room.price21hr;
  const extraPax = Math.max(0, guests.adults + guests.children - (room.basePax ?? 2));
  const paxFee = extraPax * (room.additionalPaxFee ?? 150);
  const cleaning = 150;
  const subtotal = basePrice + paxFee;
  const serviceFee = Math.round(subtotal * 0.08);
  const total = subtotal + cleaning + serviceFee;

  const blockedDates = (room.blockedDates as Array<{ date: string } | string>).map((b) => typeof b === "string" ? b : b.date);
  const canProceed = date && guests.adults >= 1;

  const handleReserve = () => {
    const params = new URLSearchParams({
      roomId: room.id,
      stayType: selectedWindow.stayType,
      checkIn: customCheckIn || selectedWindow.checkIn,
      checkOut: customCheckOut || selectedWindow.checkOut,
      windowLabel: selectedWindow.label,
      date,
      adults: String(guests.adults),
      children: String(guests.children),
      infants: String(guests.infants),
    });
    window.location.href = `/checkout?${params.toString()}`;
  };

  return (
    <div className="page-enter" style={{ backgroundColor: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
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
          <style>{`
            .mybookings-btn{transition:background 0.18s,transform 0.18s,box-shadow 0.18s}
            .mybookings-btn:hover{background:var(--dlux-accent)!important;color:#fff!important;transform:scale(1.04);box-shadow:0 4px 14px rgba(176,120,72,0.35)}
            .back-btn{transition:background 0.18s,border-color 0.18s,transform 0.18s,box-shadow 0.18s}
            .back-btn:hover{background:var(--bg-2)!important;border-color:var(--line-2)!important;transform:scale(1.05);box-shadow:0 3px 10px rgba(31,22,14,0.12)}
            .save-btn{transition:background 0.18s,border-color 0.18s,color 0.18s,transform 0.18s,box-shadow 0.18s}
            .save-btn:hover{background:var(--dlux-accent)!important;border-color:var(--dlux-accent)!important;color:#fff!important;transform:scale(1.05);box-shadow:0 4px 14px rgba(176,120,72,0.35)}
          `}</style>
          <Link href="/my-bookings" className="mybookings-btn" style={{ padding: "10px 20px", borderRadius: 999, fontSize: 13, fontWeight: 700, color: "var(--dlux-accent)", textDecoration: "none", border: "2px solid var(--dlux-accent)", background: "transparent", display: "inline-flex", alignItems: "center", gap: 7, letterSpacing: ".01em" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>
            My bookings
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "20px 28px 60px" }}>
        {/* BREADCRUMB */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <Link href="/rooms" className="back-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", fontSize: 13, fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
            <IcoChevLeft /> Back
          </Link>
        </div>

        {/* TITLE ROW */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 24 }}>
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 400, letterSpacing: "-.03em", lineHeight: 0.98, margin: 0 }}>{room.name}</h1>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 18, fontSize: 13, color: "var(--ink-2)", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><IcoStar /> {room.rating} · {room.reviewCount} reviews</span>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><IcoMapPin /> {room.location}</span>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><IcoUsers /> Up to {room.capacity}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setWished((w) => !w)}
              className="save-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: wished ? "var(--dlux-accent)" : "var(--ink)" }}>
              <IcoHeart filled={wished} /> {wished ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* CAROUSEL + BOOKING SIDE BY SIDE */}
        <style>{`
          @keyframes csRight { from { opacity:0; transform:translateX(48px) scale(1.03); } to { opacity:1; transform:translateX(0) scale(1); } }
          @keyframes csLeft  { from { opacity:0; transform:translateX(-48px) scale(1.03); } to { opacity:1; transform:translateX(0) scale(1); } }
          .cs-nav { opacity:0; transition: opacity 0.2s, transform 0.2s; }
          .cs-wrap:hover .cs-nav { opacity:1; }
          .cs-nav:hover { transform: translateY(-50%) scale(1.1) !important; }
          .cs-dot { transition: width 0.3s, background 0.3s; }
          .cs-showbtn { transition: background 0.2s; }
          .cs-showbtn:hover { background: rgba(0,0,0,.65) !important; }
        `}</style>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32, alignItems: "start" }}>
          {/* LEFT — carousel + all scrollable content */}
          <div>
          {/* CAROUSEL */}
          <div
            className="cs-wrap"
            style={{ position: "relative", height: 480, borderRadius: 24, overflow: "hidden", background: "#111", userSelect: "none", cursor: "pointer" }}
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
            onClick={() => setShowGallery(true)}
          >
            <div key={animId} style={{ position: "absolute", inset: 0, animation: `${galleryDir === "right" ? "csRight" : "csLeft"} 0.52s cubic-bezier(.22,.85,.25,1) both` }}>
              <Image src={room.images[galleryIdx]} alt="" fill unoptimized preload={galleryIdx === 0} style={{ objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 45%)", pointerEvents: "none", zIndex: 1 }} />
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 3 }} onClick={(e) => e.stopPropagation()}>
              {room.images.map((_, i) => (
                <button key={i} className="cs-dot" onClick={() => goTo(i, i > galleryIdx ? "right" : "left")}
                  style={{ width: i === galleryIdx ? 24 : 8, height: 8, borderRadius: 999, background: i === galleryIdx ? "#fff" : "rgba(255,255,255,.4)", border: "none", padding: 0, cursor: "pointer" }} />
              ))}
            </div>
            <button className="cs-showbtn" onClick={(e) => { e.stopPropagation(); setShowGallery(true); }}
              style={{ position: "absolute", bottom: 16, right: 16, display: "inline-flex", gap: 7, alignItems: "center", padding: "9px 16px", background: "rgba(0,0,0,.45)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, backdropFilter: "blur(10px)", fontSize: 13, fontWeight: 600, cursor: "pointer", zIndex: 3 }}>
              <IcoSquare /> Show all {room.images.length} photos
            </button>
            <button className="cs-nav" onClick={(e) => { e.stopPropagation(); goTo(galleryIdx - 1, "left"); }}
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,.92)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 12px rgba(0,0,0,.4)", zIndex: 3 }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button className="cs-nav" onClick={(e) => { e.stopPropagation(); goTo(galleryIdx + 1, "right"); }}
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,.92)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 12px rgba(0,0,0,.4)", zIndex: 3 }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>{/* end carousel */}

          {/* All scrollable content below carousel */}
          <div style={{ marginTop: 40 }}>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--ink-2)", margin: 0 }}>{room.description}</p>
            </section>
            <style>{`
              .rule-item { transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease; cursor: help; }
              .rule-item:hover { transform: translateX(6px); background: #fde68a !important; border-color: #f59e0b !important; box-shadow: 0 4px 16px rgba(245,158,11,0.25); }
              .rule-item:hover .rule-icon { background: #f59e0b !important; color: #fff !important; }
              .rule-tip {
                position: absolute;
                left: 56px;
                bottom: calc(100% + 10px);
                z-index: 10;
                width: max-content;
                max-width: 280px;
                padding: 11px 14px;
                border-radius: 12px;
                background: #2a1a08;
                color: #fff4e0;
                font-size: 12.5px;
                font-weight: 500;
                line-height: 1.45;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                transform-origin: 24px bottom;
                opacity: 0;
                transform: translateY(10px) scale(0.96);
                pointer-events: none;
                transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
              }
              .rule-tip::after {
                content: "";
                position: absolute;
                top: 100%;
                left: 24px;
                border: 6px solid transparent;
                border-top-color: #2a1a08;
              }
              .rule-item:hover .rule-tip {
                opacity: 1;
                transform: translateY(0) scale(1);
                transition-delay: 0.08s;
              }
              @media (prefers-reduced-motion: reduce) {
                .rule-tip {
                  transition: opacity 0.15s ease;
                  transform: none;
                }
                .rule-item:hover .rule-tip {
                  transform: none;
                }
              }
            `}</style>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>Things to know</h2>
              <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {room.houseRules.map((h) => {
                  const ruleIcon = (() => {
                    if (/smok|vap/i.test(h)) return (
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="2" y1="2" x2="22" y2="22" /><path d="M16 9c1.7.3 3 1.8 3 3.5V14"/><path d="M8 13H3v2h10"/><path d="M22 13v1"/><path d="M16 3s2 1 2 4"/>
                      </svg>
                    );
                    if (/pet|dog|cat|animal/i.test(h)) return (
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        {/* paw print */}
                        <circle cx="7" cy="4" r="1.5" fill="currentColor" stroke="none"/>
                        <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
                        <circle cx="17" cy="4" r="1.5" fill="currentColor" stroke="none"/>
                        <circle cx="4.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
                        <path d="M12 20c-4 0-7-3-5.5-6.5C7.5 11 10 10 12 10s4.5 1 5.5 3.5C19 17 16 20 12 20z" fill="currentColor" stroke="none"/>
                        {/* slash */}
                        <line x1="3" y1="21" x2="21" y2="3" strokeWidth={2.5}/>
                      </svg>
                    );
                    if (/walk.?in/i.test(h)) return (
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        {/* walking person */}
                        <circle cx="12" cy="4" r="1.8" fill="currentColor" stroke="none"/>
                        <path d="M9 9l3 2 3-2"/>
                        <path d="M12 11v5"/>
                        <path d="M9 16l-1.5 4"/>
                        <path d="M15 16l1.5 4"/>
                        {/* slash */}
                        <line x1="3" y1="21" x2="21" y2="3" strokeWidth={2.5}/>
                      </svg>
                    );
                    return <IcoWarning />;
                  })();
                  const ruleNote = (() => {
                    if (/smok|vap/i.test(h)) return "Smoking or vaping anywhere inside the unit triggers a deep-cleaning fee. Please step outside.";
                    if (/pet|dog|cat|animal/i.test(h)) return "Sorry, no pets of any kind are allowed — including for short visits.";
                    if (/walk.?in/i.test(h)) return "Bookings must be made and confirmed in advance. We can't accommodate walk-in guests.";
                    return "Please review this house rule before booking.";
                  })();
                  return (
                    <li key={h} className="rule-item" style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, fontSize: 14, fontWeight: 700, color: "#7a3a00", background: "#fff4e0", border: "1.5px solid #f5c97a", borderRadius: 14, padding: "16px 20px", borderLeft: "5px solid #f59e0b" }}>
                      <span className="rule-icon" style={{ color: "#f59e0b", flexShrink: 0, display: "flex", width: 38, height: 38, borderRadius: "50%", background: "#fef3c7", alignItems: "center", justifyContent: "center", transition: "background 0.18s, color 0.18s" }}>
                        {ruleIcon}
                      </span>
                      {h}
                      <span className="rule-tip" role="tooltip">{ruleNote}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <style>{`.window-card{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}.window-card:hover{transform:translateY(-4px);box-shadow:0 10px 28px rgba(0,0,0,.13);border-color:var(--dlux-accent)!important}.window-card.active:hover{box-shadow:0 10px 28px rgba(0,0,0,.22)}`}</style>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-.02em" }}>Pick your window</h2>
              <p style={{ fontSize: 14, color: "var(--ink)", margin: "0 0 20px" }}>Three preset check-in windows. Book the one that fits your rhythm.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {availableWindows.map((w, i) => { const active = selectedWindow.checkIn === w.checkIn && selectedWindow.checkOut === w.checkOut; return (
                  <button key={i} onClick={() => setSelectedWindow(w)} className={`window-card${active ? " active" : ""}`}
                    style={{ padding: 18, textAlign: "left", borderRadius: 16, border: active ? "2px solid var(--ink)" : "1.5px solid var(--line-2)", background: active ? "var(--ink)" : "var(--white)", color: active ? "var(--white)" : "var(--ink)", cursor: "pointer" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", opacity: 0.7 }}>{w.stayType}-hour</div>
                    <div className="serif" style={{ fontSize: 22, fontWeight: 500, marginTop: 4, letterSpacing: "-.015em" }}>{w.label}</div>
                    <div style={{ fontSize: 12, marginTop: 10, opacity: 0.85, display: "flex", alignItems: "center", gap: 6 }}><IcoClock /> {w.checkIn} → {w.checkOut}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{peso(w.stayType === "10" ? room.price10hr : room.price21hr)}</div>
                  </button>); })}
              </div>
            </section>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>What&apos;s inside</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
                {AMENITIES.map((a) => (<div key={a.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}><div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-2)", display: "grid", placeItems: "center", color: "var(--ink-2)" }}><a.icon /></div><div style={{ fontSize: 14, fontWeight: 500 }}>{a.label}</div></div>))}
              </div>
            </section>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-.02em" }}>On the house</h2>
              <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px" }}>Our welcome pack, included with every booking.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {WELCOME_PACK.map((w) => (<div key={w} style={{ padding: "10px 16px", background: "var(--bg-2)", borderRadius: 12, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--accent-ink)" }}><IcoCheck /></span> {w}</div>))}
              </div>
            </section>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Around the building</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(room.nearby as string[]).slice(0, 5).map((n) => (<div key={n} style={{ fontSize: 13, paddingBottom: 10, borderBottom: "1px solid var(--line)", color: "var(--ink-2)" }}>{n}</div>))}
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Optional amenity fees</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {room.amenityFees.map((n) => (<div key={n.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--ink)" }}>{n.name}</span><span style={{ color: "var(--ink)", fontWeight: 600 }}>{n.fee}</span></div>))}
                </div>
              </div>
            </section>
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
                <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: 0, letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 8 }}><IcoStar size={20} /> {room.rating} · {room.reviewCount} reviews</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                {mockReviews.map((r) => (<div key={r.id} style={{ background: "var(--white)", borderRadius: 18, padding: 22, border: "1px solid var(--line)" }}><span style={{ color: "var(--line-2)" }}><IcoQuote /></span><p style={{ fontSize: 14, lineHeight: 1.65, margin: "10px 0 16px", color: "var(--ink-2)" }}>&ldquo;{r.comment}&rdquo;</p><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--accent-deep)", color: "var(--white)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{r.avatar}</div><div><div style={{ fontSize: 13, fontWeight: 600 }}>{r.author}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{r.date}</div></div></div></div>))}
              </div>
            </section>
          </div>

          </div>{/* end left column */}

          {/* BOOKING CARD — sticky beside the carousel */}
          <aside style={{ position: "sticky", top: 90, height: "fit-content" }}>
            <div style={{ background: "var(--white)", borderRadius: 24, padding: 28, border: "1px solid var(--line)", boxShadow: "var(--shadow-md)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 20 }}>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{peso(basePrice)}</span>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>/ {selectedWindow.stayType}-hour stay</span>
              </div>
              <div style={{ border: "1px solid var(--line-2)", borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                <button onClick={() => { setDateOpen(!dateOpen); setGuestOpen(false); }}
                  style={{ width: "100%", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)" }}>Check-in date</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{date ? formatDateLong(date) : "Pick a date"}</div>
                  </div>
                  <IcoCalendar />
                </button>
                {dateOpen && (
                  <div style={{ borderTop: "1px solid var(--line)", padding: 16, background: "var(--bg)" }}>
                    <Calendar selected={date} blocked={blockedDates} onSelect={(d) => { setDate(d); setDateOpen(false); }} />
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--white)", position: "relative" }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 4 }}>Check-in</label>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <select
                      value={customCheckIn || selectedWindow.checkIn}
                      onChange={(e) => setCustomCheckIn(e.target.value)}
                      style={{ fontSize: 13, fontWeight: 600, flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", color: "var(--ink)", cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                      {availableWindows.map((w, i) => (
                        <option key={i} value={w.checkIn}>{w.checkIn}</option>
                      ))}
                    </select>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--white)", position: "relative" }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 4 }}>Check-out</label>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <select
                      value={customCheckOut || selectedWindow.checkOut}
                      onChange={(e) => setCustomCheckOut(e.target.value)}
                      style={{ fontSize: 13, fontWeight: 600, flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", color: "var(--ink)", cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                      {availableWindows.map((w, i) => (
                        <option key={i} value={w.checkOut}>{w.checkOut}</option>
                      ))}
                    </select>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              </div>
              <div style={{ border: "1px solid var(--line-2)", borderRadius: 14, overflow: "hidden", marginBottom: 18 }}>
                <button onClick={() => { setGuestOpen(!guestOpen); setDateOpen(false); }}
                  style={{ width: "100%", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)" }}>Guests</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                      {guests.adults + guests.children} guest{guests.adults + guests.children > 1 ? "s" : ""}
                      {guests.infants > 0 && `, ${guests.infants} infant${guests.infants > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <div style={{ transform: guestOpen ? "rotate(180deg)" : "none", transition: ".2s" }}><IcoChevDown /></div>
                </button>
                {guestOpen && (
                  <div style={{ borderTop: "1px solid var(--line)", padding: "0 16px" }}>
                    <GuestCounter guests={guests} setGuests={setGuests} max={room.capacity} />
                    <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0" }}>
                      Max {room.capacity} guests. Extra pax beyond {room.basePax ?? 2} is {peso(room.additionalPaxFee ?? 150)} each.
                    </div>
                  </div>
                )}
              </div>
              <button onClick={handleReserve} disabled={!canProceed}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 24px", borderRadius: 999, background: canProceed ? "var(--dlux-accent)" : "var(--line-2)", color: canProceed ? "var(--white)" : "var(--ink)", fontSize: 15, fontWeight: 600, border: "none", cursor: canProceed ? "pointer" : "not-allowed", opacity: canProceed ? 1 : 0.7 }}>
                {canProceed ? <>Reserve this stay <IcoArrowRight /></> : "Pick a date to continue"}
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-2)", marginTop: 10 }}>
                You won&apos;t be charged yet — payment is confirmed at checkout.
              </div>
              {date && (
                <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line)", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "var(--ink-2)" }}><span>{peso(basePrice)} × 1 {selectedWindow.stayType}-hr stay</span><span>{peso(basePrice)}</span></div>
                  {extraPax > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "var(--ink-2)" }}><span>Extra guest fee ({extraPax} × {peso(room.additionalPaxFee ?? 150)})</span><span>{peso(paxFee)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "var(--ink-2)" }}><span>Cleaning fee</span><span>{peso(cleaning)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "var(--ink-2)" }}><span>Service fee</span><span>{peso(serviceFee)}</span></div>
                  <div style={{ paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
                    <span>Total</span><span>{peso(total)}</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, padding: 16, background: "var(--bg-2)", borderRadius: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ color: "var(--dlux-accent)", flexShrink: 0, marginTop: 2 }}><IcoFlame /></span>
              <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55 }}>
                <strong>Rare find.</strong> This window usually books 2–3 weeks out. 4 people viewing right now.
              </div>
            </div>
          </aside>
        </div>

      </div>

      {showGallery && <GalleryModal images={room.images} start={galleryIdx} onClose={() => setShowGallery(false)} />}

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 28px 24px", display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", flexWrap: "wrap", gap: 12 }}>
          <div>© 2026 D&apos; Lux Homes · Metro Manila, PH</div>
          <div>Made with care for rest.</div>
        </div>
      </footer>
    </div>
  );
}
