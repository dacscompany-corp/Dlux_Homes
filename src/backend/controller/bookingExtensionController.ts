import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";
import { EXISTING_END_SQL, EXISTING_START_SQL, occupyingBookingSql, stayTypeCodeFor } from "@/lib/bookingWindow";
import { turnoverSql } from "@/lib/turnover";
import { slotBlockOverlapSql } from "@/lib/blockedSlots";
import { loadActiveSeasons, loadCalendarRules } from "@/lib/availability";
import { havenToRoom } from "@/lib/haven-adapter";
import { addDaysISO } from "@/lib/pricing";
import { EXTENDABLE_STATUSES, MAX_EXTENSION_NIGHTS, nightsBetweenISO, quoteExtension, type ExtensionQuote } from "@/lib/bookingExtension";
import { pushCalendarUpdate } from "./bookingController";
import { syncCleaningSchedule } from "./cleanersController";
import { createNotificationForUser, createNotificationsForRoles } from "../utils/notificationHelper";
import { logActivity } from "../utils/activityLogger";
import { sendExtensionEmail } from "../utils/extensionEmail";

// Extend Booking — admin only (owner spec, 2026-10-31). Owner/CSR pick a new
// checkout for a confirmed or current stay; the system checks the unit is free
// for the added nights, suggests a price with the Haven Management rules, and
// on confirm:
//   - moves the booking's checkout,
//   - records the extension as its own row (booking_extensions), linked to the
//     booking, with the old/new checkout, nights, suggested and charged amount
//     and who did it,
//   - adds the charge to booking_payments.total_amount and remaining_balance —
//     amount_paid is untouched, so the original payment history stays as it
//     was and the extension shows as money owed,
//   - moves the Google Calendar event and the cleaning to the new checkout and
//     tells the assigned cleaner, and emails the guest.
// No second security deposit is charged. Paying the extension is its own step
// (markExtensionPaid), so the check-in Collect flow can't take the deposit again.
//
// Routes: GET/POST /api/admin/bookings/[id]/extend,
//         GET /api/admin/booking-extensions, PATCH /api/admin/booking-extensions/[id]

type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

type BookingRow = {
  id: string;
  booking_id: string;
  status: string;
  room_name: string;
  adults: number;
  children: number;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
};

type PaymentRow = { id: string; total_amount: number; amount_paid: number; remaining_balance: number; payment_status: string };

const EXCLUSION_VIOLATION = "23P01";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });
const MANILA_TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const prettyTime = (t: string) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};

async function loadBooking(db: Db, idOrRef: string, lock = false): Promise<BookingRow | null> {
  const r = await db.query(
    `SELECT b.id::text AS id, b.booking_id, b.status, b.room_name,
            COALESCE(b.adults, 1)::int AS adults, COALESCE(b.children, 0)::int AS children,
            b.check_in_date::text AS check_in_date, b.check_out_date::text AS check_out_date,
            b.check_in_time::text AS check_in_time, b.check_out_time::text AS check_out_time
       FROM booking b
      WHERE b.id::text = $1 OR b.booking_id = $1
      LIMIT 1
      ${lock ? "FOR UPDATE" : ""}`,
    [idOrRef],
  );
  return (r.rows[0] as BookingRow | undefined) ?? null;
}

async function loadPayment(db: Db, bookingUuid: string, lock = false): Promise<PaymentRow | null> {
  const r = await db.query(
    `SELECT id::text AS id, total_amount::float AS total_amount, COALESCE(amount_paid, 0)::float AS amount_paid,
            remaining_balance::float AS remaining_balance, payment_status
       FROM booking_payments WHERE booking_id = $1::uuid
      ORDER BY created_at ASC LIMIT 1
      ${lock ? "FOR UPDATE" : ""}`,
    [bookingUuid],
  );
  return (r.rows[0] as PaymentRow | undefined) ?? null;
}

/** Can this booking be extended at all? A reason when it can't. */
function notExtendable(b: BookingRow, pay: PaymentRow | null): string | null {
  if (!(EXTENDABLE_STATUSES as readonly string[]).includes(b.status)) {
    return "Only a confirmed booking, or a guest who is staying now, can be extended.";
  }
  // "approved" without an approved down payment is still waiting for the guest to pay.
  if (b.status === "approved" && !String(pay?.payment_status ?? "").startsWith("approved")) {
    return "This booking is still waiting for its down payment. Confirm the payment first, then extend it.";
  }
  if (stayTypeCodeFor(b.check_in_date, b.check_out_date, b.check_in_time, b.check_out_time) === "10") {
    return "A Daycation or Nightcation is a single session and can't be extended by nights. Make a new booking instead.";
  }
  if (!pay) return "This booking has no payment record, so the extension can't be added to its bill.";
  return null;
}

