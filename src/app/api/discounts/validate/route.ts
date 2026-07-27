import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";

// Validates a guest-entered promo code at checkout: active + in-window,
// applies to this haven (or all havens), under its usage cap, not already
// redeemed by this account, and the booking total meets its minimum.
// Returns the peso amount to subtract.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const code = (body?.code as string || "").trim();
    const havenId = body?.haven_id as string | undefined;
    const userId = body?.user_id as string | undefined;
    const amount = Number(body?.amount) || 0;

    if (!code) {
      return NextResponse.json({ success: false, error: "Enter a promo code." }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT d.id, d.code, d.name, d.discount_type, d.discount_value, d.min_booking_amount,
              d.max_uses, d.used_count
       FROM discounts d
       WHERE UPPER(d.code) = UPPER($1)
         AND d.active = true
         AND d.start_date <= NOW()
         AND d.end_date >= NOW()
         AND (d.max_uses IS NULL OR d.used_count < d.max_uses)
         AND (
           NOT EXISTS (SELECT 1 FROM discount_havens dh WHERE dh.discount_id = d.id)
           OR ($2::uuid IS NOT NULL AND EXISTS (
             SELECT 1 FROM discount_havens dh WHERE dh.discount_id = d.id AND dh.haven_id = $2
           ))
         )
       LIMIT 1`,
      [code, havenId || null]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "This promo code is invalid or has expired." }, { status: 404 });
    }

    const d = result.rows[0];

    // One redemption per account per code — regardless of what happens to
    // the booking that used it (a cancelled/rejected booking doesn't free it).
    if (userId) {
      const already = await pool.query(
        `SELECT 1 FROM discount_users WHERE discount_id = $1 AND user_id = $2 AND used = true LIMIT 1`,
        [d.id, userId]
      );
      if (already.rows.length > 0) {
        return NextResponse.json({ success: false, error: "You've already used this promo code." }, { status: 409 });
      }
    }
    const minBooking = d.min_booking_amount != null ? parseFloat(d.min_booking_amount) : null;
    if (minBooking != null && amount < minBooking) {
      return NextResponse.json(
        { success: false, error: `This code requires a minimum booking of ₱${minBooking.toLocaleString("en-PH")}.` },
        { status: 400 }
      );
    }

    const discountValue = parseFloat(d.discount_value);
    const discountAmount = d.discount_type === "percentage"
      ? Math.round(amount * (discountValue / 100))
      : Math.min(Math.round(discountValue), amount);

    return NextResponse.json({
      success: true,
      data: {
        id: d.id,
        code: d.code,
        name: d.name,
        discount_type: d.discount_type,
        discount_value: discountValue,
        discount_amount: discountAmount,
      },
    });
  } catch (error) {
    console.error("Error validating discount code:", error);
    return NextResponse.json({ success: false, error: "Could not validate this code. Please try again." }, { status: 500 });
  }
}
