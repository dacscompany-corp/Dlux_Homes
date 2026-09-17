import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SeasonalRateRecord, SeasonInput } from "@/lib/seasonalRates";

// Owner admin CRUD for seasonal rates. The storefront doesn't use this slice;
// it reads active seasons through useSeasonalRates() instead.
type ListResponse = { success: boolean; data: SeasonalRateRecord[] };
type ItemResponse = { success: boolean; data: SeasonalRateRecord; error?: string };

export const seasonalRatesApi = createApi({
  reducerPath: "seasonalRatesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/seasonal-rates" }),
  tagTypes: ["SeasonalRate"],
  endpoints: (builder) => ({
    getSeasonalRates: builder.query<SeasonalRateRecord[], void>({
      query: () => "",
      transformResponse: (r: ListResponse) => (Array.isArray(r?.data) ? r.data : []),
      providesTags: ["SeasonalRate"],
    }),
    createSeasonalRate: builder.mutation<ItemResponse, SeasonInput>({
      query: (body) => ({ url: "", method: "POST", body }),
      invalidatesTags: ["SeasonalRate"],
    }),
    updateSeasonalRate: builder.mutation<ItemResponse, { id: string; body: SeasonInput }>({
      query: ({ id, body }) => ({ url: `/${id}`, method: "PUT", body }),
      invalidatesTags: ["SeasonalRate"],
    }),
    toggleSeasonalRate: builder.mutation<ItemResponse, { id: string; active: boolean }>({
      query: ({ id, active }) => ({ url: `/${id}`, method: "PATCH", body: { active } }),
      invalidatesTags: ["SeasonalRate"],
    }),
    deleteSeasonalRate: builder.mutation<ItemResponse, string>({
      query: (id) => ({ url: `/${id}`, method: "DELETE" }),
      invalidatesTags: ["SeasonalRate"],
    }),
  }),
});

export const {
  useGetSeasonalRatesQuery,
  useCreateSeasonalRateMutation,
  useUpdateSeasonalRateMutation,
  useToggleSeasonalRateMutation,
  useDeleteSeasonalRateMutation,
} = seasonalRatesApi;
