import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";

// PUBLIC BY DESIGN — fetched from the unauthenticated rooms page to render
// the promo banner. Only currently-active, in-window promotions are ever
// returned; expired/scheduled/disabled rows never leave the server.
//
// When a guest IS signed in, promotions they've already redeemed are filtered
// out: each promotion is one use per account. This is the single choke point —
// the storefront card, the room-page price panel and the checkout discount all
// read from this list, so a redeemed promotion simply stops existing for that
// guest rather than each surface re-implementing the rule.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.image_url, p.discount_type, p.discount_value,
              p.discount_id, p.start_date, p.end_date, p.applies_to, p.redemption,
              d.code AS discount_code
       FROM promotions p
       LEFT JOIN discounts d ON d.id = p.discount_id
       WHERE p.active = true
         AND p.start_date <= NOW()
         AND p.end_date >= NOW()
         AND (
           $1::uuid IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM promotion_users pu
             WHERE pu.promotion_id = p.id AND pu.user_id = $1::uuid AND pu.used = true
           )
         )
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const promotions = result.rows.map((row) => ({
      ...row,
      discount_value: row.discount_value != null ? parseFloat(row.discount_value) : null,
    }));

    return NextResponse.json({ success: true, data: promotions });
  } catch (error) {
    console.error("Error fetching active promotions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch promotions" },
      { status: 500 }
    );
  }
}
