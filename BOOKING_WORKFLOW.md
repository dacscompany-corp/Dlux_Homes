# Staycation Haven PH — Room Viewing & Booking Workflow

---

## Overview

```
Home (/) → Rooms Listing (/rooms) → Room Details (/rooms/[id]) → Checkout (/checkout) → Booking Confirmed → My Bookings (/my-bookings)
```

---

## Step 1 — Home / Entry Point

**Route:** `/`

- App redirects automatically to `/rooms`.
- Database connection is tested on load.

---

## Step 2 — Browse Rooms (Rooms Listing)

**Route:** `/rooms`

**What the user sees:**
- Sticky search bar (filter by dates, guests, stay type)
- List of all available Havens fetched from `GET /api/haven`
- Stats: total havens count, average rating (4.8), 24/7 support badge

**User actions:**
- Search / filter rooms using the search bar
- Click on a Haven card → navigates to `/rooms/[id]`
- Add a room to Wishlist (requires login)

---

## Step 3 — Room Details

**Route:** `/rooms/[id]`

**Data fetched:**
- `GET /api/haven/:id` — room details
- `GET /api/haven` — recommended rooms (up to 5, excluding current)

**What the user sees:**
- Image gallery / photo tour by category (Living Area, Bedroom, Bathroom, Kitchenette, etc.)
- YouTube video tour (if available)
- Room info: name, description, size, bed type, floor/tower/location
- Capacity and amenities list
- Stay type rates:
  | Stay Type | Duration | Check-in / Check-out |
  |-----------|----------|----------------------|
  | 6-Hour    | 6 hrs    | Per room config       |
  | 10-Hour   | 10 hrs   | Per room config       |
  | 21-Hour   | 21 hrs   | Per room config       |
- Guest reviews / rating
- Recommended rooms section

**User actions:**
- Select a stay type + dates + guests
- Click **Book Now** → redirects to `/checkout`

---

## Step 4 — Dual Booking Access (if not logged in)

**Route:** `/checkout`

An unauthenticated visitor is shown a choice before the checkout form renders — no forced redirect:

- **Sign In & Book** → sends them to `/login?callbackUrl=/checkout?...`, then back to checkout via `callbackUrl` once signed in. The booking is tied to their account (`booking.user_id`).
- **Continue as Guest** → skips authentication entirely. The checkout form renders immediately and the booking is created with `user_id = NULL` (see `bookingController.ts`). The guest gets a booking reference (`booking_id`, e.g. `DL-BK…`) and the id is remembered in this browser via `localStorage` (`addMyBookingId`, see `src/lib/booking-store.ts`) so `/my-bookings` can list it without an account.

**Route:** `/login` (Sign In & Book path only)

- Login with email & password (credentials)
- Login with Google OAuth (`/api/google-login`)
- On success → redirects back to checkout via `callbackUrl`

A guest booking (`user_id IS NULL`) stays viewable at `/my-bookings/confirmed?id=...` and `/api/bookings/[id]` without signing in — access is guarded by knowing the booking id (see `requireBookingAccess` in `src/backend/utils/requireAdmin.ts`). An account-owned booking still requires signing in as its owner (or Owner/CSR).

---

## Step 5 — Checkout (Multi-Step Form)

**Route:** `/checkout`

Booking data (room, dates, guests) is persisted in **Redux state** from the previous step.

### Step 5.1 — Guest Information
- Full name (pre-filled from session if available)
- Email address
- Phone number
- Validation before proceeding

### Step 5.2 — Booking Details
- Confirm / adjust check-in and check-out dates (DateRangePicker)
- Confirm / adjust guest count (adults, children, infants)
- Select stay type (6-hour / 10-hour / 21-hour)
- Blocked dates are loaded via `GET /api/bookings` for the selected room to prevent double-booking

### Step 5.3 — Add-Ons (Optional)
| Add-On           | Price      |
|------------------|------------|
| Pool Pass        | ₱100 each  |
| Towels           | ₱50 each   |
| Bath Robe        | ₱150 each  |
| Extra Comforter  | ₱100 each  |
| Guest Kit        | ₱75 each   |
| Extra Slippers   | ₱30 each   |

- Increment / decrement quantity per item
- Running total updates in real time

### Step 5.4 — Payment
- View booking summary (room, dates, stay type, add-ons, total)
  - Dates inside an active seasonal rate show a "{Season} Rate" block listing each seasonal date and its rate; promo entry is replaced by "Promos don't apply to {Season} dates" unless the season allows promos
  - The server re-prices the booking on submit; if rates changed since the page loaded it returns 409 `PRICE_CHANGED` and the guest is asked to refresh
- Upload **Payment Proof** (GCash screenshot or bank transfer)
- Upload **Valid ID**
- Review booking policy and house rules
- Click **Confirm Booking** → `POST /api/bookings`

**On success:**
- Booking ID generated (`BK{timestamp}`)
- Confirmation email sent via `POST /api/send-booking-email`
- Pending status email sent via `POST /api/send-pending-email`
- Redirects to booking confirmation / My Bookings

---

## Step 6 — Admin Review

**Route:** `/admin` (admin users only)

After a booking is submitted with status **Pending**:

| Action     | Status Update  | Email Triggered                          |
|------------|----------------|------------------------------------------|
| Approve    | Confirmed       | `POST /api/send-down-payment-approval-email` |
| Reject     | Rejected        | `POST /api/send-rejection-email`         |
| Check-in   | Checked In      | `POST /api/send-checkin-email`           |
| Check-out  | Checked Out     | `POST /api/send-checkout-email`          |

---

## Step 7 — My Bookings

**Route:** `/my-bookings`

- Signed-in users see bookings tied to their account (`GET /api/bookings/user/[id]`)
- Guest bookings made on this device are also listed, via the booking ids stored in `localStorage` (`getMyBookingIds`) — no account required
- Both sources are merged into one list
- Booking statuses: `Pending` → `Confirmed` → `Checked In` → `Checked Out` / `Rejected` / `Cancelled`

**User actions:**
- Click a booking → `/bookings/[id]` (full details)
- Cancel a booking (if eligible)
- View payment receipt / download PDF via `POST /api/generate-receipt-pdf`

---

## Step 8 — Booking Details

**Route:** `/bookings/[id]`

**Data fetched:** `GET /api/bookings/:id`

**What the user sees:**
- Full booking summary (room, dates, guests, add-ons, total)
- Current booking status with timeline
- Payment proof and valid ID uploads
- Messaging button (contact support)

---

## Booking Status Flow

```
[Submitted] → Pending
                ├── Approved → Confirmed → Checked In → Checked Out
                └── Rejected
[User Action] → Cancelled (before check-in)
```


