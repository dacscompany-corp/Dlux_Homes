"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// First-visit loading screen: dark backdrop, radial gold glow, ringed logo
// mark, then fade out. Shown once per browser session (sessionStorage), not
// on every client-side route change — Next.js App Router doesn't re-run this
// component on navigation since it's mounted above <Providers> in the root
// layout, but the session flag also guards a full page reload/reopen.
const SESSION_KEY = "dlux-splash-shown";
const HOLD_MS = 3000;
const FADE_MS = 500;

export default function SplashScreen() {
  // Renders visible on the server and on the first client paint (server has no
  // sessionStorage, so it can't know yet) — this is what actually masks the
  // page while it loads. useEffect then either starts the exit animation (first
  // visit this session) or hides it immediately (already seen this session).
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      setVisible(false);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");

    const leaveTimer = setTimeout(() => setLeaving(true), HOLD_MS);
    const hideTimer = setTimeout(() => setVisible(false), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`dlux-splash${leaving ? " dlux-splash--out" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        display: "grid",
        placeItems: "center",
        background: "#0B0906",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(212,169,106,0.16) 0%, rgba(212,169,106,0.05) 32%, rgba(11,9,6,0) 60%)",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="dlux-splash-ring" />
        <div className="dlux-splash-mark" style={{ position: "relative", width: 220 }}>
          <Image
            src="/logo.png"
            alt="D'Lux Homes"
            width={1056}
            height={232}
            priority
            style={{ width: "100%", height: "auto", objectFit: "contain" }}
          />
        </div>
        <div className="dlux-splash-line" />
      </div>

      <style>{`
        .dlux-splash { animation: dluxSplashIn .3s ease-out; }
        .dlux-splash--out { animation: dluxSplashOut ${FADE_MS}ms ease-in forwards; }
        @keyframes dluxSplashIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dluxSplashOut { from { opacity: 1; } to { opacity: 0; visibility: hidden; } }

        .dlux-splash-ring {
          position: absolute;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          border: 1px solid rgba(212,169,106,0.28);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.85);
          opacity: 0;
          animation: dluxRingIn .7s cubic-bezier(.2,.7,.2,1) .1s forwards;
        }
        @keyframes dluxRingIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .dlux-splash-mark {
          opacity: 0;
          transform: translateY(8px) scale(.96);
          animation: dluxMarkIn .7s cubic-bezier(.2,.7,.2,1) .25s forwards;
        }
        @keyframes dluxMarkIn {
          from { opacity: 0; transform: translateY(8px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .dlux-splash-line {
          margin-top: 22px;
          width: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, #D4A96A, transparent);
          animation: dluxLineIn .6s cubic-bezier(.2,.7,.2,1) .65s forwards;
        }
        @keyframes dluxLineIn {
          from { width: 0; opacity: 0; }
          to   { width: 120px; opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dlux-splash, .dlux-splash--out, .dlux-splash-ring, .dlux-splash-mark, .dlux-splash-line {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            width: auto !important;
          }
          .dlux-splash-line { width: 120px !important; }
        }
      `}</style>
    </div>
  );
}