/** The first booking or block in the way of the added nights, if any. */
async function findConflict(db: Db, b: BookingRow, newOut: string, havenId: string | null): Promise<string | null> {
  // $1–$5 describe the stay; each query adds only what it needs after them.
  const stay = [b.check_in_date, b.check_in_time, b.check_out_date, b.check_out_time, newOut];
  // n.fs = the stay's start, n.ns = the old checkout (the added time starts
  // there), n.ne = the new checkout. Same overlap + turnover test as createBooking.
  const window = `WITH n AS (
      SELECT ($1::date + $2::time)::timestamp AS fs,
             ($3::date + $4::time)::timestamp AS ns,
             (CASE WHEN $4::time = '00:00'::time THEN ($5::date + INTERVAL '1 day')::timestamp
                   ELSE ($5::date + $4::time)::timestamp END) AS ne
    )`;
  const booked = await db.query(
    `${window}
     SELECT b.booking_id, b.check_in_date::text AS check_in_date, b.check_in_time::text AS check_in_time
       FROM booking b, n
      WHERE b.room_name = $6 AND b.id::text <> $7
        AND ${occupyingBookingSql("b")}
        AND ${EXISTING_START_SQL} < n.ne + ${turnoverSql("n.fs", "n.ne")}
        AND (${EXISTING_END_SQL} + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}) > n.ns
      ORDER BY b.check_in_date ASC LIMIT 1`,
    [...stay, b.room_name, b.id],
  );
  const hit = booked.rows[0];
  if (hit) {
    return `The unit is booked by ${hit.booking_id} from ${prettyDate(String(hit.check_in_date))}${hit.check_in_time ? `, ${prettyTime(String(hit.check_in_time))}` : ""}. Pick an earlier checkout.`;
  }
  if (havenId) {
    const blocked = await db.query(
      `${window}
       SELECT bd.from_date::text AS from_date, bd.to_date::text AS to_date, bd.reason
         FROM blocked_dates bd, n
        WHERE bd.haven_id = $6::uuid
          AND ((bd.slots IS NULL AND bd.from_date <= $5::date AND bd.to_date >= $3::date)
               OR ${slotBlockOverlapSql("n.ns", "n.ne")})
        LIMIT 1`,
      [...stay, havenId],
    );
    const bl = blocked.rows[0];
    if (bl) {
      return `The unit is blocked ${prettyDate(String(bl.from_date))}${bl.to_date !== bl.from_date ? ` – ${prettyDate(String(bl.to_date))}` : ""}${bl.reason ? ` (${bl.reason})` : ""}. Pick an earlier checkout or remove the block.`;
    }
  }
  return null;
}

type Checked =
  | { ok: false; status: number; error: string }
  | { ok: true; booking: BookingRow; payment: PaymentRow; newOut: string; addedNights: number; quote: ExtensionQuote | null; havenId: string | null };

/** Everything both the preview and the confirm need to know, or why it can't go ahead. */
async function checkExtension(idOrRef: string, newOutRaw: unknown): Promise<Checked> {
  const booking = await loadBooking(pool as unknown as Db, idOrRef);
  if (!booking) return { ok: false, status: 404, error: "Booking not found." };
  const payment = await loadPayment(pool as unknown as Db, booking.id);
  const why = notExtendable(booking, payment);
  if (why) return { ok: false, status: 409, error: why };

  const newOut = String(newOutRaw ?? "").slice(0, 10);
  if (!ISO.test(newOut)) return { ok: false, status: 400, error: "Pick the new checkout date." };
  const addedNights = nightsBetweenISO(booking.check_out_date, newOut);
  if (!Number.isFinite(addedNights) || addedNights <= 0) {
    return { ok: false, status: 400, error: `The new checkout must be after the current one (${prettyDate(booking.check_out_date)}).` };
  }
  if (addedNights > MAX_EXTENSION_NIGHTS) {
    return { ok: false, status: 400, error: `An extension can add up to ${MAX_EXTENSION_NIGHTS} nights. For longer, make a new booking.` };
  }
  if (newOut < MANILA_TODAY()) return { ok: false, status: 400, error: "That date has already passed." };

  // The haven: rates for the suggestion, and its id for blocked dates.
  const havenRow = await pool
    .query(`SELECT * FROM havens ORDER BY (haven_name = $1) DESC, created_at ASC LIMIT 1`, [booking.room_name])
    .then((r) => r.rows[0] as Record<string, unknown> | undefined)
    .catch(() => undefined);
  const havenId = havenRow?.uuid_id ? String(havenRow.uuid_id) : null;

  const conflict = await findConflict(pool as unknown as Db, booking, newOut, havenId);
  if (conflict) return { ok: false, status: 409, error: conflict };

  let quote: ExtensionQuote | null = null;
  if (havenRow) {
    try {
      const [rules, seasons, seniors] = await Promise.all([
        loadCalendarRules(pool),
        loadActiveSeasons(pool, { fromISO: booking.check_in_date, toISO: addDaysISO(newOut, -1) }),
        pool
          .query(`SELECT COUNT(*)::int AS n FROM booking_guests WHERE booking_id = $1::uuid AND is_senior_pwd = TRUE`, [booking.id])
          .then((r) => Number(r.rows[0]?.n ?? 0))
          .catch(() => 0),
      ]);
      quote = quoteExtension(
        {
          stayType: "21",
          checkInISO: booking.check_in_date,
          rates: havenToRoom(havenRow) as Parameters<typeof quoteExtension>[0]["rates"],
          rules,
          seasons,
          feePax: (Number(booking.adults) || 0) + (Number(booking.children) || 0),
          seniorCount: seniors,
        },
        nightsBetweenISO(booking.check_in_date, booking.check_out_date),
        addedNights,
      );
    } catch (err) {
      console.error("extension quote failed:", err);
    }
  }
  return { ok: true, booking, payment: payment!, newOut, addedNights, quote, havenId };
}

