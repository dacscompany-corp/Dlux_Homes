import { NextRequest, NextResponse, after } from "next/server";
import type { PoolClient } from "pg";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "../config/db";
import { upload_file } from "../utils/cloudinary";
import { validateImageDataUrl } from "../utils/imageGuard";
import {
  validateDiscount,
  promotionAlreadyRedeemed,
  resolvePromoIdentity,
  promoRedemptionEmail,
  ALREADY_REDEEMED_ERROR,
} from "../utils/validateDiscount";
import { normalizeEmail } from "@/lib/normalize-email";
import { promoDiscountOn, promoCoversStay } from "@/lib/promo-offer";
import type { ActivePromotion } from "@/redux/api/promotionsApi";
import { createCalendarEvent, createCalendarEventWithResult, updateCalendarEvent, CalendarEventData } from "../utils/googleCalendar";
import { turnoverSql, TURNOVER_BLURB } from "@/lib/turnover";
import { occupyingBookingSql, EXISTING_START_SQL, EXISTING_END_SQL, stayTypeCodeFor } from "@/lib/bookingWindow";
import { securityDepositFor, quoteStay, promoBlockingSeason, seasonFor, addDaysISO } from "@/lib/pricing";
import { checkClaimedPrice } from "@/lib/priceCheck";
import { loadCalendarRules, loadActiveSeasons } from "@/lib/availability";
import { havenToRoom } from "@/lib/haven-adapter";
import { dispatchTransactionalEmail, type EmailDispatchResult } from "../utils/dispatchEmail";

// EXISTING_START_SQL / EXISTING_END_SQL now live in @/lib/bookingWindow beside
// occupyingBookingSql(), so the Messenger availability module shares the exact
// same strings rather than a copy that could drift from this query.

// haven_id is queried against UUID columns (blocked_dates.haven_id,
// havens.uuid_id) — a non-UUID value (e.g. a mock/demo room id like "mock-1"
// or "1") 500s instead of erroring gracefully. Treat it the same as a missing
// haven_id rather than let it reach Postgres.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starting password for auto-created guest accounts. Guests can change it any
// time via /forgot-password (src/app/api/auth/reset-password) — it is only ever
// a starting point, never re-applied to an existing account.
//
// Read from the environment, with NO literal fallback in this file: the value
// that used to be hard-coded here is in this repo's git history for good, so
// keeping any real password in source would just publish the next one too.
// Set GUEST_DEFAULT_PASSWORD in .env and in the Vercel project, and set it to
// something OTHER than the old value — hiding a string that is already public
// protects nothing.
//
// Be clear about what this does and does not buy: the password is emailed to
// every guest in cleartext, so it is disclosed by design and an attacker needs
// a guest's email address, not this repo. Moving it out of source keeps it off
// GitHub; it does not make it secret.
const GUEST_DEFAULT_PASSWORD = process.env.GUEST_DEFAULT_PASSWORD?.trim() || null;

/**
 * The password to set on an account being created now.
 *
 * With GUEST_DEFAULT_PASSWORD configured, every new guest account starts on
 * that shared value — the owner's choice, so support can read it out over
 * Messenger.
 *
 * With it unset, each guest gets their own random password instead of the
 * process falling back to a guessable constant. Nothing about the guest's
 * experience changes (it is emailed to them either way); the owner just loses
 * the ability to recite it. That is the right way round for a missing setting:
 * a forgotten env var should not silently hand every account one password.
 */
function newGuestPassword(): string {
  if (GUEST_DEFAULT_PASSWORD) return GUEST_DEFAULT_PASSWORD;
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  const generated = Buffer.from(bytes).toString("base64url");
  console.warn(
    "⚠️ GUEST_DEFAULT_PASSWORD is not set — issuing this guest a random password. " +
      "It is in their confirmation email, but you will not be able to tell them what it is.",
  );
  return generated;
}

/**
 * A guest who checks out without signing in still typed an email into "How
 * can we reach you?" — this turns that into a real account so the same
 * person can track this (and future) bookings by signing in, without forcing
 * them through registration first.
 *
 * - No account for that email yet: create one (bcrypt-hashed newGuestPassword(),
 *   role "Guest") and report it as newly created so the confirmation email can
 *   surface the starting password.
 * - An account already exists: link to it as-is. Its password is NEVER
 *   touched — overwriting it on every guest checkout would let anyone hijack
 *   an existing account just by typing its email at checkout.
 *
 * Runs inside the booking's own transaction so the account only persists if
 * the booking itself commits.
 */
