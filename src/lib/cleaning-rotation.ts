// Fair distribution of paid cleaning opportunities.
//
// Fairness is measured by opportunities a cleaner RETAINED OR COMPLETED — not
// by how many assignments were originally issued to them. That distinction is
// the whole point of this module:
//
//   - a manual assignment counts exactly like an automatic one, so hand-picking
//     Cleaner 1 makes the next automatic pick favour the other three;
//   - an assignment taken away before the work was done (booking cancelled, or
//     the task reassigned to someone else) is RELEASED, so it stops counting
//     against the original cleaner and hands them a replacement credit;
//   - cleaning that was actually performed keeps counting toward whoever
//     performed it, forever, even if the task is later reassigned;
//   - finishing faster changes nothing here — completion speed isn't an input.
//
// The persisted side of this lives in `cleaning_opportunities` (one row per
// assignment, states retained/completed/released) plus the single-row
// `cleaning_rotation_state` pointer. This file holds only the decision, so it
// can be tested without a database.

/** One cleaner account, as the picker sees it. */
export type RotationCandidate = {
  id: string;
  /**
   * Stable position in the rotation — the row's index in (created_at, id)
   * order. Fixed for the life of the account, so "the cleaner after Cleaner 2"
   * means the same thing across restarts and however the eligible set changes.
   */
  order: number;
  /** employees.status = 'active'. */
  active: boolean;
  /**
   * Actually free to take THIS cleaning: no other live assignment whose window
   * overlaps it. An unfinished assignment alone does not make a cleaner
   * unavailable — only a genuine clash does.
   */
  available: boolean;
  /** Opportunities currently retained or already completed. The fairness measure. */
  share: number;
  /** Unconsumed replacement credits from cancelled / reassigned-away work. */
  credits: number;
};

/**
 * Why an assignment was left for Owner/CSR to handle by hand. Stored on
 * booking_cleaning.unassigned_reason and shown on the task, so "unassigned"
 * is never silent.
 */
export const UNASSIGNED_REASON = {
  noCleaners: "No cleaner accounts exist yet, so there was nobody to assign.",
  noneActive: "Every cleaner account is currently inactive.",
  noneAvailable:
    "Every active cleaner is already booked for another stay that overlaps this one.",
} as const;

export type UnassignedReason = (typeof UNASSIGNED_REASON)[keyof typeof UNASSIGNED_REASON];

export type RotationPick =
  | { cleaner: RotationCandidate; reason: null }
  | { cleaner: null; reason: UnassignedReason };

/**
 * How far `candidate` sits after `lastOrder` walking the rotation forward and
 * wrapping around. The cleaner immediately after the last automatic pick gets
 * 0, so a tie on share is broken by "whose turn is it next", giving
 * Cleaner 1 → 2 → 3 → 4 → repeat.
 */
function rotationDistance(order: number, lastOrder: number | null, size: number): number {
  if (lastOrder === null) return order;
  return (order - lastOrder - 1 + size * 2) % size;
}

/**
 * Picks the cleaner who is owed the next automatic assignment, or explains why
 * nobody can take it.
 *
 * Ranking, in order:
 *   1. fewest opportunities retained or completed — this is what makes every
 *      eligible cleaner get one assignment before anyone gets their next;
 *   2. most unconsumed replacement credits — a cleaner whose work was
 *      cancelled or handed away goes first among equals;
 *   3. next in rotation after the last automatic pick.
 *
 * `candidates` must list EVERY cleaner account (inactive and unavailable ones
 * included) so the reason returned on failure is accurate and so `order` keeps
 * describing the same cycle either way.
 */
export function pickNextCleaner(
  candidates: RotationCandidate[],
  lastAssignedId: string | null,
): RotationPick {
  if (candidates.length === 0) return { cleaner: null, reason: UNASSIGNED_REASON.noCleaners };

  const active = candidates.filter((c) => c.active);
  if (active.length === 0) return { cleaner: null, reason: UNASSIGNED_REASON.noneActive };

  const eligible = active.filter((c) => c.available);
  if (eligible.length === 0) return { cleaner: null, reason: UNASSIGNED_REASON.noneAvailable };

  // The cycle is over every cleaner account, not just the eligible ones, so the
  // pointer still resolves when the last-assigned cleaner has since gone
  // inactive or is busy this round.
  const size = candidates.length;
  const lastOrder = lastAssignedId
    ? (candidates.find((c) => c.id === lastAssignedId)?.order ?? null)
    : null;

  const ranked = [...eligible].sort((a, b) => {
    if (a.share !== b.share) return a.share - b.share;
    if (a.credits !== b.credits) return b.credits - a.credits;
    return (
      rotationDistance(a.order, lastOrder, size) - rotationDistance(b.order, lastOrder, size)
    );
  });

  return { cleaner: ranked[0], reason: null };
}
