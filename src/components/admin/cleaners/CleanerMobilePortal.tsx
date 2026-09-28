"use client";

// Cleaner portal — PHONE ONLY (owner spec, 2026-09-27).
//
// Rendered below 1024px by src/app/admin/cleaners/page.tsx. At lg and up that
// page renders CleanerDesktopPortal instead — the sidebar dashboard, unchanged.
// This is a redesign of the small-screen experience only; nothing here is meant
// to be seen on a desktop browser, so it makes no attempt to fill one.
//
// Cleaners work this screen one-handed, mid-shift, on a phone, so the portal is
// a three-tab app (Today / Messages / Help) with two full-screen flows pushed on
// top of it: a room's checklist and "report a problem". Everything is sized for
// a thumb — 64px primary buttons, 32px checkboxes, 17px body text — and the
// EN/TL switch on Today flips the entire interface, not just checklist wording.
//
// Where the desktop nav's sections live here:
//   Dashboard + Assignments  -> Today (next-room card, "Also today", "Coming up")
//   Cleaning Checklist       -> the room screen (its own full screen now)
//   Report an Issue          -> the "Problem?" flow (4 taps instead of 5 fields)
//   Notifications + Messages -> Messages ("From the office" list + the thread)
//   User Guide + Profile     -> Help ("How it works" + the account row)
//   My Schedule              -> "Coming up" on Today, from real future tasks
//
// The data layer is shared with the desktop portal: same RTK Query hooks, same
// routes, same mutations. Completing a room still only moves it to
// 'awaiting-inspection' — only an admin's approval can make it 'ready'.

import { useState, useEffect, useMemo, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Check, ChevronLeft, ChevronRight, Clock, MapPin, AlertTriangle, Camera,
  Image as ImageIcon, Phone, Home as HomeIcon, MessageSquare, LifeBuoy,
  Wrench, Droplet, Package, HelpCircle, LogOut, CheckCircle2, Users,
} from "lucide-react";
import ImageThumb from "@/components/ImageThumb";
import { imageFileError } from "@/lib/validateImageFile";
import { useGetHavensQuery } from "@/redux/api/roomApi";
import { useSubmitReportMutation } from "@/redux/api/reportApi";
import {
  useGetNotificationsQuery,
  useUpdateNotificationsMutation,
  type Notification,
} from "@/redux/api/notificationsApi";
import {
  useGetConversationsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkMessagesAsReadMutation,
} from "@/redux/api/messagesApi";
import {
  useGetCleaningTasksQuery,
  useStartCleaningMutation,
  useCompleteCleaningMutation,
} from "@/redux/api/cleanersApi";
import { useAssignmentChecklist, gateErrorMessage } from "@/components/admin/cleaners/useAssignmentChecklist";
import CleanerCalendarCard from "@/components/admin/cleaners/CleanerCalendarCard";
import { canStartCleaning, cleaningDueAt, stayKindFor, type StayKind } from "@/lib/cleaning-schedule";
import { translateCategory, translateTask } from "@/lib/checklist-translations";
import {
  CLEANER_STRINGS,
  formatDateLine,
  formatDayLabel,
  type CleanerLanguage,
} from "@/lib/cleaner-portal-strings";

// ── Palette ──────────────────────────────────────────────────────────────────
// Warm-cream D'Lux tokens, same hex values the rest of the site uses; named
// here because this file sets colour inline everywhere (no Tailwind theme
// tokens exist for the portal's gold/cream ramp).
const C = {
  bg: "#FAF7F1",
  ink: "#1f1b16",
  card: "#ffffff",
  line: "#ece5d4",
  hair: "#F3EEE2",
  muted: "#6b6358",
  faint: "#8a8276",
  gold: "#d4a96a",
  goldInk: "#8a6a2f",
  cream: "#F7F0E3",
  creamLine: "#D4BFA0",
  green: "#059669",
  greenBg: "#d1fae5",
  greenInk: "#065f46",
  amberBg: "#fef3c7",
  amberInk: "#92400e",
  amberLine: "#f5d9a8",
  violetBg: "#ede9fe",
  violetInk: "#5b21b6",
  onDark: "#FAF7F1",
  onDarkSoft: "#E6CFA6",
  onDarkFaint: "#A89080",
};

const SERIF = "var(--font-instrument-serif), Georgia, serif";
const SANS = "var(--font-geist-sans), system-ui, sans-serif";

