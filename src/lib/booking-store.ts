export type StoredBooking = {
  id: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  stayType: string;
  guests: { adults: number; children: number; infants: number };
  status: "pending" | "approved" | "confirmed" | "on-going" | "checked-in" | "checked-out" | "rejected" | "cancelled";
  totalAmount: number;
  addOns: { name: string; qty: number; price: number }[];
  createdAt: string;
  guestInfo: { firstName: string; lastName: string; email: string; phone: string };
  paymentMethod?: string;
  checkInTime?: string;
  checkOutTime?: string;
  windowLabel?: string;
  notes?: string;
};

const BOOKINGS_KEY = "dlux_bookings";

export function getStoredBookings(): StoredBooking[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addStoredBooking(booking: StoredBooking): void {
  const existing = getStoredBookings();
  existing.unshift(booking);
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(existing));
}

export function updateStoredBookingStatus(id: string, status: StoredBooking["status"]): void {
  const existing = getStoredBookings();
  const updated = existing.map((b) => (b.id === id ? { ...b, status } : b));
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
}

export function generateBookingId(): string {
  return "BK" + Date.now().toString().slice(-10);
}

// ── "My bookings on this device" ────────────────────────────────────────────
// Guest checkout creates real DB bookings (user_id is null — no guest auth), so
// we keep a lightweight list of the booking ids this device created. /my-bookings
// reads these ids and fetches the live records from the API.
const MY_IDS_KEY = "dlux_my_booking_ids";

export function getMyBookingIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(MY_IDS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMyBookingId(id: string): void {
  if (typeof window === "undefined" || !id) return;
  const ids = getMyBookingIds().filter((x) => x !== id);
  ids.unshift(id);
  localStorage.setItem(MY_IDS_KEY, JSON.stringify(ids.slice(0, 50)));
}
