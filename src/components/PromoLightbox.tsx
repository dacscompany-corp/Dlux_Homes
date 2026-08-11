"use client";

import { useEffect } from "react";

// Shared by the rooms listing and the room detail page. Both show the same
// promo artwork, so the viewer lives here rather than being copy-pasted —
// duplicated card code is what let those two screens drift apart before.

export function IcoZoom({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="16" y1="16" x2="21" y2="21" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>;
}

/**
 * Full-screen artwork viewer. The promo image is a designed banner with its
 * offer written into the picture, so a card-sized crop can only hint at it —
 * this lets the guest actually read it. Esc or a tap anywhere closes, and body
 * scroll is locked while it is open.
 */
export function PromoLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Offer artwork"
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(20,14,9,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out", animation: "promoLbIn .2s ease" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,.5)" }} />
      <button type="button" onClick={onClose} aria-label="Close"
        style={{ position: "fixed", top: 20, right: 20, width: 44, height: 44, borderRadius: 999, border: "none", background: "rgba(255,252,244,.15)", color: "#FFFCF4", font: "inherit", fontSize: 20, cursor: "pointer" }}>&times;</button>
    </div>
  );
}
