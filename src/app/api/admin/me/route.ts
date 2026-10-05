import { NextResponse } from "next/server";
import pool from "@/backend/config/db";
import { requireEmployee } from "@/backend/utils/requireAdmin";

export const runtime = "nodejs";

// /api/admin/me — the signed-in employee's OWN profile.
//
// Accounts are created by an admin (POST /api/admin/employees). After that the
// employee keeps their own contact details current here. The id always comes
// from the session, never from the request, so there's no way to read or edit
// someone else's record through this route — unlike /api/admin/employees/[id],
// whose guard deliberately doesn't check ownership.
//
// Only the columns below are ever returned: no password hash, salary or
// login metadata.
const PROFILE_COLUMNS = `
  id::text, first_name, last_name, email, phone, role, department,
  employment_id, hire_date, status, street_address, city, zip_code,
  profile_image_url
`;

// What an employee may change about themselves. Email is the sign-in
// identity and role/department/salary are HR fields, so those stay with the
// admin who created the account.
const EDITABLE = ["first_name", "last_name", "phone", "street_address", "city", "zip_code"] as const;
type Editable = (typeof EDITABLE)[number];

const MAX_LEN: Record<Editable, number> = {
  first_name: 100, last_name: 100, phone: 20, street_address: 300, city: 100, zip_code: 20,
};
const LABEL: Record<Editable, string> = {
  first_name: "First name", last_name: "Last name", phone: "Phone",
  street_address: "Address", city: "City", zip_code: "ZIP code",
};

const sessionId = (user: unknown) => String((user as { id?: string }).id ?? "");

export async function GET(): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  try {
    const result = await pool.query(
      `SELECT ${PROFILE_COLUMNS} FROM employees WHERE id::text = $1 LIMIT 1`,
      [sessionId(guard.session.user)],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Account not found. Please sign in again." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Error loading own profile:", error);
    return NextResponse.json({ success: false, error: "Couldn't load your profile." }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const sets: string[] = [];
  const values: (string | null)[] = [];
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string") {
      return NextResponse.json({ success: false, error: `${LABEL[key]} is invalid.` }, { status: 400 });
    }
    const value = ((body[key] as string | null) ?? "").trim();
    if ((key === "first_name" || key === "last_name") && !value) {
      return NextResponse.json({ success: false, error: `${LABEL[key]} can't be empty.` }, { status: 400 });
    }
    if (value.length > MAX_LEN[key]) {
      return NextResponse.json(
        { success: false, error: `${LABEL[key]} must be ${MAX_LEN[key]} characters or fewer.` },
        { status: 400 },
      );
    }
    if (key === "phone" && value && !/^[0-9+()\-.\s]{7,20}$/.test(value)) {
      return NextResponse.json({ success: false, error: "Enter a valid phone number." }, { status: 400 });
    }
    values.push(value || null);
    sets.push(`${key} = $${values.length}`);
  }

  if (sets.length === 0) {
    return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    values.push(sessionId(guard.session.user));
    const result = await pool.query(
      `UPDATE employees SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id::text = $${values.length}
        RETURNING ${PROFILE_COLUMNS}`,
      values,
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Account not found. Please sign in again." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Error updating own profile:", error);
    return NextResponse.json({ success: false, error: "Couldn't save your profile." }, { status: 500 });
  }
}
