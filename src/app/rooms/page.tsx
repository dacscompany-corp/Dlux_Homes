"use client";

// The mobile "Where you'll be" card renders a Leaflet map inline, so this page
// needs the same stylesheet /location pulls in.
import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import DluxMark from "@/components/brand/DluxMark";
import SiteHeader from "@/components/SiteHeader";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getMyBookingIds } from "@/lib/booking-store";
import { mockRooms, mockReviews } from "@/lib/mock-data";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { spanHours } from "@/lib/stay-window";
import { IcoZoom, PromoLightbox } from "@/components/PromoLightbox";
import { havenToRoom } from "@/lib/haven-adapter";
import { useGetActivePromotionsQuery } from "@/redux/api/promotionsApi";
import type { ActivePromotion, PromoStayType } from "@/redux/api/promotionsApi";
import {
  ALL_STAY_TYPES, STAY_TYPE_LABELS, baseRateFor, discountBadgeText, expiryNote, isEnforceable,
  offerPriceFor, pesoAmount, scopedStayTypes,
} from "@/lib/promo-offer";

// Fallback labels + times (mock mode / haven with no configured times). The live
// haven's actual check-in/out times override these via room.windows — see
// displayWindows below. Times here match the official D'Lux rate card.
const stayWindows = [
  { stayType: "10", checkIn: "7:00 AM", checkOut: "5:00 PM", label: "Daycation" },
  { stayType: "10", checkIn: "7:00 PM", checkOut: "5:00 AM", label: "Nightcation" },
  { stayType: "21", checkIn: "7:00 PM", checkOut: "4:00 PM", label: "Full stay" },
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

// ── Mobile "Where you'll be" card ──────────────────────────────
// Same property coordinates, pin and getting-around distances the /location
// page shows; the mobile view answers "how far is it really" in place rather
// than sending the guest off the listing to find out.
const MAP_COORDS: [number, number] = [14.659186800125402, 121.02701538724116];
const MAP_ADDRESS = "Tower 4, Grass Residences, SM North EDSA, Mother Ignacia Ave, Quezon City, 1105 Metro Manila";
const MAP_PIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='48' viewBox='0 0 48 58'><path d='M24 1C11.85 1 2 10.85 2 23c0 15.5 22 34 22 34s22-18.5 22-34C46 10.85 36.15 1 24 1z' fill='#1F160E' stroke='#FAF7F1' stroke-width='2.5'/><text x='24' y='31' font-family='Georgia, serif' font-style='italic' font-weight='600' font-size='24' fill='#FAF7F1' text-anchor='middle'>D</text></svg>`;
const MOBILE_TRANSIT = [
  { name: "MRT-3 North Avenue", meta: "5 min · 400 m" },
  { name: "SM North EDSA", meta: "3 min · 250 m" },
  { name: "EDSA Carousel Busway", meta: "6 min · 500 m" },
  { name: "NAIA Airport (T3)", meta: "35 min · 18 km" },
];
const MOBILE_NEARBY = ["The Block", "TriNoma", "Vertis North", "QC Circle"];

// Promo scope key per stay window, in the same day/night/overnight order as
// `stayWindows`. Lets the mobile stay cards price each window against the
// offer that actually covers it — promoCoversStay() collapses Daycation and
// Nightcation into stay type "10" and can't tell those two apart.
const WINDOW_PROMO_SCOPE: PromoStayType[] = ["day", "night", "overnight"];

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
// Small amenity-tag marks for the "About this home" pill chips.
function IcoAtBalcony() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V9M20 21V9M4 9c2-3 14-3 16 0" /><path d="M4 21h16M7 15h10M9 15v6M15 15v6" /></svg>;
}
function IcoAtCityView() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V7l4-3v17M12 21V4l4 2v15M20 21V10l-4-2" /></svg>;
}
function IcoAtPool() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 8v6a3 3 0 0 0 3 3" /><path d="M7 4a3 3 0 0 1 3 3v10" /><path d="M2 20c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0" /></svg>;
}
function IcoAtGarden() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v-9" /><path d="M12 12c0-4 2-6 5-7-1 4-2 7-5 7z" /><path d="M12 14c0-3.5-2-5-4.5-6 .8 3.5 1.8 6 4.5 6z" /></svg>;
}
// Snapshot-strip marks (size, capacity, window, rate).
function IcoSnapSize() {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>;
}
function IcoSnapGuests() {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8" /><circle cx="17" cy="8.5" r="2.4" /><path d="M15.7 14.6c2.6.4 4.3 2.2 4.3 5.4" /></svg>;
}
function IcoSnapWindow() {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-4.2 2.8L9 16l4.2-2.8z" /></svg>;
}
function IcoSnapRate() {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 12.6 12.7 20.5a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1 0-2.8l7.9-7.9a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v5.6a2 2 0 0 1-.4 1.2z" /><circle cx="14" cy="8" r="1.4" /></svg>;
}
function SnapshotIcon({ i }: { i: number }) {
  if (i === 0) return <IcoSnapSize />;
  if (i === 1) return <IcoSnapGuests />;
  if (i === 2) return <IcoSnapWindow />;
  return <IcoSnapRate />;
}
function AboutTagIcon({ label }: { label: string }) {
  if (label === "Balcony") return <IcoAtBalcony />;
  if (label === "City view") return <IcoAtCityView />;
  if (label === "Swimming pool") return <IcoAtPool />;
  return <IcoAtGarden />;
}
function IcoSun() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></svg>;
}
function IcoMoon() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" /></svg>;
}
function IcoCalendar() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
}
function StayBadgeIcon({ i }: { i: number }) {
  if (i === 0) return <IcoSun />;
  if (i === 1) return <IcoMoon />;
  return <IcoCalendar />;
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

// ── Footer social icons ────────────────────────────────────────
function IcoFacebook({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" /></svg>;
}
function IcoTikTok({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16.6 5.82c-.9-.9-1.4-2.1-1.4-3.37h-3.05v13.35a2.9 2.9 0 1 1-2.05-2.78V9.9a5.95 5.95 0 1 0 5.1 5.9V9.4a7.5 7.5 0 0 0 4.4 1.4V7.75a4.7 4.7 0 0 1-3-1.93z" /></svg>;
}
function IcoInstagram({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg>;
}
function IcoMail({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m3 6 9 6.5L21 6" /></svg>;
}

// ── Offer-card icons ───────────────────────────────────────────
// Hand-written inline SVG, matching the rest of the guest pages (no icon
// library on the storefront). Sizes/strokes come from the design spec.
function IcoTagSm({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z" /><circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" /></svg>;
}
function IcoCheckBold({ size = 12, stroke = 2.6 }: { size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function IcoCross({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function IcoInfo({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
}
function IcoCopy({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
}
function IcoChevronRight({ size = 18, stroke = 1.8 }: { size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
// ── Mobile-only marks (header actions, expanders, directions) ──
function IcoChevronDown({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
}
function IcoCalBox({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>;
}
function IcoUser({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
function IcoNavigate({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#B07848" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>;
}

// Small shared pieces of the offer card, so the mobile and desktop variants
// can't drift apart.
function OfferLabelPill({ padding = "5px 11px" }: { padding?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F3E4CB", color: "#8C5A2E", borderRadius: 999, padding, fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".14em", whiteSpace: "nowrap" }}>
      <IcoTagSm /> SPECIAL OFFER
    </span>
  );
}
// Headline discount badge ("20% off"). The card leads with the peso figure —
// that was the point of the redesign — but the percentage is what owners
// advertise, so it rides alongside rather than replacing it.
function DiscountBadge({ promo, fontSize = 12, padding = "4px 9px" }: { promo: ActivePromotion; fontSize?: number; padding?: string }) {
  const text = discountBadgeText(promo.discount_type, promo.discount_value, promo.per_night);
  if (!text) return null;
  return (
    <span className="promo-badge" style={{ flex: "none", padding, fontSize, fontWeight: 600, color: "#FFFCF4", background: "#B07848", whiteSpace: "nowrap" }}>{text}</span>
  );
}
// "Works on" chips. Included chips are solid-bordered; the stay types the offer
// does NOT cover are shown dashed rather than hidden — the guest's question is
// "does this work for me?", which needs the no as much as the yes.
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

type OfferRates = { price10hr: number; price21hr: number };

// Guest offer card. Replaces the old gradient promo banner, which showed only
// "Save 20%" — guests couldn't tell what they'd actually pay, whether the offer
// covered their stay type, or how to claim it. Reading order is fixed:
// what it is → what it costs → where it works → what to do.
function PromoBanner({ promotions, roomId, rates, variant, visible = true }: {
  promotions: ActivePromotion[] | undefined;
  roomId: string;
  rates: OfferRates;
  variant: "mobile" | "desktop";
  // Desktop only: gates the entrance/sheen/pulse animation behind scroll
  // visibility (see promoRef in BrowsePage) instead of firing on mount, where
  // it raced the splash screen and finished unseen. Mobile ignores this — no
  // scroll observer wired for that variant, so it keeps its old always-on card.
  visible?: boolean;
}) {
  // First promo expanded, the rest collapsed (design 2b / 3a).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    if (!copiedCode) return;
    const t = setTimeout(() => setCopiedCode(null), 2000);
    return () => clearTimeout(t);
  }, [copiedCode]);

  if (!promotions || promotions.length === 0) return null;

  const expanded = promotions.find((p) => p.id === expandedId) || promotions[0];
  // Cap the quiet list at 3, per the spec — no carousel.
  const collapsed = promotions.filter((p) => p.id !== expanded.id).slice(0, 3);

  const hrefFor = (p: ActivePromotion) =>
    p.discount_code ? `/rooms/${roomId}?promo=${encodeURIComponent(p.discount_code)}` : `/rooms/${roomId}`;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The code is
      // on screen and the ?promo= deep link still applies it, so stay quiet.
    }
  };

  // `discounted` gates every price claim on the card. A codeless promo has no
  // mechanism that reduces the charge (see isEnforceable), so it renders as an
  // announcement — title, description, chips, expiry — with no offer price.
  const offerOf = (p: ActivePromotion) => {
    const { base, unitLabel } = baseRateFor(p, rates);
    const price = offerPriceFor(base, p);
    return { base, unitLabel, price, savings: Math.max(0, base - price), discounted: isEnforceable(p) && price < base };
  };

  // Render helpers, not components — declaring components inside a render
  // remounts them (and drops their state) on every parent render.
  const renderCollapsedRow = (p: ActivePromotion) => {
    const { savings, discounted } = offerOf(p);
    const scope = scopedStayTypes(p);
    const sub = discounted
      ? `Save ${pesoAmount(savings)}${scope ? ` on ${scope.map((t) => STAY_TYPE_LABELS[t]).join(" · ")}` : ""}`
      : p.description || "";
    return (
      <button key={p.id} type="button" onClick={() => setExpandedId(p.id)}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "#FBF3E7", border: "1px solid #ECE5D4", borderRadius: 16, padding: 13, cursor: "pointer", font: "inherit" }}>
        {p.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", flex: "none" }} />
        )}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "'Fraunces', serif", fontSize: 16, lineHeight: 1.15, color: "#1F160E" }}>{p.title}</span>
          {sub && <span style={{ display: "block", fontSize: 12, color: "#6B6358", marginTop: 2 }}>{sub}</span>}
        </span>
        <span style={{ marginLeft: "auto", flex: "none", color: "#B07848", display: "inline-flex" }}><IcoChevronRight /></span>
      </button>
    );
  };

  const { discounted } = offerOf(expanded);
  const scope = scopedStayTypes(expanded);
  const note = expiryNote(expanded.end_date);
  const code = expanded.discount_code;
  const counter = promotions.length > 1 ? `1 of ${promotions.length}` : null;

  // Claim block: a code promo needs the code + Copy; an automatic one just
  // needs to be told there's nothing to type.
  const renderClaimBlock = () => (
    <div style={{ background: "#F6EFE2", borderRadius: 12, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
      {code ? (
        <>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#4A3A2A", margin: 0 }}>
            This one needs a code. Tap <strong style={{ fontWeight: 600 }}>Copy</strong>, then paste it in the <strong style={{ fontWeight: 600 }}>Promo code</strong> box on the payment page.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 15, letterSpacing: ".1em", color: "#1F160E", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 10, padding: "10px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{code}</span>
            <button type="button" onClick={() => copyCode(code)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1F160E", color: "#FFFCF4", border: "none", borderRadius: 10, padding: "11px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", font: "inherit" }}>
              <IcoCopy />{copiedCode === code ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ color: "#8C5A2E", flex: "none", marginTop: 1, display: "inline-flex" }}><IcoInfo /></span>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#4A3A2A", margin: 0 }}>
            {discounted
              ? "Nothing to type. Tap the button, pick your date, and the lower price is already there when you pay."
              : "Tap the button to see this home and pick your dates."}
          </p>
        </div>
      )}
    </div>
  );

  if (variant === "mobile") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="promo-card--mobile" style={{ display: "flex", flexDirection: "column", gap: 14, background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 18, padding: 14, boxShadow: "0 4px 16px rgba(31,22,14,.05)", overflow: "hidden" }}>

          {/* Artwork bleeds past the card padding and keeps its real aspect
              ratio — the old 76px square cropped a banner that carries its
              offer in the artwork itself. */}
          {expanded.image_url && (
            <button type="button" onClick={() => setLightbox(expanded.image_url!)} aria-label="Enlarge offer artwork"
              style={{ position: "relative", display: "block", margin: "-14px -14px 0", padding: 0, border: "none", background: "#2C2218", cursor: "zoom-in", font: "inherit", width: "calc(100% + 28px)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={expanded.image_url} alt="" style={{ display: "block", width: "100%", height: "auto" }} />
              <span style={{ position: "absolute", left: 10, top: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(243,228,203,.92)", color: "#6B3F1C", borderRadius: 999, padding: "5px 10px", fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 9, letterSpacing: ".14em" }}>SPECIAL OFFER</span>
              <span style={{ position: "absolute", right: 10, bottom: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(31,22,14,.55)", backdropFilter: "blur(8px)", color: "#FFFCF4", borderRadius: 999, padding: "6px 11px", fontSize: 11, fontWeight: 600 }}>
                <IcoZoom size={12} /> Tap to enlarge
              </span>
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {!expanded.image_url && <OfferLabelPill />}
            {counter
              ? <span style={{ fontSize: 11.5, color: "#8B7458", whiteSpace: "nowrap", marginLeft: "auto" }}>{counter}</span>
              : note && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8C5A2E", whiteSpace: "nowrap", marginLeft: "auto" }}>{note}</span>}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <h3 className="serif" style={{ fontSize: 21, lineHeight: 1.1, letterSpacing: "-.01em", color: "#1F160E", margin: 0, fontWeight: 500 }}>{expanded.title}</h3>
            {discounted && <DiscountBadge promo={expanded} />}
          </div>

          {expanded.description && <p style={{ fontSize: 13, lineHeight: 1.5, color: "#4A3A2A", margin: 0 }}>{expanded.description}</p>}

          {/* No offer price here. The card advertises one figure but the promo
              can span stay types priced differently (₱1,499 session vs ₱1,899
              night), so a single "₱1,299 / session" read as the rate for all of
              them. The badge states the discount itself, which is true for
              every stay type; the real price is quoted on the room page once a
              stay type is actually chosen. */}

          {scope && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#8B7458" }}>Works on</span>
              <StayTypeChips scope={scope} />
            </div>
          )}

          {renderClaimBlock()}

          <Link href={hrefFor(expanded)} className="promo-cta"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", background: "#B07848", color: "#FFFCF4", borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            Use this offer <IcoArrowRight size={16} />
          </Link>
        </div>

        {collapsed.map((p) => renderCollapsedRow(p))}
        <PromoLightbox src={lightbox} onClose={() => setLightbox(null)} />
      </div>
    );
  }

  // ── Desktop (design 3a) ──
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "#8C5A2E", marginBottom: 16 }}>Offers running now</div>
      <div className="promo-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, marginBottom: 30 }}>
        <h2 className="serif" style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, maxWidth: "16ch", color: "#1F160E", margin: 0 }}>Pay less for the <em>same home.</em></h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#4A3A2A", maxWidth: "46ch", margin: 0 }}>
          The same unit, the same welcome pack — just a lower rate while the offer runs. No membership, no bidding.
        </p>
      </div>

      {/* Three columns, and each one answers a different question: what it
          looks like, what the offer is, how you claim it. The third used to be
          a price stack; with the price gone it holds the claim panel, which is
          where the code and the button belonged anyway — they were previously
          split across the middle column and the far edge. */}
      {/* Inner width is 1220px (1320 section − 56 − 44 card padding), split
          340 / 536 / 280 with 32px gaps. The copy leads the card, so the
          middle column takes the width and the artwork and claim panel are
          sized to what they need rather than to what's left over.
          The text measure below is set with this column — a wider column and
          an unchanged measure would only move the trailing slack, not close
          it. */}
      <div className={`promo-card${visible ? " promo-card--in" : ""}`} style={{ display: "grid", gridTemplateColumns: "340px minmax(0, 1fr) 280px", gap: 32, alignItems: "center", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 22, padding: 22, boxShadow: "0 4px 16px rgba(31,22,14,.05)" }}>
        {expanded.image_url && (
          <div className="promo-card__frame" style={{ width: "100%", maxHeight: 240, borderRadius: 16, alignSelf: "center", background: "#2C2218", border: "1px solid #E0CEB2", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="promo-card__photo" src={expanded.image_url} alt="" style={{ display: "block", width: "100%", height: "auto", maxHeight: 240, objectFit: "contain" }} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <OfferLabelPill padding="6px 12px" />
            {discounted && <DiscountBadge promo={expanded} fontSize={12.5} padding="5px 11px" />}
            {/* The deadline moved to the claim panel — it's a fact about
                acting on the offer, not about what the offer is. */}
          </div>
          <h3 className="serif" style={{ fontSize: 34, lineHeight: 1.02, letterSpacing: "-.025em", color: "#1F160E", margin: 0, fontWeight: 500 }}>{expanded.title}</h3>
          {/* 64ch (~480px) fills the 536px column with a normal right rag.
              Still inside the 45–75ch range a line stays easy to track, so the
              column gets its width without the copy getting harder to read. */}
          {expanded.description && <p style={{ fontSize: 15, lineHeight: 1.6, color: "#4A3A2A", maxWidth: "64ch", margin: 0 }}>{expanded.description}</p>}
          {scope && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#8B7458" }}>Works on</span>
              <StayTypeChips scope={scope} fontSize={13} padding="7px 13px" />
            </div>
          )}
        </div>
        {/* Claim panel. Stretches to the card's full height and pushes the
            deadline to the top and the button to the bottom, so the column
            reads as a panel rather than a button adrift in whitespace — which
            is what was left once the price stack came out. */}
        <div className="promo-card__claim" style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16, background: "#F6EFE2", border: "1px solid #EFE0C8", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#8C5A2E" }}>
            {note ?? "How to claim"}
          </div>

          {code ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#6B6358" }}>Your code</span>
              <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 16, letterSpacing: ".1em", color: "#1F160E", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 10, padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{code}</span>
              <button type="button" onClick={() => copyCode(code)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", color: "#8C5A2E", border: "1px solid #D4BE9A", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", font: "inherit" }}>
                <IcoCopy />{copiedCode === code ? "Copied" : "Copy code"}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 13, lineHeight: 1.5, color: "#4A3A2A", margin: 0 }}>
              {discounted
                ? "Nothing to type. Pick your date and the lower price is already there when you pay."
                : "Follow the button to see this home and pick your dates."}
            </p>
          )}

          <Link href={hrefFor(expanded)} className="promo-cta"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#B07848", color: "#FFFCF4", borderRadius: 999, padding: "14px 22px", fontSize: 15, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            Use this offer <IcoArrowRight size={17} />
          </Link>
        </div>
      </div>

      {collapsed.map((p) => {
        const o = offerOf(p);
        return (
          <div key={p.id} className="promo-row" style={{ display: "grid", gridTemplateColumns: "104px minmax(0, 1fr) auto", gap: 24, alignItems: "center", background: "#FBF3E7", border: "1px solid #ECE5D4", borderRadius: 18, padding: 16, marginTop: 14 }}>
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" style={{ width: 104, height: 76, borderRadius: 12, objectFit: "cover" }} />
            )}
            <div style={{ minWidth: 0 }}>
              <h3 className="serif" style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: "-.015em", color: "#1F160E", margin: 0, fontWeight: 500 }}>{p.title}</h3>
              <p style={{ fontSize: 13.5, color: "#4A3A2A", margin: "4px 0 0" }}>
                {o.discounted ? `Save ${pesoAmount(o.savings)}` : p.description}
                {p.discount_code && <> · code <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: ".06em", color: "#1F160E" }}>{p.discount_code}</span></>}
              </p>
            </div>
            {/* Same reason the expanded card no longer quotes one: the price
                belongs to a single stay type, the offer usually doesn't. The
                "Save ₱x" line above holds regardless of which rate is booked. */}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <button type="button" onClick={() => setExpandedId(p.id)} className="promo-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#1F160E", borderRadius: 999, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", font: "inherit" }}>
                See this offer <IcoChevronRight size={15} stroke={1.9} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function BrowsePage() {
  const [heroImg, setHeroImg] = useState(0);
  // Mobile "Choose your stay" rate switch. D'Lux charges a different rate for a
  // Friday/Saturday or PH-holiday check-in (see src/lib/pricing.ts), so the list
  // asks which kind of day the guest means instead of showing one price and
  // surprising them at checkout.
  const [weekendRates, setWeekendRates] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingCount, setBookingCount] = useState(0);
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const signedIn = authStatus === "authenticated";
  useEffect(() => { setBookingCount(getMyBookingIds().length); }, []);
  const [wished, setWished] = useState(false);
  const { data: activePromotions } = useGetActivePromotionsQuery();

  // ── Mobile view state ────────────────────────────────────────
  // Hero and review carousels are scroll-driven (snap tracks), so the dots
  // follow the track rather than the other way round.
  const [heroIdx, setHeroIdx] = useState(0);
  const [revIdx, setRevIdx] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [amenOpen, setAmenOpen] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const mHeroRef = useRef<HTMLDivElement>(null);
  const mRevRef = useRef<HTMLDivElement>(null);
  const mLocationRef = useRef<HTMLDivElement>(null);
  const mMapRef = useRef<HTMLDivElement>(null);

  // Initials for the header account chip, from the signed-in name (falling
  // back to the email) — two letters, matching the review avatars.
  const accountInitials = (() => {
    const name = session?.user?.name?.trim();
    if (name) {
      const parts = name.split(/\s+/);
      return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }
    return (session?.user?.email?.[0] ?? "?").toUpperCase();
  })();

  const onHeroScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
    setHeroIdx((prev) => (i === prev ? prev : i));
  };
  // Review cards are a fixed 268px wide plus a 12px gap.
  const onRevScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const i = Math.round(e.currentTarget.scrollLeft / 280);
    const c = Math.max(0, Math.min(mockReviews.length - 1, i));
    setRevIdx((prev) => (c === prev ? prev : c));
  };

  const scrollToLocation = () => {
    mLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(MAP_ADDRESS);
      setAddrCopied(true);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The address
      // is on screen and Get directions still works, so stay quiet.
    }
  };
  useEffect(() => {
    if (!addrCopied) return;
    const t = setTimeout(() => setAddrCopied(false), 2000);
    return () => clearTimeout(t);
  }, [addrCopied]);

  // Reveal the stay-window cards once they scroll into view
  const stayCardsRef = useRef<HTMLDivElement>(null);
  const [stayCardsVisible, setStayCardsVisible] = useState(false);

  // Reveal the offer card once it scrolls into view. Firing on mount instead
  // raced the splash screen (~3s visible) — the card's entrance/sheen/pulse
  // finished playing behind it, so guests never saw them. Scroll-triggered
  // like every other section here, and replays each time it re-enters.
  const promoRef = useRef<HTMLDivElement>(null);
  const [promoVisible, setPromoVisible] = useState(false);

  // Reveal the "About this home" editorial section on scroll
  const aboutRef = useRef<HTMLDivElement>(null);
  const [aboutVisible, setAboutVisible] = useState(false);

  // Reveal the "What's inside" amenities section on scroll
  const amenitiesRef = useRef<HTMLDivElement>(null);
  const [amenitiesVisible, setAmenitiesVisible] = useState(false);

  // Reveal the "Guests say" reviews section on scroll
  const reviewsRef = useRef<HTMLDivElement>(null);
  const [reviewsVisible, setReviewsVisible] = useState(false);

  // Reveal the final CTA + footer on scroll
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerVisible, setFooterVisible] = useState(false);

  // Live haven (single-property storefront) — falls back to mock while loading / if none exist
  const { data: havensData } = useGetHavensQuery({});
  const liveHaven = (havensData as Record<string, unknown>[] | undefined)?.[0];
  const room = liveHaven ? havenToRoom(liveHaven) : mockRooms[0];
  // Display windows: keep the listing's labels/stayType but take the actual
  // check-in/out times from the live haven (room.windows, same day/night/overnight
  // order), so the cards always reflect what the owner configured in admin.
  const liveWindows = (room as { windows?: { checkIn: string; checkOut: string }[] }).windows;
  const displayWindows = stayWindows.map((w, i) => ({
    ...w,
    checkIn: liveWindows?.[i]?.checkIn ?? w.checkIn,
    checkOut: liveWindows?.[i]?.checkOut ?? w.checkOut,
  }));

  // Rate for a stay window under the currently selected day type. Weekend
  // columns fall back to the weekday rate when the owner hasn't set one.
  const rateFor = (stayType: string) =>
    stayType === "10"
      ? (weekendRates ? room.price10hrWeekend || room.price10hr : room.price10hr)
      : (weekendRates ? room.price21hrWeekend || room.price21hr : room.price21hr);

  // ── Mobile stay-card pricing ─────────────────────────────────
  // The offer that covers a given window, if any. Only enforceable promos
  // count: an announcement has no mechanism that lowers the charge, so it
  // must never strike a price through (same rule the offer card follows).
  const winPromo = (i: number): ActivePromotion | null => {
    const scopeKey = WINDOW_PROMO_SCOPE[i];
    return (activePromotions || []).find((p) => {
      if (!isEnforceable(p)) return false;
      const scope = scopedStayTypes(p);
      return !scope || scope.includes(scopeKey);
    }) ?? null;
  };

  const winPrice = (i: number) => {
    const promo = winPromo(i);
    const base = rateFor(displayWindows[i].stayType);
    const net = promo ? offerPriceFor(base, promo) : base;
    return { promo, base, net, cut: net < base };
  };

  // Where a window's card sends the guest. A voucher only lowers the charge
  // once its code is in play, so the code rides along on the link — otherwise
  // the struck-through price on the card wouldn't be the price at checkout.
  const winHref = (i: number) => {
    const { promo, cut } = winPrice(i);
    const code = cut && promo?.discount_code ? `&promo=${encodeURIComponent(promo.discount_code)}` : "";
    return `/rooms/${room.id}?win=${i}${code}`;
  };

  // Sticky bottom bar. The stay cards navigate on a single tap, so there's no
  // selection for the bar to reflect — it stands as the standing "from" quote,
  // showing the cheapest window under the current day type (and the price it's
  // cut down from, when an offer covers that window).
  const bar = (() => {
    const best = displayWindows.map((_, i) => winPrice(i)).reduce((a, b) => (b.net < a.net ? b : a));
    return {
      label: "From",
      was: best.cut ? pesoAmount(best.base) : "",
      price: pesoAmount(best.net),
      sub: "No charge today",
      cta: "Book now",
      href: `/rooms/${room.id}`,
    };
  })();

  useEffect(() => {
    const id = setInterval(() => setHeroImg((i) => (i + 1) % room.images.length), 5500);
    return () => clearInterval(id);
  }, [room.images.length]);

  useEffect(() => {
    // Toggle visibility on every scroll in/out so the animation replays
    // each time the section enters the viewport (not just the first time).
    const reveal = (
      el: HTMLElement | null,
      onChange: (visible: boolean) => void
    ) => {
      if (!el) return () => {};
      const observer = new IntersectionObserver(
        ([entry]) => onChange(entry.isIntersecting),
        // Fire as soon as any part enters; trigger a little before fully
        // on-screen, and don't rely on a % of a possibly-tall section.
        { threshold: 0, rootMargin: "0px 0px -10% 0px" }
      );
      observer.observe(el);
      return () => observer.disconnect();
    };
    const cleanups = [
      reveal(stayCardsRef.current, setStayCardsVisible),
      reveal(promoRef.current, setPromoVisible),
      reveal(aboutRef.current, setAboutVisible),
      reveal(amenitiesRef.current, setAmenitiesVisible),
      reveal(reviewsRef.current, setReviewsVisible),
      reveal(ctaRef.current, setCtaVisible),
      reveal(footerRef.current, setFooterVisible),
    ];
    return () => cleanups.forEach((c) => c());
  }, []);

  // Mobile scroll reveal. One observer for every [data-rise] section rather
  // than a ref + state pair each — the mobile view has a dozen of them, and
  // they all want the identical fade-up. Toggling on both edges replays the
  // animation when a section scrolls back into view, matching the desktop.
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".rm-mobile [data-rise]");
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("rmv-in", e.isIntersecting)),
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Mobile location map. Skipped above the mobile breakpoint, where the card
  // is display:none — Leaflet measures a zero-size container and renders a
  // grey box it never recovers from.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 860px)").matches) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    import("leaflet").then((mod) => {
      const L = mod.default;
      if (cancelled || !mMapRef.current) return;
      map = L.map(mMapRef.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: false }).setView(MAP_COORDS, 16);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      L.marker(MAP_COORDS, {
        icon: L.icon({
          iconUrl: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(MAP_PIN_SVG),
          iconSize: [40, 48],
          iconAnchor: [20, 48],
        }),
      }).addTo(map);
      // The card sizes after the images above it settle; recheck once laid out.
      setTimeout(() => map?.invalidateSize(), 200);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, []);

  return (
    <div className="page-enter hm-root" style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>

      {/* HEADER (desktop only — mobile uses its own header inside .rm-mobile) */}
      <div className="rm-deskhdr">
        <SiteHeader bookHref={`/rooms/${room.id}`} />
      </div>

      <style>{`
        .hm-root { overflow-x: hidden; }
        .rm-mobile { display: none; }
        @media (max-width: 860px) {
          .rm-desktop, .rm-deskhdr { display: none !important; }
          .rm-mobile { display: block; }
          /* Clears the fixed bottom CTA bar for the floating Messenger button.
             The bar now carries a price block beside the button, so it's taller
             than the old button-only strip. */
          :root { --dlux-bottom-inset: calc(108px + env(safe-area-inset-bottom)); }
        }
        @media (max-width: 900px) {
          .hm-4col { grid-template-columns: repeat(2,1fr) !important; }
          .about-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .amen-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .hm-stay { grid-template-columns: 1fr !important; }
          .hm-2col { grid-template-columns: 1fr !important; gap: 24px !important; }
          .review-grid { grid-template-columns: repeat(2,1fr) !important; }
          .hm-foot { grid-template-columns: 1fr 1fr !important; gap: 28px !important; }
          .hm-h2 { font-size: 40px !important; }
          .hm-sec { padding-left: 18px !important; padding-right: 18px !important; }
        }
        @media (max-width: 560px) {
          .hm-4col, .review-grid, .hm-foot { grid-template-columns: 1fr !important; }
          .hm-h2 { font-size: 33px !important; }
        }
        /* Offer card — hover is desktop-only affordance, no card lift. */
        .promo-cta { transition: background .2s; }
        .promo-cta:hover { background: #9A6035 !important; }
        .promo-outline { transition: border-color .2s, color .2s; }
        .promo-outline:hover { border-color: #B07848 !important; color: #8C5A2E !important; }
        /* Lightbox fade — the mobile card still opens the artwork full-screen. */
        @keyframes promoLbIn { from { opacity: 0 } to { opacity: 1 } }
        @media (max-width: 900px) {
          /* Stack the offer card: photo, copy, then the claim panel. Stacked,
             the panel has no height to fill, so drop the stretch spacing and
             let it size to its contents. */
          .promo-head { flex-direction: column; align-items: flex-start !important; gap: 16px !important; }
          .promo-card { grid-template-columns: 1fr !important; gap: 22px !important; }
          .promo-card__claim { justify-content: flex-start !important; gap: 14px !important; }
          .promo-row { grid-template-columns: 84px minmax(0, 1fr) !important; gap: 16px !important; }
          .promo-row > div:last-child { grid-column: 1 / -1; justify-content: space-between; }
        }
      `}</style>

      {/* ═══════════ MOBILE HOME (D'Lux Mobile Guest View) ═══════════ */}
      {/* No `overflow: hidden` on this wrapper — it would make itself the
          sticky header's scroll container, and the header would scroll away
          instead of pinning. The background wash clips inside its own layer. */}
      <div className="rm-mobile" style={{ position: "relative", background: "#F6EFE2", paddingBottom: 112 }}>
        <style>{`
          @keyframes gOverlay{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:scale(1)}}
          @keyframes rmvDrift{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-10px,0)}}
          @keyframes rmvFlourish{from{stroke-dashoffset:300}to{stroke-dashoffset:0}}
          @keyframes rmvFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
          .g2c-row:active{background:#F3EEE2}
          /* Horizontal snap tracks (hero, reviews) — no visible scrollbar. */
          .rmv-track::-webkit-scrollbar{display:none}
          .rmv-track{scrollbar-width:none;-webkit-overflow-scrolling:touch}
          /* Scroll reveal: each [data-rise] section fades up as it enters view. */
          .rmv-rise{opacity:0;transform:translateY(16px);transition:opacity .6s cubic-bezier(.2,.8,.2,1),transform .6s cubic-bezier(.2,.8,.2,1)}
          .rmv-rise.rmv-in{opacity:1;transform:none}
          /* Stay cards. Resting look lives here rather than inline so :active
             can override it — inline styles would win over the pressed state. */
          .rmv-staycard{display:block;width:100%;padding:16px 16px 0;border-radius:18px;text-decoration:none;color:inherit;background:linear-gradient(155deg,#3A2A1B 0%,#2A2015 48%,#1E160E 100%);border:1px solid rgba(212,169,106,.16);box-shadow:0 10px 26px -22px rgba(0,0,0,.8);transition:background .2s ease,border-color .2s ease,transform .2s ease,box-shadow .2s ease}
          .rmv-staycard__arrow{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(212,169,106,.4);background:transparent;color:#D4A96A;transition:background .2s ease,color .2s ease,border-color .2s ease}
          .rmv-staycard:active{transform:translateY(-2px);border-color:#D4A96A;background:linear-gradient(155deg,#4A3520 0%,#33261A 46%,#241A11 100%);box-shadow:0 14px 34px -20px rgba(0,0,0,.9)}
          .rmv-staycard:active .rmv-staycard__arrow{background:#D4A96A;color:#1F160E;border-color:#D4A96A}
          .rmv-staycard:focus-visible{outline:2px solid #D4A96A;outline-offset:3px}
          .rmv-in [data-card="stay"]{animation:rmvFadeUp .55s cubic-bezier(.2,.8,.2,1) both}
          .rmv-in [data-card="stay"]:nth-child(1){animation-delay:.12s}
          .rmv-in [data-card="stay"]:nth-child(2){animation-delay:.21s}
          .rmv-in [data-card="stay"]:nth-child(3){animation-delay:.30s}
          .rmv-in [data-flourish] path{animation:rmvFlourish 1.1s ease-out .25s forwards}
          @media (prefers-reduced-motion: reduce){
            .rmv-rise{opacity:1;transform:none;transition:none}
            .rmv-in [data-card="stay"]{animation:none}
            .rmv-in [data-flourish] path{animation:none;stroke-dashoffset:0}
            .rmv-drift{animation:none !important}
          }
          /* Leaflet inside the location card inherits the page's warm ground. */
          .rm-mobile .leaflet-container{background:#EFE4CE;font:inherit}
        `}</style>

        {/* Boho background wash for the upper half (hero → photo collage),
            drifting slowly behind the editorial blocks. From "What's inside"
            down, the tiling background on the wrapper below takes over, so
            there's only this one pass here — a second drift layer would have
            doubled up under it. Clipped in its own layer so the page wrapper
            stays free of the overflow that would break the sticky header. */}
        <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
          <Image src="/images/about-bg.png" alt="" width={860} height={458} unoptimized className="rmv-drift"
            style={{ position: "absolute", top: 420, left: 0, width: "100%", height: "auto", opacity: 0.5, animation: "rmvDrift 18s ease-in-out infinite" }} />
        </div>

        {/* HEADER — logo, bookings shortcut, account, menu */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(250,247,241,.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid #ECE5D4", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", minWidth: 0, textDecoration: "none", color: "inherit" }}>
            <DluxMark layout="compact" accent="clay" width={168} ambient={false} />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
            <Link href="/my-bookings" aria-label={bookingCount > 0 ? `My bookings (${bookingCount})` : "My bookings"}
              style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", border: "1px solid #E0CEB2", background: "#FFFCF4", display: "grid", placeItems: "center", color: "#1F160E", textDecoration: "none" }}>
              <IcoCalBox />
              {bookingCount > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999, background: "#B07848", color: "#FFFCF4", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", border: "2px solid #FAF7F1" }}>{bookingCount}</span>
              )}
            </Link>
            <Link href={signedIn ? "/my-bookings" : "/login"} aria-label={signedIn ? "My account" : "Sign in"}
              style={{ width: 40, height: 40, borderRadius: "50%", border: signedIn ? "none" : "1px solid #E0CEB2", background: signedIn ? "#6B3F1C" : "#FFFCF4", color: signedIn ? "#FFFCF4" : "#1F160E", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
              {signedIn ? accountInitials : <IcoUser />}
            </Link>
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ display: "inline-flex", alignItems: "center", background: "transparent", border: 0, cursor: "pointer", color: "#1F160E", padding: "8px 0 8px 4px" }}>
              <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="1" y1="2" x2="21" y2="2" /><line x1="1" y1="8" x2="21" y2="8" /><line x1="1" y1="14" x2="21" y2="14" /></svg>
            </button>
          </div>
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
                <button onClick={() => { setMenuOpen(false); router.push(`/rooms/${room.id}`); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#B8754A", color: "#FAF7F1", border: 0, padding: 16, borderRadius: 14, font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                  Book now
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HERO — swipeable photo track. Replaces the tap-to-cycle single frame:
            a snap track is the gesture guests already expect from a listing, and
            it exposes the whole gallery without leaving the page. */}
        <div style={{ position: "relative", zIndex: 1, padding: "14px 16px 0" }}>
          <div style={{ position: "relative", borderRadius: 22, overflow: "hidden" }}>
            <div ref={mHeroRef} onScroll={onHeroScroll} className="rmv-track" style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", height: 372 }}>
              {room.images.map((src, i) => (
                <div key={i} style={{ position: "relative", flex: "0 0 100%", width: "100%", height: "100%", scrollSnapAlign: "start" }}>
                  <Image src={src} alt="" fill unoptimized sizes="100vw" priority={i === 0} style={{ objectFit: "cover" }} />
                </div>
              ))}
            </div>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(31,22,14,.34) 0%, rgba(31,22,14,0) 30%, rgba(31,22,14,.55) 100%)" }} />
            <div style={{ position: "absolute", top: 14, left: 14, right: 14, display: "flex", justifyContent: "space-between", gap: 8, pointerEvents: "none" }}>
              <button onClick={scrollToLocation} style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,.34)", background: "rgba(255,255,255,.18)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff", font: "inherit", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
                <IcoMapPin /> Grass Residences <IcoChevronRight size={12} stroke={2} />
              </button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "rgba(255,255,255,.18)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                <IcoStar size={12} /> {room.rating}
              </span>
            </div>
            <div style={{ position: "absolute", bottom: 14, left: 16, right: 16, display: "flex", alignItems: "center", justifyContent: "space-between", pointerEvents: "none" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {room.images.map((_, i) => (
                  <span key={i} style={{ width: i === heroIdx ? 18 : 5, height: 5, borderRadius: 99, background: i === heroIdx ? "#fff" : "rgba(255,255,255,.45)", transition: "width .25s ease, background .25s ease" }} />
                ))}
              </div>
              <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: ".06em", padding: "5px 10px", borderRadius: 999, background: "rgba(31,22,14,.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#fff" }}>{heroIdx + 1} / {room.images.length}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10, fontSize: 11.5, color: "#9B8B73" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Swipe through the home
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        </div>

        {/* HEADLINE */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "26px 24px 0" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".2em", color: "#8C5A2E" }}>A staycation in the sky</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 42, lineHeight: 0.98, letterSpacing: "-.03em", margin: "14px 0 0" }}>The city, <em style={{ color: "#8C5A2E" }}>on pause.</em></h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#4A3A2A", margin: "14px 0 0", textWrap: "pretty" }}>One quiet home on the 12th floor of Grass Residences. Book by the hour, check in within minutes, leave rested.</p>
        </div>

        {/* SNAPSHOT — the four facts guests check before any price. */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "22px 24px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#E0CEB2", borderRadius: 18, overflow: "hidden" }}>
            {[
              { h: room.size || "28 sqm", s: "1 bedroom · balcony" },
              { h: `Up to ${room.capacity}`, s: "2 included · ₱200 each" },
              { h: "10 or 22 hrs", s: "Pick your window" },
              { h: `₱${Math.min(room.price10hr, room.price21hr).toLocaleString()}`, s: "Starting rate" },
            ].map((item, i) => (
              <div key={item.h} style={{ background: "#FFFCF4", padding: "16px 16px 14px" }}>
                <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, border: "1px solid #E0CEB2", color: "#8C5A2E", marginBottom: 11 }}><SnapshotIcon i={i} /></span>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1 }}>{item.h}</div>
                <div style={{ fontSize: 12, color: "#6B5C4A", marginTop: 5 }}>{item.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* OFFERS */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "22px 24px 0" }}>
          <PromoBanner promotions={activePromotions} roomId={room.id} rates={room} variant="mobile" />
        </div>

        {/* CHOOSE YOUR TIME — dark band, matching the desktop "Pick your window"
            section. Tapping a card selects it; the sticky bar below then quotes
            that window's price and carries the guest through to checkout. */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, marginTop: 30, background: "#1F160E", color: "#FFFCF4", padding: "30px 24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", color: "#D4A96A", whiteSpace: "nowrap" }}>Choose your time</span>
            <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(212,169,106,.55), rgba(212,169,106,0))" }} />
          </div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 32, letterSpacing: "-.03em", lineHeight: 0.98, margin: "14px 0 0" }}>Pick the <em style={{ color: "#D4A96A" }}>time</em> that fits your day.</h2>
          <svg data-flourish viewBox="0 0 220 14" style={{ display: "block", width: 190, height: 14, marginTop: 6, overflow: "visible" }}>
            <path d="M2 9c34 5 74 3 104-2 26-4 66-5 112 3" fill="none" stroke="#D4A96A" strokeWidth="2" strokeLinecap="round" strokeDasharray="300" strokeDashoffset="300" />
          </svg>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,252,.68)", margin: "12px 0 0", textWrap: "pretty" }}>
            Prices below depend on which day you check in. Tell us which kind of day, and we&rsquo;ll show the right price.
          </p>

          <div role="group" aria-label="Rate type" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 18, padding: 4, borderRadius: 16, background: "rgba(255,252,244,.08)" }}>
            {[
              { on: false, title: "Weekday", sub: "Sun – Thu" },
              { on: true, title: "Weekend & Holiday", sub: "Fri – Sat" },
            ].map((opt) => {
              const active = weekendRates === opt.on;
              return (
                <button key={opt.title} type="button" onClick={() => setWeekendRates(opt.on)} aria-pressed={active}
                  style={{ border: "none", cursor: "pointer", font: "inherit", padding: "11px 8px", borderRadius: 12, transition: "background .18s ease", background: active ? "#B0754A" : "transparent", color: "#FFFCF4" }}>
                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{opt.title}</span>
                  <span style={{ display: "block", fontSize: 11.5, marginTop: 2, opacity: 0.72 }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {displayWindows.map((w, i) => {
              const { base, net, cut } = winPrice(i);
              return (
                // A link, not a select-then-confirm button: one tap goes
                // straight to the room page with this window preselected (and
                // the offer code attached when one applies). The press state
                // lives in CSS :active so the card still lights up under the
                // thumb on the way out.
                <Link key={i} href={winHref(i)} data-card="stay" className="rmv-staycard">
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, background: "rgba(212,169,106,.14)", border: "1px solid rgba(212,169,106,.28)", color: "#D4A96A", fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 9.5, letterSpacing: ".14em" }}>
                      <StayBadgeIcon i={i} />
                      {spanHours(w.checkIn, w.checkOut) ?? w.stayType}-HOURS
                    </span>
                    <span className="rmv-staycard__arrow">
                      <IcoArrowRight size={14} />
                    </span>
                  </span>
                  <span style={{ display: "block", fontFamily: "'Fraunces', serif", fontSize: 26, letterSpacing: "-.02em", lineHeight: 1.05, marginTop: 14 }}>{w.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,252,.62)", marginTop: 8 }}>
                    <IcoClock /> {w.checkIn} → {w.checkOut}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 14, padding: "13px 0", borderTop: "1px solid rgba(212,169,106,.16)" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,252,.5)" }}>From</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      {cut && <span style={{ fontSize: 12.5, color: "rgba(255,255,252,.45)", textDecoration: "line-through" }}>{pesoAmount(base)}</span>}
                      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.015em", color: cut ? "#D4A96A" : "#FFFCF4" }}>{pesoAmount(net)}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,252,.6)", marginTop: 14 }}>
            Weekends and holidays cost a little more. Extra guests beyond 2 are ₱200 each. We&rsquo;ll show the full price before you book.
          </div>
        </div>

        {/* ABOUT THIS HOME */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "34px 24px 0" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", color: "#8C5A2E" }}>About this home</div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 30, lineHeight: 1.02, letterSpacing: "-.025em", margin: "12px 0 0" }}>A corner of the sky, <em>set aside for you.</em></h2>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "#4A3A2A", margin: "14px 0 0", textWrap: "pretty" }}>{room.description}</p>
          {aboutOpen && (
            <p style={{ fontSize: 14, lineHeight: 1.65, color: "#4A3A2A", margin: "12px 0 0", textWrap: "pretty" }}>
              We keep it small on purpose — one home, obsessively looked after, so every guest gets the version we&rsquo;d want to stay in ourselves. Hosted since 2022.
            </p>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
            {["Balcony", "City view", "Swimming pool", "Garden"].map((t) => (
              <span key={t} style={{ flex: "0 1 auto", minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 9px", fontSize: 11, fontWeight: 500, borderRadius: 999, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#4A3A2A", whiteSpace: "nowrap" }}>
                <span style={{ color: "#8C5A2E", display: "inline-flex", flex: "none" }}><AboutTagIcon label={t} /></span>
                {t}
              </span>
            ))}
          </div>
          <button type="button" onClick={() => setAboutOpen((v) => !v)}
            style={{ marginTop: 14, background: "transparent", border: 0, padding: "4px 0", font: "inherit", fontSize: 13, fontWeight: 600, color: "#8C5A2E", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {aboutOpen ? "Show less" : "Read more about the home"}
            <span style={{ display: "inline-flex", transition: "transform .25s ease", transform: aboutOpen ? "rotate(180deg)" : "none" }}><IcoChevronDown size={14} /></span>
          </button>
        </div>

        {/* PHOTO COLLAGE — the same Photo Tour shots the desktop about-grid uses. */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, marginTop: 18, padding: "0 24px" }}>
          {room.aboutPhotos[0] && (
            <figure style={{ margin: 0 }}>
              <div style={{ position: "relative", width: "100%", height: 216, borderRadius: 18, overflow: "hidden" }}>
                <Image src={room.aboutPhotos[0].src} alt={room.aboutPhotos[0].alt} fill unoptimized sizes="100vw" style={{ objectFit: "cover" }} />
              </div>
              <figcaption style={{ fontSize: 11.5, color: "#8B7458", marginTop: 8 }}>{room.aboutPhotos[0].alt}</figcaption>
            </figure>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            {room.aboutPhotos.slice(1, 3).map((p) => (
              <figure key={p.src} style={{ margin: 0 }}>
                <div style={{ position: "relative", width: "100%", height: 150, borderRadius: 18, overflow: "hidden" }}>
                  <Image src={p.src} alt={p.alt} fill unoptimized sizes="50vw" style={{ objectFit: "cover" }} />
                </div>
                <figcaption style={{ fontSize: 11.5, color: "#8B7458", marginTop: 8, lineHeight: 1.35 }}>{p.alt}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* WHAT'S INSIDE → FOOTER — one continuous boho background, the same
            treatment the desktop section uses: the artwork tiled at its natural
            scale (fixed width, auto height, repeat-y) rather than stretched, so
            the motifs repeat down the run instead of blowing up over a block
            far taller than the image's own 1718:915 ratio. Painted once on this
            wrapper so there's no seam where the sections meet. */}
        <div style={{
          position: "relative",
          zIndex: 1,
          backgroundColor: "#F3E7D7",
          backgroundImage: "url(/images/about-bg.png)",
          backgroundSize: "100% auto",
          backgroundRepeat: "repeat-y",
          backgroundPosition: "top center",
        }}>

        {/* WHAT'S INSIDE — the full amenity list, collapsed to four until asked. */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "34px 24px 0" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 23, margin: 0, letterSpacing: "-.01em" }}>What&rsquo;s inside</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "#6B5C4A", margin: "10px 0 0", textWrap: "pretty" }}>
            Kitchenette, balcony, Netflix, videoke — and a welcome pack that means you can walk in with just a backpack.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
            {AMENITIES.slice(0, amenOpen ? AMENITIES.length : 4).map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 11, background: "#FFFCF4", border: "1px solid #EFE4CE", borderRadius: 14, padding: "12px 13px" }}>
                  <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "#EFE4CE", color: "#6B3F1C", display: "grid", placeItems: "center" }}><Icon /></span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{a.label}</span>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setAmenOpen((v) => !v)}
            style={{ marginTop: 12, width: "100%", padding: 13, borderRadius: 14, border: "1px solid #D4BE9A", background: "transparent", font: "inherit", fontSize: 13.5, fontWeight: 600, color: "#8C5A2E", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {amenOpen ? "Show fewer amenities" : `Show all ${AMENITIES.length} amenities`}
            <span style={{ display: "inline-flex", transition: "transform .25s ease", transform: amenOpen ? "rotate(180deg)" : "none" }}><IcoChevronDown size={15} /></span>
          </button>
          {/* Translucent, like the desktop welcome-pack panel — a solid fill
              here would punch a hole in the illustration behind it. */}
          <div style={{ marginTop: 16, padding: 18, background: "rgba(239,228,206,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", borderRadius: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "#1F160E", marginBottom: 12 }}>On the house</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {WELCOME_PACK.map((p) => (
                <div key={p} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ color: "#8C5A2E", display: "inline-flex" }}><IcoCheck /></span> {p}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* WHERE YOU'LL BE — map, directions, and the walking distances that
            answer "how far is it really" without a trip to /location. */}
        <div ref={mLocationRef} data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "34px 24px 0", scrollMarginTop: 76 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", color: "#8C5A2E" }}>Where you&rsquo;ll be</div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 29, lineHeight: 1.02, letterSpacing: "-.025em", margin: "12px 0 0" }}>Tower 4,<br />Grass Residences.</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4A3A2A", margin: "12px 0 0", textWrap: "pretty" }}>SM North EDSA, EDSA cor. Mother Ignacia Ave, Quezon City, 1105 Metro Manila.</p>
          <div style={{ marginTop: 16, borderRadius: 20, overflow: "hidden", border: "1px solid #E0CEB2", background: "#EFE4CE" }}>
            <div ref={mMapRef} style={{ width: "100%", height: 216 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#E0CEB2" }}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${MAP_COORDS[0]},${MAP_COORDS[1]}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 10px", background: "#FFFCF4", color: "#1F160E", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                <IcoNavigate /> Get directions
              </a>
              <button type="button" onClick={copyAddress}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 10px", background: "#FFFCF4", border: 0, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 600, color: "#1F160E" }}>
                <span style={{ color: "#B07848", display: "inline-flex" }}><IcoCopy size={15} /></span>
                {addrCopied ? "Address copied" : "Copy address"}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 18, borderTop: "1px solid #E0CEB2" }}>
            {MOBILE_TRANSIT.map((t) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0", borderBottom: "1px solid #E0CEB2" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
                <span style={{ fontSize: 12, color: "#8B7458", fontFamily: "'Geist Mono', ui-monospace, monospace", whiteSpace: "nowrap" }}>{t.meta}</span>
              </div>
            ))}
          </div>
          {/* One row, all four visible. Sized to the same 11px chip the About
              tags above use, which is what lets four of them sit across a phone
              without wrapping or running off the edge. overflow-x is a safety
              net for very narrow screens, not the intended reading. */}
          <div className="rmv-track" style={{ display: "flex", flexWrap: "nowrap", gap: 6, marginTop: 16, overflowX: "auto" }}>
            {MOBILE_NEARBY.map((n) => (
              <span key={n} style={{ flex: "0 1 auto", minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 10px", fontSize: 11, fontWeight: 500, borderRadius: 999, border: "1px solid #D4BE9A", background: "#FFFCF4", color: "#4A3A2A", whiteSpace: "nowrap" }}>{n}</span>
            ))}
          </div>
        </div>

        {/* GUESTS SAY — swipeable review cards. No band fill of its own: the
            reviews sit on the shared boho wash, same as the desktop section. */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, marginTop: 34, padding: "30px 0" }}>
          <div style={{ padding: "0 24px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", color: "#8C5A2E" }}>Guests say</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 28, letterSpacing: "-.025em", lineHeight: 1, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
              <IcoStar size={24} /> {room.rating} from {room.reviewCount} stays
            </h2>
          </div>
          <div ref={mRevRef} onScroll={onRevScroll} className="rmv-track" style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "18px 24px 4px" }}>
            {mockReviews.map((r) => (
              <div key={r.id} style={{ flex: "0 0 268px", scrollSnapAlign: "center", background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 18, padding: 18 }}>
                <span style={{ color: "#D4BE9A", display: "inline-flex" }}><IcoQuote /></span>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 16px", color: "#4A3A2A", textWrap: "pretty" }}>&ldquo;{r.comment}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", background: "#6B3F1C", color: "#FFFCF4", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{r.avatar}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.author}</div>
                    <div style={{ fontSize: 11, color: "#8B7458" }}>{r.date}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
            {mockReviews.map((r, i) => (
              <span key={r.id} style={{ width: i === revIdx ? 18 : 5, height: 5, borderRadius: 99, background: i === revIdx ? "#8C5A2E" : "#D4BE9A", transition: "width .25s ease, background .25s ease" }} />
            ))}
          </div>
        </div>

        {/* FINAL CTA */}
        <div data-rise className="rmv-rise" style={{ position: "relative", zIndex: 1, padding: "40px 24px 34px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 38, letterSpacing: "-.03em", lineHeight: 0.98, margin: 0 }}>Ready to <em style={{ color: "#8C5A2E" }}>pause?</em></h2>
          <p style={{ fontSize: 14.5, color: "#4A3A2A", lineHeight: 1.55, margin: "14px 0 20px", textWrap: "pretty" }}>Our calendar fills up 2&ndash;3 weeks out. Pick your window and we&rsquo;ll hold it.</p>
          <Link href={`/rooms/${room.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 26px", borderRadius: 999, background: "#B07848", color: "#FFFCF4", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            See the home · Book now <IcoArrowRight size={17} />
          </Link>
        </div>

        {/* FOOTER */}
        <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid #E0CEB2", padding: "28px 24px 30px" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1 }}>Come home to <em>rest.</em></div>
          <p style={{ fontSize: 12.5, color: "#4A3A2A", lineHeight: 1.6, margin: "12px 0 0", textWrap: "pretty" }}>
            One staycation unit at Grass Residences, SM North EDSA, Quezon City. Book by the hour. Leave rested.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", fontWeight: 600, marginBottom: 12 }}>Stay</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
                <Link href={`/rooms/${room.id}?win=0`} style={{ color: "#4A3A2A", textDecoration: "none" }}>10-Hour Daycation</Link>
                <Link href={`/rooms/${room.id}?win=1`} style={{ color: "#4A3A2A", textDecoration: "none" }}>10-Hour Nightcation</Link>
                <Link href={`/rooms/${room.id}?win=2`} style={{ color: "#4A3A2A", textDecoration: "none" }}>22-Hour Full Stay</Link>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", fontWeight: 600, marginBottom: 12 }}>Social Media</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
                <a href="https://www.facebook.com/profile.php?id=61557644293485" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A3A2A", textDecoration: "none" }}><IcoFacebook /> Facebook</a>
                <a href="https://www.tiktok.com/@dluxhomes2024/video/7631110590492101906" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A3A2A", textDecoration: "none" }}><IcoTikTok /> TikTok</a>
                <a href="https://www.instagram.com/homesdlux/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A3A2A", textDecoration: "none" }}><IcoInstagram /> Instagram</a>
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", color: "#1F160E", fontWeight: 600, marginBottom: 12 }}>Contact</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
                <a href="mailto:homesdlux@gmail.com" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A3A2A", textDecoration: "none" }}><IcoMail /> homesdlux@gmail.com</a>
                <Link href="/location" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#4A3A2A", textDecoration: "none" }}><IcoMapPin /> Tower 4, Grass Residences, QC</Link>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid #E0CEB2", display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "#8B7458" }}>
            <div>© 2026 D&rsquo; Lux Homes · Metro Manila, PH</div>
            <div>Made with care for rest.</div>
          </div>
        </footer>

        </div>{/* end boho-background run */}

        {/* BOTTOM BAR — quotes the picked window (or the starting rate) so the
            price the guest is about to commit to is never off-screen. */}
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "rgba(250,247,241,.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid #ECE5D4", padding: "12px 18px calc(16px + env(safe-area-inset-bottom))", boxShadow: "0 -12px 30px -18px rgba(20,15,9,.35)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: "none" }}>
            <div style={{ fontSize: 10.5, color: "#8B7458" }}>{bar.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {bar.was && <span style={{ fontSize: 12.5, color: "#9B8B73", textDecoration: "line-through" }}>{bar.was}</span>}
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em" }}>{bar.price}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#8C5A2E", marginTop: 1 }}>{bar.sub}</div>
          </div>
          <button onClick={() => router.push(bar.href)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#B8754A", color: "#FAF7F1", border: 0, padding: 15, borderRadius: 14, font: "inherit", fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
            {bar.cta}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>

      {/* ═══════════ DESKTOP (hidden on mobile) ═══════════ */}
      <div className="rm-desktop">
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
            <Link href="/location" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(255,255,255,.15)", backdropFilter: "blur(10px)", fontSize: 12, fontWeight: 600, color: "inherit", textDecoration: "none", cursor: "pointer" }}>
              <IcoMapPin /> {room.location}
            </Link>
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
              One quiet home on the 12th floor of Grass Residences. Book by the hour. Check in in minutes. Leave rested.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => document.getElementById("book-section")?.scrollIntoView({ behavior: "smooth" })}
                className="checkavail-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}>
                Check availability <IcoArrowRight size={18} />
              </button>
              <button onClick={() => setWished((w) => !w)}
                className="savestay-btn"
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

      {/* SNAPSHOT STRIP + EDITORIAL 2-COL — share one continuous background so
          the illustration doesn't visibly seam between the two sections. The
          scroll-reveal ref sits on the about-grid content below (not this
          whole tall wrapper), so the fade-in still fires once that content is
          actually the thing in view rather than the snapshot strip above it. */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          minHeight: "min(53vw, 46vh)",
          backgroundColor: "#F3E7D7",
          backgroundImage: "url(/images/about-bg.png)",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "40px 28px 0" }}>
          <div className="hm-4col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, paddingBottom: 32, borderBottom: "1px solid var(--line-2)" }}>
            {[
              { h: "28 sqm", s: "1 bedroom · balcony" },
              { h: "Up to 4", s: "Full double + pull-out" },
              { h: "10 or 22 hrs", s: "Pick your window" },
              { h: `₱${Math.min(room.price10hr, room.price21hr).toLocaleString()}`, s: "Starting rate" },
            ].map((item, i) => (
              <div key={item.h} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: "none", width: 44, height: 44, borderRadius: 12, border: "1px solid var(--dlux-accent)", background: "var(--white)", boxShadow: "var(--shadow-sm)", display: "grid", placeItems: "center", color: "var(--accent-deep)" }}>
                  <SnapshotIcon i={i} />
                </div>
                <div>
                  <div className="serif" style={{ fontSize: 30, fontWeight: 400, letterSpacing: "-.02em", lineHeight: 1, color: "var(--ink)" }}>{item.h}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{item.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "80px 28px" }}>
        <div ref={aboutRef} className={`about-grid${aboutVisible ? " about-grid--in" : ""}`} style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 80, alignItems: "center" }}>
          <div className="about-copy">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 18 }}>About this home</div>
            <h2 className="serif hm-h2" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: 0 }}>
              A corner of the sky, <em>set aside for you.</em>
            </h2>
            <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.7, marginTop: 20 }}>{room.description}</p>
            <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.7, marginTop: 16 }}>
              We keep it small on purpose — one home, obsessively looked after, so every guest gets the version we&apos;d want to stay in ourselves. Hosted since 2022.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Balcony", "City view", "Swimming pool", "Garden"].map((t, i) => (
                <span key={t} className="about-tag" style={{ transitionDelay: `${300 + i * 90}ms`, display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", fontSize: 13, fontWeight: 500, borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--white)", color: "var(--ink-2)" }}>
                  <span className="about-tag__icon" style={{ color: "var(--dlux-accent)", display: "inline-flex" }}><AboutTagIcon label={t} /></span>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoRows: "118px", gridAutoFlow: "dense", gap: 16 }}>
            {room.aboutPhotos.map((p, i) => (
              <div
                key={i}
                className="about-photo"
                style={{ transitionDelay: `${120 + i * 100}ms`, borderRadius: 20, overflow: "hidden", background: "var(--bg-2)", gridRow: `span ${i === 0 ? 3 : 2}`, position: "relative" }}
              >
                <Image className="about-photo__img" src={p.src} alt={p.alt} fill unoptimized style={{ objectFit: "cover" }} />
                <span className="about-photo__overlay" />
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* PICK YOUR WINDOW */}
      <section id="book-section" style={{ background: "var(--ink)", color: "var(--white)", padding: "80px 28px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div className="hm-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end", marginBottom: 44 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--gold)", whiteSpace: "nowrap" }}>Choose your time</span>
                <span style={{ flex: 1, maxWidth: 120, height: 1, background: "linear-gradient(to right, var(--gold), transparent)" }} />
              </div>
              <h2 className="serif hm-h2" style={{ fontSize: 64, fontWeight: 400, letterSpacing: "-.03em", lineHeight: 1.02, margin: 0 }}>
                Pick the <em style={{ fontStyle: "italic", color: "var(--gold)" }}>time</em> that fits<br />
                <span style={{ position: "relative", display: "inline-block" }}>
                  your day.
                  <svg width="100%" height="14" viewBox="0 0 320 14" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -12, width: "100%" }}>
                    <path d="M2 9c60-14 220-14 300 0" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" opacity={0.85} />
                  </svg>
                </span>
              </h2>
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <span style={{ flex: "none", width: 2, alignSelf: "stretch", background: "var(--gold)", opacity: 0.6, borderRadius: 2 }} />
              <p style={{ fontSize: 16, color: "rgba(255,255,252,.75)", lineHeight: 1.6, margin: 0 }}>
                Three simple check-in times to choose from. The prices here are for regular days &mdash; weekends and holidays cost a little more. Don&rsquo;t worry, we&rsquo;ll show you the full price before you book.
              </p>
            </div>
          </div>
          <div ref={stayCardsRef} className="hm-stay" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {displayWindows.map((w, i) => (
              <Link
                key={i}
                href={`/rooms/${room.id}?win=${i}`}
                className={`stay-card stay-card--warm${stayCardsVisible ? " stay-card--in" : ""}`}
                style={{ textDecoration: "none", transitionDelay: `${i * 110}ms` }}
              >
                <div className="stay-card__inner stay-card__inner--warm">
                  <div className="stay-card__sheen" />
                  <div className="stay-card__glow" />
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stay-card__badge">
                      <StayBadgeIcon i={i} />
                      {spanHours(w.checkIn, w.checkOut) ?? w.stayType}-hours
                    </span>
                    <span className="stay-card__arrow stay-card__arrow--warm"><IcoArrowRight size={16} /></span>
                  </div>
                  <div className="serif" style={{ position: "relative", fontSize: 36, fontWeight: 400, letterSpacing: "-.02em", marginTop: 20, lineHeight: 1 }}>{w.label}</div>
                  <div style={{ position: "relative", fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <IcoClock /> {w.checkIn} → {w.checkOut}
                  </div>
                  <div style={{ position: "relative", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.12)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>From</span>
                    {/* rateFor(), not the raw weekday field — this card sits on
                        the same page as the Weekday/Weekend toggle, and reading
                        the weekday rate directly left it frozen at ₱1,499 while
                        the toggle said Weekend. */}
                    <span style={{ fontSize: 22, fontWeight: 700 }}>₱{rateFor(w.stayType).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PROMOTIONS + AMENITIES + REVIEWS + FINAL CTA — share one continuous
          boho background, painted once on this outer section so it's a
          single image with no seam between blocks. This section runs much taller
          than the artwork's own 1718:915 ratio (amenities + promo + reviews
          stacked), and the decoration in the source image only lives near
          its top/bottom edges — a single `cover` stretch over that height
          would blow the art up and leave a long flat stretch in the middle.
          Tiling it instead (fixed-width, auto-height, repeat-y) keeps every
          tile at its natural scale and repeats the vase/plant/macramé motifs
          down the section — seamless because it's one image repeating
          against itself, not two different scaled copies meeting. */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#F3E7D7",
          backgroundImage: "url(/images/about-bg.png)",
          backgroundSize: "100% auto",
          backgroundRepeat: "repeat-y",
          backgroundPosition: "top center",
        }}
      >

        {activePromotions && activePromotions.length > 0 && (
          <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "40px 28px 0" }}>
            {/* Floating outer card — glassy rather than opaque, so the
                illustration reads through behind the promo content instead of
                being fully hidden under a solid panel. */}
            <div
              ref={promoRef}
              style={{
                background: "rgba(255,252,244,0.72)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                border: "1px solid var(--line-2)",
                borderRadius: 28,
                padding: "28px 32px",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <PromoBanner promotions={activePromotions} roomId={room.id} rates={room} variant="desktop" visible={promoVisible} />
            </div>
          </div>
        )}

        <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "48px 28px" }}>
        <div ref={amenitiesRef} className={`amen-grid${amenitiesVisible ? " amen-grid--in" : ""}`} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 64 }}>
          <div className="amen-copy">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 16 }}>What&apos;s inside</div>
            <h2 className="serif hm-h2" style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: "0 0 20px" }}>Everything you&apos;d <em>reach</em> for.</h2>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.65 }}>Kitchenette, balcony, Netflix, videoke — and a welcome pack that means you can walk in with just a backpack.</p>
            <div style={{ marginTop: 24, padding: 18, background: "rgba(239,228,206,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", borderRadius: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 12 }}>On the house</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WELCOME_PACK.map((w, i) => (
                  <div key={w} className="amen-pack" style={{ transitionDelay: `${300 + i * 80}ms`, fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#5C8A5C" }}><IcoCheck /></span> {w}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(3,1fr)",
              background: "rgba(255,252,244,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
              border: "1px solid var(--line)", borderRadius: 20, overflow: "hidden", alignSelf: "start",
            }}
          >
            {AMENITIES.map((a, i) => {
              const col = i % 3;
              const row = Math.floor(i / 3);
              const lastRow = row === Math.ceil(AMENITIES.length / 3) - 1;
              return (
                <div
                  key={a.label}
                  className="amen-tile"
                  style={{
                    transitionDelay: `${i * 70}ms`,
                    padding: "22px 20px",
                    display: "flex", flexDirection: "column", gap: 12,
                    borderRight: col < 2 ? "1px solid var(--line)" : "none",
                    borderBottom: lastRow ? "none" : "1px solid var(--line)",
                  }}
                >
                  <div className="amen-tile__icon" style={{ width: 42, height: 42, borderRadius: 12, background: "var(--bg-2)", display: "grid", placeItems: "center", color: "var(--ink-2)" }}><a.icon /></div>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: "var(--ink)" }}>{a.label}</div>
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* REVIEWS — folded into the same section as the amenities block
            above (rather than a separate <section> repainting its own copy
            of the image) so the background is one continuous, single-scaled
            illustration with no seam where the two used to meet. */}
        <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "32px 28px 80px" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 14 }}>Guests say</div>
            <h2 className="serif hm-h2" style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <IcoStar size={36} /> {room.rating} from {room.reviewCount} stays
            </h2>
          </div>
          <div ref={reviewsRef} className={`review-grid${reviewsVisible ? " review-grid--in" : ""}`} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {mockReviews.map((r, i) => (
              <div key={r.id} className="review-card" style={{ animationDelay: `${i * 120}ms`, background: "var(--white)", borderRadius: 18, padding: 22, border: "1px solid var(--line)" }}>
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

        {/* FINAL CTA — folded into the same tiling boho section as amenities
            + reviews above (rather than its own <section>) so the background
            keeps repeating without a seam where it would otherwise end. */}
        <div ref={ctaRef} className={`cta-sec${ctaVisible ? " cta-sec--in" : ""}`} style={{ position: "relative", maxWidth: 1320, margin: "0 auto", padding: "100px 28px 80px", textAlign: "center" }}>
          <h2 className="serif cta-title" style={{ fontSize: "clamp(48px,7vw,96px)", fontWeight: 400, letterSpacing: "-.03em", lineHeight: 0.95, margin: 0 }}>
            Ready to <em style={{ color: "var(--accent-ink)" }}>pause?</em>
          </h2>
          <p className="cta-text" style={{ fontSize: 17, color: "var(--ink-2)", maxWidth: 520, margin: "22px auto 32px", lineHeight: 1.55 }}>
            Our calendar fills up 2–3 weeks out. Pick your window and we&apos;ll hold it.
          </p>
          <Link href={`/rooms/${room.id}`} className="booknow-btn cta-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "var(--dlux-accent)", color: "var(--white)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            See the home · Book now <IcoArrowRight size={18} />
          </Link>
        </div>

        {/* FOOTER — folded into the same tiling boho section as everything
            above (rather than its own <footer> with a flat background and a
            border-top) so the pattern runs unbroken all the way to the page
            bottom, with no seam where it would otherwise cut off. */}
        <footer ref={footerRef} className={`footer-sec${footerVisible ? " footer-sec--in" : ""}`} style={{ position: "relative" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "48px 28px 28px" }}>
          <div className="hm-foot" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40 }}>
            <div className="footer-col" style={{ animationDelay: "0ms" }}>
              <div className="serif" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1 }}>Come home to <em>rest.</em></div>
              <p style={{ color: "var(--ink)", fontSize: 13, maxWidth: 360, marginTop: 12, lineHeight: 1.6 }}>
                One staycation unit at Grass Residences, SM North EDSA, Quezon City. Book by the hour. Leave rested.
              </p>
            </div>
            {[
              {
                h: "Stay",
                items: [
                  { label: "10-Hour Daycation", href: `/rooms/${room.id}?win=0` },
                  { label: "10-Hour Nightcation", href: `/rooms/${room.id}?win=1` },
                  { label: "22-Hour Full Stay", href: `/rooms/${room.id}?win=2` },
                ],
              },
              {
                h: "Social Media",
                items: [
                  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61557644293485", icon: <IcoFacebook /> },
                  { label: "TikTok", href: "https://www.tiktok.com/@dluxhomes2024/video/7631110590492101906", icon: <IcoTikTok /> },
                  { label: "Instagram", href: "https://www.instagram.com/homesdlux/", icon: <IcoInstagram /> },
                ],
              },
              {
                h: "Contact",
                items: [
                  { label: "homesdlux@gmail.com", href: "mailto:homesdlux@gmail.com", icon: <IcoMail /> },
                  { label: "Tower 4, Grass Residences, QC", href: "/location", icon: <IcoMapPin /> },
                ],
              },
            ].map((col, i) => (
              <div key={col.h} className="footer-col" style={{ animationDelay: `${(i + 1) * 110}ms` }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink)", marginBottom: 14, fontWeight: 600 }}>{col.h}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {col.items.map((item) =>
                    typeof item === "string" ? (
                      <li key={item} className="footer-link" style={{ fontSize: 13, color: "var(--ink)" }}>{item}</li>
                    ) : item.href.startsWith("/") ? (
                      <li key={item.label} className="footer-link" style={{ fontSize: 13 }}>
                        <Link href={item.href} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink)", textDecoration: "none" }}>
                          {"icon" in item && item.icon}{item.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={item.label} className="footer-link" style={{ fontSize: 13 }}>
                        <a href={item.href} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink)", textDecoration: "none" }}>
                          {"icon" in item && item.icon}{item.label}
                        </a>
                      </li>
                    )
                  )}
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
      </section>
      </div>{/* end .rm-desktop */}
    </div>
  );
}