/** GET — check the new checkout and suggest a price, without changing anything. */
export async function previewExtension(idOrRef: string, newOut: unknown): Promise<NextResponse> {
  try {
    const c = await checkExtension(idOrRef, newOut);
    if (!c.ok) return fail(c.error, c.status);
    return NextResponse.json({
      success: true,
      data: {
        bookingId: c.booking.booking_id,
        checkInDate: c.booking.check_in_date,
        oldCheckOutDate: c.booking.check_out_date,
        newCheckOutDate: c.newOut,
        checkOutTime: c.booking.check_out_time,
        addedNights: c.addedNights,
        suggested: c.quote?.suggested ?? 0,
        priced: !!c.quote,
        nights: (c.quote?.addedNightPrices ?? []).map((n) => ({ date: n.date, rate: n.rate, season: n.season?.name ?? null, longTerm: n.longTerm })),
        paxFeeAdded: c.quote?.paxFeeAdded ?? 0,
        longTermNow: c.quote?.longTermNow ?? false,
        currentTotal: c.payment.total_amount,
        amountPaid: c.payment.amount_paid,
        currentBalance: c.payment.remaining_balance,
      },
    });
  } catch (err) {
    console.error("previewExtension failed:", err);
    return fail("Could not check this extension. Please try again.", 500);
  }
}

