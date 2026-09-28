"use client";

// The office side of cleaner messaging, for Owner and CSR: every cleaner on
// the left (with their latest message and unread count), the selected
// cleaner's conversation on the right. Any Owner or CSR can reply in any
// thread — it's one shared office inbox, not a per-admin one.

import { useMemo, useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import { useGetStaffThreadsQuery } from "@/redux/api/messagesApi";
import StaffChatThread from "./StaffChatThread";

const LIST_POLL_MS = 15_000;

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export default function OfficeStaffInbox({ height = 600 }: { height?: number }) {
  const { data: threads = [], isLoading, isError, refetch } = useGetStaffThreadsQuery(undefined, {
    pollingInterval: LIST_POLL_MS,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const [selectedCleaner, setSelectedCleaner] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? threads.filter((t) => t.cleaner_name.toLowerCase().includes(q) || (t.cleaner_email ?? "").toLowerCase().includes(q))
      : threads;
  }, [threads, query]);

  const selected = threads.find((t) => t.cleaner_id === selectedCleaner) ?? null;
  const totalUnread = threads.reduce((n, t) => n + t.unread_count, 0);

  return (
    <div className="border grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ borderColor: "#ece5d4", backgroundColor: "#ffffff", minHeight: height }}>
      {/* Cleaner list — hidden on small screens once a thread is open */}
      <div className={`border-b md:border-b-0 md:border-r flex flex-col min-h-0 ${selected ? "hidden md:flex" : "flex"}`}
        style={{ borderColor: "#ece5d4", maxHeight: height }}>
        <div className="p-3 border-b" style={{ borderColor: "#ece5d4" }}>
          <p className="text-xs mb-2" style={{ color: "#8B6344" }}>
            Cleaners{totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#D4BFA0" }} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cleaners…"
              aria-label="Search cleaners"
              className="w-full text-sm outline-none pl-8 pr-2 py-1.5 border" style={{ borderColor: "#ece5d4" }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-4 text-sm" style={{ color: "#8B6344" }}>Loading…</p>
          ) : isError ? (
            <div role="alert" className="px-4 py-4 text-sm" style={{ color: "#92400e" }}>
              Couldn&apos;t load conversations.{" "}
              <button type="button" onClick={() => refetch()} className="underline cursor-pointer">Try again</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: "#8B6344" }}>
              {threads.length === 0 ? "No cleaner accounts yet." : "No cleaners match your search."}
            </p>
          ) : (
            visible.map((t) => {
              const active = t.cleaner_id === selectedCleaner;
              return (
                <button key={t.cleaner_id} type="button" onClick={() => setSelectedCleaner(t.cleaner_id)}
                  aria-current={active ? "true" : undefined}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid #f3eee2", backgroundColor: active ? "#FAF7F1" : "transparent" }}>
                  <span className="flex-shrink-0 grid place-items-center text-sm"
                    style={{ width: 36, height: 36, borderRadius: "50%", background: "#e9f2ec", color: "#2f7d55", fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    {initials(t.cleaner_name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate" style={{ color: "#1f1b16", fontWeight: t.unread_count ? 600 : 400 }}>{t.cleaner_name}</span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: "#b8b1a6" }}>{when(t.last_message_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs truncate" style={{ color: "#8a8276" }}>
                        {t.last_message ? `${t.last_sender_name ? `${t.last_sender_name.split(" ")[0]}: ` : ""}${t.last_message}` : "No messages yet — start a chat"}
                      </span>
                      {t.unread_count > 0 && (
                        <span className="flex-shrink-0 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center"
                          style={{ backgroundColor: "#2f7d55", color: "#ffffff" }}>
                          {t.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`flex-col min-h-0 ${selected ? "flex" : "hidden md:flex"}`} style={{ height }}>
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#ece5d4" }}>
              <button type="button" onClick={() => setSelectedCleaner(null)} className="md:hidden text-sm cursor-pointer" style={{ color: "#8a6a2f" }}>
                ← Back
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#1f1b16" }}>{selected.cleaner_name}</p>
                <p className="text-xs truncate" style={{ color: "#8B6344" }}>
                  Cleaner{selected.cleaner_email ? ` · ${selected.cleaner_email}` : ""} · replies are seen by the whole office
                </p>
              </div>
            </div>
            <StaffChatThread
              key={selected.cleaner_id}
              className="flex-1"
              conversationId={selected.conversation_id}
              cleanerId={selected.cleaner_id}
              emptyHint={`No messages with ${selected.cleaner_name} yet. Send one to start the conversation — they'll get a notification.`}
            />
          </>
        ) : (
          <div className="flex-1 grid place-items-center p-8 text-center">
            <div>
              <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: "#D4BFA0" }} />
              <p className="text-sm" style={{ color: "#8B6344" }}>Choose a cleaner to read or send messages.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
