"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

// First-visit loading screen — "Photo-through" (2e): a defocused property shot
// sharpens as the app becomes ready, gold glow tracks the pointer (device tilt
// on mobile), taps ripple, and the wordmark shimmers. Progress is real: it
// steps on font readiness, document readyState, hero-image decode and load.
// Shown once per browser session (sessionStorage).
const SESSION_KEY = "dlux-splash-shown";
const HERO = "/images/rooms/1.jpg";
const GOLD = "#D4A96A";
const MIN_MS = 900; // never flash by faster than this
const FADE_MS = 700;

export default function SplashScreen() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (sessionStorage.getItem(SESSION_KEY)) {
      el.style.display = "none";
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = (s: string) => el.querySelector(s) as HTMLElement | null;
    const glow = q("[data-glow]");
    const plane = q("[data-plane]");
    const mark = q("[data-mark]");
    const bar = q("[data-bar]");
    const ripples = q("[data-ripples]");
    const photo = q("[data-photo]") as HTMLImageElement | null;

    let tx = 0, ty = 0, cx = 0, cy = 0;
    let gtx = innerWidth / 2, gty = innerHeight / 2, gx = gtx, gy = gty;

    // ── real readiness ────────────────────────────────────────────────────
    let target = 0.12;
    const bump = (v: number) => { target = Math.max(target, Math.min(1, v)); };
    const t0 = performance.now();

    document.fonts?.ready.then(() => bump(0.45));
    if (document.readyState === "complete") bump(0.75);
    else addEventListener("load", () => bump(0.75), { once: true });
    const img = new window.Image();
    img.src = HERO;
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => bump(0.92));
    // Everything above resolved + minimum hold elapsed → done.
    const finish = () => {
      if (performance.now() - t0 < MIN_MS) return setTimeout(finish, 120);
      bump(1);
    };
    Promise.allSettled([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => (document.readyState === "complete" ? r(null) : addEventListener("load", () => r(null), { once: true }))),
      new Promise((r) => { img.complete ? r(null) : (img.onload = img.onerror = () => r(null)); }),
    ]).then(finish);
    const failsafe = setTimeout(() => bump(1), 6000);

    // ── interaction ───────────────────────────────────────────────────────
    const onMove = (e: PointerEvent) => {
      gtx = e.clientX; gty = e.clientY;
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    };
    const onDown = (e: PointerEvent) => {
      if (!ripples || reduce) return;
      const rp = document.createElement("div");
      rp.style.cssText = `position:absolute;left:${e.clientX}px;top:${e.clientY}px;width:900px;height:900px;border-radius:50%;border:1px solid ${GOLD};animation:dluxRipple 1.5s cubic-bezier(.15,.7,.25,1) forwards;`;
      ripples.appendChild(rp);
      setTimeout(() => rp.remove(), 1600);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null) return;
      tx = Math.max(-0.5, Math.min(0.5, e.gamma / 45)) * 0.6;
      ty = Math.max(-0.5, Math.min(0.5, ((e.beta || 0) - 45) / 45)) * 0.6;
    };
    if (!reduce) {
      addEventListener("pointermove", onMove, { passive: true });
      addEventListener("pointerdown", onDown, { passive: true });
      addEventListener("deviceorientation", onTilt);
    }

    // ── loop ──────────────────────────────────────────────────────────────
    let p = 0, done = false, raf = 0;
    const frame = (now: number) => {
      const dt = now - t0;
      const intro = Math.min(1, dt / 900);
      const ei = 1 - Math.pow(1 - intro, 3);
      p += (target - p) * 0.06;
      if (target === 1 && p > 0.99) p = 1;

      cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
      gx += (gtx - gx) * 0.1; gy += (gty - gy) * 0.1;

      if (glow) { glow.style.transform = `translate3d(${gx}px,${gy}px,0)`; glow.style.opacity = String(ei); }
      if (plane) plane.style.transform = `rotateX(${-cy * 9}deg) rotateY(${cx * 11}deg) translate3d(${cx * 12}px,${cy * 9}px,0)`;
      if (mark) {
        mark.style.opacity = String(Math.min(1, Math.max(0, (intro - 0.18) / 0.5)));
        mark.style.transform = `translate3d(${-cx * 10}px,${(1 - ei) * 10 - cy * 7}px,0)`;
      }
      if (bar) bar.style.width = `${180 * p * ei}px`;
      if (photo) {
        photo.style.filter = `blur(${16 * (1 - p)}px)`;
        photo.style.transform = `scale(${1.12 - 0.07 * p}) translate3d(${-cx * 16}px,${-cy * 12}px,0)`;
        photo.style.opacity = String(0.28 + 0.32 * p);
      }

      if (p === 1 && !done) {
        done = true;
        el.style.transition = `opacity ${FADE_MS}ms ease`;
        el.style.opacity = "0";
        setTimeout(() => { el.style.display = "none"; }, FADE_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failsafe);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      removeEventListener("deviceorientation", onTilt);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 999999, background: "#0B0906", overflow: "hidden" }}
    >
      <Image
        data-photo
        src={HERO}
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: "cover", opacity: 0.28, filter: "blur(16px)", transform: "scale(1.12)" }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,9,6,0.55), rgba(11,9,6,0.8))" }} />
      <div
        data-glow
        style={{
          position: "absolute", width: 720, height: 720, left: 0, top: 0, margin: "-360px 0 0 -360px", opacity: 0,
          background: "radial-gradient(circle, rgba(212,169,106,0.16) 0%, rgba(212,169,106,0.05) 32%, rgba(11,9,6,0) 60%)",
          pointerEvents: "none",
        }}
      />
      <div data-ripples style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div data-plane style={{ position: "relative", display: "grid", placeItems: "center", transformStyle: "preserve-3d" }}>
          {/* Responsive rather than a fixed 220px: caps at 360 on desktop and falls back
              to 62vw so it can never crowd the edges of a narrow phone. */}
          <div data-mark style={{ position: "relative", width: "min(360px, 62vw)", opacity: 0 }}>
            <Image src="/logo.png" alt="D'Lux Homes" width={1254} height={1254} priority style={{ width: "100%", height: "auto", objectFit: "contain" }} />

            <div className="dlux-shimmer" />
          </div>
          <div style={{ position: "relative", marginTop: 26, width: 180, height: 7, borderRadius: 4, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <div data-bar style={{ position: "absolute", left: 0, top: 0, height: 7, width: 0, borderRadius: 4, background: GOLD }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dluxRipple { from { opacity:.55; transform:translate(-50%,-50%) scale(.05); } to { opacity:0; transform:translate(-50%,-50%) scale(1); } }
        @keyframes dluxShimmer { 0%,18% { background-position:190% 0; } 62%,100% { background-position:-90% 0; } }
        .dlux-shimmer {
          position:absolute; inset:0; pointer-events:none;
          background:linear-gradient(100deg, transparent 42%, rgba(255,255,255,0.5) 50%, transparent 58%);
          background-size:220% 100%;
          -webkit-mask-image:url(/logo.png); mask-image:url(/logo.png);
          -webkit-mask-size:100% 100%; mask-size:100% 100%;
          animation:dluxShimmer 3.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .dlux-shimmer { animation:none; } }
      `}</style>
    </div>
  );
}
