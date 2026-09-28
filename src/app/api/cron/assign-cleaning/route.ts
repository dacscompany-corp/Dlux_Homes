import { NextRequest, NextResponse } from "next/server";
import { sweepUnassignedCleaning } from "@/backend/controller/cleanersController";
import { reconcileCleaningCalendars } from "@/backend/utils/cleaningCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/assign-cleaning
 *
 * Catch-up for automatic cleaner assignment. Assignment normally happens the
 * moment a booking is confirmed; this sweep assigns any live booking (confirmed,
 * on-going or checked-in) whose cleaning still has no cleaner — bookings
 * confirmed before automatic assignment existed, and tasks that were left
 * unassigned because nobody was eligible at the time. Uses the same fair
 * rotation as confirmation (see sweepUnassignedCleaning).
 *
 * Run every ~15 minutes from the external scheduler, like the other
 * /api/cron/* routes. Idempotent: an assigned task is never touched again, and
 * a task that still can't be placed doesn't re-notify Owner/CSR each run.
 *
 * Protected by CRON_SECRET, and fails closed in production if it isn't set.
 */
export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron/assign-cleaning] CRON_SECRET is not set — refusing to run in production.");
      return NextResponse.json({ success: false, error: "Cron not configured" }, { status: 503 });
    }
    // Non-production: allow unauthenticated local triggering for testing.
  } else {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sweepUnassignedCleaning();
    // Then heal cleaners' Google Calendars: picks up anything a live sync
    // missed (a Google blip, a new booking that ends a cleaning window sooner,
    // an event deleted by hand).
    const calendar = await reconcileCleaningCalendars();
    return NextResponse.json({ success: true, ...result, calendar });
  } catch (error) {
    console.error("[cron/assign-cleaning] sweep failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Sweep failed" },
      { status: 500 }
    );
  }
}