async function resolveOrCreateGuestAccount(
  client: PoolClient,
  email: string,
  name: string,
): Promise<{ userId: string; created: boolean; password: string | null }> {
  // Store the address lowercased. The lookup below is case-insensitive, but
  // `users_email_key` and sign-in (`WHERE LOWER(email) = LOWER($1)` in auth.ts)
  // are keyed on the stored value — so an address saved as "Maria@Gmail.com"
  // used to create an account the guest could never sign in to by typing
  // "maria@gmail.com". Normalizing on write makes one address mean one account.
  //
  // Same normalizer the promo identity uses, so the address an account is
  // created from is the address that already burned the guest's promo codes.
  const normalizedEmail = normalizeEmail(email) ?? email.trim().toLowerCase();

  const existing = await client.query(
    `SELECT user_id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizedEmail],
  );
  if (existing.rows.length > 0) {
    // Reusing an account nobody proved they own. Usually the same person
    // booking again — but a mistyped address silently attaches this booking
    // (guest names, phone, uploaded IDs) to a stranger's My Bookings, and the
    // real booker never sees it. Nothing here can tell those two apart, so say
    // so in the log: it is the only trace if a guest ever reports it.
    console.warn(
      `⚠️ [BOOKING] ${normalizedEmail} already has an account — attaching this booking to it. ` +
        `If the guest mistyped their email, the booking now belongs to the address's owner.`,
    );
    return { userId: existing.rows[0].user_id, created: false, password: null };
  }

  // The plaintext is returned to the caller so the confirmation email can show
  // it. It is generated here, once, and never read back out of the database —
  // the stored copy is a bcrypt hash and cannot be reversed.
  const password = newGuestPassword();
  const hashedPassword = await bcrypt.hash(password, 10);
  // ON CONFLICT closes the check-then-act race between the SELECT above and
  // this INSERT: two first-time bookings on one address both saw no account,
  // both inserted, and the loser's unique violation (23505) surfaced to the
  // guest as "this booking looks like it was already submitted" — a message
  // about the wrong thing entirely. The loser now re-reads the winner's row.
  const inserted = await client.query(
    `INSERT INTO users (email, password, name, user_role, last_login)
     VALUES ($1, $2, $3, 'Guest', CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO NOTHING
     RETURNING user_id`,
    [normalizedEmail, hashedPassword, name],
  );
  if (inserted.rows.length > 0) {
    return { userId: inserted.rows[0].user_id, created: true, password };
  }

  const raced = await client.query(
    `SELECT user_id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizedEmail],
  );
  // Lost the race: the winner set its own password, so this caller has none to
  // show. The guest gets the winner's mail.
  return { userId: raced.rows[0].user_id, created: false, password: null };
}

// Run bookkeeping that is allowed to fail without taking the booking with it.
//
// Catching an error is NOT the same as containing it inside a Postgres
// transaction: once any statement fails, the transaction is poisoned and every
// statement after it returns 25P02 ("current transaction is aborted, commands
// ignored until end of transaction block"). A guest lost a booking to exactly
// that — a failed discount-redemption write was swallowed as "best effort", the
// security-deposit insert two lines later died with 25P02, and the guest was
// shown that raw text for an error that had nothing to do with them.
//
// The savepoint is what actually makes a block best-effort: rolling back to it
// clears the failure and leaves the rest of the transaction committable.
async function bestEffort(
  client: PoolClient,
  savepoint: string,
  work: () => Promise<void>,
): Promise<void> {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await work();
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    console.error(`⚠️ [BOOKING] ${savepoint} failed — booking continues without it:`, err);
  }
}

// A guest may attach several ID photos. We persist them in the single
// `valid_id_url` TEXT column as newline-separated Cloudinary URLs — a single
// URL has no newline, so existing single-ID rows keep working unchanged.
const ID_URL_SEP = "\n";

// Resolve a guest's ID image(s) to a stored value. Accepts a base64 array
// (`images`), a single base64 (`single`), and/or already-hosted URL(s)
// (`existingUrl`). Uploads every base64 image and joins all resulting URLs.
async function resolveValidIdUrls(
  images: unknown,
  single: unknown,
  existingUrl?: unknown,
): Promise<string | null> {
  const base64s: string[] = [];
  if (Array.isArray(images)) {
    for (const img of images) if (typeof img === "string" && img.trim()) base64s.push(img);
  } else if (typeof single === "string" && single.trim()) {
    base64s.push(single);
  }

  // Upload IN PARALLEL. These were sequential, so a booking with several ID
  // photos paid one full Cloudinary round trip per image while the guest sat on
  // a spinner — and all of it inside an open DB transaction. Order is preserved
  // because Promise.all resolves positionally.
  const settled = await Promise.all(
    base64s.map(async (b) => {
      // Security: only accept real image files. A non-image (or spoofed) upload
      // is skipped rather than stored.
      const check = validateImageDataUrl(b);
      if (!check.ok) {
        console.warn(`[booking] rejected non-image valid ID upload: ${check.reason}`);
        return null;
      }
      const uploadResult = await upload_file(b, "dlux-homes/valid-ids");
      return uploadResult?.url || null;
    }),
  );
  const urls = settled.filter((u): u is string => !!u);

  if (urls.length === 0 && typeof existingUrl === "string" && existingUrl.trim()) {
    return existingUrl; // keep previously-stored URL(s) when no new uploads
  }
  return urls.length ? urls.join(ID_URL_SEP) : null;
}

// Everything a Google Calendar event needs, for any set of bookings. The caller
// appends its own WHERE clause. Shared by the sync endpoint (which creates
// events) and pushCalendarUpdate() (which rewrites them) so the two can never
// disagree about what the event should say.
const CALENDAR_BOOKING_SELECT = `
  SELECT
    b.id,
    b.booking_id,
    b.google_event_id,
    b.room_name,
    b.check_in_date,
    b.check_out_date,
    b.check_in_time,
    b.check_out_time,
    b.adults,
    b.children,
    b.infants,
    b.status,
    bg.first_name as guest_first_name,
    bg.last_name as guest_last_name,
    bg.email as guest_email,
    bg.phone as guest_phone,
    bp.payment_method,
    bp.payment_proof_url,
    bp.total_amount,
    bp.down_payment,
    bp.remaining_balance,
    -- Subqueries rather than JOINs: a booking can have more than one deposit
    -- or guest row, and a JOIN would multiply the booking into duplicates.
    (SELECT amount FROM booking_security_deposits
      WHERE booking_id = b.id ORDER BY id LIMIT 1) AS security_deposit,
    -- Everyone except the main guest. NOTE: booking_guests.id is a UUID, so
    -- MIN(id) is not available (no min aggregate for uuid) — this repeats the
    -- exact "ORDER BY guest_index, id" expression the main-guest JOIN uses,
    -- so the row excluded here is guaranteed to be the row selected there.
    (SELECT json_agg(TRIM(g.first_name || ' ' || g.last_name) ORDER BY g.guest_index, g.id)
       FROM booking_guests g
      WHERE g.booking_id = b.id
        AND g.id <> (SELECT id FROM booking_guests
                      WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1)
    ) AS additional_guest_names
  FROM booking b
  LEFT JOIN booking_guests bg ON b.id = bg.booking_id
    AND bg.id = (SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1)
  LEFT JOIN booking_payments bp ON b.id = bp.booking_id
`;

/**
 * Nights in a stay, from the dates being booked. The authoritative count for
 * anything that multiplies by stay length — the browser sends a `nights` figure
 * too, but a per-night discount reads this, and a payload-supplied count would
 * be a direct multiplier on what the guest is given.
 *
 * Floors at 1 so a Daycation/Nightcation (a single same-day session, where the
 * two dates match) counts as one unit rather than zero.
 */
function bookedNights(checkInISO?: string | null, checkOutISO?: string | null): number {
  if (!checkInISO || !checkOutISO) return 1;
  const start = new Date(`${String(checkInISO).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(checkOutISO).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

const toCalendarEventData = (row: any): CalendarEventData => ({
  room_name: row.room_name,
  check_in_date: row.check_in_date,
  check_out_date: row.check_out_date,
  check_in_time: row.check_in_time,
  check_out_time: row.check_out_time,
  guest_first_name: row.guest_first_name || "Unknown",
  guest_last_name: row.guest_last_name || "Guest",
  guest_email: row.guest_email || "",
  guest_phone: row.guest_phone || "",
  booking_id: row.booking_id,
  status: row.status,
  payment_method: row.payment_method,
  payment_proof_url: row.payment_proof_url,
  total_amount: row.total_amount,
  down_payment: row.down_payment,
  adults: row.adults,
  children: row.children,
  infants: row.infants,
  remaining_balance: row.remaining_balance,
  security_deposit: row.security_deposit ?? undefined,
  additional_guest_names: row.additional_guest_names ?? undefined,
});

/**
 * Pushes a booking's CURRENT state to its Google Calendar event. Call this
 * after anything that changes what the event shows — status, dates/times,
 * guests, or money. Never throws and never blocks the caller's response: a
 * calendar outage must not fail a booking edit.
 *
 * Bookings with no event yet are left alone — /api/bookings/sync-calendar
 * back-fills those. If Google says the event is gone, google_event_id is
 * cleared so that same sync recreates it.
 */
export const pushCalendarUpdate = async (bookingUuid: string): Promise<void> => {
  try {
    const res = await pool.query(`${CALENDAR_BOOKING_SELECT} WHERE b.id = $1 LIMIT 1`, [bookingUuid]);
    const row = res.rows[0];
    if (!row) return;
    if (!row.google_event_id) {
      console.log(`📅 [CALENDAR] Booking ${row.booking_id} has no event yet — sync-calendar will create it.`);
      return;
    }

    const { ok, gone } = await updateCalendarEvent(row.google_event_id, toCalendarEventData(row));
    if (!ok && gone) {
      await pool.query(
        `UPDATE booking SET google_event_id = NULL, updated_at = NOW() WHERE id = $1`,
        [bookingUuid],
      );
      console.warn(`⚠️ [CALENDAR] Event for ${row.booking_id} no longer exists — cleared google_event_id for re-sync.`);
    }
  } catch (err) {
    console.error(`❌ [CALENDAR] pushCalendarUpdate failed for booking ${bookingUuid}:`, err);
  }
};

// Add-on prices
const ADD_ON_PRICES = {
  poolPass: 100,
  towels: 50,
  bathRobe: 150,
  extraComforter: 100,
  guestKit: 75,
  extraSlippers: 30,
};

export const updateBookingDetails = async (
  req: NextRequest,
): Promise<NextResponse> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const body = await req.json();
    const {
      id,
      room_name,
      check_in_date,
      check_out_date,
      check_in_time,
      check_out_time,
      adults,
      children,
      infants,
      status,
      guest_first_name,
      guest_last_name,
      guest_email,
      guest_phone,
      guest_age,
      guest_gender,
      guest_senior_pwd,
      guest_birthdate,
      facebook_link,
      valid_id,
      valid_ids,
      valid_id_url,
      additional_guests,
      payment_method,
      payment_proof,
      room_rate,
      add_ons_total,
      total_amount,
      down_payment,
      add_ons,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Booking ID is required" },
        { status: 400 },
      );
    }

    const validStatuses = [
      "pending",
      "approved",
      "rejected",
      "confirmed",
      "checked-in",
      "completed",
      "cancelled",
    ];
    if (typeof status !== "undefined" && status !== null) {
      if (typeof status !== "string" || !validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: "Invalid status" },
          { status: 400 },
        );
      }
    }

    await client.query(
      `
        UPDATE booking
        SET room_name = $1,
            check_in_date = $2,
            check_out_date = $3,
            check_in_time = $4,
            check_out_time = $5,
            adults = $6,
            children = $7,
            infants = $8,
            status = COALESCE($9, status),
            updated_at = NOW()
        WHERE id = $10
      `,
      [
        room_name,
        check_in_date,
        check_out_date,
        check_in_time,
        check_out_time,
        adults,
        children,
        infants,
        status ?? null,
        id,
      ],
    );

    const mainValidIdUrl = await resolveValidIdUrls(valid_ids, valid_id, valid_id_url);

    const allGuests: any[] = [];
    allGuests.push({
      firstName: guest_first_name,
      lastName: guest_last_name,
      age: guest_age ?? null,
      gender: guest_gender ?? null,
      email: guest_email,
      phone: guest_phone,
      facebook_link: facebook_link || null,
      validId: null,
      valid_id_url: mainValidIdUrl,
      senior_pwd: guest_senior_pwd === true,
      birthdate: guest_birthdate || null,
    });
    if (Array.isArray(additional_guests)) {
      for (const g of additional_guests) {
        const guestIdUrl = await resolveValidIdUrls(g?.validIds, g?.validId, g?.valid_id_url);
        allGuests.push({
          firstName: g?.firstName,
          lastName: g?.lastName,
          age: (g?.age != null && g.age !== '' && Number(g.age) > 0) ? Number(g.age) : null,
          gender: g?.gender ?? null,
          email: g?.email || guest_email,
          phone: g?.phone || guest_phone,
          facebook_link: null,
          validId: null,
          valid_id_url: guestIdUrl,
          senior_pwd: g?.seniorPwd === true,
          birthdate: g?.birthdate || null,
        });
      }
    }

    await client.query(`DELETE FROM booking_guests WHERE booking_id = $1`, [
      id,
    ]);
    // allGuests[0] is the main guest — persist that position. Without it the
    // booker is unrecoverable, because the primary key is a random UUID.
    for (const [gi, g] of allGuests.entries()) {
      await client.query(
        `
          INSERT INTO booking_guests (
            booking_id, first_name, last_name, age, gender, email, phone, facebook_link, valid_id_url, guest_index, is_senior_pwd, birthdate
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          id,
          g.firstName,
          g.lastName,
          g.age ?? null,
          g.gender ?? null,
          g.email,
          g.phone,
          g.facebook_link,
          g.valid_id_url,
          gi,
          g.senior_pwd === true,
          g.birthdate ?? null,
        ],
      );
    }

    let paymentProofUrl: string | null = null;
    if (payment_proof) {
      const proofCheck = validateImageDataUrl(payment_proof);
      if (!proofCheck.ok) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: `Payment proof must be an image: ${proofCheck.reason}` },
          { status: 400 },
        );
      }
      const uploadResult = await upload_file(
        payment_proof,
        "dlux-homes/payment-proofs",
      );
      paymentProofUrl = uploadResult.url;
    }

    // Keep amount_paid consistent with the initial down payment.
    // remaining_balance is computed/managed by the DB schema in this project.
    const paymentAmountPaid = Number(down_payment ?? 0);

    const paymentUpdateRes = await client.query(
      `
        UPDATE booking_payments
        SET payment_method = $1,
            payment_proof_url = COALESCE($2, payment_proof_url),
            room_rate = $3,
            add_ons_total = $4,
            total_amount = $5,
            down_payment = $6,
            amount_paid = $7
        WHERE booking_id = $8
        RETURNING id
      `,
      [
        payment_method,
        paymentProofUrl,
        room_rate,
        add_ons_total,
        total_amount,
        down_payment,
        paymentAmountPaid,
        id,
      ],
    );

    if (paymentUpdateRes.rows.length === 0) {
      await client.query(
        `
          INSERT INTO booking_payments (
            booking_id, payment_method, payment_proof_url, room_rate,
            add_ons_total, total_amount, down_payment, amount_paid
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          id,
          payment_method,
          paymentProofUrl,
          room_rate,
          add_ons_total,
          total_amount,
          down_payment,
          paymentAmountPaid,
        ],
      );
    }

    await client.query(`DELETE FROM booking_add_ons WHERE booking_id = $1`, [
      id,
    ]);
    // Accept two shapes:
    //   1. Array<{ name, price, quantity }> — new per-haven rentable-items flow (price from the catalog).
    //   2. Record<string, number> — legacy hardcoded add-on keys, priced from ADD_ON_PRICES.
    if (Array.isArray(add_ons)) {
      for (const item of add_ons as Array<{ name?: string; price?: number | string; quantity?: number | string }>) {
        const quantityNum = Number(item?.quantity || 0);
        if (quantityNum > 0) {
          await client.query(
            `INSERT INTO booking_add_ons (booking_id, name, price, quantity)
             VALUES ($1, $2, $3, $4)`,
            [id, String(item.name || ""), Number(item.price || 0), quantityNum],
          );
        }
      }
    } else if (add_ons && typeof add_ons === "object") {
      for (const [name, quantity] of Object.entries(add_ons)) {
        const quantityNum = Number(quantity);
        if (quantityNum > 0) {
          const addOnPrice =
            ADD_ON_PRICES[name as keyof typeof ADD_ON_PRICES] || 0;
          await client.query(
            `
              INSERT INTO booking_add_ons (booking_id, name, price, quantity)
              VALUES ($1, $2, $3, $4)
            `,
            [id, name, addOnPrice, quantityNum],
          );
        }
      }
    }

    await client.query("COMMIT");

    const refreshed = await pool.query(
      `
        SELECT
          b.*,
          bg.first_name as guest_first_name,
          bg.last_name as guest_last_name,
          bg.email as guest_email,
          bg.phone as guest_phone,
          bg.valid_id_url,
          bp.total_amount,
          bp.down_payment,
          bp.amount_paid,
          bp.payment_method,
          bp.payment_proof_url,
          bp.room_rate,
          bp.add_ons_total
        FROM booking b
        LEFT JOIN booking_guests bg ON b.id = bg.booking_id
        LEFT JOIN booking_payments bp ON b.id = bp.booking_id
        WHERE b.id = $1 AND bg.id = (
          SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1
        )
        LIMIT 1
      `,
      [id],
    );

    // Re-render the calendar event AFTER the response is flushed — an edit to
    // dates, times, guests or money must not leave the host reading stale
    // details at the door. Deferred so a slow/failing Google call can't stall
    // the admin's save.
    after(async () => {
      await pushCalendarUpdate(id);
    });

    return NextResponse.json({
      success: true,
      data: refreshed.rows[0],
      message: "Booking updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update booking",
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
};

// Add-on item interface
interface AddOnItem {
  name: string;
  price: number;
  quantity?: number;
}

// Additional guest interface
interface AdditionalGuest {
  firstName: string;
  lastName: string;
  age?: number;
  gender?: string;
  validId?: string; // legacy single base64
  validIds?: string[]; // one or more ID photos (base64)
  validIdUrl?: string | null;
}

export interface Booking {
  id?: string;
  booking_id: string;
  user_id?: string;
  room_name: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  adults: number;
  children: number;
  infants: number;
  status:
  | "pending"
  | "approved"
  | "rejected"
  | "confirmed"
  | "checked-in"
  | "completed"
  | "cancelled";
  add_ons?: AddOnItem[];
  created_at?: string;
  updated_at?: string;
}

// CREATE Booking
//
// `awaitPendingEmail` decides WHEN the pending-approval email is sent, not
// whether. Guest checkout leaves it false: the send stays in `after()` so the
// guest isn't held behind an SMTP handshake for mail they read minutes later.
// Admin-created bookings (the New Booking wizard) pass true, which awaits the
// dispatch and returns its `emailStatus` in the response — the owner is sitting
// in front of the modal and needs to be told when the guest was NOT reached.
export const createBooking = async (
  req: NextRequest,
  opts: { awaitPendingEmail?: boolean; isAdminCaller?: boolean } = {},
): Promise<NextResponse> => {
  const body = await req.json();
  console.log("📥 [BOOKING] createBooking body received");
  console.log("📋 [BOOKING] Booking ID:", body.booking_id);
  console.log("📋 [BOOKING] Guest:", `${body.guest_first_name} ${body.guest_last_name}`);
  console.log("📋 [BOOKING] Dates:", `${body.check_in_date} to ${body.check_out_date}`);
  console.log("📋 [BOOKING] Room:", body.room_name);
  console.log("📋 [BOOKING] Amount:", body.total_amount);

  const {
      booking_id,
      user_id,
      room_name,
      check_in_date,
      check_out_date,
      check_in_time,
      check_out_time,
      adults,
      children,
      infants,
      // Main guest info
      guest_first_name,
      guest_last_name,
      guest_email,
      guest_phone,
      guest_age,
      guest_gender,
      guest_senior_pwd,
      guest_birthdate,
      facebook_link,
      valid_id, // base64 (legacy single)
      valid_ids, // base64[] (one or more ID photos)
      // Additional guests
      additional_guests = [],
      // Payment info
      payment_method,
      payment_proof, // base64
      payment_reference, // guest-entered reference number (pay-at-checkout)
      room_rate,
      security_deposit,
      add_ons_total,
      total_amount,
      down_payment,
      senior_discount,
      // Promo code redeemed at checkout (validated client-side against
      // /api/discounts/validate before submit)
      discount_id,
      discount_code,
      discount_amount,
      // Automatic (codeless) promotion applied at checkout. Recorded against
      // the account below so it can only ever be used once per guest.
      promotion_id,
      // Guest Terms acceptance, captured at checkout BEFORE the payment step
      // (see 2026-08-19-add-terms-acceptance-to-booking.sql). §22 of the Terms
      // makes the accepted VERSION the operative one for the booking, so it
      // has to be persisted here — the published document moves on, and a
      // later read of TERMS_AND_CONDITIONS.md cannot reconstruct it.
      terms_version,
      terms_accepted_at,
      // Add-ons (frontend sends snake_case `add_ons`)
      add_ons: addOns = {},
    } = body;

  // ── Who is claiming the promo ────────────────────────────────────────────
  //
  // NOT `user_id` from the body. That field is what the booking row is keyed on
  // (and still is, below — the NULL it carries for a guest is load-bearing for
  // requireBookingAccess), but as a promo identity it was worthless: a guest
  // signed out has none, so the one-use rule never ran, and a signed-in guest
  // could simply omit it to get the same exemption.
  //
  // The email is the identity that actually exists for every booking. user_id
  // rides along when we can prove it from the session, so a guest who later
  // signs in is still recognised as the same person.
  //
  // An admin posting the New Booking wizard is NOT the guest: their session
  // must never attach the guest's redemption to the admin's own account.
  const promoSession = opts.isAdminCaller ? null : await getServerSession(authOptions);
  const promoSessionUserId = (promoSession?.user as { id?: string } | undefined)?.id ?? null;
  // Resolved by the same helper /api/discounts/validate uses, so the code the
  // guest was told is valid is checked against the same person here.
  const promoIdentity = await resolvePromoIdentity(pool, promoSessionUserId, guest_email);
  const promoUserId = promoIdentity.userId ?? null;
  // The one address the redemption is written under. Checking is wider than
  // writing: the lookup matches any address this guest is known by.
  const promoEmail = promoRedemptionEmail(promoIdentity);

  // Product requirement: claiming a promo requires an ACCOUNT, distinct from
  // the "who is this guest" identity resolution above (which still runs for
  // signed-in redemption tracking). `promoSessionUserId` is server-derived —
  // never the client-sent `user_id` — so this can't be defeated by simply
  // omitting the field; the real UI never even offers to apply a promo
  // without a session (see validateDiscount() and PromoLoginGate).
  if ((discount_id || promotion_id) && !promoSessionUserId) {
    return NextResponse.json(
      { success: false, message: "Please log in to claim this promo." },
      { status: 400 },
    );
  }

  // Resolve every photo (payment proof, main guest ID(s), each additional
  // guest's ID(s)) BEFORE touching Postgres. These are Cloudinary round
  // trips, not database work — running them after BEGIN held a transaction
  // (and a connection out of the pool) open for the entire upload, on top of
  // being sequential per guest. All of it now runs in parallel up front, so
  // the transaction below is nothing but fast DB writes against already-known
  // URLs.
  let paymentProofUrl: string | null = null;
  if (payment_proof) {
    const proofCheck = validateImageDataUrl(payment_proof);
    if (!proofCheck.ok) {
      return NextResponse.json(
        { success: false, message: `Payment proof must be an image: ${proofCheck.reason}` },
        { status: 400 },
      );
    }
  }
  const mainIdCount = Array.isArray(valid_ids)
    ? valid_ids.filter((v: unknown) => typeof v === "string" && v.trim()).length
    : (typeof valid_id === "string" && valid_id.trim() ? 1 : 0);
  console.log(`🪪 [BOOKING] Main guest ID photos received from client: ${mainIdCount}`);

  let validIdUrl: string | null = null;
  let guestIdUrls: (string | null)[] = [];
  try {
    [paymentProofUrl, validIdUrl, guestIdUrls] = await Promise.all([
      payment_proof
        ? upload_file(payment_proof, "dlux-homes/payment-proofs")
            .then((r) => r.url as string)
            .catch((err: unknown) => {
              // Non-fatal, same as before: a failed/misconfigured image upload
              // must not block the booking — the guest has already paid.
              console.error(
                "[booking] payment proof upload failed (continuing without it):",
                err instanceof Error ? err.message : err,
              );
              return null;
            })
        : Promise.resolve(null),
      resolveValidIdUrls(valid_ids, valid_id),
      Promise.all(
        (additional_guests as Array<{ validIds?: unknown; validId?: unknown }>).map((g) =>
          resolveValidIdUrls(g.validIds, g.validId),
        ),
      ),
    ]);
  } catch (err: unknown) {
    const e = err as { message?: string; http_code?: number; name?: string };
    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload valid ID.",
        details: { message: e?.message, name: e?.name, http_code: e?.http_code },
      },
      { status: 500 },
    );
  }

  // The client sent photos but NONE survived validation/upload. Deliberately
  // not fatal — the guest has already paid the down payment by this point, and
  // blocking them over an image the sniffer disliked is worse for the business
  // than a missing document the host can chase. But it must be loud: the host
  // otherwise finds out only by opening the booking and seeing "Not uploaded".
  if (mainIdCount > 0 && !validIdUrl) {
    console.error(
      `❌ [BOOKING] ${booking_id}: ${mainIdCount} main-guest ID photo(s) were sent but NONE were stored ` +
        `— every one was rejected by the image guard or failed to upload. Booking saved WITHOUT an ID.`,
    );
  } else if (mainIdCount === 0) {
    console.warn(
      `⚠️ [BOOKING] ${booking_id}: client sent NO main-guest ID photo. ` +
        `Checkout requires one for guests aged 10+, so this points at a client-side bug or a bypassed step.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // --- GENERAL ROOM AVAILABILITY CHECK (time-aware) ---
    // '00:00' checkout means end-of-day midnight, so treat it as the start of the next day.
    // Only active bookings block a new one — completed, checked-out, rejected, cancelled, declined do not.
    // Time-aware availability WITH a cleaning turnover buffer. After every stay
    // the unit is unavailable for cleaning before the next guest can check in.
    // The hours live in src/lib/turnover.ts — the room calendar reads the same
    // constants, so what the calendar offers and what this check accepts can't
    // drift apart. The buffer is applied to BOTH bookings so neither can butt
    // up against the other's cleaning window (works for the preset windows AND
    // custom times).
    const availabilityCheckQuery = `
      WITH n AS (
        SELECT
          ($2::DATE + $3::TIME)::TIMESTAMP AS ns,
          (CASE WHEN $5 = '00:00'
                THEN ($4::DATE + INTERVAL '1 day')::TIMESTAMP
                ELSE ($4::DATE + $5::TIME)::TIMESTAMP END) AS ne
      )
      SELECT b.id, b.booking_id
      FROM booking b, n
      WHERE b.room_name = $1
        AND ${occupyingBookingSql("b")}
        -- existing check-in  <  new check-out + new cleaning buffer
        AND ${EXISTING_START_SQL} <
            n.ne + ${turnoverSql("n.ns", "n.ne")}
        -- existing check-out + existing cleaning buffer  >  new check-in
        AND (
          ${EXISTING_END_SQL}
          + ${turnoverSql(EXISTING_START_SQL, EXISTING_END_SQL)}
        ) > n.ns
      LIMIT 1
    `;

    const availabilityCheckValues = [
      room_name,
      check_in_date,
      check_in_time,
      check_out_date,
      check_out_time,
    ];

    // A window whose check-in has already passed cannot be sold, however empty
    // the unit is — nobody arrives at 7am once it is 10am. The storefront
    // enforces the same rule in the viewer's own clock; THIS is the
    // authoritative check, and it runs in Manila because that is the wall clock
    // check_in_time is written in. MIN_LEAD_MINUTES lives in
    // src/lib/bookingWindow.ts and is 0 today, so the comparison is a plain
    // "already started".
    const startedCheck = await client.query<{ started: boolean }>(
      `SELECT ($1::DATE + $2::TIME)
              < (NOW() AT TIME ZONE 'Asia/Manila') AS started`,
      [check_in_date, check_in_time],
    );
    if (startedCheck.rows[0]?.started) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          error: "That check-in time has already passed. Please pick a later slot.",
        },
        { status: 400 },
      );
    }

    const availabilityResult = await client.query(availabilityCheckQuery, availabilityCheckValues);

    if (availabilityResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          error: `This room isn't available for the selected time — it overlaps another booking or its cleaning turnover (${TURNOVER_BLURB}). Please choose a different date or time.`,
        },
        { status: 400 }
      );
    }
    // --- END AVAILABILITY CHECK ---

    // --- BLOCKED-DATES CHECK ---
    // The availability check above only looks at Staycation bookings. Partners can
    // also block dates manually (renovation, leave) and iCal sync imports reservations
    // from Airbnb / Booking.com as blocked_dates rows with block_type='imported_external'.
    // Without this check, guests can book over external reservations and partner-blocked
    // windows. Skipped if haven_id is missing (e.g. legacy clients that send only
    // room_name) so we don't regress those callers.
    if (body.haven_id && UUID_RE.test(body.haven_id)) {
      const blockedCheck = await client.query(
        `SELECT id, from_date, to_date, block_type, reason
         FROM blocked_dates
         WHERE haven_id = $1
           AND daterange(from_date, to_date, '[]')
               && daterange($2::date, $3::date, '[)')
         LIMIT 1`,
        [body.haven_id, check_in_date, check_out_date]
      );

      if (blockedCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            success: false,
            error: "This room is unavailable on the selected dates. Please choose different dates.",
          },
          { status: 400 }
        );
      }
    }
    // --- END BLOCKED-DATES CHECK ---

    // --- BOOKING WINDOW VALIDATION ---
    const { stay_type, haven_id } = body;
    if (stay_type && haven_id && UUID_RE.test(haven_id)) {
      // Only the lookup is best-effort. The checks below it are pure JS and
      // must keep the ability to reject the booking outright — wrapping them
      // too would swallow a 400 the guest needs to see.
      let windowTypes: Array<{
        name: string; duration: number; available_days: string[];
        first_check_in: string; last_check_in: string;
      }> = [];
      await bestEffort(client, "booking_window_lookup", async () => {
        const bwResult = await client.query(
          `SELECT booking_windows FROM havens WHERE uuid_id = $1 LIMIT 1`,
          [haven_id]
        );
        windowTypes = bwResult.rows[0]?.booking_windows?.types ?? [];
      });

      const bType = windowTypes.find(t => t.name === stay_type);

      if (bType) {
        // Day-of-week check
        const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const cinDay = DAY_ABBR[new Date(check_in_date + 'T12:00:00').getDay()];
        if (!bType.available_days.includes(cinDay)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { success: false, error: `${stay_type} is not available on ${cinDay}` },
            { status: 400 }
          );
        }
        // Time window check
        const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const cinMins = toMins(check_in_time);
        const firstMins = toMins(bType.first_check_in);
        const lastMins = toMins(bType.last_check_in);
        const inWindow = firstMins <= lastMins
          ? cinMins >= firstMins && cinMins <= lastMins
          : cinMins >= firstMins || cinMins <= lastMins;
        if (!inWindow) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { success: false, error: `Check-in time must be between ${bType.first_check_in} and ${bType.last_check_in} for ${stay_type}` },
            { status: 400 }
          );
        }
      }
    }
    // --- END BOOKING WINDOW VALIDATION ---

    // --- IDENTITY-BASED OVERLAP CHECK ---
    // Only active bookings block a new one — completed, checked-out, rejected, cancelled, declined do not.
    const overlapCheckQuery = `
      SELECT b.id, b.booking_id, b.status, b.check_in_date, b.check_out_date
      FROM booking b
      JOIN booking_guests bg ON b.id = bg.booking_id
      WHERE b.room_name = $1
        AND ${occupyingBookingSql("b")}
        AND bg.first_name = $2
        AND bg.last_name = $3
        AND bg.email = $4
        AND bg.phone = $5
        AND (
          (b.check_in_date, b.check_out_date) OVERLAPS ($6::DATE, $7::DATE)
          OR b.check_in_date = $6::DATE
          OR b.check_out_date = $7::DATE
        )
      LIMIT 1
    `;

    const overlapCheckValues = [
      room_name,
      guest_first_name,
      guest_last_name,
      guest_email,
      guest_phone,
      check_in_date,
      check_out_date,
    ];

    const overlapResult = await client.query(overlapCheckQuery, overlapCheckValues);

    if (overlapResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          error: "You already have an existing booking for this room on the selected dates.",
        },
        { status: 400 }
      );
    }
    // --- END CHECK ---

    // paymentProofUrl was already uploaded above, before BEGIN.

    // Create Google Calendar event with payment proof URL
    const calendarEventData: CalendarEventData = {
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
      status: "pending", // Default status for new bookings
      stay_type: body.stay_type,
      payment_method,
      payment_proof_url: paymentProofUrl ?? undefined,
      total_amount,
      down_payment,
      adults,
      children,
      infants,
      remaining_balance: Math.max(0, (Number(total_amount) || 0) - (Number(down_payment) || 0)),
      security_deposit: Number(security_deposit) || undefined,
      additional_guest_names: Array.isArray(additional_guests)
        ? additional_guests
            .map((g: { firstName?: string; lastName?: string }) =>
              `${g?.firstName ?? ""} ${g?.lastName ?? ""}`.trim(),
            )
            .filter((n: string) => n.length > 0)
        : undefined,
    };
    // NOTE: the calendar event is NOT created here any more — it is scheduled
    // after the response (see the `after()` block below) and written back with an
    // UPDATE. Google's API was a blocking round trip on the guest's spinner for
    // something no guest ever sees.
    //
    // Safe to defer: a booking with a NULL google_event_id was ALREADY a normal
    // state (this call returned null on any API failure and the booking carried
    // on), and /api/bookings/sync-calendar exists precisely to back-fill rows
    // WHERE google_event_id IS NULL.
    const googleEventId = null;

    // A guest who didn't sign in gets NO account here — the account is created
    // when the booking is CONFIRMED (see updateBookingStatus), not when it is
    // requested. A request that is never approved should not leave a login
    // behind, and the guest has nothing to sign in for until there is a
    // confirmed stay to look at.
    //
    // So user_id stays NULL through the pending window. That is what lets the
    // guest open their own booking from the emailed link without an account
    // (requireBookingAccess treats a NULL-owner booking as reachable by id);
    // confirmation then creates the account and backfills this column, after
    // which the booking is account-owned and viewing it requires signing in.
    const resolvedUserId: string | null = user_id || null;

    // Step 1: Create main booking record
    const bookingQuery = `
      INSERT INTO booking (
        booking_id, user_id, room_name, check_in_date, check_out_date,
        check_in_time, check_out_time, adults, children, infants, status,
        has_security_deposit, google_event_id, terms_version, terms_accepted_at,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING id
    `;

    const bookingValues = [
      booking_id,
      resolvedUserId, // guest bookings now resolve to an auto-created/reused account instead of NULL
      room_name,
      check_in_date,
      check_out_date,
      check_in_time,
      check_out_time,
      adults,
      children,
      infants,
      "pending", // Ensure status matches "pending" default
      security_deposit > 0, // has_security_deposit flag
      googleEventId, // Added column for google calendar sync
      // NULL, not a synthesized value, when a client didn't send acceptance:
      // the migration defines NULL as "taken before acceptance was captured",
      // and inventing a version would forge a consent record.
      terms_version || null,
      terms_accepted_at || null,
    ];

    console.log("📝 [BOOKING] Inserting booking record...");
    const bookingResult = await client.query(bookingQuery, bookingValues);
    const bookingId = bookingResult.rows[0].id;
    console.log("✅ [BOOKING] Booking record created with ID:", bookingId);

    // Step 2: Create main guest record
    // validIdUrl was already resolved above, before BEGIN (see mainIdCount logging there too).

    // guest_index 0 marks the booker. The primary key is a random UUID, so
    // without this column there is no way to tell afterwards who booked — which
    // once put a 3-year-old at the top of the admin booking detail.
    const mainGuestQuery = `
      INSERT INTO booking_guests (
        booking_id, first_name, last_name, age, gender, email, phone, facebook_link, valid_id_url, guest_index, is_senior_pwd, birthdate
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
    `;

    const mainGuestValues = [
      bookingId,
      guest_first_name,
      guest_last_name,
      (guest_age != null && guest_age !== '' && Number(guest_age) > 0) ? Number(guest_age) : null,
      guest_gender || null,
      guest_email,
      guest_phone,
      facebook_link || null,
      validIdUrl,
      guest_senior_pwd === true,
      guest_birthdate || null,
    ];

    console.log("📝 [BOOKING] Inserting main guest record...");
    await client.query(mainGuestQuery, mainGuestValues);
    console.log("✅ [BOOKING] Main guest record created");

    // Step 3: Create additional guests records
    // guestIdUrls was already resolved above, in parallel, before BEGIN.
    if (additional_guests && additional_guests.length > 0) {
      for (const [gi, guest] of additional_guests.entries()) {
        const guestIdUrl = guestIdUrls[gi];

        const additionalGuestQuery = `
          INSERT INTO booking_guests (
            booking_id, first_name, last_name, age, gender, email, phone, facebook_link, valid_id_url, guest_index, is_senior_pwd, birthdate
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        const additionalGuestValues = [
          bookingId,
          guest.firstName,
          guest.lastName,
          (guest.age != null && guest.age !== '' && Number(guest.age) > 0) ? Number(guest.age) : null,
          guest.gender || null,
          guest.email || guest_email,
          guest.phone || guest_phone,
          null,
          guestIdUrl,
          gi + 1, // 0 is the main guest, so additional guests start at 1
          guest.seniorPwd === true,
          guest.birthdate || null,
        ];

        await client.query(additionalGuestQuery, additionalGuestValues);
      }
    }

    // Step 4: Create payment record (without security deposit)
    // Note: paymentProofUrl was already uploaded earlier for calendar event

    // Calculate payment amounts (security deposit is handled separately during checkout)
    const paymentTotalAmount = Number(total_amount) || 0; // Full amount during booking
    const requestedDownPayment = Number(down_payment) || 0;
    // amount_paid must not exceed total_amount (booking_payments_amount_paid_check)
    const paymentAmountPaid = Math.min(requestedDownPayment, paymentTotalAmount);
    const paymentDownPayment = Math.min(requestedDownPayment, paymentTotalAmount);

    console.log("📋 [BOOKING] Payment computed:", {
      total_amount: paymentTotalAmount,
      down_payment: paymentDownPayment,
      amount_paid: paymentAmountPaid,
    });

    // ── Re-price the stay on the server ───────────────────────────────────
    // The room price used to be whatever the browser sent. It's now re-quoted
    // with the same quoteStay() the checkout uses — live haven rates, weekend/
    // holiday calendar and ACTIVE seasonal rates — and a booking priced below
    // that quote is refused. That also covers a guest whose page loaded before
    // the owner switched a season ON.
    //
    // Reads go through `pool`, not the transaction's `client`: a failed read
    // inside the transaction would abort it and take the booking down with it.
    const stayTypeCode = stayTypeCodeFor(check_in_date, check_out_date, check_in_time, check_out_time);
    const stayNightsCount = stayTypeCode === "10" ? 1 : bookedNights(check_in_date, check_out_date);
    const checkInISO = String(check_in_date).slice(0, 10);
    const havenRow = await pool
      .query(
        haven_id && UUID_RE.test(haven_id)
          ? `SELECT * FROM havens WHERE uuid_id = $1 LIMIT 1`
          : `SELECT * FROM havens WHERE haven_name = $1 LIMIT 1`,
        [haven_id && UUID_RE.test(haven_id) ? haven_id : room_name],
      )
      .then((r) => r.rows[0] as Record<string, unknown> | undefined)
      .catch((err: unknown) => {
        console.error("[BOOKING] haven lookup for price check failed:", err);
        return undefined;
      });
    const [calendarRules, stayingSeasons] = await Promise.all([
      loadCalendarRules(pool),
      loadActiveSeasons(pool, { fromISO: checkInISO, toISO: addDaysISO(checkInISO, stayNightsCount - 1) }),
    ]);
    const seniorFlags = [guest_senior_pwd === true, ...(additional_guests as Array<{ seniorPwd?: unknown }>).map((g) => g?.seniorPwd === true)];

    if (!havenRow) {
      if (!opts.isAdminCaller) {
        await client.query("ROLLBACK");
        console.warn("[BOOKING] Rejected: no haven found to price", haven_id, room_name);
        return NextResponse.json(
          { success: false, error: "We couldn't verify the price for this room. Please refresh and try again.", code: "PRICE_CHANGED" },
          { status: 409 },
        );
      }
    } else {
      const quote = quoteStay({
        stayType: stayTypeCode,
        checkInISO,
        nights: stayNightsCount,
        rates: havenToRoom(havenRow),
        rules: calendarRules,
        seasons: stayingSeasons,
        feePax: (Number(adults) || 0) + (Number(children) || 0),
        seniorCount: seniorFlags.filter(Boolean).length,
        checkInTime: check_in_time,
      });
      const priceCheck = checkClaimedPrice(quote, { total_amount, discount_amount, senior_discount });
      if (!priceCheck.ok) {
        if (opts.isAdminCaller) {
          // The New Booking wizard lets staff set a price by hand; flag it, don't block it.
          console.warn(`[BOOKING] Admin booking ${booking_id} differs from the quote (allowed):`, priceCheck.reason);
        } else {
          await client.query("ROLLBACK");
          console.warn(`[BOOKING] Rejected ${booking_id} at submit:`, priceCheck.reason);
          return NextResponse.json(
            { success: false, error: "The rates for these dates have changed. Please refresh the page to see the current price.", code: "PRICE_CHANGED" },
            { status: 409 },
          );
        }
      }
    }

    // Seasons don't stack with promos unless the owner allowed it for that season.
    const promoBlockedBy = promoBlockingSeason(stayTypeCode, checkInISO, stayNightsCount, stayingSeasons);
    if (promoBlockedBy && (discount_id || discount_code || promotion_id) && !opts.isAdminCaller) {
      await client.query("ROLLBACK");
      console.warn(`[BOOKING] Rejected promo on ${promoBlockedBy.name} dates:`, discount_code || promotion_id);
      return NextResponse.json(
        { success: false, error: `Promos don't apply to ${promoBlockedBy.name} dates. Please remove the promo and try again.`, code: "DISCOUNT_INVALID" },
        { status: 409 },
      );
    }
    // Snapshot of the season that priced this booking (first seasonal night).
    const pricedBySeason = Array.from({ length: stayNightsCount }, (_, i) => seasonFor(addDaysISO(checkInISO, i), stayingSeasons)).find(Boolean);

    // ── Re-validate the promo code before it is honoured ──────────────────
    // The browser validated this code when the guest typed it, but that was
    // minutes ago and on a client we do not control. Re-run the SAME rules
    // here: a code deactivated in the meantime, expired, over its cap, or
    // already redeemed by this guest must not pay out, and the peso amount is
    // recomputed rather than trusted.
    //
    // `preDiscount` is the total the guest confirmed plus the discount taken off
    // it — i.e. what the code was applied to. This catches an inflated
    // discount_amount; it does NOT re-derive the room price itself, which is
    // still client-supplied (tracked separately).
    //
    // The checkout never stacks the two, so at most one of these branches is
    // live for a given booking and `discount_amount` belongs entirely to it.
    if (discount_id || discount_code) {
      const claimed = Number(discount_amount) || 0;
      const preDiscount = (Number(paymentTotalAmount) || 0) + claimed;
      const check = await validateDiscount({
        db: client,
        code: discount_code || null,
        discountId: discount_id || null,
        havenId: haven_id || null,
        ...promoIdentity,
        amount: preDiscount,
        // Derived from the dates being booked, never taken from the payload — a
        // per-night code multiplies by this, so a client-supplied night count
        // would be a direct lever on the discount.
        nights: bookedNights(check_in_date, check_out_date),
      });
      if (!check.ok) {
        await client.query("ROLLBACK");
        console.warn("[BOOKING] Rejected promo at submit:", discount_code, check.error);
        return NextResponse.json(
          { success: false, error: `${check.error} Please remove the code and try again.`, code: "DISCOUNT_INVALID" },
          { status: 409 },
        );
      }
      if (claimed > check.discount.discount_amount) {
        await client.query("ROLLBACK");
        console.warn("[BOOKING] Discount amount overstated:", claimed, ">", check.discount.discount_amount);
        return NextResponse.json(
          { success: false, error: "The promo discount could not be verified. Please re-apply the code.", code: "DISCOUNT_INVALID" },
          { status: 409 },
        );
      }
    }

    // ── Same, for an AUTOMATIC promotion ──────────────────────────────────
    // There is no code to type for these, which is exactly why they were never
    // re-checked: `promotion_id` and the peso amount it contributed came
    // straight off the payload and were written as given. So closing the
    // one-use hole on voucher codes alone would just have moved the reuse here.
    //
    // Only a promotion that clears this branch is recorded as redeemed below.
    // A payload carrying BOTH a code and a promotion_id takes the voucher path
    // above, and must not also burn the promotion it never actually applied.
    let promotionVerified = false;
    if (!(discount_id || discount_code) && promotion_id) {
      const claimed = Number(discount_amount) || 0;
      const preDiscount = (Number(paymentTotalAmount) || 0) + claimed;

      const reject = async (reason: string, guestMessage: string) => {
        await client.query("ROLLBACK");
        console.warn("[BOOKING] Rejected automatic promotion at submit:", promotion_id, reason);
        return NextResponse.json(
          { success: false, error: guestMessage, code: "DISCOUNT_INVALID" },
          { status: 409 },
        );
      };

      const promoRow = await client.query(
        `SELECT p.id, p.title, p.description, p.image_url, p.discount_type, p.discount_value,
                p.discount_id, p.start_date, p.end_date, p.applies_to, p.redemption,
                p.per_night, p.max_discount, d.code AS discount_code
         FROM promotions p
         LEFT JOIN discounts d ON d.id = p.discount_id
         WHERE p.id = $1
           AND p.active = true
           AND p.start_date <= NOW()
           AND p.end_date >= NOW()
           AND p.redemption = 'automatic'
         LIMIT 1`,
        [promotion_id],
      );
      if (promoRow.rows.length === 0) {
        return reject("not an active automatic promotion", "This offer is no longer available. Please refresh and try again.");
      }

      // NUMERIC arrives from pg as a string; the shared pricing helpers do
      // arithmetic on these, exactly as /api/promotions/active parses them.
      const promo: ActivePromotion = {
        ...promoRow.rows[0],
        discount_value: promoRow.rows[0].discount_value != null ? parseFloat(promoRow.rows[0].discount_value) : null,
        max_discount: promoRow.rows[0].max_discount != null ? parseFloat(promoRow.rows[0].max_discount) : null,
      };

      const stayType = stayTypeCodeFor(check_in_date, check_out_date, check_in_time, check_out_time);
      if (!promoCoversStay(promo, stayType)) {
        return reject(`does not cover stay type ${stayType}`, "This offer does not apply to the stay you selected. Please refresh and try again.");
      }

      if (await promotionAlreadyRedeemed({ db: client, promotionId: promo.id, ...promoIdentity })) {
        return reject("already redeemed by this guest", `${ALREADY_REDEEMED_ERROR} Please refresh and try again.`);
      }

      // Same helper the checkout priced it with, so the two cannot drift.
      const worth = promoDiscountOn(promo, preDiscount, bookedNights(check_in_date, check_out_date));
      if (claimed > worth) {
        return reject(`amount overstated: ${claimed} > ${worth}`, "The promo discount could not be verified. Please refresh and try again.");
      }

      promotionVerified = true;
    }

    // remaining_balance satisfies the DB check (= total_amount - amount_paid).
    // (Original live DB had this as a GENERATED column; the reconstructed schema
    // uses a plain column with a CHECK constraint, so we set it explicitly.)
    const paymentQuery = `
      INSERT INTO booking_payments (
        booking_id, payment_method, payment_proof_url, payment_reference, room_rate,
        add_ons_total, total_amount, down_payment, amount_paid, remaining_balance,
        discount_id, discount_code, discount_amount, senior_discount,
        seasonal_rate_id, seasonal_rate_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `;

    const paymentValues = [
      bookingId,
      payment_method,
      paymentProofUrl,
      payment_reference ?? null,
      room_rate,
      add_ons_total,
      paymentTotalAmount,
      paymentDownPayment,
      paymentAmountPaid,
      Number(paymentTotalAmount) - Number(paymentAmountPaid),
      discount_id || null,
      discount_code || null,
      Number(discount_amount) || 0,
      Number(senior_discount) || 0,
      pricedBySeason?.id ?? null,
      pricedBySeason?.name ?? null,
    ];

    console.log("📝 [BOOKING] Inserting payment record...");
    await client.query(paymentQuery, paymentValues);
    console.log("✅ [BOOKING] Payment record created");

    // Count this redemption against the code's usage cap, and record it against
    // the guest so they can't reuse this code on a future booking (enforced by
    // validateDiscount, which both /api/discounts/validate and the submit above
    // run). Best-effort — the booking still succeeds even if these fail.
    //
    // Keyed on the normalized email, with user_id alongside when we have it.
    // This used to be `if (user_id)`, which meant a signed-out guest — i.e.
    // nearly every guest — burned nothing and could reuse the code forever.
    if (discount_id) {
      await bestEffort(client, "discount_use_count", async () => {
        await client.query(`UPDATE discounts SET used_count = used_count + 1 WHERE id = $1`, [discount_id]);
      });
      if (promoEmail) {
        await bestEffort(client, "discount_redemption", async () => {
          await client.query(
            // COALESCE, not EXCLUDED: a row written while the guest was signed
            // out has a NULL user_id, and this stamps their account onto it the
            // first time they redeem while signed in — without ever clearing an
            // account already recorded there.
            `INSERT INTO discount_users (discount_id, user_id, guest_email, used, used_at)
             VALUES ($1, $2, $3, true, NOW())
             ON CONFLICT (discount_id, guest_email)
             DO UPDATE SET used = true, used_at = NOW(),
                           user_id = COALESCE(discount_users.user_id, EXCLUDED.user_id)`,
            [discount_id, promoUserId, promoEmail]
          );
        });
      }
    }

    // Same rule for an automatic promotion: one redemption per guest. From here
    // on /api/promotions/active stops returning this promotion to them, so no
    // later surface can offer it again — and the submit check above refuses it
    // even if one somehow does.
    if (promotionVerified && promoEmail) {
      await bestEffort(client, "promotion_redemption", async () => {
        await client.query(
          `INSERT INTO promotion_users (promotion_id, user_id, guest_email, booking_id, used, used_at)
           VALUES ($1, $2, $3, $4, true, NOW())
           ON CONFLICT (promotion_id, guest_email)
           DO UPDATE SET used = true, used_at = NOW(),
                         user_id = COALESCE(promotion_users.user_id, EXCLUDED.user_id)`,
          [promotion_id, promoUserId, promoEmail, bookingId]
        );
      });
    }

    // Step 4.5: Create the security deposit record holding the EXPECTED amount.
    //
    // This used to insert 0 as a placeholder for "not collected yet", which is
    // what `deposit_status = 'pending'` already says. The 0 leaked: the
    // self check-in email reads this column and used `??`, so a zero passed
    // straight through as an authoritative figure and told the guest to bring
    // only the balance — understating what they owe by the whole deposit.
    // Storing the expected amount matches what the collection flow in
    // src/app/admin/csr/actions.ts already documents this column to mean
    // ("the expected deposit amount (room policy), not the combined
    // collection"), and it computes the same figure that flow would fall back
    // to, so the split is unchanged.
    const depositTiers = await client.query<{
      security_deposit: string | null;
      deposit_tier1_amount: string | null;
      deposit_tier2_amount: string | null;
      deposit_tier3_amount: string | null;
      deposit_tier4_amount: string | null;
    }>(
      `SELECT security_deposit, deposit_tier1_amount, deposit_tier2_amount,
              deposit_tier3_amount, deposit_tier4_amount
         FROM havens WHERE TRIM(haven_name) = TRIM($1) LIMIT 1`,
      [room_name],
    );
    const tierRow = depositTiers.rows[0];
    const depositNights = check_in_date && check_out_date
      ? Math.round(
          (new Date(check_out_date + "T12:00:00").getTime()
           - new Date(check_in_date + "T12:00:00").getTime()) / 86_400_000)
      : 1;
    const expectedDeposit = securityDepositFor(depositNights, undefined, {
      securityDeposit: tierRow?.security_deposit != null ? Number(tierRow.security_deposit) : undefined,
      depositTier1Amount: tierRow?.deposit_tier1_amount != null ? Number(tierRow.deposit_tier1_amount) : undefined,
      depositTier2Amount: tierRow?.deposit_tier2_amount != null ? Number(tierRow.deposit_tier2_amount) : undefined,
      depositTier3Amount: tierRow?.deposit_tier3_amount != null ? Number(tierRow.deposit_tier3_amount) : undefined,
      depositTier4Amount: tierRow?.deposit_tier4_amount != null ? Number(tierRow.deposit_tier4_amount) : undefined,
    });

    await client.query(
      `INSERT INTO booking_security_deposits (booking_id, amount, deposit_status, held_at)
       VALUES ($1, $2, 'pending', NOW())`,
      [bookingId, expectedDeposit],
    );

    // Step 5: Create add-ons records
    // Accepts array form (per-haven rentable-items: name+price+quantity from the catalog)
    // and legacy object form (hardcoded keys priced from ADD_ON_PRICES).
    if (Array.isArray(addOns)) {
      for (const item of addOns as Array<{ name?: string; price?: number | string; quantity?: number | string }>) {
        const quantityNum = Number(item?.quantity || 0);
        if (quantityNum > 0) {
          await client.query(
            `INSERT INTO booking_add_ons (booking_id, name, price, quantity)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, String(item.name || ""), Number(item.price || 0), quantityNum],
          );
        }
      }
    } else if (addOns && Object.keys(addOns).length > 0) {
      for (const [name, quantity] of Object.entries(addOns)) {
        const quantityNum = Number(quantity);
        if (quantityNum > 0) {
          const addOnPrice =
            ADD_ON_PRICES[name as keyof typeof ADD_ON_PRICES] || 0;
          await client.query(
            `INSERT INTO booking_add_ons (booking_id, name, price, quantity)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, name, addOnPrice, quantityNum],
          );
        }
      }
    }

    // Step 6: Create cleaning record
    const cleaningQuery = `
      INSERT INTO booking_cleaning (booking_id, cleaning_status)
      VALUES ($1, 'pending')
    `;

    console.log("📝 [BOOKING] Inserting cleaning record...");
    await client.query(cleaningQuery, [bookingId]);
    console.log("✅ [BOOKING] Cleaning record created");

    // Fetch the complete booking for the response while STILL inside the
    // transaction. Reading our own writes pre-COMMIT is safe, and it means a
    // retrieval failure rolls back cleanly instead of leaving a committed
    // booking sitting behind a 500 response (the old COMMIT-then-retrieve order).
    const completeBookingQuery = `
    SELECT
      b.*,
      bg.first_name,
      bg.last_name,
      bg.email,
      bg.phone,
      bg.valid_id_url,
      json_build_object(
        'id', bp.id,
        'payment_method', bp.payment_method,
        'payment_proof_url', bp.payment_proof_url,
        'room_rate', bp.room_rate,
        'add_ons_total', bp.add_ons_total,
        'total_amount', bp.total_amount,
        'down_payment', bp.down_payment,
        'amount_paid', bp.amount_paid,
        'remaining_balance', bp.remaining_balance,
        'payment_status', bp.payment_status,
        'rejection_reason', bp.rejection_reason,
        'reviewed_by', bp.reviewed_by,
        'reviewed_at', bp.reviewed_at,
        'created_at', bp.created_at
      ) AS booking_payment
    FROM booking b
    JOIN booking_guests bg ON b.id = bg.booking_id
    JOIN booking_payments bp ON b.id = bp.booking_id
    WHERE b.id = $1
    LIMIT 1
  `;

    const completeResult = await client.query(completeBookingQuery, [
      bookingId,
    ]);

    if (completeResult.rows.length === 0) {
      // Still inside the transaction, so throwing here rolls everything back —
      // no orphaned booking is left behind.
      console.error("❌ [BOOKING] CRITICAL: Booking row missing right after insert — rolling back");
      console.error("❌ [BOOKING] Booking ID:", bookingId);
      throw new Error(`Booking insert could not be verified`);
    }

    console.log("💾 [BOOKING] Committing database transaction...");
    await client.query("COMMIT");
    console.log("✅ [BOOKING] Database transaction committed successfully");

    const createdBooking = completeResult.rows[0];
    console.log("✅ [BOOKING] Booking created and retrieved successfully");
    console.log("📋 [BOOKING] Booking ID in DB:", createdBooking.id);
    console.log("📋 [BOOKING] Status:", createdBooking.status);

    // Create the Google Calendar event AFTER the response is flushed, then write
    // the event id back. Runs in its own `after()` so a calendar failure and an
    // email failure can't affect each other, and both run concurrently.
    //
    // Uses `pool`, NOT `client`: the transaction's client is released when this
    // handler returns, which happens before this callback runs.
    after(async () => {
      try {
        console.log(`📅 [BOOKING] Creating calendar event for booking: ${booking_id}`);
        const eventId = await createCalendarEvent(calendarEventData);
        if (!eventId) {
          console.warn(`⚠️ [BOOKING] Calendar event returned null for ${booking_id} — /api/bookings/sync-calendar can back-fill it.`);
          return;
        }
        await pool.query(
          `UPDATE booking SET google_event_id = $1, updated_at = NOW() WHERE id = $2`,
          [eventId, bookingId],
        );
        console.log(`✅ [BOOKING] Calendar event ${eventId} linked to booking ${booking_id}`);
      } catch (calErr) {
        // Never throw out of after(): the booking is already committed and the
        // guest already has their confirmation.
        console.error(`❌ [BOOKING] Deferred calendar sync failed for ${booking_id}:`, calErr);
      }
    });

    // Send the pending-approval email to the guest.
    //
    // This block used to be awaited on the critical path for EVERY booking: two
    // more DB queries to build the pamphlet, then an HTTP round trip in which
    // the server calls its OWN public URL, which pays a second serverless
    // invocation plus a Gmail SMTP handshake. The guest stared at a spinner for
    // all of it, for an email they read minutes later.
    //
    // It is now a named function so the caller can choose: `after()` for guests
    // (runs once the response has been flushed — the spinner fix stands), or
    // awaited for an admin, whose response then carries the real send result.
    const sendPendingEmail = async (): Promise<EmailDispatchResult> => {
    try {
      const booking = completeResult.rows[0];

      // Fetch add-ons (formerly "rentable items") for this haven, grouped by
      // category. The pamphlet renders by category when this is provided.
      // Flat `rentableItems` is still passed for back-compat + as the bucket
      // for any uncategorized items.
      let rentableItems: { name: string; icon: string; price_per_night: number }[] = [];
      let addonCategories: {
        id: string;
        name: string;
        icon: string;
        items: { name: string; icon: string; price_per_night: number }[];
      }[] = [];
      try {
        // Categories with their items nested.
        const catRes = await pool.query(
          `SELECT
             c.id::text,
             c.name,
             c.icon,
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object('name', i.name, 'icon', i.icon, 'price_per_night', i.price_per_night)
                   ORDER BY i.id
                 )
                 FROM haven_rentable_items i
                 WHERE i.category_id = c.id AND i.is_active = true
               ),
               '[]'::json
             ) AS items
           FROM haven_addon_categories c
           INNER JOIN havens h ON h.uuid_id = c.haven_id
           WHERE h.haven_name = $1
           ORDER BY c.sort_order ASC, c.created_at ASC`,
          [booking.room_name],
        );
        addonCategories = catRes.rows.map((r) => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          items: r.items || [],
        }));

        // Uncategorized items (legacy or not yet grouped). Try with the new
        // column; fall back if the migration hasn't been run.
        try {
          const uncatRes = await pool.query(
            `SELECT ri.name, ri.icon, ri.price_per_night
             FROM haven_rentable_items ri
             INNER JOIN havens h ON h.uuid_id = ri.haven_id
             WHERE h.haven_name = $1 AND ri.is_active = true AND ri.category_id IS NULL
             ORDER BY ri.id ASC`,
            [booking.room_name],
          );
          rentableItems = uncatRes.rows;
        } catch {
          const allRes = await pool.query(
            `SELECT ri.name, ri.icon, ri.price_per_night
             FROM haven_rentable_items ri
             INNER JOIN havens h ON h.uuid_id = ri.haven_id
             WHERE h.haven_name = $1 AND ri.is_active = true
             ORDER BY ri.id ASC`,
            [booking.room_name],
          );
          rentableItems = allRes.rows;
        }
      } catch (rentErr) {
        console.error("⚠️ Could not fetch add-ons for pamphlet:", rentErr);
      }

      const emailData = {
        firstName: booking.first_name,
        lastName: booking.last_name,
        email: booking.email,
        phone: booking.phone,
        bookingId: booking.booking_id,
        roomName: booking.room_name,
        checkInDate: new Date(booking.check_in_date).toLocaleDateString(),
        checkInTime: booking.check_in_time,
        checkOutDate: new Date(booking.check_out_date).toLocaleDateString(),
        checkOutTime: booking.check_out_time,
        guests: `${booking.adults} Adults, ${booking.children} Young Adults, ${booking.infants} Children`,
        paymentMethod: booking.booking_payment?.payment_method,
        downPayment: booking.booking_payment?.down_payment,
        totalAmount: booking.booking_payment?.total_amount,
        rentableItems,
        addonCategories,
        // No sign-in details here on purpose: at this point the booking is only
        // requested, and no account exists yet. They go out with the
        // confirmation, which is when the account is created.
      };

      // On the after() path there is no response left to report into, so the
      // log line from dispatchTransactionalEmail is the only record — which is
      // exactly why it carries the URL and the failure body. On the awaited
      // path this same result reaches the admin UI.
      return await dispatchTransactionalEmail(
        "pending approval",
        "/api/send-pending-email",
        emailData,
      );
    } catch (emailError) {
      // A mail failure must never fail an already-committed booking. But it
      // must not vanish either: an awaiting caller turns this into the owner's
      // warning, so report the reason rather than only logging it.
      console.error("❌ Email sending error:", emailError);
      return {
        kind: "pending approval",
        ok: false,
        detail: emailError instanceof Error ? emailError.message : String(emailError),
      };
    }
    };

    // Guests: fire-and-forget past the flushed response. Admins: await it, so
    // the 201 below can tell the owner the guest was never emailed.
    let pendingEmailStatus: EmailDispatchResult | null = null;
    if (opts.awaitPendingEmail) {
      pendingEmailStatus = await sendPendingEmail();
    } else {
      after(sendPendingEmail);
    }

    // The transaction was already committed above (before the email). Everything
    // from the COMMIT onward is post-commit, best-effort work — it must never
    // trigger a ROLLBACK / 500 for an already-persisted booking.
    console.log("🎉 [BOOKING] Booking creation complete - returning success response");
    console.log("📊 [BOOKING] Response includes:", {
      booking_id: completeResult.rows[0].booking_id,
      db_id: completeResult.rows[0].id,
      status: completeResult.rows[0].status,
      google_event_id: completeResult.rows[0].google_event_id,
    });

    return NextResponse.json(
      {
        success: true,
        data: completeResult.rows[0],
        message: "Booking created successfully. Waiting for admin approval.",
        // Only present for admin callers, who waited for the send. Null on the
        // guest path means "not measured" — never "it worked".
        emailStatus: pendingEmailStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("❌ [BOOKING] Error during rollback:", rollbackError);
    }

    console.error("❌ [BOOKING] Error creating booking:", error);

    const e = error as {
      message?: string;
      code?: string;
      detail?: string;
      constraint?: string;
      table?: string;
      column?: string;
    };

    // Provide detailed error information.
    //
    // ORDER MATTERS: a pg error IS an Error instance, so the old
    // `instanceof Error` branch ran first and shadowed every case below it —
    // which is how a guest came to be shown "current transaction is aborted,
    // commands ignored until end of transaction block" as if it were something
    // they could act on. Postgres text is for the log; the guest gets a
    // sentence about what to do next.
    let errorMessage = "Failed to create booking";
    let errorDetails = "";

    const pgCode = typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : null;

    if (pgCode === "23505") {
      // Unique constraint violation. Most often a double-tapped Submit, so
      // point the guest at My Bookings before they try a third time.
      errorMessage =
        "This booking looks like it was already submitted. Please check My Bookings " +
        "first — it may have gone through. If you don't see it there, message us and " +
        "we'll check for you.";
      errorDetails = `Constraint: ${e.constraint || "unknown"}`;
    } else if (pgCode === "23503") {
      // Foreign key constraint violation. "Invalid reference in booking data"
      // meant nothing to a guest and told them nothing to do next.
      errorMessage =
        "Something in your booking details didn't match our records. Don't worry — " +
        "your payment is safe with the host, and please DON'T pay again. Message us " +
        "your payment reference number and we'll finish the booking for you.";
      errorDetails = `Table: ${e.table || "unknown"}, Column: ${e.column || "unknown"}`;
    } else if (pgCode) {
      // The guest has ALREADY sent the down payment by hand before reaching
      // this point, so read this message as they will: anything resembling
      // "payment failed" reads as "my money is gone". It isn't — it went
      // straight to the host's GCash/BPI account and the site never touches
      // it. Lead with that, then stop them from paying a second time.
      errorMessage =
        "Don't worry — your payment is safe with the host. We just couldn't save " +
        "your booking. Please DON'T pay again. Tap Submit one more time. If it " +
        "still doesn't work, message us your payment reference number and we'll " +
        "finish the booking for you.";
      errorDetails = `${pgCode}: ${e.message || ""}${e.detail ? ` (${e.detail})` : ""}`;
      console.error("❌ [BOOKING] Postgres error:", errorDetails);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      console.error("❌ [BOOKING] Error message:", error.message);
      console.error("❌ [BOOKING] Error stack:", error.stack);
    } else if (typeof error === "object" && error !== null) {
      errorMessage = e.detail || JSON.stringify(error);
      errorDetails = JSON.stringify(error);
    }

    if (errorDetails) {
      console.error("📋 [BOOKING] Error details:", errorDetails);
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorDetails : undefined,
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
};

// GET All Bookings
export const getAllBookings = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const raw = searchParams.get("raw");

    // If raw=true, return only the booking table columns (no joins)
    if (raw === "true") {
      let rawQuery = `
        SELECT
          id,
          booking_id,
          user_id,
          room_name,
          check_in_date,
          check_out_date,
          check_in_time,
          check_out_time,
          adults,
          children,
          infants,
          status,
          rejection_reason,
          has_security_deposit,
          created_at,
          updated_at
        FROM booking
      `;

      const values: any[] = [];
      if (status) {
        rawQuery += " WHERE status = $1";
        values.push(status);
      }

      rawQuery += " ORDER BY created_at DESC";

      const result = await pool.query(rawQuery, values);
      return NextResponse.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
      });
    }

    // Default behavior: enriched booking data with joins
    let query = `
      SELECT
        b.*,
        bg.first_name as guest_first_name,
        bg.last_name as guest_last_name,
        bg.email as guest_email,
        bg.phone as guest_phone,
        bg.valid_id_url as valid_id_url,
        bg.age as guest_age,
        bg.gender as guest_gender,
        bg.facebook_link,
        bp.payment_method,
        bp.payment_proof_url,
        bp.payment_reference,
        bp.payment_status,
        bp.room_rate,
        bp.add_ons_total,
        bp.total_amount,
        bp.down_payment,
        bp.remaining_balance,
        COALESCE(bd.amount, 0) as security_deposit,
        bd.deposit_status,
        bd.payment_method as security_deposit_payment_method,
        bd.payment_proof_url as security_deposit_payment_proof_url,
        bd.notes as security_deposit_notes,
        bc.cleaning_status,
        -- Everyone beyond the main guest. The WHERE clause below pins this query
        -- to a single guest row, so without this the admin UI could only ever
        -- show guest 1 — a 3-pax booking looked identical to a solo one, and the
        -- other guests' uploaded IDs were unreachable from the portal.
        -- (booking_guests.id is a UUID, so the main guest is identified by the
        -- same ORDER BY guest_index, id expression used in the WHERE below.)
        COALESCE((
          SELECT json_agg(json_build_object(
            'first_name',   g.first_name,
            'last_name',    g.last_name,
            'age',          g.age,
            'gender',       g.gender,
            'valid_id_url', g.valid_id_url
          ) ORDER BY g.guest_index, g.id)
          FROM booking_guests g
          WHERE g.booking_id = b.id
            AND g.id <> (SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1)
        ), '[]'::json) AS additional_guests
      FROM booking b
      LEFT JOIN booking_guests bg ON b.id = bg.booking_id
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      LEFT JOIN booking_security_deposits bd ON b.id = bd.booking_id
      LEFT JOIN booking_cleaning bc ON b.id = bc.booking_id
      WHERE bg.id = (
        SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1
      )
    `;
    const values: string[] = [];

    if (status) {
      query += " AND b.status = $1";
      values.push(status);
    }

    query += " ORDER BY b.created_at DESC";

    const result = await pool.query(query, values);
    console.log(
      `✅ Retrieved ${result.rows.length} bookings from separated tables`,
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.log("❌ Error getting bookings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get bookings",
      },
      { status: 500 },
    );
  }
};

