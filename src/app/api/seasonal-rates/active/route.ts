import { getActiveSeasons } from "@/backend/controller/seasonalRatesController";

// GET is PUBLIC — the room page, checkout and admin booking wizard price dates
// with these. Active seasons only; OFF seasons and admin fields never leave the server.
export async function GET() {
  return getActiveSeasons();
}
