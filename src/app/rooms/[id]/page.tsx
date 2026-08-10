"use client";

import { useState, useEffect, use, useRef, Suspense, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import SiteHeader from "@/components/SiteHeader";
import { getMyBookingIds } from "@/lib/booking-store";
import { mockRooms } from "@/lib/mock-data";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { useGetBlockedDatesQuery } from "@/redux/api/blockedDatesApi";
import { useGetActivePromotionsQuery } from "@/redux/api/promotionsApi";
import type { ActivePromotion, PromoStayType } from "@/redux/api/promotionsApi";
import {
  ALL_STAY_TYPES, STAY_TYPE_LABELS, baseRateFor, expiryNoteShort, isEnforceable,
  discountBadgeText, offerPriceFor, pesoAmount, promoCoversStay, promoDiscountOn, scopedStayTypes,
} from "@/lib/promo-offer";
import { havenToRoom } from "@/lib/haven-adapter";
import { stayTotal, isWeekendOrHoliday, extraPaxFee, bundleNightlyRate, BUNDLE_TWOWEEK_NIGHTS, BUNDLE_MONTH_NIGHTS, BUNDLE_EXTRA_PAX_SURCHARGE } from "@/lib/pricing";
import { useCalendarRules } from "@/lib/useCalendarRules";
import type { Room } from "@/types";

// ── Inline SVG icons ───────────────────────────────────────────
function IcoChevLeft() { return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoChevLeftLg() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>; }
function IcoChevRightLg() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>; }
function IcoStar({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg>; }
function IcoMapPin() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>; }
function IcoUsers() { return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function IcoHeart({ filled }: { filled: boolean }) { return <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>; }
function IcoCheck() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function IcoInfo() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>; }
function IcoSquare() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" /></svg>; }
function IcoX() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function IcoWarning() { return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth={2} strokeLinecap="round" /><circle cx="12" cy="17" r="1" fill="#fff" /></svg>; }
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

// Fallback windows (mock mode / haven with no configured times). Match the
// official D'Lux rate card; live havens override these via room.windows.
const FALLBACK_WINDOWS = [
  { stayType: "10", checkIn: "7:00 AM", checkOut: "5:00 PM", label: "Daycation" },
  { stayType: "10", checkIn: "7:00 PM", checkOut: "5:00 AM", label: "Nightcation" },
  { stayType: "21", checkIn: "7:00 PM", checkOut: "4:00 PM", label: "Overnight" },
];

type Window = typeof FALLBACK_WINDOWS[0];
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
  // Build from LOCAL parts — toISOString() shifts the date back a day in +UTC
  // zones (PH), so clicking the 18th would store the 17th.
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
// Drop the "D'Lux Homes —" brand prefix from an in-page title. The header already
// shows the brand, so repeating it in the H1 just makes the name long. Tolerates
// the curly apostrophe (’) and em/en dashes used in the stored haven name.
function shortHavenName(name: string): string {
  return name.replace(/^\s*D[’‘'`]?\s*Lux\s*Homes\s*[—–-]\s*/i, "").trim() || name;
}

// Booking-card step (accordion). The active step shows its controls; finished
// steps collapse to a tappable summary with a check, so guests move 1 → 2 → 3.
function CardStep({ n, title, active, done, summary, onOpen, children }: {
  n: number; title: string; active: boolean; done: boolean; summary?: string; onOpen: () => void; children: ReactNode;
}) {
  return (
    <div>
      <button type="button" onClick={() => { if (!active) onOpen(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: active ? 11 : 0, background: "none", border: "none", padding: 0, cursor: active ? "default" : "pointer", textAlign: "left" }}>
        <span style={{ width: 22, height: 22, flex: "none", borderRadius: 7, background: done ? "#B07848" : "#EFE4CE", color: done ? "#fff" : "#8C5A2E", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
          {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : n}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: active || done ? "#1F160E" : "#8B7458", flex: 1 }}>{title}</span>
        {!active && summary && <span style={{ fontSize: 13, color: "#8C5A2E", fontWeight: 600, whiteSpace: "nowrap" }}>{summary}</span>}
        {!active && <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B07848" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>}
      </button>
      {active && children}
    </div>
  );
}

// Promo banner — renders one card per currently active promotion (server has
// already filtered to active + in-window rows). Renders nothing when empty.
// ── Offer-card icons (hand-written inline SVG, as elsewhere on this page) ──
function IcoTagSm() {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z" /><circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" /></svg>;
}
function IcoCheckBold({ size = 12, stroke = 2.6 }: { size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function IcoCross() {
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

// "Works on" chips — the excluded stay types stay visible (dashed) because the
// guest's question is "does this work for me?", which needs the no as much as
// the yes.
function StayTypeChips({ scope, fontSize = 12.5, padding = "6px 12px" }: { scope: PromoStayType[]; fontSize?: number; padding?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {ALL_STAY_TYPES.map((t) => {
        const on = scope.includes(t);
        return (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: on ? "1px solid #E0CEB2" : "1px dashed #D4BE9A", background: on ? "#FFFCF4" : "transparent", borderRadius: 999, padding, fontSize, fontWeight: on ? 500 : 400, color: on ? "#1F160E" : "#8B7458", whiteSpace: "nowrap" }}>
            <span style={{ color: on ? "#15803D" : "#B8A88E", display: "inline-flex" }}>{on ? <IcoCheckBold /> : <IcoCross />}</span>
            {STAY_TYPE_LABELS[t]}
          </span>
        );
      })}
    </div>
  );
}

// Offer card for the room page. Unlike the home page there's no button — the
// booking panel beside/below it is the action — so the card's job is to explain
// that the price the guest is about to see is already the discounted one.
function PromoBanner({ promotions, rates, variant, promoCode = "" }: {
  promotions: ActivePromotion[] | undefined;
  rates: { price10hr: number; price21hr: number };
  variant: "mobile" | "desktop";
  /** ?promo= from the URL — tells us whether a voucher is actually in play. */
  promoCode?: string;
}) {
  if (!promotions || promotions.length === 0) return null;
  const p = promotions[0];
  const { base, unitLabel } = baseRateFor(p, rates);
  const price = offerPriceFor(base, p);
  const savings = Math.max(0, base - price);
  // A promotion with no real discount is an announcement and makes no price
  // claim at all.
  const discounted = isEnforceable(p) && price < base;
  // A voucher only affects the booking panel once its code is in play; until
  // then the card advertises the offer but must not claim it's applied.
  const isVoucherPromo = p.redemption === "voucher" && !!p.discount_code;
  const codeInPlay = isVoucherPromo && promoCode.trim().toUpperCase() === p.discount_code!.toUpperCase();
  const appliedNow = discounted && (!isVoucherPromo || codeInPlay);
  const scope = scopedStayTypes(p);
  const note = expiryNoteShort(p.end_date);
  const badgeText = discountBadgeText(p.discount_type, p.discount_value);

  if (variant === "mobile") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {p.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 11, objectFit: "cover", flex: "none" }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 10, letterSpacing: ".14em", color: "#8C5A2E" }}>SPECIAL OFFER</div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, lineHeight: 1.15, color: "#1F160E", margin: "3px 0 0" }}>{p.title}</h3>
            {p.description && <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "#4A3A2A", margin: "4px 0 0" }}>{p.description}</p>}
          </div>
          {discounted && (
            <span style={{ marginLeft: "auto", flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <span style={{ padding: "4px 9px", fontSize: 11.5, fontWeight: 600, color: "#FFFCF4", background: "#B07848", whiteSpace: "nowrap" }}>{badgeText}</span>
              <span style={{ background: "#E4F3E4", color: "#15803D", fontSize: 11.5, fontWeight: 600, padding: "5px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
                &minus; {pesoAmount(savings)}
              </span>
            </span>
          )}
        </div>

        {scope && <StayTypeChips scope={scope} />}

        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid #EFE4CE" }}>
          <span style={{ color: "#15803D", flex: "none", display: "inline-flex" }}><IcoCheckBold size={14} stroke={2.4} /></span>
          <span style={{ fontSize: 12.5, color: "#4A3A2A" }}>
            {!discounted
              ? "Pick your dates below to book this home."
              : appliedNow
                ? "Already applied to the price below."
                : `Enter code ${p.discount_code} at checkout to get this price.`}
          </span>
          {note && <span style={{ marginLeft: "auto", flex: "none", fontSize: 11.5, fontWeight: 600, color: "#8C5A2E", whiteSpace: "nowrap" }}>{note}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="promo-card" style={{ marginTop: 20, background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 20, padding: 20, display: "grid", gridTemplateColumns: "132px minmax(0, 1fr) auto", gap: 24, alignItems: "center", boxShadow: "0 4px 16px rgba(31,22,14,.05)" }}>
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="promo-card__photo" src={p.image_url} alt="" style={{ width: 132, height: 132, borderRadius: 14, objectFit: "cover" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F3E4CB", color: "#8C5A2E", borderRadius: 999, padding: "5px 11px", fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".14em", whiteSpace: "nowrap" }}>
            <IcoTagSm /> SPECIAL OFFER
          </span>
          {discounted && badgeText && <span style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#FFFCF4", background: "#B07848", whiteSpace: "nowrap" }}>{badgeText}</span>}
          {note && <span style={{ fontSize: 12, fontWeight: 600, color: "#8C5A2E", whiteSpace: "nowrap" }}>{note}</span>}
        </div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-.02em", color: "#1F160E", margin: 0 }}>{p.title}</h3>
        {scope && <StayTypeChips scope={scope} />}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ color: "#15803D", flex: "none", display: "inline-flex" }}><IcoCheckBold size={15} stroke={2.4} /></span>
          <span style={{ fontSize: 13, color: "#4A3A2A" }}>
            {!discounted
              ? "Pick your dates on the right to book this home."
              : appliedNow
                ? isVoucherPromo
                  ? `Code ${p.discount_code} applied — it's in the price on the right.`
                  : "Already applied to the price on the right. No code needed."
                : `Enter code ${p.discount_code} at checkout to get this price.`}
          </span>
        </div>
      </div>
      {discounted && (
        <div className="promo-card__price" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, paddingLeft: 24, borderLeft: "1px solid #EFE4CE" }}>
          <span style={{ fontSize: 12.5, color: "#8B7458", textDecoration: "line-through", whiteSpace: "nowrap" }}>{pesoAmount(base)}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 500, lineHeight: 1, color: "#1F160E" }}>{pesoAmount(price)}</span>
            <span style={{ fontSize: 12.5, color: "#8B7458", whiteSpace: "nowrap" }}>{unitLabel}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E4F3E4", color: "#15803D", borderRadius: 999, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
            <IcoCheckBold size={11} stroke={2.4} /> You save {pesoAmount(savings)}
          </span>
        </div>
      )}
    </div>
  );
}

function RoomDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sp = useSearchParams();
  const promoCode = sp.get("promo") || "";
  // Live haven by id; fall back to a matching mock (legacy ids) or the first
  // property so the single-property storefront always renders.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: havenRes } = useGetHavenByIdQuery(id, { skip: !id || !isUuid });
  const liveHaven = (havenRes as { data?: Record<string, unknown> } | undefined)?.data;
  const room = liveHaven ? havenToRoom(liveHaven) : (mockRooms.find((r) => r.id === id) || mockRooms[0]);

  // Check-in/out windows from the haven's configured times; fall back to the
  // rate-card defaults when a live haven has no times (or in mock mode).
  const liveWindows = (room as Room).windows;
  const windows: Window[] = liveWindows?.length ? (liveWindows as Window[]) : FALLBACK_WINDOWS;


  // Active promotional banner(s) — server already filters to in-window, active rows.
  const { data: activePromotions } = useGetActivePromotionsQuery();

  // Unavailable days for the date picker: owner-set blocked dates + active bookings.
  const { data: blockedRes } = useGetBlockedDatesQuery({ haven_id: id }, { skip: !isUuid });
  const [bookedRanges, setBookedRanges] = useState<{ ci: string; co: string; ciT: string; coT: string }[]>([]);
  useEffect(() => {
    if (!isUuid || !id) return;
    let active = true;
    fetch(`/api/bookings/room/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => {
        if (!active) return;
        const rows = Array.isArray(j?.data) ? j.data : [];
        setBookedRanges(rows.map((b: Record<string, unknown>) => ({
          ci: String(b.check_in_date ?? ""),
          co: String(b.check_out_date ?? ""),
          ciT: String(b.check_in_time ?? "").slice(0, 5),
          coT: String(b.check_out_time ?? "").slice(0, 5),
        })));
      });
    return () => { active = false; };
  }, [isUuid, id]);

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

  // Starts open — the card opens straight to step 2 (date), so the calendar
  // should already be visible instead of requiring an extra click to reveal it.
  const [dateOpen, setDateOpen] = useState(true);
  const [guestOpen, setGuestOpen] = useState(false);
  const [wished, setWished] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingCount, setBookingCount] = useState(0);
  const { data: session, status: authStatus } = useSession();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const signedIn = authStatus === "authenticated";
  useEffect(() => { setBookingCount(getMyBookingIds().length); }, []);

  // `selectedWindow` always holds a real window so every price, label and total
  // below stays defined. `stayChosen` is what tracks whether the GUEST actually
  // picked one — until they do, no option is marked selected, no price is
  // presented as theirs, and Reserve stays blocked. Keeping these separate
  // avoids threading a nullable window through ~20 pricing call sites.
  const [selectedWindow, setSelectedWindow] = useState<Window>(windows[2] ?? windows[0]);
  const [stayPicked, setStayPicked] = useState(false);

  // Which stay window the listing sent us to (?win=0 Daycation, 1 Nightcation,
  // 2 Full stay). Read on the CLIENT after mount — a lazy useState initialiser
  // runs during SSR (no window) and would freeze at null, ignoring the param.
  const [desiredWinIdx, setDesiredWinIdx] = useState<number | null>(null);
  const [winRead, setWinRead] = useState(false);
  const winApplied = useRef(false);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("win");
    const n = raw == null ? NaN : Number(raw);
    setDesiredWinIdx(Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
    setWinRead(true);
  }, []);

  // Apply the requested window once it's known (overrides the Full-stay default).
  useEffect(() => {
    if (!winRead || winApplied.current) return;
    if (desiredWinIdx != null && windows[desiredWinIdx]) setSelectedWindow(windows[desiredWinIdx]);
    winApplied.current = true;
  }, [winRead, desiredWinIdx, windows]);

  // A ?win= deep link means the guest already picked a stay type upstream (the
  // rooms list, a shared link), so that counts as chosen — only a *defaulted*
  // window should leave step 1 unanswered. Derived rather than another setState
  // inside the effect above.
  const stayIndicated = stayPicked || (desiredWinIdx != null && !!windows[desiredWinIdx]);

  // Desktop booking-card guided step (1 stay → 2 date → 3 guests). Starts on
  // step 2 (collapsed step 1) since a stay type is always pre-selected — this
  // way the card opens straight to what the guest actually needs to fill in
  // (the date) instead of showing all 3 stay options every time.
  // Start on step 1, not 2. Opening on "When are you coming?" marked step 1 as
  // already answered and silently committed the guest to Overnight — they never
  // saw that a 10-hour stay existed, or that a choice had been made for them.
  const [cardStep, setCardStep] = useState(1);

  // Keep the selection valid when live windows arrive (mock → backend swap),
  // preferring the originally requested window over the Full-stay default.
  useEffect(() => {
    if (!windows.some((w) => w.checkIn === selectedWindow.checkIn && w.checkOut === selectedWindow.checkOut)) {
      const idx = desiredWinIdx != null && windows[desiredWinIdx] ? desiredWinIdx : 2;
      setSelectedWindow(windows[idx] ?? windows[0]);
    }
  }, [windows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState<Guests>({ adults: 2, children: 0, infants: 0 });
  const [nights, setNights] = useState(1);

  // Overnight (21h) stays can span multiple nights; 10h sessions are always 1.
  const isOvernight = selectedWindow.stayType !== "10";

  // NOTE: `stayNights` and the whole pricing block used to live here, but the
  // night count is now CLAMPED to what the calendar can actually take, which
  // needs the availability helpers below. Both moved to just after
  // `maxNightsFrom()` — search for "Nights, clamped".

  // Normalize any date value (DATE column may arrive as a UTC timestamp) to a
  // local YYYY-MM-DD, then expand ranges into the individual unavailable days.
  const toLocalISO = (v: unknown) => {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // ── Availability ─────────────────────────────────────────────────────────
  // Mirrors createBooking's time-aware check. Bookings occupy TIME, not whole
  // days: a 7am–5pm daycation and a 7pm–5am nightcation share one date. Two
  // stays clash only once each one's cleaning turnover is added — 3 hours after
  // a stay of 20h or more, 2 hours otherwise.
  const isoOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const HOUR = 3600_000;
  const bufferMs = (startMs: number, endMs: number) =>
    (endMs - startMs >= 20 * HOUR ? 3 : 2) * HOUR;
  // "7:00 PM" / "19:00" → minutes since midnight.
  const minutesOf = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t || "").trim());
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const ap = m[3]?.toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + parseInt(m[2], 10);
  };
  const atMs = (iso: string, mins: number, addDays = 0) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + addDays);
    return d.getTime() + mins * 60_000;
  };

  // Owner-blocked ranges (inclusive) genuinely take the whole day.
  const ownerBlocked = (() => {
    const set = new Set<string>();
    (blockedRes?.data || []).forEach((b) => {
      const fromISO = toLocalISO(b.from_date);
      if (!fromISO) return;
      const d = new Date(fromISO + "T00:00:00");
      const end = new Date((toLocalISO(b.to_date) || fromISO) + "T00:00:00");
      for (let g = 0; d <= end && g < 400; g++) { set.add(isoOf(d)); d.setDate(d.getDate() + 1); }
    });
    return set;
  })();

  // Existing stays as real timestamps. A '00:00' checkout means end-of-day.
  const busyIntervals = bookedRanges.flatMap(({ ci, co, ciT, coT }) => {
    const from = toLocalISO(ci);
    const to = toLocalISO(co) || from;
    const s = minutesOf(ciT), e = minutesOf(coT);
    if (!from || s == null || e == null) return [];
    const start = atMs(from, s);
    const end = e === 0 ? atMs(to, 0, 1) : atMs(to, e);
    return end > start ? [{ start, end }] : [];
  });

  // Can this specific window be booked starting on this date, for `forNights`?
  //
  // `forNights` is an EXPLICIT argument, never read from the night-count state.
  // It used to close over `stayNights`, which made a rate's availability depend
  // on the stepper: raising the nights past a booked date dropped Overnight out
  // of the list, which unmounted the stepper itself and left the guest with no
  // way back. Availability must be answerable for any length, independently of
  // what is currently selected.
  const isWindowFreeOn = (iso: string, w: Window, forNights: number) => {
    if (ownerBlocked.has(iso)) return false;
    const ci = minutesOf(w.checkIn), co = minutesOf(w.checkOut);
    if (ci == null || co == null) return true;
    const overnight = w.stayType !== "10";
    const span = overnight ? Math.max(1, Math.floor(forNights || 1)) : 1;
    const ns = atMs(iso, ci);
    // A 10-hour session ending earlier than it starts rolls into the next day
    // (nightcation); an overnight stay runs for `span` nights.
    const ne = overnight ? atMs(iso, co, span) : atMs(iso, co, co <= ci ? 1 : 0);
    return !busyIntervals.some(
      ({ start, end }) => start < ne + bufferMs(ns, ne) && end + bufferMs(start, end) > ns,
    );
  };

  // Longest overnight stay that can actually START on `iso` — 0 when the date
  // can't take even one night. This is what caps the stepper, so an unbookable
  // length can never be entered in the first place.
  const MAX_BOOKABLE_NIGHTS = 60;
  const maxNightsFrom = (iso: string, w: Window) => {
    if (!iso || w.stayType === "10") return 1;
    let n = 0;
    while (n < MAX_BOOKABLE_NIGHTS && isWindowFreeOn(iso, w, n + 1)) n++;
    return n;
  };

  // A rate is offered on a date if it can run there AT ALL (one night for an
  // overnight). How LONG it can run is the stepper's business, not the rate
  // list's — conflating the two is what made the option vanish.
  const availableWindowsOn = (iso: string) => (iso ? windows.filter((w) => isWindowFreeOn(iso, w, 1)) : []);

  // ── Nights, clamped ──────────────────────────────────────────────────────
  // `nights` is what the guest clicked; `stayNights` is what is bookable. The
  // clamp is DERIVED rather than pushed back into state by an effect, so there
  // is no render where the two disagree and no setState-in-effect cascade.
  const maxNights = isOvernight ? maxNightsFrom(date, selectedWindow) : 1;
  const stayNights = isOvernight ? Math.min(Math.max(1, nights), Math.max(1, maxNights)) : 1;
  const nightsCapped = isOvernight && !!date && maxNights > 0 && nights > maxNights;

  // D'Lux: rate depends on stay type + whether each night is a weekend/holiday.
  // Base rate covers the first `basePax` (2) guests; each guest beyond that adds
  // a per-pax fee CHARGED PER NIGHT. Only adults + young adults are chargeable —
  // "Children (7 under)" are exempt from the fee (but still count toward the
  // 4-pax max). No cleaning or service fee.
  // Owner-editable weekend/holiday calendar (System → Settings in the admin
  // portal); falls back to Fri/Sat + built-in PH holidays if unreachable.
  const calendarRules = useCalendarRules();
  const isWeekendRate = isWeekendOrHoliday(date, calendarRules);
  // Counted pax must be resolved BEFORE the price: on a bundle stay, having any
  // extra pax raises the nightly bundle rate itself (not just the pax line).
  const feePax = guests.adults + guests.children; // adults + young adults; excludes 7-under
  const extraPaxCount = Math.max(0, feePax - room.basePax);
  const hasExtraPax = extraPaxCount > 0;
  const basePrice = stayTotal(selectedWindow.stayType, date, stayNights, room, calendarRules, hasExtraPax);
  // Length-of-stay bundle discount (5/12/20+ nights, Overnight only) — null if
  // this stay doesn't qualify or the haven hasn't configured that tier. Already
  // includes the extra-pax bump, so it's the rate actually charged.
  const bundleRate = selectedWindow.stayType === "10" ? undefined : bundleNightlyRate(stayNights, date, room, calendarRules, hasExtraPax);
  const bundleLabel = bundleRate == null ? null
    : stayNights >= BUNDLE_MONTH_NIGHTS ? "Monthly rate"
    : stayNights >= BUNDLE_TWOWEEK_NIGHTS ? "Two-week rate"
    : "Weekly rate";
  const paxFee = extraPaxFee(feePax, room.basePax, room.additionalPaxFee, stayNights);
  const total = basePrice + paxFee;

  // What the calendar greys out depends on whether a rate is already in play.
  //
  //  • Rate known (arrived on ?win=, or picked one) → show THAT rate's nights.
  //    Someone who clicked "Nightcation" wants the nights a nightcation can
  //    actually run; leaving a date open because the daycation happens to be
  //    free would send them to a day that can't give them what they came for.
  //  • No rate yet → close a date only when EVERY rate is taken, so the guest
  //    can pick a day first and then see what it offers.
  //
  // Always asked for ONE night, matching the legend ("can't take an overnight").
  // Asking for the currently-selected length instead meant a 3-night selection
  // greyed out every date that couldn't host 3 nights — a rule the guest could
  // neither see nor change once the stepper was gone.
  const calendarWindow = stayIndicated ? selectedWindow : null;
  const isDateClosed = (iso: string) =>
    calendarWindow ? !isWindowFreeOn(iso, calendarWindow, 1) : availableWindowsOn(iso).length === 0;

  const blockedDates = (() => {
    const set = new Set<string>(ownerBlocked);
    if (busyIntervals.length > 0) {
      // A candidate check-in can only clash with a stay it reaches, so test the
      // days around each booking — back by the stay length for multi-night.
      const reach = Math.max(1, stayNights) + 1;
      busyIntervals.forEach(({ start, end }) => {
        const first = new Date(start); first.setDate(first.getDate() - reach);
        const last = new Date(end); last.setDate(last.getDate() + 1);
        for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
          const iso = isoOf(d);
          if (!set.has(iso) && isDateClosed(iso)) set.add(iso);
        }
      });
    }
    return Array.from(set);
  })();

  // Rates offered for the chosen date, and whether the current pick survives a
  // date change (a window free on Aug 4 may be taken on Aug 5).
  const availableWindows = availableWindowsOn(date);
  const pickedStillFree = !date || availableWindows.some(
    (w) => w.checkIn === selectedWindow.checkIn && w.checkOut === selectedWindow.checkOut,
  );

  // A rate only counts as chosen if it is ALSO still bookable on the chosen
  // date. Arriving on ?win=1 (Nightcation) and landing on a date where only the
  // daycation is free otherwise left the header, the totals and the CTA all
  // asserting "Nightcation" while step 2 refused to offer it.
  const stayChosen = stayIndicated && pickedStillFree;
  // A stay type is now an explicit choice, so it gates Reserve alongside the
  // date — otherwise a guest could reserve having never opened step 1 and get
  // whatever the default happened to be.
  // `pickedStillFree` guards the case where the rate was chosen and then the
  // night count changed, making that window overlap an existing booking.
  const canProceed = stayChosen && date && guests.adults >= 1;
  // Shown before a stay type is picked — advertising one option's rate as "the"
  // price would be the same silent default we just removed.
  const fromPrice = Math.min(room.price10hr, room.price21hr);

  // The offer the price panel is allowed to act on. The card above advertises
  // whatever promo is running; this narrows to one that actually covers the
  // stay type the guest picked, so an overnight-only promo never discounts a
  // Daycation quote. Only meaningful once a stay type is chosen.
  const stayRate = selectedWindow.stayType === "10" ? room.price10hr : room.price21hr;
  // Is this voucher's code actually in play for this visit? Reserve only
  // forwards ?promo= to checkout when it arrived in the URL, so a voucher the
  // guest hasn't opted into must NOT move the price here — showing ₱1,199 and
  // then charging ₱1,499 at checkout is the worst possible outcome.
  const voucherActive = (p: ActivePromotion) =>
    !!p.discount_code && promoCode.trim().toUpperCase() === p.discount_code.toUpperCase();
  const livePromo = stayChosen
    ? (activePromotions || []).find(
        (p) => isEnforceable(p)
          && promoCoversStay(p, selectedWindow.stayType === "10" ? "10" : "21")
          && offerPriceFor(stayRate, p) < stayRate
          && (p.redemption === "automatic" || voucherActive(p)),
      )
    : undefined;
  const offerRate = livePromo ? offerPriceFor(stayRate, livePromo) : stayRate;
  const offerSaving = stayRate - offerRate;
  const headlinePrice = stayChosen ? offerRate : fromPrice;

  // ── Promo code entry ──────────────────────────────────────────────────
  // Checkout owns the authoritative apply (it re-validates with the session and
  // is where the money is computed). This is the same endpoint, so the guest can
  // see the code land before committing instead of discovering it two screens
  // later. `?promo=` carries it to checkout via handleReserve.
  type EnteredDiscount = { code: string; name: string; discount_amount: number };
  const [promoInput, setPromoInput] = useState(promoCode);
  const [enteredPromo, setEnteredPromo] = useState<EnteredDiscount | null>(null);
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "error">("idle");
  const [promoError, setPromoError] = useState("");

  const applyPromoCode = async (raw?: string) => {
    const code = (raw ?? promoInput).trim();
    if (!code) return;
    setPromoStatus("checking");
    setPromoError("");
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, haven_id: isUuid ? id : null, amount: total, user_id: sessionUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setEnteredPromo(null);
        setPromoStatus("error");
        setPromoError(json?.error || "This promo code is invalid or has expired.");
        return;
      }
      setEnteredPromo({ code: json.data.code, name: json.data.name, discount_amount: Number(json.data.discount_amount) || 0 });
      setPromoStatus("idle");
    } catch {
      setEnteredPromo(null);
      setPromoStatus("error");
      setPromoError("Network error. Please try again.");
    }
  };
  const clearPromoCode = () => {
    setEnteredPromo(null); setPromoInput(""); setPromoStatus("idle"); setPromoError("");
  };
  // The code the guest is actually travelling to checkout with.
  const effectivePromoCode = enteredPromo?.code || promoCode;

  // One discount, applied to the total — mirroring checkout, where a code the
  // guest entered wins over an automatic promotion and the two never stack.
  // Computed on `total` (not the nightly rate) so this page and checkout agree
  // to the peso on multi-night stays and bookings with extra-guest fees.
  const promoDiscount = enteredPromo
    ? Math.min(total, enteredPromo.discount_amount)
    : livePromo
      ? promoDiscountOn(livePromo, total)
      : 0;
  const payableTotal = Math.max(0, total - promoDiscount);
  const promoLabel = enteredPromo ? enteredPromo.code : livePromo?.title ?? "";

  const handleReserve = () => {
    const params = new URLSearchParams({
      roomId: room.id,
      stayType: selectedWindow.stayType,
      checkIn: selectedWindow.checkIn,
      checkOut: selectedWindow.checkOut,
      windowLabel: selectedWindow.label,
      date,
      adults: String(guests.adults),
      children: String(guests.children),
      infants: String(guests.infants),
      nights: String(stayNights),
    });
    if (effectivePromoCode) params.set("promo", effectivePromoCode);
    window.location.href = `/checkout?${params.toString()}`;
  };

  return (
    <div className="page-enter" style={{ backgroundColor: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* HEADER (desktop only — mobile uses its own header inside .rd-mobile) */}
      <div className="rd-deskhdr">
        <SiteHeader bookHref="#book" backHref="/rooms" backLabel="Back" />
      </div>
      <style>{`
        .save-btn{transition:background 0.18s,border-color 0.18s,color 0.18s,transform 0.18s,box-shadow 0.18s}
        .save-btn:hover{background:var(--dlux-accent)!important;border-color:var(--dlux-accent)!important;color:#fff!important;transform:scale(1.05);box-shadow:0 4px 14px rgba(176,120,72,0.35)}
        .rd-mobile { display: none; }
        @media (max-width: 860px) {
          .rd-deskonly, .rd-deskhdr { display: none !important; }
          .rd-mobile { display: flex !important; flex-direction: column; }
        }
      `}</style>

      {/* ═══════════ MOBILE ROOM & BOOKING (D'Lux Mobile Guest View) ═══════════ */}
      <div className="rd-mobile" style={{ background: "#F6EFE2", minHeight: "100vh" }}>
        <style>{`.bk-opt:active{border-color:#B07848} @keyframes gOverlay{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:scale(1)}} .g2c-row:active{background:#F3EEE2}`}</style>

        {/* SITE HEADER — Guest Header 2c: clean bar, logo + labeled Menu */}
        <div style={{ flex: "none", position: "sticky", top: 0, zIndex: 20, height: 62, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "#FAF7F1", borderBottom: "1px solid #ECE5D4" }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", minWidth: 0, textDecoration: "none", color: "inherit" }}>
            <Image src="/logo-guest.png" alt="D'Lux Homes" width={1056} height={232} style={{ width: "auto", maxWidth: "100%", height: 30, objectFit: "contain", filter: "invert(1)" }} />
          </Link>
          <button onClick={() => setMenuOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "transparent", border: 0, cursor: "pointer", color: "#1F160E", font: "inherit", fontSize: 14.5, fontWeight: 600 }}>
            Menu
            <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="1" y1="2" x2="21" y2="2" /><line x1="1" y1="8" x2="21" y2="8" /><line x1="1" y1="14" x2="21" y2="14" /></svg>
          </button>
        </div>

        {/* MOBILE MENU — Guest Header 2c: calm full-screen list */}
        {menuOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#FAF7F1", display: "flex", flexDirection: "column", animation: "gOverlay .28s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 4px" }}>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: 2, color: "#9A6840" }}>MENU</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid #E1D8C6", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: "#1F160E" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div style={{ flex: 1, padding: "10px 24px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
              <Link href="/rooms" onClick={() => setMenuOpen(false)} className="g2c-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: "1px solid #ECE5D4", color: "#1F160E", fontFamily: "'Instrument Serif', serif", fontSize: 26, textDecoration: "none" }}>
                Browse homes
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8754A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
              <Link href="/location" onClick={() => setMenuOpen(false)} className="g2c-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: "1px solid #ECE5D4", color: "#1F160E", fontFamily: "'Instrument Serif', serif", fontSize: 26, textDecoration: "none" }}>
                Location
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8754A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
              <Link href="/my-bookings" onClick={() => setMenuOpen(false)} className="g2c-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: "1px solid #ECE5D4", color: "#1F160E", fontFamily: "'Instrument Serif', serif", fontSize: 26, textDecoration: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>My bookings
                  {bookingCount > 0 && <span style={{ minWidth: 24, height: 24, padding: "0 8px", background: "#B8754A", color: "#FAF7F1", fontSize: 13, fontWeight: 600, fontFamily: "'Geist Mono', monospace", display: "grid", placeItems: "center", borderRadius: 12 }}>{bookingCount}</span>}
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8754A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
              <Link href={signedIn ? "/my-bookings" : "/login"} onClick={() => setMenuOpen(false)} className="g2c-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: "1px solid #ECE5D4", color: "#1F160E", fontFamily: "'Instrument Serif', serif", fontSize: 26, textDecoration: "none" }}>
                {signedIn ? "My account" : "Sign in"}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8754A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>

              <div style={{ marginTop: "auto", paddingBottom: 22 }}>
                <a href="mailto:homesdlux@gmail.com" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#6B6358", padding: "16px 0", textDecoration: "none" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B8754A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  Message us · homesdlux@gmail.com
                </a>
                {signedIn && (
                  <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/rooms" }); }} style={{ display: "block", background: "transparent", border: "none", padding: "4px 0 14px", cursor: "pointer", color: "#A8492F", fontSize: 14, fontFamily: "inherit" }}>Sign out</button>
                )}
                <button onClick={() => { setMenuOpen(false); document.getElementById("mbook")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#B8754A", color: "#FAF7F1", border: 0, padding: 16, borderRadius: 14, font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                  Book now
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM BOOK-NOW BAR — always in thumb reach; reserves directly once a
            date is picked, otherwise jumps to the date step instead of the top
            of the card so guests don't have to scroll past steps they already
            finished. */}
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "#FAF7F1", borderTop: "1px solid #ECE5D4", padding: "14px 18px calc(16px + env(safe-area-inset-bottom))", boxShadow: "0 -12px 30px -18px rgba(20,15,9,.35)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: "none" }}>
            <div style={{ fontSize: 10.5, color: "#8B7458" }}>{canProceed ? "Total" : "From"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em" }}>{peso(canProceed ? total : stayChosen ? (selectedWindow.stayType === "10" ? room.price10hr : room.price21hr) : fromPrice)}</div>
          </div>
          <button
            onClick={() => {
              if (canProceed) { handleReserve(); return; }
              // Jump to whichever step is actually outstanding: the date comes
              // first now, and the rate list is only meaningful once it's set.
              if (!date) { setCardStep(1); setDateOpen(true); setGuestOpen(false); }
              else { setCardStep(2); setDateOpen(false); setGuestOpen(false); }
              document.getElementById("mbook")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#B8754A", color: "#FAF7F1", border: 0, padding: 16, borderRadius: 14, font: "inherit", fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
            {canProceed ? "Reserve" : !date ? "Pick a date" : "Choose your rate"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, paddingBottom: 96 }}>
          <div style={{ padding: "16px 16px 0" }}>
            {/* hero */}
            <div onClick={() => setShowGallery(true)} style={{ position: "relative", height: 204, borderRadius: 20, overflow: "hidden", background: "#111", cursor: "pointer" }}>
              <Image src={room.images[galleryIdx]} alt="" fill unoptimized style={{ objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.5), transparent 50%)" }} />
              <div style={{ position: "absolute", bottom: 13, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5 }}>
                {room.images.map((_, i) => (
                  <button key={i} aria-label={`Photo ${i + 1}`} onClick={(e) => { e.stopPropagation(); goTo(i, i > galleryIdx ? "right" : "left"); }} style={{ width: i === galleryIdx ? 22 : 6, height: 6, borderRadius: 99, background: i === galleryIdx ? "#fff" : "rgba(255,255,255,.45)", border: "none", padding: 0, cursor: "pointer" }} />
                ))}
              </div>
              <div style={{ position: "absolute", bottom: 11, right: 11, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, background: "rgba(31,22,14,.5)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 11.5, fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" /></svg> {room.images.length} photos
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <PromoBanner promotions={activePromotions} rates={room} variant="mobile" promoCode={promoCode} />
            </div>

            {/* title */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 25, lineHeight: 1.1, letterSpacing: "-.02em", margin: 0 }}>{shortHavenName(room.name)}</h1>
              <button onClick={() => setWished((w) => !w)} style={{ flex: "none", width: 40, height: 40, borderRadius: "50%", border: "1px solid #E0CEB2", background: "#FFFCF4", display: "grid", placeItems: "center", cursor: "pointer", color: wished ? "#B07848" : "#1F160E" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill={wished ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12.5, color: "#4A3A2A", marginTop: 10 }}>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9 12 2" /></svg> {room.rating} · {room.reviewCount}</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg> Up to {room.capacity}</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> Quezon City</span>
            </div>
          </div>

          {/* BOOKING MODULE CARD */}
          <div id="mbook" style={{ scrollMarginTop: 72, margin: "18px 16px 0", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 20, boxShadow: "0 4px 16px rgba(31,22,14,.05)", overflow: "hidden" }}>
            {/* price header */}
            <div style={{ padding: "18px 18px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #EFE4CE" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  {!stayChosen && <span style={{ fontSize: 13, color: "#8B7458" }}>From</span>}
                  {livePromo && <span style={{ fontSize: 13, color: "#8B7458", textDecoration: "line-through" }}>{peso(stayRate)}</span>}
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500, letterSpacing: "-.02em" }}>{peso(headlinePrice)}</span>
                  <span style={{ fontSize: 13, color: "#8B7458", whiteSpace: "nowrap" }}>{stayChosen ? (isOvernight ? "/ night" : "/ session") : ""}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8B7458", marginTop: 3 }}>{!stayChosen ? "Choose how you'd like to stay" : `${livePromo ? "Offer price · " : ""}${isOvernight ? "Overnight · 7 PM – 4 PM next day" : `${selectedWindow.label} · 10 hours`}`}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#E4F3E4", color: "#15803D", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap", flex: "none" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> No charge today
              </span>
            </div>

            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 1. DATE — chosen first: availability is per date. */}
              <CardStep n={1} title="When are you coming?" active={cardStep === 1} done={!!date && cardStep > 1} summary={date ? formatDateLong(date) : undefined} onOpen={() => { setCardStep(1); setDateOpen(true); setGuestOpen(false); }}>
                <button onClick={() => { setDateOpen(!dateOpen); setGuestOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: dateOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: date ? "#1F160E" : "#8B7458", whiteSpace: "nowrap" }}>{date ? formatDateLong(date) : "Choose your date"}</span>
                  </span>
                  <span style={{ display: "inline-flex", transition: "transform .25s", transform: dateOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                {dateOpen && (
                  <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: 14 }}>
                    <Calendar selected={date} blocked={blockedDates} onSelect={(d) => { setDate(d); setDateOpen(false); setStayPicked(false); setCardStep(2); }} />
                    <div style={{ fontSize: 11, color: "#9B8B73", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1F160E", display: "inline-block" }} />{calendarWindow ? `Crossed-out days can't take a ${calendarWindow.label.toLowerCase()}.` : "Crossed-out days are fully booked."}</div>
                  </div>
                )}
              </CardStep>

              {/* 2. RATE — only what is bookable on that date. */}
              <CardStep n={2} title="Choose your rate" active={cardStep === 2} done={stayChosen && cardStep > 2} summary={stayChosen ? `${selectedWindow.label} · ${peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}` : undefined} onOpen={() => { setCardStep(2); setDateOpen(false); setGuestOpen(false); }}>
                {!date ? (
                  <div style={{ fontSize: 13, color: "#8B7458", padding: "10px 2px" }}>
                    Pick a date first — the rates open on that day will appear here.
                  </div>
                ) : availableWindows.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#A8492F", padding: "10px 2px" }}>
                    Fully booked on {formatDateLong(date)}. Please choose another date.
                  </div>
                ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ fontSize: 11.5, color: "#8B7458", marginBottom: 1 }}>
                    Rates for <strong style={{ color: "#1F160E", fontWeight: 600 }}>{formatDateLong(date)}</strong>
                  </div>
                  {/* Every rate stays listed — a taken one is shown disabled with
                      the reason. Dropping it from the list made it look like a
                      glitch and hid why it went. */}
                  {windows.map((w) => {
                    const free = isWindowFreeOn(date, w, 1);
                    const active = free && stayChosen && selectedWindow.checkIn === w.checkIn && selectedWindow.checkOut === w.checkOut;
                    const price = w.stayType === "10" ? room.price10hr : room.price21hr;
                    const i = windows.indexOf(w); // icon follows the original order
                    const ic = i === 0
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                      : i === 1
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9v11M2 13h18a2 2 0 0 1 2 2v5M2 16h20" /><path d="M5 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></svg>;
                    return (
                      <button key={i} disabled={!free} onClick={() => {
                        // A 10-hour session needs no night count, so it skips
                        // ahead to the guests.
                        setSelectedWindow(w); setStayPicked(true); setDateOpen(false);
                        if (w.stayType === "10") { setCardStep(3); setGuestOpen(true); }
                      }} className="bk-opt" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", cursor: free ? "pointer" : "not-allowed", borderRadius: 14, width: "100%", fontFamily: "inherit", opacity: free ? 1 : 0.55, background: active ? "#FBF4E6" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                        <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", color: active ? "#fff" : "#8C5A2E", background: active ? "#B07848" : "#EFE4CE" }}>{ic}</span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#1F160E", textDecoration: free ? "none" : "line-through" }}>{w.label}</span>
                          <span style={{ display: "block", fontSize: 11.5, color: free ? "#8B7458" : "#A8492F", marginTop: 2 }}>{free ? `${w.checkIn} – ${w.checkOut}` : "Already booked on this date"}</span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1F160E" }}>{peso(price)}</span>
                          <span style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>{active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                )}
                {/* Nights belong to the overnight rate, so they live here rather
                    than in the date step.
                    Gated on stayIndicated (the guest PICKED overnight), never on
                    stayChosen — tying it to validity let a night count unmount
                    the only control that could undo it. */}
                {stayIndicated && isOvernight && date && maxNights > 0 && (
                  <>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E0CEB2", borderRadius: 14, padding: "12px 16px", background: "#FAF7F1" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>How many nights?</div>
                      <div style={{ fontSize: 11.5, color: "#8B7458", marginTop: 1 }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)} × {stayNights} night{stayNights > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <button aria-label="Fewer nights" onClick={() => setNights(Math.max(1, stayNights - 1))} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: stayNights > 1 ? "pointer" : "not-allowed", opacity: stayNights > 1 ? 1 : 0.4 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                      <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{stayNights}</span>
                      <button aria-label="More nights" disabled={stayNights >= maxNights} onClick={() => setNights(Math.min(maxNights, stayNights + 1))} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: stayNights < maxNights ? "pointer" : "not-allowed", opacity: stayNights < maxNights ? 1 : 0.4 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                    </div>
                  </div>
                  {/* Say WHY the + stopped, rather than letting it just not respond. */}
                  {stayNights >= maxNights && (
                    <div style={{ fontSize: 11.5, color: nightsCapped ? "#A8492F" : "#8B7458", marginTop: 7, lineHeight: 1.45 }}>
                      {maxNights === 1
                        ? `Only 1 night is free from ${formatDateLong(date)} — the next night is already booked.`
                        : `Up to ${maxNights} nights from ${formatDateLong(date)} — night ${maxNights + 1} is already booked.`}
                      {nightsCapped ? " We've adjusted your stay to fit." : ""}
                    </div>
                  )}
                  <button onClick={() => { setCardStep(3); setGuestOpen(true); setDateOpen(false); }} style={{ marginTop: 10, width: "100%", padding: "13px 16px", borderRadius: 14, border: "none", background: "#B07848", color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>Continue &rarr;</button>
                  </>
                )}
              </CardStep>

              {/* 3. GUESTS */}
              <CardStep n={3} title="Who’s coming?" active={cardStep === 3} done={false} summary={`${guests.adults + guests.children + guests.infants} guest${guests.adults + guests.children + guests.infants > 1 ? "s" : ""}`} onOpen={() => { setCardStep(3); setGuestOpen(true); setDateOpen(false); }}>
                <button onClick={() => { setGuestOpen(!guestOpen); setDateOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: guestOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: "#1F160E", whiteSpace: "nowrap" }}>{guests.adults + guests.children + guests.infants} guest{guests.adults + guests.children + guests.infants > 1 ? "s" : ""}</span>
                  </span>
                  <span style={{ display: "inline-flex", transition: "transform .25s", transform: guestOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                {guestOpen && (() => {
                  const counted = guests.adults + guests.children;
                  const maxed = counted >= 4;
                  const stepStyle = (enabled: boolean): CSSProperties => ({ width: 32, height: 32, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4 });
                  const minus = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
                  const plus = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
                  return (
                    <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: "4px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                        <div><div style={{ fontWeight: 600, fontSize: 14 }}>Adults</div><div style={{ fontSize: 11.5, color: "#8B7458" }}>Age 18+</div></div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => setGuests({ ...guests, adults: Math.max(1, guests.adults - 1) })} style={stepStyle(guests.adults > 1)}>{minus}</button>
                          <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.adults}</span>
                          <button onClick={() => { if (!maxed) setGuests({ ...guests, adults: guests.adults + 1 }); }} style={stepStyle(!maxed)}>{plus}</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                        <div><div style={{ fontWeight: 600, fontSize: 14 }}>Teens</div><div style={{ fontSize: 11.5, color: "#8B7458" }}>Age 7&ndash;17</div></div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => setGuests({ ...guests, children: Math.max(0, guests.children - 1) })} style={stepStyle(guests.children > 0)}>{minus}</button>
                          <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.children}</span>
                          <button onClick={() => { if (!maxed) setGuests({ ...guests, children: guests.children + 1 }); }} style={stepStyle(!maxed)}>{plus}</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                        <div><div style={{ fontWeight: 600, fontSize: 14 }}>Little ones</div><div style={{ fontSize: 11.5, color: "#8B7458" }}>7 &amp; under · free</div></div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => setGuests({ ...guests, infants: Math.max(0, guests.infants - 1) })} style={stepStyle(guests.infants > 0)}>{minus}</button>
                          <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.infants}</span>
                          <button onClick={() => { if (guests.infants < 4) setGuests({ ...guests, infants: guests.infants + 1 }); }} style={stepStyle(guests.infants < 4)}>{plus}</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#9B8B73", padding: "0 0 12px", lineHeight: 1.5 }}>Rate covers 2 guests. Each extra adult or teen is {peso(room.additionalPaxFee)} per night (up to 4). Little ones stay free, up to 4. For 5+, message us on <a href="https://www.facebook.com/messages/t/270893736109969" target="_blank" rel="noopener" style={{ color: "#B07848", fontWeight: 600 }}>Facebook</a>.</div>
                    </div>
                  );
                })()}
              </CardStep>

              {/* price summary — needs a rate, not just a date, or it quotes a
                  total for a stay type the guest hasn't picked (or can't have). */}
              {date && stayChosen && (
                <div style={{ borderTop: "1px solid #EFE4CE", paddingTop: 15, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#4A3A2A" }}><span style={{ whiteSpace: "nowrap" }}>{selectedWindow.label} · {isOvernight ? `${stayNights} night${stayNights > 1 ? "s" : ""}${bundleLabel ? ` · ${bundleLabel}` : ""}` : (isWeekendRate ? "Weekend/Holiday" : "Weekday")}</span><span>{peso(basePrice)}</span></div>
                  {/* Bundle stays quote one flat nightly rate, so show it —
                      otherwise a guest can't tell why the room total moved when
                      they added a 3rd guest. */}
                  {bundleRate != null && <div style={{ fontSize: 11.5, color: "#9B8B73", marginTop: -4 }}>{peso(bundleRate)}/night{hasExtraPax ? ` · includes ${peso(BUNDLE_EXTRA_PAX_SURCHARGE)} extra-guest rate` : ""}</div>}
                  {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra guests · {extraPaxCount} × {peso(room.additionalPaxFee)}{stayNights > 1 ? ` × ${stayNights} nights` : ""}</span><span>{peso(paxFee)}</span></div>}
                  {promoDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#1A7A4C" }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{promoLabel}</span><span style={{ flex: "none" }}>&minus;{peso(promoDiscount)}</span></div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, paddingTop: 9, borderTop: "1px solid #EFE4CE" }}><span>Total</span><span>{peso(payableTotal)}</span></div>
                  {/* PROMO CODE — mirrors the desktop panel; checkout re-validates. */}
                  {enteredPromo ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#EAF7EF", border: "1px solid #BCE7CC", borderRadius: 12, padding: "10px 14px", marginTop: 4 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>{enteredPromo.code} applied</div>
                        <div style={{ fontSize: 11.5, color: "#3A6B4C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enteredPromo.name}</div>
                      </div>
                      <button type="button" onClick={clearPromoCode} style={{ fontSize: 12, fontWeight: 600, color: "#166534", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", flex: "none", fontFamily: "inherit" }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          aria-label="Promo code"
                          value={promoInput}
                          onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); if (promoStatus === "error") { setPromoStatus("idle"); setPromoError(""); } }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromoCode(); } }}
                          placeholder="Promo code"
                          style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", color: "#1F160E", background: "#FFFCF4", borderRadius: 12, border: `1.5px solid ${promoStatus === "error" ? "#ef4444" : "#E0CEB2"}`, outline: "none" }}
                        />
                        <button type="button" onClick={() => applyPromoCode()} disabled={!promoInput.trim() || promoStatus === "checking"}
                          style={{ padding: "10px 16px", borderRadius: 12, background: "#1F160E", color: "#F6EFE2", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "none", fontFamily: "inherit", opacity: (!promoInput.trim() || promoStatus === "checking") ? 0.5 : 1 }}>
                          {promoStatus === "checking" ? "Checking…" : "Apply"}
                        </button>
                      </div>
                      {promoStatus === "error" && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 6 }}>{promoError}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* GOOD TO KNOW */}
          <div style={{ padding: "24px 16px 0" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 500, margin: "0 0 14px", letterSpacing: "-.01em" }}>Good to know</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {room.houseRules.map((h) => {
                const ic = /smok|vap/i.test(h)
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22" /><path d="M16 9c1.7.3 3 1.8 3 3.5V14" /><path d="M8 13H3v2h10" /></svg>
                  : /pet|dog|cat|animal/i.test(h)
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="4" r="1.4" fill="currentColor" stroke="none" /><path d="M11 18c-3.5 0-6-2.5-4.5-5.5C7.5 10.5 9 10 11 10s3.5.5 4.5 2.5C17 15.5 14.5 18 11 18z" fill="currentColor" stroke="none" /><line x1="3" y1="21" x2="21" y2="3" strokeWidth="2.4" /></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
                return (
                  <div key={h} style={{ display: "flex", alignItems: "center", gap: 13, fontSize: 13.5, fontWeight: 600, color: "#7a3a00", background: "#FCF3E2", border: "1px solid #F0D6A8", borderLeft: "4px solid #E2A23C", borderRadius: 13, padding: "13px 16px" }}>
                    <span style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", background: "#FBEACB", color: "#C98421", display: "grid", placeItems: "center" }}>{ic}</span>
                    {h}
                  </div>
                );
              })}
            </div>
          </div>

          {/* WHAT'S INSIDE */}
          <div style={{ padding: "24px 16px 0" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 500, margin: "0 0 14px", letterSpacing: "-.01em" }}>What&rsquo;s inside</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
              {AMENITIES.map((a) => (
                <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "#EFE4CE", display: "grid", placeItems: "center", color: "#8C5A2E" }}><a.icon /></div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ON THE HOUSE */}
          <div style={{ padding: "24px 16px 0" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-.01em" }}>On the house</h2>
            <p style={{ fontSize: 13, color: "#8B7458", margin: "0 0 13px" }}>Free welcome pack with every booking.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {WELCOME_PACK.map((w) => (
                <div key={w} style={{ padding: "8px 13px", background: "#EFE4CE", borderRadius: 10, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: "#8C5A2E", display: "inline-flex" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span> {w}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 28 }} />
        </div>
      </div>

      <div className="rd-wrap rd-deskonly" style={{ maxWidth: 1320, margin: "0 auto", padding: "20px 28px 60px" }}>

        {/* TITLE ROW */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 24 }}>
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 400, letterSpacing: "-.03em", lineHeight: 0.98, margin: 0 }}>{shortHavenName(room.name)}</h1>
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
          @media (max-width: 900px) {
            .rd-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
            .rd-book { position: static !important; top: auto !important; margin-top: 28px; }
            .rd-3col { grid-template-columns: 1fr !important; }
            .rd-2col { grid-template-columns: 1fr !important; }
            /* Offer card stacks: photo full width, then copy, then the price
               column left-aligned with its divider removed. */
            .promo-card { grid-template-columns: 1fr !important; gap: 18px !important; }
            .promo-card__photo { width: 100% !important; height: 200px !important; }
            .promo-card__price { align-items: flex-start !important; padding-left: 0 !important; border-left: none !important; }
          }
          @media (max-width: 640px) {
            .rd-wrap { padding: 16px 16px 52px !important; }
          }
        `}</style>
        <div className="rd-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32, alignItems: "start" }}>
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

          <PromoBanner promotions={activePromotions} rates={room} variant="desktop" promoCode={promoCode} />

          {/* All scrollable content below carousel */}
          <div style={{ marginTop: 20 }}>
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
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>Good to know before you book</h2>
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
            <section style={{ padding: "28px 0", borderBottom: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-.02em" }}>What&apos;s inside</h2>
              <div className="rd-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
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
            <section className="rd-2col" style={{ padding: "28px 0", borderBottom: "1px solid var(--line)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
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
          </div>

          </div>{/* end left column */}

          {/* BOOKING CARD — sticky beside the carousel */}
          <aside id="book" className="rd-book" style={{ position: "sticky", top: 90 }}>
            <style>{`.bk-opt{transition:border-color .18s ease,background .18s ease}.bk-opt:hover{border-color:#B07848 !important}`}</style>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 24, boxShadow: "0 4px 16px rgba(31,22,14,.06),0 12px 32px rgba(31,22,14,.08)", overflow: "hidden" }}>

                {/* price header */}
                <div style={{ padding: "22px 24px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #EFE4CE" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                      {!stayChosen && <span style={{ fontSize: 13.5, color: "#8B7458" }}>From</span>}
                      {livePromo && <span style={{ fontSize: 15, color: "#8B7458", textDecoration: "line-through" }}>{peso(stayRate)}</span>}
                      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 500, letterSpacing: "-.02em" }}>{peso(headlinePrice)}</span>
                      <span style={{ fontSize: 13, color: "#8B7458", whiteSpace: "nowrap" }}>{stayChosen ? (isOvernight ? "/ night" : "/ session") : ""}</span>
                    </div>
                    {livePromo ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <span style={{ background: "#F3E4CB", color: "#8C5A2E", fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{livePromo.title}</span>
                        <span style={{ fontSize: 12.5, color: "#8B7458" }}>{isOvernight ? "Overnight · 7 PM – 4 PM next day" : `${selectedWindow.label} · 10 hours`}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: "#8B7458", marginTop: 3 }}>{!stayChosen ? "Choose how you'd like to stay" : isOvernight ? "Overnight · 7 PM – 4 PM next day" : `${selectedWindow.label} · 10 hours`}</div>
                    )}
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E4F3E4", color: "#15803D", fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> No charge today
                  </span>
                </div>

                <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

                  {/* 1. DATE — chosen first: availability is per date. */}
                  <CardStep n={1} title="When are you coming?" active={cardStep === 1} done={!!date && cardStep > 1} summary={date ? formatDateLong(date) : undefined} onOpen={() => { setCardStep(1); setDateOpen(true); setGuestOpen(false); }}>
                    <button onClick={() => { setDateOpen(!dateOpen); setGuestOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: dateOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: date ? "#1F160E" : "#8B7458", whiteSpace: "nowrap" }}>{date ? formatDateLong(date) : "Choose your date"}</span>
                      </span>
                      <span style={{ display: "inline-flex", transition: "transform .25s", transform: dateOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                    </button>
                    {dateOpen && (
                      <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: 16 }}>
                        <Calendar selected={date} blocked={blockedDates} onSelect={(d) => { setDate(d); setDateOpen(false); setStayPicked(false); setCardStep(2); }} />
                        <div style={{ fontSize: 11.5, color: "#9B8B73", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1F160E", display: "inline-block" }} />{calendarWindow ? `Crossed-out days can't take a ${calendarWindow.label.toLowerCase()}.` : "Crossed-out days are fully booked."}</div>
                      </div>
                    )}
                  </CardStep>

                  {/* 2. RATE — only what is bookable on that date. */}
                  <CardStep n={2} title="Choose your rate" active={cardStep === 2} done={stayChosen && cardStep > 2} summary={stayChosen ? `${selectedWindow.label} · ${peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}` : undefined} onOpen={() => { setCardStep(2); setDateOpen(false); setGuestOpen(false); }}>
                    {!date ? (
                      <div style={{ fontSize: 13.5, color: "#8B7458", padding: "10px 2px" }}>
                        Pick a date first — the rates open on that day will appear here.
                      </div>
                    ) : availableWindows.length === 0 ? (
                      <div style={{ fontSize: 13.5, color: "#A8492F", padding: "10px 2px" }}>
                        Fully booked on {formatDateLong(date)}. Please choose another date.
                      </div>
                    ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      <div style={{ fontSize: 12, color: "#8B7458", marginBottom: 1 }}>
                        Rates for <strong style={{ color: "#1F160E", fontWeight: 600 }}>{formatDateLong(date)}</strong>
                      </div>
                      {/* See desktop copy — taken rates stay listed, disabled. */}
                      {windows.map((w) => {
                        const free = isWindowFreeOn(date, w, 1);
                        const active = free && stayChosen && selectedWindow.checkIn === w.checkIn && selectedWindow.checkOut === w.checkOut;
                        const price = w.stayType === "10" ? room.price10hr : room.price21hr;
                        const i = windows.indexOf(w); // icon follows the original order
                    const ic = i === 0
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                          : i === 1
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9v11M2 13h18a2 2 0 0 1 2 2v5M2 16h20" /><path d="M5 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></svg>;
                        return (
                          <button key={i} disabled={!free} onClick={() => {
                        // A 10-hour session needs no night count, so it skips
                        // ahead to the guests.
                        setSelectedWindow(w); setStayPicked(true); setDateOpen(false);
                        if (w.stayType === "10") { setCardStep(3); setGuestOpen(true); }
                      }} className="bk-opt" style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", cursor: free ? "pointer" : "not-allowed", borderRadius: 15, width: "100%", fontFamily: "inherit", opacity: free ? 1 : 0.55, background: active ? "#FBF4E6" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                            <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", color: active ? "#fff" : "#8C5A2E", background: active ? "#B07848" : "#EFE4CE" }}>{ic}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#1F160E", textDecoration: free ? "none" : "line-through" }}>{w.label}</span>
                              <span style={{ display: "block", fontSize: 12, color: free ? "#8B7458" : "#A8492F", marginTop: 2 }}>{free ? `${w.checkIn} – ${w.checkOut}` : "Already booked on this date"}</span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1F160E" }}>{peso(price)}</span>
                              <span style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>{active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    )}
                    {/* Nights belong to the overnight rate — see desktop copy. */}
                    {stayIndicated && isOvernight && date && maxNights > 0 && (
                      <>
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E0CEB2", borderRadius: 14, padding: "12px 16px", background: "#FAF7F1" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>How many nights?</div>
                          <div style={{ fontSize: 12, color: "#8B7458", marginTop: 1 }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)} × {stayNights} night{stayNights > 1 ? "s" : ""}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                          <button aria-label="Fewer nights" onClick={() => setNights(Math.max(1, stayNights - 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: stayNights > 1 ? "pointer" : "not-allowed", opacity: stayNights > 1 ? 1 : 0.4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                          <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{stayNights}</span>
                          <button aria-label="More nights" disabled={stayNights >= maxNights} onClick={() => setNights(Math.min(maxNights, stayNights + 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: stayNights < maxNights ? "pointer" : "not-allowed", opacity: stayNights < maxNights ? 1 : 0.4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                        </div>
                      </div>
                      {stayNights >= maxNights && (
                        <div style={{ fontSize: 12, color: nightsCapped ? "#A8492F" : "#8B7458", marginTop: 7, lineHeight: 1.45 }}>
                          {maxNights === 1
                            ? `Only 1 night is free from ${formatDateLong(date)} — the next night is already booked.`
                            : `Up to ${maxNights} nights from ${formatDateLong(date)} — night ${maxNights + 1} is already booked.`}
                          {nightsCapped ? " We've adjusted your stay to fit." : ""}
                        </div>
                      )}
                      <button onClick={() => { setCardStep(3); setGuestOpen(true); setDateOpen(false); }} style={{ marginTop: 10, width: "100%", padding: "13px 16px", borderRadius: 14, border: "none", background: "#B07848", color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>Continue &rarr;</button>
                      </>
                    )}
                  </CardStep>

                  {/* 3. GUESTS */}
                  <CardStep n={3} title="Who’s coming?" active={cardStep === 3} done={false} summary={`${guests.adults + guests.children + guests.infants} guest${guests.adults + guests.children + guests.infants > 1 ? "s" : ""}`} onOpen={() => { setCardStep(3); setGuestOpen(true); setDateOpen(false); }}>
                    <button onClick={() => { setGuestOpen(!guestOpen); setDateOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: guestOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: "#1F160E", whiteSpace: "nowrap" }}>{guests.adults + guests.children + guests.infants} guest{guests.adults + guests.children + guests.infants > 1 ? "s" : ""}</span>
                      </span>
                      <span style={{ display: "inline-flex", transition: "transform .25s", transform: guestOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                    </button>
                    {guestOpen && (() => {
                      const counted = guests.adults + guests.children;
                      const maxed = counted >= 4;
                      const stepStyle = (enabled: boolean): CSSProperties => ({ width: 30, height: 30, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4 });
                      const minus = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
                      const plus = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
                      return (
                        <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: "4px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                            <div><div style={{ fontWeight: 600, fontSize: 14 }}>Adults</div><div style={{ fontSize: 12, color: "#8B7458" }}>Age 18+</div></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                              <button onClick={() => setGuests({ ...guests, adults: Math.max(1, guests.adults - 1) })} style={stepStyle(guests.adults > 1)}>{minus}</button>
                              <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.adults}</span>
                              <button onClick={() => { if (!maxed) setGuests({ ...guests, adults: guests.adults + 1 }); }} style={stepStyle(!maxed)}>{plus}</button>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid #EFE4CE" }}>
                            <div><div style={{ fontWeight: 600, fontSize: 14 }}>Teens</div><div style={{ fontSize: 12, color: "#8B7458" }}>Age 7&ndash;17</div></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                              <button onClick={() => setGuests({ ...guests, children: Math.max(0, guests.children - 1) })} style={stepStyle(guests.children > 0)}>{minus}</button>
                              <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.children}</span>
                              <button onClick={() => { if (!maxed) setGuests({ ...guests, children: guests.children + 1 }); }} style={stepStyle(!maxed)}>{plus}</button>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                            <div><div style={{ fontWeight: 600, fontSize: 14 }}>Little ones</div><div style={{ fontSize: 12, color: "#8B7458" }}>7 &amp; under · free</div></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                              <button onClick={() => setGuests({ ...guests, infants: Math.max(0, guests.infants - 1) })} style={stepStyle(guests.infants > 0)}>{minus}</button>
                              <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700 }}>{guests.infants}</span>
                              <button onClick={() => { if (guests.infants < 4) setGuests({ ...guests, infants: guests.infants + 1 }); }} style={stepStyle(guests.infants < 4)}>{plus}</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: "#9B8B73", padding: "0 0 12px", lineHeight: 1.5 }}>The rate covers 2 guests. Each extra adult or teen is {peso(room.additionalPaxFee)} per night (up to 4). Little ones stay free, up to 4. For 5+ adults/teens, message us on <a href="https://www.facebook.com/messages/t/270893736109969" target="_blank" rel="noopener" style={{ color: "#B07848", fontWeight: 600 }}>Facebook</a>.</div>
                        </div>
                      );
                    })()}
                  </CardStep>

                  {/* price summary — see desktop copy: needs a chosen rate too. */}
                  {date && stayChosen && (
                    <div style={{ borderTop: "1px solid #EFE4CE", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#4A3A2A" }}><span style={{ whiteSpace: "nowrap" }}>{selectedWindow.label} · {isOvernight ? `${stayNights} night${stayNights > 1 ? "s" : ""}${bundleLabel ? ` · ${bundleLabel}` : ""}` : (isWeekendRate ? "Weekend/Holiday" : "Weekday")}</span><span>{peso(basePrice)}</span></div>
                  {/* Bundle stays quote one flat nightly rate, so show it —
                      otherwise a guest can't tell why the room total moved when
                      they added a 3rd guest. */}
                  {bundleRate != null && <div style={{ fontSize: 11.5, color: "#9B8B73", marginTop: -4 }}>{peso(bundleRate)}/night{hasExtraPax ? ` · includes ${peso(BUNDLE_EXTRA_PAX_SURCHARGE)} extra-guest rate` : ""}</div>}
                      {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra guests · {extraPaxCount} × {peso(room.additionalPaxFee)}{stayNights > 1 ? ` × ${stayNights} nights` : ""}</span><span>{peso(paxFee)}</span></div>}
                      {promoDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#1A7A4C" }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{promoLabel}</span><span style={{ flex: "none" }}>&minus;{peso(promoDiscount)}</span></div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, paddingTop: 9, borderTop: "1px solid #EFE4CE" }}><span>Total</span><span>{peso(payableTotal)}</span></div>
                    </div>
                  )}

                  {/* offer breakdown — only for a promo that genuinely reduces
                      the charge, so "You pay" can't contradict checkout. */}
                  {livePromo && (
                    <div style={{ background: "#F6EFE2", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 13.5, color: "#4A3A2A" }}>Usual price</span>
                        <span style={{ fontSize: 14, color: "#8B7458", textDecoration: "line-through" }}>{peso(stayRate)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 13.5, color: "#15803D", fontWeight: 500 }}>{livePromo.title}</span>
                        <span style={{ fontSize: 14, color: "#15803D", fontWeight: 600, whiteSpace: "nowrap" }}>&minus; {peso(offerSaving)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTop: "1px solid #E0CEB2" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1F160E" }}>You pay</span>
                        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 500, lineHeight: 1, color: "#1F160E" }}>{peso(offerRate)}</span>
                      </div>
                    </div>
                  )}


                  {/* PROMO CODE — checkout re-validates and is authoritative;
                      this just lets the guest see the code land before they
                      commit, instead of two screens later. */}
                  {date && stayChosen && (
                    <div style={{ borderTop: "1px solid #EFE4CE", paddingTop: 14 }}>
                      {enteredPromo ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#EAF7EF", border: "1px solid #BCE7CC", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>{enteredPromo.code} applied</div>
                            <div style={{ fontSize: 11.5, color: "#3A6B4C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enteredPromo.name}</div>
                          </div>
                          <button type="button" onClick={clearPromoCode} style={{ fontSize: 12, fontWeight: 600, color: "#166534", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", flex: "none", fontFamily: "inherit" }}>Remove</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              aria-label="Promo code"
                              value={promoInput}
                              onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); if (promoStatus === "error") { setPromoStatus("idle"); setPromoError(""); } }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromoCode(); } }}
                              placeholder="Promo code"
                              style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", color: "#1F160E", background: "#FFFCF4", borderRadius: 12, border: `1.5px solid ${promoStatus === "error" ? "#ef4444" : "#E0CEB2"}`, outline: "none" }}
                            />
                            <button type="button" onClick={() => applyPromoCode()} disabled={!promoInput.trim() || promoStatus === "checking"}
                              style={{ padding: "10px 16px", borderRadius: 12, background: "#1F160E", color: "#F6EFE2", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "none", fontFamily: "inherit", opacity: (!promoInput.trim() || promoStatus === "checking") ? 0.5 : 1 }}>
                              {promoStatus === "checking" ? "Checking…" : "Apply"}
                            </button>
                          </div>
                          {promoStatus === "error" && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 6 }}>{promoError}</div>}
                        </>
                      )}
                    </div>
                  )}

                  {/* reserve */}
                  <div>
                    <button onClick={handleReserve} disabled={!canProceed} style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 24px", borderRadius: 999, fontSize: 15, fontWeight: 600, fontFamily: "inherit", border: "none", cursor: canProceed ? "pointer" : "not-allowed", background: canProceed ? "#B07848" : "#E4D7BE", color: canProceed ? "#fff" : "#9B8B73", boxShadow: canProceed ? "0 4px 14px rgba(176,120,72,.28)" : "none" }}>
                      {canProceed ? "Reserve your stay" : !date ? "Pick a date to continue" : "Choose your rate to continue"}
                      {canProceed && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>}
                    </button>
                    <div style={{ textAlign: "center", fontSize: 12, color: "#8B7458", marginTop: 11, lineHeight: 1.5 }}>You won&rsquo;t be charged now. Pay the 50% deposit only when you confirm at checkout.</div>
                  </div>

                </div>
              </div>

              {/* trust strip */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 16 }}>
                <span style={{ color: "#15803D", flex: "none", display: "inline-flex" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></span>
                <span style={{ fontSize: 12, color: "#6B5A45", lineHeight: 1.45 }}>Reserve now, settle later. No cancellations, but you can move your date once up to 7 days before check-in.</span>
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

export default function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14 }}>Loading…</div>}>
      <RoomDetailInner params={params} />
    </Suspense>
  );
}
