import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/backend/config/db";
import { validateDiscount, resolvePromoIdentity, promoRedemptionEmail } from "@/backend/utils/validateDiscount";
import { rateLimit, clientIp, tooManyRequests } from "@/backend/utils/rateLimit";

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
