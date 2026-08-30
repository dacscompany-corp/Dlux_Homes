import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import pool from "@/backend/config/db";
import { parseGuestMessage } from "@/lib/messenger-intent";
import {
  availabilityReply,
  priceReply,
  openDatesReply,
  overCapacityReply,
  askForDatesReply,
  stayTimeReply,
  bookingTermsReply,
} from "@/lib/messenger-reply";
import {
  loadHavenContext,
  loadCalendarRules,
  openWindowsOn,
  isRangeOpen,
  openDatesAhead,
} from "@/lib/availability";
import { havenToRoom } from "@/lib/haven-adapter";

// Facebook Messenger webhook for the D'Lux Homes page.
// A guest sends their booking ID (e.g. "DL-BK1762050261") and the bot replies with
// that booking's current status. Look-up / report only — it never changes a
// booking (confirmation stays with the admin after the down payment).
//
// Required env vars:
//   MESSENGER_VERIFY_TOKEN  — any secret string; must match the value you enter
//                             in the Meta App → Messenger → Webhooks setup.
//   MESSENGER_PAGE_TOKEN    — the Page Access Token from the Meta app.
//   FB_APP_SECRET           — (optional) the app secret; enables signature checks.

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "";
const PAGE_TOKEN = process.env.MESSENGER_PAGE_TOKEN || "";
const APP_SECRET = process.env.FB_APP_SECRET || "";
const GRAPH = "https://graph.facebook.com/v19.0/me/messages";

// ── GET: webhook verification handshake ──────────────────────────
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ── POST: incoming message events ────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Verify the payload signature when an app secret is configured.
  if (APP_SECRET) {
    const sig = req.headers.get("x-hub-signature-256") || "";
    const expected = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  let body: { object?: string; entry?: Array<{ messaging?: MessagingEvent[] }> };
  try { body = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }

  if (body.object === "page") {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const text = event.message?.text;
        if (senderId && text) {
          try { await handleMessage(senderId, text); } catch (e) { console.error("[messenger] handle error", e); }
        }
      }
    }
  }
  // Always 200 quickly so Facebook doesn't retry.
  return NextResponse.json({ status: "EVENT_RECEIVED" });
}

type MessagingEvent = { sender?: { id?: string }; message?: { text?: string } };

// ── Bot logic ────────────────────────────────────────────────────
async function handleMessage(senderId: string, text: string): Promise<void> {
  // Owner helper: DM "myid" to discover your PSID for MESSENGER_ADMIN_PSID.
  if (/^\s*(my ?id|psid)\s*$/i.test(text)) {
    await send(senderId, `Your Messenger PSID is:\n${senderId}\n\nSet this as MESSENGER_ADMIN_PSID to receive booking alerts here.`);
    return;
  }
  const intent = parseGuestMessage(text, new Date());

  if (intent.kind === "bookingId") {
    await send(senderId, await lookupReply(intent.id));
    return;
  }
  // Rates and availability used to be left entirely to the page inbox. The bot
  // answers those now; anything it cannot read is still left alone rather than
  // guessed at, so staff keep the general conversation.
  if (intent.kind === "none") return;

  const pax = "pax" in intent && intent.pax ? intent.pax : DEFAULT_PAX;
  if (pax > CAPACITY) {
    await send(senderId, overCapacityReply(pax, CAPACITY));
    return;
  }

  try {
    const [ctx, rules, room] = await Promise.all([
      loadHavenContext(),
      loadCalendarRules(),
      loadRoom(),
    ]);
    if (!ctx || !room) return;

    if (intent.kind === "openDates") {
      const dates = await openDatesAhead(OPEN_DATES_HORIZON, ctx);
      await send(senderId, openDatesReply(dates, OPEN_DATES_HORIZON));
      return;
    }

    // Check-in is flexible, check-out and rate are not. Answered from the
    // haven's own windows so it tracks the schedule the owner has saved.
    if (intent.kind === "stayTime") {
      await send(senderId, stayTimeReply(ctx.windows));
      return;
    }

    if (intent.kind === "price") {
      await send(
        senderId,
        priceReply({
          rates: room,
          windows: ctx.windows,
          extraPaxFee: room.additionalPaxFee,
          stay: intent.stay,
          pax: intent.pax,
        }),
      );
      return;
    }

    // A 10-hour session cannot span nights, so a date RANGE offers Overnight only.
    const nights = intent.to ? nightsBetween(intent.from, intent.to) : 1;
    const open =
      nights > 1
        ? (
            await Promise.all(
              ctx.windows.map(async (w) =>
                w.stayType === "21" && (await isRangeOpen(intent.from, nights, w, ctx)) ? w : null,
              ),
            )
          ).filter((w): w is NonNullable<typeof w> => w !== null)
        : await openWindowsOn(intent.from, ctx);

    await send(
      senderId,
      availabilityReply({
        from: intent.from,
        to: intent.to,
        nights,
        pax,
        windows: open,
        rates: room,
        extraPaxFee: room.additionalPaxFee,
        rules,
        stay: intent.stay,
        timeAsk: intent.timeAsk,
        requestedTime: intent.requestedTime,
      }),
    );

    // The terms follow the quote as their own bubble, and only when there is
    // something to book — a fully-booked date has no payment terms to warn about.
    if (open.length > 0) await send(senderId, bookingTermsReply(BOOKING_URL));
  } catch (e) {
    console.error("[messenger] availability error", e);
    await send(senderId, askForDatesReply());
  }
}

