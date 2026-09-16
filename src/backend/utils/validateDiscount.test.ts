import { describe, it, expect } from "vitest";
import {
  validateDiscount,
  promotionAlreadyRedeemed,
  promoRedemptionEmail,
  resolvePromoIdentity,
  ALREADY_REDEEMED_ERROR,
} from "./validateDiscount";

/**
 * The bug these guard: "one promo per guest" was keyed on users.user_id alone.
 * Checkout has no sign-in gate and the account is not created until a booking
 * is approved, so for a guest booking there was no id — the already-used check
 * was skipped outright and the same code worked on every booking, forever.
 *
 * The identity is now the normalized email OR the account, whichever we have.
 */

type Call = { sql: string; params: unknown[] };

/**
 * Minimal `pg` stand-in. validateDiscount takes an injectable `db`, so the
 * whole function is exercisable without a database: the first query is the
 * discount lookup, any later one is the redemption check.
 */
function fakeDb(opts: { discount?: Record<string, unknown> | null; redeemed?: boolean } = {}) {
  const calls: Call[] = [];
  const discount = opts.discount === undefined
    ? {
        id: "11111111-1111-1111-1111-111111111111",
        code: "WELCOME",
        name: "Welcome offer",
        discount_type: "fixed",
        discount_value: "500",
        min_booking_amount: null,
        max_uses: null,
        used_count: 0,
        per_night: false,
        max_discount: null,
      }
    : opts.discount;

  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM discounts d")) {
        return { rows: discount ? [discount] : [] };
      }
      // discount_users / promotion_users redemption lookup
      return { rows: opts.redeemed ? [{ "?column?": 1 }] : [] };
    },
  };
  // The stub satisfies the Pool surface validateDiscount actually uses.
  return { db: db as unknown as Parameters<typeof validateDiscount>[0]["db"], calls };
}

const redemptionCalls = (calls: Call[]) => calls.filter((c) => c.sql.includes("discount_users"));

/** The `guest_email = ANY($3)` array the redemption lookup was given. */
const lookupEmails = (calls: Call[]) => redemptionCalls(calls)[0]?.params[2] as string[];

