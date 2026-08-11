import type { Pool, PoolClient } from "pg";

// Single source of truth for "may this promo code be used right now, and what
// is it worth". Both the checkout input box (/api/discounts/validate) and the
// booking submit (createBooking) run THIS function.
//
// They used to disagree: the input box checked the rules, and submit accepted
// whatever discount_id/discount_amount the browser sent. So a code that was
// valid when typed still applied after it was deactivated, and a crafted
// request could claim any discount for any amount.

export type DiscountOk = {
  ok: true;
  discount: {
    id: string;
    code: string;
    name: string;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    discount_amount: number;
  };
};
export type DiscountFail = { ok: false; error: string; status: number };
export type DiscountResult = DiscountOk | DiscountFail;

type Args = {
  db: Pool | PoolClient;
  /** Look up by code (checkout input) … */
  code?: string | null;
  /** … or by id (booking submit, where the code was already resolved). */
  discountId?: string | null;
  havenId?: string | null;
  userId?: string | null;
  /** The amount the discount applies to, BEFORE this discount is subtracted. */
  amount: number;
};

export async function validateDiscount({ db, code, discountId, havenId, userId, amount }: Args): Promise<DiscountResult> {
  const trimmed = (code ?? "").trim();
  if (!trimmed && !discountId) {
    return { ok: false, error: "Enter a promo code.", status: 400 };
  }

  const result = await db.query(
    `SELECT d.id, d.code, d.name, d.discount_type, d.discount_value, d.min_booking_amount,
            d.max_uses, d.used_count
     FROM discounts d
     WHERE ($1::text IS NULL OR UPPER(d.code) = UPPER($1))
       AND ($2::uuid IS NULL OR d.id = $2)
       AND d.active = true
       AND d.start_date <= NOW()
       AND d.end_date >= NOW()
       AND (d.max_uses IS NULL OR d.used_count < d.max_uses)
       AND (
         NOT EXISTS (SELECT 1 FROM discount_havens dh WHERE dh.discount_id = d.id)
         OR ($3::uuid IS NOT NULL AND EXISTS (
           SELECT 1 FROM discount_havens dh WHERE dh.discount_id = d.id AND dh.haven_id = $3
         ))
       )
       -- A voucher code is the redemption mechanism for its promotion. Turning
       -- the promotion off in the admin has to turn the code off too, otherwise
       -- "deactivated" only hides the banner while the code keeps paying out.
       AND NOT EXISTS (
         SELECT 1 FROM promotions p
         WHERE p.discount_id = d.id
           AND (p.active = false OR p.start_date > NOW() OR p.end_date < NOW())
       )
     LIMIT 1`,
    [trimmed || null, discountId || null, havenId || null],
  );

  if (result.rows.length === 0) {
    return { ok: false, error: "This promo code is invalid or has expired.", status: 404 };
  }
  const d = result.rows[0];

  // One redemption per account per code — regardless of what happens to the
  // booking that used it (a cancelled/rejected booking doesn't free it).
  if (userId) {
    const already = await db.query(
      `SELECT 1 FROM discount_users WHERE discount_id = $1 AND user_id = $2 AND used = true LIMIT 1`,
      [d.id, userId],
    );
    if (already.rows.length > 0) {
      return { ok: false, error: "You've already used this promo code.", status: 409 };
    }
  }

  const minBooking = d.min_booking_amount != null ? parseFloat(d.min_booking_amount) : null;
  if (minBooking != null && amount < minBooking) {
    return {
      ok: false,
      error: `This code requires a minimum booking of ₱${minBooking.toLocaleString("en-PH")}.`,
      status: 400,
    };
  }

  const discountValue = parseFloat(d.discount_value);
  const discountAmount = d.discount_type === "percentage"
    ? Math.round(amount * (discountValue / 100))
    : Math.min(Math.round(discountValue), amount);

  return {
    ok: true,
    discount: {
      id: d.id,
      code: d.code,
      name: d.name,
      discount_type: d.discount_type,
      discount_value: discountValue,
      discount_amount: discountAmount,
    },
  };
}
