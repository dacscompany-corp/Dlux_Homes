import { describe, it, expect } from "vitest";
import {
  pickNextCleaner,
  UNASSIGNED_REASON,
  type RotationCandidate,
} from "./cleaning-rotation";

// Four cleaners in a fixed rotation, all active and free, all starting level —
// the release-check setup from the MVP scope.
function fourCleaners(
  overrides: Partial<Record<"c1" | "c2" | "c3" | "c4", Partial<RotationCandidate>>> = {},
): RotationCandidate[] {
  const ids = ["c1", "c2", "c3", "c4"] as const;
  return ids.map((id, order) => ({
    id,
    order,
    active: true,
    available: true,
    share: 0,
    credits: 0,
    ...(overrides[id] ?? {}),
  }));
}

/**
 * Runs `rounds` worth of automatic assignments, advancing the pointer and the
 * winner's share each time — the same two things the transaction does.
 */
function runRotation(cleaners: RotationCandidate[], picks: number): string[] {
  const state = cleaners.map((c) => ({ ...c }));
  let last: string | null = null;
  const order: string[] = [];
  for (let i = 0; i < picks; i++) {
    const { cleaner } = pickNextCleaner(state, last);
    if (!cleaner) break;
    order.push(cleaner.id);
    const row = state.find((c) => c.id === cleaner.id);
    if (row) {
      row.share += 1;
      if (row.credits > 0) row.credits -= 1;
    }
    last = cleaner.id;
  }
  return order;
}

