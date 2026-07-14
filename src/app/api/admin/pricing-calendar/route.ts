import { NextRequest } from "next/server";
import { getCalendarRules, updateWeekendDays, addHoliday, deleteHoliday } from "@/backend/controller/pricingSettingsController";
import { requireAdmin } from "@/backend/utils/requireAdmin";

// GET is PUBLIC — the guest-facing checkout & room-detail pages fetch this to
// know which days/dates price as weekend/holiday. No sensitive data.
export async function GET() {
  return getCalendarRules();
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return updateWeekendDays(req);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return addHoliday(req);
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteHoliday(req);
}
