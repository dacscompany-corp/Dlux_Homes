import type { Room } from "@/types";
import { mockRooms } from "@/lib/mock-data";

// Presentational extras the detail page renders that aren't haven columns.
// For this single-property site they're static property info, sourced from the
// mock record so there's one place to edit them.
type RoomExtras = {
  amenityFees: { name: string; fee: string }[];
  nearby: string[];
  houseRules: string[];
  blockedDates: { date: string; type: string }[];
};

// Maps a live haven row (from /api/haven) into the Room shape the public
// storefront pages (rooms list, room detail, checkout) already render.
// Falls back gracefully for fields a haven doesn't carry.
export function havenToRoom(h: Record<string, unknown>): Room & RoomExtras {
  const m = mockRooms[0] as unknown as RoomExtras;
  const imageRows = Array.isArray(h.images) ? (h.images as Record<string, unknown>[]) : [];
  const images = imageRows
    .slice()
    .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((i) => String(i.image_url ?? ""))
    .filter(Boolean);

  const amenityRows = Array.isArray(h.verified_amenities) ? (h.verified_amenities as Record<string, unknown>[]) : [];
  const amenities = amenityRows.map((a) => String(a.label ?? a.key ?? "")).filter(Boolean);

  const tower = String(h.tower ?? "");
  const floor = String(h.floor ?? "");

  return {
    id: String(h.uuid_id ?? h.id ?? ""),
    name: String(h.haven_name ?? h.name ?? "D'Lux Homes"),
    description: String(h.description ?? ""),
    size: h.room_size ? `${h.room_size} sqm` : String(h.beds ?? ""),
    bedType: String(h.beds ?? ""),
    floor: [tower, floor].filter(Boolean).join(", "),
    tower,
    location: String(h.google_map_address ?? [tower, floor].filter(Boolean).join(", ")),
    capacity: Number(h.capacity ?? 2),
    rating: Number(h.rating ?? 4.9),
    reviewCount: Number(h.review_count ?? 0),
    // D'Lux rate model (4 distinct rates). The havens table has no dedicated
    // 10h-weekend column, so we reuse the otherwise-unused `six_hour_rate`
    // column to hold the Daycation/Nightcation weekend rate.
    price10hr: Number(h.ten_hour_rate ?? 0),                                   // 10h weekday
    price10hrWeekend: Number(h.six_hour_rate ?? h.ten_hour_rate ?? 0),         // 10h weekend/holiday
    price21hr: Number(h.weekday_rate ?? 0),                                    // 21h weekday
    price21hrWeekend: Number(h.weekend_rate ?? h.weekday_rate ?? 0),           // 21h weekend/holiday
    additionalPaxFee: Number(h.extra_pax_fee ?? 150),
    basePax: Number(h.base_pax ?? 2),
    maxPax: Number(h.capacity ?? 4),
    // Keep a local placeholder if the haven has no uploaded images yet, so the
    // storefront never renders broken/empty galleries.
    images: images.length ? images : ["/images/rooms/1.jpg"],
    amenities,
    stayTypes: ["10-Hour", "21-Hour"],
    // Static property-info extras the detail page renders
    amenityFees: m.amenityFees ?? [],
    nearby: m.nearby ?? [],
    houseRules: m.houseRules ?? [],
    blockedDates: [],
  };
}
