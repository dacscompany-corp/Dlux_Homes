import { NextRequest, NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";

// Full status-change trail for one cleaning task's admin detail view.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;

    const result = await pool.query(
      `SELECT
         h.id::text,
         h.booking_cleaning_id::text,
         h.from_status,
         h.to_status,
         h.note,
         h.changed_by::text AS changed_by,
         e.first_name AS changed_by_first_name,
         e.last_name AS changed_by_last_name,
         h.changed_at
       FROM booking_cleaning_history h
       LEFT JOIN employees e ON e.id = h.changed_by
       WHERE h.booking_cleaning_id = $1::uuid
       ORDER BY h.changed_at ASC`,
      [id]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Error fetching cleaning history:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch cleaning history" },
      { status: 500 }
    );
  }
}
