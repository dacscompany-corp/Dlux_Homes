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
  additionalPaxFee: number;
  basePax: number;
  maxPax: number;
  images: string[];
  amenities: string[];
  stayTypes: StayType[];
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
