import { NextRequest, NextResponse } from "next/server";
import { sendOtpEmail } from "@/backend/utils/sendOtpEmail";

// PUBLIC BY DESIGN — called from the unauthenticated OtpVerification UI when
// a locked-out user requests an OTP. Server-side callers (lib/auth.ts and
// /api/admin/resend-otp) now invoke sendOtpEmail() directly instead of
// HTTP-hopping through this endpoint.
export async function POST(request: NextRequest) {
  try {
    const { email, otp, type, userName } = await request.json();

    if (!email || !otp || !type) {
      return NextResponse.json(
        { success: false, error: "Email, OTP, and type are required" },
        { status: 400 }
      );
    }

    // This endpoint is public, so constrain what can be emailed: the OTP must
    // look like a real numeric code (not arbitrary "click here" text) and the
    // type must be a known one. Combined with HTML-escaping in the renderer,
    // this prevents the endpoint from being abused as a branded phishing relay.
    if (!/^\d{4,8}$/.test(String(otp))) {
      return NextResponse.json(
        { success: false, error: "Invalid OTP format" },
        { status: 400 }
      );
    }
    const ALLOWED_TYPES = new Set(["ACCOUNT_LOCK", "VERIFY"]);
    if (!ALLOWED_TYPES.has(String(type))) {
      return NextResponse.json(
        { success: false, error: "Invalid email type" },
        { status: 400 }
      );
    }

    await sendOtpEmail({ email, otp, type, userName });

    return NextResponse.json({ success: true, message: "Email sent successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to send email";
    console.error("❌ Error sending email:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
