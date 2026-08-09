# Extra-pax fee: flat per booking → per night

**Date:** 2026-08-09
**Status:** Approved, not yet implemented

## Problem

The extra-pax surcharge is charged once per booking regardless of length of stay.
A 3-pax guest staying 1 night and a 3-pax guest staying 20 nights both pay a
single ₱200. The owner wants the fee to scale with the stay: each extra guest is
charged for every night.

Separately, the live `havens.extra_pax_fee` is ₱200 while
`agent_docs/business-rules.md` and three code fallbacks say ₱300. The DB is
correct; the doc and fallbacks are stale.

## Decisions

- **Per night, every night, no cap.** Bundle stays (5/12/20+ nights) multiply the
  same as short stays. A 20-night stay with one extra pax adds ₱200 × 20 = ₱4,000
  on top of the discounted room rate. Decided 2026-08-09: no night cap, no bundle
  exemption.
- **10-hour stays are unaffected.** Daycation/Nightcation is a single session, so
  its night count is already 1 and multiplying by it is a no-op.
- **₱200 is the correct rate.** The DB stays as-is; the doc and the `?? 300`
  fallbacks move to 200.
- **No migration.** Each booking stores its own `total_amount`. Historical rows
  keep the price they were quoted.

## Design

### Core rule

`extraPaxFee()` in `src/lib/pricing.ts` gains a fourth argument:

```ts
export function extraPaxFee(
  totalPax: number,
  basePax: number,
  feePerPax: number,
  nights = 1,
): number {
  const extra = Math.max(0, Math.floor(totalPax || 0) - Math.floor(basePax || 0));
  const n = Math.max(1, Math.floor(nights || 1));
  return extra * Math.max(0, feePerPax || 0) * n;
}
```

`nights` defaults to 1 so an un-updated caller keeps today's behaviour rather
than throwing, and `Math.max(1, …)` absorbs a 0 / NaN arriving from a URL param.

The rule lives in this one function. Call sites pass their night count; they do
not multiply themselves.

### Call sites

| File | Line | Night count to pass |
|---|---|---|
| `src/app/rooms/[id]/page.tsx` | 569 | `stayNights` — already 1 for 10h stays |
| `src/app/checkout/page.tsx` | 323 | `nights` — already 1 for 10h stays |
| `src/components/admin/NewBookingWizard.tsx` | 201 | `nights` (local, inside the pricing `useMemo`) |

`NewBookingWizard` currently computes `extraCount * perPax` inline instead of
calling the shared helper. It switches to `extraPaxFee()` so admin-created
bookings cannot diverge from the public site. Its `MAX_COUNTED` clamp stays — it
clamps the *pax count*, which is unrelated to the night multiplier.

### Copy

The breakdown must state the multiplication, or a guest sees "1 × ₱200" beside a
₱600 charge.

- **Line items** — `src/app/rooms/[id]/page.tsx` 1086 and 1561,
  `src/app/checkout/page.tsx` 1128, `src/components/admin/NewBookingWizard.tsx`
  685 — render `Extra guests · 1 × ₱200 × 3 nights`. The `× n nights` suffix is
  omitted when the stay is a single night or a 10-hour session.
- **Guest-picker microcopy** — `src/app/rooms/[id]/page.tsx` 1075 (desktop) and
  1551 (mobile) — "Each extra adult or teen is ₱200 **per night**".
- **Wizard summary** — `src/components/admin/NewBookingWizard.tsx` 544.

### ₱200 sync

- `agent_docs/business-rules.md` — ₱300 → ₱200, and "flat per booking" → "per
  night"; drop the "fee caps at ₱600" figure, which assumed both.
- `src/lib/haven-adapter.ts` 83, `src/components/admin/NewBookingWizard.tsx` 197,
  `src/lib/mock-data.ts` 18 — `?? 300` → `?? 200`.
- `scripts/set-dlux-rates.mjs` — `extra_pax_fee = 300` → `200`. Manual-only
  script; not run as part of this change.
- The header comment block in `src/lib/pricing.ts` describing the fee as
  once-per-booking.

## Out of scope

Carried over from the audit that prompted this change; each is a separate piece
of work:

- `/checkout` reads `adults`/`children` from the URL with no 4-pax clamp, so the
  "5+ book via Messenger" rule can be bypassed by editing the link.
- `createBooking` trusts the client's `total_amount` and never recomputes it.
- The pax fee is never persisted as its own column, so it cannot be broken out in
  reporting.
- The 4-pax maximum is a magic number in two files rather than reading
  `room.maxPax` / `havens.capacity`.

## Verification

- `npm run build` passes with no TS or lint errors (Vercel fails the deploy
  otherwise).
- Manual check of the quote on the room page and checkout for: 1-night overnight
  with 3 pax (₱200 fee), 3-night overnight with 3 pax (₱600), 3-night with 4 pax
  (₱1,200), a 10-hour stay with 3 pax (₱200, no night suffix), and a 2-pax
  booking (no fee line at all).
- The room-page quote and the checkout quote agree for the same parameters.
