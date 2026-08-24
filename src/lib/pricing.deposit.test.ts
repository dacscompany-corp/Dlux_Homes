import { describe, it, expect } from "vitest";
import {
  securityDepositFor,
  DEPOSIT_DEFAULT,
  DEPOSIT_TIER1_AMOUNT,
  DEPOSIT_TIER2_AMOUNT,
  DEPOSIT_TIER3_AMOUNT,
  DEPOSIT_TIER4_AMOUNT,
} from "./pricing";

/**
 * These guard the self check-in email's deposit figure, which understated what
 * a guest owed by the whole deposit: every booking is created with a
 * `booking_security_deposits` row, that row held 0 as a "not collected yet"
 * placeholder, and the email read the 0 as authoritative. The rule everywhere
 * is now "a zero means not set" — `> 0`, never `??`.
 */
describe("securityDepositFor — the figure the check-in email quotes", () => {
  it("charges the default for a one-night stay", () => {
    expect(securityDepositFor(1)).toBe(DEPOSIT_DEFAULT);
  });

  it("charges the default for a daycation regardless of night count", () => {
    expect(securityDepositFor(5, "10")).toBe(DEPOSIT_DEFAULT);
  });

  it("climbs through the tiers as the stay lengthens", () => {
    expect(securityDepositFor(2)).toBe(DEPOSIT_DEFAULT);
    expect(securityDepositFor(3)).toBe(DEPOSIT_TIER1_AMOUNT);
    expect(securityDepositFor(11)).toBe(DEPOSIT_TIER2_AMOUNT);
    expect(securityDepositFor(18)).toBe(DEPOSIT_TIER3_AMOUNT);
    expect(securityDepositFor(26)).toBe(DEPOSIT_TIER4_AMOUNT);
  });

  it("prefers the haven's own configured amounts over the defaults", () => {
    const rates = { securityDeposit: 800, depositTier1Amount: 1200 };
    expect(securityDepositFor(1, undefined, rates)).toBe(800);
    expect(securityDepositFor(3, undefined, rates)).toBe(1200);
  });

  it("falls back to a default when a haven configures a tier as zero", () => {
    // A zero in the haven config is "unset", not "free" — the same rule the
    // email and collection flows apply to the deposit row.
    expect(securityDepositFor(1, undefined, { securityDeposit: 0 })).toBe(DEPOSIT_DEFAULT);
    expect(securityDepositFor(3, undefined, { depositTier1Amount: 0 })).toBe(DEPOSIT_TIER1_AMOUNT);
  });

  it("never returns zero for any stay length", () => {
    // The bug in one line: a zero deposit reaching the guest means they are
    // told to bring the balance only, and arrive short.
    for (const nights of [0, 1, 2, 3, 10, 11, 17, 18, 25, 26, 60]) {
      expect(securityDepositFor(nights)).toBeGreaterThan(0);
    }
  });

  it("treats a missing or nonsense night count as a single night", () => {
    expect(securityDepositFor(0)).toBe(DEPOSIT_DEFAULT);
    expect(securityDepositFor(NaN)).toBe(DEPOSIT_DEFAULT);
  });
});

describe("the zero-means-unset rule the senders apply", () => {
  // Both senders now decide with `Number(x) > 0 ? Number(x) : undefined`
  // before handing the value to the template, which uses `??`. This pins that
  // decision, because `??` alone lets a 0 through and that is the whole bug.
  const resolve = (rowAmount: number | null | undefined) =>
    Number(rowAmount) > 0 ? Number(rowAmount) : undefined;

  const quoted = (rowAmount: number | null | undefined, nights = 1) =>
    resolve(rowAmount) ?? securityDepositFor(nights);

  it("uses a real collected amount when there is one", () => {
    expect(quoted(1000)).toBe(1000);
    expect(quoted(2500)).toBe(2500);
  });

  it("falls back when the row holds the placeholder zero", () => {
    expect(quoted(0)).toBe(DEPOSIT_DEFAULT);
  });

  it("falls back when there is no row at all", () => {
    expect(quoted(null)).toBe(DEPOSIT_DEFAULT);
    expect(quoted(undefined)).toBe(DEPOSIT_DEFAULT);
  });

  it("still tiers correctly when falling back on a long stay", () => {
    expect(quoted(0, 12)).toBe(DEPOSIT_TIER2_AMOUNT);
  });

  it("makes the quoted total equal balance plus deposit", () => {
    const balance = 949;
    expect(balance + quoted(0)).toBe(1949); // the email that read 949
    expect(balance + quoted(1000)).toBe(1949);
  });
});
