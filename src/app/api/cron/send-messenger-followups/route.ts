import { NextRequest, NextResponse } from "next/server";
import { sendMessenger } from "@/backend/utils/messengerNotify";
import {
  dueForFollowUp,
  claimFollowUp,
} from "@/backend/utils/messengerContext";
// The schedule itself lives in MESSENGER_FOLLOWUP_STAGES and is applied inside
// dueForFollowUp(), so this route never needs to know the thresholds.
import { followUpMessage } from "@/lib/messenger-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kept in step with BOOKING_URL in the Messenger webhook route. */
const BOOKING_URL = "dlux-homes.vercel.app";

/**
 * GET /api/cron/send-messenger-followups
 *
 * Nudges guests who were quoted on Messenger and then went quiet, as a THREE
 * stage sequence — MESSENGER_FOLLOWUP_STAGES minutes after the quote — and then
 * stops. Each stage sends different copy; one send per stage, never two.
 *
 * A conversation qualifies when `messenger_context.quoted_at` is older than the
 * threshold for the stage it is on and it has not finished the sequence. The
 * webhook NULLs `quoted_at` on every inbound message and resets the stage to 0,
 * so a guest who replied — even to say no — drops out of this query before it
 * ever sees them, and gets a fresh sequence next time they go quiet.
 *
 * TIMING: this deploy has no Vercel cron (Hobby plan); an external pinger hits
 * these routes about every 15 minutes, so each nudge lands up to ~15 minutes
 * after it comes due. That slack is why the final stage is 23 hours rather than
 * 24 — see MESSENGER_FOLLOWUP_STAGES for why crossing 24 would break the send.
 *
 * Idempotent: claimFollowUp() advances the stage under a WHERE guard on the
 * stage it read, and the send only happens if that claim won, so two
 * overlapping runs cannot double-message the same guest.
 *
 * Protected by CRON_SECRET, and fails closed in production if it isn't set.
 */
export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[cron/send-messenger-followups] CRON_SECRET is not set — refusing to run in production.",
      );
      return NextResponse.json({ success: false, error: "Cron not configured" }, { status: 503 });
    }
    // Non-production: allow unauthenticated local triggering for testing.
  } else {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const due = await dueForFollowUp();
    const now = new Date();

    let sent = 0;
    let skipped = 0;
    // Which stage each send belonged to, so a run's output shows the sequence
    // moving rather than just a count.
    const byStage: Record<number, number> = {};

    for (const { psid, stage } of due) {
      // Claim BEFORE sending. Losing the claim means another run already owns
      // this nudge; sending anyway would double-message the guest.
      if (!(await claimFollowUp(psid, stage))) {
        skipped += 1;
        continue;
      }
      // stage counts nudges already sent, so the one going out now is stage + 1.
      const nudge = (stage + 1) as 1 | 2 | 3;
      await sendMessenger(psid, followUpMessage(now, nudge, BOOKING_URL));
      byStage[nudge] = (byStage[nudge] ?? 0) + 1;
      sent += 1;
    }

    return NextResponse.json({ success: true, due: due.length, sent, skipped, byStage });
  } catch (e) {
    console.error("[cron/send-messenger-followups] failed", e);
    return NextResponse.json({ success: false, error: "Follow-up run failed" }, { status: 500 });
  }
}
