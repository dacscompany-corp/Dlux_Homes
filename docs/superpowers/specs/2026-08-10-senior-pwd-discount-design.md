# Senior citizen / PWD 20% discount

**Date:** 2026-08-10
**Status:** Approved, implementing

## Problem

Philippine law (RA 9994, RA 10754) entitles senior citizens and persons with
disability to 20% off their own consumption. The booking flow has no way to
declare a qualifying guest, so the discount is handled off-platform or not at
all.

## The rule

Each guest may be marked as a senior citizen or PWD. Every qualifying guest gets
**20% off their equal share of the room rate**.

Worked example — ₱1,899, 2 guests, 1 qualifying:

| | |
|---|---|
| ₱1,899 ÷ 2 guests | ₱949.50 each |
| Qualifying share − 20% | ₱759.60 |
| Regular share | ₱949.50 |
| **Total** | **₱1,709** |

Equivalently: `discount = 20% × (room total ÷ counted pax) × qualifying guests`.

## Decisions

- **Base is the room total only.** The extra-pax fee and the bundle surcharge are
  not divided or discounted. A 3-pax, 1-night, 1-senior booking is
  `1899 ÷ 3 = 633`, senior pays `506.40`, room becomes `1,772.40`, and the ₱200
  extra-pax fee is added on top.
- **Divided by counted pax** (adults + young adults). Children 7-and-under are
  free and excluded from pricing entirely, so they never dilute a share.
- **Rounded to whole pesos.** ₱189.90 becomes ₱190. Every figure on screen, in
  the payload, and in the 50% down payment stays a whole peso, matching the rest
  of the app.
- **Senior first, then promo.** The statutory discount comes off the room total;
  a promo code then applies to the reduced subtotal. Promo validation already
  runs against `subtotal`, so this falls out of the existing order with no change
  to the promo path.
- **No age gate.** A birthday under 60 is not rejected. PWD status has no age
  floor, so gating on age would wrongly block valid PWD guests. The birthday is
  captured for verification; the senior/PWD ID is checked at check-in alongside
  the existing valid ID.

## Design

### Pricing

One function in `src/lib/pricing.ts`, beside the other rules:

```ts
export const SENIOR_PWD_RATE = 0.2;

export function seniorPwdDiscount(roomTotal, countedPax, qualifying) {
  if (roomTotal <= 0 || countedPax <= 0 || qualifying <= 0) return 0;
  const share = roomTotal / countedPax;
  return Math.round(share * SENIOR_PWD_RATE * Math.min(qualifying, countedPax));
}
```

`Math.min(qualifying, countedPax)` clamps the discount so it can never exceed
20% of the room total, even if the guest counts and the flags disagree.

### Order of operations

```
  room total  (stayTotal — the ÷ pax base)
+ extra-pax fee                    (not discounted)
− senior/PWD discount              (new)
= subtotal
− promo / automatic offer          (existing, lands on the reduced amount)
= total  →  50% down payment
```

### Client state

`Info` and `ExtraGuest` each gain:

- `senior: boolean` — the toggle
- `birthday: string` — `YYYY-MM-DD`, required while `senior` is true

### Guest form

Below Gender in each guest's popup: a toggle reading *"Senior citizen or PWD —
20% off this guest's share"*. Switching it on reveals a required **Birthday**
field. The guest's collapsed row carries a small chip so the status is visible
without opening the popup.

Validation adds one key per guest — `birthday` / `x{i}-birthday` — raised only
while that guest's toggle is on. It follows the existing `fieldErrors` pattern,
so the progress meter, the popup's numbered to-do, and the disabled Continue all
pick it up with no extra wiring.

### Breakdown

One line beside the promo line: `Senior/PWD discount · 1 guest   −₱190`.

### Persistence

A statutory discount that is not recorded cannot be audited or verified at the
desk, so it reaches the database:

| Migration | Columns |
|---|---|
| `booking_guests` | `is_senior_pwd BOOLEAN DEFAULT FALSE`, `birthdate DATE` |
| `booking_payments` | `senior_discount DECIMAL(10,2) DEFAULT 0` |

Both `INSERT INTO booking_guests` sites in `bookingController.ts` carry the two
new fields; the payload carries `senior_discount` alongside the existing
`discount_amount`.

## Out of scope

- Surfacing the flag in the admin booking view.
- Any change to the rooms-page quote — senior status is only known at checkout,
  so that page keeps quoting the undiscounted rate.
- Requiring a separate senior/PWD ID upload; the existing valid-ID upload stands.

## Verification

- `npm run build` passes with no TS errors, and lint on `checkout/page.tsx` shows
  no new problems against its 8-warning baseline.
- The rule is exercised directly against the shipped `seniorPwdDiscount`:
  - ₱1,899 / 2 pax / 1 qualifying → ₱190 (total ₱1,709) — the owner's example
  - ₱1,899 / 2 pax / 2 qualifying → ₱380 (both shares discounted)
  - ₱1,899 / 3 pax / 1 qualifying → ₱127, with the extra-pax fee untouched
  - 0 qualifying → ₱0, and the clamp holds when qualifying exceeds counted pax
- Manual: toggling senior on requires a birthday before the guest can be saved,
  the breakdown line appears and disappears with the toggle, and a promo code
  applies to the already-reduced subtotal.
