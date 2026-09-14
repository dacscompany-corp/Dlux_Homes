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

// The booking id is not just a label — it is the only thing standing between a
// stranger and a guest's booking. A guest who checks out without signing in
// owns no account until the stay is confirmed, so until then requireBookingAccess
// lets anyone holding this id read the record: names, phone, and the uploaded
// government IDs of every guest on the booking.
//
// It used to be `Date.now()` alone, which is not a secret at all — it is a
// clock reading, so one id tells you roughly where every other id sits, and a
// booking made in a known hour had only a few million neighbours to try. The
// random half is what makes it unguessable; the timestamp half is kept only so
// ids still sort by age when the owner scans the board.
//
// Digits ONLY, and no separator inside the number. The Messenger bot finds a
// quoted booking id with /DL-BK\d{6,}/ (src/lib/messenger-intent.ts), so a
// letter or a hyphen would silently truncate the match and the bot would look
// up the wrong booking.
export function generateBookingId(): string {
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  // 6 digits, zero-padded so every id is the same length. Modulo bias across
  // 10^6 out of 2^32 is immaterial here — this is a lookup secret, not a key.
  const suffix = (random[0] % 1_000_000).toString().padStart(6, "0");
  return "DL-BK" + Date.now().toString().slice(-10) + suffix;
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
