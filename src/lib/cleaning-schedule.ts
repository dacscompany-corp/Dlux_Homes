import { stayTypeCodeFor } from "./bookingWindow";

// When a cleaning is due, and how the portals lay assignments out by day.
//
// A cleaning is due at the guest's checkout. The server stores that on
// booking_cleaning.scheduled_for; older rows (and any response that predates
// the column) fall back to the booking's own check_out_date + check_out_time,
// with the same '00:00 means midnight at the END of the checkout date' rule the
// SQL uses. Both portals read the due time from here, so the mobile "Today"
// list and the desktop "My Schedule" can never put a room on different days.

export type SchedulableTask = {
  scheduled_for?: string | null;
  /** The booking's own status — 'completed' means the guest has checked out. */
  booking_status?: string | null;
  check_out_date?: string | null;
  check_out_time?: string | null;
};

// Booking dates and times are Manila wall-clock (the property is in Quezon
// City; the Philippines has no daylight saving). Anchoring the fallback to
// +08:00 makes it the same instant the server stores in scheduled_for, whatever
// timezone the viewing device happens to be set to.
const MANILA_OFFSET = "+08:00";

/** When cleaning may begin: the guest's checkout. Null if the row has no dates. */
export function cleaningDueAt(task: SchedulableTask): Date | null {
  if (task.scheduled_for) {
    const d = new Date(task.scheduled_for);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (!task.check_out_date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(task.check_out_date));
  if (!m) return null;

  const time = (task.check_out_time ?? "").slice(0, 5);
  if (time === "00:00") {
    // Midnight checkout is the END of the checkout date.
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00${MANILA_OFFSET}`);
    return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  const hhmm = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "23:59";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${hhmm}:00${MANILA_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Booking statuses that mean the guest has actually left. 'completed' is what
 * the Owner/CSR "Check Out" button writes; 'checked-out' is accepted too in
 * case a caller ever stores it literally.
 */
export const CHECKED_OUT_STATUSES: readonly string[] = ["completed", "checked-out"];

/** The guest has been marked checked out, whatever the clock says. */
export function guestCheckedOut(task: SchedulableTask): boolean {
  return !!task.booking_status && CHECKED_OUT_STATUSES.includes(task.booking_status);
}

/**
 * True once the room may be cleaned: EITHER the guest has been checked out
 * (an early checkout opens the room immediately) OR the scheduled checkout
 * time has arrived. Mirrors the server gate in tasks/[id]/start.
 */
export function canStartCleaning(task: SchedulableTask, now: Date = new Date()): boolean {
  if (guestCheckedOut(task)) return true;
  const due = cleaningDueAt(task);
  return !due || now.getTime() >= due.getTime();
}

export type StayKind = "day" | "night" | "overnight";

/**
 * Daycation / Nightcation / Overnight for a booking, for the cleaner's card.
 * Built on stayTypeCodeFor (the booking code's own rule: a ~10h session vs a
 * ~21h+ stay), then split: a session inside one date is a Daycation, one that
 * crosses midnight is a Nightcation. `nights` counts calendar nights.
 */
export function stayKindFor(task: {
  check_in_date?: string | null;
  check_in_time?: string | null;
  check_out_date?: string | null;
  check_out_time?: string | null;
}): { kind: StayKind; nights: number } {
  const inDay = String(task.check_in_date ?? "").slice(0, 10);
  const outDay = String(task.check_out_date ?? "").slice(0, 10);
  const nights = inDay && outDay
    ? Math.max(0, Math.round((Date.parse(outDay) - Date.parse(inDay)) / 86_400_000))
    : 0;
  const code = stayTypeCodeFor(inDay, outDay, task.check_in_time, task.check_out_time);
  if (code === "10") return { kind: nights === 0 ? "day" : "night", nights };
  return { kind: "overnight", nights: Math.max(1, nights) };
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type ScheduleDay<T> = {
  /** Local midnight of the day. */
  day: Date;
  isToday: boolean;
  isTomorrow: boolean;
  tasks: T[];
};

/**
 * Groups assignments by the local day their cleaning is due, earliest first,
 * each day's rooms in due-time order. Tasks with no date go last under a null
 * day would be meaningless, so they are dropped — every real assignment has a
 * checkout.
 */
export function groupByDueDay<T extends SchedulableTask>(
  tasks: T[],
  now: Date = new Date(),
): ScheduleDay<T>[] {
  const today = startOfLocalDay(now).getTime();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const byDay = new Map<number, { day: Date; items: { due: Date; task: T }[] }>();
  for (const task of tasks) {
    const due = cleaningDueAt(task);
    if (!due) continue;
    const day = startOfLocalDay(due);
    const key = day.getTime();
    const bucket = byDay.get(key) ?? { day, items: [] };
    bucket.items.push({ due, task });
    byDay.set(key, bucket);
  }

  return [...byDay.values()]
    .sort((a, b) => a.day.getTime() - b.day.getTime())
    .map(({ day, items }) => ({
      day,
      isToday: day.getTime() === today,
      isTomorrow: day.getTime() === tomorrow.getTime(),
      tasks: items.sort((a, b) => a.due.getTime() - b.due.getTime()).map((i) => i.task),
    }));
}
