import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

interface Conversation {
  id: string;
  name: string;
  type: "internal" | "guest" | "oauth";
  participant_ids: string[];
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  message_text: string;
  image_url?: string | null;
  created_at: string;
  is_read: boolean;
}

/** A cleaner's thread with the office, as either side sees it. */
export interface StaffThread {
  /** Null when nobody has written yet (office view only). */
  conversation_id: string | null;
  cleaner_id: string;
  cleaner_name: string;
  cleaner_email: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_name: string | null;
  /** Unread for the viewer's side (office: cleaner's messages; cleaner: office's). */
  unread_count: number;
}

export interface StaffMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  message_text: string;
  created_at: string;
  is_read: boolean;
  from_office: boolean;
}

export const messagesApi = createApi({
  reducerPath: "messagesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/messages" }),
  tagTypes: ["Conversations", "Messages", "StaffThreads", "StaffMessages"],
  endpoints: (builder) => ({
    // ── Cleaner ↔ office (Owner/CSR) chat ─────────────────────────────────
    // Identity comes from the session server-side; nothing here sends ids.
    getStaffThreads: builder.query<StaffThread[], void>({
      query: () => ({ url: "/staff" }),
      transformResponse: (res: { success: boolean; data: StaffThread[] }) => res.data ?? [],
      providesTags: ["StaffThreads"],
    }),

    getStaffMessages: builder.query<StaffMessage[], string>({
      query: (conversationId) => ({ url: `/staff/${conversationId}` }),
      transformResponse: (res: { success: boolean; data: StaffMessage[] }) => res.data ?? [],
      providesTags: (_r, _e, id) => [{ type: "StaffMessages", id }],
      // Opening a thread marks it read, so the list's unread counts change too.
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(messagesApi.util.invalidateTags(["StaffThreads"]));
        } catch { /* the query's own error state covers it */ }
      },
    }),

    sendStaffMessage: builder.mutation<
      StaffMessage,
      { conversation_id?: string | null; cleaner_id?: string | null; message_text: string }
    >({
      query: (body) => ({ url: "/staff", method: "POST", body }),
      transformResponse: (res: { success: boolean; data: StaffMessage }) => res.data,
      invalidatesTags: (result) => [
        "StaffThreads",
        ...(result ? [{ type: "StaffMessages" as const, id: result.conversation_id }] : []),
      ],
    }),

    // Get all conversations for a user
    getConversations: builder.query<
      { success: boolean; data: Conversation[] },
      { userId: string }
    >({
      query: ({ userId }) => ({
        url: `/conversations?userId=${userId}`,
        method: "GET",
      }),
      providesTags: ["Conversations"],
    }),

    // Get messages for a specific conversation
    getMessages: builder.query<
      { success: boolean; data: Message[] },
      { conversationId: string }
    >({
      query: ({ conversationId }) => ({
        url: `/${conversationId}`,
        method: "GET",
      }),
      providesTags: (result, error, { conversationId }) => [
        { type: "Messages", id: conversationId },
      ],
    }),

    // Send a message
    sendMessage: builder.mutation<
      { success: boolean; data: Message },
      {
        conversation_id: string;
        sender_id: string;
        sender_name: string;
        message_text?: string;
        image?: string;
      }
    >({
      query: (body) => ({
        url: "/send",
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { conversation_id }) => [
        { type: "Messages", id: conversation_id },
        "Conversations",
      ],
    }),

    // Mark messages as read
    markMessagesAsRead: builder.mutation<
      { success: boolean; message: string },
      { conversation_id: string; user_id: string }
    >({
      query: (body) => ({
        url: "/mark-read",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Conversations"],
    }),

    // Create a new conversation
    createConversation: builder.mutation<
      { success: boolean; data: Conversation },
      {
        name: string;
        type: "internal" | "guest" | "oauth";
        participant_ids: string[];
      }
    >({
      query: (body) => ({
        url: "/conversations",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Conversations"],
    }),
  }),
});

export const {
  useGetConversationsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkMessagesAsReadMutation,
  useCreateConversationMutation,
  useGetStaffThreadsQuery,
  useGetStaffMessagesQuery,
  useSendStaffMessageMutation,
} = messagesApi;
