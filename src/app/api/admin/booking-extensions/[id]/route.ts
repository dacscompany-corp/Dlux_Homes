import { NextRequest } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { markExtensionPaid } from "@/backend/controller/bookingExtensionController";

export const runtime = "nodejs";

// Record that the guest paid an extension — Owner/CSR only. Body: { method? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return markExtensionPaid(id, body, { id: (guard.session.user as { id?: string }).id ?? null }, req);
}
