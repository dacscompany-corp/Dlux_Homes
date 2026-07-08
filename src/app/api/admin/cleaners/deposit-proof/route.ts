import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { upload_image_from_form } from "@/backend/utils/fileUpload";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export async function GET(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const bookingUuid = req.nextUrl.searchParams.get("booking_uuid");
  if (!bookingUuid) {
    return NextResponse.json({ success: false, error: "booking_uuid is required" }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT payment_proof_url FROM booking_security_deposits WHERE booking_id = $1 LIMIT 1`,
      [bookingUuid],
    );
    const url = result.rows[0]?.payment_proof_url ?? null;
    return NextResponse.json({ success: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  const client = await pool.connect();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bookingUuid = formData.get("booking_uuid") as string | null;

    if (!file || !bookingUuid) {
      return NextResponse.json(
        { success: false, error: "file and booking_uuid are required" },
        { status: 400 },
      );
    }

    // Security: verify the upload is a real image (magic-byte check) before storing.
    let uploadResult;
    try {
      uploadResult = await upload_image_from_form(file, "dlux-homes/security-deposit-proofs");
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Only image files are allowed" },
        { status: 400 },
      );
    }

    await client.query(
      `UPDATE booking_security_deposits
       SET payment_proof_url = $1
       WHERE booking_id = $2`,
      [uploadResult.url, bookingUuid],
    );

    return NextResponse.json({ success: true, url: uploadResult.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/cleaners/deposit-proof error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
