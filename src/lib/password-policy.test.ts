import { describe, it, expect } from "vitest";
import { validateNewPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./password-policy";

/**
 * The confirmation email prints the shared starting password and tells the
 * guest to change it. These guard the two rules that make that advice mean
 * something: the new password has to differ from the one they're on, and it
 * can't be the shared value every other new guest also received.
 */
describe("validateNewPassword", () => {
  it("accepts an ordinary password", () => {
    expect(validateNewPassword("tinapay2026")).toEqual({ ok: true });
  });

  it("requires a password at all", () => {
    expect(validateNewPassword("").ok).toBe(false);
    expect(validateNewPassword(undefined).ok).toBe(false);
    expect(validateNewPassword(12345678).ok).toBe(false);
  });

  it(`requires at least ${MIN_PASSWORD_LENGTH} characters, matching the reset-link route`, () => {
    expect(validateNewPassword("short12").ok).toBe(false);
    expect(validateNewPassword("exactly8").ok).toBe(true);
  });

  it("rejects a password past the length bcrypt actually hashes", () => {
    expect(validateNewPassword("a".repeat(MAX_PASSWORD_LENGTH)).ok).toBe(true);
    expect(validateNewPassword("a".repeat(MAX_PASSWORD_LENGTH + 1)).ok).toBe(false);
  });

  it("counts the 72-byte limit in bytes, not characters", () => {
    // 20 four-byte emoji = 80 bytes, only 20 characters.
    expect(validateNewPassword("🌴".repeat(20)).ok).toBe(false);
  });

  it("rejects whitespace-only input that clears the length bar", () => {
    expect(validateNewPassword("        ").ok).toBe(false);
  });

  it("rejects re-submitting the password already in use", () => {
    const check = validateNewPassword("tinapay2026", { current: "tinapay2026" });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.error).toMatch(/already using/i);
  });

  it("rejects the shared starting password from the confirmation email", () => {
    const check = validateNewPassword("guest123", { sharedPassword: "guest123" });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.error).toMatch(/starting password/i);
  });

  it("allows the shared password to be unset without blocking anything", () => {
    expect(validateNewPassword("guest123", { sharedPassword: null })).toEqual({ ok: true });
  });

  it("compares passwords case-sensitively", () => {
    expect(validateNewPassword("Guest123", { sharedPassword: "guest123" })).toEqual({ ok: true });
  });
});
