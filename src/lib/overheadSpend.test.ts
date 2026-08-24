import { describe, it, expect } from "vitest";
import { manilaToday, validateSpend } from "./overheadSpend";

const CAT = "3f6c1a2e-9b4d-4c7a-8e11-2b5d6f0a9c33";

const good = {
  name: "Laundry",
  category_id: CAT,
  amount: 500,
  spent_on: "2026-08-24",
};

describe("manilaToday", () => {
  it("uses the Manila day, not UTC", () => {
    // 2026-08-31 17:00 UTC is 2026-09-01 01:00 in Manila.
    expect(manilaToday(new Date("2026-08-31T17:00:00Z"))).toBe("2026-09-01");
  });

  it("does not roll forward before the Manila day changes", () => {
    // 2026-08-31 15:59 UTC is 2026-08-31 23:59 in Manila.
    expect(manilaToday(new Date("2026-08-31T15:59:00Z"))).toBe("2026-08-31");
  });
});

describe("validateSpend", () => {
  it("accepts a well-formed entry and normalises optional fields to null", () => {
    const r = validateSpend(good, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      name: "Laundry",
      category_id: CAT,
      amount: 500,
      spent_on: "2026-08-24",
      method: null,
      reference: null,
      notes: null,
    });
  });

  it("keeps optional fields when supplied, trimmed", () => {
    const r = validateSpend({ ...good, method: " GCash ", reference: "REF1", notes: " two loads " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("GCash");
    expect(r.value.notes).toBe("two loads");
  });

  it("treats a whitespace-only optional field as absent", () => {
    const r = validateSpend({ ...good, reference: "   " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reference).toBeNull();
  });

  it("trims the name", () => {
    const r = validateSpend({ ...good, name: "  Laundry  " }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Laundry");
  });

  it("rejects an empty name", () => {
    const r = validateSpend({ ...good, name: "   " }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Give this expense a name." });
  });

  it("rejects a name longer than the column allows", () => {
    const r = validateSpend({ ...good, name: "x".repeat(151) }, "2026-08-24");
    expect(r.ok).toBe(false);
  });

  it("rejects a non-uuid category", () => {
    const r = validateSpend({ ...good, category_id: "not-a-uuid" }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Choose a category." });
  });

  it("rejects a missing category", () => {
    const r = validateSpend({ ...good, category_id: undefined }, "2026-08-24");
    expect(r.ok).toBe(false);
  });

  it("rejects zero and negative amounts", () => {
    expect(validateSpend({ ...good, amount: 0 }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, amount: -50 }, "2026-08-24").ok).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(validateSpend({ ...good, amount: "abc" }, "2026-08-24").ok).toBe(false);
  });

  it("accepts a numeric string amount, since form inputs are strings", () => {
    const r = validateSpend({ ...good, amount: "500.50" }, "2026-08-24");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(500.5);
  });

  it("rejects a malformed date", () => {
    const r = validateSpend({ ...good, spent_on: "24/08/2026" }, "2026-08-24");
    expect(r).toEqual({ ok: false, message: "Give the date this was paid." });
  });

  it("rejects a future date", () => {
    const r = validateSpend({ ...good, spent_on: "2026-08-25" }, "2026-08-24");
    expect(r).toEqual({
      ok: false,
      message: "You cannot record a payment for a date that has not happened yet.",
    });
  });

  it("accepts today", () => {
    expect(validateSpend({ ...good, spent_on: "2026-08-24" }, "2026-08-24").ok).toBe(true);
  });

  it("accepts a past date", () => {
    expect(validateSpend({ ...good, spent_on: "2026-01-02" }, "2026-08-24").ok).toBe(true);
  });

  it("does not throw on a null or non-object body", () => {
    expect(validateSpend(null, "2026-08-24").ok).toBe(false);
    expect(validateSpend("nonsense", "2026-08-24").ok).toBe(false);
  });

  it("rejects a date-shaped string that is not a real calendar date", () => {
    expect(validateSpend({ ...good, spent_on: "2026-13-99" }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, spent_on: "2026-02-31" }, "2026-08-24").ok).toBe(false);
  });

  it("accepts real calendar edge dates", () => {
    expect(validateSpend({ ...good, spent_on: "2024-02-29" }, "2026-08-24").ok).toBe(true);
    expect(validateSpend({ ...good, spent_on: "2026-01-31" }, "2026-08-24").ok).toBe(true);
    // Not "2026-12-31": that is later than the fixed "today" of 2026-08-24
    // used throughout this file, so the (intentionally unmodified)
    // future-date check would reject it regardless of calendar validity.
    // 2025-12-31 still exercises "December has 31 days" while staying past.
    expect(validateSpend({ ...good, spent_on: "2025-12-31" }, "2026-08-24").ok).toBe(true);
  });

  it("rejects a non-string name rather than coercing it", () => {
    expect(validateSpend({ ...good, name: { evil: 1 } }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, name: 42 }, "2026-08-24").ok).toBe(false);
  });

  it("rejects an array or object amount rather than coercing it", () => {
    expect(validateSpend({ ...good, amount: [5] }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, amount: {} }, "2026-08-24").ok).toBe(false);
    expect(validateSpend({ ...good, amount: true }, "2026-08-24").ok).toBe(false);
  });
});
