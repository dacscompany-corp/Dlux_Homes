// The one gate a cleaning assignment has to pass before it may leave
// In Progress for Awaiting Inspection.
//
// Both sides run it. The server runs it over `cleaning_tasks` plus the
// category photos in `cleaning_checklist_photos` (the authoritative check — it
// also rejects a direct API call that skips the UI); the portals run it over
// the checklist they already have loaded so the Done button can say exactly
// what's missing instead of failing with a generic error.
//
// The rule (owner request, 2026-10-18): the checklist is a plain checklist —
// every task ticked — plus ONE photo per category showing the finished result
// of that area. Tasks no longer carry their own photos.
//
// Nothing here completes anything on the cleaner's behalf.

export type GateTask = {
  /** cleaning_tasks.id */
  id: string;
  category: string;
  task: string;
  completed: boolean;
};

export type GateResult = {
  ok: boolean;
  totalTasks: number;
  /** Ticked-off count. */
  completedTasks: number;
  /** Same as completedTasks — kept as the "X of N done" figure the portals show. */
  doneTasks: number;
  /** Tasks the cleaner hasn't ticked yet. */
  incomplete: GateTask[];
  /** Every category on the checklist, in checklist order. */
  categories: string[];
  /** Categories with no successfully uploaded photo. */
  missingPhotos: string[];
  /** Categories whose upload is still in flight (client-side only). */
  pendingUploads: string[];
  /** Categories whose upload failed and hasn't been retried (client-side only). */
  failedUploads: string[];
  /** One sentence naming what's blocking, or null when the gate passes. */
  error: string | null;
};

export type GateOptions = {
  /** Categories that have a photo on this checklist. */
  photoCategories?: string[];
  /** Categories currently uploading — submission waits for them. */
  pendingUploads?: string[];
  /** Categories whose last upload attempt failed. */
  failedUploads?: string[];
};

/** "Bedroom · Vacuum floor and rugs" — enough for a cleaner to find the row. */
function label(t: GateTask): string {
  return t.category ? `${t.category} · ${t.task}` : t.task;
}

/** Up to three names, then "+N more", so the message stays readable on a phone. */
function nameList(names: string[]): string {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Evaluates one assignment's checklist. A checklist with no tasks at all is NOT
 * a pass — a missing checklist used to sail through the old "are there any
 * incomplete tasks?" check, which is exactly how rooms reached inspection with
 * nothing recorded.
 */
export function evaluateChecklistGate(tasks: GateTask[], options: GateOptions = {}): GateResult {
  const categories = [...new Set(tasks.map((t) => t.category))];
  const photographed = new Set(options.photoCategories ?? []);
  const pendingUploads = (options.pendingUploads ?? []).filter((c) => categories.includes(c));
  const failedUploads = (options.failedUploads ?? []).filter((c) => categories.includes(c));

  const incomplete = tasks.filter((t) => !t.completed);
  const missingPhotos = categories.filter((c) => !photographed.has(c));
  const completedTasks = tasks.length - incomplete.length;

  const base: Omit<GateResult, "ok" | "error"> = {
    totalTasks: tasks.length,
    completedTasks,
    doneTasks: completedTasks,
    incomplete,
    categories,
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
      error: `Still uploading ${plural(pendingUploads.length, "photo")} — wait for ${pendingUploads.length === 1 ? "it" : "them"} to finish.`,
    };
  }

  if (failedUploads.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${plural(failedUploads.length, "photo upload")} failed — try again: ${nameList(failedUploads)}`,
    };
  }

  if (incomplete.length > 0 && missingPhotos.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${plural(incomplete.length, "task")} not ticked and ${plural(missingPhotos.length, "area")} still need a photo: ${nameList(missingPhotos)}`,
    };
  }

  if (incomplete.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${plural(incomplete.length, "task")} still to tick off: ${nameList(incomplete.map(label))}`,
    };
  }

  if (missingPhotos.length > 0) {
    return {
      ...base,
      ok: false,
      error: `${plural(missingPhotos.length, "area")} still need a photo of the finished result: ${nameList(missingPhotos)}`,
    };
  }

  return { ...base, ok: true, error: null };
}
