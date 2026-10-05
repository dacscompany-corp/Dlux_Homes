"use client";

// Available Jobs for the signed-in cleaner — the shared logic behind the
// desktop portal's My Schedule → Available Jobs and the phone view's offer
// cards, so both show the same offers with the same deadlines and react to
// Accept / Skip identically.
//
// Offers are short-lived (10 minutes by default), so this polls faster than
// the 30s task list, and ticks a clock every second for the countdown. Each
// poll also runs the server's dispatch sweep, which is what moves a lapsed
// offer on to the next cleaner while the portal is open.

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  useAcceptJobMutation,
  useGetAvailableJobsQuery,
  useSkipJobMutation,
  type AvailableJob,
} from "@/redux/api/cleanersApi";

const POLL_MS = 15_000;

export type JobMessages = {
  accepted: string;
  skipped: string;
  taken: string;
  expired: string;
  failed: string;
};

const DEFAULT_MESSAGES: JobMessages = {
  accepted: "Job accepted — it's on your schedule.",
  skipped: "Skipped — offered to the next cleaner.",
  taken: "Another cleaner already took this job.",
  expired: "This offer expired and moved to the next cleaner.",
  failed: "Couldn't update this job. Try again.",
};

export function useAvailableJobs(opts: { skip?: boolean; messages?: Partial<JobMessages> } = {}) {
  const messages = { ...DEFAULT_MESSAGES, ...opts.messages };
  const { data, isLoading, isError, refetch } = useGetAvailableJobsQuery(undefined, {
    skip: opts.skip,
    pollingInterval: POLL_MS,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const [acceptJob] = useAcceptJobMutation();
  const [skipJob] = useSkipJobMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  // One-second clock for the countdowns; only runs while there's a deadline.
  const jobs: AvailableJob[] = data?.jobs ?? [];
  const hasDeadline = jobs.some((j) => j.expires_at);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasDeadline]);

  // An offer whose countdown hit zero is on its way to the next cleaner —
  // hide it now rather than let the cleaner tap a dead button.
  const visible = jobs.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() > now);

  const respond = async (job: AvailableJob, action: "accept" | "skip") => {
    setBusyId(job.cleaning_id);
    try {
      if (action === "accept") {
        await acceptJob(job.cleaning_id).unwrap();
        toast.success(messages.accepted);
      } else {
        await skipJob(job.cleaning_id).unwrap();
        toast(messages.skipped, { icon: "↪️" });
      }
    } catch (err) {
      const e = err as { status?: number; data?: { error?: string; code?: string } };
      const code = e?.data?.code;
      toast.error(
        code === "taken" ? messages.taken
          : code === "expired" ? messages.expired
          : e?.data?.error || messages.failed,
      );
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  return {
    jobs: visible,
    offerPeriodMinutes: data?.offerPeriodMinutes ?? 10,
    isLoading,
    isError,
    refetch,
    busyId,
    now,
    accept: (job: AvailableJob) => respond(job, "accept"),
    skip: (job: AvailableJob) => respond(job, "skip"),
  };
}

/** "9:07" — minutes:seconds left on an offer, never negative. */
export function formatCountdown(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