/** POST — confirm the extension. Body: { new_check_out, charge, note? } */
export async function applyExtension(
  idOrRef: string,
  body: { new_check_out?: unknown; charge?: unknown; note?: unknown },
  actor: { id: string | null; name: string },
  req?: NextRequest,
): Promise<NextResponse> {
  const charge = Math.round(Number(body.charge) * 100) / 100;
  if (!Number.isFinite(charge) || charge < 0) return fail("Set the extension price (0 or more).");
  if (charge > 1_000_000) return fail("That price looks too high — please check it.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  let c: Checked;
  try {
    c = await checkExtension(idOrRef, body.new_check_out);
  } catch (err) {
    console.error("applyExtension check failed:", err);
    return fail("Could not check this extension. Please try again.", 500);
  }
  if (!c.ok) return fail(c.error, c.status);
  const { booking, newOut, addedNights } = c;

  const client = await pool.connect();
  let extensionId = "";
  let payment: PaymentRow | null = null;
  try {
    await client.query("BEGIN");
    // Re-read under lock: someone may have changed the booking since the check.
    const locked = await loadBooking(client as unknown as Db, booking.id, true);
    if (!locked || locked.check_out_date !== booking.check_out_date || locked.status !== booking.status) {
      await client.query("ROLLBACK");
      return fail("This booking just changed. Close this and open it again.", 409);
    }
    const conflict = await findConflict(client as unknown as Db, locked, newOut, c.havenId);
    if (conflict) {
      await client.query("ROLLBACK");
      return fail(conflict, 409);
    }

    await client.query(`UPDATE booking SET check_out_date = $2::date, updated_at = NOW() WHERE id = $1::uuid`, [booking.id, newOut]);

    // Owed, not paid: total and balance go up together, amount_paid stays.
    // A fully paid booking goes back to "down payment approved" until the
    // extension is paid — so it isn't counted as revenue before it's received.
    const pay = await client.query(
      `UPDATE booking_payments
          SET total_amount = total_amount + $2::numeric,
              remaining_balance = remaining_balance + $2::numeric,
              payment_status = CASE WHEN $2::numeric > 0 AND payment_status = 'approved_full_payment'
                                    THEN 'approved_down_payment' ELSE payment_status END
        WHERE id = $1::uuid
        RETURNING id::text AS id, total_amount::float AS total_amount, COALESCE(amount_paid, 0)::float AS amount_paid,
                  remaining_balance::float AS remaining_balance, payment_status`,
      [c.payment.id, charge],
    );
    payment = (pay.rows[0] as PaymentRow | undefined) ?? null;

    const ext = await client.query(
      `INSERT INTO booking_extensions
         (booking_id, old_check_out_date, new_check_out_date, check_out_time, added_nights,
          suggested_amount, charge_amount, note, status, created_by)
       VALUES ($1::uuid, $2::date, $3::date, $4::time, $5, $6, $7, NULLIF($8, ''), $9, $10::uuid)
       RETURNING id::text AS id`,
      [booking.id, booking.check_out_date, newOut, booking.check_out_time || null, addedNights,
        c.quote?.suggested ?? 0, charge, note, charge > 0 ? "unpaid" : "paid", actor.id],
    );
    extensionId = String(ext.rows[0].id);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string })?.code === EXCLUSION_VIOLATION) {
      return fail("Those nights are no longer free — another booking holds them.", 409);
    }
    if ((err as { code?: string })?.code === "42P01") {
      return fail("Extend Booking isn't set up in the database yet. Run the 2026-10-31-booking-extensions migration.", 500);
    }
    console.error("applyExtension failed:", err);
    return fail("Could not save the extension. Nothing was changed.", 500);
  } finally {
    client.release();
  }

  // ── After the commit: everything that follows the new checkout ────────────
  const outLabel = `${prettyDate(newOut)}${booking.check_out_time ? `, ${prettyTime(booking.check_out_time)}` : ""}`;
  await pushCalendarUpdate(booking.id);
  await syncCleaningSchedule(booking.id);
  // Reminders fire again for the new checkout, and the cleaner is told.
  try {
    const task = await pool.query(
      `UPDATE booking_cleaning
          SET reminder_upcoming_sent_at = NULL, reminder_start_sent_at = NULL
        WHERE booking_id = $1::uuid AND cleaning_status IN ('pending', 'assigned')
        RETURNING assigned_to::text AS assigned_to`,
      [booking.id],
    );
    const cleaner = task.rows[0]?.assigned_to;
    if (cleaner) {
      await createNotificationForUser(String(cleaner), {
        title: "Checkout moved — stay extended",
        message: `${booking.room_name} (Booking: ${booking.booking_id}) was extended by ${addedNights} ${addedNights === 1 ? "night" : "nights"}. The guest now checks out ${outLabel} — your cleaning moves to after that.`,
        notificationType: "cleaning_rescheduled",
      });
    }
  } catch (err) {
    console.error("extension cleaning follow-up failed:", err);
  }
  await createNotificationsForRoles(["Owner", "CSR"], {
    title: "Stay extended",
    message: `${actor.name} extended ${booking.booking_id} by ${addedNights} ${addedNights === 1 ? "night" : "nights"} to ${outLabel}. Extension charge ₱${charge.toLocaleString("en-PH")}.`,
    notificationType: "booking_extended",
  }).catch((err) => console.error("extension notify failed:", err));
  if (actor.id) {
    await logActivity({
      employeeId: actor.id,
      activityType: "EXTEND_BOOKING",
      description: `Extended ${booking.booking_id}: checkout ${booking.check_out_date} → ${newOut} (+${addedNights} nights), charge ₱${charge} (suggested ₱${c.quote?.suggested ?? 0})${note ? ` — ${note}` : ""}`,
      entityType: "booking",
      entityId: booking.id,
      request: req,
    });
  }

  const guest = await pool
    .query(
      `SELECT first_name, last_name, email FROM booking_guests WHERE booking_id = $1::uuid ORDER BY guest_index ASC NULLS LAST LIMIT 1`,
      [booking.id],
    )
    .then((r) => r.rows[0] as { first_name?: string; last_name?: string; email?: string } | undefined)
    .catch(() => undefined);
  const emailStatus = await sendExtensionEmail({
    email: guest?.email ?? "",
    firstName: guest?.first_name,
    lastName: guest?.last_name,
    bookingId: booking.booking_id,
    roomName: booking.room_name,
    checkInDate: booking.check_in_date,
    oldCheckOutDate: booking.check_out_date,
    newCheckOutDate: newOut,
    checkOutTime: booking.check_out_time,
    addedNights,
    charge,
    balanceDue: payment?.remaining_balance ?? charge,
  });

  return NextResponse.json({
    success: true,
    data: { extensionId, newCheckOutDate: newOut, addedNights, charge, payment },
    emailStatus,
  });
}

