/**
 * Is the unit free? — the server-side answer, shared by anything that needs it.
 *
 * This exists because availability lived in two places that could not be called
 * from a webhook: the conflict query inside createBooking, and a client-side
 * reconstruction in the room page. A third copy would have drifted from both.
 * The SQL fragments here are the SAME constants createBooking uses
 * (EXISTING_START_SQL / EXISTING_END_SQL / occupyingBookingSql / turnoverSql),
 * so the two can only disagree in composition — which is what
 * scripts/test-messenger-availability.mjs pins down.
 *
 * Every date is a Manila calendar date, "YYYY-MM-DD".
 */
import {
  occupyingBookingSql,
  isStartBookable,
  EXISTING_START_SQL,
  EXISTING_END_SQL,
} from "./bookingWindow";
import { turnoverSql } from "./turnover";
import { DEFAULT_CALENDAR_RULES, type CalendarRules } from "./pricing";
import type { StayWindow } from "./messenger-reply";

/** Anything that can run a parameterised query — the pool, a client, or a test stub. */
export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type HavenContext = {
  havenId: string;
  roomName: string;
  windows: StayWindow[];
};

/**
 * The connection pool, imported lazily.
 *
 * A top-level `import pool from "@/backend/config/db"` would drag the pg pool
 * (and the "@/" path alias, which the test runner does not resolve) into every
 * unit test, even though the tests always inject their own Queryable. Deferring
 * it keeps this module importable without a database.
 */
let cachedPool: Queryable | null = null;
async function resolveDb(db?: Queryable): Promise<Queryable> {
  if (db) return db;
  if (!cachedPool) {
    const mod = await import("@/backend/config/db");
    cachedPool = mod.default as unknown as Queryable;
  }
  return cachedPool;
}

/**
 * The one haven row, mapped the way the storefront maps it.
 *
 * Follows the same column convention as haven-adapter: six_hour_check_in/out is
 * the NIGHTCATION window, not a six-hour stay. Reading those columns literally
 * would invent a fourth stay type that does not exist.
 */
export async function loadHavenContext(db?: Queryable): Promise<HavenContext | null> {
  const q = await resolveDb(db);
  const r = await q.query(
    `SELECT uuid_id::text AS id, haven_name,
            ten_hour_check_in, ten_hour_check_out,
            six_hour_check_in, six_hour_check_out,
            twenty_one_hour_check_in, twenty_one_hour_check_out
       FROM havens
      LIMIT 1`,
  );
  const h = r.rows[0];
  if (!h) return null;

  const hhmm = (v: unknown) => (v ? String(v).slice(0, 5) : "");
  const candidates: StayWindow[] = [
    { stayType: "10", label: "Daycation",   checkIn: hhmm(h.ten_hour_check_in),        checkOut: hhmm(h.ten_hour_check_out) },
    { stayType: "10", label: "Nightcation", checkIn: hhmm(h.six_hour_check_in),        checkOut: hhmm(h.six_hour_check_out) },
    { stayType: "21", label: "Overnight",   checkIn: hhmm(h.twenty_one_hour_check_in), checkOut: hhmm(h.twenty_one_hour_check_out) },
  ];

  return {
    havenId: String(h.id),
    roomName: String(h.haven_name),
    windows: candidates.filter((w) => w.checkIn && w.checkOut),
  };
}

/**
 * The owner-editable weekend/holiday calendar, read server-side.
 *
 * The storefront gets these from GET /api/admin/pricing-calendar via
 * useCalendarRules(). The bot must read the SAME tables rather than lean on
 * DEFAULT_CALENDAR_RULES, whose holiday list is a hardcoded fallback: if the
 * owner adds a holiday in the admin, a bot using the defaults would quote the
 * weekday rate while checkout charges the weekend one.
 */
export async function loadCalendarRules(db?: Queryable): Promise<CalendarRules> {
  try {
    const q = await resolveDb(db);
    const [settings, holidays] = await Promise.all([
      q.query(`SELECT weekend_days FROM pricing_settings WHERE id = 1`),
      q.query(`SELECT holiday_date::text AS date FROM pricing_holidays`),
    ]);
    const days = (settings.rows[0]?.weekend_days as number[] | undefined) ?? [5, 6];
    const weekendDays = new Set<number>(days.map(Number));
    const holidaySet = new Set<string>(holidays.rows.map((r) => String(r.date)));
    return {
      weekendDays: weekendDays.size > 0 ? weekendDays : DEFAULT_CALENDAR_RULES.weekendDays,
      holidays: holidaySet.size > 0 ? holidaySet : DEFAULT_CALENDAR_RULES.holidays,
    };
  } catch {
    // Pricing must never break because the calendar tables are unreachable.
    return DEFAULT_CALENDAR_RULES;
  }
}

