// The cleaning workflow's status machine, enforced identically wherever a
// status is written — the cleaner's Start/Done buttons, the admin inspection
// routes, and the generic PUT /tasks/[id] + /tasks/[id]/status endpoints that
// used to accept any status from anyone.
//
// Sequence:  Assigned → In Progress → Awaiting Inspection → Ready
// Rejection: Awaiting Inspection → In Progress (Owner/CSR only, note required)
//
// Nothing can skip a step, and only Owner/CSR can reach 'ready' — a cleaner
// cannot approve their own room, including by calling the API directly.

/**
 * Every status booking_cleaning.cleaning_status may hold. 'cleaned' and
 * 'inspected' predate this workflow and exist only on legacy rows; no code path
 * writes them any more.
 */
export const CLEANING_STATUSES = [
  "pending",
  "assigned",
  "in-progress",
  "awaiting-inspection",
  "ready",
  "cleaned",
  "inspected",
] as const;

export type CleaningStatus = (typeof CLEANING_STATUSES)[number];

/** Pre-workflow terminal statuses, kept readable but not transitioned into. */
export const LEGACY_CLEANING_STATUSES: readonly CleaningStatus[] = ["cleaned", "inspected"];

/** Who is asking. Owner and CSR are both "admin" here; Cleaner is "cleaner". */
export type CleaningActor = "cleaner" | "admin";

export type TransitionCheck = { ok: true } | { ok: false; error: string };

export function isCleaningStatus(value: unknown): value is CleaningStatus {
  return typeof value === "string" && (CLEANING_STATUSES as readonly string[]).includes(value);
}

/** Maps a NextAuth role to the actor this module reasons about. */
export function actorForRole(role: string | undefined | null): CleaningActor {
  return role === "Owner" || role === "CSR" ? "admin" : "cleaner";
}

// Transitions a cleaner may make on their OWN task. Deliberately tiny: they
// start the room they were given, and they hand it in for inspection.
const CLEANER_TRANSITIONS: Record<string, CleaningStatus[]> = {
  assigned: ["in-progress"],
  "in-progress": ["awaiting-inspection"],
};

// Everything Owner/CSR may do. 'assigned' as a destination is the manual
// assign/reassign path; 'ready' and the send-back to 'in-progress' are the two
// inspection outcomes.
const ADMIN_TRANSITIONS: Record<string, CleaningStatus[]> = {
  pending: ["assigned"],
  assigned: ["assigned", "in-progress", "pending"],
  "in-progress": ["assigned", "awaiting-inspection"],
  "awaiting-inspection": ["in-progress", "ready"],
  ready: [],
  // Legacy rows: let admin route them back through inspection or straight to
  // Ready, so nothing is stranded in a status this workflow no longer writes.
  cleaned: ["awaiting-inspection", "ready"],
  inspected: ["ready"],
};

/**
 * Whether `actor` may move a task from `from` to `to`.
 *
 * Writing the status a task already has is accepted as a no-op — callers that
 * re-send the current status (a replayed request, a UI that saves unchanged
 * fields) shouldn't fail — with one exception: 'assigned' → 'assigned' is a
 * real reassignment, so it still goes through the admin-only table.
 */
export function checkTransition(
  from: string,
  to: string,
  actor: CleaningActor,
): TransitionCheck {
  if (!isCleaningStatus(to)) {
    return {
      ok: false,
      error: `Invalid cleaning status. Must be one of: ${CLEANING_STATUSES.join(", ")}`,
    };
  }

  if (from === to && to !== "assigned") return { ok: true };

  const allowed = actor === "admin" ? ADMIN_TRANSITIONS[from] : CLEANER_TRANSITIONS[from];

  if (!allowed || !allowed.includes(to)) {
    if (actor === "cleaner") {
      return {
        ok: false,
        error:
          to === "ready"
            ? "Only Owner or CSR can approve a room after inspection."
            : `A cleaner cannot move a task from "${describe(from)}" to "${describe(to)}".`,
      };
    }
    return {
      ok: false,
      error: `"${describe(from)}" cannot move to "${describe(to)}". The sequence is Assigned → In Progress → Awaiting Inspection → Ready.`,
    };
  }

  return { ok: true };
}

const LABELS: Record<string, string> = {
  pending: "Needs Cleaning",
  assigned: "Assigned",
  "in-progress": "In Progress",
  "awaiting-inspection": "Awaiting Inspection",
  ready: "Ready",
  cleaned: "Cleaned (legacy)",
  inspected: "Inspected (legacy)",
};

/** Human label for a status, for error messages and UI. */
export function describe(status: string): string {
  return LABELS[status] ?? status;
}

/**
 * True once the cleaning has actually been performed. Used to decide whether a
 * reassignment releases the original cleaner's opportunity (unperformed work)
 * or leaves it credited to them (performed work).
 */
export function isPerformed(status: string): boolean {
  return (
    status === "awaiting-inspection" ||
    status === "ready" ||
    status === "cleaned" ||
    status === "inspected"
  );
}
