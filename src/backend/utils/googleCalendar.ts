import { google } from "googleapis";
import { securityDepositFor } from "@/lib/pricing";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * Robustly parses GOOGLE_PRIVATE_KEY from .env regardless of how it was stored.
 * Handles: escaped \\n, JSON-quoted strings, literal newlines, missing headers.
 */
export const parsePrivateKey = (raw: string): string => {
  let key = raw.trim();

  // If the whole thing is wrapped in JSON quotes (e.g. "-----BEGIN...-----")
  if (key.startsWith('"') && key.endsWith('"')) {
    try {
      key = JSON.parse(key);
    } catch { }
  }

  // PASTE-PROOF FORM: the whole PEM, base64-encoded.
  //
  // Every other accepted form carries backslashes, newlines or quotes, and each
  // of those can be silently eaten between a clipboard, a shell and a hosting
  // dashboard. When the `\n` escapes are lost, the bare "n" characters merge
  // into the base64 body and the key is unrecoverable — OpenSSL reports only
  // "DECODER routines::unsupported", which says nothing about the cause.
  // A single base64 blob has no such characters, so it cannot be mangled.
  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) return decoded;
    } catch { /* not base64 — fall through to the plain-text handling */ }
  }

  // Replace literal \n text sequences with actual newlines
  key = key.replace(/\\n/g, "\n");

  // If the key still has no real newlines, it might be a single-line base64 blob
  // Try to reconstruct proper PEM by inserting newlines every 64 chars between headers
  if (!key.includes("\n")) {
    const beginMatch = key.match(/(-----BEGIN[^-]+-----)/);
    const endMatch = key.match(/(-----END[^-]+-----)/);
    if (beginMatch && endMatch) {
      const begin = beginMatch[1];
      const end = endMatch[1];
      const body = key.slice(begin.length, key.lastIndexOf("-----END")).trim();
      const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
      key = `${begin}\n${wrapped}\n${end}`;
    }
  }

  return key;
};

export const getGoogleCalendarAuth = () => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL_CALENDAR;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY_CALENDAR;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Missing Google Calendar credentials in environment variables.");
  }

  const privateKey = parsePrivateKey(privateKeyRaw);

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: SCOPES,
  });
};

export interface CalendarEventData {
  room_name: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string;
  check_out_time?: string;
  guest_first_name: string;
  guest_last_name: string;
  guest_email: string;
  guest_phone: string;
  booking_id: string;
  status: string;
  stay_type?: string;
  payment_method?: string;
  payment_proof_url?: string;
  total_amount?: number;
  down_payment?: number;
  adults?: number;
  children?: number;
  infants?: number;
  /** Still owed at check-in. Falls back to total − down payment when absent. */
  remaining_balance?: number;
  /** Refundable security deposit collected at check-in (D'Lux house policy). */
  security_deposit?: number;
  /** Names of the non-main guests, so the host knows who else is arriving. */
  additional_guest_names?: string[];
}

/** Authenticated client + the configured calendar id (throws when unconfigured). */
const getCalendarClient = () => {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("Missing GOOGLE_CALENDAR_ID in environment variables.");
  }
  const auth = getGoogleCalendarAuth();
  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
};

/**
 * Builds the Google Calendar event body from booking data (throws on bad dates).
 * Pure — no API calls — so insert and update always render identical events and
 * can never drift apart.
 */
