"use client";

import { useState, useEffect, use, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import { mockRooms } from "@/lib/mock-data";
import { useGetHavenByIdQuery } from "@/redux/api/roomApi";
import { useGetBlockedDatesQuery } from "@/redux/api/blockedDatesApi";
import { havenToRoom } from "@/lib/haven-adapter";
import { stayTotal, isWeekendOrHoliday, extraPaxFee } from "@/lib/pricing";
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

export default function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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


  // Unavailable days for the date picker: owner-set blocked dates + active bookings.
  const { data: blockedRes } = useGetBlockedDatesQuery({ haven_id: id }, { skip: !isUuid });
  const [bookedRanges, setBookedRanges] = useState<{ ci: string; co: string }[]>([]);
  useEffect(() => {
    if (!isUuid || !id) return;
    let active = true;
    fetch(`/api/bookings/room/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => {
        if (!active) return;
        const rows = Array.isArray(j?.data) ? j.data : [];
        setBookedRanges(rows.map((b: Record<string, unknown>) => ({ ci: String(b.check_in_date ?? ""), co: String(b.check_out_date ?? "") })));
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

  const [dateOpen, setDateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [wished, setWished] = useState(false);

  const [selectedWindow, setSelectedWindow] = useState<Window>(windows[2] ?? windows[0]);

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

  // Desktop booking-card guided step (1 stay → 2 date → 3 guests).
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
  const stayNights = isOvernight ? nights : 1;

  // D'Lux: rate depends on stay type + whether each night is a weekend/holiday.
  // Base rate covers the first `basePax` (2) guests; each guest beyond that adds
  // a flat per-pax fee (once per booking). Only adults + young adults are
  // chargeable — "Children (7 under)" are exempt from the fee (but still count
  // toward the 4-pax max). No cleaning or service fee.
  const isWeekendRate = isWeekendOrHoliday(date);
  const basePrice = stayTotal(selectedWindow.stayType, date, stayNights, room);
  const feePax = guests.adults + guests.children; // adults + young adults; excludes 7-under
  const extraPaxCount = Math.max(0, feePax - room.basePax);
  const paxFee = extraPaxFee(feePax, room.basePax, room.additionalPaxFee);
  const total = basePrice + paxFee;

  // Normalize any date value (DATE column may arrive as a UTC timestamp) to a
  // local YYYY-MM-DD, then expand ranges into the individual unavailable days.
  const toLocalISO = (v: unknown) => {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const blockedDates = (() => {
    const set = new Set<string>();
    const pushRange = (fromISO: string, toISO: string) => {
      if (!fromISO) return;
      const d = new Date(fromISO + "T00:00:00");
      const end = new Date((toISO || fromISO) + "T00:00:00");
      for (let g = 0; d <= end && g < 400; g++) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        d.setDate(d.getDate() + 1);
      }
    };
    // Owner-blocked ranges (inclusive).
    (blockedRes?.data || []).forEach((b) => pushRange(toLocalISO(b.from_date), toLocalISO(b.to_date)));
    // Booked nights: check-in up to (but not including) check-out; same-day = that day.
    bookedRanges.forEach(({ ci, co }) => {
      const from = toLocalISO(ci);
      if (!from) return;
      const coISO = toLocalISO(co);
      const end = new Date((coISO || from) + "T00:00:00");
      const start = new Date(from + "T00:00:00");
      if (end <= start) { pushRange(from, from); return; }
      end.setDate(end.getDate() - 1); // last occupied night
      pushRange(from, `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`);
    });
    return Array.from(set);
  })();
  const canProceed = date && guests.adults >= 1;

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
        <style>{`.bk-opt:active{border-color:#B07848}`}</style>

        {/* SITE HEADER */}
        <div style={{ flex: "none", position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: "#FAF7F1", borderBottom: "1px solid #ECE5D4" }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 26, height: 26, flex: "none", background: "#1F160E", color: "#FAF7F1", display: "grid", placeItems: "center", fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: "italic" }}>D</span>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 17, letterSpacing: "-.01em" }}>D&rsquo;Lux Homes</span>
          </Link>
          <Link href="/my-bookings" aria-label="My bookings" style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E0CEB2", background: "#FFFCF4", display: "grid", placeItems: "center", color: "#3A2E20", textDecoration: "none" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
        </div>

        <div style={{ flex: 1 }}>
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
          <div style={{ margin: "18px 16px 0", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 20, boxShadow: "0 4px 16px rgba(31,22,14,.05)", overflow: "hidden" }}>
            {/* price header */}
            <div style={{ padding: "18px 18px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #EFE4CE" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500, letterSpacing: "-.02em" }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}</span>
                  <span style={{ fontSize: 13, color: "#8B7458", whiteSpace: "nowrap" }}>{isOvernight ? "/ night" : "/ session"}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8B7458", marginTop: 3 }}>{isOvernight ? "Overnight · 7 PM – 4 PM next day" : `${selectedWindow.label} · 10 hours`}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#E4F3E4", color: "#15803D", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap", flex: "none" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> No charge today
              </span>
            </div>

            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 1. STAY */}
              <CardStep n={1} title="How do you want to stay?" active={cardStep === 1} done={cardStep > 1} summary={`${selectedWindow.label} · ${peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}`} onOpen={() => { setCardStep(1); setDateOpen(false); setGuestOpen(false); }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {windows.map((w, i) => {
                    const active = selectedWindow.checkIn === w.checkIn && selectedWindow.checkOut === w.checkOut;
                    const price = w.stayType === "10" ? room.price10hr : room.price21hr;
                    const ic = i === 0
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                      : i === 1
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9v11M2 13h18a2 2 0 0 1 2 2v5M2 16h20" /><path d="M5 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></svg>;
                    return (
                      <button key={i} onClick={() => { setSelectedWindow(w); setCardStep(2); setDateOpen(true); setGuestOpen(false); }} className="bk-opt" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", cursor: "pointer", borderRadius: 14, width: "100%", fontFamily: "inherit", background: active ? "#FBF4E6" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                        <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", color: active ? "#fff" : "#8C5A2E", background: active ? "#B07848" : "#EFE4CE" }}>{ic}</span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#1F160E" }}>{w.label}</span>
                          <span style={{ display: "block", fontSize: 11.5, color: "#8B7458", marginTop: 2 }}>{w.checkIn} – {w.checkOut}</span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1F160E" }}>{peso(price)}</span>
                          <span style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>{active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardStep>

              {/* 2. DATE */}
              <CardStep n={2} title="When are you coming?" active={cardStep === 2} done={cardStep > 2} summary={date ? `${formatDateLong(date)}${isOvernight ? ` · ${stayNights} night${stayNights > 1 ? "s" : ""}` : ""}` : undefined} onOpen={() => { setCardStep(2); setDateOpen(true); setGuestOpen(false); }}>
                <button onClick={() => { setDateOpen(!dateOpen); setGuestOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: dateOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: date ? "#1F160E" : "#8B7458", whiteSpace: "nowrap" }}>{date ? formatDateLong(date) : "Choose your date"}</span>
                  </span>
                  <span style={{ display: "inline-flex", transition: "transform .25s", transform: dateOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                {dateOpen && (
                  <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: 14 }}>
                    <Calendar selected={date} blocked={blockedDates} onSelect={(d) => { setDate(d); setDateOpen(false); setCardStep(3); setGuestOpen(true); }} />
                    <div style={{ fontSize: 11, color: "#9B8B73", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1F160E", display: "inline-block" }} /> Crossed-out days are already booked.</div>
                  </div>
                )}
                {isOvernight && date && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E0CEB2", borderRadius: 14, padding: "12px 16px", background: "#FAF7F1" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>How many nights?</div>
                      <div style={{ fontSize: 11.5, color: "#8B7458", marginTop: 1 }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)} × {stayNights} night{stayNights > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <button aria-label="Fewer nights" onClick={() => setNights((n) => Math.max(1, n - 1))} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: nights > 1 ? "pointer" : "not-allowed", opacity: nights > 1 ? 1 : 0.4 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                      <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{nights}</span>
                      <button aria-label="More nights" onClick={() => setNights((n) => n + 1)} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                    </div>
                  </div>
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
                          <button onClick={() => setGuests({ ...guests, infants: guests.infants + 1 })} style={stepStyle(true)}>{plus}</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#9B8B73", padding: "0 0 12px", lineHeight: 1.5 }}>Rate covers 2 guests. Each extra adult or teen is {peso(room.additionalPaxFee)} (up to 4). Little ones stay free. For 5+, message us on <a href="https://www.facebook.com/messages/t/270893736109969" target="_blank" rel="noopener" style={{ color: "#B07848", fontWeight: 600 }}>Facebook</a>.</div>
                    </div>
                  );
                })()}
              </CardStep>

              {/* price summary */}
              {date && (
                <div style={{ borderTop: "1px solid #EFE4CE", paddingTop: 15, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#4A3A2A" }}><span style={{ whiteSpace: "nowrap" }}>{selectedWindow.label} · {isOvernight ? `${stayNights} night${stayNights > 1 ? "s" : ""}` : (isWeekendRate ? "Weekend/Holiday" : "Weekday")}</span><span>{peso(basePrice)}</span></div>
                  {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra guests · {extraPaxCount} × {peso(room.additionalPaxFee)}</span><span>{peso(paxFee)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, paddingTop: 9, borderTop: "1px solid #EFE4CE" }}><span>Total</span><span>{peso(total)}</span></div>
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

        {/* STICKY BOTTOM BAR */}
        <div style={{ flex: "none", position: "sticky", bottom: 0, background: "#FAF7F1", borderTop: "1px solid #ECE5D4", padding: "12px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: "none" }}>
            <div style={{ fontSize: 11, color: "#8B7458" }}>{canProceed ? "Total" : "From"}</div>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.01em" }}>{peso(canProceed ? total : (selectedWindow.stayType === "10" ? room.price10hr : room.price21hr))}</div>
          </div>
          <button onClick={handleReserve} disabled={!canProceed} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 15, borderRadius: 14, fontSize: 15, fontWeight: 600, border: "none", cursor: canProceed ? "pointer" : "not-allowed", background: canProceed ? "#B07848" : "#E4D7BE", color: canProceed ? "#fff" : "#9B8B73" }}>
            {canProceed ? "Reserve" : "Pick a date first"}
            {canProceed && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>}
          </button>
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
          <aside id="book" className="rd-book" style={{ position: "sticky", top: 90, height: "fit-content" }}>
            <style>{`.bk-opt{transition:border-color .18s ease,background .18s ease}.bk-opt:hover{border-color:#B07848 !important}`}</style>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 24, boxShadow: "0 4px 16px rgba(31,22,14,.06),0 12px 32px rgba(31,22,14,.08)", overflow: "hidden" }}>

                {/* price header */}
                <div style={{ padding: "22px 24px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #EFE4CE" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 500, letterSpacing: "-.02em" }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}</span>
                      <span style={{ fontSize: 13.5, color: "#8B7458", whiteSpace: "nowrap" }}>{isOvernight ? "/ night" : "/ session"}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#8B7458", marginTop: 3 }}>{isOvernight ? "Overnight · 7 PM – 4 PM next day" : `${selectedWindow.label} · 10 hours`}</div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E4F3E4", color: "#15803D", fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> No charge today
                  </span>
                </div>

                <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

                  {/* 1. STAY TYPE */}
                  <CardStep n={1} title="How do you want to stay?" active={cardStep === 1} done={cardStep > 1} summary={`${selectedWindow.label} · ${peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)}`} onOpen={() => { setCardStep(1); setDateOpen(false); setGuestOpen(false); }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {windows.map((w, i) => {
                        const active = selectedWindow.checkIn === w.checkIn && selectedWindow.checkOut === w.checkOut;
                        const price = w.stayType === "10" ? room.price10hr : room.price21hr;
                        const ic = i === 0
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                          : i === 1
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9v11M2 13h18a2 2 0 0 1 2 2v5M2 16h20" /><path d="M5 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></svg>;
                        return (
                          <button key={i} onClick={() => { setSelectedWindow(w); setCardStep(2); setDateOpen(true); setGuestOpen(false); }} className="bk-opt" style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", cursor: "pointer", borderRadius: 15, width: "100%", fontFamily: "inherit", background: active ? "#FBF4E6" : "#FFFCF4", border: active ? "1.5px solid #B07848" : "1.5px solid #E0CEB2" }}>
                            <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", color: active ? "#fff" : "#8C5A2E", background: active ? "#B07848" : "#EFE4CE" }}>{ic}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#1F160E" }}>{w.label}</span>
                              <span style={{ display: "block", fontSize: 12, color: "#8B7458", marginTop: 2 }}>{w.checkIn} – {w.checkOut}</span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1F160E" }}>{peso(price)}</span>
                              <span style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: active ? "#B07848" : "transparent", border: active ? "2px solid #B07848" : "2px solid #D4BE9A" }}>{active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </CardStep>

                  {/* 2. DATE */}
                  <CardStep n={2} title="When are you coming?" active={cardStep === 2} done={cardStep > 2} summary={date ? `${formatDateLong(date)}${isOvernight ? ` · ${stayNights} night${stayNights > 1 ? "s" : ""}` : ""}` : undefined} onOpen={() => { setCardStep(2); setDateOpen(true); setGuestOpen(false); }}>
                    <button onClick={() => { setDateOpen(!dateOpen); setGuestOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderRadius: 14, background: "#FFFCF4", border: dateOpen ? "1.5px solid #B07848" : "1.5px solid #E0CEB2", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8C5A2E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: date ? "#1F160E" : "#8B7458", whiteSpace: "nowrap" }}>{date ? formatDateLong(date) : "Choose your date"}</span>
                      </span>
                      <span style={{ display: "inline-flex", transition: "transform .25s", transform: dateOpen ? "rotate(180deg)" : "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B7458" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                    </button>
                    {dateOpen && (
                      <div style={{ marginTop: 10, border: "1px solid #E0CEB2", borderRadius: 16, background: "#FAF7F1", padding: 16 }}>
                        <Calendar selected={date} blocked={blockedDates} onSelect={(d) => { setDate(d); setDateOpen(false); setCardStep(3); setGuestOpen(true); }} />
                        <div style={{ fontSize: 11.5, color: "#9B8B73", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1F160E", display: "inline-block" }} /> Crossed-out days are already booked.</div>
                      </div>
                    )}
                    {isOvernight && date && (
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E0CEB2", borderRadius: 14, padding: "12px 16px", background: "#FAF7F1" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>How many nights?</div>
                          <div style={{ fontSize: 12, color: "#8B7458", marginTop: 1 }}>{peso(selectedWindow.stayType === "10" ? room.price10hr : room.price21hr)} × {stayNights} night{stayNights > 1 ? "s" : ""}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                          <button aria-label="Fewer nights" onClick={() => setNights((n) => Math.max(1, n - 1))} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: nights > 1 ? "pointer" : "not-allowed", opacity: nights > 1 ? 1 : 0.4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                          <span style={{ minWidth: 16, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{nights}</span>
                          <button aria-label="More nights" onClick={() => setNights((n) => n + 1)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #D4BE9A", background: "#fff", color: "#1F160E", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                        </div>
                      </div>
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
                              <button onClick={() => setGuests({ ...guests, infants: guests.infants + 1 })} style={stepStyle(true)}>{plus}</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: "#9B8B73", padding: "0 0 12px", lineHeight: 1.5 }}>The rate covers 2 guests. Each extra adult or teen is {peso(room.additionalPaxFee)} (up to 4). Little ones stay free. For 5+ adults/teens, message us on <a href="https://www.facebook.com/messages/t/270893736109969" target="_blank" rel="noopener" style={{ color: "#B07848", fontWeight: 600 }}>Facebook</a>.</div>
                        </div>
                      );
                    })()}
                  </CardStep>

                  {/* price summary */}
                  {date && (
                    <div style={{ borderTop: "1px solid #EFE4CE", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#4A3A2A" }}><span style={{ whiteSpace: "nowrap" }}>{selectedWindow.label} · {isOvernight ? `${stayNights} night${stayNights > 1 ? "s" : ""}` : (isWeekendRate ? "Weekend/Holiday" : "Weekday")}</span><span>{peso(basePrice)}</span></div>
                      {paxFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#4A3A2A" }}><span>Extra guests · {extraPaxCount} × {peso(room.additionalPaxFee)}</span><span>{peso(paxFee)}</span></div>}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, paddingTop: 9, borderTop: "1px solid #EFE4CE" }}><span>Total</span><span>{peso(total)}</span></div>
                    </div>
                  )}

                  {/* reserve */}
                  <div>
                    <button onClick={handleReserve} disabled={!canProceed} style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px 24px", borderRadius: 999, fontSize: 15, fontWeight: 600, fontFamily: "inherit", border: "none", cursor: canProceed ? "pointer" : "not-allowed", background: canProceed ? "#B07848" : "#E4D7BE", color: canProceed ? "#fff" : "#9B8B73", boxShadow: canProceed ? "0 4px 14px rgba(176,120,72,.28)" : "none" }}>
                      {canProceed ? "Reserve your stay" : "Pick a date to continue"}
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
