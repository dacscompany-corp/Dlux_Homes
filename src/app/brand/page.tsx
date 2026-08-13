"use client";

import { useEffect, useState } from "react";
import DluxMark, { type DluxMarkAccent } from "@/components/brand/DluxMark";
import DluxLoader from "@/components/brand/DluxLoader";

/**
 * Brand mark reference sheet — the "Logo System" design file, implemented.
 *
 * Shows every form of the mark (full / compact / icon, clay / gold, on cream
 * and on dark), the derived assets that come off it (favicon sizes, avatar,
 * loader), and the header-collapse behaviour the storefront bar uses. The
 * controls at the top drive the primary stage so the mark can be checked in
 * each palette and on either ground without editing code.
 *
 * This page carries the design file's own palette rather than the app tokens in
 * globals.css — it is documenting the brand asset, not the product UI.
 */

const CREAM = "#faf7f1";
const LINE = "#ece5d4";
const INK = "#1f1b16";
const BODY = "#544a3a";
const MUTED = "#8a8276";
const NIGHT = "#0b0906";
const CLAY = "#b8754a";
const GOLD = "#d4a96a";

const SERIF = "var(--font-instrument-serif), Georgia, serif";
const SANS = "var(--font-geist-sans), system-ui, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

const BTN: React.CSSProperties = {
  font: "inherit",
  fontSize: 13.5,
  padding: "11px 18px",
  borderRadius: 2,
  cursor: "pointer",
  letterSpacing: ".01em",
  whiteSpace: "nowrap",
  flex: "none",
  lineHeight: 1.2,
};
const GHOST_BTN: React.CSSProperties = { ...BTN, background: "transparent", border: `1px solid #e1d8c6`, color: INK };
const SOLID_BTN: React.CSSProperties = { ...BTN, background: CLAY, border: `1px solid ${CLAY}`, color: CREAM };

const EYEBROW: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: ".2em",
  textTransform: "uppercase",
};

/** Spec-table row: label left, value right, hairline under. */
function SpecRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        borderBottom: last ? "none" : `1px solid ${LINE}`,
        padding: "8px 0",
      }}
    >
      <span>{label}</span>
      <span style={{ color: INK }}>{value}</span>
    </div>
  );
}

