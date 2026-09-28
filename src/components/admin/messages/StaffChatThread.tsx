"use client";

// One cleaner ↔ office conversation: the message list and a composer. Used by
// the cleaner desktop portal (their single "D'Lux Office" thread) and by the
// office inbox on the CSR and Owner screens.
//
// `conversationId` may be null when the office opens a cleaner nobody has
// written to yet — the first message sent with `cleanerId` creates the thread.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  useGetStaffMessagesQuery,
  useSendStaffMessageMutation,
  type StaffMessage,
} from "@/redux/api/messagesApi";

const POLL_MS = 8_000;

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function StaffChatThread({
  conversationId,
  cleanerId,
  emptyHint,
  onStarted,
  className,
}: {
  conversationId: string | null;
  /** Office only: who to address when there's no thread yet. */
  cleanerId?: string;
  /** Shown when the thread has no messages yet. */
  emptyHint: string;
  /** Called with the new thread id after the first message creates it. */
  onStarted?: (conversationId: string) => void;
  className?: string;
}) {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const { data: messages = [], isLoading, isError, refetch } = useGetStaffMessagesQuery(conversationId ?? "", {
    skip: !conversationId,
    pollingInterval: POLL_MS,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const [send, { isLoading: sending }] = useSendStaffMessageMutation();
  const [draft, setDraft] = useState("");

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversationId]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    try {
      const sent = await send({
        conversation_id: conversationId,
        cleaner_id: conversationId ? undefined : cleanerId,
        message_text: text,
      }).unwrap();
      setDraft("");
      if (!conversationId && sent?.conversation_id) onStarted?.(sent.conversation_id);
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || "Couldn't send the message. Try again.");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // Group consecutive messages under a day divider.
  const rows: ({ kind: "day"; label: string; key: string } | { kind: "msg"; m: StaffMessage })[] = [];
  let lastDay = "";
  for (const m of messages) {
    const d = new Date(m.created_at);
    const key = d.toDateString();
    if (key !== lastDay) {
      rows.push({ kind: "day", label: dayLabel(d), key });
      lastDay = key;
    }
    rows.push({ kind: "msg", m });
  }

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2" style={{ backgroundColor: "#FAF7F1" }} aria-live="polite">
        {isLoading && conversationId ? (
          <p className="text-sm" style={{ color: "#8B6344" }}>Loading messages…</p>
        ) : isError ? (
          <div role="alert" className="flex items-center gap-3 text-sm" style={{ color: "#92400e" }}>
            <span className="flex-1">Couldn&apos;t load messages.</span>
            <button type="button" onClick={() => refetch()} className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: "#92400e" }}>
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm" style={{ color: "#8B6344" }}>{emptyHint}</p>
        ) : (
          rows.map((row) => {
            if (row.kind === "day") {
              return (
                <p key={`day-${row.key}`} className="text-center text-[11px] uppercase tracking-wider pt-2" style={{ color: "#b8b1a6" }}>
                  {row.label}
                </p>
              );
            }
            const m = row.m;
            const mine = m.sender_id === myId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && (
                  <span className="text-[11px] mb-0.5 px-1" style={{ color: "#8B6344" }}>
                    {m.sender_name}{m.from_office ? " · Office" : ""}
                  </span>
                )}
                <div className="max-w-[80%] px-3.5 py-2 text-sm whitespace-pre-wrap break-words"
                  style={{
                    borderRadius: 16,
                    backgroundColor: mine ? "#1f1b16" : "#ffffff",
                    color: mine ? "#FAF7F1" : "#1f1b16",
                    border: mine ? "none" : "1px solid #ece5d4",
                  }}>
                  {m.message_text}
                </div>
                <span className="text-[11px] mt-0.5 px-1" style={{ color: "#b8b1a6" }}>
                  {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {mine && (m.is_read ? " · Seen" : "")}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form className="flex items-end gap-2 border-t p-3" style={{ borderColor: "#ece5d4", backgroundColor: "#ffffff" }}
        onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor={`staff-msg-${conversationId ?? cleanerId ?? "new"}`} className="sr-only">Message</label>
        <textarea
          id={`staff-msg-${conversationId ?? cleanerId ?? "new"}`}
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          className="flex-1 resize-none border px-3 py-2 text-sm outline-none max-h-32"
          style={{ borderColor: "#ece5d4", color: "#1a1a1a", backgroundColor: "#ffffff" }}
        />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f1b16" }}>
          <Send className="w-4 h-4" />{sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
