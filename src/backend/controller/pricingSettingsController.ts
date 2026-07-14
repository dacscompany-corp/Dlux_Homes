import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";

async function ensurePricingTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      weekend_days INTEGER[] NOT NULL DEFAULT '{5,6}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`INSERT INTO pricing_settings (id, weekend_days) VALUES (1, '{5,6}') ON CONFLICT (id) DO NOTHING`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_holidays (
      holiday_date DATE PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// GET — PUBLIC. The guest-facing checkout & room-detail pages call this to
// know which days/dates should price as weekend/holiday.
export async function getCalendarRules(): Promise<NextResponse> {
  try {
    await ensurePricingTables();
    const [settings, holidays] = await Promise.all([
      pool.query(`SELECT weekend_days FROM pricing_settings WHERE id = 1`),
      pool.query(`SELECT holiday_date::text AS date, label FROM pricing_holidays ORDER BY holiday_date ASC`),
    ]);
    const weekendDays = ((settings.rows[0]?.weekend_days as number[]) ?? [5, 6]).map(Number);
    return NextResponse.json({ success: true, data: { weekendDays, holidays: holidays.rows } });
  } catch (error: unknown) {
    console.error("Error getting pricing calendar rules:", error);
    const message = error instanceof Error ? error.message : "Failed to load pricing calendar rules";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT — admin. Body: { weekendDays: number[] } (0=Sun .. 6=Sat)
export async function updateWeekendDays(req: NextRequest): Promise<NextResponse> {
  try {
    await ensurePricingTables();
    const body = await req.json().catch(() => ({} as { weekendDays?: unknown }));
    const raw: unknown = body?.weekendDays;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ success: false, error: "weekendDays must be an array of day numbers (0-6)." }, { status: 400 });
    }
    const days: number[] = Array.from(new Set(raw.map((d: unknown) => Number(d))))
      .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a: number, b: number) => a - b);
    if (days.length === 0) {
      return NextResponse.json({ success: false, error: "Pick at least one weekend day." }, { status: 400 });
    }
    await pool.query(`UPDATE pricing_settings SET weekend_days = $1, updated_at = NOW() WHERE id = 1`, [days]);
    return NextResponse.json({ success: true, data: { weekendDays: days } });
  } catch (error: unknown) {
    console.error("Error updating weekend days:", error);
    const message = error instanceof Error ? error.message : "Failed to update weekend days";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST — admin. Body: { date: "YYYY-MM-DD", label?: string }. Upserts (lets
// an admin fix a label typo by re-adding the same date).
export async function addHoliday(req: NextRequest): Promise<NextResponse> {
  try {
    await ensurePricingTables();
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === "string" ? body.date : "";
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO pricing_holidays (holiday_date, label)
       VALUES ($1, $2)
       ON CONFLICT (holiday_date) DO UPDATE SET label = EXCLUDED.label
       RETURNING holiday_date::text AS date, label`,
      [date, label]
    );
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: unknown) {
    console.error("Error adding pricing holiday:", error);
    const message = error instanceof Error ? error.message : "Failed to add holiday";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — admin. Query: ?date=YYYY-MM-DD
export async function deleteHoliday(req: NextRequest): Promise<NextResponse> {
  try {
    await ensurePricingTables();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || "";
    if (!date) {
      return NextResponse.json({ success: false, error: "date is required" }, { status: 400 });
    }
    const result = await pool.query(
      `DELETE FROM pricing_holidays WHERE holiday_date = $1 RETURNING holiday_date::text AS date`,
      [date]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Holiday not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: unknown) {
    console.error("Error deleting pricing holiday:", error);
    const message = error instanceof Error ? error.message : "Failed to delete holiday";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
