export type BookingStatus = "pending" | "confirmed" | "checked-in" | "checked-out" | "rejected" | "cancelled";
export type StayType = "10-Hour" | "21-Hour";
export type AdminRole = "owner" | "csr" | "cleaner";

export interface Room {
  id: string;
  name: string;
  description: string;
  size: string;
  bedType: string;
  floor: string;
  tower: string;
  location: string;
  capacity: number;
  rating: number;
  reviewCount: number;
  price10hr: number;
  price10hrWeekend: number;
  price21hr: number;
  price21hrWeekend: number;
  // Long-term stay pricing for Overnight (21h) — flat per-night rate, no
  // weekday/weekend split, once a stay reaches 3/11/18/26 nights. undefined =
  // tier not configured; longtermActive false = long-term pricing off entirely.
  longtermTier1Rate?: number;
  longtermTier2Rate?: number;
  longtermTier3Rate?: number;
  longtermTier4Rate?: number;
  longtermActive?: boolean;
  longtermExtraPaxFee?: number;
  // Refundable security deposit, collected at check-in — scales with nights
  // booked (securityDepositFor() in src/lib/pricing.ts): securityDeposit is
  // the 1-2 night / Daycation-Nightcation default, depositTier1..4Amount are
  // the 3-10/11-17/18-25/26+ night tiers. undefined = that tier isn't
  // configured for this haven, code default applies.
  securityDeposit?: number;
  depositTier1Amount?: number;
  depositTier2Amount?: number;
  depositTier3Amount?: number;
  depositTier4Amount?: number;
  additionalPaxFee: number;
  basePax: number;
  maxPax: number;
  images: string[];
  amenities: string[];
  stayTypes: StayType[];
  // Check-in/out windows sourced from the haven's configured times. Optional so
  // mock rooms (no backend times) fall back to the storefront defaults.
  windows?: { stayType: string; checkIn: string; checkOut: string; label: string }[];
}

export interface Booking {
  id: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  stayType: StayType;
  guests: { adults: number; children: number; infants: number };
  status: BookingStatus;
  totalAmount: number;
  addOns: { name: string; qty: number; price: number }[];
  createdAt: string;
}
