import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface OverheadCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  expense_count?: number;
}

export interface OverheadExpense {
  id: string;
  name: string;
  description: string | null;
  amount: string;
  frequency: string;
  interval_count: number | null;
  interval_unit: string | null;
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  active: boolean;
  notes: string | null;
  category_id: string;
  category_name: string;
  next_due_date: string | null;
}

export interface OverheadPeriod {
  id: string;
  expense_id: string;
  expense_name: string;
  category_name: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: "scheduled" | "paid" | "cancelled";
  display_status: "scheduled" | "due" | "overdue" | "paid" | "cancelled";
  accrual_month: string;
}

export interface OverheadPayment {
  id: string;
  paid_on: string;
  amount: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface OverheadDashboard {
  month: string;
  accrued_total: number;
  previous_month_total: number;
  ytd_total: number;
  estimated_annual: number;
  paid: number;
  unpaid: number;
  overdue: number;
  by_category: { name: string; amount: number }[];
  trend: { month: string; accrued: number; normalized: number }[];
}

export interface OverheadExpenseDetail {
  expense: OverheadExpense;
  periods: OverheadPeriod[];
  history: {
    action: string;
    metadata: Record<string, unknown>;
    actor_email: string | null;
    created_at: string;
  }[];
}

type Ok<T> = { success: boolean; data: T };

export const overheadApi = createApi({
  reducerPath: "overheadApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/overhead" }),
  tagTypes: ["OverheadExpense", "OverheadPeriod", "OverheadCategory", "OverheadDashboard"],
  endpoints: (builder) => ({
    getOverheadCategories: builder.query<Ok<OverheadCategory[]>, void>({
      query: () => "/categories",
      providesTags: ["OverheadCategory"],
    }),
    createOverheadCategory: builder.mutation<Ok<OverheadCategory>, { name: string }>({
      query: (body) => ({ url: "/categories", method: "POST", body }),
      invalidatesTags: ["OverheadCategory"],
    }),
    updateOverheadCategory: builder.mutation<
      Ok<OverheadCategory>, { id: string; name?: string; active?: boolean }
    >({
      query: ({ id, ...body }) => ({ url: `/categories/${id}`, method: "PUT", body }),
      invalidatesTags: ["OverheadCategory", "OverheadExpense"],
    }),
    deleteOverheadCategory: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadCategory"],
    }),

    getOverheadExpenses: builder.query<
      Ok<OverheadExpense[]>,
      { active?: string; category?: string; q?: string; month?: string } | void
    >({
      query: (params) => ({ url: "/expenses", params: params || undefined }),
      providesTags: ["OverheadExpense"],
    }),
    getOverheadExpense: builder.query<Ok<OverheadExpenseDetail>, string>({
      query: (id) => `/expenses/${id}`,
      providesTags: ["OverheadExpense", "OverheadPeriod"],
    }),
    createOverheadExpense: builder.mutation<Ok<{ id: string }>, Record<string, unknown>>({
      query: (body) => ({ url: "/expenses", method: "POST", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    updateOverheadExpense: builder.mutation<
      Ok<{ id: string }>, { id: string } & Record<string, unknown>
    >({
      query: ({ id, ...body }) => ({ url: `/expenses/${id}`, method: "PUT", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    deleteOverheadExpense: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/expenses/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    createOverheadSpend: builder.mutation<
      Ok<{ id: string }>,
      { name: string; category_id: string; amount: number; spent_on: string;
        method?: string; reference?: string; notes?: string }
    >({
      query: (body) => ({ url: "/spend", method: "POST", body }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),
    deleteOverheadSpend: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/spend/${id}`, method: "DELETE" }),
      invalidatesTags: ["OverheadExpense", "OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadPeriods: builder.query<
      Ok<OverheadPeriod[]>, { month?: string; status?: string } | void
    >({
      query: (params) => ({ url: "/periods", params: params || undefined }),
      providesTags: ["OverheadPeriod"],
    }),
    cancelOverheadPeriod: builder.mutation<Ok<{ id: string }>, string>({
      query: (id) => ({ url: `/periods/${id}`, method: "PATCH" }),
      invalidatesTags: ["OverheadPeriod", "OverheadDashboard"],
    }),

    updateOverheadPeriodAmount: builder.mutation<
      Ok<{ id: string; amount_due: number; amount_paid: number; settled: boolean }>,
      { periodId: string; amount: number }
    >({
      query: ({ periodId, amount }) => ({
        url: `/periods/${periodId}/amount`, method: "PUT", body: { amount },
      }),
      invalidatesTags: ["OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadPayments: builder.query<Ok<OverheadPayment[]>, string>({
      query: (periodId) => `/periods/${periodId}/payments`,
      providesTags: ["OverheadPeriod"],
    }),
    recordOverheadPayment: builder.mutation<
      Ok<{ period_id: string; amount_paid: number; settled: boolean }>,
      { periodId: string; paid_on: string; amount: number;
        method?: string; reference?: string; notes?: string }
    >({
      query: ({ periodId, ...body }) => ({
        url: `/periods/${periodId}/payments`, method: "POST", body,
      }),
      invalidatesTags: ["OverheadPeriod", "OverheadDashboard"],
    }),

    getOverheadDashboard: builder.query<Ok<OverheadDashboard>, { month?: string } | void>({
      query: (params) => ({ url: "/dashboard", params: params || undefined }),
      providesTags: ["OverheadDashboard"],
    }),
  }),
});

export const {
  useGetOverheadCategoriesQuery,
  useCreateOverheadCategoryMutation,
  useUpdateOverheadCategoryMutation,
  useDeleteOverheadCategoryMutation,
  useGetOverheadExpensesQuery,
  useGetOverheadExpenseQuery,
  useCreateOverheadExpenseMutation,
  useUpdateOverheadExpenseMutation,
  useDeleteOverheadExpenseMutation,
  useCreateOverheadSpendMutation,
  useDeleteOverheadSpendMutation,
  useGetOverheadPeriodsQuery,
  useCancelOverheadPeriodMutation,
  useUpdateOverheadPeriodAmountMutation,
  useGetOverheadPaymentsQuery,
  useRecordOverheadPaymentMutation,
  useGetOverheadDashboardQuery,
} = overheadApi;