describe("pickNextCleaner — fair rotation", () => {
  it("gives four cleaners one booking each", () => {
    expect(runRotation(fourCleaners(), 4)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("gives four cleaners two bookings each over eight confirmations", () => {
    const order = runRotation(fourCleaners(), 8);
    expect(order).toEqual(["c1", "c2", "c3", "c4", "c1", "c2", "c3", "c4"]);
    for (const id of ["c1", "c2", "c3", "c4"]) {
      expect(order.filter((x) => x === id)).toHaveLength(2);
    }
  });

  it("starts from the cleaner after the stored pointer", () => {
    expect(pickNextCleaner(fourCleaners(), "c2").cleaner?.id).toBe("c3");
  });

  it("wraps around at the end of the cycle", () => {
    expect(pickNextCleaner(fourCleaners(), "c4").cleaner?.id).toBe("c1");
  });

  it("resumes correctly when the last-assigned cleaner has since gone inactive", () => {
    const cleaners = fourCleaners({ c2: { active: false } });
    expect(pickNextCleaner(cleaners, "c2").cleaner?.id).toBe("c3");
  });

  it("does not give a faster cleaner an extra turn", () => {
    // c1 finished first — 'completed' and 'retained' both count as one
    // opportunity, so c1's share is identical to everyone else's after round 1.
    const afterRoundOne = fourCleaners({
      c1: { share: 1 },
      c2: { share: 1 },
      c3: { share: 1 },
      c4: { share: 1 },
    });
    expect(pickNextCleaner(afterRoundOne, "c4").cleaner?.id).toBe("c1");
    // And c1 having finished does not let them jump the queue mid-round.
    const midRound = fourCleaners({ c1: { share: 1 }, c2: { share: 1 } });
    expect(pickNextCleaner(midRound, "c2").cleaner?.id).toBe("c3");
  });

  it("counts a manual assignment toward the cleaner's share, so automatic picks favour the others", () => {
    const afterManualToC1 = fourCleaners({ c1: { share: 1 } });
    const order = runRotation(afterManualToC1, 3);
    expect(order).toEqual(["c2", "c3", "c4"]);
    expect(order).not.toContain("c1");
  });

  it("keeps a cleaner in the rotation while their assignment is still unfinished", () => {
    // Everyone holds one retained (unfinished) opportunity — nobody is excluded.
    const all = fourCleaners({
      c1: { share: 1 },
      c2: { share: 1 },
      c3: { share: 1 },
      c4: { share: 1 },
    });
    expect(pickNextCleaner(all, null).cleaner).not.toBeNull();
  });

  it("gives replacement priority after a cancellation", () => {
    // Round 1 gave everyone one booking; c2's was then cancelled, which
    // released their opportunity and left a credit behind.
    const afterCancellation = fourCleaners({
      c1: { share: 1 },
      c2: { share: 0, credits: 1 },
      c3: { share: 1 },
      c4: { share: 1 },
    });
    expect(pickNextCleaner(afterCancellation, "c4").cleaner?.id).toBe("c2");
  });

  it("gives replacement priority after an unperformed task is reassigned away", () => {
    // c2 → c3 on unperformed work: c2's opportunity restored (+1 credit),
    // the task now counted toward c3.
    const afterReassignment = fourCleaners({
      c1: { share: 1 },
      c2: { share: 0, credits: 1 },
      c3: { share: 2 },
      c4: { share: 1 },
    });
    expect(pickNextCleaner(afterReassignment, "c4").cleaner?.id).toBe("c2");
  });

  it("breaks a tie on share by unconsumed replacement credits", () => {
    const tied = fourCleaners({
      c1: { share: 1 },
      c2: { share: 1 },
      c3: { share: 1, credits: 1 },
      c4: { share: 1 },
    });
    expect(pickNextCleaner(tied, "c1").cleaner?.id).toBe("c3");
  });

  it("serialized simultaneous confirmations do not hand the same turn out twice", () => {
    // Two confirmations landing together are serialized on the pointer row, so
    // the second one sees the first's advanced pointer and updated share.
    const first = pickNextCleaner(fourCleaners(), null).cleaner;
    expect(first?.id).toBe("c1");
    const afterFirst = fourCleaners({ c1: { share: 1 } });
    const second = pickNextCleaner(afterFirst, "c1").cleaner;
    expect(second?.id).toBe("c2");
    expect(second?.id).not.toBe(first?.id);
  });
});

describe("pickNextCleaner — availability and exceptions", () => {
  it("skips inactive cleaners", () => {
    const cleaners = fourCleaners({ c1: { active: false }, c2: { active: false } });
    expect(pickNextCleaner(cleaners, null).cleaner?.id).toBe("c3");
  });

  it("skips cleaners who are not available for this window", () => {
    const cleaners = fourCleaners({ c1: { available: false } });
    expect(pickNextCleaner(cleaners, null).cleaner?.id).toBe("c2");
  });

  it("explains an empty roster", () => {
    const pick = pickNextCleaner([], null);
    expect(pick.cleaner).toBeNull();
    expect(pick.reason).toBe(UNASSIGNED_REASON.noCleaners);
  });

  it("explains an all-inactive roster", () => {
    const pick = pickNextCleaner(
      fourCleaners({
        c1: { active: false },
        c2: { active: false },
        c3: { active: false },
        c4: { active: false },
      }),
      null,
    );
    expect(pick.cleaner).toBeNull();
    expect(pick.reason).toBe(UNASSIGNED_REASON.noneActive);
  });

  it("explains a fully booked roster", () => {
    const pick = pickNextCleaner(
      fourCleaners({
        c1: { available: false },
        c2: { available: false },
        c3: { available: false },
        c4: { available: false },
      }),
      null,
    );
    expect(pick.cleaner).toBeNull();
    expect(pick.reason).toBe(UNASSIGNED_REASON.noneAvailable);
  });

  it("distinguishes inactive from unavailable when both apply", () => {
    // Inactive is reported only when NOBODY is active; here c3/c4 are active
    // but busy, so the reason is availability.
    const pick = pickNextCleaner(
      fourCleaners({
        c1: { active: false },
        c2: { active: false },
        c3: { available: false },
        c4: { available: false },
      }),
      null,
    );
    expect(pick.reason).toBe(UNASSIGNED_REASON.noneAvailable);
  });

  it("still picks fairly when only some cleaners are eligible", () => {
    const cleaners = fourCleaners({ c2: { available: false }, c4: { active: false } });
    expect(runRotation(cleaners, 4)).toEqual(["c1", "c3", "c1", "c3"]);
  });
});
