import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { sniffImageMime } from "@/backend/utils/imageGuard";
import { generateGuestRecordPDF, type GuestRecordGuest } from "@/backend/utils/pdfGenerators";

// Fetching runs server-side on purpose: the ID photos are Cloudinary URLs, and
// pulling them here avoids relying on cross-origin fetches from the browser —
// and keeps the documents off the client until the PDF itself is downloaded.
export const maxDuration = 60;

// Guests aged 10+ must present an ID; under-10s are exempt. Mirrors the rule
// enforced at checkout (see fieldErrors in src/app/checkout/page.tsx).
const ID_REQUIRED_FROM_AGE = 10;

// A booking's ID photos are stored newline-separated in one column.
const splitUrls = (v: unknown): string[] =>
  String(v ?? "").split("\n").map((u) => u.trim()).filter(Boolean);

// Download an image and inline it as a data URL for jsPDF. Returns null rather
// than throwing: one unreachable photo must not cost the host the whole record.
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[guest-record] ${res.status} fetching ID image ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // Trust the bytes, not the URL extension — jsPDF needs the real format.
    const mime = sniffImageMime(buf);
    if (!mime) {
      console.warn(`[guest-record] not a supported image: ${url}`);
      return null;
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (err) {
    console.warn(`[guest-record] failed to fetch ID image ${url}:`, err);
    return null;
  }
}

// GET /api/bookings/[id]/guest-record — admin-only PDF dossier for one booking:
// page 1 the booking, then one page per guest with their valid ID.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  try {
    const bookingRes = await pool.query(
      `SELECT b.booking_id, b.status, b.room_name,
              b.check_in_date, b.check_out_date, b.check_in_time, b.check_out_time,
              bp.total_amount, bp.down_payment, bp.remaining_balance,
              bp.payment_method, bp.payment_reference,
              (SELECT amount FROM booking_security_deposits
                WHERE booking_id = b.id ORDER BY id LIMIT 1) AS security_deposit
         FROM booking b
         LEFT JOIN booking_payments bp ON bp.booking_id = b.id
        WHERE b.booking_id = $1 OR b.id::text = $1
        LIMIT 1`,
      [id],
    );

    if (bookingRes.rowCount === 0) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }
    const b = bookingRes.rows[0];

    // guest_index orders these: 0 is the booker, then the rest as entered.
    const guestsRes = await pool.query(
      `SELECT g.first_name, g.last_name, g.age, g.gender, g.email, g.phone, g.valid_id_url
         FROM booking_guests g
         JOIN booking bk ON bk.id = g.booking_id
        WHERE bk.booking_id = $1 OR bk.id::text = $1
        ORDER BY g.guest_index, g.id`,
      [id],
    );

    const guests: GuestRecordGuest[] = [];
    for (const [i, g] of guestsRes.rows.entries()) {
      const urls = splitUrls(g.valid_id_url);
      const images = (await Promise.all(urls.map(toDataUrl))).filter((d): d is string => !!d);
      const age = g.age == null ? "" : String(g.age);
      guests.push({
        name: `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim(),
        role: i === 0 ? "Booked by" : `Guest ${i + 1}`,
        age,
        gender: String(g.gender ?? ""),
        idImages: images,
        idRequired: g.age == null || Number(g.age) >= ID_REQUIRED_FROM_AGE,
      });
    }

    const iso = (d: unknown) => (d ? new Date(String(d)).toISOString().slice(0, 10) : "");
    const nights = (() => {
      const a = new Date(String(b.check_in_date)).getTime();
      const c = new Date(String(b.check_out_date)).getTime();
      const n = Math.round((c - a) / 86400000);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })();

    const pdfBuffer = await generateGuestRecordPDF({
      bookingId: String(b.booking_id),
      status: String(b.status ?? ""),
      roomName: String(b.room_name ?? ""),
      checkInDate: iso(b.check_in_date),
      checkOutDate: iso(b.check_out_date),
      checkInTime: b.check_in_time ? String(b.check_in_time).slice(0, 5) : undefined,
      checkOutTime: b.check_out_time ? String(b.check_out_time).slice(0, 5) : undefined,
      nights,
      contactEmail: String(guestsRes.rows[0]?.email ?? ""),
      contactPhone: String(guestsRes.rows[0]?.phone ?? ""),
      totalAmount: Number(b.total_amount ?? 0),
      downPayment: Number(b.down_payment ?? 0),
      remainingBalance: Number(b.remaining_balance ?? 0),
      securityDeposit: Number(b.security_deposit ?? 0),
      paymentMethod: String(b.payment_method ?? ""),
      paymentReference: String(b.payment_reference ?? ""),
      guests,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="guest-record-${b.booking_id}.pdf"`,
        // Contains identity documents — never let a proxy or the browser keep it.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    console.error("[guest-record] failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build guest record" },
      { status: 500 },
    );
  }
}
