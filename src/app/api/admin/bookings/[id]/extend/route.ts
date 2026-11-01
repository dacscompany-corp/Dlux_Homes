import { NextRequest } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { applyExtension, previewExtension } from "@/backend/controller/bookingExtensionController";

export const runtime = "nodejs";

// Extend Booking — Owner/CSR only. Guests have no route to this.
//   GET  ?new_check_out=YYYY-MM-DD → availability + suggested price (changes nothing)
//   POST { new_check_out, charge, note? } → saves the extension
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return previewExtension(id, req.nextUrl.searchParams.get("new_check_out"));
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const user = guard.session.user as { id?: string; name?: string | null };
  return applyExtension(id, body, { id: user.id ?? null, name: user.name || guard.role }, req);
}