describe("validateDiscount — one use per guest", () => {
  it("refuses a code the guest's EMAIL already redeemed, with no account involved", async () => {
    const { db } = fakeDb({ redeemed: true });
    const result = await validateDiscount({ db, code: "WELCOME", guestEmail: "maria@gmail.com", amount: 5000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toBe(ALREADY_REDEEMED_ERROR);
  });

  it("matches that email case-insensitively", async () => {
    const { db, calls } = fakeDb({ redeemed: true });
    const result = await validateDiscount({ db, code: "WELCOME", guestEmail: "  MARIA@Gmail.com ", amount: 5000 });

    expect(result.ok).toBe(false);
    // The comparison is a plain `=` against an array in SQL, so normalizing
    // before the query is the whole defence — assert the normalized form went.
    expect(lookupEmails(calls)).toEqual(["maria@gmail.com"]);
  });

  it("still refuses on the account id when there is no email", async () => {
    const { db } = fakeDb({ redeemed: true });
    const result = await validateDiscount({
      db,
      code: "WELCOME",
      userId: "22222222-2222-2222-2222-222222222222",
      amount: 5000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("allows a guest who has not redeemed it", async () => {
    const { db } = fakeDb({ redeemed: false });
    const result = await validateDiscount({ db, code: "WELCOME", guestEmail: "juan@gmail.com", amount: 5000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount.discount_amount).toBe(500);
  });

  it("passes EVERY key to the lookup so signing in cannot hand a spent code back", async () => {
    const { db, calls } = fakeDb({ redeemed: false });
    await validateDiscount({
      db,
      code: "WELCOME",
      userId: "22222222-2222-2222-2222-222222222222",
      guestEmail: "maria@gmail.com",
      accountEmail: "maria.reyes@gmail.com",
      amount: 5000,
    });

    const [lookup] = redemptionCalls(calls);
    expect(lookup.params).toContain("22222222-2222-2222-2222-222222222222");
    // Both addresses: a signed-in guest who types a DIFFERENT address must not
    // escape a redemption recorded under either one.
    expect(lookupEmails(calls)).toEqual(expect.arrayContaining(["maria@gmail.com", "maria.reyes@gmail.com"]));
  });

  it("deduplicates when the typed address is the account address", async () => {
    const { db, calls } = fakeDb({ redeemed: false });
    await validateDiscount({
      db,
      code: "WELCOME",
      guestEmail: "Maria@Gmail.com",
      accountEmail: "maria@gmail.com",
      amount: 5000,
    });

    expect(lookupEmails(calls)).toEqual(["maria@gmail.com"]);
  });

  it("issues no redemption lookup at all when there is no identity", async () => {
    // The admin New Booking wizard reaches here with neither key. Refusing
    // every anonymous claim would break it, so the rule simply does not apply.
    const { db, calls } = fakeDb({ redeemed: true });
    const result = await validateDiscount({ db, code: "WELCOME", amount: 5000 });

    expect(result.ok).toBe(true);
    expect(redemptionCalls(calls)).toHaveLength(0);
  });

  it("treats a blank email as no identity rather than as an address", async () => {
    const { db, calls } = fakeDb({ redeemed: true });
    const result = await validateDiscount({ db, code: "WELCOME", guestEmail: "   ", amount: 5000 });

    expect(result.ok).toBe(true);
    expect(redemptionCalls(calls)).toHaveLength(0);
  });
});

describe("validateDiscount — unchanged rules", () => {
  it("rejects an unknown or expired code before checking redemption", async () => {
    const { db, calls } = fakeDb({ discount: null, redeemed: true });
    const result = await validateDiscount({ db, code: "NOPE", guestEmail: "maria@gmail.com", amount: 5000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(redemptionCalls(calls)).toHaveLength(0);
  });

  it("requires a code or an id", async () => {
    const { db } = fakeDb();
    const result = await validateDiscount({ db, amount: 5000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("enforces the minimum booking amount", async () => {
    const { db } = fakeDb({
      discount: {
        id: "11111111-1111-1111-1111-111111111111",
        code: "BIG",
        name: "Big spender",
        discount_type: "percentage",
        discount_value: "10",
        min_booking_amount: "10000",
        max_uses: null,
        used_count: 0,
        per_night: false,
        max_discount: null,
      },
    });
    const result = await validateDiscount({ db, code: "BIG", guestEmail: "maria@gmail.com", amount: 5000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("multiplies a per-night fixed amount by the nights, capped by max_discount", async () => {
    const { db } = fakeDb({
      discount: {
        id: "11111111-1111-1111-1111-111111111111",
        code: "PERNIGHT",
        name: "Per night",
        discount_type: "fixed",
        discount_value: "200",
        min_booking_amount: null,
        max_uses: null,
        used_count: 0,
        per_night: true,
        max_discount: "500",
      },
    });
    const result = await validateDiscount({ db, code: "PERNIGHT", amount: 10000, nights: 4 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount.discount_amount).toBe(500); // 200 × 4 = 800, capped
  });
});

describe("promotionAlreadyRedeemed", () => {
  const promotionId = "33333333-3333-3333-3333-333333333333";

  it("reports a prior redemption by email", async () => {
    const { db } = fakeDb({ redeemed: true });
    expect(await promotionAlreadyRedeemed({ db, promotionId, guestEmail: "Maria@Gmail.com" })).toBe(true);
  });

  it("reports none for a new guest", async () => {
    const { db } = fakeDb({ redeemed: false });
    expect(await promotionAlreadyRedeemed({ db, promotionId, guestEmail: "juan@gmail.com" })).toBe(false);
  });

  it("queries promotion_users, not discount_users", async () => {
    const { db, calls } = fakeDb({ redeemed: false });
    await promotionAlreadyRedeemed({ db, promotionId, guestEmail: "maria@gmail.com" });

    expect(calls[0].sql).toContain("promotion_users");
    expect(calls[0].sql).toContain("promotion_id");
  });

  it("does not query at all without an identity", async () => {
    const { db, calls } = fakeDb({ redeemed: true });
    expect(await promotionAlreadyRedeemed({ db, promotionId })).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("promoRedemptionEmail", () => {
  it("records under the account address when there is one", () => {
    // Checking is wider than writing: the lookup matches either address, but a
    // row has one key, and it has to be the one the guest cannot vary.
    expect(promoRedemptionEmail({ guestEmail: "typed@gmail.com", accountEmail: "account@gmail.com" }))
      .toBe("account@gmail.com");
  });

  it("falls back to the typed address for a signed-out guest", () => {
    expect(promoRedemptionEmail({ guestEmail: "Typed@Gmail.com" })).toBe("typed@gmail.com");
  });

  it("is null when there is no usable address", () => {
    expect(promoRedemptionEmail({})).toBeNull();
    expect(promoRedemptionEmail({ guestEmail: "  " })).toBeNull();
  });
});

describe("resolvePromoIdentity", () => {
  const accountDb = (email: string | null) =>
    ({
      query: async () => ({ rows: email ? [{ email }] : [] }),
    }) as unknown as Parameters<typeof resolvePromoIdentity>[0];

  it("looks the account address up rather than trusting the payload", async () => {
    const identity = await resolvePromoIdentity(accountDb("Account@Gmail.com"), "u1", "typed@gmail.com");
    expect(identity).toEqual({ userId: "u1", guestEmail: "typed@gmail.com", accountEmail: "account@gmail.com" });
  });

  it("leaves the account address unset for a signed-out guest", async () => {
    const identity = await resolvePromoIdentity(accountDb("never@read.com"), null, "  Typed@Gmail.com ");
    expect(identity).toEqual({ userId: null, guestEmail: "typed@gmail.com", accountEmail: null });
  });

  it("survives a session whose account row has gone", async () => {
    const identity = await resolvePromoIdentity(accountDb(null), "u1", "typed@gmail.com");
    expect(identity.accountEmail).toBeNull();
    expect(identity.userId).toBe("u1");
  });
});
