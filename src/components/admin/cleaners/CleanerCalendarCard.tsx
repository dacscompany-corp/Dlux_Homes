"use client";

// The cleaner's own Google Calendar — set it up, open it, resend the invite,
// and the one setting Google won't let us make for them (reminders). Shared by
// the mobile Help screen and the desktop My Schedule page so both say the same
// thing.

import { useState } from "react";
import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  useGetMyCleaningCalendarQuery,
  useSetupMyCleaningCalendarMutation,
} from "@/redux/api/cleanersApi";
import { CLEANER_STRINGS, type CleanerLanguage } from "@/lib/cleaner-portal-strings";

const INK = "#1f1b16";
const MUTED = "#6b6358";
const LINE = "#ece5d4";
const GOLD = "#d4a96a";
const GOLD_INK = "#8a6a2f";

export default function CleanerCalendarCard({
  lang = "en",
  size = "mobile",
}: {
  lang?: CleanerLanguage;
  size?: "mobile" | "desktop";
}) {
  const t = CLEANER_STRINGS[lang];
  const { data, isLoading, isError } = useGetMyCleaningCalendarQuery();
  const [setup, { isLoading: working }] = useSetupMyCleaningCalendarMutation();
  const [resent, setResent] = useState(false);
  const big = size === "mobile";

  if (isLoading) return null;
  if (isError || !data || !data.isCleaner) return null;

  const run = async (resend: boolean) => {
    try {
      const res = await setup(resend ? { resend: true } : undefined).unwrap();
      if (resend) setResent(true);
      if (!resend && res.addUrl) window.open(res.addUrl, "_blank", "noopener");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error || t.calOff);
    }
  };

  const btn = (primary: boolean): React.CSSProperties => ({
    height: big ? 52 : 38,
    padding: big ? "0 18px" : "0 14px",
    borderRadius: big ? 14 : 8,
    border: primary ? 0 : `1px solid ${LINE}`,
    background: primary ? INK : "#fff",
    color: primary ? "#FAF7F1" : GOLD_INK,
    font: `600 ${big ? 16 : 13}px var(--font-geist-sans), system-ui, sans-serif`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: working ? "wait" : "pointer",
    opacity: working ? 0.6 : 1,
    textDecoration: "none",
  });

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: big ? 16 : 0, padding: big ? 18 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: big ? 40 : 32, height: big ? 40 : 32, borderRadius: 10, background: "#F7F0E3", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <CalendarDays style={{ width: big ? 22 : 18, height: big ? 22 : 18, color: GOLD_INK }} strokeWidth={2} />
        </span>
        <span style={{ fontSize: big ? 18 : 15, fontWeight: 700, color: INK }}>{t.calTitle}</span>
      </div>

      {!data.configured ? (
        <p style={{ fontSize: big ? 16 : 13, color: MUTED, margin: 0 }}>{t.calOff}</p>
      ) : (
        <>
          <p style={{ fontSize: big ? 16 : 13, lineHeight: 1.45, color: MUTED, margin: "0 0 12px" }}>{t.calIntro}</p>

          {data.sharedTo && (
            <p style={{ fontSize: big ? 15 : 13, lineHeight: 1.45, color: INK, margin: "0 0 12px" }}>
              {resent ? t.calResent : t.calSharedTo(data.sharedTo)}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.addUrl ? (
              <a href={data.addUrl} target="_blank" rel="noopener noreferrer" style={btn(true)}>
                <ExternalLink style={{ width: 16, height: 16 }} />{t.calOpen}
              </a>
            ) : (
              <button type="button" disabled={working} onClick={() => run(false)} style={btn(true)}>
                <CalendarDays style={{ width: 16, height: 16 }} />{working ? t.calWorking : t.calSetUp}
              </button>
            )}
            {data.calendarId && (
              <button type="button" disabled={working} onClick={() => run(true)} style={btn(false)}>
                <RefreshCw style={{ width: 15, height: 15 }} />{working ? t.calWorking : t.calResend}
              </button>
            )}
          </div>

          {data.calendarId && (
            <p style={{ fontSize: big ? 14 : 12, lineHeight: 1.45, color: MUTED, margin: "12px 0 0", borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
              <span style={{ color: GOLD, fontWeight: 700 }}>⏰ </span>{t.calTip}
            </p>
          )}
        </>
      )}
    </div>
  );
}
