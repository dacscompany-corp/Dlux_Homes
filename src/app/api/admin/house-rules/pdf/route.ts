import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { generateHouseRulesPDF } from "@/backend/utils/houseRulesPdf";
import {
  RULE_SECTIONS,
  DUTY_HEADLINE,
  DUTY_SUB,
  QUIET_TIME,
  POOL_NOTE,
  WELCOME,
  TAGLINE,
  SIGN_OFF,
  houseRulesAccess,
} from "@/lib/house-rules-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/house-rules/pdf — the letter-size House Rules sheet.
 *
 * Admin-only: the sheet carries the unit's Wi-Fi password and Netflix PIN, so
 * it must never be reachable by a guest session.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const a = houseRulesAccess();
    const pdf = await generateHouseRulesPDF({
      ...a,
      sections: RULE_SECTIONS,
      dutyHeadline: DUTY_HEADLINE,
      dutySub: DUTY_SUB,
      quietTime: QUIET_TIME,
      poolNote: POOL_NOTE,
      welcome: WELCOME,
      tagline: TAGLINE,
      signOff: SIGN_OFF,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="dlux-house-rules.pdf"',
        // Contains credentials — keep it out of any shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[house-rules/pdf] failed to build sheet:", err);
    return NextResponse.json(
      { success: false, error: "Could not build the house rules PDF" },
      { status: 500 },
    );
  }
}
