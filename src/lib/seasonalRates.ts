import { BUNDLE_TIER1_LABEL, BUNDLE_TIER2_LABEL, BUNDLE_TIER3_LABEL, BUNDLE_TIER4_LABEL, type SeasonalRate } from "./pricing";

// A seasonal_rates row as the admin sees it: the pricing shape plus the
// ON/OFF state and bookkeeping. Only `active` rows are ever handed to pricing.
export type SeasonalRateRecord = SeasonalRate & {
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SeasonStatus = "active" | "upcoming" | "ended" | "off";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// pg returns DATE as a JS Date unless the query casts it (::text); NUMERIC
// always arrives as a string. Accept both so every caller maps rows the same way.
function toISODate(v: unknown): string {
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return String(v ?? "").slice(0, 10);
}

// NULL (or a missing column on a DB not yet migrated) = tier not set.
function optionalRate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function seasonFromRow(row: Record<string, unknown>): SeasonalRateRecord {
  const ts = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    startDate: toISODate(row.start_date),
    endDate: toISODate(row.end_date),
    overnightWeekday: Number(row.overnight_weekday_rate),
    overnightWeekend: Number(row.overnight_weekend_rate),
    daynightWeekday: Number(row.daynight_weekday_rate),
    daynightWeekend: Number(row.daynight_weekend_rate),
    allowPromos: row.allow_promos === true,
    longtermTier1: optionalRate(row.longterm_tier1_rate),
    longtermTier2: optionalRate(row.longterm_tier2_rate),
    longtermTier3: optionalRate(row.longterm_tier3_rate),
    longtermTier4: optionalRate(row.longterm_tier4_rate),
    active: row.active === true,
    createdAt: ts(row.created_at),
    updatedAt: ts(row.updated_at),
  };
}

// Strip the admin-only fields before a season goes to the public endpoint.
export function publicSeason(s: SeasonalRateRecord): SeasonalRate {
  return {
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    overnightWeekday: s.overnightWeekday,
    overnightWeekend: s.overnightWeekend,
    daynightWeekday: s.daynightWeekday,
    daynightWeekend: s.daynightWeekend,
    allowPromos: s.allowPromos,
    longtermTier1: s.longtermTier1 ?? null,
    longtermTier2: s.longtermTier2 ?? null,
    longtermTier3: s.longtermTier3 ?? null,
    longtermTier4: s.longtermTier4 ?? null,
  };
}

export type SeasonInput = {
  name: string;
  startDate: string;
  endDate: string;
  overnightWeekday: number;
  overnightWeekend: number;
  daynightWeekday: number;
  daynightWeekend: number;
  allowPromos: boolean;
  active: boolean;
  // Optional long-term tier rates; null = not set for this season.
  longtermTier1: number | null;
  longtermTier2: number | null;
  longtermTier3: number | null;
  longtermTier4: number | null;
};

// Validates an admin create/edit body. The database enforces the same rules
// (CHECK + EXCLUDE constraints); this exists so the owner gets a readable
// message instead of a constraint name.
export function parseSeasonInput(body: unknown): { ok: true; value: SeasonInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "Season name is required." };
  if (name.length > 120) return { ok: false, error: "Season name must be 120 characters or fewer." };

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  const endDate = typeof b.endDate === "string" ? b.endDate : "";
  if (!ISO_DATE.test(startDate) || Number.isNaN(Date.parse(startDate))) return { ok: false, error: "A valid start date is required." };
  if (!ISO_DATE.test(endDate) || Number.isNaN(Date.parse(endDate))) return { ok: false, error: "A valid end date is required." };
  if (startDate > endDate) return { ok: false, error: "Start date cannot be later than end date." };

  const rateFields = [
    ["overnightWeekday", "Overnight weekday rate"],
    ["overnightWeekend", "Overnight weekend/holiday rate"],
    ["daynightWeekday", "Day/Night weekday rate"],
    ["daynightWeekend", "Day/Night weekend/holiday rate"],
  ] as const;
  const rates = {} as Record<(typeof rateFields)[number][0], number>;
  for (const [key, label] of rateFields) {
    const n = Number(b[key]);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `${label} must be greater than 0.` };
    if (n > 99_999_999) return { ok: false, error: `${label} is too large.` };
    rates[key] = Math.round(n * 100) / 100;
  }

  // Long-term tiers are optional: blank means "use the season's nightly rate".
  const tierFields = [
    ["longtermTier1", `Long-term ${BUNDLE_TIER1_LABEL} rate`],
    ["longtermTier2", `Long-term ${BUNDLE_TIER2_LABEL} rate`],
    ["longtermTier3", `Long-term ${BUNDLE_TIER3_LABEL} rate`],
    ["longtermTier4", `Long-term ${BUNDLE_TIER4_LABEL} rate`],
  ] as const;
  const tiers = {} as Record<(typeof tierFields)[number][0], number | null>;
  for (const [key, label] of tierFields) {
    const raw = b[key];
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) { tiers[key] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `${label} must be greater than 0, or left blank.` };
    if (n > 99_999_999) return { ok: false, error: `${label} is too large.` };
    tiers[key] = Math.round(n * 100) / 100;
  }

  return {
    ok: true,
    value: { name, startDate, endDate, ...rates, ...tiers, allowPromos: b.allowPromos === true, active: b.active === true },
  };
}

// Inclusive date ranges overlap when each starts on or before the other ends.
export function seasonsOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

// The active season (other than `excludeId`) that `range` would collide with.
// Used for the admin's pre-save warning and the 409 message; the exclusion
// constraint is what actually enforces it.
export function findActiveOverlap(
  range: { startDate: string; endDate: string },
  seasons: readonly SeasonalRateRecord[],
  excludeId?: string,
): SeasonalRateRecord | undefined {
  return seasons.find((s) => s.active && s.id !== excludeId && seasonsOverlap(range, s));
}

export function seasonStatus(s: Pick<SeasonalRateRecord, "active" | "startDate" | "endDate">, todayISO: string): SeasonStatus {
  if (!s.active) return "off";
  if (todayISO < s.startDate) return "upcoming";
  if (todayISO > s.endDate) return "ended";
  return "active";
}

// "Dec 5 – Dec 31, 2026" / "Dec 20, 2026 – Jan 2, 2027". Parsed from parts, not
// new Date(iso), which would read the date as UTC and can shift a day.
export function formatSeasonRange(startDate: string, endDate: string): string {
  const fmt = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  };
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${fmt(startDate, !sameYear)} – ${fmt(endDate, true)}`;
}
