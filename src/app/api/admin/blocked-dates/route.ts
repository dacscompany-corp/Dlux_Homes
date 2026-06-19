import {
  getAllBlockedDates,
  createBlockedDate,
  updateBlockedDate,
  deleteBlockedDate,
} from "@/backend/controller/blockedDatesController";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import pool from "@/backend/config/db";

// GET /api/admin/blocked-dates
//   ?haven_id=<uuid>   → PUBLIC. Used by Components/HeroSection/DateRangePicker
//                        on the guest checkout flow to grey out unavailable
//                        dates. Returns ONLY a minimal projection
//                        (id, from_date, to_date, status) — no `reason` (which
//                        may contain admin notes), no joined haven metadata.
//   no haven_id        → ADMIN ONLY. Full management view via the controller
//                        (includes reason + haven name/tower/floor).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const havenId = searchParams.get("haven_id");

  if (havenId) {
    try {
      // blocked_dates has no `status` column — every row is an active block.
      const result = await pool.query(
        `SELECT id::text, from_date::text, to_date::text
           FROM blocked_dates
          WHERE haven_id = $1
          ORDER BY from_date ASC`,
        [havenId]
      );
      return NextResponse.json({ success: true, data: result.rows });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load blocked dates";
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return getAllBlockedDates(req);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return createBlockedDate(req);
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return updateBlockedDate(req);
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteBlockedDate(req);
}
