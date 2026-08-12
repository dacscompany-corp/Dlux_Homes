"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The D'Lux Homes brand mark — roof + lit window, with the wordmark lockup.
 *
 * Ported from the "Logo System" design file. Everything is drawn (SVG + web
 * fonts) rather than shipped as a raster, so the mark stays crisp at favicon
 * size, takes any accent, and can animate. The three layouts are the whole
 * system:
 *
 *   full    — stacked lockup: mark over wordmark, rules, "Since 2026". Splash,
 *             print, signage.
 *   compact — mark beside the wordmark. The working mark: app bar, keycards,
 *             confirmation mail.
 *   icon    — mark alone. Favicon, avatar, loader.
 *
 * Motion: the build-in (rise + fade) runs once on mount; hovering lifts the
 * roof clear of the wordmark and flares the window; at rest the panes keep a
 * slow 4.5s glow so the house reads as occupied. All of it is suppressed under
 * prefers-reduced-motion.
 *
 * To replay the build-in from a parent, change the element's `key` — remounting
 * restarts the timer. Clicking the mark replays it too, unless the caller
 * passes its own `onClick`.
 */

export type DluxMarkLayout = "full" | "compact" | "icon";
export type DluxMarkAccent = "clay" | "gold" | "cream";

export interface DluxMarkProps {
  layout?: DluxMarkLayout;
  accent?: DluxMarkAccent;
  /** Renders the wordmark in cream for dark backgrounds. */
  dark?: boolean;
  /** Overall width in px. Every other dimension is derived from it. */
  width?: number;
  /** Set false to stop the resting window glow (e.g. in a dense app bar). */
  ambient?: boolean;
  onClick?: () => void;
  className?: string;
}

const ACCENT_HEX: Record<DluxMarkAccent, string> = {
  clay: "#B8754A",
  gold: "#D4A96A",
  cream: "#FAF7F1",
};