const OPEN_DATES_HORIZON = 14;
const CAPACITY = 4;
const DEFAULT_PAX = 2;
const BOOKING_URL = "dlux-homes.vercel.app";

/** Whole nights between two Manila calendar dates. */
function nightsBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** The single haven, mapped to the storefront's rate fields. */
async function loadRoom() {
  const r = await pool.query(`SELECT * FROM havens LIMIT 1`);
  return r.rows[0] ? havenToRoom(r.rows[0]) : null;
}

async function lookupReply(bookingId: string): Promise<string> {
  try {
    const r = await pool.query(
      `SELECT b.booking_id, b.status, b.room_name, b.check_in_date, b.check_in_time, b.check_out_time,
              bp.down_payment, bp.payment_method
         FROM booking b
         LEFT JOIN booking_payments bp ON b.id = bp.booking_id
        WHERE b.booking_id = $1
        LIMIT 1`,
      [bookingId],
    );
    if (r.rows.length === 0) {
      return `We couldn't find a booking with ID ${bookingId}. Please double-check the ID — it looks like BK followed by numbers.`;
    }
    const d = r.rows[0];
    const when = fmtDate(d.check_in_date);
    const window = d.check_in_time && d.check_out_time ? ` · ${t12(d.check_in_time)} → ${t12(d.check_out_time)}` : "";
    const head = `Booking ${d.booking_id}\n${d.room_name}\n${when}${window}\n`;
    const dp = Number(d.down_payment || 0);
    const method = d.payment_method === "bank" ? "BPI bank transfer (0123 4567 8901)" : "GCash (0946 007 4015)";
    switch (String(d.status)) {
      case "pending":
        return head + `\nStatus: ⏳ Pending — we're reviewing your valid IDs/documents. We'll approve it shortly!`;
      case "approved":
        return head + `\nStatus: ✅ Approved! Please send the ₱${dp.toLocaleString("en-PH")} down payment via ${method}, then upload your receipt in "My bookings" to confirm.`;
      case "confirmed":
        return head + `\nStatus: 🎉 Confirmed — your stay is all set. See you on ${when}!`;
      case "on-going":
      case "checked-in":
        return head + `\nStatus: 🏠 Your stay is on-going. Enjoy!`;
      case "checked-out":
      case "completed":
        return head + `\nStatus: ✔️ Completed. Thanks for staying with D'Lux Homes!`;
      case "rejected":
        return head + `\nStatus: ❌ This request was not approved. Message us here and we'll help sort it out.`;
      case "cancelled":
        return head + `\nStatus: 🚫 Cancelled.`;
      default:
        return head + `\nStatus: ${d.status}`;
    }
  } catch (e) {
    console.error("[messenger] lookup error", e);
    return "Sorry, something went wrong checking that booking. Please try again in a moment.";
  }
}

async function send(recipientId: string, text: string): Promise<void> {
  if (!PAGE_TOKEN) { console.error("[messenger] MESSENGER_PAGE_TOKEN not set"); return; }
  try {
    const res = await fetch(`${GRAPH}?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }),
    });
    // Graph returns 400 (not a thrown error) when the token is bad or the app
    // lacks Advanced Access for pages_messaging — log it or setup is undebuggable.
    if (!res.ok) console.error("[messenger] send failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[messenger] send error", e);
  }
}

// Date column may arrive as a UTC timestamp — format from local parts.
function fmtDate(v: unknown): string {
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function t12(t: unknown): string {
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
