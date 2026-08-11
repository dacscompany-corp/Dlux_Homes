import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { validateDiscount } from "@/backend/utils/validateDiscount";

// Validates a guest-entered promo code at checkout. The rules live in
// validateDiscount() so this endpoint and the booking submit enforce exactly
// the same thing — checking here alone was decorative, since submit accepted
// whatever the browser sent.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const result = await validateDiscount({
      db: pool,
      code: (body?.code as string) || "",
      havenId: (body?.haven_id as string) || null,
      userId: (body?.user_id as string) || null,
      amount: Number(body?.amount) || 0,
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
