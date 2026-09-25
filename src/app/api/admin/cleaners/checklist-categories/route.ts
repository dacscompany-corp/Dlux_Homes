import { getKnownCategories } from "@/backend/controller/cleaningChecklistController";
import { requireEmployee } from "@/backend/utils/requireAdmin";

// Every checklist category name currently in use anywhere (template
// defaults + any custom ones admin has added), for the "Add Category"
// picker on Cleaning Operations so admin picks from what already exists
// instead of retyping and risking a near-duplicate spelling.
export async function GET() {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;
  return getKnownCategories();
}
