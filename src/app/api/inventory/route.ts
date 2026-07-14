import {
  createInventoryItem,
  deleteInventoryItem,
  getAllInventory,
  getInventoryItemById,
  updateInventoryItem,
} from "@/backend/controller/inventoryController";
import { requireAdmin } from "@/backend/utils/requireAdmin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Inventory is internal stock management (Owner/CSR). Previously every method
// here was unauthenticated — anyone could read, create, edit, or delete items.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const item_id = searchParams.get("item_id");

  // If item_id is provided, get single item with view logging
  if (item_id) {
    return getInventoryItemById(request);
  }

  // Otherwise, get all inventory
  return getAllInventory(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return createInventoryItem(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return updateInventoryItem(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return deleteInventoryItem(request);
}
