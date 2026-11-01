import { NextRequest } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { listExtensions } from "@/backend/controller/bookingExtensionController";

export const runtime = "nodejs";

// Extension history — Owner/CSR only. ?booking_id= for one booking, else all.
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return listExtensions(req.nextUrl.searchParams.get("booking_id"));
}
