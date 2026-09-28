"use client";

// One assignment's checklist, photo proof and submission gate — shared by the
// mobile and desktop cleaner portals so the two can't disagree about what's
// done, what's missing, or whether a room may be sent for inspection.
//
// What it guarantees:
//   - a tick shows instantly but is rolled back if the server refuses it;
//   - each photo upload is tracked per task as uploading / failed, so a failed
//     upload stays visible (with a retry) instead of vanishing, and submission
//     waits for in-flight uploads rather than racing them;
//   - `gate` is the same evaluateChecklistGate the server runs, so the Done
//     button's message matches the server's refusal word for word.
//
// Ticks and uploads are saved one at a time as they happen, so a failure at
// submission never throws away progress already made.

import { useCallback, useMemo, useState } from "react";
import { useAppDispatch } from "@/redux/hooks";
import {
  cleanersApi,
  useGetChecklistQuery,
  useToggleChecklistTaskMutation,
  type Checklist,
} from "@/redux/api/cleanersApi";
import { evaluateChecklistGate, type GateResult } from "@/lib/cleaning-checklist-gate";
import { imageFileError } from "@/lib/validateImageFile";

export type UploadState = "uploading" | "failed";

export type AssignmentChecklist = {
  checklist: Checklist | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** The checklist request failed (distinct from "loaded, and it's empty"). */
  loadError: boolean;
  refetch: () => void;
  gate: GateResult;
  /** URL of the proof photo for a task, including one just uploaded. */
  photoFor: (taskId: string) => string | null;
  /** Ticked AND photographed — the only state the portals show as done. */
  isDone: (taskId: string) => boolean;
  uploadStateFor: (taskId: string) => UploadState | null;
  /** Last upload error per task, for inline display. */
  uploadErrorFor: (taskId: string) => string | null;
  toggleTask: (taskId: string, currentlyCompleted: boolean) => Promise<{ ok: boolean; error?: string }>;
  uploadPhoto: (taskId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
};

type Target = { havenId: string; bookingUuid: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { error?: unknown } } | undefined)?.data;
  return typeof data?.error === "string" && data.error ? data.error : fallback;
}

export function useAssignmentChecklist(target: Target): AssignmentChecklist {
  const args = useMemo(
    () => (target ? { havenId: target.havenId, bookingId: target.bookingUuid } : { havenId: "", bookingId: "" }),
    [target],
  );
  const skip = !target?.havenId || !target?.bookingUuid;

  const { data: checklist, isLoading, isFetching, isError, refetch } = useGetChecklistQuery(args, { skip });
  const [toggleM] = useToggleChecklistTaskMutation();
  const dispatch = useAppDispatch();

  // Photos uploaded this session, shown before the checklist refetch lands.
  const [freshPhotos, setFreshPhotos] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const tasks = useMemo(
    () =>
      (checklist?.categories ?? []).flatMap((c) =>
        c.tasks.map((t) => ({ ...t, category: c.category })),
      ),
    [checklist],
  );

  const photoFor = useCallback(
    (taskId: string) => {
      const fromServer = tasks.find((t) => t.id === taskId)?.photo_url ?? null;
      return fromServer || freshPhotos[taskId] || null;
    },
    [tasks, freshPhotos],
  );

  const gate = useMemo(
    () =>
      evaluateChecklistGate(
        tasks.map((t) => ({
          id: t.id,
          category: t.category,
          task: t.task,
          completed: t.completed,
          hasPhoto: !!(t.photo_url || freshPhotos[t.id]),
        })),
        {
          pendingUploads: Object.keys(uploads).filter((id) => uploads[id] === "uploading"),
          failedUploads: Object.keys(uploads).filter((id) => uploads[id] === "failed"),
        },
      ),
    [tasks, freshPhotos, uploads],
  );

  const toggleTask = useCallback(
    async (taskId: string, currentlyCompleted: boolean) => {
      if (skip) return { ok: false, error: "No checklist loaded" };
      try {
        await toggleM({ taskId, completed: !currentlyCompleted, checklist: args }).unwrap();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorMessage(err, "Could not save that task") };
      }
    },
    [toggleM, args, skip],
  );

  const uploadPhoto = useCallback(
    async (taskId: string, file: File) => {
      const invalid = imageFileError(file);
      if (invalid) {
        setUploads((u) => ({ ...u, [taskId]: "failed" }));
        setUploadErrors((e) => ({ ...e, [taskId]: invalid }));
        return { ok: false, error: invalid };
      }
      const checklistId = checklist?.id;
      if (!checklistId) return { ok: false, error: "No checklist to attach this photo to" };

      setUploads((u) => ({ ...u, [taskId]: "uploading" }));
      setUploadErrors((e) => {
        const next = { ...e };
        delete next[taskId];
        return next;
      });

      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("checklist_id", checklistId);
        fd.append("task_id", taskId);
        const res = await fetch("/api/admin/cleaners/checklist-photos", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        // Success means the server confirmed the row that proves this task
        // exists — anything short of that is a failure the cleaner must see.
        if (!res.ok || !body?.url) {
          const msg = typeof body?.error === "string" && body.error ? body.error : "Photo upload failed";
          setUploads((u) => ({ ...u, [taskId]: "failed" }));
          setUploadErrors((e) => ({ ...e, [taskId]: msg }));
          return { ok: false, error: msg };
        }
        setFreshPhotos((p) => ({ ...p, [taskId]: String(body.url) }));
        // The server ticks the task in the same step as saving its photo, so
        // show it ticked now rather than after the refetch lands.
        dispatch(
          cleanersApi.util.updateQueryData("getChecklist", args, (draft) => {
            for (const category of draft.categories) {
              const item = category.tasks.find((t) => t.id === taskId);
              if (item) {
                item.completed = true;
                item.photo_url = String(body.url);
              }
            }
          })
        );
        setUploads((u) => {
          const next = { ...u };
          delete next[taskId];
          return next;
        });
        refetch();
        return { ok: true };
      } catch {
        const msg = "Photo upload failed — check your connection and try again";
        setUploads((u) => ({ ...u, [taskId]: "failed" }));
        setUploadErrors((e) => ({ ...e, [taskId]: msg }));
        return { ok: false, error: msg };
      }
    },
    [checklist?.id, refetch, dispatch, args],
  );

  return {
    checklist: skip ? undefined : checklist,
    isLoading: !skip && isLoading,
    isFetching: !skip && isFetching,
    loadError: !skip && isError,
    refetch: () => {
      if (!skip) refetch();
    },
    gate,
    photoFor,
    isDone: (taskId) => {
      const t = tasks.find((x) => x.id === taskId);
      return !!t && t.completed && !!(t.photo_url || freshPhotos[taskId]);
    },
    uploadStateFor: (taskId) => uploads[taskId] ?? null,
    uploadErrorFor: (taskId) => uploadErrors[taskId] ?? null,
    toggleTask,
    uploadPhoto,
  };
}

/** Reads the server's refusal body (complete / submit) into one message. */
export function gateErrorMessage(err: unknown, fallback: string): string {
  return errorMessage(err, fallback);
}
