import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";
import { validateDiscount, resolvePromoIdentity, promoRedemptionEmail } from "@/backend/utils/validateDiscount";
import { rateLimit, clientIp, tooManyRequests } from "@/backend/utils/rateLimit";
import { loadActiveSeasons } from "@/lib/availability";
import { addDaysISO, promoBlockingSeason } from "@/lib/pricing";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Validates a guest-entered promo code at checkout. The rules live in
// validateDiscount() so this endpoint and the booking submit enforce exactly
// the same thing — checking here alone was decorative, since submit accepted
// whatever the browser sent.
export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  try {
    const body = await req.json();

    // The identity the one-use-per-guest rule is keyed on.
    //
    // user_id used to be read straight off the body, which made the check
    // opt-in: a signed-in guest could drop the field and the "already used"
    // lookup was skipped. It comes from the session now and nowhere else.
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

    // Product requirement: claiming a promo needs an account, on top of (not
    // instead of) the email-based "already redeemed" tracking below — that
    // tracking still matters once someone IS signed in (an old guest booking
    // under the same address must still count). Belongs here, not inside
    // validateDiscount() itself: that function is the shared "is this code
    // valid for this identity" check, and createBooking's own re-validation at
    // submit needs to keep working for bookings this route never saw.
    if (!sessionUserId) {
      return NextResponse.json({ success: false, error: "Please log in to claim this promo." }, { status: 401 });
    }

    // Resolved the same way createBooking resolves it, so a code this endpoint
    // calls valid is checked against exactly the same person at submit.
    const identity = await resolvePromoIdentity(pool, sessionUserId, body?.guest_email as string);

    // This endpoint now answers "has this address used this code", so it is a
    // probing surface as well as a validation one. Same shape as the limits on
    // forgot-password: a wide per-IP bucket, a tighter per-address one.
    const ip = clientIp(req);
    const byIp = rateLimit(`promo:ip:${ip}`, 30, 10 * 60 * 1000);
    if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);
    const emailKey = promoRedemptionEmail(identity);
    if (emailKey) {
      const byEmail = rateLimit(`promo:email:${emailKey}`, 15, 10 * 60 * 1000);
      if (!byEmail.ok) return tooManyRequests(byEmail.retryAfterSec);
    }

    // Seasonal rates don't stack with promos unless the season allows them.
    // Preview only, like `nights` below — createBooking enforces it at submit.
    const checkIn = typeof body?.check_in_date === "string" && ISO_DATE.test(body.check_in_date) ? body.check_in_date : null;
    if (checkIn) {
      const stayType = body?.stay_type === "10" ? "10" : "21";
      const nights = stayType === "10" ? 1 : Math.max(1, Math.floor(Number(body?.nights) || 1));
      const seasons = await loadActiveSeasons(pool, { fromISO: checkIn, toISO: addDaysISO(checkIn, nights - 1) });
      const blocking = promoBlockingSeason(stayType, checkIn, nights, seasons);
      if (blocking) {
        return NextResponse.json({ success: false, error: `Promos don't apply to ${blocking.name} dates.` }, { status: 400 });
      }
    }

    const result = await validateDiscount({
      db: pool,
      code: (body?.code as string) || "",
      havenId: (body?.haven_id as string) || null,
      ...identity,
      amount: Number(body?.amount) || 0,
      // Preview only — nothing is charged off this endpoint, so taking the
      // guest's night count at face value here is harmless. createBooking
      // derives its own from the dates before any money is committed.
      nights: Number(body?.nights) || 1,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.discount });
  } catch (error) {
    console.error("Error validating discount code:", error);
    return NextResponse.json({ success: false, error: "Could not validate this code. Please try again." }, { status: 500 });
  }
}
