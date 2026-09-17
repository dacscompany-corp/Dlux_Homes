import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";
import { resolvePromoIdentity, promoIdentityEmails } from "@/backend/utils/validateDiscount";

// PUBLIC BY DESIGN — fetched from the unauthenticated rooms page to render
// the promo banner. Only currently-active, in-window promotions are ever
// returned; expired/scheduled/disabled rows never leave the server.
//
// Promotions the guest has already redeemed are filtered out: each promotion is
// one use per guest. This is the single choke point — the storefront card, the
// room-page price panel and the checkout discount all read from this list, so a
// redeemed promotion simply stops existing for that guest rather than each
// surface re-implementing the rule.
//
// "That guest" is their account when signed in, and otherwise the address they
// typed at checkout (`?email=`). Almost nobody signs in here, so the account-only
// filter this used to have never fired for the people it was written for; the
// rooms page still calls it with no email, since nothing has been typed yet.
//
// This is a DISPLAY filter, not the enforcement. createBooking re-checks the
// same rule at submit — see the promotion branch there.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    // Same identity the checkout submit will be judged against, so the list the
    // guest sees and the offer they are allowed to claim cannot disagree.
    const identity = await resolvePromoIdentity(pool, userId, req.nextUrl.searchParams.get("email"));
    const emails = promoIdentityEmails(identity);

    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.image_url, p.discount_type, p.discount_value,
              p.discount_id, p.start_date, p.end_date, p.applies_to, p.redemption,
              p.per_night, p.max_discount,
              d.code AS discount_code
       FROM promotions p
       LEFT JOIN discounts d ON d.id = p.discount_id
       WHERE p.active = true
         AND p.start_date <= NOW()
         AND p.end_date >= NOW()
         AND (
           ($1::uuid IS NULL AND cardinality($2::text[]) = 0)
           OR NOT EXISTS (
             SELECT 1 FROM promotion_users pu
             WHERE pu.promotion_id = p.id
               AND pu.used = true
               AND ( ($1::uuid IS NOT NULL AND pu.user_id = $1)
                  OR pu.guest_email = ANY($2::text[]) )
           )
         )
       ORDER BY p.created_at DESC`,
      [userId, emails]
    );

    // NUMERIC comes back from pg as a string; the pricing helpers all do
    // arithmetic on these, so parse once here rather than at every call site.
    const promotions = result.rows.map((row) => ({
      ...row,
      discount_value: row.discount_value != null ? parseFloat(row.discount_value) : null,
      max_discount: row.max_discount != null ? parseFloat(row.max_discount) : null,
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
