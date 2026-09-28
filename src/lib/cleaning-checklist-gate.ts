// The one gate a cleaning assignment has to pass before it may leave
// In Progress for Awaiting Inspection.
//
// Both sides run it. The server runs it over `cleaning_tasks` joined to
// `cleaning_checklist_photos` (the authoritative check — it also rejects a
// direct API call that skips the UI); the portals run it over the checklist
// they already have loaded so the Done button can say exactly what's missing
// instead of failing with a generic error.
//
// Nothing here completes anything on the cleaner's behalf. A task is done when
// the cleaner ticked it and a photo of it uploaded successfully — never because
// submission was attempted.

export type GateTask = {
  /** cleaning_tasks.id */
  id: string;
  category: string;
  task: string;
  completed: boolean;
  /** A cleaning_checklist_photos row exists for this task on this checklist. */
  hasPhoto: boolean;
};

export type GateResult = {
  ok: boolean;
  totalTasks: number;
  /** Ticked-off count (a photo ticks its task on upload). */
  completedTasks: number;
  /**
   * Tasks that are fully done — ticked AND photographed. This is what the
   * portals' "X of N done" shows, so the header and the "photos still needed"
   * bar can never disagree.
   */
  doneTasks: number;
  /** Tasks the cleaner hasn't ticked yet. */
  incomplete: GateTask[];
  /** Tasks with no successfully uploaded photo. */
  missingPhotos: GateTask[];
  /** Task ids whose upload is still in flight (client-side only). */
  pendingUploads: string[];
  /** Task ids whose upload failed and hasn't been retried (client-side only). */
  failedUploads: string[];
  /** One sentence naming what's blocking, or null when the gate passes. */
  error: string | null;
};

export type GateOptions = {
  /** Task ids currently uploading — submission waits for them. */
  pendingUploads?: string[];
  /** Task ids whose last upload attempt failed. */
  failedUploads?: string[];
};

/** "Bedroom · Vacuum floor and rugs" — enough for a cleaner to find the row. */
function label(t: GateTask): string {
  return t.category ? `${t.category} · ${t.task}` : t.task;
}

/** Up to three names, then "+N more", so the message stays readable on a phone. */
function nameList(tasks: GateTask[]): string {
  const shown = tasks.slice(0, 3).map(label);
  const rest = tasks.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

/**
 * Evaluates one assignment's checklist. A checklist with no tasks at all is NOT
 * a pass — a missing checklist used to sail through the old "are there any
 * incomplete tasks?" check, which is exactly how rooms reached inspection with
 * nothing recorded.
 */
export function evaluateChecklistGate(tasks: GateTask[], options: GateOptions = {}): GateResult {
  const pendingUploads = (options.pendingUploads ?? []).filter((id) =>
    tasks.some((t) => t.id === id),
  );
  const failedUploads = (options.failedUploads ?? []).filter((id) =>
    tasks.some((t) => t.id === id),
  );

  const incomplete = tasks.filter((t) => !t.completed);
  const missingPhotos = tasks.filter((t) => !t.hasPhoto);
  const completedTasks = tasks.length - incomplete.length;
  const doneTasks = tasks.filter((t) => t.completed && t.hasPhoto).length;

  const base: Omit<GateResult, "ok" | "error"> = {
    totalTasks: tasks.length,
    completedTasks,
    doneTasks,
    incomplete,
    missingPhotos,
    pendingUploads,
    failedUploads,
  };

  if (tasks.length === 0) {
    return {
      ...base,
      ok: false,
      error:
        "This assignment has no checklist yet, so there is nothing to verify. Ask the office to set one up.",
    };
  }

  if (pendingUploads.length > 0) {
    return {
      ...base,
      ok: false,
      error: `Still uploading ${pendingUploads.length} photo${pendingUploads.length === 1 ? "" : "s"} — wait for ${pendingUploads.length === 1 ? "it" : "them"} to finish.`,
    };
  }

  if (failedUploads.length > 0) {
    const failed = tasks.filter((t) => failedUploads.includes(t.id));
    return {
      ...base,
      ok: false,
      error: `${failed.length} photo upload${failed.length === 1 ? "" : "s"} failed — try again: ${nameList(failed)}`,
    };
  }

  // A photo ticks its task on upload, so an unticked task that also has no
  // photo is ONE outstanding step. Only when some unticked task already HAS a
  // photo (the cleaner unticked it) is ticking a separate thing to report.
  const photoIds = new Set(missingPhotos.map((t) => t.id));
  const tickOnly = incomplete.filter((t) => !photoIds.has(t.id));
  if (missingPhotos.length > 0 && tickOnly.length === 0) {
    return {
      ...base,
      ok: false,
      error: `${missingPhotos.length} task${missingPhotos.length === 1 ? "" : "s"} still need a photo: ${nameList(missingPhotos)}`,
    };
  }

  if (incomplete.length > 0 && missingPhotos.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${incomplete.length} task${incomplete.length === 1 ? "" : "s"} not ticked and ${missingPhotos.length} still need a photo: ${nameList(incomplete.length >= missingPhotos.length ? incomplete : missingPhotos)}`,
    };
  }

  if (incomplete.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${incomplete.length} task${incomplete.length === 1 ? "" : "s"} still to tick off: ${nameList(incomplete)}`,
    };
  }

  if (missingPhotos.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${missingPhotos.length} task${missingPhotos.length === 1 ? "" : "s"} still need a photo: ${nameList(missingPhotos)}`,
    };
  }

  return { ...base, ok: true, error: null };
}
