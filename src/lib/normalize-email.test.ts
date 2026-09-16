import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./normalize-email";

/**
 * The bug these guard: promo redemption is keyed on the address a guest types
 * at checkout, so if "Maria@Gmail.com" and "maria@gmail.com " are two different
 * guests, the one-use-per-guest rule is defeated by pressing shift.
 */
describe("normalizeEmail", () => {
  it("folds case and trims, so one address is one guest", () => {
    expect(normalizeEmail("Maria@Gmail.com")).toBe("maria@gmail.com");
    expect(normalizeEmail("  maria@gmail.com  ")).toBe("maria@gmail.com");
    expect(normalizeEmail("MARIA@GMAIL.COM")).toBe("maria@gmail.com");
  });

  it("leaves an already-normal address alone", () => {
    expect(normalizeEmail("maria@gmail.com")).toBe("maria@gmail.com");
  });

  it("returns null for anything that cannot identify a guest", () => {
    // null, not "" — two guests who left the field blank must not match each
    // other, which is exactly what an empty-string key would do.
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(42 as unknown as string)).toBeNull();
  });

  it("keeps plus-tags and dots distinct", () => {
    // Deliberate: stripping them wrongly merges people who legitimately use
    // tagged addresses. Documented as an accepted gap, so pin the behaviour.
    expect(normalizeEmail("maria+1@gmail.com")).toBe("maria+1@gmail.com");
    expect(normalizeEmail("ma.ria@gmail.com")).toBe("ma.ria@gmail.com");
  });
});
