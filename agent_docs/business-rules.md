# Real business rules (owner-confirmed, 2026-06-25)

D'Lux Homes is one physical unit — Tower 4, Grass Residences, SM North EDSA, QC. Rates and policy come from the owner directly, not from the ported Staycation codebase's assumptions. Verify against `src/lib/pricing.ts` and the `havens` table before trusting these numbers — the owner edits rates in the admin.

**Stay types (base 1–2 pax), per night:**
- Overnight (21h, ~7PM–4PM next day): weekday ₱1,899 / weekend+holiday ₱2,099
- Daycation/Nightcation (10h, 7AM–5PM or 7PM–5AM): weekday ₱1,499 / weekend+holiday ₱1,799
- Weekend = Fri/Sat/Sun check-in + PH holidays (`isWeekendOrHoliday()` in `src/lib/pricing.ts`)

**Extra pax:** base covers 2 pax. Each additional counted pax (adults + young adults, ages 7+) is **+₱200 per night** — a 3-night stay with one extra pax pays ₱600. Max 4 counted pax total, so a stay tops out at 2 extra pax × ₱200 × nights. Applies to bundle-discounted long stays too (no night cap). 10-hour Daycation/Nightcation is a single session, so it's charged once. Children 7-under are free and excluded from the count entirely (the booking UI caps them at 4). More than 4 counted pax isn't bookable online — routes to Facebook/Messenger instead. Implemented in `extraPaxFee()` in `src/lib/pricing.ts`; the ₱200 lives in `havens.extra_pax_fee` and is owner-editable.

**Length-of-stay bundles (Overnight/21h only):** once a stay reaches 5 / 12 / 20 nights, the WHOLE stay reprices at a flat nightly rate instead of night-by-night. Weekday / weekend:

| Tier | Nights | 1–2 pax | 3–4 pax |
|---|---|---|---|
| 1 week | 5–11 | ₱1,799 / ₱1,899 | ₱1,899 / ₱1,999 |
| 2 weeks | 12–19 | ₱1,699 / ₱1,799 | ₱1,799 / ₱1,899 |
| 1 month | 20+ | ₱1,599 / ₱1,699 | ₱1,699 / ₱1,799 |

A bundle stay with extra pax pays **+₱100 per night on the rate itself** (flat — 3 pax and 4 pax pay the same bump), *and* still pays the per-pax fee above; the two stack. Weekday vs weekend is decided by the CHECK-IN date alone, unlike normal pricing which prices each night by its own date — so a Friday check-in puts every night of the stay on the weekend tier. Tiers are per-haven columns (`havens.{weekday,weekend}_{week,twoweek,month}_rate`) with activate/deactivate flags; the ₱100 bump is the `BUNDLE_EXTRA_PAX_SURCHARGE` constant in `src/lib/pricing.ts` and is NOT owner-editable. Known defect: 20 nights currently costs less than 19 at 1–2 pax (see `bundleNightlyRate()`).

**Cleaning turnover (owner-set 2026-08-14):** after every stay the unit is unavailable until it's cleaned — **1 hour**, flat, regardless of stay type (Overnight/Full-stay, Daycation, Nightcation all use the same buffer). Applied to BOTH sides of a comparison, so neither booking can butt up against the other's cleaning window. This is what decides whether two stays can share a date: a 7AM–5PM daycation frees the unit at 6PM, so an overnight checking in at 6PM or later fits on the same day. The long buffer was originally 3h, then 2h, then flattened to match the 1h short buffer on 2026-08-14: with the live Overnight window at 7PM–5PM (22h, longer than the storefront's fallback 21h/4PM assumption) and some real bookings checking in earlier than the standard slot (e.g. 6PM instead of 7PM), any long buffer above 1h kept closing dates that had no genuine double-booking risk. Single source of truth: `TURNOVER_SHORT_HOURS` / `TURNOVER_LONG_HOURS` in `src/lib/turnover.ts` — the room calendar and `createBooking`'s SQL both read it, and `scripts/test-turnover.mjs` locks the behaviour in. Not owner-editable from the admin; changing it is a code edit + deploy.

**Payment:** 50% down payment to reserve, 50% balance + a ₱1,000 refundable security deposit due at check-in. GCash or BPI transfer.

**Cancellation:** none. One-time date change allowed if requested ≥7 days out, new date within 1 month of the original.

**Do not hardcode rates.** `havens.{ten_hour_rate,six_hour_rate,weekday_rate,weekend_rate}` in the DB is the source of truth — the owner edits it live in the admin. `scripts/set-dlux-rates.mjs` exists but is manual-only; never run it to "correct" rates.
