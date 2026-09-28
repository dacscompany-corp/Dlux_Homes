import { describe, it, expect } from "vitest";
import {
  CLEANING_STATUSES,
  actorForRole,
  checkTransition,
  describe as describeStatus,
  isCleaningStatus,
  isPerformed,
} from "./cleaning-workflow";

describe("actorForRole", () => {
  it("treats Owner and CSR as admin", () => {
    expect(actorForRole("Owner")).toBe("admin");
    expect(actorForRole("CSR")).toBe("admin");
  });

  it("treats a Cleaner — and anything unrecognised — as a cleaner", () => {
    expect(actorForRole("Cleaner")).toBe("cleaner");
    expect(actorForRole(undefined)).toBe("cleaner");
    expect(actorForRole("")).toBe("cleaner");
  });
});

describe("isCleaningStatus", () => {
  it("accepts every status the column may hold", () => {
    for (const s of CLEANING_STATUSES) expect(isCleaningStatus(s)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCleaningStatus("done")).toBe(false);
    expect(isCleaningStatus("READY")).toBe(false);
    expect(isCleaningStatus(null)).toBe(false);
  });
});

describe("checkTransition — the cleaner's sequence", () => {
  it("lets a cleaner start an assigned room", () => {
    expect(checkTransition("assigned", "in-progress", "cleaner").ok).toBe(true);
  });

  it("lets a cleaner hand a room in for inspection", () => {
    expect(checkTransition("in-progress", "awaiting-inspection", "cleaner").ok).toBe(true);
  });

  it("lets a cleaner re-submit after a rejection sent the task back", () => {
    expect(checkTransition("in-progress", "awaiting-inspection", "cleaner").ok).toBe(true);
  });

  it("stops a cleaner approving their own room", () => {
    const result = checkTransition("awaiting-inspection", "ready", "cleaner");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Only Owner or CSR/);
  });

  it("stops a cleaner skipping inspection entirely", () => {
    expect(checkTransition("in-progress", "ready", "cleaner").ok).toBe(false);
    expect(checkTransition("assigned", "ready", "cleaner").ok).toBe(false);
    expect(checkTransition("pending", "ready", "cleaner").ok).toBe(false);
  });

  it("stops a cleaner skipping In Progress", () => {
    expect(checkTransition("assigned", "awaiting-inspection", "cleaner").ok).toBe(false);
  });

  it("stops a cleaner assigning or reassigning work", () => {
    expect(checkTransition("pending", "assigned", "cleaner").ok).toBe(false);
    expect(checkTransition("assigned", "assigned", "cleaner").ok).toBe(false);
    expect(checkTransition("in-progress", "assigned", "cleaner").ok).toBe(false);
  });

  it("stops a cleaner sending a task back to themselves", () => {
    expect(checkTransition("awaiting-inspection", "in-progress", "cleaner").ok).toBe(false);
  });
});

describe("checkTransition — Owner/CSR", () => {
  it("allows the two inspection outcomes", () => {
    expect(checkTransition("awaiting-inspection", "ready", "admin").ok).toBe(true);
    expect(checkTransition("awaiting-inspection", "in-progress", "admin").ok).toBe(true);
  });

  it("allows assignment and reassignment", () => {
    expect(checkTransition("pending", "assigned", "admin").ok).toBe(true);
    expect(checkTransition("assigned", "assigned", "admin").ok).toBe(true);
    expect(checkTransition("in-progress", "assigned", "admin").ok).toBe(true);
  });

  it("will not let even an admin skip inspection", () => {
    const result = checkTransition("in-progress", "ready", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Assigned → In Progress → Awaiting Inspection → Ready/);
  });

  it("will not move a task out of Ready", () => {
    expect(checkTransition("ready", "in-progress", "admin").ok).toBe(false);
    expect(checkTransition("ready", "assigned", "admin").ok).toBe(false);
  });

  it("can route a legacy row back through inspection", () => {
    expect(checkTransition("cleaned", "awaiting-inspection", "admin").ok).toBe(true);
    expect(checkTransition("inspected", "ready", "admin").ok).toBe(true);
  });
});

describe("checkTransition — general validation", () => {
  it("rejects a status that is not in the list", () => {
    const result = checkTransition("assigned", "finished", "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid cleaning status/);
  });

  it("accepts re-writing the current status as a no-op", () => {
    expect(checkTransition("in-progress", "in-progress", "cleaner").ok).toBe(true);
    expect(checkTransition("ready", "ready", "admin").ok).toBe(true);
  });

  it("still treats assigned → assigned as a real reassignment, not a no-op", () => {
    expect(checkTransition("assigned", "assigned", "cleaner").ok).toBe(false);
    expect(checkTransition("assigned", "assigned", "admin").ok).toBe(true);
  });
});

describe("isPerformed", () => {
  it("is true once the cleaning has actually been done", () => {
    expect(isPerformed("awaiting-inspection")).toBe(true);
    expect(isPerformed("ready")).toBe(true);
    expect(isPerformed("cleaned")).toBe(true);
    expect(isPerformed("inspected")).toBe(true);
  });

  it("is false while the work is still outstanding", () => {
    expect(isPerformed("pending")).toBe(false);
    expect(isPerformed("assigned")).toBe(false);
    expect(isPerformed("in-progress")).toBe(false);
  });
});

describe("describe", () => {
  it("gives every status a human label", () => {
    for (const s of CLEANING_STATUSES) expect(describeStatus(s)).not.toBe("");
    expect(describeStatus("awaiting-inspection")).toBe("Awaiting Inspection");
  });

  it("falls back to the raw value for anything unknown", () => {
    expect(describeStatus("weird")).toBe("weird");
  });
});
