import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// The signed-in employee's own record, as /api/admin/me returns it.
export interface MyProfile {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    role: string;
    department: string | null;
    employment_id: string;
    hire_date: string | null;
    status: string;
    street_address: string | null;
    city: string | null;
    zip_code: string | null;
    profile_image_url: string | null;
}

export type MyProfileUpdate = Partial<Pick<MyProfile, 'first_name' | 'last_name' | 'phone' | 'street_address' | 'city' | 'zip_code'>>;

export const employeeApi = createApi({
    reducerPath: "employeeApi",
    baseQuery: fetchBaseQuery({ baseUrl: "/api"}),
    tagTypes: ['Employee', 'MyProfile'],
    endpoints: (builder) => ({
        getEmployees: builder.query({
            query(params) {
                return {
                    url: "/admin/employees",
                    params
                };
            },
            providesTags: ['Employee']
        }),

        // Get employee by ID
        getEmployeeById: builder.query({
            query(id) {
                return {
                    url: `/admin/employees/${id}`
                };
            },
            providesTags: ['Employee']
        }),

        //Create employee
        createEmployee: builder.mutation({
            query(body) {
                return {
                    url: "/admin/employees",
                    method: "POST",
                    body
                }
            },
            invalidatesTags: ['Employee']
        }),

        // Update employee
        updateEmployee: builder.mutation({
            query(body) {
                const { id } = body;
                return {
                    url: `/admin/employees/${id}`,
                    method: "PUT",
                    body
                }
            },
            invalidatesTags: ['Employee']
        }),

        // Delete employee
        deleteEmployee: builder.mutation({
            query(id) {
                return {
                    url: `/admin/employees`,
                    method: "DELETE",
                    params: { id }
                }
            },
            invalidatesTags: ['Employee']
        }),

        // Self-service: any signed-in employee's own profile and password.
        getMyProfile: builder.query<MyProfile, void>({
            query: () => ({ url: "/admin/me" }),
            transformResponse: (response: { success: boolean; data: MyProfile }) => response.data,
            providesTags: ['MyProfile']
        }),

        updateMyProfile: builder.mutation<MyProfile, MyProfileUpdate>({
            query: (body) => ({ url: "/admin/me", method: "PUT", body }),
            transformResponse: (response: { success: boolean; data: MyProfile }) => response.data,
            invalidatesTags: ['MyProfile', 'Employee']
        }),

        changeMyPassword: builder.mutation<void, { currentPassword: string; newPassword: string }>({
            query: (body) => ({ url: "/admin/me/password", method: "POST", body })
        }),

        loginEmployee: builder.mutation({
            query(body) {
                return {
                    url: "/admin/login",
                    method: "POST",
                    body
                }
            }
        })
    })
});

export const {
    useGetEmployeesQuery,
    useGetEmployeeByIdQuery,
    useCreateEmployeeMutation,
    useUpdateEmployeeMutation,
    useDeleteEmployeeMutation,
    useLoginEmployeeMutation,
    useGetMyProfileQuery,
    useUpdateMyProfileMutation,
    useChangeMyPasswordMutation
} = employeeApi