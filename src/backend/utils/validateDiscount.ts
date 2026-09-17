import type { Pool, PoolClient } from "pg";
import { capDiscount, fixedAmountOver } from "@/lib/promo-offer";
import { normalizeEmail } from "@/lib/normalize-email";

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

/** Shown for a reused code and for a reused automatic promotion alike. */
export const ALREADY_REDEEMED_ERROR = "You've already used this promo code.";

type Db = Pool | PoolClient;

/**
 * Who is claiming this offer.
 *
 * Most bookings here are made SIGNED OUT — checkout has no sign-in gate, and the
 * account is not created until the booking is approved. Keying "one use per
 * guest" on user_id alone therefore enforced nothing for the majority of
 * bookings: no account meant no check, and no recorded redemption to check
 * against next time either.
 *
 * So the email typed at checkout is the primary identity, and user_id is a
 * second key that catches the same person once they do have an account (their
 * older guest rows get stamped with it on their next redemption).
 */
export type PromoIdentity = {
  /** Server-derived only — never the `user_id` field sent by the client. */
  userId?: string | null;
  /** The address typed into the checkout contact form. */
  guestEmail?: string | null;
  /** The signed-in account's own address, when there is a session. */
  accountEmail?: string | null;
};

/** Every address this claimant could be known by, normalized and deduplicated. */
export function promoIdentityEmails(identity: PromoIdentity): string[] {
  const emails = [normalizeEmail(identity.accountEmail), normalizeEmail(identity.guestEmail)];
  return [...new Set(emails.filter((e): e is string => e !== null))];
}

/**
 * The single address a redemption is RECORDED under.
 *
 * The account address wins when there is one, so a guest cannot spread one code
 * across several bookings by varying what they type while signed in. Falling
 * back to the typed address is the signed-out case, which is most of them.
 */
export function promoRedemptionEmail(identity: PromoIdentity): string | null {
  return normalizeEmail(identity.accountEmail) ?? normalizeEmail(identity.guestEmail);
}

/**
 * Resolve the full identity for a claim: the session's account (and its
 * address, looked up rather than trusted) plus whatever was typed at checkout.
 *
 * Shared by /api/discounts/validate and createBooking so the code the guest
 * gets told is valid is checked against exactly the same person at submit.
 */
export async function resolvePromoIdentity(
  db: Db,
  sessionUserId: string | null,
  typedEmail: string | null | undefined,
): Promise<PromoIdentity> {
  let accountEmail: string | null = null;
  if (sessionUserId) {
    const account = await db.query(`SELECT email FROM users WHERE user_id = $1 LIMIT 1`, [sessionUserId]);
    accountEmail = normalizeEmail(account.rows[0]?.email);
  }
  return { userId: sessionUserId, guestEmail: normalizeEmail(typedEmail), accountEmail };
}

/**
 * Has this guest already redeemed this offer?
 *
 * `table` is `discount_users` (voucher codes) or `promotion_users` (automatic
 * promotions); they are the same shape by design. A match on ANY key counts —
 * the account, the address it is registered to, or the address typed at
 * checkout. So signing in does not hand back a code already spent as a guest,
 * booking as a guest does not hand back one spent while signed in, and typing
 * someone else's address while signed in does not either.
 *
 * With no identity at all this returns false — there is nothing to match on, and
 * refusing every anonymous claim would break the admin New Booking wizard.
 */
async function alreadyRedeemed(
  db: Db,
  table: "discount_users" | "promotion_users",
  column: "discount_id" | "promotion_id",
  offerId: string,
  identity: PromoIdentity,
): Promise<boolean> {
  const userId = identity.userId || null;
  const emails = promoIdentityEmails(identity);
  if (!userId && emails.length === 0) return false;

  // `table`/`column` are union-typed literals, not caller strings — there is no
  // interpolated user input in this statement.
  const result = await db.query(
    `SELECT 1 FROM ${table}
      WHERE ${column} = $1
        AND used = true
        AND ( ($2::uuid IS NOT NULL AND user_id = $2)
           OR guest_email = ANY($3::text[]) )
      LIMIT 1`,
    [offerId, userId, emails],
  );
  return result.rows.length > 0;
}

/**
 * The automatic-promotion counterpart of the check inside validateDiscount().
 *
 * A codeless promotion has nothing to type, so there is no "apply" step to
 * refuse it at: /api/promotions/active stops offering it, and createBooking
 * refuses it at submit. Both call this.
 */
export function promotionAlreadyRedeemed(args: PromoIdentity & {
  db: Db;
  promotionId: string;
}): Promise<boolean> {
  return alreadyRedeemed(args.db, "promotion_users", "promotion_id", args.promotionId, args);
}

type Args = PromoIdentity & {
  db: Db;
  /** Look up by code (checkout input) … */
  code?: string | null;
  /** … or by id (booking submit, where the code was already resolved). */
  discountId?: string | null;
  havenId?: string | null;
  /** The amount the discount applies to, BEFORE this discount is subtracted. */
  amount: number;
  /**
   * Nights in the stay — only consumed by a per-night fixed amount. Defaults to
   * 1, which is also the right answer for a Daycation/Nightcation (one session).
   *
   * createBooking DERIVES this from check_in_date/check_out_date rather than
   * accepting it from the payload: a client-supplied night count would just be a
   * new way to multiply the discount.
   */
  nights?: number;
};

export async function validateDiscount({ db, code, discountId, havenId, userId, guestEmail, accountEmail, amount, nights = 1 }: Args): Promise<DiscountResult> {
  const trimmed = (code ?? "").trim();
  if (!trimmed && !discountId) {
    return { ok: false, error: "Enter a promo code.", status: 400 };
  }

  const result = await db.query(
    `SELECT d.id, d.code, d.name, d.discount_type, d.discount_value, d.min_booking_amount,
            d.max_uses, d.used_count, d.per_night, d.max_discount
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

  // One redemption per guest per code — where "guest" is the email they book
  // under, or their account if they have one. Not per *account*: almost nobody
  // signs in here, so an account-only rule was a rule for nobody.
  //
  // Holds regardless of what happens to the booking that used it (a cancelled
  // or rejected booking does not free it).
  if (await alreadyRedeemed(db, "discount_users", "discount_id", d.id, { userId, guestEmail, accountEmail })) {
    return { ok: false, error: ALREADY_REDEEMED_ERROR, status: 409 };
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
  const maxDiscount = d.max_discount != null ? parseFloat(d.max_discount) : null;
  // A percentage is taken on a total that already grew with the night count;
  // only a fixed peso amount needs spreading across the stay. Mirrors
  // promoDiscountOn() on the storefront — the two disagreeing is what makes a
  // booking bounce at submit with DISCOUNT_INVALID.
  const discountAmount = capDiscount(
    d.discount_type === "percentage"
      ? Math.round(amount * (discountValue / 100))
      : fixedAmountOver(Math.round(discountValue), d.per_night === true, nights),
    maxDiscount,
    amount,
  );

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
