"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Direct link to the D'Lux Homes Facebook page Messenger thread.
const MESSENGER_URL = "https://www.facebook.com/messages/t/270893736109969";

const POS_KEY = "dlux-messenger-pos";
const TAB_HEIGHT = 46;
const PANEL_WIDTH = 318;
const PANEL_HEIGHT = 300;
const EDGE_GAP = 12;
// Keep the tab clear of the sticky header at the top and of the fixed CTA bar
// at the bottom, so it never lands on either.
const TOP_GAP = 96;
const BOTTOM_GAP = 130;
// Fraction of the viewport height the tab rests at by default — mid-screen,
// away from both the header and the thumb zone the booking bar occupies.
const DEFAULT_TOP_RATIO = 0.44;

// How far sideways the tab must travel before it commits to the other edge.
// Short enough to feel like a flick, long enough that a slightly slanted
// vertical drag doesn't throw it across the screen.
const SWIPE_MIN = 48;

type Side = "left" | "right";
type Pos = { top: number; side: Side };

// Vertical position is free; horizontally the tab is always flush with one
// edge or the other, so only the side is stored.
function clampPos(pos: Pos): Pos {
  const maxTop = Math.max(TOP_GAP, window.innerHeight - TAB_HEIGHT - BOTTOM_GAP);
  return { top: Math.min(Math.max(pos.top, TOP_GAP), maxTop), side: pos.side };
}

// Which edge a drag ending `dx` pixels sideways should land on.
//
// Two ways to switch, because one alone isn't enough: a short flick would never
// carry the tab past the middle of the screen, and a long deliberate drag
// shouldn't snap back just because it started slowly. So either crossing the
// viewport midpoint OR travelling SWIPE_MIN away from the current edge commits.
function sideAfterDrag(from: Side, dx: number, tabCenterX: number): Side {
  const crossedMiddle = from === "right" ? tabCenterX < window.innerWidth / 2 : tabCenterX > window.innerWidth / 2;
  const flicked = from === "right" ? dx <= -SWIPE_MIN : dx >= SWIPE_MIN;
  return crossedMiddle || flicked ? (from === "right" ? "left" : "right") : from;
}

// The card opens level with the tab, then slides up or down only as far as it
// must to stay fully on screen.
function panelTop(tabTop: number): number {
  const max = Math.max(EDGE_GAP, window.innerHeight - PANEL_HEIGHT - EDGE_GAP);
  return Math.min(Math.max(tabTop, EDGE_GAP), max);
}

function IcoMessenger({ size = 22, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 2.6C9.4 2.6 2.7 8.9 2.7 17.1c0 4.3 1.9 8.1 5 10.7v5.6l4.7-2.6c1.2.3 2.4.5 3.6.5 8.6 0 15.3-6.3 15.3-14.5S26.6 2.6 18 2.6z" fill={inverted ? "#fff" : "#0A7CFF"} />
      <path d="M8.9 21.9l4.6-7.3 5.2 3.9 4.5-3.9-4.6 7.3-5.1-3.9-4.6 3.9z" fill={inverted ? "#0A7CFF" : "#fff"} />
    </svg>
  );
}

