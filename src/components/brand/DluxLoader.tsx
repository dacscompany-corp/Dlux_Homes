/**
 * The D'Lux Homes loader — the roof draws itself while the window panes blink.
 *
 * Ported from the "Loader" panel of the Logo System design file. It reuses the
 * mark's exact roof geometry (same polyline, same window grid as
 * components/brand/DluxMark), so a wait still reads as the house rather than as
 * a generic spinner.
 *
 * This is for waits INSIDE an already-rendered page — a panel whose data is
 * still in flight, with the page's own chrome still around it. App entry is
 * already covered by components/SplashScreen, so putting this on a route's
 * `loading.tsx` as well would draw the same house at the guest twice.
 *
 * Deliberately hook-free, so it costs nothing to render and can sit in a server
 * component if a future caller needs it to.
 *
 * Motion lives in globals.css (`dlux-draw`, `dlux-blink`) next to the mark's
 * `dlux-glow`: the loader can appear several times on a page and a per-instance
 * <style> would duplicate the keyframes. The reduced-motion guard there pins
 * the roof drawn and the panes lit, so it still reads as "busy" when the
 * animation is off.
 */

import { accentHex, type BrandAccent } from "./palette";

export interface DluxLoaderProps {
  accent?: BrandAccent;
  /** Width of the drawn mark in px. The label scales with it. */
  width?: number;
  /** Caption beside the mark. Newlines are preserved — the design breaks it over two lines. */
  label?: string;
  /** Stacks the label under the mark and centres both. Used by the fullscreen state. */
  stacked?: boolean;
  /** Lightens the label for dark backgrounds. */
  dark?: boolean;
  className?: string;
}

const MONO = "var(--font-geist-mono), ui-monospace, monospace";
// The design specifies an 11px label against a 92px mark; every other size is
// derived from that ratio so the loader stays in proportion at any width.
const BASE_WIDTH = 92;
const BASE_LABEL = 11;

// One period for the whole loop. The panes are offset across it so the window
// lights up left-to-right, top-to-bottom as the roof closes.
const PERIOD = "2.2s";
const PANES = [
  { x: 121, y: 62, delay: "0s" },
  { x: 141, y: 62, delay: ".15s" },
  { x: 121, y: 82, delay: ".3s" },
  { x: 141, y: 82, delay: ".45s" },
];

export default function DluxLoader({
  accent = "clay",
  width = BASE_WIDTH,
  label = "Preparing\nyour stay",
  stacked = false,
  dark = false,
  className,
}: DluxLoaderProps) {
  const hex = accentHex(accent);
  const scale = width / BASE_WIDTH;
  const labelSize = (BASE_LABEL * scale).toFixed(1);

  return (
    <div
      className={`dlux-loader${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: `${Math.round(18 * scale)}px`,
        textAlign: stacked ? "center" : "left",
      }}
    >
      <svg viewBox="0 0 280 130" style={{ width, height: "auto", display: "block" }} aria-hidden="true">
        {/* strokeDasharray matches the polyline's own length, so the dash can be
            walked all the way through and out the far side by dlux-draw. */}
        <polyline
          className="dlux-loader-roof"
          points="20,118 140,14 260,118"
          fill="none"
          stroke={hex}
          strokeWidth="15"
          strokeDasharray="340"
          style={{ animation: `dlux-draw ${PERIOD} cubic-bezier(.5,0,.5,1) infinite` }}
        />
        {PANES.map(({ x, y, delay }) => (
          <rect
            key={`${x}-${y}`}
            className="dlux-loader-pane"
            x={x}
            y={y}
            width="14"
            height="14"
            fill={hex}
            style={{ animation: `dlux-blink ${PERIOD} ease-in-out ${delay} infinite` }}
          />
        ))}
      </svg>

      {label && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: `${labelSize}px`,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: dark ? "rgba(250,247,241,.72)" : "#8A8276",
            lineHeight: 1.7,
            whiteSpace: "pre-line",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Blocking overlay for an operation that must not be interrupted or fired
 * twice — currently the booking submit, which uploads ID photos and can run for
 * many seconds.
 *
 * This is NOT the route-transition case: app entry belongs to SplashScreen, and
 * covering the screen for a navigation would draw the same mark at the guest
 * twice. It earns its place here only because the work is long, money-adjacent,
 * and genuinely unsafe to interrupt.
 *
 * The scrim is --bg (#F6EFE2) at 94%, not the design file's #FAF7F1 canvas —
 * translucent over the real page so it can't produce a seam against it.
 */
export function DluxLoaderOverlay({
  label,
  note,
  accent = "clay",
}: Pick<DluxLoaderProps, "label" | "accent"> & { note?: string }) {
  return (
    <div
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        gap: 18,
        padding: 24,
        background: "rgba(246,239,226,.94)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
        <DluxLoader accent={accent} width={104} label={label} stacked />
        {note && (
          <p
            style={{
              margin: 0,
              maxWidth: "34ch",
              fontSize: 13,
              lineHeight: 1.6,
              color: "#8B7458",
              textWrap: "pretty",
            }}
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