/** Manila "YYYY-MM-DD" for an instant. */
function manilaDateISO(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * A stay's check-out DATE. A window whose end time is at or before its start
 * time wraps past midnight (Nightcation 19:00 -> 05:00), so it lands on the next
 * day; an Overnight adds its night count.
 */
function checkOutDate(checkInISO: string, nights: number, w: StayWindow): string {
  if (w.stayType === "10") {
    return w.checkOut <= w.checkIn ? addDaysISO(checkInISO, 1) : checkInISO;
  }
  return addDaysISO(checkInISO, Math.max(1, nights));
}

/**
 * One conflict test, identical in shape to createBooking's availabilityCheckQuery,
 * plus a blocked_dates overlap. No rows back means the span is free.
 */
const CONFLICT_SQL = `
  WITH n AS (
    SELECT ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
           (CASE WHEN $5 = '00:00'
                 THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP
                 ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne
  )
  SELECT 1 AS conflict
  FROM booking b, n
  WHERE b.room_name = $1
    AND ${occupyingBookingSql("b")}
    AND ${EXISTING_START_SQL} < n.ne + ${turnoverSql("n.ns", "n.ne")}
    AND (${EXISTING_END_SQL} + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}) > n.ns
  UNION ALL
  SELECT 1
  FROM blocked_dates bd
  WHERE bd.haven_id = $6
    AND bd.from_date <= $4::DATE
    AND bd.to_date   >= $2::DATE
  LIMIT 1
`;

async function spanIsFree(
  checkInISO: string,
  nights: number,
  w: StayWindow,
  ctx: HavenContext,
  db: Queryable,
): Promise<boolean> {
  const r = await db.query(CONFLICT_SQL, [
    ctx.roomName,
    checkInISO,
    w.checkIn,
    checkOutDate(checkInISO, nights, w),
    w.checkOut,
    ctx.havenId,
  ]);
  return r.rows.length === 0;
}

/** Which stay windows are open on `dateISO`. */
export async function openWindowsOn(
  dateISO: string,
  ctx: HavenContext,
  db?: Queryable,
  now: Date = new Date(),
): Promise<StayWindow[]> {
  const q = await resolveDb(db);
  const todayISO = manilaDateISO(now);
  const open: StayWindow[] = [];
  for (const w of ctx.windows) {
    // A window whose check-in has already passed cannot be sold, however empty
    // the unit is. Only today's windows can be elapsed.
    if (dateISO === todayISO) {
      const startMs = Date.parse(`${dateISO}T${w.checkIn}:00+08:00`);
      if (!isStartBookable(startMs, now.getTime())) continue;
    }
    if (await spanIsFree(dateISO, 1, w, ctx, q)) open.push(w);
  }
  return open;
}

/** Is a multi-night stay in this window free end to end? */
export async function isRangeOpen(
  checkInISO: string,
  nights: number,
  w: StayWindow,
  ctx: HavenContext,
  db?: Queryable,
): Promise<boolean> {
  return spanIsFree(checkInISO, nights, w, ctx, await resolveDb(db));
}

/**
 * Open Overnight dates within the next `days`, as one query rather than N.
 * Today is excluded when its check-in has already passed.
 */
export async function openDatesAhead(
  days: number,
  ctx: HavenContext,
  db?: Queryable,
  now: Date = new Date(),
): Promise<string[]> {
  const q = await resolveDb(db);
  const overnight = ctx.windows.find((w) => w.stayType === "21");
  if (!overnight) return [];

  const todayISO = manilaDateISO(now);
  const startMs = Date.parse(`${todayISO}T${overnight.checkIn}:00+08:00`);
  const firstISO = isStartBookable(startMs, now.getTime()) ? todayISO : addDaysISO(todayISO, 1);

  const sql = `
    WITH d AS (
      SELECT generate_series($2::DATE, $2::DATE + ($3::INT - 1), INTERVAL '1 day')::DATE AS day
    ),
    n AS (
      SELECT d.day,
             (d.day + $4::TIME)::TIMESTAMP AS ns,
             (d.day + 1 + $5::TIME)::TIMESTAMP AS ne
      FROM d
    )
    SELECT to_char(n.day, 'YYYY-MM-DD') AS d
    FROM n
    WHERE NOT EXISTS (
      SELECT 1 FROM booking b
      WHERE b.room_name = $1
        AND ${occupyingBookingSql("b")}
        AND ${EXISTING_START_SQL} < n.ne + ${turnoverSql("n.ns", "n.ne")}
        AND (${EXISTING_END_SQL} + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}) > n.ns
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocked_dates bd
      WHERE bd.haven_id = $6
        AND bd.from_date <= n.day
        AND bd.to_date   >= n.day
    )
    ORDER BY n.day
  `;
  const r = await q.query(sql, [
    ctx.roomName,
    firstISO,
    days,
    overnight.checkIn,
    overnight.checkOut,
    ctx.havenId,
  ]);
  return r.rows.map((row) => String(row.d));
}
