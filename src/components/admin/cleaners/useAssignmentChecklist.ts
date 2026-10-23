"use client";

// One assignment's checklist, photo proof and submission gate — shared by the
// mobile and desktop cleaner portals so the two can't disagree about what's
// done, what's missing, or whether a room may be sent for inspection.
//
// The checklist is a plain checklist (tick every task) plus ONE photo per
// category showing the finished area.
//
// What it guarantees:
//   - a tick shows instantly but is rolled back if the server refuses it;
//   - each photo upload is tracked per category as uploading / failed, so a failed
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
import { imageFileError, PHOTO_READ_ERROR } from "@/lib/validateImageFile";
import { CLEANING_PHOTO_PRESET, fileToCompressedFile } from "@/lib/compressImage";

export type UploadState = "uploading" | "failed";

export type AssignmentChecklist = {
  checklist: Checklist | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** The checklist request failed (distinct from "loaded, and it's empty"). */
  loadError: boolean;
  refetch: () => void;
  gate: GateResult;
  /** URL of a category's finished-area photo, including one just uploaded. */
  photoFor: (category: string) => string | null;
  /** The task is ticked. */
  isDone: (taskId: string) => boolean;
  uploadStateFor: (category: string) => UploadState | null;
  /** Last upload error per category, for inline display. */
  uploadErrorFor: (category: string) => string | null;
  /** autoCompleted: that save finished the checklist and the room was handed in. */
  toggleTask: (taskId: string, currentlyCompleted: boolean) => Promise<{ ok: boolean; error?: string; autoCompleted?: boolean }>;
  uploadPhoto: (category: string, file: File) => Promise<{ ok: boolean; error?: string; autoCompleted?: boolean }>;
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

  // Photos uploaded this session (by category), shown before the refetch lands.
  const [freshPhotos, setFreshPhotos] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  // The picture the cleaner just took, shown at once (local object URL) while
  // it uploads — so the photo "appears" immediately instead of after the upload.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const dropPreview = (category: string) =>
    setPreviews((p) => {
      if (!p[category]) return p;
      URL.revokeObjectURL(p[category]);
      const next = { ...p };
      delete next[category];
      return next;
    });
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const tasks = useMemo(
    () =>
      (checklist?.categories ?? []).flatMap((c) =>
        c.tasks.map((t) => ({ ...t, category: c.category })),
      ),
    [checklist],
  );

  const photoFor = useCallback(
    (category: string) => {
      const fromServer = checklist?.categories.find((c) => c.category === category)?.photo_url ?? null;
      return previews[category] || freshPhotos[category] || fromServer || null;
    },
    [checklist, freshPhotos, previews],
  );

  const gate = useMemo(
    () =>
      evaluateChecklistGate(
        tasks.map((t) => ({
          id: t.id,
          category: t.category,
          task: t.task,
          completed: t.completed,
        })),
        {
          photoCategories: (checklist?.categories ?? [])
            .filter((c) => !!(c.photo_url || freshPhotos[c.category]))
            .map((c) => c.category),
          pendingUploads: Object.keys(uploads).filter((id) => uploads[id] === "uploading"),
          failedUploads: Object.keys(uploads).filter((id) => uploads[id] === "failed"),
        },
      ),
    [tasks, checklist, freshPhotos, uploads],
  );

  const toggleTask = useCallback(
    async (taskId: string, currentlyCompleted: boolean) => {
      if (skip) return { ok: false, error: "No checklist loaded" };
      try {
        const res = await toggleM({ taskId, completed: !currentlyCompleted, checklist: args }).unwrap();
        if (res.autoCompleted) dispatch(cleanersApi.util.invalidateTags(["CleaningTask"]));
        return { ok: true, autoCompleted: !!res.autoCompleted };
      } catch (err) {
        return { ok: false, error: errorMessage(err, "Could not save that task") };
      }
    },
    [toggleM, args, skip, dispatch],
  );

  const uploadPhoto = useCallback(
    async (category: string, file: File) => {
      const invalid = imageFileError(file);
      if (invalid) {
        setUploads((u) => ({ ...u, [category]: "failed" }));
        setUploadErrors((e) => ({ ...e, [category]: invalid }));
        return { ok: false, error: invalid };
      }
      const checklistId = checklist?.id;
      if (!checklistId) return { ok: false, error: "No checklist to attach this photo to" };

      setUploads((u) => ({ ...u, [category]: "uploading" }));
      setPreviews((p) => {
        if (p[category]) URL.revokeObjectURL(p[category]);
        return { ...p, [category]: URL.createObjectURL(file) };
      });
      setUploadErrors((e) => {
        const next = { ...e };
        delete next[category];
        return next;
      });

      try {
        const fd = new FormData();
        // Shrink on the phone first: a 1600px JPEG uploads many times faster
        // than the camera original. A HEIC that can't be read is reported.
        let toSend: File;
        try {
          toSend = await fileToCompressedFile(file, CLEANING_PHOTO_PRESET);
        } catch {
          dropPreview(category);
          setUploads((u) => ({ ...u, [category]: "failed" }));
          setUploadErrors((e) => ({ ...e, [category]: PHOTO_READ_ERROR }));
          return { ok: false, error: PHOTO_READ_ERROR };
        }
        fd.append("file", toSend);
        fd.append("checklist_id", checklistId);
        fd.append("category", category);
        const res = await fetch("/api/admin/cleaners/checklist-photos", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        // Success means the server confirmed the row that proves this area
        // exists — anything short of that is a failure the cleaner must see.
        if (!res.ok || !body?.url) {
          const msg = typeof body?.error === "string" && body.error ? body.error : "Photo upload failed";
          dropPreview(category);
          setUploads((u) => ({ ...u, [category]: "failed" }));
          setUploadErrors((e) => ({ ...e, [category]: msg }));
          return { ok: false, error: msg };
        }
        setFreshPhotos((p) => ({ ...p, [category]: String(body.url) }));
        dropPreview(category);
        setUploads((u) => {
          const next = { ...u };
          delete next[category];
          return next;
        });
        refetch();
        if (body.autoCompleted) dispatch(cleanersApi.util.invalidateTags(["CleaningTask"]));
        return { ok: true, autoCompleted: !!body.autoCompleted };
      } catch {
        const msg = "Photo upload failed — check your connection and try again";
        dropPreview(category);
        setUploads((u) => ({ ...u, [category]: "failed" }));
        setUploadErrors((e) => ({ ...e, [category]: msg }));
        return { ok: false, error: msg };
      }
    },
    [checklist?.id, refetch, dispatch],
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
      return !!t && t.completed;
    },
    uploadStateFor: (category) => uploads[category] ?? null,
    uploadErrorFor: (category) => uploadErrors[category] ?? null,
    toggleTask,
    uploadPhoto,
  };
}

/** Reads the server's refusal body (complete / submit) into one message. */
export function gateErrorMessage(err: unknown, fallback: string): string {
  return errorMessage(err, fallback);
}
