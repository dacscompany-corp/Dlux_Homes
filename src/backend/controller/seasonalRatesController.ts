import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { loadActiveSeasons } from "@/lib/availability";
import {
  seasonFromRow,
  parseSeasonInput,
  findActiveOverlap,
  formatSeasonRange,
  type SeasonalRateRecord,
} from "@/lib/seasonalRates";

// Seasonal rates — owner-set date ranges that replace the regular rates. See
// src/backend/migrations/2026-09-16-create-seasonal-rates.sql for the table and
// src/lib/pricing.ts (seasonFor / stayBreakdown) for how they price a stay.

// Postgres exclusion-violation code — raised by seasonal_rates_no_active_overlap.
const EXCLUSION_VIOLATION = "23P01";

async function allSeasons(): Promise<SeasonalRateRecord[]> {
  const res = await pool.query(`SELECT * FROM seasonal_rates ORDER BY start_date DESC, created_at DESC`);
  return res.rows.map(seasonFromRow);
}

function overlapMessage(other: SeasonalRateRecord): string {
  return `Overlaps the active season "${other.name}" (${formatSeasonRange(other.startDate, other.endDate)}). Turn that season OFF or change the dates first.`;
}

// 409 naming the season it collides with. `range` is the season being saved;
// the lookup runs after the failed write, so it sees the committed state.
async function overlapResponse(range: { startDate: string; endDate: string }, excludeId?: string): Promise<NextResponse> {
  const other = findActiveOverlap(range, await allSeasons(), excludeId);
  const error = other ? overlapMessage(other) : "These dates overlap another active season.";
  return NextResponse.json({ success: false, error, code: "SEASON_OVERLAP" }, { status: 409 });
}

async function logActivity(req: NextRequest, employeeId: string | null, action: string, description: string, entityId: string) {
  if (!employeeId) return;
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await pool.query(`SELECT log_employee_activity($1, $2, $3, $4, $5, $6, $7)`, [
      employeeId, action, description, "seasonal_rate", entityId, ip, ua,
    ]);
  } catch (err) {
    // Audit logging must never undo a successful change.
    console.error("[seasonal-rates] activity log failed:", err);
  }
}

function serverError(label: string, error: unknown): NextResponse {
  console.error(`Error ${label}:`, error);
  const message = error instanceof Error ? error.message : `Failed ${label}`;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

const isExclusionViolation = (e: unknown) => (e as { code?: string })?.code === EXCLUSION_VIOLATION;

// GET — PUBLIC. Active seasons only, without admin fields. The storefront uses
// this to price dates (useSeasonalRates).
export async function getActiveSeasons(): Promise<NextResponse> {
  const seasons = await loadActiveSeasons();
  return NextResponse.json({ success: true, data: seasons });
}

// GET — admin. Every season, ON and OFF.
export async function listSeasons(): Promise<NextResponse> {
  try {
    return NextResponse.json({ success: true, data: await allSeasons() });
  } catch (error) {
    return serverError("listing seasonal rates", error);
  }
}

// POST — admin. Body: SeasonInput.
export async function createSeason(req: NextRequest, employeeId: string | null): Promise<NextResponse> {
  const parsed = parseSeasonInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  const s = parsed.value;
  try {
    const res = await pool.query(
      `INSERT INTO seasonal_rates (
         name, start_date, end_date,
         overnight_weekday_rate, overnight_weekend_rate, daynight_weekday_rate, daynight_weekend_rate,
         active, allow_promos, created_by,
         longterm_tier1_rate, longterm_tier2_rate, longterm_tier3_rate, longterm_tier4_rate
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [s.name, s.startDate, s.endDate, s.overnightWeekday, s.overnightWeekend, s.daynightWeekday, s.daynightWeekend, s.active, s.allowPromos, employeeId,
        s.longtermTier1, s.longtermTier2, s.longtermTier3, s.longtermTier4],
    );
    const season = seasonFromRow(res.rows[0]);
    await logActivity(req, employeeId, "CREATE_SEASONAL_RATE", `Created seasonal rate "${season.name}" (${formatSeasonRange(season.startDate, season.endDate)})`, season.id);
    return NextResponse.json({ success: true, data: season }, { status: 201 });
  } catch (error) {
    if (isExclusionViolation(error)) return overlapResponse(s);
    return serverError("creating seasonal rate", error);
  }
}

// PUT — admin. Full edit, including the ON/OFF state.
export async function updateSeason(req: NextRequest, id: string, employeeId: string | null): Promise<NextResponse> {
  const parsed = parseSeasonInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  const s = parsed.value;
  try {
    const res = await pool.query(
      `UPDATE seasonal_rates SET
         name = $2, start_date = $3, end_date = $4,
         overnight_weekday_rate = $5, overnight_weekend_rate = $6,
         daynight_weekday_rate = $7, daynight_weekend_rate = $8,
         active = $9, allow_promos = $10,
         longterm_tier1_rate = $11, longterm_tier2_rate = $12, longterm_tier3_rate = $13, longterm_tier4_rate = $14,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, s.name, s.startDate, s.endDate, s.overnightWeekday, s.overnightWeekend, s.daynightWeekday, s.daynightWeekend, s.active, s.allowPromos,
        s.longtermTier1, s.longtermTier2, s.longtermTier3, s.longtermTier4],
    );
    if (res.rows.length === 0) return NextResponse.json({ success: false, error: "Seasonal rate not found" }, { status: 404 });
    const season = seasonFromRow(res.rows[0]);
    await logActivity(req, employeeId, "UPDATE_SEASONAL_RATE", `Updated seasonal rate "${season.name}"`, season.id);
    return NextResponse.json({ success: true, data: season });
  } catch (error) {
    if (isExclusionViolation(error)) return overlapResponse(s, id);
    return serverError("updating seasonal rate", error);
  }
}

// PATCH — admin. Body: { active: boolean } — the ON/OFF toggle.
export async function setSeasonActive(req: NextRequest, id: string, employeeId: string | null): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ success: false, error: "active must be true or false." }, { status: 400 });
  }
  try {
    const res = await pool.query(
      `UPDATE seasonal_rates SET active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, body.active],
    );
    if (res.rows.length === 0) return NextResponse.json({ success: false, error: "Seasonal rate not found" }, { status: 404 });
    const season = seasonFromRow(res.rows[0]);
    await logActivity(req, employeeId, "TOGGLE_SEASONAL_RATE", `Turned seasonal rate "${season.name}" ${season.active ? "ON" : "OFF"}`, season.id);
    return NextResponse.json({ success: true, data: season });
  } catch (error) {
    if (isExclusionViolation(error)) {
      const row = await pool.query(`SELECT * FROM seasonal_rates WHERE id = $1`, [id]);
      if (row.rows[0]) return overlapResponse(seasonFromRow(row.rows[0]), id);
    }
    return serverError("toggling seasonal rate", error);
  }
}

// DELETE — admin. Bookings keep their own seasonal_rate_name snapshot.
export async function deleteSeason(req: NextRequest, id: string, employeeId: string | null): Promise<NextResponse> {
  try {
    const res = await pool.query(`DELETE FROM seasonal_rates WHERE id = $1 RETURNING *`, [id]);
    if (res.rows.length === 0) return NextResponse.json({ success: false, error: "Seasonal rate not found" }, { status: 404 });
    const season = seasonFromRow(res.rows[0]);
    await logActivity(req, employeeId, "DELETE_SEASONAL_RATE", `Deleted seasonal rate "${season.name}"`, season.id);
    return NextResponse.json({ success: true, data: season });
  } catch (error) {
    return serverError("deleting seasonal rate", error);
  }
}
