import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// 'cleaned' / 'inspected' are the pre-workflow terminal statuses, kept only
// so old rows still type-check — new code always moves through
// 'awaiting-inspection' -> 'ready' instead.
export type CleaningStatus =
  | "pending"
  | "assigned"
  | "in-progress"
  | "cleaned"
  | "inspected"
  | "awaiting-inspection"
  | "ready";

export interface CleaningTask {
  cleaning_id: string;
  booking_id: string;
  booking_uuid?: string;
  /** The booking's own status — 'pending' means it isn't confirmed yet. */
  booking_status?: string;
  haven: string;
  haven_id: string | null;
  guest_first_name: string;
  guest_last_name: string;
  // Owner/CSR only — the server leaves guest contact and every payment figure
  // out of a Cleaner's response entirely.
  guest_email?: string;
  guest_phone?: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  /** Party size — how many towels, linens and amenities to set out. */
  adults?: number | null;
  children?: number | null;
  /** When the cleaning is due: the guest's checkout. Cleaning can't start before it. */
  scheduled_for?: string | null;
  cleaning_status: CleaningStatus;
  assigned_cleaner_id: string | null;
  assignment_method?: "automatic" | "manual" | null;
  assigned_by_id?: string | null;
  assigned_at?: string | null;
  assigned_by_first_name?: string | null;
  assigned_by_last_name?: string | null;
  cleaner_first_name: string | null;
  cleaner_last_name: string | null;
  cleaner_employment_id: string | null;
  cleaning_time_in: string | null;
  cleaning_time_out: string | null;
  cleaned_at: string | null;
  inspected_at: string | null;
  inspection_note?: string | null;
  /** Why automatic assignment left this task for Owner/CSR, when it did. */
  unassigned_reason?: string | null;
  open_issue_count?: number;
}

export interface CleanerCalendarStatus {
  /** The server has Google credentials. */
  configured: boolean;
  isCleaner: boolean;
  email: string | null;
  calendarId: string | null;
  /** Email the calendar was last shared to. */
  sharedTo: string | null;
  /** Opens (and offers to add) the calendar in Google Calendar. */
  addUrl: string | null;
}

export interface CleaningHistoryEntry {
  id: string;
  booking_cleaning_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  changed_by_first_name?: string | null;
  changed_by_last_name?: string | null;
  changed_at: string;
}

export interface UpdateCleaningTaskRequest {
  cleaning_status?: CleaningStatus;
  assigned_to?: string | null;
  cleaning_time_in?: string | null;
  cleaning_time_out?: string | null;
  cleaned_at?: string | null;
  inspected_at?: string | null;
  inspection_note?: string | null;
}

export interface ChecklistTaskItem {
  id: string;
  task: string;
  completed: boolean;
  /** The uploaded proof photo for this exact task, if any. */
  photo_url?: string | null;
}

/** Proof photo per checklist task, keyed by cleaning_tasks.id. */
export type ChecklistPhotos = Record<string, { url: string; uploaded_at: string | null }>;

/** Error body the complete/submit endpoints return when the gate fails. */
export interface ChecklistGateError {
  error?: string;
  incompleteTasks?: { id: string; category: string; task: string }[];
  missingPhotoTasks?: { id: string; category: string; task: string }[];
}

export interface ChecklistCategory {
  category: string;
  tasks: ChecklistTaskItem[];
}

export interface Checklist {
  id: string;
  haven_id: string;
  status: "pending" | "in_progress" | "completed";
  completed_at: string | null;
  categories: ChecklistCategory[];
}

