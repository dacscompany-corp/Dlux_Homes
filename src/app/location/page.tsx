"use client";

import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

function IcoMapPin() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}

export default function LocationPage() {
  return (
    <div className="page-enter" style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--ink)" }}>
      <SiteHeader bookHref="/rooms" />

      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 28px 80px" }}>
        <Link
          href="/rooms"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28, color: "var(--ink-2)", textDecoration: "none", fontSize: 14 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          <span>Back to home</span>
        </Link>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--accent-ink)", marginBottom: 16 }}>Where you&apos;ll stay</div>
        <h1 className="serif" style={{ fontSize: "clamp(36px,5vw,52px)", fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: "0 0 24px" }}>
          Find us on the map.
        </h1>
        <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)" }}>
          <iframe
            title="D' Lux Homes location — Grass Residences Tower 4, Quezon City"
            src="https://www.google.com/maps?q=Tower+4+Grass+Residences,+SM+North+EDSA,+Quezon+City&z=19&output=embed&iwloc=A"
            width="100%"
            height="480"
            style={{ border: 0, display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {/* Interaction blocker — keeps the map at a fixed view so the pin below never drifts from the address */}
          <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "transparent" }} />
          {/* Brand pin overlay — marks the property location on the map */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "14px 14px 14px 3px",
              background: "#1F160E", color: "#FAF7F1",
              display: "grid", placeItems: "center",
              fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26,
              boxShadow: "0 8px 20px rgba(31,22,14,.45)",
              border: "2px solid #FAF7F1",
              transform: "rotate(-45deg)",
            }}>
              <span style={{ transform: "rotate(45deg)" }}>D</span>
            </div>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(31,22,14,.3)", marginTop: 3 }} />
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 14 }}>
          This map is fixed on our exact address. Want to zoom, pan, or get directions?
        </p>
        <a
          href="https://www.google.com/maps/search/?api=1&query=Tower+4+Grass+Residences,+SM+North+EDSA,+Quezon+City"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13.5, color: "var(--accent-ink)", fontWeight: 600, textDecoration: "underline" }}
        >
          <IcoMapPin /> Open in Google Maps
        </a>
      </section>
    </div>
  );
}