/** GET — extension history. One booking's, or every booking's (newest first). */
export async function listExtensions(bookingIdOrRef: string | null): Promise<NextResponse> {
  try {
    const r = await pool.query(
      `SELECT x.id::text AS id, x.booking_id::text AS booking_uuid, b.booking_id AS booking_ref,
              x.old_check_out_date::text AS old_check_out_date, x.new_check_out_date::text AS new_check_out_date,
              x.check_out_time::text AS check_out_time, x.added_nights,
              x.suggested_amount::float AS suggested_amount, x.charge_amount::float AS charge_amount,
              x.note, x.status, x.payment_method, x.paid_at, x.created_at,
              TRIM(COALESCE(ec.first_name, '') || ' ' || COALESCE(ec.last_name, '')) AS created_by_name,
              TRIM(COALESCE(ep.first_name, '') || ' ' || COALESCE(ep.last_name, '')) AS paid_by_name
         FROM booking_extensions x
         JOIN booking b ON b.id = x.booking_id
         LEFT JOIN employees ec ON ec.id = x.created_by
         LEFT JOIN employees ep ON ep.id = x.paid_by
        WHERE ($1::text IS NULL OR b.id::text = $1 OR b.booking_id = $1)
        ORDER BY x.created_at DESC
        LIMIT 500`,
      [bookingIdOrRef],
    );
    return NextResponse.json({ success: true, data: r.rows });
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return NextResponse.json({ success: true, data: [], setupNeeded: true });
    console.error("listExtensions failed:", err);
    return fail("Could not load extensions", 500);
  }
}

/** PATCH — record that the guest paid an extension. Body: { method? } */
export async function markExtensionPaid(
  extensionId: string,
  body: { method?: unknown },
  actor: { id: string | null },
  req?: NextRequest,
): Promise<NextResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(extensionId)) return fail("Unknown extension", 404);
  const method = typeof body.method === "string" && body.method.trim() ? body.method.trim().slice(0, 50) : "Cash";
  const client = await pool.connect();
  let ref = "";
  let amount = 0;
  try {
    await client.query("BEGIN");
    const x = await client.query(
      `SELECT x.booking_id::text AS booking_uuid, x.charge_amount::float AS charge, x.status, b.booking_id AS ref
         FROM booking_extensions x JOIN booking b ON b.id = x.booking_id
        WHERE x.id = $1::uuid FOR UPDATE OF x`,
      [extensionId],
    );
    const ext = x.rows[0];
    if (!ext) { await client.query("ROLLBACK"); return fail("Unknown extension", 404); }
    if (ext.status === "paid") { await client.query("ROLLBACK"); return fail("This extension is already paid.", 409); }
    ref = String(ext.ref);
    amount = Number(ext.charge);
    // Only the extension's amount — no security deposit is taken here.
    await client.query(
      `UPDATE booking_payments
          SET amount_paid = LEAST(total_amount, COALESCE(amount_paid, 0) + $2::numeric),
              remaining_balance = total_amount - LEAST(total_amount, COALESCE(amount_paid, 0) + $2::numeric),
              payment_status = CASE WHEN COALESCE(amount_paid, 0) + $2::numeric >= total_amount
                                    THEN 'approved_full_payment' ELSE payment_status END,
              reviewed_at = NOW(),
              reviewed_by = COALESCE($3::uuid, reviewed_by)
        WHERE id = (SELECT id FROM booking_payments WHERE booking_id = $1::uuid ORDER BY created_at ASC LIMIT 1)`,
      [ext.booking_uuid, amount, actor.id],
    );
    await client.query(
      `UPDATE booking_extensions SET status = 'paid', paid_at = NOW(), paid_by = $2::uuid, payment_method = $3 WHERE id = $1::uuid`,
      [extensionId, actor.id, method],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("markExtensionPaid failed:", err);
    return fail("Could not record the payment. Nothing was changed.", 500);
  } finally {
    client.release();
  }
  if (actor.id) {
    await logActivity({
      employeeId: actor.id,
      activityType: "EXTENSION_PAID",
      description: `Recorded ₱${amount} ${method} payment for the extension on ${ref}`,
      entityType: "booking",
      entityId: extensionId,
      request: req,
    });
  }
  return NextResponse.json({ success: true });
}
