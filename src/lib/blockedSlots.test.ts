import { describe, it, expect } from "vitest";
import { parseBlockSlots, blockSlotsLabel, slotForWindowLabel, slotBlockOverlapSql } from "./blockedSlots";

describe("parseBlockSlots", () => {
  it("treats missing or empty as a whole-day block", () => {
    expect(parseBlockSlots(undefined)).toBeNull();
    expect(parseBlockSlots(null)).toBeNull();
    expect(parseBlockSlots([])).toBeNull();
  });

  it("keeps a valid subset, de-duplicated", () => {
    expect(parseBlockSlots(["daycation", "daycation"])).toEqual(["daycation"]);
    expect(parseBlockSlots(["overnight", "nightcation"])).toEqual(["overnight", "nightcation"]);
  });

  it("collapses all three windows to a whole-day block", () => {
    expect(parseBlockSlots(["daycation", "nightcation", "overnight"])).toBeNull();
  });

  it("rejects unknown slots and non-arrays", () => {
    expect(parseBlockSlots(["brunch"])).toBe("invalid");
    expect(parseBlockSlots("daycation")).toBe("invalid");
  });
});

describe("labels", () => {
  it("names the blocked windows", () => {
    expect(blockSlotsLabel(null)).toBe("Whole day");
    expect(blockSlotsLabel(["daycation"])).toBe("Daycation");
  });

  it("maps storefront window labels to slots", () => {
    expect(slotForWindowLabel("Nightcation")).toBe("nightcation");
    expect(slotForWindowLabel("Something else")).toBeNull();
  });
});

describe("slotBlockOverlapSql", () => {
  it("only matches per-slot rows and applies turnover", () => {
    const sql = slotBlockOverlapSql("n.ns", "n.ne");
    expect(sql).toContain("bd.slots IS NOT NULL");
    expect(sql).toContain("unnest(bd.slots)");
    expect(sql).toContain("INTERVAL");
  });
});
