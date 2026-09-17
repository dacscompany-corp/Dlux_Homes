import { describe, it, expect } from "vitest";
import {
  capDiscount,
  fixedAmountOver,
  autoDiscountAmount,
  promoDiscountOn,
  pickAutoPromo,
  promoCoversStay,
  isEnforceable,
} from "./promo-offer";
import type { ActivePromotion } from "@/redux/api/promotionsApi";

/**
 * These are the arithmetic both sides of the booking run: the checkout prices
 * the offer with them, and createBooking re-prices it with the same functions
 * before honouring the amount. If they ever disagree the booking bounces at
 * submit with DISCOUNT_INVALID, so the shared behaviour is worth pinning.
 */
const promo = (over: Partial<ActivePromotion> = {}): ActivePromotion => ({
  id: "p1",
  title: "Offer",
  description: null,
  image_url: null,
  discount_type: "percentage",
  discount_value: 20,
  discount_id: null,
  discount_code: null,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  applies_to: null,
  redemption: "automatic",
  per_night: false,
  max_discount: null,
  ...over,
});

describe("fixedAmountOver", () => {
  it("takes a whole-stay amount once", () => {
    expect(fixedAmountOver(500, false, 4)).toBe(500);
  });

  it("takes a per-night amount once per night", () => {
    expect(fixedAmountOver(200, true, 4)).toBe(800);
  });

  it("floors at one night, so a same-day session still gets the amount", () => {
    expect(fixedAmountOver(200, true, 0)).toBe(200);
    expect(fixedAmountOver(200, true, 0.5)).toBe(200);
  });
});

describe("capDiscount", () => {
  it("applies the offer ceiling", () => {
    expect(capDiscount(800, 500, 10000)).toBe(500);
  });

  it("ignores a null or zero ceiling", () => {
    expect(capDiscount(800, null, 10000)).toBe(800);
    expect(capDiscount(800, 0, 10000)).toBe(800);
  });

  it("never gives away more than is being charged", () => {
    expect(capDiscount(8000, null, 5000)).toBe(5000);
  });

  it("never goes negative", () => {
    expect(capDiscount(-100, null, 5000)).toBe(0);
  });
});

describe("promoDiscountOn", () => {
  it("takes a percentage on the total, without re-multiplying by nights", () => {
    // The total already grew with the stay length; multiplying again would
    // charge the nights twice.
    expect(promoDiscountOn(promo({ discount_type: "percentage", discount_value: 20 }), 10000, 4)).toBe(2000);
  });

  it("spreads a per-night fixed amount across the stay", () => {
    expect(promoDiscountOn(promo({ discount_type: "fixed", discount_value: 200, per_night: true }), 10000, 4)).toBe(800);
  });

  it("honours max_discount on a long stay", () => {
    expect(
      promoDiscountOn(promo({ discount_type: "fixed", discount_value: 200, per_night: true, max_discount: 500 }), 10000, 10),
    ).toBe(500);
  });

  it("is worth nothing when the promo is only an announcement", () => {
    expect(promoDiscountOn(promo({ discount_type: null, discount_value: null }), 10000, 1)).toBe(0);
    expect(promoDiscountOn(promo({ discount_value: 0 }), 10000, 1)).toBe(0);
  });
});

describe("autoDiscountAmount", () => {
  it("prices an automatic promo", () => {
    expect(autoDiscountAmount(promo(), 10000, 1)).toBe(2000);
  });

  it("is zero for a voucher — those are never applied implicitly", () => {
    expect(autoDiscountAmount(promo({ redemption: "voucher", discount_code: "SAVE20" }), 10000, 1)).toBe(0);
  });
});

describe("isEnforceable", () => {
  it("needs a real discount", () => {
    expect(isEnforceable(promo())).toBe(true);
    expect(isEnforceable(promo({ discount_value: 0 }))).toBe(false);
    expect(isEnforceable(promo({ discount_type: null }))).toBe(false);
  });

  it("needs a code before a voucher can claim anything", () => {
    expect(isEnforceable(promo({ redemption: "voucher", discount_code: null }))).toBe(false);
    expect(isEnforceable(promo({ redemption: "voucher", discount_code: "SAVE20" }))).toBe(true);
  });
});

describe("promoCoversStay", () => {
  it("applies an unscoped promo everywhere", () => {
    expect(promoCoversStay(promo({ applies_to: null }), "10")).toBe(true);
    expect(promoCoversStay(promo({ applies_to: [] }), "21")).toBe(true);
  });

  it("keeps an overnight-only offer off a day session", () => {
    const overnight = promo({ applies_to: ["overnight"] });
    expect(promoCoversStay(overnight, "21")).toBe(true);
    expect(promoCoversStay(overnight, "10")).toBe(false);
  });

  it("treats day and night scopes as the 10-hour session", () => {
    expect(promoCoversStay(promo({ applies_to: ["day"] }), "10")).toBe(true);
    expect(promoCoversStay(promo({ applies_to: ["night"] }), "10")).toBe(true);
    expect(promoCoversStay(promo({ applies_to: ["day"] }), "21")).toBe(false);
  });
});

describe("pickAutoPromo", () => {
  it("returns nothing when there are no promotions", () => {
    expect(pickAutoPromo(undefined, "21")).toBeNull();
    expect(pickAutoPromo([], "21")).toBeNull();
  });

  it("skips vouchers and announcements", () => {
    const list = [
      promo({ id: "voucher", redemption: "voucher", discount_code: "SAVE20" }),
      promo({ id: "announcement", discount_type: null, discount_value: null }),
      promo({ id: "auto" }),
    ];
    expect(pickAutoPromo(list, "21")?.id).toBe("auto");
  });

  it("skips one that does not cover the stay type", () => {
    const list = [promo({ id: "overnight-only", applies_to: ["overnight"] }), promo({ id: "any" })];
    expect(pickAutoPromo(list, "10")?.id).toBe("any");
    expect(pickAutoPromo(list, "21")?.id).toBe("overnight-only");
  });

  it("takes the first match — promotions never stack", () => {
    const list = [promo({ id: "newest" }), promo({ id: "older" })];
    expect(pickAutoPromo(list, "21")?.id).toBe("newest");
  });
});
