import { NextRequest, NextResponse } from "next/server";
import { sendMessenger } from "@/backend/utils/messengerNotify";
import {
  dueForFollowUp,
  claimFollowUp,
} from "@/backend/utils/messengerContext";
import {
  MESSENGER_FOLLOWUP_MINUTES,
  followUpMessage,
} from "@/lib/messenger-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/send-messenger-followups
 *
 * Nudges guests who were quoted on Messenger and then went quiet:
 * "Hello Ma'am/Sir, magandang hapon po! May we know po if interested pa po sila
 * to book?" — one nudge per quiet spell, never two.
 *
 * A conversation qualifies when `messenger_context.quoted_at` is older than
 * MESSENGER_FOLLOWUP_MINUTES and `follow_up_sent` is still FALSE. The webhook
 * NULLs `quoted_at` on every inbound message, so a guest who replied — even to
 * say no — drops out of this query before it ever sees them.
 *
 * TIMING: this deploy has no Vercel cron (Hobby plan); an external pinger hits
 * these routes about every 15 minutes. The nudge therefore lands 10-25 minutes
 * after the quote, not at 10 minutes exactly. Raising the pinger's frequency is
 * the only way to tighten that.
 *
 * Idempotent: claimFollowUp() flips the flag under a WHERE guard and the send
 * only happens if that claim won, so two overlapping runs cannot double-message
 * the same guest.
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
    const due = await dueForFollowUp(MESSENGER_FOLLOWUP_MINUTES);
    const text = followUpMessage();

    let sent = 0;
    let skipped = 0;
    for (const psid of due) {
      // Claim BEFORE sending. Losing the claim means another run already owns
      // this conversation; sending anyway would double-message the guest.
      if (!(await claimFollowUp(psid))) {
        skipped += 1;
        continue;
      }
      await sendMessenger(psid, text);
      sent += 1;
    }

    return NextResponse.json({ success: true, due: due.length, sent, skipped });
  } catch (e) {
    console.error("[cron/send-messenger-followups] failed", e);
    return NextResponse.json({ success: false, error: "Follow-up run failed" }, { status: 500 });
  }
}