const buildEventBody = (bookingData: CalendarEventData) => {
  const {
    room_name,
    check_in_date,
    check_out_date,
    check_in_time,
    check_out_time,
    guest_first_name,
    guest_last_name,
    guest_email,
    guest_phone,
    booking_id,
    status,
    stay_type,
    payment_method,
    payment_proof_url,
    total_amount,
    down_payment,
    adults,
    children,
    infants,
    remaining_balance,
    security_deposit,
    additional_guest_names,
  } = bookingData;

  // Postgres TIME columns return "HH:MM:SS" — slice to "HH:MM"
  const inTime = (check_in_time || "14:00").slice(0, 5);
  const outTime = (check_out_time || "11:00").slice(0, 5);

  // Postgres DATE columns return JS Date objects — convert safely to "YYYY-MM-DD"
  const toDateStr = (d: any): string => {
    if (!d) return "";
    // Already a plain date string like "2024-01-15"
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // ISO string like "2024-01-15T00:00:00.000Z" — take the date part
    if (typeof d === "string" && d.includes("T")) return d.split("T")[0];
    // JS Date object — use UTC date parts to avoid timezone shift
    const dt = new Date(d);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const inDateOnly = toDateStr(check_in_date);
  const outDateOnly = toDateStr(check_out_date);

  if (!inDateOnly || !outDateOnly) {
    throw new Error(`Invalid dates for booking ${booking_id}: check_in_date="${check_in_date}", check_out_date="${check_out_date}"`);
  }

  const startDateTimeStr = `${inDateOnly}T${inTime}:00+08:00`;
  let endDateTimeStr = `${outDateOnly}T${outTime}:00+08:00`;

  // If end <= start (same-day booking where check-out time is earlier than check-in time),
  // advance the check-out date by 1 day so Google Calendar accepts the event.
  if (endDateTimeStr <= startDateTimeStr) {
    const nextDay = new Date(`${outDateOnly}T00:00:00+08:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    endDateTimeStr = `${nextDayStr}T${outTime}:00+08:00`;
    console.log(`📅 [CALENDAR] Booking ${booking_id}: end <= start, advanced check-out to ${nextDayStr}`);
  }

  console.log(`📅 [CALENDAR] Booking ${booking_id} → start: ${startDateTimeStr}, end: ${endDateTimeStr}`);

  // Balance still owed on arrival. Prefer the stored value; fall back to the
  // arithmetic when a caller hasn't supplied it.
  const balanceDue =
    remaining_balance != null
      ? Number(remaining_balance)
      : total_amount != null && down_payment != null
      ? Number(total_amount) - Number(down_payment)
      : null;
  // A stored 0 means the deposit hasn't been collected/recorded yet — NOT that
  // none is owed. Reading it literally would print "collect ₱0.00", so only a
  // positive recorded amount overrides the tiered default for this stay's
  // length (securityDepositFor()).
  const nights = Math.round((new Date(outDateOnly).getTime() - new Date(inDateOnly).getTime()) / 86_400_000);
  const depositDue =
    security_deposit != null && Number(security_deposit) > 0
      ? Number(security_deposit)
      : securityDepositFor(nights);

  // Everyone beyond the main guest. The event previously showed only a count,
  // so a host checking IDs at the door had no names to check them against.
  const extraGuests = (additional_guest_names ?? []).filter((n) => n && n.trim());

  const descriptionLines = [
    "===== BOOKING INFORMATION =====",
    `Booking ID: ${booking_id}`,
    `Status: ${status.toUpperCase()}`,
    "",
    "===== GUEST DETAILS =====",
    `Guest: ${guest_first_name} ${guest_last_name}`,
    `Email: ${guest_email}`,
    `Phone: ${guest_phone}`,
    `Guests: ${adults || 0} Adult(s), ${children || 0} Young Adult(s), ${infants || 0} Child(ren)`,
    ...(extraGuests.length
      ? ["Also staying:", ...extraGuests.map((n, i) => `  ${i + 2}. ${n}`)]
      : []),
    "",
    "===== ACCOMMODATION =====",
    `Room: ${room_name}`,
    stay_type ? `Stay Type: ${stay_type}` : "",
    `Check-in:  ${inDateOnly} at ${inTime}`,
    `Check-out: ${outDateOnly} at ${outTime}`,
    "",
    "===== PAYMENT INFORMATION =====",
    `Total Amount: ₱${total_amount != null ? Number(total_amount).toFixed(2) : "N/A"}`,
    `Down Payment (paid): ₱${down_payment != null ? Number(down_payment).toFixed(2) : "N/A"}`,
    // The two amounts the host has to collect in person. Previously absent, which
    // left them doing arithmetic at the door — and the deposit is the easiest
    // thing in the whole booking to forget.
    `BALANCE DUE AT CHECK-IN: ₱${balanceDue != null ? balanceDue.toFixed(2) : "N/A"}`,
    `SECURITY DEPOSIT AT CHECK-IN: ₱${depositDue.toFixed(2)} (refundable)`,
    `→ Collect on arrival: ₱${balanceDue != null ? (balanceDue + depositDue).toFixed(2) : "N/A"}`,
    `Payment Method: ${payment_method || "Not specified"}`,
    payment_proof_url ? `Payment Proof: ${payment_proof_url}` : "Payment Proof: Pending",
  ];

  const description = descriptionLines.filter((line) => line !== "").join("\n");

  // Google Calendar colorId reference:
  // "2"=Sage(green) "5"=Banana(yellow) "6"=Tangerine(orange) "7"=Peacock(blue)
  // "9"=Basil(dark green) "10"=Tomato(red) "11"=Graphite(gray)
  const colorIdMap: Record<string, string> = {
    pending:      "5",  // Banana   — yellow
    approved:     "2",  // Sage     — green
    confirmed:    "2",  // Sage     — green
    "checked-in": "7",  // Peacock  — blue
    "checked-out":"1",  // Lavender — indigo
    completed:    "9",  // Basil    — dark green
    rejected:     "10", // Tomato   — red
    cancelled:    "6",  // Tangerine — orange
  };
  const colorId = colorIdMap[status?.toLowerCase()] ?? "11"; // Graphite fallback

  return {
    summary: `Booking: ${room_name} - ${guest_first_name} ${guest_last_name}`,
    description,
    start: { dateTime: startDateTimeStr, timeZone: "Asia/Manila" },
    end: { dateTime: endDateTimeStr, timeZone: "Asia/Manila" },
    colorId,
  };
};

const buildAndInsertCalendarEvent = async (bookingData: CalendarEventData): Promise<{ id: string; htmlLink: string | null; calendarId: string }> => {
  const { calendar, calendarId } = getCalendarClient();
  const event = buildEventBody(bookingData);

  const response = await calendar.events.insert({ calendarId, requestBody: event });

  if (!response.data.id) throw new Error("Google API returned no event ID.");
  console.log(`✅ [CALENDAR] Event created on calendar "${calendarId}". ID: ${response.data.id}, Link: ${response.data.htmlLink}`);
  return { id: response.data.id, htmlLink: response.data.htmlLink ?? null, calendarId };
};

// Describes the SHAPE of the configured private key without ever revealing it.
// A decoder failure is otherwise undiagnosable from logs: the key is a secret,
// so it can't be printed, and OpenSSL's message names no cause. These few facts
// distinguish "backslashes were stripped" from "the paste was truncated" from
// "the variable never reached this environment".
const describeKeyShape = (): string => {
  const raw = process.env.GOOGLE_PRIVATE_KEY_CALENDAR;
  if (!raw) return "GOOGLE_PRIVATE_KEY_CALENDAR is NOT SET in this environment";
  const parts = [
    `${raw.length} chars`,
    raw.includes("-----BEGIN") ? "has BEGIN header" : "NO BEGIN header",
    raw.includes("-----END") ? "has END footer" : "NO END footer",
    raw.includes("\\n") ? String.raw`contains literal \n` : String.raw`no literal \n`,
    raw.includes("\n") ? "contains real newlines" : "no real newlines",
  ];
  // A healthy 2048-bit PKCS#8 key is ~1,700 chars with escapes.
  if (raw.length < 1500) parts.push("SUSPICIOUSLY SHORT — likely truncated");
  if (!raw.includes("\\n") && !raw.includes("\n") && raw.includes("-----BEGIN")) {
    parts.push("NO line separators at all — backslashes were probably stripped");
  }
  return parts.join(", ");
};

/** Classifies a raw Google/network error into a human-readable message. */
const classifyCalendarError = (error: any): string => {
  // OpenSSL rejected the key before any network call happened.
  if (String(error?.message || "").includes("DECODER routines")) {
    return `Private key could not be parsed. Key shape: [${describeKeyShape()}]. ` +
      `Fix: set GOOGLE_PRIVATE_KEY_CALENDAR to the base64 of the whole PEM (no quotes, no newlines).`;
  }
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    return `Network error (${error.code}): Cannot reach Google APIs — ${error.message}`;
  }
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    const detail = JSON.stringify(error.response?.data ?? {});
    return `Auth failed (HTTP ${status}): Invalid or expired credentials. Check GOOGLE_CLIENT_EMAIL_CALENDAR, GOOGLE_PRIVATE_KEY_CALENDAR, GOOGLE_CALENDAR_ID. Detail: ${detail}`;
  }
  if (status === 404) {
    return `Calendar not found (HTTP 404): GOOGLE_CALENDAR_ID="${process.env.GOOGLE_CALENDAR_ID}" may be wrong or the service account has no access.`;
  }
  if (status) {
    return `Google API error (HTTP ${status}): ${JSON.stringify(error.response?.data ?? {})}`;
  }
  return error.message || String(error);
};

/**
 * Creates a Google Calendar event. Returns the event ID on success, null on failure.
 * Used by the booking creation flow — never blocks the booking if calendar fails.
 */
export const createCalendarEvent = async (bookingData: CalendarEventData): Promise<string | null> => {
  console.log(`📅 [CALENDAR] Starting calendar event creation for booking: ${bookingData.booking_id}`);
  try {
    const { id } = await buildAndInsertCalendarEvent(bookingData);
    return id;
  } catch (error: any) {
    const msg = classifyCalendarError(error);
    console.error(`❌ [CALENDAR] Failed for booking ${bookingData.booking_id}: ${msg}`);
    return null;
  }
};

/**
 * Rewrites an existing event in place so it matches the booking as it stands
 * now. Without this the event is frozen at whatever the booking looked like the
 * moment it was created — every approved booking kept saying "PENDING" in
 * yellow, and a re-timed or re-priced stay showed the old figures to whoever
 * was collecting money at the door.
 *
 * `gone: true` means Google no longer has the event (deleted from the calendar
 * by hand, or the id is stale). The caller should clear the stored
 * google_event_id so /api/bookings/sync-calendar can recreate it — retrying the
 * update forever would never succeed.
 */
export const updateCalendarEvent = async (
  eventId: string,
  bookingData: CalendarEventData,
): Promise<{ ok: boolean; gone: boolean; error: string | null }> => {
  try {
    const { calendar, calendarId } = getCalendarClient();
    const event = buildEventBody(bookingData);
    await calendar.events.update({ calendarId, eventId, requestBody: event });
    console.log(`✅ [CALENDAR] Event ${eventId} updated for booking ${bookingData.booking_id}`);
    return { ok: true, gone: false, error: null };
  } catch (error: any) {
    const status = error?.response?.status;
    // 404 = no such event, 410 = event was deleted. Both are permanent.
    const gone = status === 404 || status === 410;
    const msg = classifyCalendarError(error);
    console.error(`❌ [CALENDAR] Update failed for booking ${bookingData.booking_id} (event ${eventId}): ${msg}`);
    return { ok: false, gone, error: msg };
  }
};

/**
 * Like createCalendarEvent but returns { id, htmlLink, calendarId, error } so callers can surface details.
 * Used by the calendar sync endpoint.
 */
export const createCalendarEventWithResult = async (
  bookingData: CalendarEventData,
): Promise<{ id: string | null; htmlLink: string | null; calendarId: string | null; error: string | null }> => {
  try {
    const { id, htmlLink, calendarId } = await buildAndInsertCalendarEvent(bookingData);
    return { id, htmlLink, calendarId, error: null };
  } catch (error: any) {
    const msg = classifyCalendarError(error);
    console.error(`❌ [CALENDAR] Failed for booking ${bookingData.booking_id}: ${msg}`);
    return { id: null, htmlLink: null, calendarId: null, error: msg };
  }
};
