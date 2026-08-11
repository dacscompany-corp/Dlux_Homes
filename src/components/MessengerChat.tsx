"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Direct link to the D'Lux Homes Facebook page Messenger thread.
const MESSENGER_URL = "https://www.facebook.com/messages/t/270893736109969";

const POS_KEY = "dlux-messenger-pos";
const EDGE_GAP = 12;
const BUTTON_SIZE = 60;

type Pos = { right: number; bottom: number };

// Pinned to the right edge — only the vertical offset is ever draggable.
function clampPos(pos: Pos): Pos {
  const maxBottom = Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP);
  return {
    right: EDGE_GAP + 10,
    bottom: Math.min(Math.max(pos.bottom, EDGE_GAP), maxBottom),
  };
}

function IcoMessenger({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 2.6C9.4 2.6 2.7 8.9 2.7 17.1c0 4.3 1.9 8.1 5 10.7v5.6l4.7-2.6c1.2.3 2.4.5 3.6.5 8.6 0 15.3-6.3 15.3-14.5S26.6 2.6 18 2.6z" fill="#fff" />
      <path d="M8.9 21.9l4.6-7.3 5.2 3.9 4.5-3.9-4.6 7.3-5.1-3.9-4.6 3.9z" fill="#0A7CFF" />
    </svg>
  );
}

// Floating "Message us" button fixed to the bottom-right corner. Opens the
// D'Lux Homes Facebook Messenger thread in a new tab. Hidden on admin pages.
export default function MessengerChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<Pos>({ right: 22, bottom: 22 });
  const [dragging, setDragging] = useState(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, right: 22, bottom: 22 });

  // Restore the last spot the user dropped the button, clamped in case the
  // viewport is now smaller (e.g. rotated phone, resized window).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_KEY);
      if (saved) setPos(clampPos(JSON.parse(saved)));
    } catch { /* ignore malformed/unavailable storage */ }
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dy) > 4) dragMoved.current = true;
    setPos(clampPos({ right: dragStart.current.right, bottom: dragStart.current.bottom - dy }));
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setPos((p) => {
      const clamped = clampPos(p);
      try { localStorage.setItem(POS_KEY, JSON.stringify(clamped)); } catch { /* ignore */ }
      return clamped;
    });
  };

  // Don't show the customer chat widget inside the admin dashboard.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <div style={{ position: "fixed", right: pos.right, bottom: pos.bottom, zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, touchAction: "none" }}>
      {open && (
        <div
          style={{
            width: 300,
            maxWidth: "calc(100vw - 44px)",
            borderRadius: 18,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 18px 50px rgba(31,27,22,0.25)",
            border: "1px solid #ECE3D3",
            animation: "dlux-chat-in .18s ease",
          }}
        >
          <div style={{ background: "linear-gradient(135deg,#0A7CFF,#0A60E8)", color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", flex: "none" }}>
              <IcoMessenger size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>D&apos;Lux Homes</div>
              <div style={{ fontSize: 12, opacity: 0.9, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} /> Typically replies in minutes
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4, lineHeight: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div style={{ padding: "18px" }}>
            <div style={{ background: "#F4F0E8", color: "#1F160E", borderRadius: 14, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
              Hi there! 👋 Have a question about your stay or booking? Send us a message and we&apos;ll get right back to you.
            </div>
            <a
              href={MESSENGER_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "13px 18px", borderRadius: 12, background: "#0A7CFF", color: "#fff", fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}
            >
              <IcoMessenger size={20} /> Chat on Messenger
            </a>
          </div>
        </div>
      )}

      <button
        onClick={() => { if (!dragMoved.current) setOpen((v) => !v); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={open ? "Close Messenger chat" : "Open Messenger chat"}
        title="Drag to move"
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "none",
          cursor: dragging ? "grabbing" : "pointer",
          background: "linear-gradient(135deg,#0A7CFF,#0A60E8)",
          boxShadow: "0 10px 26px rgba(10,124,255,0.45)",
          display: "grid",
          placeItems: "center",
          transform: hovered && !dragging ? "scale(1.06)" : "scale(1)",
          transition: dragging ? "none" : "transform .15s ease",
          touchAction: "none",
        }}
      >
        {open ? (
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <IcoMessenger size={32} />
        )}
      </button>

      <style>{`@keyframes dlux-chat-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