// Same pin/coords as the guest-facing /location page, so "Directions" opens the
// exact property rather than an approximation.
const PROPERTY_COORDS: [number, number] = [14.659186800125402, 121.02701538724116];
const PROPERTY_LABEL = "Tower 4, Grass Residences";
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${PROPERTY_COORDS[0]},${PROPERTY_COORDS[1]}`;

// Office landline/mobile for the Call buttons. Unset means no number to dial,
// so those buttons are replaced by "Message the office" instead of dialling a
// placeholder that rings nobody.
const OFFICE_PHONE = process.env.NEXT_PUBLIC_OFFICE_PHONE?.trim() || "";

const LANG_KEY = "dlux-cleaner-lang";

type Screen = "home" | "room" | "done" | "problem" | "messages" | "help";
type CleanStatus = "pending" | "in-progress" | "awaiting-inspection" | "ready";
type ProblemType = "broken" | "dirty" | "missing" | "other";

// Cleaner-facing status chips. "ready" only ever arrives from an admin's
// inspection approval; the cleaner can't set it.
const CHIPS: Record<CleanStatus, { bg: string; fg: string; label: keyof typeof CLEANER_STRINGS.en }> = {
  pending:                { bg: C.amberBg,  fg: C.amberInk,  label: "sPending" },
  "in-progress":          { bg: C.cream,    fg: C.goldInk,   label: "sProgress" },
  "awaiting-inspection":  { bg: C.violetBg, fg: C.violetInk, label: "sWaiting" },
  ready:                  { bg: C.greenBg,  fg: C.greenInk,  label: "sReady" },
};

// The four problem tiles, mapped onto what report_issue actually stores.
// issue_type is free text there (no CHECK), priority_level is constrained to
// Low/Medium/High/Urgent — a broken fixture blocks the next check-in, so it
// files as High; the rest are Medium and get triaged by the owner.
const PROBLEM_TYPES: Record<ProblemType, {
  icon: React.ElementType;
  label: keyof typeof CLEANER_STRINGS.en;
  issueType: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
}> = {
  broken:  { icon: Wrench,     label: "tBroken",  issueType: "Broken / Not working", priority: "High" },
  dirty:   { icon: Droplet,    label: "tDirty",   issueType: "Stain or Damage",      priority: "Medium" },
  missing: { icon: Package,    label: "tMissing", issueType: "Missing Item",         priority: "Medium" },
  other:   { icon: HelpCircle, label: "tOther",   issueType: "General",              priority: "Medium" },
};

// ── Small date/time helpers ──────────────────────────────────────────────────
// Postgres dates arrive either as "YYYY-MM-DD" or as a full ISO string; both are
// the calendar day the booking actually ends, so read the day off the string
// rather than through Date's timezone shift.
function toLocalDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "14:00:00" -> "2:00 PM". Returns "" for anything unparseable. */
function formatTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw));
  if (!m) return String(raw);
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

function normStatus(raw: string): CleanStatus {
  // 'cleaned'/'inspected' are the pre-workflow terminal statuses on old rows —
  // nothing left for the cleaner to do on either, same as 'ready'.
  if (raw === "ready" || raw === "cleaned" || raw === "inspected") return "ready";
  if (raw === "awaiting-inspection") return "awaiting-inspection";
  if (raw === "in-progress") return "in-progress";
  return "pending";
}

type Room = {
  id: string;
  name: string;
  bookingRef: string;
  havenId: string;
  bookingUuid: string;
  status: CleanStatus;
  checkoutTime: string;
  /** Local day the cleaning is due (the guest's checkout). */
  date: Date | null;
  /** Exact due time — cleaning can start from it. */
  dueAt: Date | null;
  /** Booking status — once the guest is checked out the room opens early. */
  bookingStatus: string | null;
  /** Guest first name only — no contact details reach the cleaner. */
  guestName: string;
  /** Party size, for towels/linens; null when the booking didn't record it. */
  adults: number | null;
  children: number;
  stay: { kind: StayKind; nights: number };
  note: string;
};

/** The fields canStartCleaning needs, from a Room. */
function roomSchedule(r: Room) {
  return { scheduled_for: r.dueAt?.toISOString() ?? null, booking_status: r.bookingStatus };
}

/** "Sep 29, 12:00 PM" — when a not-yet-startable room opens up. */
function formatDue(d: Date | null, lang: CleanerLanguage): string {
  if (!d) return "";
  return d.toLocaleString(lang === "tl" ? "en-PH" : "en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function CleanerMobilePortal() {
  const { data: session } = useSession();
  const me = session?.user as { id?: string; name?: string; email?: string } | undefined;
  const myId = me?.id ?? "";
  const firstName = (me?.name || "").trim().split(/\s+/)[0] || "there";

  const [lang, setLang] = useState<CleanerLanguage>("en");
  const t = CLEANER_STRINGS[lang];
  // Remember the language across shifts — a cleaner who works in Tagalog
  // shouldn't have to re-pick it every time the portal opens.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved === "tl" || saved === "en") setLang(saved);
    } catch { /* private mode / blocked storage — English is fine */ }
  }, []);
  const pickLang = (next: CleanerLanguage) => {
    setLang(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  };

  const [screen, setScreen] = useState<Screen>("home");
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which screen the problem flow was opened from, so Back returns there.
  const [problemFrom, setProblemFrom] = useState<Screen>("home");

  // ── Today's rooms ──────────────────────────────────────────────────────────
  // Polled so new assignments, reassignments, cancellations and inspection
  // feedback reach the phone without a manual refresh. The same interval the
  // desktop portal uses, so the two never drift more than one poll apart.
  const {
    data: tasksData,
    isLoading: tasksLoading,
    isError: tasksFailed,
    refetch: refetchTasks,
  } = useGetCleaningTasksQuery(undefined, {
    pollingInterval: 30000,
    refetchOnMountOrArgChange: true,
  });
  const [startCleaningM] = useStartCleaningMutation();
  const [completeCleaningM] = useCompleteCleaningMutation();

  const { today, upcoming } = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const rows = (tasksData ?? [])
      // The server already returns only this cleaner's own assignments; the
      // filter is belt-and-braces so a stale or admin-shaped response can never
      // put someone else's room on this phone. Unassigned work is Owner/CSR's
      // to place (they're notified), not whoever opens the portal first — the
      // desktop view applies exactly the same rule.
      .filter((r) => !!myId && String(r.assigned_cleaner_id ?? "") === myId)
      .map<Room>((r) => {
        const dueAt = cleaningDueAt(r);
        return {
          id: String(r.cleaning_id ?? ""),
          name: String(r.haven ?? "—"),
          bookingRef: String(r.booking_id ?? "—"),
          havenId: r.haven_id ? String(r.haven_id) : "",
          bookingUuid: r.booking_uuid ? String(r.booking_uuid) : "",
          status: normStatus(String(r.cleaning_status ?? "pending")),
          checkoutTime: formatTime(r.check_out_time),
          date: dueAt ? new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()) : toLocalDate(r.check_out_date),
          dueAt,
          bookingStatus: r.booking_status ? String(r.booking_status) : null,
          guestName: String(r.guest_first_name ?? "").trim(),
          adults: r.adults == null ? null : Number(r.adults),
          children: Number(r.children ?? 0),
          stay: stayKindFor(r),
          note: r.inspection_note ? String(r.inspection_note) : "",
        };
      });

    const isOpen = (s: CleanStatus) => s === "pending" || s === "in-progress";
    // Today = rooms whose checkout is today, plus anything still unfinished from
    // an earlier day (a task must not disappear just because midnight passed).
    const todayRooms = rows.filter((r) => {
      const d = r.date ? startOfDay(r.date) : todayStart;
      return d <= todayStart && (d === todayStart || isOpen(r.status));
    });
    const future = rows
      .filter((r) => r.date && startOfDay(r.date) > todayStart)
      .sort((a, b) => startOfDay(a.date as Date) - startOfDay(b.date as Date))
      .slice(0, 6);
    // Unfinished first, then by checkout time, so the next thing to do is on top.
    todayRooms.sort((a, b) => {
      const rank = (s: CleanStatus) => (s === "in-progress" ? 0 : s === "pending" ? 1 : 2);
      return rank(a.status) - rank(b.status) || a.checkoutTime.localeCompare(b.checkoutTime);
    });
    return { today: todayRooms, upcoming: future };
  }, [tasksData, myId]);

  const next = today.find((r) => r.status === "pending" || r.status === "in-progress") ?? null;
  const others = today.filter((r) => r !== next);
  const active = today.find((r) => r.id === activeId) ?? null;

  // ── Active room's checklist ────────────────────────────────────────────────
  // Shared with the desktop portal: ticks, per-task photo proof, upload state
  // and the submission gate all come from one hook, so the two views agree on
  // exactly what's missing.
  const ck = useAssignmentChecklist(
    active && active.havenId && active.bookingUuid
      ? { havenId: active.havenId, bookingUuid: active.bookingUuid }
      : null
  );
  const categories = ck.checklist?.categories ?? [];
  // Done = ticked AND photographed, so this line and the "photos still
  // needed" bar at the bottom always agree.
  const doneCount = ck.gate.doneTasks;
  const totalCount = ck.gate.totalTasks;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  // Ticking and photographing are only open while the room is In Progress —
  // the server enforces the same; this just stops the phone offering it.
  const canEditChecklist = active?.status === "in-progress";

  const pickTaskPhoto = (taskId: string) => {
    if (!canEditChecklist) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.capture = "environment";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const res = await ck.uploadPhoto(taskId, file);
      if (!res.ok) toast.error(res.error || "Could not upload photo");
    };
    input.click();
  };

  // ── Start / finish a room ──────────────────────────────────────────────────
  // Opening a room starts it only once the guest has checked out. Before that
  // the room opens read-only with the time it becomes available — the server
  // would refuse the start anyway, and a failed start rolls back on screen.
  const openRoom = async (room: Room) => {
    setActiveId(room.id);
    setScreen("room");
    if (room.status === "pending" && canStartCleaning(roomSchedule(room))) {
      try { await startCleaningM(room.id).unwrap(); }
      catch (err) { toast.error(gateErrorMessage(err, lang === "tl" ? "Hindi nasimulan" : "Could not start this room")); }
    }
  };

  const [finishing, setFinishing] = useState(false);
  // Held separately from `active` because completing a room can drop it out of
  // today's list on the next poll (an overdue task finished after midnight), and
  // the Done screen still needs the name it just sent for checking.
  const [finishedName, setFinishedName] = useState("");
  // One call: the complete route verifies the checklist (every task ticked,
  // every task photographed) and records it as submitted in the same step. If
  // it refuses, nothing is lost — ticks and photos were saved as they were
  // made — and the reason names the tasks still outstanding.
  const finishRoom = async () => {
    if (!active || !ck.gate.ok || finishing) return;
    setFinishing(true);
    setFinishedName(active.name);
    try {
      await completeCleaningM(active.id).unwrap();
      setScreen("done");
    } catch (err) {
      ck.refetch();
      toast.error(gateErrorMessage(err, lang === "tl" ? "Hindi naipadala" : "Could not send this for checking"));
    } finally {
      setFinishing(false);
    }
  };

  // ── Report a problem ───────────────────────────────────────────────────────
  const { data: havensData } = useGetHavensQuery({});
  const havenFallbackId = useMemo(() => {
    const rows = Array.isArray(havensData)
      ? (havensData as Record<string, unknown>[])
      : ((havensData as { data?: unknown } | undefined)?.data as Record<string, unknown>[] | undefined) ?? [];
    const first = rows[0];
    return first ? String(first.uuid_id || first.id || "") : "";
  }, [havensData]);
  const [submitReport, { isLoading: sendingProblem }] = useSubmitReportMutation();
  const [ptype, setPtype] = useState<ProblemType | null>(null);
  const [pnote, setPnote] = useState("");
  const [pphoto, setPphoto] = useState<File | null>(null);
  const [pphotoPreview, setPphotoPreview] = useState<string>("");
  const [psent, setPsent] = useState(false);

  const openProblem = () => {
    setProblemFrom(screen === "problem" ? problemFrom : screen);
    setPtype(null); setPnote(""); setPphoto(null); setPphotoPreview(""); setPsent(false);
    setScreen("problem");
  };
  const closeProblem = () => setScreen(problemFrom === "problem" ? "home" : problemFrom);

  const pickProblemPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.capture = "environment";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const err = imageFileError(file);
      if (err) { toast.error(err); return; }
      setPphoto(file);
      setPphotoPreview(URL.createObjectURL(file));
    };
    input.click();
  };
  // Revoke the last object URL when it's replaced or the flow unmounts.
  const previewRef = useRef("");
  useEffect(() => {
    if (previewRef.current && previewRef.current !== pphotoPreview) URL.revokeObjectURL(previewRef.current);
    previewRef.current = pphotoPreview;
  }, [pphotoPreview]);

  const problemRoom = active ?? next ?? today[0] ?? null;
  const sendProblem = async () => {
    if (!ptype || sendingProblem) return;
    if (!myId) { toast.error("Session not ready — please sign in again"); return; }
    const spec = PROBLEM_TYPES[ptype];
    const havenId = problemRoom?.havenId || havenFallbackId;
    if (!havenId) { toast.error("No property to attach this report to"); return; }
    try {
      await submitReport({
        haven_id: havenId,
        issue_type: spec.issueType,
        priority_level: spec.priority,
        // report_issue requires a non-empty location; the room is the most
        // specific thing the cleaner has already told us.
        specific_location: problemRoom?.name || PROPERTY_LABEL,
        issue_description: pnote.trim() || CLEANER_STRINGS.en[spec.label] as string,
        user_id: myId,
        booking_cleaning_id: problemRoom?.id || undefined,
        images: pphoto ? [pphoto] : undefined,
      }).unwrap();
      setPsent(true);
    } catch {
      toast.error(lang === "tl" ? "Hindi naipadala ang report" : "Could not send that report");
    }
  };

  // ── Messages + office updates ──────────────────────────────────────────────
  const { data: notifRes } = useGetNotificationsQuery({}, { pollingInterval: 30000 });
  const [markNotificationsRead] = useUpdateNotificationsMutation();
  const notifications: Notification[] = notifRes ?? [];
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  // Toast only notifications that arrive in a LATER poll — not everything
  // already unread when the portal opens.
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!notifRes) return;
    if (seenRef.current === null) {
      seenRef.current = new Set(notifRes.map((n) => n.id));
      return;
    }
    const fresh = notifRes.filter((n) => !seenRef.current?.has(n.id));
    for (const n of fresh) {
      if (n.rawType === "cleaning_assignment") toast.success(n.title || "New room assigned", { icon: "🧹" });
      else if (n.rawType === "cleaning_rejected") toast.error(n.title || "A room was sent back", { icon: "⚠️" });
    }
    if (fresh.length) seenRef.current = new Set(notifRes.map((n) => n.id));
  }, [notifRes]);

  const { data: convRes } = useGetConversationsQuery({ userId: myId }, { skip: !myId });
  const conversation = useMemo(() => {
    const rows = convRes?.data ?? [];
    // Staff threads first; otherwise whatever thread the office started.
    return rows.find((c) => c.type === "internal") ?? rows[0] ?? null;
  }, [convRes]);
  const conversationId = conversation?.id ?? "";
  const { data: msgRes } = useGetMessagesQuery(
    { conversationId },
    { skip: !conversationId, pollingInterval: 30000 }
  );
  const thread = msgRes?.data ?? [];
  const [sendMessageM] = useSendMessageMutation();
  const [markThreadRead] = useMarkMessagesAsReadMutation();
  const unreadMsgs = (convRes?.data ?? []).reduce((n, c) => n + Number(c.unread_count ?? 0), 0);
  const unreadTotal = unreadNotifs + unreadMsgs;

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (screen === "messages") threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [screen, thread.length]);

  const openMessages = () => {
    setScreen("messages");
    if (conversationId && myId && unreadMsgs > 0) {
      markThreadRead({ conversation_id: conversationId, user_id: myId }).catch(() => {});
    }
  };

  const sendQuick = async (text: string) => {
    if (!conversationId || !myId) return;
    try {
      await sendMessageM({
        conversation_id: conversationId,
        sender_id: myId,
        sender_name: me?.name || "Cleaner",
        message_text: text,
      }).unwrap();
    } catch { toast.error(lang === "tl" ? "Hindi naipadala" : "Could not send that message"); }
  };

  const readNotification = (n: Notification) => {
    if (!n.read) markNotificationsRead({ notificationIds: [n.id], markAs: "read" }).catch(() => {});
  };

  // A poll can retire the open room out from under the room screen (it was
  // reassigned, or an admin approved it). Fall back to Today rather than render
  // a checklist with no room behind it.
  useEffect(() => {
    if (screen === "room" && activeId && !tasksLoading && !active) setScreen("home");
  }, [screen, activeId, active, tasksLoading]);

  const showTabs = screen === "home" || screen === "messages" || screen === "help";

  // ── Booking details on each card ──────────────────────────────────────────
  // Every card is the same property, so the name alone can't tell two jobs
  // apart — these lines can: which booking, what kind of stay, when the guest
  // leaves (with the date), and how many people to reset the room for.
  const stayText = (r: Room) =>
    r.stay.kind === "day" ? t.stayDay : r.stay.kind === "night" ? t.stayNight : t.stayOvernight(r.stay.nights);
  const guestText = (r: Room) =>
    [r.guestName ? t.guestOf(r.guestName) : null, r.adults != null ? t.guests(r.adults, r.children) : null]
      .filter(Boolean)
      .join(" · ");
  // "checked out" only once it's true — early Check Out or the time has passed.
  const outText = (r: Room) =>
    `${canStartCleaning(roomSchedule(r)) ? t.checkoutAt : t.checksOutAt} · ${formatDue(r.dueAt, lang)}`;

  // ── Shared bits ────────────────────────────────────────────────────────────
  const sectionLabel = (text: string): React.ReactElement => (
    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.goldInk, marginBottom: 10 }}>
      {text}
    </div>
  );

  const screenHeader =(onBack: () => void, right?: React.ReactNode) => (
    <div style={{
      position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 8, background: C.card, borderBottom: `1px solid ${C.line}`,
      padding: `calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px`,
    }}>
      <button type="button" onClick={onBack} style={{
        height: 48, padding: "0 14px 0 6px", border: 0, background: "transparent", display: "flex",
        alignItems: "center", gap: 4, font: `500 17px ${SANS}`, color: C.ink, cursor: "pointer",
      }}>
        <ChevronLeft className="w-6 h-6" strokeWidth={2.2} />{t.back}
      </button>
      {right}
    </div>
  );

  const problemButton = (
    <button type="button" onClick={openProblem} style={{
      height: 48, padding: "0 16px", border: `1px solid ${C.amberLine}`, background: C.amberBg,
      color: C.amberInk, borderRadius: 999, display: "flex", alignItems: "center", gap: 8,
      font: `600 16px ${SANS}`, cursor: "pointer",
    }}>
      <AlertTriangle className="w-5 h-5" strokeWidth={2} />{t.problem}
    </button>
  );

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: SANS, color: C.ink, WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "relative", margin: "0 auto", width: "100%", maxWidth: 480, minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg }}>

        {/* ═════════ TODAY ═════════ */}
        {screen === "home" && (
          <div style={{ flex: 1, padding: `calc(env(safe-area-inset-top, 0px) + 28px) 20px 124px` }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, color: C.muted }}>{t.hello}</div>
                <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.01em" }}>{firstName}</div>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>{formatDateLine(new Date(), lang)}</div>
              </div>
              <div style={{ display: "flex", background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3, flexShrink: 0, marginTop: 4 }}>
                {(["en", "tl"] as CleanerLanguage[]).map((code) => (
                  <button key={code} type="button" onClick={() => pickLang(code)} style={{
                    height: 40, minWidth: 48, padding: "0 12px", border: 0, borderRadius: 999,
                    font: `600 14px ${SANS}`, cursor: "pointer",
                    background: lang === code ? C.ink : "transparent",
                    color: lang === code ? C.onDark : C.muted,
                  }}>{code.toUpperCase()}</button>
                ))}
              </div>
            </div>

            {/* A failed poll is shown, never papered over: with no data at all the
                page says it couldn't load (not "no rooms today"); with stale data
                it keeps showing it under a retry banner. */}
            {tasksFailed && (
              <div role="alert" style={{
                background: C.amberBg, color: C.amberInk, border: `1px solid ${C.amberLine}`,
                borderRadius: 16, padding: "14px 16px", marginBottom: 18,
                display: "flex", alignItems: "center", gap: 12, fontSize: 16, lineHeight: 1.35,
              }}>
                <AlertTriangle className="w-6 h-6 flex-shrink-0" strokeWidth={2} />
                <span style={{ flex: 1 }}>{t.loadFailed}</span>
                <button type="button" onClick={() => refetchTasks()} style={{
                  height: 44, padding: "0 14px", border: 0, borderRadius: 10, background: C.amberInk,
                  color: "#fff", font: `600 15px ${SANS}`, cursor: "pointer", flexShrink: 0,
                }}>{t.retry}</button>
              </div>
            )}

            {/* Next room */}
            {next ? (
              <div style={{ background: C.ink, color: C.onDark, borderRadius: 20, padding: "22px 20px 20px", marginBottom: 28 }}>
                <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>{t.nextUp}</div>
                <div style={{ fontFamily: SERIF, fontSize: 38, lineHeight: 1.05, marginTop: 8 }}>{next.name}</div>
                <div style={{ fontSize: 15, color: C.onDarkSoft, marginTop: 8 }}>
                  {next.bookingRef} · <strong style={{ color: C.gold, fontWeight: 600 }}>{stayText(next)}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, fontSize: 17 }}>
                  {next.dueAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Clock className="w-[22px] h-[22px] flex-shrink-0" strokeWidth={2} style={{ color: C.gold }} />
                      <span>{outText(next)}</span>
                    </div>
                  )}
                  {guestText(next) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Users className="w-[22px] h-[22px] flex-shrink-0" strokeWidth={2} style={{ color: C.gold }} />
                      <span>{guestText(next)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.onDarkSoft }}>
                    <MapPin className="w-[22px] h-[22px] flex-shrink-0" strokeWidth={2} style={{ color: C.gold }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{PROPERTY_LABEL}</span>
                    <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" style={{
                      color: C.gold, fontSize: 15, fontWeight: 600, textDecoration: "underline",
                      textUnderlineOffset: 3, padding: "8px 0", flexShrink: 0,
                    }}>{t.directions}</a>
                  </div>
                </div>
                {next.status === "pending" && next.dueAt && !canStartCleaning(roomSchedule(next)) && (
                  <div style={{ marginTop: 16, background: "rgba(250,247,241,0.08)", color: C.onDarkSoft, borderRadius: 12, padding: "12px 14px", fontSize: 16, lineHeight: 1.4 }}>
                    {t.opensAt(formatDue(next.dueAt, lang))}
                  </div>
                )}
                {next.note && next.status === "in-progress" && (
                  <div style={{ marginTop: 16, background: C.violetBg, color: C.violetInk, borderRadius: 12, padding: "12px 14px", fontSize: 16, lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700 }}>{t.sentBack}</div>
                    <div>{next.note}</div>
                  </div>
                )}
                {(() => {
                  // One button, three looks (same rule as desktop): a real Start
                  // once the room is open, Continue / Fix & continue while
                  // cleaning, and only a quiet Preview while the guest is in.
                  const locked = next.status === "pending" && !canStartCleaning(roomSchedule(next));
                  const label = locked
                    ? t.preview
                    : next.status === "in-progress"
                      ? (next.note ? t.fixCont : t.cont)
                      : t.start;
                  return (
                    <button type="button" onClick={() => openRoom(next)} style={{
                      marginTop: 20, width: "100%", height: locked ? 52 : 64, borderRadius: 14,
                      border: locked ? `1px solid ${C.onDarkFaint}` : 0,
                      background: locked ? "transparent" : C.gold,
                      color: locked ? C.onDarkSoft : C.ink,
                      font: `${locked ? 600 : 700} ${locked ? 17 : 20}px ${SANS}`, cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", gap: 10,
                    }}>
                      {label}
                      <ChevronRight className="w-[22px] h-[22px]" strokeWidth={2.5} />
                    </button>
                  );
                })()}
              </div>
            ) : tasksLoading ? (
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: "26px 20px", marginBottom: 28, fontSize: 17, color: C.muted }}>
                {t.loading}
              </div>
            ) : tasksFailed && !tasksData ? null : (
              <div style={{
                background: C.greenBg, color: C.greenInk, borderRadius: 20, padding: "26px 20px",
                marginBottom: 28, display: "flex", alignItems: "center", gap: 14,
              }}>
                <CheckCircle2 className="w-10 h-10 flex-shrink-0" strokeWidth={2} style={{ color: C.green }} />
                <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>
                  {today.length ? t.allDoneToday : t.noRoomsToday}
                </div>
              </div>
            )}

            {/* Also today */}
            {others.length > 0 && (
              <>
                {sectionLabel(t.alsoToday)}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {others.map((r) => {
                    const chip = CHIPS[r.status];
                    const isOpenRoom = r.status === "pending" || r.status === "in-progress";
                    return (
                      <button key={r.id} type="button" onClick={() => (isOpenRoom ? openRoom(r) : undefined)}
                        style={{
                          background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16,
                          display: "flex", alignItems: "center", gap: 14, textAlign: "left", width: "100%",
                          font: `400 16px ${SANS}`, color: C.ink, cursor: isOpenRoom ? "pointer" : "default",
                        }}>
                        <span style={{ width: 44, height: 44, borderRadius: "50%", background: chip.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Check className="w-6 h-6" strokeWidth={2.5} style={{ color: chip.fg }} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 18, fontWeight: 600 }}>{r.name}</span>
                          <span style={{ display: "block", fontSize: 14, color: C.muted, marginTop: 2 }}>
                            {r.bookingRef} · {stayText(r)}
                          </span>
                          <span style={{ display: "block", fontSize: 14, color: C.muted }}>{outText(r)}</span>
                          <span style={{ display: "block", fontSize: 15, color: chip.fg, marginTop: 2 }}>{t[chip.label] as string}</span>
                        </span>
                        {isOpenRoom && <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: C.creamLine }} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Coming up */}
            {sectionLabel(t.comingUp)}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}>
              {upcoming.length === 0 ? (
                <div style={{ padding: "16px", fontSize: 16, color: C.muted }}>{t.nothingUpcoming}</div>
              ) : upcoming.map((r, i) => (
                <div key={r.id} style={{
                  padding: "14px 16px", borderTop: i ? `1px solid ${C.hair}` : 0,
                  display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: C.muted }}>{formatDayLabel(r.date as Date, new Date(), lang)}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{r.name}</div>
                    <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>
                      {r.bookingRef} · {stayText(r)}{guestText(r) ? ` · ${guestText(r)}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, color: C.muted, flexShrink: 0 }}>{r.checkoutTime}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═════════ ROOM / CHECKLIST ═════════ */}
        {screen === "room" && (
          <>
            {screenHeader(() => setScreen("home"), problemButton)}
            <div style={{ flex: 1, padding: "20px 16px 120px" }}>
              <div style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1.05 }}>{active?.name ?? "—"}</div>
              <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>
                {active ? `${active.bookingRef} · ${stayText(active)}` : ""}
              </div>
              {active && (
                <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>
                  {outText(active)}{guestText(active) ? ` · ${guestText(active)}` : ""}
                </div>
              )}

              {active?.note && active.status === "in-progress" && (
                <div style={{ marginTop: 14, background: C.violetBg, color: C.violetInk, borderRadius: 12, padding: "12px 14px", fontSize: 16, lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 700 }}>{t.sentBack}</div>
                  <div>{active.note}</div>
                </div>
              )}

              {active?.status === "pending" && (
                <div style={{ marginTop: 14, background: C.amberBg, color: C.amberInk, borderRadius: 12, padding: "12px 14px", fontSize: 16, lineHeight: 1.4 }}>
                  {active.dueAt && !canStartCleaning(roomSchedule(active))
                    ? t.opensAt(formatDue(active.dueAt, lang))
                    : t.notStarted}
                </div>
              )}
              {active?.status === "awaiting-inspection" && (
                <div style={{ marginTop: 14, background: C.violetBg, color: C.violetInk, borderRadius: 12, padding: "12px 14px", fontSize: 16, lineHeight: 1.4 }}>
                  {t.lockedWaiting}
                </div>
              )}

              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{t.progress(doneCount, totalCount)}</span>
                  <span style={{ fontSize: 16, color: C.goldInk, fontWeight: 600 }}>{pct}%</span>
                </div>
                <div style={{ height: 10, background: C.line, borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: C.gold, borderRadius: 99, transition: "width .3s" }} />
                </div>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 10 }}>{t.tapHint}</div>
              </div>

              {categories.length === 0 ? (
                ck.loadError ? (
                  <div role="alert" style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: C.amberInk }}>
                    <span style={{ flex: 1 }}>{t.checklistFailed}</span>
                    <button type="button" onClick={() => ck.refetch()} style={{
                      height: 44, padding: "0 14px", border: 0, borderRadius: 10, background: C.amberInk,
                      color: "#fff", font: `600 15px ${SANS}`, cursor: "pointer",
                    }}>{t.retry}</button>
                  </div>
                ) : (
                  <div style={{ marginTop: 22, fontSize: 16, color: C.muted }}>
                    {ck.isLoading || ck.isFetching ? t.loadingChecklist : t.noChecklist}
                  </div>
                )
              ) : categories.map((cat) => {
                const catDone = cat.tasks.filter((x) => ck.isDone(x.id)).length;
                return (
                  <div key={cat.category} style={{ marginTop: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px 8px" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.goldInk }}>
                        {translateCategory(cat.category, lang)}
                      </span>
                      <span style={{ fontSize: 15, color: C.muted }}>{catDone}/{cat.tasks.length}</span>
                    </div>
                    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
                      {cat.tasks.map((item, i) => {
                        const photo = ck.photoFor(item.id);
                        const upload = ck.uploadStateFor(item.id);
                        const uploadError = ck.uploadErrorFor(item.id);
                        // One action per task: the photo. Tapping anywhere on
                        // the row opens the camera, and the photo ticks the task
                        // on the server — no separate checkbox step.
                        const done = ck.isDone(item.id);
                        return (
                          <div key={item.id} style={{
                            borderTop: i ? `1px solid ${C.hair}` : 0,
                            background: done ? "#FBFAF6" : C.card,
                          }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <button type="button" onClick={() => pickTaskPhoto(item.id)}
                                disabled={!canEditChecklist || upload === "uploading"}
                                aria-label={`${translateTask(item.task, lang)} — ${photo ? t.replacePhoto : t.addPhoto}`}
                                style={{
                                  flex: 1, minWidth: 0, minHeight: 64, padding: "12px 8px 12px 14px", border: 0,
                                  background: "transparent", display: "flex", alignItems: "center", gap: 14,
                                  textAlign: "left", cursor: canEditChecklist ? "pointer" : "default", fontFamily: SANS,
                                }}>
                                <span style={{
                                  width: 32, height: 32, borderRadius: "50%",
                                  border: `2px solid ${done ? C.green : C.creamLine}`,
                                  background: done ? C.green : C.card,
                                  display: "grid", placeItems: "center", flexShrink: 0,
                                  opacity: canEditChecklist || done ? 1 : 0.5,
                                }}>
                                  {done && <Check className="w-[18px] h-[18px]" strokeWidth={3} style={{ color: "#fff" }} />}
                                </span>
                                <span style={{ fontSize: 17, lineHeight: 1.35, color: done ? C.faint : C.ink }}>
                                  {translateTask(item.task, lang)}
                                </span>
                              </button>
                              {photo && <ImageThumb src={photo} alt={item.task} size={36} rounded={10} />}
                              <button type="button" disabled={!canEditChecklist || upload === "uploading"}
                                onClick={() => pickTaskPhoto(item.id)}
                                title={upload === "uploading" ? t.uploadingPhoto : photo ? t.replacePhoto : t.addPhoto}
                                aria-label={upload === "uploading" ? t.uploadingPhoto : photo ? t.replacePhoto : t.addPhoto}
                                style={{
                                  width: 52, height: 52, margin: "0 6px", border: 0, borderRadius: 12,
                                  background: upload === "failed" ? C.amberBg : photo ? C.gold : C.bg,
                                  color: upload === "failed" ? C.amberInk : photo ? C.ink : C.goldInk,
                                  display: "grid", placeItems: "center", flexShrink: 0,
                                  cursor: canEditChecklist ? "pointer" : "default",
                                  opacity: upload === "uploading" || !canEditChecklist ? 0.5 : 1,
                                }}>
                                {upload === "failed"
                                  ? <AlertTriangle className="w-[22px] h-[22px]" strokeWidth={2} />
                                  : photo
                                    ? <ImageIcon className="w-[22px] h-[22px]" strokeWidth={2.2} />
                                    : <Camera className="w-[22px] h-[22px]" strokeWidth={1.8} />}
                              </button>
                            </div>
                            {upload && (
                              <div style={{
                                padding: "0 14px 10px 60px", fontSize: 14, lineHeight: 1.35,
                                color: upload === "failed" ? C.amberInk : upload === "uploading" ? C.muted : C.goldInk,
                              }}>
                                {upload === "uploading" ? t.uploadingPhoto : (uploadError || t.photoFailed)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              position: "sticky", bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`,
              padding: `12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)`,
            }}>
              {active?.status === "in-progress" && ck.gate.ok ? (
                <button type="button" onClick={finishRoom} disabled={finishing} style={{
                  width: "100%", height: 64, border: 0, borderRadius: 14, background: C.green,
                  color: "#fff", font: `700 19px ${SANS}`, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 10, opacity: finishing ? 0.7 : 1,
                }}>
                  <Check className="w-6 h-6" strokeWidth={2.5} />{finishing ? t.sending : t.finish}
                </button>
              ) : (
                <div style={{
                  width: "100%", minHeight: 64, borderRadius: 14, background: "#f3eee2", color: C.muted,
                  font: `600 17px/1.3 ${SANS}`, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", padding: "8px 14px", textAlign: "center",
                }}>
                  {active?.status === "awaiting-inspection" ? (
                    t.lockedWaiting
                  ) : active?.status !== "in-progress" ? (
                    t.notStarted
                  ) : !totalCount ? (
                    t.noChecklist
                  ) : (
                    <>
                      <span>
                        {(() => {
                          // A photo ticks its task, so an unticked task that
                          // also lacks a photo is ONE thing left, not two.
                          // Only a task ticked by hand without a photo, or
                          // unticked after its photo, is counted separately.
                          const photoIds = new Set(ck.gate.missingPhotos.map((x) => x.id));
                          const tickOnly = ck.gate.incomplete.filter((x) => !photoIds.has(x.id)).length;
                          const photos = ck.gate.missingPhotos.length;
                          const parts = [
                            photos > 0 ? t.photosLeft(photos) : null,
                            tickOnly > 0 ? t.left(tickOnly) : null,
                          ].filter(Boolean);
                          return parts.join(" · ");
                        })()}
                        {ck.gate.incomplete.length === 0 && ck.gate.missingPhotos.length === 0 && ck.gate.error}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═════════ DONE ═════════ */}
        {screen === "done" && (
          <>
            <div style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "60px 28px 20px", textAlign: "center",
            }}>
              <div style={{ width: 112, height: 112, borderRadius: "50%", background: C.greenBg, display: "grid", placeItems: "center" }}>
                <Check className="w-[60px] h-[60px]" strokeWidth={2.5} style={{ color: C.green }} />
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1.05, marginTop: 26 }}>{t.doneTitle}</div>
              <div style={{ fontSize: 18, lineHeight: 1.5, color: C.muted, marginTop: 12, textWrap: "pretty" }}>
                {t.doneBody(finishedName || active?.name || "")}
              </div>
            </div>
            <div style={{ padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)` }}>
              <button type="button" onClick={() => { setActiveId(null); setScreen("home"); }} style={{
                width: "100%", height: 64, border: 0, borderRadius: 14, background: C.ink,
                color: C.onDark, font: `700 19px ${SANS}`, cursor: "pointer",
              }}>{t.backToday}</button>
            </div>
          </>
        )}

        {/* ═════════ REPORT A PROBLEM ═════════ */}
        {screen === "problem" && (
          <>
            {screenHeader(closeProblem)}
            {psent ? (
              <>
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", padding: "20px 28px", textAlign: "center",
                }}>
                  <div style={{ width: 112, height: 112, borderRadius: "50%", background: C.amberBg, display: "grid", placeItems: "center" }}>
                    <Check className="w-14 h-14" strokeWidth={2.2} style={{ color: C.amberInk }} />
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1.05, marginTop: 26 }}>{t.sentTitle}</div>
                  <div style={{ fontSize: 18, lineHeight: 1.5, color: C.muted, marginTop: 12 }}>{t.sentBody}</div>
                </div>
                <div style={{ padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)` }}>
                  <button type="button" onClick={closeProblem} style={{
                    width: "100%", height: 64, border: 0, borderRadius: 14, background: C.ink,
                    color: C.onDark, font: `700 19px ${SANS}`, cursor: "pointer",
                  }}>{t.okay}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ flex: 1, padding: "20px 16px 24px" }}>
                  <div style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1.05 }}>{t.problemTitle}</div>
                  <div style={{ fontSize: 16, color: C.muted, marginTop: 6 }}>
                    {problemRoom ? t.forRoom(problemRoom.name) : PROPERTY_LABEL}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
                    {(Object.keys(PROBLEM_TYPES) as ProblemType[]).map((key) => {
                      const spec = PROBLEM_TYPES[key];
                      const Icon = spec.icon;
                      const on = ptype === key;
                      return (
                        <button key={key} type="button" onClick={() => setPtype(key)} style={{
                          minHeight: 120, padding: "16px 14px",
                          border: `2px solid ${on ? C.gold : C.line}`, background: on ? C.cream : C.card,
                          borderRadius: 16, display: "flex", flexDirection: "column",
                          alignItems: "flex-start", justifyContent: "space-between", gap: 12,
                          textAlign: "left", cursor: "pointer", font: `600 17px/1.3 ${SANS}`, color: C.ink,
                        }}>
                          <Icon className="w-[30px] h-[30px]" strokeWidth={1.8} style={{ color: C.goldInk }} />
                          {t[spec.label] as string}
                        </button>
                      );
                    })}
                  </div>

                  <button type="button" onClick={pickProblemPhoto} style={{
                    marginTop: 14, width: "100%", minHeight: 64,
                    border: `2px dashed ${pphoto ? C.gold : C.creamLine}`,
                    background: pphoto ? C.cream : C.card, borderRadius: 16, display: "flex",
                    alignItems: "center", justifyContent: "center", gap: 10,
                    font: `600 17px ${SANS}`, color: C.ink, cursor: "pointer",
                  }}>
                    <Camera className="w-6 h-6" strokeWidth={1.8} style={{ color: C.goldInk }} />
                    {pphoto ? t.photoAdded : t.photo}
                  </button>
                  {pphotoPreview && (
                    <div style={{ marginTop: 10 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pphotoPreview} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.line}` }} />
                    </div>
                  )}

                  <textarea value={pnote} onChange={(e) => setPnote(e.target.value)} placeholder={t.note} rows={3}
                    style={{
                      marginTop: 14, width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`,
                      borderRadius: 16, padding: "14px 16px", font: `400 17px/1.4 ${SANS}`, color: C.ink,
                      background: C.card, resize: "none",
                    }} />
                </div>
                <div style={{
                  position: "sticky", bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`,
                  padding: `12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)`,
                }}>
                  <button type="button" onClick={sendProblem} disabled={!ptype || sendingProblem} style={{
                    width: "100%", height: 64, border: 0, borderRadius: 14,
                    background: ptype ? C.ink : "#f3eee2", color: ptype ? C.onDark : C.muted,
                    font: `700 19px ${SANS}`, cursor: ptype ? "pointer" : "default",
                    opacity: sendingProblem ? 0.7 : 1,
                  }}>
                    {sendingProblem ? t.sending : ptype ? t.send : t.pickFirst}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═════════ MESSAGES ═════════ */}
        {screen === "messages" && (
          <>
            <div style={{
              position: "sticky", top: 0, zIndex: 20, background: C.card, borderBottom: `1px solid ${C.line}`,
              padding: `calc(env(safe-area-inset-top, 0px) + 24px) 20px 14px`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1 }}>{conversation?.name || t.office}</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{t.officeSub}</div>
              </div>
              {OFFICE_PHONE && (
                <a href={`tel:${OFFICE_PHONE}`} style={{
                  height: 48, padding: "0 18px", borderRadius: 999, background: C.ink, color: C.onDark,
                  display: "flex", alignItems: "center", gap: 8, font: `600 16px ${SANS}`,
                  textDecoration: "none", flexShrink: 0,
                }}>
                  <Phone className="w-[18px] h-[18px]" strokeWidth={2} />{t.call}
                </a>
              )}
            </div>

            <div style={{ flex: 1, padding: "16px 16px 124px" }}>
              {/* Office updates — the notification feed, kept distinct from the
                  chat so a system event isn't dressed up as a typed message. */}
              {notifications.length > 0 && (
                <>
                  {sectionLabel(t.fromOffice)}
                  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, marginBottom: 22, overflow: "hidden" }}>
                    {notifications.slice(0, 6).map((n, i) => (
                      <button key={n.id} type="button" onClick={() => readNotification(n)} style={{
                        width: "100%", textAlign: "left", border: 0, borderTop: i ? `1px solid ${C.hair}` : 0,
                        background: n.read ? C.card : "#FDF8F3", padding: "14px 16px", cursor: "pointer",
                        display: "flex", gap: 12, alignItems: "flex-start", fontFamily: SANS,
                      }}>
                        <span style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                          background: n.rawType === "cleaning_rejected" ? C.violetBg : C.cream,
                        }}>
                          {n.rawType === "cleaning_rejected"
                            ? <AlertTriangle className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: C.violetInk }} />
                            : <Check className="w-[18px] h-[18px]" strokeWidth={2.5} style={{ color: C.goldInk }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                            <span style={{ fontSize: 16, fontWeight: 600 }}>{n.title}</span>
                            <span style={{ fontSize: 13, color: C.faint, flexShrink: 0 }}>{n.timestamp}</span>
                          </span>
                          <span style={{ display: "block", fontSize: 15, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{n.description}</span>
                        </span>
                        {!n.read && <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.gold, flexShrink: 0, marginTop: 6 }} />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!conversationId ? (
                <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, fontSize: 16, color: C.muted, lineHeight: 1.45 }}>
                  {t.noThread}
                </div>
              ) : thread.length === 0 ? (
                <div style={{ fontSize: 16, color: C.muted }}>{t.noMessages}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {thread.map((m) => {
                    const mine = String(m.sender_id) === myId;
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "80%", padding: "12px 14px", borderRadius: 18,
                          background: mine ? C.ink : C.card, color: mine ? C.onDark : C.ink,
                          border: mine ? 0 : `1px solid ${C.line}`, fontSize: 17, lineHeight: 1.4,
                        }}>{m.message_text}</div>
                        <div style={{ fontSize: 13, color: C.faint, margin: "4px 6px 0" }}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>
              )}
            </div>

            {conversationId && (
              <div style={{
                position: "sticky", bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`,
                padding: `10px 12px calc(env(safe-area-inset-bottom, 0px) + 100px)`,
              }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {t.quick.map((q) => (
                    <button key={q} type="button" onClick={() => sendQuick(q)} style={{
                      height: 44, padding: "0 16px", border: `1px solid ${C.creamLine}`, background: C.cream,
                      color: C.ink, borderRadius: 999, font: `500 16px ${SANS}`, cursor: "pointer",
                    }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═════════ HELP ═════════ */}
        {screen === "help" && (
          <div style={{ flex: 1, padding: `calc(env(safe-area-inset-top, 0px) + 28px) 20px 124px` }}>
            <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1.05 }}>{t.helpTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              {OFFICE_PHONE ? (
                <a href={`tel:${OFFICE_PHONE}`} style={{
                  minHeight: 72, padding: "0 18px", borderRadius: 16, background: C.ink, color: C.onDark,
                  display: "flex", alignItems: "center", gap: 14, font: `600 19px ${SANS}`, textDecoration: "none",
                }}>
                  <Phone className="w-[26px] h-[26px] flex-shrink-0" strokeWidth={2} style={{ color: C.gold }} />{t.callOffice}
                </a>
              ) : (
                <button type="button" onClick={openMessages} style={{
                  minHeight: 72, padding: "0 18px", borderRadius: 16, background: C.ink, color: C.onDark,
                  border: 0, display: "flex", alignItems: "center", gap: 14, font: `600 19px ${SANS}`,
                  cursor: "pointer", textAlign: "left",
                }}>
                  <MessageSquare className="w-[26px] h-[26px] flex-shrink-0" strokeWidth={2} style={{ color: C.gold }} />{t.messageOffice}
                </button>
              )}
              <button type="button" onClick={openProblem} style={{
                minHeight: 72, padding: "0 18px", borderRadius: 16, background: C.amberBg, color: C.amberInk,
                border: `1px solid ${C.amberLine}`, display: "flex", alignItems: "center", gap: 14,
                font: `600 19px ${SANS}`, cursor: "pointer", textAlign: "left",
              }}>
                <AlertTriangle className="w-[26px] h-[26px] flex-shrink-0" strokeWidth={2} />{t.report}
              </button>
            </div>

            <div style={{ marginTop: 30 }}>
              <CleanerCalendarCard lang={lang} size="mobile" />
            </div>

            <div style={{ marginTop: 30 }}>{sectionLabel(t.how)}</div>
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16 }}>
              {t.steps.map((step, i) => (
                <div key={step} style={{ display: "flex", gap: 14, alignItems: "center", padding: 16, borderTop: i ? `1px solid ${C.hair}` : 0 }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: "50%", background: C.cream, color: C.goldInk,
                    display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: 24, flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 17, lineHeight: 1.4 }}>{step}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 30, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
            }}>
              <span style={{
                width: 44, height: 44, borderRadius: "50%", background: C.gold, color: "#2c1f14",
                display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: 22, flexShrink: 0,
              }}>{firstName.charAt(0).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{me?.name || "Cleaner"}</div>
                <div style={{ fontSize: 14, color: C.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{me?.email || ""}</div>
              </div>
              <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} style={{
                height: 44, padding: "0 14px", border: `1px solid ${C.line}`, background: C.bg,
                borderRadius: 12, font: `500 15px ${SANS}`, color: C.ink, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              }}>
                <LogOut className="w-4 h-4" />{t.signOut}
              </button>
            </div>
          </div>
        )}

        {/* ═════════ FLOATING NAV ═════════ */}
        {showTabs && (
          <div style={{
            position: "fixed", left: "50%", transform: "translateX(-50%)",
            bottom: `calc(env(safe-area-inset-bottom, 0px) + 22px)`,
            width: "100%", maxWidth: 480, padding: "0 16px", zIndex: 40, pointerEvents: "none",
          }}>
            <div style={{
              background: C.ink, borderRadius: 999, padding: 8, display: "flex", gap: 4,
              boxShadow: "0 16px 40px rgba(31,27,22,0.35)", pointerEvents: "auto",
            }}>
              {([
                { id: "home" as Screen, label: t.tabToday, Icon: HomeIcon, onClick: () => setScreen("home"), badge: false },
                { id: "messages" as Screen, label: t.tabMsg, Icon: MessageSquare, onClick: openMessages, badge: unreadTotal > 0 },
                { id: "help" as Screen, label: t.tabHelp, Icon: LifeBuoy, onClick: () => setScreen("help"), badge: false },
              ]).map(({ id, label, Icon, onClick, badge }) => {
                const on = screen === id;
                return (
                  <button key={id} type="button" onClick={onClick} aria-label={label} aria-current={on ? "page" : undefined}
                    style={{
                      flex: on ? "2.2" : "1", height: 60, border: 0, borderRadius: 999,
                      background: on ? C.gold : "transparent", color: on ? C.ink : C.onDarkFaint,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      font: `700 16px ${SANS}`, cursor: "pointer", position: "relative",
                      minWidth: 0, overflow: "hidden", whiteSpace: "nowrap",
                      transition: "all .3s cubic-bezier(.2,.8,.2,1)",
                    }}>
                    <Icon className="w-6 h-6 flex-shrink-0" strokeWidth={2} />
                    {on && <span>{label}</span>}
                    {badge && !on && (
                      <span style={{
                        position: "absolute", top: 12, right: "calc(50% - 18px)", width: 10, height: 10,
                        borderRadius: "50%", background: C.gold, border: `2px solid ${C.ink}`,
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