// GET Booking by ID
export const getBookingById = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const id = segments.pop() || segments.pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Booking ID is required" },
        { status: 400 },
      );
    }

    const query = `
      SELECT
        b.*,
        h.tower,
        h.uuid_id as haven_id,
        bp.total_amount,
        bp.down_payment,
        bp.remaining_balance,
        bp.payment_method,
        bp.payment_proof_url,
        bp.payment_status,
        bp.room_rate,
        bp.add_ons_total,
        COALESCE(bd.amount, 0) as security_deposit,
        bg.first_name as guest_first_name,
        bg.last_name as guest_last_name,
        bg.email as guest_email,
        bg.phone as guest_phone,
        bg.valid_id_url,
        bg.age as guest_age,
        bg.gender as guest_gender,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'firstName', g.first_name,
                'lastName', g.last_name,
                'age', g.age,
                'gender', g.gender,
                'email', g.email,
                'phone', g.phone,
                'facebook_link', g.facebook_link,
                'valid_id_url', g.valid_id_url
              ) ORDER BY g.guest_index, g.id
            ),
            '[]'
          )
          FROM booking_guests g
          WHERE g.booking_id = b.id
        ) as guests,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'name', ba.name,
                'price', ba.price,
                'quantity', ba.quantity
              ) ORDER BY ba.id
            ),
            '[]'
          ) as add_ons
          FROM booking_add_ons ba
          WHERE ba.booking_id = b.id
        ) as add_ons,
        COALESCE(
          json_agg(hi.image_url ORDER BY hi.display_order)
          FILTER (WHERE hi.id IS NOT NULL),
          '[]'
        ) as room_images
      FROM booking b
      LEFT JOIN havens h ON b.room_name = h.haven_name
      LEFT JOIN haven_images hi ON h.uuid_id = hi.haven_id
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      LEFT JOIN booking_guests bg ON bg.id = (
        SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id ASC LIMIT 1
      )
      LEFT JOIN booking_security_deposits bd ON b.id = bd.booking_id
      WHERE (b.id::text = $1 OR b.booking_id = $1)
      GROUP BY b.id, h.tower, h.uuid_id, bp.total_amount, bp.down_payment, bp.remaining_balance, bp.payment_method, bp.payment_proof_url, bp.payment_status, bp.room_rate, bp.add_ons_total, bg.first_name, bg.last_name, bg.email, bg.phone, bg.valid_id_url, bg.age, bg.gender, bd.amount
      LIMIT 1
    `;
    const bookingResult = await pool.query(query, [id]);

    if (bookingResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    const booking = bookingResult.rows[0];

    // Secondary lookups key on the booking UUID (booking.id), which the main
    // query resolved — not the URL param (which may be the friendly booking_id).
    const bookingUuid = booking.id;

    // Get all guests
    const guestsQuery = `
      SELECT * FROM booking_guests
      WHERE booking_id = $1
      ORDER BY id ASC
    `;
    const guestsResult = await pool.query(guestsQuery, [bookingUuid]);

    // Get payment info
    const paymentQuery = `
      SELECT * FROM booking_payments
      WHERE booking_id = $1
      LIMIT 1
    `;
    const paymentResult = await pool.query(paymentQuery, [bookingUuid]);

    // Get security deposit
    const depositQuery = `
      SELECT * FROM booking_security_deposits
      WHERE booking_id = $1
      LIMIT 1
    `;
    const depositResult = await pool.query(depositQuery, [bookingUuid]);

    // Get add-ons
    const addOnsQuery = `
      SELECT * FROM booking_add_ons
      WHERE booking_id = $1
      ORDER BY name ASC
    `;
    const addOnsResult = await pool.query(addOnsQuery, [bookingUuid]);

    // Get cleaning info
    const cleaningQuery = `
      SELECT * FROM booking_cleaning
      WHERE booking_id = $1
      LIMIT 1
    `;
    const cleaningResult = await pool.query(cleaningQuery, [bookingUuid]);

    // Combine all data — always use guestsResult.rows[0] as the authoritative main guest
    const mainGuest = guestsResult.rows[0] || null;
    const completeBooking = {
      ...booking,
      guest_first_name: mainGuest?.first_name ?? booking.guest_first_name,
      guest_last_name: mainGuest?.last_name ?? booking.guest_last_name,
      guest_email: mainGuest?.email ?? booking.guest_email,
      guest_phone: mainGuest?.phone ?? booking.guest_phone,
      guest_age: mainGuest?.age ?? booking.guest_age,
      guest_gender: mainGuest?.gender ?? booking.guest_gender,
      valid_id_url: mainGuest?.valid_id_url ?? booking.valid_id_url,
      facebook_link: mainGuest?.facebook_link ?? booking.facebook_link,
      guests: guestsResult.rows,
      main_guest: mainGuest,
      additional_guests: guestsResult.rows.slice(1),
      payment: paymentResult.rows[0] || null,
      security_deposit: depositResult.rows[0] || null,
      add_ons: addOnsResult.rows,
      cleaning: cleaningResult.rows[0] || null,
    };

    console.log(`✅ Retrieved complete booking data for ${id}`);

    return NextResponse.json({
      success: true,
      data: completeBooking,
    });
  } catch (error) {
    console.log("❌ Error getting booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get booking",
      },
      { status: 500 },
    );
  }
};

