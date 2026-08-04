import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Stay types a promotion can be scoped to — 'day' Daycation, 'night'
// Nightcation, 'overnight' Full stay. null/[] means unscoped.
export type PromoStayType = 'day' | 'night' | 'overnight';

export interface ActivePromotion {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number | null;
  discount_id: string | null;
  discount_code: string | null;
  start_date: string;
  end_date: string;
  applies_to: PromoStayType[] | null;
}

export interface ActivePromotionsResponse {
  success: boolean;
  data: ActivePromotion[];
}

export const promotionsApi = createApi({
  reducerPath: "promotionsApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ['Promotion'],
  endpoints: (builder) => ({
    // Public — only currently active, in-window promotions.
    getActivePromotions: builder.query<ActivePromotion[], void>({
      query: () => ({ url: "/promotions/active" }),
      transformResponse: (response: ActivePromotionsResponse) =>
        Array.isArray(response?.data) ? response.data : [],
      providesTags: ['Promotion'],
    }),
  }),
});

export const { useGetActivePromotionsQuery } = promotionsApi;
