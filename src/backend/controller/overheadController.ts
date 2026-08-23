import { NextRequest, NextResponse } from "next/server";
import pool from "../config/db";

export async function getCategories(): Promise<NextResponse> {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.active,
              COUNT(e.id)::int AS expense_count
         FROM overhead_categories c
         LEFT JOIN overhead_expenses e ON e.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`,
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[overhead] getCategories failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load categories" },
      { status: 500 },
    );
  }
}

export async function createCategory(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Category name is required" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `INSERT INTO overhead_categories (name, sort_order)
       VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM overhead_categories), 1))
       ON CONFLICT (name) DO NOTHING
       RETURNING id, name, sort_order, active`,
      [name],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: `A category named "${name}" already exists.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[overhead] createCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to create category" },
      { status: 500 },
    );
  }
}

export async function updateCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const body = await req.json();
    const name = body.name === undefined ? null : String(body.name).trim();
    const active = body.active === undefined ? null : Boolean(body.active);

    if (name !== null && !name) {
      return NextResponse.json(
        { success: false, message: "Category name cannot be empty" },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `UPDATE overhead_categories
          SET name = COALESCE($2, name),
              active = COALESCE($3, active),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, sort_order, active`,
      [id, name, active],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[overhead] updateCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update category" },
      { status: 500 },
    );
  }
}

export async function deleteCategory(req: NextRequest, id: string): Promise<NextResponse> {
  try {
    const inUse = await pool.query(
      `SELECT COUNT(*)::int AS n FROM overhead_expenses WHERE category_id = $1`,
      [id],
    );
    if (inUse.rows[0].n > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `This category is used by ${inUse.rows[0].n} expense(s). ` +
                   `Deactivate it instead, or move those expenses first.`,
        },
        { status: 409 },
      );
    }

    const result = await pool.query(
      `DELETE FROM overhead_categories WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows.length) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error("[overhead] deleteCategory failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete category" },
      { status: 500 },
    );
  }
}