// UPDATE Booking Status (Approve/Reject)
export const updateBookingStatus = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const body = await req.json();
    const { id, status, rejection_reason } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking ID is required",
        },
        { status: 400 },
      );
    }

    // If status is provided, validate it
    const validStatuses = [
      "pending", "approved", "rejected", "confirmed",
      "on-going", "checked-in", "completed", "cancelled",
    ];
    if (typeof status !== "undefined" && status !== null) {
      if (typeof status !== "string" || !validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: "Invalid status" },
          { status: 400 },
        );
      }
    }

    // ✅ FIXED: Added ::uuid casting
    const query = `
      UPDATE booking
      SET status = $1, rejection_reason = $2, updated_at = NOW()
      WHERE id::text = $3 OR booking_id = $3
      RETURNING *
    `;

    const values = [status, rejection_reason ?? null, id];
    const result = await pool.query(query, values);

    // NOTE: approving a booking no longer auto-approves the down payment.
    // Per the "pay after approval" flow, the host pre-approves the booking
    // (status → approved) and the guest THEN pays the down payment, which is
    // approved separately once verified. Auto-flipping here made the payment
    // state lie ("Confirmed" while the guest still owed the down payment).

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking not found",
        },
        { status: 404 },
      );
    }

    console.log("✅ Booking status updated:", result.rows[0]);

    // Get booking details with guest info for email
    const bookingDetailsQuery = `
      SELECT
        b.*,
        bg.first_name,
        bg.last_name,
        bg.email,
        bg.valid_id_url,
        bp.payment_method,
        bp.total_amount,
        bp.down_payment,
        bp.remaining_balance,
        h.security_deposit AS haven_security_deposit,
        h.deposit_tier1_amount,
        h.deposit_tier2_amount,
        h.deposit_tier3_amount,
        h.deposit_tier4_amount
      FROM booking b
      JOIN booking_guests bg ON b.id = bg.booking_id
      JOIN booking_payments bp ON b.id = bp.booking_id
      LEFT JOIN havens h ON h.haven_name = b.room_name
      WHERE b.id = $1 AND bg.id = (
        SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1
      )
      LIMIT 1
    `;

    const bookingDetailsResult = await pool.query(bookingDetailsQuery, [id]);

    // Send status for whichever email this status change triggers, returned to
    // the caller below. `null` means this status doesn't send one at all (e.g.
    // checked-in — the house rules go out from the Collect step instead), which
    // is different from "tried and failed" and must not read as an error.
    let emailStatus: EmailDispatchResult | null = null;

    // The query above INNER JOINs booking_guests and booking_payments, so a
    // booking missing either row yields no rows and every branch below is
    // skipped. That used to happen in total silence; say so instead.
    const emailSends = ["approved", "rejected", "completed", "checked-out"];
    if (
      typeof status === "string" &&
      emailSends.includes(status) &&
      bookingDetailsResult.rows.length === 0
    ) {
      console.error(
        `❌ No email for ${status}: booking ${id} has no guest and/or payment row`,
      );
      emailStatus = {
        kind: status,
        ok: false,
        detail:
          "This booking has no guest or payment record, so no email could be addressed.",
      };
    }

    // Send confirmation email when booking is approved
    if (status === "approved" && bookingDetailsResult.rows.length > 0) {
      try {
        const booking = bookingDetailsResult.rows[0];

        // Fetch add-ons (formerly "rentable items") for the pamphlet,
        // grouped by category. Falls back to flat list if migration missing.
        let rentableItems: { name: string; icon: string; price_per_night: number }[] = [];
        let addonCategories: {
          id: string;
          name: string;
          icon: string;
          items: { name: string; icon: string; price_per_night: number }[];
        }[] = [];
        try {
          const catRes = await pool.query(
            `SELECT
               c.id::text, c.name, c.icon,
               COALESCE(
                 (
                   SELECT json_agg(
                     json_build_object('name', i.name, 'icon', i.icon, 'price_per_night', i.price_per_night)
                     ORDER BY i.id
                   )
                   FROM haven_rentable_items i
                   WHERE i.category_id = c.id AND i.is_active = true
                 ),
                 '[]'::json
               ) AS items
             FROM haven_addon_categories c
             INNER JOIN havens h ON h.uuid_id = c.haven_id
             WHERE h.haven_name = $1
             ORDER BY c.sort_order ASC, c.created_at ASC`,
            [booking.room_name],
          );
          addonCategories = catRes.rows.map((r) => ({
            id: r.id,
            name: r.name,
            icon: r.icon,
            items: r.items || [],
          }));
          try {
            const uncatRes = await pool.query(
              `SELECT ri.name, ri.icon, ri.price_per_night
               FROM haven_rentable_items ri
               INNER JOIN havens h ON h.uuid_id = ri.haven_id
               WHERE h.haven_name = $1 AND ri.is_active = true AND ri.category_id IS NULL
               ORDER BY ri.id ASC`,
              [booking.room_name],
            );
            rentableItems = uncatRes.rows;
          } catch {
            const allRes = await pool.query(
              `SELECT ri.name, ri.icon, ri.price_per_night
               FROM haven_rentable_items ri
               INNER JOIN havens h ON h.uuid_id = ri.haven_id
               WHERE h.haven_name = $1 AND ri.is_active = true
               ORDER BY ri.id ASC`,
              [booking.room_name],
            );
            rentableItems = allRes.rows;
          }
        } catch (rentErr) {
          console.error("⚠️ Could not fetch add-ons for pamphlet:", rentErr);
        }

        // THIS is where a guest's account comes into being — on confirmation,
        // not at booking time. A request that never gets approved leaves no
        // login behind, and until there is a confirmed stay there is nothing
        // to sign in and look at.
        //
        // Runs only for a booking with no owner yet (a guest who checked out
        // without signing in). Account creation and the user_id backfill share
        // one transaction so the booking can never point at an account that
        // failed to commit.
        //
        // Best-effort by design: if any of it fails the guest still gets their
        // confirmation, just without sign-in details, and the booking stays
        // reachable by its emailed link. Never hold up a confirmation for it.
        // The plaintext password to show the guest, or null to omit the block.
        let signInPassword: string | null = null;
        if (!booking.user_id && booking.email) {
          const acctClient = await pool.connect();
          try {
            await acctClient.query("BEGIN");
            const guestName =
              `${booking.first_name || ""} ${booking.last_name || ""}`.trim() || booking.email;
            const account = await resolveOrCreateGuestAccount(
              acctClient,
              booking.email,
              guestName,
            );
            await acctClient.query(
              `UPDATE booking SET user_id = $1, updated_at = NOW() WHERE id = $2`,
              [account.userId, booking.id],
            );
            await acctClient.query("COMMIT");

            // Show the password we just set. For a REUSED account we have no
            // plaintext — the stored value is a hash — so the only case we can
            // still help with is an account sitting on the configured shared
            // password, which we can test for. A reused account on its own
            // password (or on a random one issued while the env var was unset)
            // correctly gets no sign-in block: we cannot recover it, and
            // guessing would be worse than staying quiet.
            signInPassword = account.password;
            if (!account.created && GUEST_DEFAULT_PASSWORD) {
              const acct = await pool.query(
                `SELECT password FROM users WHERE user_id = $1 LIMIT 1`,
                [account.userId],
              );
              if (
                acct.rows[0]?.password &&
                (await bcrypt.compare(GUEST_DEFAULT_PASSWORD, acct.rows[0].password))
              ) {
                signInPassword = GUEST_DEFAULT_PASSWORD;
              }
            }
            console.log(
              `👤 [BOOKING] ${booking.booking_id}: guest account ${account.created ? "created" : "reused"} on confirmation`,
            );
          } catch (acctErr) {
            try { await acctClient.query("ROLLBACK"); } catch { /* already broken */ }
            console.error(
              `⚠️ [BOOKING] ${booking.booking_id}: could not create the guest account on confirmation — ` +
                `sending the confirmation without sign-in details:`,
              acctErr,
            );
          } finally {
            acctClient.release();
          }
        }

        const emailData = {
          firstName: booking.first_name,
          lastName: booking.last_name,
          email: booking.email,
          // Set when this confirmation just created the guest's account (or
          // reused one still on the starting password).
          newAccountPassword: signInPassword ?? undefined,
          bookingId: booking.booking_id,
          roomName: booking.room_name,
          checkInDate: new Date(booking.check_in_date).toLocaleDateString(),
          checkInTime: booking.check_in_time,
          checkOutDate: new Date(booking.check_out_date).toLocaleDateString(),
          checkOutTime: booking.check_out_time,
          // Raw ISO dates alongside the display-formatted ones above — the
          // email route needs these to compute the nights-tiered security
          // deposit (securityDepositFor()) and a locale-formatted string
          // can't be safely re-parsed for that.
          checkInDateRaw: booking.check_in_date,
          checkOutDateRaw: booking.check_out_date,
          guests: `${booking.adults} Adults, ${booking.children} Young Adults, ${booking.infants} Children`,
          paymentMethod: booking.payment_method,
          downPayment: booking.down_payment,
          totalAmount: booking.total_amount,
          rentableItems,
          addonCategories,
          // Haven's owner-configured deposit tiers, for securityDepositFor().
          securityDeposit: booking.haven_security_deposit,
          depositTier1Amount: booking.deposit_tier1_amount,
          depositTier2Amount: booking.deposit_tier2_amount,
          depositTier3Amount: booking.deposit_tier3_amount,
          depositTier4Amount: booking.deposit_tier4_amount,
        };

        // Send email via API route
        emailStatus = await dispatchTransactionalEmail(
          "confirmation",
          "/api/send-booking-email",
          emailData,
        );
      } catch (emailError) {
        // Anything that threw while ASSEMBLING the payload (the add-ons
        // lookups above) lands here — the send itself no longer throws.
        // Don't fail the whole request if email fails.
        console.error("❌ Email sending error:", emailError);
        emailStatus = {
          kind: "confirmation",
          ok: false,
          detail:
            emailError instanceof Error
              ? emailError.message
              : "Could not build the confirmation email",
        };
      }
    }

    // Send rejection email when booking is rejected
    if (status === "rejected" && bookingDetailsResult.rows.length > 0) {
      try {
        const booking = bookingDetailsResult.rows[0];

        const emailData = {
          firstName: booking.first_name,
          lastName: booking.last_name,
          email: booking.email,
          bookingId: booking.booking_id,
          roomName: booking.room_name,
          checkInDate: booking.check_in_date
            ? new Date(booking.check_in_date).toLocaleDateString()
            : "",
          checkInTime: booking.check_in_time,
          checkOutDate: booking.check_out_date
            ? new Date(booking.check_out_date).toLocaleDateString()
            : "",
          checkOutTime: booking.check_out_time,
          rejectionReason: rejection_reason ?? booking.rejection_reason ?? "",
        };

        emailStatus = await dispatchTransactionalEmail(
          "rejection",
          "/api/send-rejection-email",
          emailData,
        );
      } catch (emailError) {
        console.error("❌ Email sending error:", emailError);
        emailStatus = {
          kind: "rejection",
          ok: false,
          detail:
            emailError instanceof Error
              ? emailError.message
              : "Could not build the rejection email",
        };
      }
    }

    // The welcome / house-rules email is NOT sent on the status change.
    // Check-in and payment are separate steps now: staff mark the guest arrived
    // as soon as the check-in window opens, then collect the balance and
    // deposit in person. The house rules belong with that second step, so it's
    // triggered from there via /api/send-checkin-email/for-booking/[id].

    // Send thank-you / check-out email when the guest checks out
    if ((status === "completed" || status === "checked-out") && bookingDetailsResult.rows.length > 0) {
      try {
        const booking = bookingDetailsResult.rows[0];
        const emailData = {
          firstName: booking.first_name,
          lastName: booking.last_name,
          email: booking.email,
          bookingId: booking.booking_id,
          roomName: booking.room_name,
          checkInDate: booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString() : "",
          checkOutDate: booking.check_out_date ? new Date(booking.check_out_date).toLocaleDateString() : "",
          totalAmount: booking.total_amount,
          remainingBalance: Number(booking.remaining_balance ?? 0),
        };
        emailStatus = await dispatchTransactionalEmail(
          "check-out",
          "/api/send-checkout-email",
          emailData,
        );
      } catch (emailError) {
        console.error("❌ Email sending error:", emailError);
        emailStatus = {
          kind: "check-out",
          ok: false,
          detail:
            emailError instanceof Error
              ? emailError.message
              : "Could not build the check-out email",
        };
      }
    }

    // Repaint the calendar event with the new status (its label AND its colour
    // are derived from it). `id` may be either form of key, so use the UUID the
    // UPDATE returned.
    after(async () => {
      await pushCalendarUpdate(result.rows[0].id);
    });

    return NextResponse.json({
      success: true,
      data: result.rows[0],
      message:
        typeof status === "string"
          ? `Booking ${status} successfully`
          : "Booking updated successfully",
      // The status change itself succeeded regardless — this only reports
      // whether the guest was actually told. Null when no email applies.
      emailStatus,
    });
  } catch (error) {
    console.log("❌ Error updating booking status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update booking status",
      },
      { status: 500 },
    );
  }
};

