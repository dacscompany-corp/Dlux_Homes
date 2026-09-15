import { describe, it, expect } from "vitest";
import { bookingHeroStage } from "./bookingHeroStage";

/**
 * The bug these guard: the post-checkout hero said "You're in. Rest is
 * coming. / Confirmation emailed to …" for every state the fallback design
 * covers — so a booking the owner hadn't even reviewed yet read as confirmed.
 */
const at = (status: string, over: { hasPaymentProof?: boolean; lapsed?: boolean } = {}) =>
  bookingHeroStage({ status, hasPaymentProof: false, lapsed: false, ...over });

describe("bookingHeroStage", () => {
  it("keeps a fresh request in review, not confirmed", () => {
    expect(at("pending")).toBe("pending");
  });

  it("asks for the down payment once the documents are pre-approved", () => {
    expect(at("approved")).toBe("awaiting-payment");
    expect(at("awaiting-payment")).toBe("awaiting-payment");
  });

  it("switches to verifying once the guest uploads proof", () => {
    expect(at("approved", { hasPaymentProof: true })).toBe("verifying");
    expect(at("awaiting-payment", { hasPaymentProof: true })).toBe("verifying");
  });

  it("reports the owner's decision", () => {
    expect(at("cancelled")).toBe("cancelled");
    expect(at("rejected")).toBe("rejected");
  });

  it("reports a booking that ran out of time", () => {
    expect(at("pending", { lapsed: true })).toBe("lapsed");
    expect(at("approved", { lapsed: true })).toBe("lapsed");
  });

  it("prefers the owner's decision over a lapsed stay", () => {
    expect(at("cancelled", { lapsed: true })).toBe("cancelled");
    expect(at("rejected", { lapsed: true })).toBe("rejected");
  });

  it("promises nothing for a status it doesn't recognise", () => {
    expect(at("")).toBe("pending");
    expect(at("some-new-status")).toBe("pending");
  });

  it("ignores uploaded proof while the request is still unreviewed", () => {
    // Proof can't be uploaded before pre-approval, but if it somehow exists the
    // page must not imply the owner is verifying a payment it hasn't asked for.
    expect(at("pending", { hasPaymentProof: true })).toBe("pending");
  });
});
