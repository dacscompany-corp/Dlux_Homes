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

/** True once the guest has checked out and the room may be cleaned. */
export function canStartCleaning(task: SchedulableTask, now: Date = new Date()): boolean {
  const due = cleaningDueAt(task);
  return !due || now.getTime() >= due.getTime();
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