export default function BrandPage() {
  const [accent, setAccent] = useState<DluxMarkAccent>("clay");
  const [dark, setDark] = useState(false);
  // Bumping this remounts the stage mark, which restarts its build-in.
  const [stageKey, setStageKey] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [narrow, setNarrow] = useState(false);

  // The sheet is laid out for a desktop canvas; on a phone the fixed mark
  // widths would overflow, so they step down instead of scrolling sideways.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const accentHex = accent === "gold" ? GOLD : CLAY;
  // Clay disappears into the night ground, so the dark stage always shows gold.
  const stageAccent: DluxMarkAccent = dark && accent === "clay" ? "gold" : accent;
  const collapsed = scroll > 60;

  return (
    <div
      className="bp-page"
      style={{ fontFamily: SANS, color: INK, background: CREAM, minHeight: "100vh" }}
    >
      {/* ── Masthead + controls ─────────────────────────────── */}
      <div
        className="bp-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 32,
          paddingBottom: 22,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div>
          <div style={{ ...EYEBROW, color: "#9a6840" }}>Brand mark</div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: narrow ? 34 : 52, lineHeight: 1.05, margin: "14px 0 0" }}>
            The D&rsquo;Lux Homes mark, in motion
          </h1>
        </div>
        <div className="bp-controls">
          <button
            style={GHOST_BTN}
            onClick={() => {
              setAccent((a) => (a === "clay" ? "gold" : "clay"));
              setStageKey((k) => k + 1);
            }}
          >
            Accent: {accent === "gold" ? "Gold" : "Clay"}
          </button>
          <button
            style={GHOST_BTN}
            onClick={() => {
              setDark((d) => !d);
              setStageKey((k) => k + 1);
            }}
          >
            {dark ? "On dark" : "On cream"}
          </button>
          <button style={SOLID_BTN} onClick={() => setStageKey((k) => k + 1)}>
            Replay build-in
          </button>
        </div>
      </div>

      {/* ── Primary lockup on stage ─────────────────────────── */}
      <div className="bp-stage" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div
          className="bp-stage-canvas"
          style={{ background: dark ? NIGHT : "transparent", transition: "background .35s ease" }}
        >
          <DluxMark
            key={`stage-${stageKey}`}
            layout="full"
            accent={stageAccent}
            dark={dark}
            width={narrow ? 260 : 430}
          />
        </div>
        <div className="bp-side" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div style={{ ...EYEBROW, color: "#9a6840" }}>Primary lockup</div>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: "12px 0 0", maxWidth: "34ch", color: BODY, textWrap: "pretty" }}>
              Hover the mark: the roof lifts clear of the wordmark and the window catches light. At rest the panes keep a
              slow four-second glow &mdash; the house is occupied. Click to replay the build-in.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 13, color: BODY }}>
            <SpecRow label="Wordmark" value="Instrument Serif" />
            <SpecRow label="Support" value="Geist Mono · .30em" />
            <SpecRow label="Clay" value="#B8754A" />
            <SpecRow label="Splash gold" value="#D4A96A" last />
          </div>
        </div>
      </div>

      {/* ── Compact form, both grounds ──────────────────────── */}
      <div className="bp-two" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="bp-cell-l" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ ...EYEBROW, color: MUTED }}>Clay &mdash; site chrome</div>
          <DluxMark layout="compact" accent="clay" width={narrow ? 270 : 400} />
        </div>
        <div
          className="bp-cell-r"
          style={{ display: "flex", flexDirection: "column", gap: 26, background: NIGHT, color: CREAM }}
        >
          <div style={{ ...EYEBROW, color: GOLD }}>Gold &mdash; splash &amp; dark</div>
          <DluxMark layout="compact" accent="gold" dark width={narrow ? 270 : 400} />
        </div>
      </div>

      {/* ── Derived assets: icon, avatar, favicon, loader ───── */}
      <div className="bp-four" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="bp-quad bp-quad-first">
          <div style={{ ...EYEBROW, color: MUTED }}>Icon mark</div>
          <DluxMark layout="icon" accent={accent} width={140} />
        </div>

        <div className="bp-quad bp-side">
          <div style={{ ...EYEBROW, color: MUTED }}>Avatar</div>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              background: NIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DluxMark layout="icon" accent="gold" width={62} />
          </div>
        </div>

        <div className="bp-quad bp-side">
          <div style={{ ...EYEBROW, color: MUTED }}>Favicon 32 / 24 / 16</div>
          {/* The roof alone survives to 16px — panes and chimney are dropped and
              the stroke thickens as the box shrinks. */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
            <svg viewBox="0 0 280 130" style={{ width: 32, height: "auto" }} aria-hidden="true">
              <polyline points="20,112 140,20 260,112" fill="none" stroke={accentHex} strokeWidth="26" />
            </svg>
            <svg viewBox="0 0 280 130" style={{ width: 24, height: "auto" }} aria-hidden="true">
              <polyline points="20,112 140,20 260,112" fill="none" stroke={accentHex} strokeWidth="30" />
            </svg>
            <svg viewBox="0 0 280 130" style={{ width: 16, height: "auto" }} aria-hidden="true">
              <polyline points="20,110 140,24 260,110" fill="none" stroke={accentHex} strokeWidth="38" />
            </svg>
          </div>
        </div>

        <div className="bp-quad bp-side bp-quad-last">
          <div style={{ ...EYEBROW, color: MUTED }}>Loader</div>
          {/* The real component, not a copy of it — this panel is the spec for
              what /rooms and /my-bookings actually render while they wait. */}
          <DluxLoader accent={accent} />
        </div>
      </div>

      {/* ── Header collapse demo ────────────────────────────── */}
      <div className="bp-collapse" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="bp-cell-l">
          <div style={{ ...EYEBROW, color: MUTED, marginBottom: 22 }}>Header collapse &mdash; 72px bar</div>
          <div
            onScroll={(e) => {
              const y = e.currentTarget.scrollTop;
              // Only re-render on meaningful movement, and always settle at the top.
              if (Math.abs(y - scroll) > 4 || y < 4) setScroll(y);
            }}
            style={{
              height: 340,
              // Both axes: the sticky bar can't shrink past its own contents, so
              // it has to scroll inside the panel rather than widen the page.
              overflow: "auto",
              border: `1px solid ${LINE}`,
              background: CREAM,
              boxShadow: "0 24px 60px -30px rgba(40,30,18,.3)",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: CREAM,
                borderBottom: `1px solid ${LINE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
                padding: `${collapsed ? 12 : 24}px 26px`,
                transition: "padding .3s ease",
              }}
            >
              <DluxMark
                layout={collapsed ? "compact" : "full"}
                accent={accent}
                width={collapsed ? (narrow ? 220 : 280) : narrow ? 190 : 230}
                ambient={false}
              />
              <div style={{ display: "flex", gap: 22, fontSize: 13.5, color: BODY, alignItems: "center" }}>
                <span className="bp-navlink">Location</span>
                <span className="bp-navlink">My bookings</span>
                <span style={SOLID_BTN}>Book now</span>
              </div>
            </div>
            <div style={{ padding: "38px 26px 60px", display: "flex", flexDirection: "column", gap: 24 }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 38, lineHeight: 1.15, margin: 0, maxWidth: "22ch" }}>
                A staycation should feel like arriving somewhere you already know.
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: "52ch", color: BODY, textWrap: "pretty" }}>
                Scroll this panel: the full lockup gives up its rules and subline, then settles into the compact
                horizontal at the 72px bar height the storefront header already uses.
              </p>
              <div style={{ height: 1, background: LINE }} />
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: "52ch", color: MUTED, textWrap: "pretty" }}>
                The compact form is the working mark &mdash; app bar, keycards, confirmation mail. The full lockup stays
                for the splash, print and signage.
              </p>
              <div style={{ height: 200 }} />
            </div>
          </div>
        </div>
        <div className="bp-side" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...EYEBROW, color: "#9a6840" }}>States</div>
          <div style={{ fontSize: 13, color: BODY }}>
            <SpecRow label="Rest" value="Glow 4.5s" />
            <SpecRow label="Hover" value="Roof −5px" />
            <SpecRow label="Load" value="Rise 10px / 500ms" />
            <SpecRow label="Collapsed" value="72px bar" last />
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: MUTED, margin: "14px 0 0", textWrap: "pretty" }}>
            All motion drops under <span style={{ fontFamily: MONO }}>prefers-reduced-motion</span>.
          </p>
        </div>
      </div>

      {/* ── Sign-off ────────────────────────────────────────── */}
      <div
        className="bp-signoff"
        style={{
          background: NIGHT,
          color: CREAM,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 40,
          flexWrap: "wrap",
        }}
      >
        <DluxMark layout="full" accent="gold" dark width={narrow ? 250 : 380} />
        <div style={{ fontFamily: SERIF, fontSize: narrow ? 32 : 42, lineHeight: 1.15, maxWidth: "16ch", textAlign: "right" }}>
          Your place to stay.
        </div>
      </div>

      <style>{`
        .bp-page { padding: 56px 60px 90px; }
        .bp-page button:hover { filter: brightness(.96); }
        .bp-navlink { cursor: default; }

        .bp-stage    { display: grid; grid-template-columns: 1fr 330px; }
        .bp-two      { display: grid; grid-template-columns: 1fr 1fr; }
        .bp-four     { display: grid; grid-template-columns: repeat(4, 1fr); }
        .bp-collapse { display: grid; grid-template-columns: 1fr 300px; }
        /* Grid items are min-width:auto by default, so any cell holding content
           that refuses to shrink drags the whole sheet wider than the viewport. */
        .bp-stage > *, .bp-two > *, .bp-four > *, .bp-collapse > * { min-width: 0; }

        .bp-controls { display: flex; gap: 10px; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

        .bp-stage-canvas { padding: 70px 40px 70px 0; display: flex; align-items: center; justify-content: center; }
        .bp-cell-l  { padding: 40px 40px 40px 0; }
        /* Pulled a pixel left so the dark ground covers the divider it sits on. */
        .bp-cell-r  { padding: 40px 0 40px 40px; border-left: 1px solid ${LINE}; margin-left: -1px; }
        .bp-side    { padding: 40px 0 40px 38px; border-left: 1px solid ${LINE}; }
        .bp-quad    { padding: 36px 28px; display: flex; flex-direction: column; gap: 22px; justify-content: space-between; }
        .bp-quad-first { padding-left: 0; }
        .bp-quad-last  { padding-right: 0; }
        .bp-signoff { padding: 60px; margin: 0 -60px -90px; }

        @media (max-width: 1100px) {
          .bp-four { grid-template-columns: repeat(2, 1fr); }
          /* Row 2 starts a new line, so its first cell loses the divider. */
          .bp-four > .bp-quad:nth-child(3) { border-left: none; padding-left: 0; }
          .bp-four > .bp-quad:nth-child(2) { padding-right: 0; }
        }

        @media (max-width: 860px) {
          .bp-page { padding: 32px 20px 60px; overflow-x: hidden; }
          .bp-head { flex-direction: column; align-items: flex-start; gap: 20px; }
          .bp-controls { justify-content: flex-start; }
          .bp-stage, .bp-two, .bp-four, .bp-collapse { grid-template-columns: 1fr; }
          .bp-stage-canvas { padding: 44px 0; }
          .bp-cell-l, .bp-cell-r, .bp-side, .bp-quad {
            padding: 30px 0;
            border-left: none;
            border-top: 1px solid ${LINE};
            margin-left: 0;
          }
          /* The dark cell keeps its ground by bleeding to the page edges. */
          .bp-cell-r { padding: 30px 20px; margin: 0 -20px; border-top: none; }
          .bp-four > .bp-quad:first-child { border-top: none; }
          .bp-signoff { padding: 44px 20px; margin: 0 -20px -60px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bp-page [style*="animation"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
