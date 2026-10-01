"use client";

// Header bell with a real notifications dropdown for the staff portals.
//
// The Owner portal's bell used to jump straight to the Communication page and
// carried a permanent dot whatever was actually unread. This shows the
// signed-in account's own notifications instead: an unread count on the bell,
// the list in a panel, Mark all read, and — on click — the notification is
// marked read and the caller opens the page it's about.

import { useEffect, useRef, useState } from "react";
import { Bell, Check, CreditCard, CalendarDays, AlertTriangle, MessageSquare, Sparkles } from "lucide-react";
import {
  useGetNotificationsQuery,
  useMarkAllAsReadMutation,
  useUpdateNotificationsMutation,
  type Notification,
} from "@/redux/api/notificationsApi";

/** Icon + colour per notification kind (notification_type, case-insensitive). */
function lookFor(rawType: string | undefined) {
  const t = (rawType ?? "").toLowerCase();
  if (t.includes("payment")) return { Icon: CreditCard, bg: "#d1fae5", fg: "#059669" };
  if (t.includes("booking")) return { Icon: CalendarDays, bg: "#F7F0E3", fg: "#B07848" };
  if (t.includes("report") || t.includes("issue")) return { Icon: AlertTriangle, bg: "#ffedd5", fg: "#ea580c" };
  if (t.includes("message")) return { Icon: MessageSquare, bg: "#e0f2fe", fg: "#0369a1" };
  if (t.includes("clean")) return { Icon: Sparkles, bg: "#ede9fe", fg: "#7c3aed" };
  return { Icon: Bell, bg: "#f3f0ea", fg: "#8a8276" };
}

export default function NotificationBell({ onOpen }: {
  /** Called after a notification is clicked (and marked read) — route to its page here. */
  onOpen?: (n: Notification) => void;
}) {
  const { data: notifications = [], isLoading, isError, refetch } = useGetNotificationsQuery(
    { limit: 50 },
    { pollingInterval: 30000, refetchOnFocus: true },
  );
  const [markRead] = useUpdateNotificationsMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllAsReadMutation();
  const [open, setOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const unread = notifications.filter((n) => !n.read).length;
  const list = showUnreadOnly ? notifications.filter((n) => !n.read) : notifications;

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const openNotification = (n: Notification) => {
    if (!n.read) markRead({ notificationIds: [n.id], markAs: "read" }).catch(() => {});
    setOpen(false);
    onOpen?.(n);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        className="relative p-2.5 rounded-lg transition-colors cursor-pointer"
        style={{ color: "#6b6358", background: open ? "#f3eee2" : "transparent" }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = "#f3eee2"; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 3, right: 3, minWidth: 17, height: 17, padding: "0 4px",
            background: "#b8754a", color: "#faf7f1", fontSize: 10, fontWeight: 700,
            display: "grid", placeItems: "center", borderRadius: 999, border: "2px solid #fff",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 80,
          width: 380, maxWidth: "calc(100vw - 24px)",
          background: "#ffffff", border: "1px solid #e4dac5", borderRadius: 6,
          boxShadow: "0 24px 56px -18px rgba(40,30,18,.34)", overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #F2EADA", background: "#FCFAF5" }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8B6344", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Notifications{unread ? ` · ${unread} unread` : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
              <button type="button" onClick={() => setShowUnreadOnly((v) => !v)}
                style={{ fontFamily: "inherit", fontSize: 12.5, color: showUnreadOnly ? "#1f1b16" : "#5a4a3a", fontWeight: showUnreadOnly ? 600 : 400, background: "transparent", border: 0, cursor: "pointer" }}>
                {showUnreadOnly ? "Show all" : "Unread only"}
              </button>
              <span style={{ width: 1, height: 12, background: "#e4dac5" }} />
              <button type="button" disabled={!unread || markingAll} onClick={() => markAll(notifications)}
                style={{ fontFamily: "inherit", fontSize: 12.5, color: unread ? "#B07848" : "#c9bfae", background: "transparent", border: 0, cursor: unread ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check className="w-3 h-3" />Mark all read
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {isLoading ? (
              <p style={{ padding: "18px 16px", fontSize: 13, color: "#8B6344", margin: 0 }}>Loading…</p>
            ) : isError ? (
              <p role="alert" style={{ padding: "18px 16px", fontSize: 13, color: "#92400e", margin: 0 }}>
                Couldn&apos;t load notifications.{" "}
                <button type="button" onClick={() => refetch()} style={{ textDecoration: "underline", background: "transparent", border: 0, color: "inherit", cursor: "pointer", font: "inherit" }}>Try again</button>
              </p>
            ) : list.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#8a8276" }}>
                <Bell className="w-6 h-6" style={{ color: "#D4BFA0", margin: "0 auto 8px" }} />
                {showUnreadOnly ? "You're all caught up." : "No notifications yet."}
              </div>
            ) : (
              list.map((n, i) => {
                const look = lookFor(n.rawType);
                const Icon = look.Icon;
                return (
                  <button key={n.id} type="button" onClick={() => openNotification(n)}
                    style={{
                      width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start",
                      padding: "12px 16px", border: 0, borderTop: i ? "1px solid #F7F0E3" : 0,
                      background: n.read ? "#ffffff" : "#FDF8F3", cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#FAF6EE")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = n.read ? "#ffffff" : "#FDF8F3")}>
                    <span style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", background: look.bg, display: "grid", placeItems: "center" }}>
                      <Icon className="w-4 h-4" style={{ color: look.fg }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 13.5, color: "#1f1b16", fontWeight: n.read ? 500 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                        <span style={{ fontSize: 11, color: "#a2957f", flex: "none" }}>{n.timestamp}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: "#6b6358", marginTop: 2, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {n.description}
                      </span>
                    </span>
                    {!n.read && <span style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: "#b8754a", marginTop: 6 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
