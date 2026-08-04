import { NextResponse } from "next/server";
import pool from "@/backend/config/db";

// PUBLIC BY DESIGN — fetched from the unauthenticated rooms page to render
// the promo banner. Only currently-active, in-window promotions are ever
// returned; expired/scheduled/disabled rows never leave the server.
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.image_url, p.discount_type, p.discount_value,
              p.discount_id, p.start_date, p.end_date, p.applies_to, d.code AS discount_code
       FROM promotions p
       LEFT JOIN discounts d ON d.id = p.discount_id
       WHERE p.active = true
         AND p.start_date <= NOW()
         AND p.end_date >= NOW()
       ORDER BY p.created_at DESC`
    );

    const promotions = result.rows.map((row) => ({
      ...row,
      discount_value: row.discount_value != null ? parseFloat(row.discount_value) : null,
    }));

    return NextResponse.json({ success: true, data: promotions });
  } catch (error) {
    console.error("Error fetching active promotions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch promotions" },
      { status: 500 }
    );
  }
}