// DELETE Booking
export const deleteBooking = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking ID is required",
        },
        { status: 400 },
      );
    }

    const query = `DELETE FROM booking WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking not found",
        },
        { status: 404 },
      );
    }

    console.log("✅ Booking deleted (cascade):", result.rows[0]);

    return NextResponse.json({
      success: true,
      data: result.rows[0],
      message: "Booking deleted successfully",
    });
  } catch (error) {
    console.log("❌ Error deleting booking:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete booking",
      },
      { status: 500 },
    );
  }
};

// GET User's Bookings
export const getUserBookings = async (
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> => {
  const { userId } = await params;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    // ✅ FIXED: Added ::uuid casting
    let query = `
      SELECT 
        b.*,
        h.tower,
        h.uuid_id as haven_id,
        bp.total_amount,
        bp.down_payment,
        bp.remaining_balance,
        bp.payment_method,
        bp.payment_status,
        bp.room_rate,
        bp.add_ons_total,
        COALESCE(bd.amount, 0) as security_deposit,
        EXISTS(SELECT 1 FROM reviews r WHERE r.booking_id = b.id) as has_reviewed,
        bg.first_name as guest_first_name,
        bg.last_name as guest_last_name,
        bg.email as guest_email,
        COALESCE(
          json_agg(hi.image_url ORDER BY hi.display_order)
          FILTER (WHERE hi.id IS NOT NULL),
          '[]'
        ) as room_images
      FROM booking b
      LEFT JOIN havens h ON b.room_name = h.haven_name
      LEFT JOIN haven_images hi ON h.uuid_id = hi.haven_id
      LEFT JOIN booking_payments bp ON b.id = bp.booking_id
      LEFT JOIN booking_guests bg ON b.id = bg.booking_id
      LEFT JOIN booking_security_deposits bd ON b.id = bd.booking_id
      WHERE b.user_id = $1
    `;

    const values: string[] = [userId];

    if (status && status !== "all") {
      if (status === "upcoming") {
        query += ` AND b.status IN ('pending', 'approved', 'confirmed') AND b.check_in_date >= CURRENT_DATE`;
      } else if (status === "past") {
        query += ` AND (b.status = 'completed' OR b.check_out_date < CURRENT_DATE)`;
      } else if (status === "cancelled") {
        query += ` AND b.status = 'cancelled'`;
      } else {
        query += ` AND b.status = $2`;
        values.push(status);
      }
    }

    query += ` GROUP BY b.id, h.tower, h.uuid_id, bp.total_amount, bp.down_payment, bp.remaining_balance, bp.payment_method, bp.payment_status, bp.room_rate, bp.add_ons_total, bg.first_name, bg.last_name, bg.email, bd.amount ORDER BY b.created_at DESC`;

    const result = await pool.query(query, values);
    console.log(
      `✅ Retrieved ${result.rows.length} bookings for user ${userId}`,
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.log("❌ Error fetching user bookings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch user bookings",
      },
      { status: 500 },
    );
  }
};

// UPDATE Cleaning Status
export const updateCleaningStatus = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const cleaningIndex = segments.indexOf("cleaning");
    const id = cleaningIndex > 0 ? segments[cleaningIndex - 1] : null;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Booking ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { cleaning_status } = body;

    const validCleaningStatuses = [
      "pending",
      "assigned",
      "in-progress",
      "cleaned",
      "inspected",
    ];
    if (!cleaning_status || !validCleaningStatuses.includes(cleaning_status)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid cleaning status. Must be one of: pending, assigned, in-progress, cleaned, inspected",
        },
        { status: 400 },
      );
    }

    // Update the cleaning status in the booking_cleaning table
    const cleaningQuery = `
      UPDATE booking_cleaning
      SET cleaning_status = $1,
          cleaned_at = CASE WHEN $1 = 'cleaned' THEN NOW() ELSE cleaned_at END,
          inspected_at = CASE WHEN $1 = 'inspected' THEN NOW() ELSE inspected_at END
      WHERE booking_id = $2
      RETURNING *
    `;

    const cleaningResult = await pool.query(cleaningQuery, [
      cleaning_status,
      id,
    ]);

    if (cleaningResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Booking cleaning record not found" },
        { status: 404 },
      );
    }

    // Get the complete booking data for response
    const bookingQuery = `
      SELECT
        b.*,
        bg.first_name,
        bg.last_name,
        bg.email,
        bg.phone,
        bg.valid_id_url,
        bp.payment_method,
        bp.total_amount,
        bc.cleaning_status
      FROM booking b
      JOIN booking_guests bg ON b.id = bg.booking_id
      JOIN booking_payments bp ON b.id = bp.booking_id
      JOIN booking_cleaning bc ON b.id = bc.booking_id
      WHERE b.id = $1 AND bg.id = (
        SELECT id FROM booking_guests WHERE booking_id = b.id ORDER BY guest_index, id LIMIT 1
      )
      LIMIT 1
    `;

    const bookingResult = await pool.query(bookingQuery, [id]);

    console.log("✅ Cleaning status updated:", cleaningResult.rows[0]);

    return NextResponse.json({
      success: true,
      data: bookingResult.rows[0],
      message: `Cleaning status updated to ${cleaning_status}`,
    });
  } catch (error) {
    console.log("❌ Error updating cleaning status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update cleaning status",
      },
      { status: 500 },
    );
  }
};

// SYNC Bookings to Google Calendar.
//
// Default: create events for bookings that have no google_event_id.
// ?refresh=1: ALSO rewrite the events that already exist, so bookings changed
// before the calendar had an update path (every one of which still shows its
// original status, times and amounts) get repainted in one pass.
// ?booking_id=DL-BK…: restrict the run to that one booking, creating or
// rewriting just its event.
export const syncCalendarBookings = async (
  req: NextRequest,
): Promise<NextResponse> => {
  try {
    const params = new URL(req.url).searchParams;
    const refresh = params.get("refresh") === "1";
    // Optional: limit the run to one booking (accepts either key form), so a
    // single stale event can be repaired without touching the whole calendar.
    const only = params.get("booking_id");

    const where = only
      ? `WHERE (b.booking_id = $1 OR b.id::text = $1)`
      : refresh
        ? ``
        : `WHERE b.google_event_id IS NULL`;

    const bookings = (
      await pool.query(
        `${CALENDAR_BOOKING_SELECT} ${where} ORDER BY b.created_at ASC`,
        only ? [only] : [],
      )
    ).rows;

    console.log(
      refresh
        ? `📅 [SYNC] Refresh mode — ${bookings.length} booking(s) to create or update`
        : `📅 [SYNC] Found ${bookings.length} booking(s) without google_event_id`,
    );

    if (bookings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All bookings are already synced to Google Calendar.",
        synced: 0,
        failed: 0,
        total: 0,
      });
    }

    // Check credentials early so we can fail fast with a clear message
    const missingEnvVars: string[] = [];
    if (!process.env.GOOGLE_CLIENT_EMAIL_CALENDAR) missingEnvVars.push("GOOGLE_CLIENT_EMAIL_CALENDAR");
    if (!process.env.GOOGLE_PRIVATE_KEY_CALENDAR) missingEnvVars.push("GOOGLE_PRIVATE_KEY_CALENDAR");
    if (!process.env.GOOGLE_CALENDAR_ID) missingEnvVars.push("GOOGLE_CALENDAR_ID");

    if (missingEnvVars.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing environment variables: ${missingEnvVars.join(", ")}. Google Calendar sync cannot run without them.`,
          synced: 0,
          failed: bookings.length,
          total: bookings.length,
        },
        { status: 500 },
      );
    }

    let synced = 0;
    let updated = 0;
    let failed = 0;
    const results: {
      booking_id: string;
      status: "synced" | "updated" | "failed";
      google_event_id?: string;
      error?: string;
      html_link?: string;
      calendar_id?: string;
    }[] = [];

    // Process one at a time to avoid Google API rate limits
    for (const booking of bookings) {
      const calendarEventData: CalendarEventData = toCalendarEventData(booking);

      // Already has an event (only reachable in refresh mode) — rewrite it in
      // place rather than creating a duplicate.
      if (booking.google_event_id) {
        const { ok, gone, error: updateError } = await updateCalendarEvent(booking.google_event_id, calendarEventData);
        if (ok) {
          updated++;
          results.push({ booking_id: booking.booking_id, status: "updated", google_event_id: booking.google_event_id });
          continue;
        }
        if (!gone) {
          failed++;
          results.push({ booking_id: booking.booking_id, status: "failed", error: updateError ?? "Unknown error" });
          continue;
        }
        // Event was deleted on Google's side — drop the dead id and fall
        // through to the create path below so the booking gets an event again.
        await pool.query(`UPDATE booking SET google_event_id = NULL, updated_at = NOW() WHERE id = $1`, [booking.id]);
        console.warn(`⚠️ [SYNC] Event for ${booking.booking_id} is gone — recreating.`);
      }

      const { id: googleEventId, htmlLink, calendarId: usedCalendarId, error: calendarError } = await createCalendarEventWithResult(calendarEventData);

      if (googleEventId) {
        await pool.query(
          `UPDATE booking SET google_event_id = $1, updated_at = NOW() WHERE id = $2`,
          [googleEventId, booking.id],
        );
        synced++;
        results.push({ booking_id: booking.booking_id, status: "synced", google_event_id: googleEventId, html_link: htmlLink ?? undefined, calendar_id: usedCalendarId ?? undefined });
        console.log(`✅ [SYNC] Synced booking ${booking.booking_id} → Calendar: ${usedCalendarId}, Event: ${htmlLink}`);
      } else {
        failed++;
        results.push({ booking_id: booking.booking_id, status: "failed", error: calendarError ?? "Unknown error" });
        console.warn(`⚠️ [SYNC] Failed booking ${booking.booking_id}: ${calendarError}`);

        // If the very first booking fails with an auth/network error, stop early — all will fail for the same reason
        if (failed === 1 && calendarError && (
          calendarError.includes("Auth failed") ||
          calendarError.includes("Network error") ||
          calendarError.includes("Calendar not found") ||
          calendarError.includes("Missing GOOGLE_CALENDAR_ID")
        )) {
          console.error(`❌ [SYNC] Stopping early — persistent error detected: ${calendarError}`);
          return NextResponse.json({
            success: false,
            message: `Sync stopped after first failure. Reason: ${calendarError}`,
            synced,
            failed: bookings.length,
            total: bookings.length,
            error: calendarError,
            results,
          });
        }
      }
    }

    console.log(`📅 [SYNC] Done. Created: ${synced}, Updated: ${updated}, Failed: ${failed}, Total: ${bookings.length}`);

    // Collect unique error messages from failures for the summary
    const uniqueErrors = [...new Set(results.filter((r) => r.error).map((r) => r.error))];

    return NextResponse.json({
      success: synced + updated > 0,
      message: `Synced ${synced + updated} of ${bookings.length} booking(s) to Google Calendar${refresh ? ` (${synced} created, ${updated} updated)` : ""}.`,
      synced,
      updated,
      failed,
      total: bookings.length,
      ...(uniqueErrors.length > 0 && { errors: uniqueErrors }),
      results,
    });
  } catch (error) {
    console.error("❌ [SYNC] Error syncing bookings to calendar:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync bookings to Google Calendar",
      },
      { status: 500 },
    );
  }
};

