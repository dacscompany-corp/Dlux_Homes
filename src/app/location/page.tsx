"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

const COORDS: [number, number] = [14.659186800125402, 121.02701538724116];
const ADDRESS = "Tower 4, Grass Residences, SM North EDSA, Mother Ignacia Ave, Quezon City, 1105 Metro Manila";

// Branded "D" map pin as an SVG (dark teardrop, cream italic D) anchored to the coordinates.
const PIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='58' viewBox='0 0 48 58'><path d='M24 1C11.85 1 2 10.85 2 23c0 15.5 22 34 22 34s22-18.5 22-34C46 10.85 36.15 1 24 1z' fill='#1F160E' stroke='#FAF7F1' stroke-width='2.5'/><text x='24' y='31' font-family='Georgia, serif' font-style='italic' font-weight='600' font-size='24' fill='#FAF7F1' text-anchor='middle'>D</text></svg>`;

// Getting-around distances from Tower 4, Grass Residences.
const TRANSIT = [
  { name: "MRT-3 North Avenue", meta: "5 min · 400 m" },
  { name: "SM North EDSA", meta: "3 min · 250 m" },
  { name: "EDSA Carousel Busway", meta: "6 min · 500 m" },
  { name: "NAIA Airport (T3)", meta: "35 min · 18 km" },
];

const NEARBY = [
  { head: "Dining", items: ["The Block", "Restaurant Row", "Sky Garden"] },
  { head: "Shopping", items: ["SM North EDSA", "TriNoma", "Vertis North"] },
  { head: "Landmarks", items: ["QC Circle", "Mile Long", "Vertis Corp."] },
];

const PARKING = [
  "Grass Residences drop-off, Tower 4 lobby.",
  "Guest parking at SM North basement.",
  "Present booking confirmation at reception.",
];

export default function LocationPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    import("leaflet").then((mod) => {
      const L = mod.default;
      if (cancelled || !mapRef.current) return;

      // scrollWheelZoom off so scrolling the page over the map doesn't hijack it;
      // dragging, the +/- controls, and tapping the pin still zoom.
      map = L.map(mapRef.current, { scrollWheelZoom: false, maxZoom: 21 }).setView(COORDS, 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
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
        .on("click", () => {
          const z = map?.getZoom() ?? 17;
          map?.flyTo(COORDS, z >= 20 ? 17 : 20, { duration: 0.6 });
        });

      // The map sits in a grid cell that can size after init; recalc once laid out.
      setTimeout(() => map?.invalidateSize(), 120);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, []);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const card: React.CSSProperties = { background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 18, padding: 24 };
  const monoHead: React.CSSProperties = { fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".13em", textTransform: "uppercase", color: "#8B7458", marginBottom: 9 };

  return (
    <div className="page-enter" style={{ minHeight: "100vh", background: "#F6EFE2", color: "#1F160E" }}>
      <SiteHeader bookHref="/rooms" />

      <style>{`
        .lx-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: 24px; align-items: stretch; }
        .lx-mapwrap { position: relative; height: 520px; }
        .lx-lower { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 26px; }
        .lx-park { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
        .lx-nearby { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .lx-map .leaflet-container { font-family: 'Geist', system-ui, sans-serif; background: #e9e2d3; }
        @media (max-width: 900px) {
          .lx-grid { grid-template-columns: 1fr; }
          .lx-mapwrap { height: 360px; }
          .lx-lower { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .lx-park { grid-template-columns: 1fr; }
          .lx-nearby { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "36px 28px 96px" }}>
        <Link href="/rooms" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 22, color: "#6B5A44", textDecoration: "none", fontSize: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back to home
        </Link>

        <div className="lx-grid">
          {/* MAP */}
          <div className="lx-map lx-mapwrap" style={{ borderRadius: 20, overflow: "hidden", border: "1px solid #E0CEB2", zIndex: 0 }}>
            <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
          </div>

          {/* ADDRESS COLUMN */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 500, letterSpacing: ".15em", textTransform: "uppercase", color: "#8C5A2E", marginBottom: 12 }}>Where you&rsquo;ll stay</div>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 40, fontWeight: 400, letterSpacing: "-.025em", lineHeight: 1, margin: "0 0 16px" }}>Tower 4,<br />Grass Residences.</h1>
            <p style={{ fontSize: 14.5, color: "#6B5A44", margin: "0 0 20px", lineHeight: 1.55 }}>SM North EDSA, EDSA cor. Mother Ignacia Ave, Quezon City, 1105 Metro Manila.</p>

            <div style={{ display: "flex", gap: 9, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={copyAddr} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#1F160E", color: "#F6EFE2", border: 0, padding: "12px 16px", fontFamily: "inherit", fontSize: 13.5, cursor: "pointer", borderRadius: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                {copied ? "Copied" : "Copy address"}
              </button>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${COORDS[0]},${COORDS[1]}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: "#8C5A2E", border: "1px solid #D4BE9A", padding: "12px 16px", fontSize: 13.5, textDecoration: "none", borderRadius: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                Directions
              </a>
            </div>

            <div style={{ background: "#FFFCF4", border: "1px solid #E0CEB2", borderRadius: 16, padding: "8px 20px", flex: 1 }}>
              {TRANSIT.map((t, i) => (
                <div key={t.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: i < TRANSIT.length - 1 ? "1px solid #EFE4CE" : "none" }}>
                  <span style={{ fontSize: 13.5 }}>{t.name}</span>
                  <span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12, color: "#8C5A2E" }}>{t.meta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LOWER DETAIL ROW */}
        <div className="lx-lower">
          <div style={card}>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, letterSpacing: "-.01em", marginBottom: 16 }}>What&rsquo;s nearby</div>
            <div className="lx-nearby">
              {NEARBY.map((col) => (
                <div key={col.head}>
                  <div style={monoHead}>{col.head}</div>
                  <div style={{ fontSize: 13, color: "#4A3A2A", lineHeight: 1.9 }}>
                    {col.items.map((it) => <div key={it}>{it}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lx-park">
            <div style={card}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, letterSpacing: "-.01em", marginBottom: 14 }}>Parking &amp; entrance</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {PARKING.map((p) => (
                  <li key={p} style={{ display: "flex", gap: 10, fontSize: 13, color: "#4A3A2A", lineHeight: 1.45 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#B07848", flex: "none", marginTop: 6 }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: "#1F160E", color: "#F6EFE2", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, letterSpacing: "-.01em", lineHeight: 1.25 }}>Need directions?</div>
              <a href="mailto:homesdlux@gmail.com" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, background: "#F6EFE2", color: "#1F160E", padding: "11px 16px", borderRadius: 10, fontSize: 13, textDecoration: "none" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                Message host
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
