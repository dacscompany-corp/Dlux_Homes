import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { sweepUnassignedCleaning } from "@/backend/controller/cleanersController";

// POST /api/admin/cleaners/tasks/sync — Owner/CSR "Check for missing tasks".
//
// The same safe catch-up the 15-minute cron runs, on demand: every confirmed
// stay (and any stay that checked out in the last few days) gets its cleaning
// task, unassigned ones go through the fair rotation, and rooms held by a
// deactivated cleaner are handed on. One task per booking (UNIQUE booking_id),
// so running it any number of times never creates duplicates.
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const result = await sweepUnassignedCleaning();
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("tasks/sync failed:", err);
    return NextResponse.json({ success: false, error: "Could not check for missing tasks" }, { status: 500 });
  }
}
