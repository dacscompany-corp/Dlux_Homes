// Outbound Messenger alerts to the admin/owner — e.g. "a new booking request
// arrived". Best-effort: never throws into the caller, just logs on failure.
//
// Env vars:
//   MESSENGER_PAGE_TOKEN  — Page Access Token (same one the webhook uses).
//   MESSENGER_ADMIN_PSID  — the owner's page-scoped ID. Get it by DMing the
//                           page the word "myid" once (the webhook replies with it).
//   MESSENGER_ALERT_TAG   — (optional) message tag for proactive sends,
//                           default "POST_PURCHASE_UPDATE".

const GRAPH = "https://graph.facebook.com/v19.0/me/messages";

export async function sendMessenger(recipientId: string, text: string, useTag = false): Promise<void> {
  const token = process.env.MESSENGER_PAGE_TOKEN || "";
  if (!token || !recipientId) {
    console.warn("[messenger] skip send — missing PAGE_TOKEN or recipient");
    return;
  }
  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    message: { text },
    ...(useTag
      ? { messaging_type: "MESSAGE_TAG", tag: process.env.MESSENGER_ALERT_TAG || "POST_PURCHASE_UPDATE" }
      : { messaging_type: "RESPONSE" }),
  };
  try {
    const res = await fetch(`${GRAPH}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error("[messenger] send failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[messenger] send error", e);
  }
}

type BookingAlert = {
  booking_id?: string;
  guest_first_name?: string;
  guest_last_name?: string;
  room_name?: string;
  check_in_date?: string;
  check_in_time?: string;
  check_out_time?: string;
  total_amount?: number | string;
  adults?: number | string;
  children?: number | string;
};

function t12(t?: string): string {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t || "");
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
function fmtDate(v?: string): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Alert the admin that a new booking request was received.
export async function notifyAdminOfBooking(b: BookingAlert): Promise<void> {
  const admin = process.env.MESSENGER_ADMIN_PSID || "";
  if (!admin) { console.warn("[messenger] MESSENGER_ADMIN_PSID not set — admin alert skipped"); return; }
  const guest = `${b.guest_first_name || ""} ${b.guest_last_name || ""}`.trim() || "Guest";
  const pax = (Number(b.adults || 0) + Number(b.children || 0)) || 1;
  const window = b.check_in_time && b.check_out_time ? ` · ${t12(b.check_in_time)} → ${t12(b.check_out_time)}` : "";
  const total = b.total_amount != null ? `₱${Number(b.total_amount).toLocaleString("en-PH")}` : "";
  const text =
    `🔔 New booking request\n` +
    `${b.booking_id || ""}\n` +
    `${guest} · ${pax} guest${pax > 1 ? "s" : ""}\n` +
    `${b.room_name || ""}\n` +
    `${fmtDate(b.check_in_date)}${window}\n` +
    (total ? `${total}\n` : "") +
    `Status: Pending — please review the documents in the admin portal.`;
  // Proactive message → use a message tag so it isn't blocked outside the 24h window.
  await sendMessenger(admin, text, true);
}