export const cleanersApi = createApi({
  reducerPath: "cleanersApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/cleaners" }),
  tagTypes: ["CleaningTask", "CleaningHistory", "Checklist", "CleanerCalendar"],
  endpoints: (builder) => ({
    // Get (or lazily create) the checklist for one assignment's (haven, booking).
    getChecklist: builder.query<Checklist, { havenId: string; bookingId: string }>({
      query({ havenId, bookingId }) {
        return { url: "", params: { haven_id: havenId, booking_id: bookingId } };
      },
      transformResponse: (response: { success: boolean; data: { checklist: Checklist } }) => response.data.checklist,
      providesTags: (_result, _error, arg) => [{ type: "Checklist", id: `${arg.havenId}:${arg.bookingId}` }],
    }),

    // Toggle one checklist task's completed state. Pass `checklist` (the args
    // the checklist was loaded with) to tick it on screen immediately; if the
    // server refuses, the tick is rolled back so a failed save never looks saved.
    toggleChecklistTask: builder.mutation<
      { task: ChecklistTaskItem; incompleteCount: number },
      { taskId: string; completed: boolean; checklist?: { havenId: string; bookingId: string } }
    >({
      query({ taskId, completed }) {
        return { url: "", method: "PATCH", body: { task_id: taskId, completed } };
      },
      transformResponse: (response: { success: boolean; data: { task: ChecklistTaskItem; incompleteCount: number } }) => response.data,
      async onQueryStarted({ taskId, completed, checklist }, { dispatch, queryFulfilled }) {
        if (!checklist) return;
        const patch = dispatch(
          cleanersApi.util.updateQueryData("getChecklist", checklist, (draft) => {
            for (const category of draft.categories) {
              const item = category.tasks.find((t) => t.id === taskId);
              if (item) item.completed = completed;
            }
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["Checklist"],
    }),

    // Admin-only: add a task to an already-created checklist (per-assignment
    // customization, e.g. "deep clean the oven" for just this booking).
    addChecklistTask: builder.mutation<ChecklistTaskItem, { checklistId: string; category: string; taskDescription: string }>({
      query({ checklistId, category, taskDescription }) {
        return { url: "", method: "POST", body: { action: "add_task", checklist_id: checklistId, category, task_description: taskDescription } };
      },
      transformResponse: (response: { success: boolean; data: { task: ChecklistTaskItem } }) => response.data.task,
      invalidatesTags: ["Checklist"],
    }),

    // Admin-only: edit an existing task's wording/category.
    editChecklistTask: builder.mutation<ChecklistTaskItem, { taskId: string; category?: string; taskDescription?: string }>({
      query({ taskId, category, taskDescription }) {
        return { url: "", method: "POST", body: { action: "edit_task", task_id: taskId, category, task_description: taskDescription } };
      },
      transformResponse: (response: { success: boolean; data: { task: ChecklistTaskItem } }) => response.data.task,
      invalidatesTags: ["Checklist"],
    }),

    // Admin-only: remove a task admin added by mistake or that no longer applies.
    removeChecklistTask: builder.mutation<{ checklistId: string }, { taskId: string }>({
      query({ taskId }) {
        return { url: "", method: "POST", body: { action: "remove_task", task_id: taskId } };
      },
      invalidatesTags: ["Checklist"],
    }),

    // Every category name in use anywhere (template defaults + any custom
    // ones already added), for the "Add Category" picker — so admin picks
    // from what exists instead of retyping "Bedroom" vs "bedroom".
    getKnownCategories: builder.query<string[], void>({
      query() {
        return { url: "/checklist-categories" };
      },
      transformResponse: (response: { success: boolean; data: string[] }) => response.data || [],
      providesTags: ["Checklist"],
    }),

    // Proof photo per checklist task, keyed by cleaning_tasks.id — the same
    // store the cleaner portal writes via /api/admin/cleaners/checklist-photos.
    getChecklistPhotos: builder.query<ChecklistPhotos, string>({
      query(checklistId) {
        return { url: "/checklist-photos", params: { checklist_id: checklistId } };
      },
      transformResponse: (response: { success: boolean; data: ChecklistPhotos }) => response.data || {},
      providesTags: (_result, _error, checklistId) => [{ type: "Checklist", id: `photos:${checklistId}` }],
    }),
    // Get all cleaning tasks
    getCleaningTasks: builder.query<CleaningTask[], { status?: string } | void>({
      query(params?: { status?: string }) {
        return {
          url: "/tasks",
          params,
        };
      },
      transformResponse: (response: { success: boolean; data: CleaningTask[] }) => {
        return response.data || [];
      },
      providesTags: ["CleaningTask"],
    }),

    // Get single cleaning task by ID
    getCleaningTaskById: builder.query<CleaningTask, string>({
      query(id) {
        return {
          url: `/tasks/${id}`,
        };
      },
      providesTags: ["CleaningTask"],
    }),

    // Update cleaning task
    updateCleaningTask: builder.mutation<CleaningTask, { id: string; body: UpdateCleaningTaskRequest }>({
      query({ id, body }) {
        return {
          url: `/tasks/${id}`,
          method: "PUT",
          body,
        };
      },
      invalidatesTags: ["CleaningTask"],
    }),

    // Assign cleaner to task
    assignCleaner: builder.mutation<CleaningTask, { taskId: string; cleanerId: string }>({
      query({ taskId, cleanerId }) {
        return {
          url: `/tasks/${taskId}/assign`,
          method: "PUT",
          body: { assigned_to: cleanerId },
        };
      },
      invalidatesTags: ["CleaningTask"],
    }),

    // Update cleaning status
    updateCleaningStatus: builder.mutation<CleaningTask, { taskId: string; status: CleaningStatus }>({
      query({ taskId, status }) {
        return {
          url: `/tasks/${taskId}/status`,
          method: "PUT",
          body: { cleaning_status: status },
        };
      },
      invalidatesTags: ["CleaningTask"],
    }),

    // Start cleaning: assigned -> in-progress. The server refuses before the
    // guest's checkout and for anyone but the assigned cleaner. Shown as started
    // straight away; rolled back if the server says no.
    startCleaning: builder.mutation<CleaningTask, string>({
      query(taskId) {
        return { url: `/tasks/${taskId}/start`, method: "PUT" };
      },
      async onQueryStarted(taskId, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          cleanersApi.util.updateQueryData("getCleaningTasks", undefined, (draft) => {
            const row = draft.find((t) => t.cleaning_id === taskId);
            if (row) row.cleaning_status = "in-progress";
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["CleaningTask"],
    }),

    // Complete cleaning — moves to 'awaiting-inspection', NOT 'ready'. The
    // route verifies the checklist (every task ticked, every task photographed)
    // server-side and computes the timestamps; the client sends no body. On a
    // refusal the task is put back to In Progress on screen, and the error body
    // (ChecklistGateError) names what's missing.
    completeCleaning: builder.mutation<CleaningTask, string>({
      query(taskId) {
        return { url: `/tasks/${taskId}/complete`, method: "PUT", body: {} };
      },
      async onQueryStarted(taskId, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          cleanersApi.util.updateQueryData("getCleaningTasks", undefined, (draft) => {
            const row = draft.find((t) => t.cleaning_id === taskId);
            if (row) row.cleaning_status = "awaiting-inspection";
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["CleaningTask", "Checklist"],
    }),

    // Admin approves an inspection: awaiting-inspection -> ready. Only this
    // call can put a task into 'ready'.
    approveInspection: builder.mutation<CleaningTask, string>({
      query(taskId) {
        return {
          url: `/tasks/${taskId}/inspect/approve`,
          method: "PUT",
        };
      },
      invalidatesTags: ["CleaningTask", "CleaningHistory"],
    }),

    // Admin fails an inspection: awaiting-inspection -> in-progress, with a
    // required note the cleaner is notified about.
    rejectInspection: builder.mutation<CleaningTask, { taskId: string; note: string }>({
      query({ taskId, note }) {
        return {
          url: `/tasks/${taskId}/inspect/reject`,
          method: "PUT",
          body: { note },
        };
      },
      invalidatesTags: ["CleaningTask", "CleaningHistory"],
    }),

    // The signed-in cleaner's own Google Calendar: status, and set up / resend.
    getMyCleaningCalendar: builder.query<CleanerCalendarStatus, void>({
      query() {
        return { url: "/calendar" };
      },
      transformResponse: (response: { success: boolean; data: CleanerCalendarStatus }) => response.data,
      providesTags: ["CleanerCalendar"],
    }),
    setupMyCleaningCalendar: builder.mutation<CleanerCalendarStatus, { resend?: boolean } | void>({
      query(arg) {
        return { url: "/calendar", method: "POST", body: { action: arg && arg.resend ? "resend" : "setup" } };
      },
      transformResponse: (response: { success: boolean; data: CleanerCalendarStatus }) => response.data,
      invalidatesTags: ["CleanerCalendar"],
    }),

    // Status history for one task's detail view.
    getCleaningHistory: builder.query<CleaningHistoryEntry[], string>({
      query(taskId) {
        return { url: `/tasks/${taskId}/history` };
      },
      transformResponse: (response: { success: boolean; data: CleaningHistoryEntry[] }) => response.data || [],
      providesTags: ["CleaningHistory"],
    }),
  }),
});

export const {
  useGetCleaningTasksQuery,
  useGetCleaningTaskByIdQuery,
  useUpdateCleaningTaskMutation,
  useAssignCleanerMutation,
  useUpdateCleaningStatusMutation,
  useStartCleaningMutation,
  useCompleteCleaningMutation,
  useApproveInspectionMutation,
  useRejectInspectionMutation,
  useGetCleaningHistoryQuery,
  useGetChecklistQuery,
  useToggleChecklistTaskMutation,
  useAddChecklistTaskMutation,
  useEditChecklistTaskMutation,
  useRemoveChecklistTaskMutation,
  useGetChecklistPhotosQuery,
  useGetKnownCategoriesQuery,
  useGetMyCleaningCalendarQuery,
  useSetupMyCleaningCalendarMutation,
} = cleanersApi;
