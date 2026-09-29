// What one cleaning task looks like as a Google Calendar event, in each
// cleaner's own "D'Lux Cleaning – Name" calendar.
//
// Pure, so the rules are testable without Google: the time window, the
// status-in-the-title, and exactly which booking details a cleaner may see
// (booking ref, stay type, guest FIRST name, party size — never contact or
// payment details, same as the portal).

import { stayKindFor } from "./cleaning-schedule";

/** Default cleaning block when there's no next guest soon after checkout. */
export const DEFAULT_CLEANING_HOURS = 2;

/**
 * A next check-in further away than this isn't a deadline worth drawing — a
 * calendar block running for days would bury everything else — so the event
 * falls back to the default length.
 */
export const MAX_WINDOW_HOURS = 24;

export type CalendarTaskInput = {
  bookingRef: string;
  room: string;
  cleaningStatus: string;
  /** Set when the office sent it back; the title says so. */
  inspectionNote?: string | null;
  /** Cleaning may start from here: the guest's checkout. */
  dueAt: Date;
  /** The next guest's check-in to the same unit, if any. */
  nextCheckInAt?: Date | null;
  guestFirstName?: string | null;
  adults?: number | null;
  children?: number | null;
  check_in_date?: string | null;
  check_in_time?: string | null;
  check_out_date?: string | null;
  check_out_time?: string | null;
  /** Absolute link to the cleaner portal. */
  portalUrl?: string | null;
};

export type CalendarEventBody = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  /** Google Calendar event colour (1–11). */
  colorId: string;
};

const TZ = "Asia/Manila";

/**
 * Start = checkout. End = the next guest's check-in when it falls within
 * MAX_WINDOW_HOURS (the real deadline), otherwise DEFAULT_CLEANING_HOURS later.
 */
export function cleaningWindow(dueAt: Date, nextCheckInAt?: Date | null): { start: Date; end: Date; untilNextGuest: boolean } {
  const fallback = new Date(dueAt.getTime() + DEFAULT_CLEANING_HOURS * 3_600_000);
  if (nextCheckInAt) {
    const gap = nextCheckInAt.getTime() - dueAt.getTime();
    if (gap > 0 && gap <= MAX_WINDOW_HOURS * 3_600_000) {
      return { start: dueAt, end: nextCheckInAt, untilNextGuest: true };
    }
  }
  return { start: dueAt, end: fallback, untilNextGuest: false };
}

/** Title prefix + colour per status, so the calendar reads as a status board. */
export function statusLook(status: string, inspectionNote?: string | null): { prefix: string; colorId: string } {
  if (status === "in-progress" && inspectionNote) return { prefix: "🔁 Fix", colorId: "6" }; // tangerine
  switch (status) {
    case "in-progress":
      return { prefix: "🟡 Cleaning", colorId: "5" }; // banana
    case "awaiting-inspection":
      return { prefix: "🟣 Awaiting inspection", colorId: "3" }; // grape
    case "ready":
    case "cleaned":
    case "inspected":
      return { prefix: "✅ Ready", colorId: "10" }; // basil
    default:
      return { prefix: "🧹 Clean", colorId: "7" }; // peacock
  }
}

function stayLabel(input: CalendarTaskInput): string {
  const { kind, nights } = stayKindFor(input);
  if (kind === "day") return "Daycation";
  if (kind === "night") return "Nightcation";
  return nights > 1 ? `${nights} nights` : "Overnight";
}

function manilaTime(d: Date): string {
  return d.toLocaleString("en-PH", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildCleaningEvent(input: CalendarTaskInput): CalendarEventBody {
  const { start, end, untilNextGuest } = cleaningWindow(input.dueAt, input.nextCheckInAt);
  const look = statusLook(input.cleaningStatus, input.inspectionNote);
  const stay = stayLabel(input);

  const party =
    input.adults != null
      ? `${input.adults} adult${input.adults === 1 ? "" : "s"}${
          input.children ? `, ${input.children} child${input.children === 1 ? "" : "ren"}` : ""
        }`
      : null;

  const lines = [
    `Booking: ${input.bookingRef}`,
    `Stay: ${stay}`,
    input.guestFirstName ? `Guest: ${input.guestFirstName}` : null,
    party ? `Guests: ${party}` : null,
    `Guest checks out: ${manilaTime(input.dueAt)}`,
    untilNextGuest && input.nextCheckInAt
      ? `Next guest checks in: ${manilaTime(input.nextCheckInAt)} — room must be ready by then`
      : null,
    input.cleaningStatus === "in-progress" && input.inspectionNote
      ? `Office asked you to fix: ${input.inspectionNote}`
      : null,
    "",
    "Take a photo of each checklist task in the cleaner portal — the photo ticks it off.",
    input.portalUrl ? `Open the portal: ${input.portalUrl}` : null,
  ].filter((l): l is string => l !== null);

  return {
    summary: `${look.prefix} · ${input.bookingRef} · ${stay}`,
    description: lines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    colorId: look.colorId,
  };
}

/** Link that opens (and offers to add) a shared calendar in Google Calendar. */
export function googleCalendarAddUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
}