const EASE = "cubic-bezier(.2,.8,.2,1)";
const SERIF = "var(--font-instrument-serif), Georgia, serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function DluxMark({
  layout = "full",
  accent = "clay",
  dark = false,
  width = 320,
  ambient = true,
  onClick,
  className,
}: DluxMarkProps) {
  const [hover, setHover] = useState(false);
  const [entered, setEntered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A frame's delay before the build-in so the browser has the "before" state
  // to transition from — setting both states in the same paint skips the
  // animation entirely.
  useEffect(() => {
    timer.current = setTimeout(() => setEntered(true), 60);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const replay = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setEntered(false);
    timer.current = setTimeout(() => setEntered(true), 80);
  }, []);

  const handleClick = useCallback(() => {
    if (onClick) onClick();
    else replay();
  }, [onClick, replay]);

  const hex = ACCENT_HEX[accent] ?? ACCENT_HEX.clay;
  const isFull = layout === "full";
  const isCompact = layout === "compact";

  // The icon carries the whole width on its own; in the lockups it yields room
  // to the wordmark beside or below it.
  const iconW = layout === "icon" ? width : isCompact ? width * 0.26 : width * 0.6;
  const scale = width / 320;
  // The mark keeps the design file's own ink/cream rather than --ink/--white:
  // it is a brand asset that has to look identical wherever it is dropped,
  // including outside this app's token scope. (The two differ imperceptibly.)
  const ink = dark ? "#FAF7F1" : "#1F1B16";

  const nameSize = `${(isCompact ? width * 0.125 : width * 0.2).toFixed(1)}px`;
  const subSize = `${(isCompact ? width * 0.028 : width * 0.038).toFixed(1)}px`;

  return (
    <div
      className={`dlux-mark${className ? ` ${className}` : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        cursor: "pointer",
        userSelect: "none",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: `${Math.round(14 * (iconW / 180))}px` }}>
        <svg
          viewBox="0 0 280 130"
          role="img"
          aria-label="D'Lux Homes"
          style={{
            width: iconW,
            height: "auto",
            overflow: "visible",
            display: "block",
            transition: `transform .5s ${EASE}, opacity .5s ease`,
            transform: `translateY(${entered ? 0 : 10}px) scale(${hover ? 1.02 : 1})`,
            opacity: entered ? 1 : 0,
          }}
        >
          {/* Roof + chimney lift together on hover */}
          <g
            style={{
              transition: `transform .45s ${EASE}`,
              transform: `translateY(${hover ? -5 : 0}px)`,
            }}
          >
            <polyline
              points="20,118 140,14 260,118"
              fill="none"
              stroke={hex}
              strokeWidth="15"
              strokeLinejoin="miter"
              strokeMiterlimit="4"
            />
            <rect x="205" y="42" width="15" height="38" fill={hex} />
          </g>
          {/* The lit window — four panes that glow at rest and flare on hover */}
          <g
            className="dlux-mark-window"
            style={{
              animation: `dlux-glow ${ambient === false ? "0s" : "4.5s"} ease-in-out infinite`,
              transformOrigin: "138px 79px",
              transition: `transform .45s ${EASE}, filter .45s ease`,
              transform: `scale(${hover ? 1.14 : 1})`,
              filter: `drop-shadow(0 0 ${hover ? 12 : 0}px ${hex})`,
            }}
          >
            <rect x="121" y="62" width="14" height="14" fill={hex} />
            <rect x="141" y="62" width="14" height="14" fill={hex} />
            <rect x="121" y="82" width="14" height="14" fill={hex} />
            <rect x="141" y="82" width="14" height="14" fill={hex} />
          </g>
        </svg>

        {isCompact && (
          <div
            style={{
              color: ink,
              transition: `opacity .6s ease .1s, transform .6s ${EASE} .1s`,
              opacity: entered ? 1 : 0,
              transform: `translateX(${entered ? 0 : -6}px)`,
            }}
          >
            <div
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                letterSpacing: 0,
                lineHeight: 0.95,
                whiteSpace: "nowrap",
                fontSize: nameSize,
              }}
            >
              D&rsquo;Lux Homes
            </div>
            <div
              style={{
                fontFamily: MONO,
                textTransform: "uppercase",
                letterSpacing: ".28em",
                whiteSpace: "nowrap",
                fontSize: subSize,
                marginTop: ".55em",
                opacity: 0.62,
              }}
            >
              Your place to stay
            </div>
          </div>
        )}
      </div>

      {isFull && (
        <div
          style={{
            color: ink,
            marginTop: Math.round(10 * scale),
            transition: `opacity .6s ease .1s, transform .6s ${EASE} .1s`,
            opacity: entered ? 1 : 0,
            transform: `translateY(${entered ? 0 : 8}px)`,
            alignSelf: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: SERIF, fontWeight: 400, letterSpacing: 0, lineHeight: 0.95, fontSize: nameSize }}>
            D&rsquo;Lux Homes
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: Math.round(14 * scale),
              marginTop: Math.round(14 * scale),
            }}
          >
            <div style={{ height: 1, background: hex, width: Math.round(34 * scale), opacity: 0.85 }} />
            <div
              style={{
                fontFamily: MONO,
                textTransform: "uppercase",
                letterSpacing: ".3em",
                fontSize: subSize,
                whiteSpace: "nowrap",
                opacity: 0.72,
              }}
            >
              Your place to stay
            </div>
            <div style={{ height: 1, background: hex, width: Math.round(34 * scale), opacity: 0.85 }} />
          </div>
          <div
            style={{
              fontFamily: MONO,
              textTransform: "uppercase",
              letterSpacing: ".3em",
              fontSize: `${(width * 0.034).toFixed(1)}px`,
              color: hex,
              marginTop: Math.round(12 * scale),
            }}
          >
            Since 2026
          </div>
        </div>
      )}
    </div>
  );
}