// GET Room/Haven Bookings (for checking availability)
export const getRoomBookings = async (
  req: NextRequest,
  { params }: { params: Promise<{ havenId: string }> },
): Promise<NextResponse> => {
  const { havenId } = await params;

  try {
    // First, get the room name from havens table using havenId
    const havenQuery = `SELECT haven_name FROM havens WHERE uuid_id = $1`;
    const havenResult = await pool.query(havenQuery, [havenId]);

    if (havenResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Haven not found",
        },
        { status: 404 },
      );
    }

    const roomName = havenResult.rows[0].haven_name.trim();

    // Get all active bookings for this room from the new booking table
    // Use TRIM to handle any whitespace issues in room_name
    // Only block dates for bookings with status: pending, approved, confirmed, checked-in
    // Don't block dates for rejected, cancelled, completed bookings
    const query = `
      SELECT
        id,
        booking_id,
        check_in_date,
        check_out_date,
        -- Times are essential, not decoration: createBooking's availability
        -- check is time-aware (a 7am–5pm daycation and a 7pm–5am nightcation
        -- coexist on one date), so a calendar that sees only dates greys out
        -- slots the server would happily accept.
        check_in_time,
        check_out_time,
        status,
        room_name
      FROM booking
      -- Match on the haven name, tolerating curly vs straight apostrophes
      -- (bookings created from mock data use a straight ' ).
      WHERE REPLACE(TRIM(room_name), '’', '''') = REPLACE($1, '’', '''')
        AND ${occupyingBookingSql("booking")}
      ORDER BY check_in_date ASC
    `;

    const result = await pool.query(query, [roomName]);

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.log("❌ Error fetching room bookings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch room bookings",
      },
      { status: 500 },
    );
  }
};