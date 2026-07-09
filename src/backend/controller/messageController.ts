import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "../config/db";

// Resolve who is calling a messaging endpoint. Three cases:
//   - Staff (Owner/CSR/Cleaner): run support, may access any conversation.
//   - Logged-in customer: identity is pinned to the session id — they can never
//     act as another user, regardless of what id the request body/query claims.
//   - Guest (no session): the public chat widget, identified only by a client
//     UUID. We can't authenticate these, so their identity still comes from the
//     request; the conversation UUID acts as the shared secret. This is the
//     residual trust boundary (unchanged from before), but authenticated users
//     can no longer impersonate or enumerate others, which was the real hole.
async function resolveCaller(): Promise<{
  isStaff: boolean;
  sessionUserId: string | null;
}> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const isStaff = role === "Owner" || role === "CSR" || role === "Cleaner";
  const sessionUserId =
    (session?.user as { id?: string } | undefined)?.id ?? null;
  return { isStaff, sessionUserId };
}

async function isParticipant(
  conversationId: string,
  callerId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM conversations WHERE id = $1 AND $2 = ANY(participant_ids) LIMIT 1`,
    [conversationId, callerId],
  );
  return rows.length > 0;
}

export interface Conversation {
  id: string;
  name: string;
  type: "internal" | "guest";
  participant_ids: string[];
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  message_text: string;
  image_url?: string | null;
  created_at: string;
  is_read: boolean;
}

// GET all conversations for a user
export const getConversations = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("userId");

    // A logged-in, non-staff user may only ever list their OWN conversations —
    // ignore any userId they supply and pin to the session. Staff and guests
    // keep using the supplied id (staff pass their own; guests pass their UUID).
    const { isStaff, sessionUserId } = await resolveCaller();
    const userId =
      sessionUserId && !isStaff ? sessionUserId : requestedUserId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.type,
        c.participant_ids,
        c.created_at,
        c.updated_at,
        (
          SELECT m.message_text
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_time,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
          AND m.sender_id != $1
          AND m.is_read = false
        ) as unread_count
      FROM conversations c
      WHERE $1 = ANY(c.participant_ids)
      ORDER BY last_message_time DESC NULLS LAST
      `,
      [userId],
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error: unknown) {
    console.error("Error fetching conversations:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to fetch conversations";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
};

// GET messages for a conversation
export const getMessages = async (
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<NextResponse> => {
  try {
    const { conversationId } = await params;

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "Conversation ID is required" },
        { status: 400 },
      );
    }

    // Authenticated non-staff callers must be a participant of this conversation
    // — this stops a logged-in customer from reading any thread by its UUID.
    // Staff may read any thread; unauthenticated guests are gated only by the
    // conversation UUID they hold (see resolveCaller note).
    const { isStaff, sessionUserId } = await resolveCaller();
    if (sessionUserId && !isStaff) {
      const allowed = await isParticipant(conversationId, sessionUserId);
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_id,
        m.sender_name,
        m.message_text,
        m.image_url,
        m.created_at,
        m.is_read
      FROM messages m
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
      `,
      [conversationId],
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error: unknown) {
    console.error("Error fetching messages:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to fetch messages";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
};

// POST send a message
export const sendMessage = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { conversation_id, sender_id, sender_name, message_text } = body;
    const safeMessageText = typeof message_text === "string" ? message_text : "";

    const imageUrl =
      typeof body.image === "string" && body.image.trim()
        ? body.image
        : null;

    if (!conversation_id || !sender_id || !sender_name) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!safeMessageText && !imageUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // A logged-in non-staff user can only send AS THEMSELVES — reject a spoofed
    // sender_id. Previously anyone could POST another user's sender_id and
    // impersonate them. Staff and guests are unaffected.
    const { isStaff, sessionUserId } = await resolveCaller();
    if (sessionUserId && !isStaff && String(sender_id) !== String(sessionUserId)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const result = await pool.query(
      `
      INSERT INTO messages (
        conversation_id,
        sender_id,
        sender_name,
        message_text,
        image_url,
        is_read,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, false, timezone('Asia/Manila', NOW()))
      RETURNING *
      `,
      [conversation_id, sender_id, sender_name, safeMessageText, imageUrl],
    );

    // Update conversation's updated_at timestamp
    await pool.query(
      `UPDATE conversations SET updated_at = timezone('Asia/Manila', NOW()) WHERE id = $1`,
      [conversation_id],
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: unknown) {
    console.error("Error sending message:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to send message";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
};

// POST mark messages as read
export const markMessagesAsRead = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { conversation_id, user_id: requestedUserId } = body;

    // Pin a logged-in non-staff caller to their own id so they can only mark
    // their own unread messages as read.
    const { isStaff, sessionUserId } = await resolveCaller();
    const user_id =
      sessionUserId && !isStaff ? sessionUserId : requestedUserId;

    if (!conversation_id || !user_id) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    await pool.query(
      `
      UPDATE messages
      SET is_read = true
      WHERE conversation_id = $1
      AND sender_id != $2
      AND is_read = false
      `,
      [conversation_id, user_id],
    );

    return NextResponse.json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error: unknown) {
    console.error("Error marking messages as read:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to mark messages as read";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
};

// POST create a new conversation
export const createConversation = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { name, type, participant_ids } = body;

    if (!name || !type || !participant_ids || participant_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `
      INSERT INTO conversations (
        name,
        type,
        participant_ids
      ) VALUES ($1, $2, $3)
      RETURNING *
      `,
      [name, type, participant_ids],
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: unknown) {
    console.error("Error creating conversation:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to create conversation";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
};