// Labelled chat tab pinned to the right edge at mid-height, clear of the fixed
// booking bar and the inline CTAs the old floating bubble used to cover.
// Opening it swaps the tab for the card, so there is only ever one close.
// Opens the D'Lux Homes Facebook Messenger thread in a new tab. Hidden on
// admin pages.
export default function MessengerChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, side: "right" });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Live horizontal offset while a drag is in progress. Kept out of `pos`
  // because it is transient — on release the tab snaps to an edge and this
  // returns to 0, so it must never be persisted.
  const [dragDX, setDragDX] = useState(0);
  // Mirror of dragDX. State can trail the final pointermove by an event when
  // pointerup lands in the same batch, and the snap decision must see the last
  // position the finger actually reached.
  const dragDXRef = useRef(0);
  const dragMoved = useRef(false);
  const tabRef = useRef<HTMLButtonElement | null>(null);
  const dragStart = useRef({ x: 0, y: 0, top: 0 });

  // Restore the last spot the user dropped the tab, clamped in case the
  // viewport is now smaller (e.g. rotated phone, resized window). Falls back to
  // the default mid-screen rest position.
  useEffect(() => {
    let start: Pos = { top: window.innerHeight * DEFAULT_TOP_RATIO, side: "right" };
    try {
      const saved = localStorage.getItem(POS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Read the two fields independently: entries written before the tab
        // could change sides carry a `top` but no `side`, and those should keep
        // their height rather than being thrown away wholesale.
        if (typeof parsed?.top === "number") start = { ...start, top: parsed.top };
        if (parsed?.side === "left" || parsed?.side === "right") start = { ...start, side: parsed.side };
      }
    } catch { /* ignore malformed/unavailable storage */ }
    setPos(clampPos(start));
    setReady(true);
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape closes the card, like any other dismissible overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, top: pos.top };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    // Movement in EITHER axis counts as a drag, so a purely sideways swipe
    // doesn't fall through and register as a tap that opens the card.
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved.current = true;
    setPos((p) => clampPos({ top: dragStart.current.top + dy, side: p.side }));
    // Let it follow the finger, but never past the far edge of the screen.
    const limit = Math.max(0, window.innerWidth - TAB_HEIGHT);
    const offset = pos.side === "right" ? Math.min(0, Math.max(-limit, dx)) : Math.max(0, Math.min(limit, dx));
    dragDXRef.current = offset;
    setDragDX(offset);
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Measure where the tab actually ended up rather than deriving it from the
    // pointer: the tab is anchored to an edge and offset by a transform, so its
    // real centre is the only honest input to the snap decision.
    const rect = tabRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const nextSide = sideAfterDrag(pos.side, dragDXRef.current, centerX);

    dragDXRef.current = 0;
    setDragDX(0);
    setPos((p) => {
      const clamped = clampPos({ top: p.top, side: nextSide });
      try { localStorage.setItem(POS_KEY, JSON.stringify(clamped)); } catch { /* ignore */ }
      return clamped;
    });
  };

  // Don't show the customer chat widget inside the admin dashboard.
  if (pathname?.startsWith("/admin")) return null;
  // Hold the tab back until the stored/default position is known, so it can't
  // flash at the wrong height or on the wrong edge on first paint.
  if (!ready) return null;

  const isLeft = pos.side === "left";

  return (
    <>
      {/* RESTING TAB — hidden while the card is open, so the card's X is the
          only close affordance on screen. */}
      {!open && (
        <button
          // Remount when the edge changes. Without this the transform would
          // animate from its dragged offset back to 0 against the NEW anchor,
          // so the tab would appear off-screen and slide in from the wrong
          // direction. A fresh element just starts where it belongs.
          key={pos.side}
          ref={tabRef}
          onClick={() => { if (!dragMoved.current) setOpen(true); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="Chat with D'Lux Homes on Messenger"
          title="Drag to move · swipe sideways to switch edges"
          style={{
            position: "fixed",
            // Anchored to whichever edge it lives on, and mirrored with it: the
            // rounding, the missing border and the shadow all have to face away
            // from the screen edge or the tab looks stuck on backwards.
            ...(isLeft ? { left: 0 } : { right: 0 }),
            top: pos.top,
            zIndex: 1000,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: TAB_HEIGHT,
            padding: isLeft ? "0 14px 0 16px" : "0 16px 0 14px",
            border: "1px solid #E4DAC7",
            ...(isLeft ? { borderLeft: "none" } : { borderRight: "none" }),
            borderRadius: isLeft ? "0 14px 14px 0" : "14px 0 0 14px",
            background: "#FFFFFF",
            color: "#1F160E",
            font: "inherit",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: dragging ? "grabbing" : "pointer",
            boxShadow: isLeft ? "6px 8px 22px rgba(31,22,14,.14)" : "-6px 8px 22px rgba(31,22,14,.14)",
            // While dragging the tab tracks the finger; at rest it nudges out
            // from its own edge on hover.
            transform: dragging
              ? `translateX(${dragDX}px)`
              : hovered ? `translateX(${isLeft ? 3 : -3}px)` : "translateX(0)",
            transition: dragging ? "none" : "transform .2s ease",
            touchAction: "none",
          }}
        >
          <IcoMessenger size={22} /> Chat
        </button>
      )}

      {open && (
        <>
          {/* Scrim — tapping anywhere outside dismisses, the usual way out. */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(31,22,14,.28)", animation: "dlux-chat-scrim .18s ease" }}
          />

          <div
            role="dialog"
            aria-label="Chat with D'Lux Homes"
            style={{
              position: "fixed",
              // Opens on the tab's own edge — a card that always flew to the
              // right would leave the left-hand tab pointing at nothing.
              ...(isLeft ? { left: EDGE_GAP } : { right: EDGE_GAP }),
              top: panelTop(pos.top),
              zIndex: 1000,
              width: PANEL_WIDTH,
              maxWidth: `calc(100vw - ${EDGE_GAP * 2}px)`,
              borderRadius: 20,
              overflow: "hidden",
              background: "#FFFCF4",
              border: "1px solid #E4DAC7",
              boxShadow: "0 20px 54px rgba(31,22,14,.28)",
              animation: "dlux-chat-in .18s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 14px 15px 16px", borderBottom: "1px solid #EFE7D8" }}>
              <div style={{ width: 40, height: 40, flex: "none", borderRadius: "50%", background: "#EAF2FF", display: "grid", placeItems: "center" }}>
                <IcoMessenger size={24} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1F160E" }}>D&apos;Lux Homes</div>
                <div style={{ fontSize: 11.5, color: "#8B7458", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /> Typically replies in minutes
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: "none", background: "#F4EEE2", display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#5C4B36" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ background: "#F4F0E8", color: "#1F160E", borderRadius: 14, padding: "13px 15px", fontSize: 13.5, lineHeight: 1.55 }}>
                Hi there! Have a question about your stay or booking? Send us a message and we&apos;ll get right back to you.
              </div>
              <a
                href={MESSENGER_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px 18px", borderRadius: 13, background: "#0A7CFF", color: "#fff", fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}
              >
                <IcoMessenger size={20} inverted /> Chat on Messenger
              </a>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes dlux-chat-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dlux-chat-scrim { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}
