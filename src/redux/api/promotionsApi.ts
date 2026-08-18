import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Stay types a promotion can be scoped to — 'day' Daycation, 'night'
// Nightcation, 'overnight' Full stay. null/[] means unscoped.
export type PromoStayType = 'day' | 'night' | 'overnight';

// How the discount reaches the guest. 'voucher' → a `discounts` code applied at
// checkout; 'automatic' → applied directly, nothing to type.
export type PromotionRedemption = 'automatic' | 'voucher';

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
  redemption: PromotionRedemption;
  // Fixed peso amounts only: true = taken off EACH night, false = off the stay
  // once. A percentage already scales with the stay, so it is always false.
  per_night: boolean;
  // Ceiling on the total peso amount this offer can give away, or null for no
  // ceiling. Exists mainly to bound per_night on a long stay.
  max_discount: number | null;
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
