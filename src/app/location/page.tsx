"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef } from "react";
import SiteHeader from "@/components/SiteHeader";

// Tower 4, Grass Residences — [latitude, longitude]. This is an estimate; to set
// it exactly, open Google Maps, right-click the building, click the lat,lng at the
// top of the menu to copy it, and paste the two numbers here.
const COORDS: [number, number] = [14.659186800125402, 121.02701538724116];

// Branded "D" map pin as an SVG (dark teardrop, cream italic D) so it rides on a
// real map marker anchored to the coordinates and never drifts when you pan.
const PIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='58' viewBox='0 0 48 58'><path d='M24 1C11.85 1 2 10.85 2 23c0 15.5 22 34 22 34s22-18.5 22-34C46 10.85 36.15 1 24 1z' fill='#1F160E' stroke='#FAF7F1' stroke-width='2.5'/><text x='24' y='31' font-family='Georgia, serif' font-style='italic' font-weight='600' font-size='24' fill='#FAF7F1' text-anchor='middle'>D</text></svg>`;

function IcoMapPin() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}

export default function LocationPage() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    import("leaflet").then((mod) => {
      const L = mod.default;
      if (cancelled || !mapRef.current) return;

      map = L.map(mapRef.current, { scrollWheelZoom: true, maxZoom: 21 }).setView(COORDS, 18);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        // OSM's sharpest tiles stop at 19; maxNativeZoom caps the fetch there and
        // maxZoom lets Leaflet upscale those tiles for two closer (softer) steps.
        maxNativeZoom: 19,
        maxZoom: 21,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const icon = L.icon({
        iconUrl: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(PIN_SVG),
        iconSize: [48, 58],
        iconAnchor: [24, 57],
        popupAnchor: [0, -52],
      });
      L.marker(COORDS, { icon })
        .addTo(map)
        .bindTooltip("D' Lux Homes — Tower 4, Grass Residences")
        // Click the pin to zoom in on it; click again to zoom back out.
        .on("click", () => {
          const z = map?.getZoom() ?? 18;
          map?.flyTo(COORDS, z >= 20 ? 18 : 20, { duration: 0.6 });
        });
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, []);

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

        <div
          ref={mapRef}
          style={{ width: "100%", height: 480, borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)", zIndex: 0 }}
        />

        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 14 }}>
          Drag or zoom the map to explore the area. Prefer full directions?
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
