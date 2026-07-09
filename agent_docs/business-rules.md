# Real business rules (owner-confirmed, 2026-06-25)

D'Lux Homes is one physical unit — Tower 4, Grass Residences, SM North EDSA, QC. Rates and policy come from the owner directly, not from the ported Staycation codebase's assumptions. Verify against `src/lib/pricing.ts` and the `havens` table before trusting these numbers — the owner edits rates in the admin.

**Stay types (base 1–2 pax), per night:**
- Overnight (21h, ~7PM–4PM next day): weekday ₱1,899 / weekend+holiday ₱2,099
- Daycation/Nightcation (10h, 7AM–5PM or 7PM–5AM): weekday ₱1,499 / weekend+holiday ₱1,799
- Weekend = Fri/Sat/Sun check-in + PH holidays (`isWeekendOrHoliday()` in `src/lib/pricing.ts`)

**Extra pax:** base covers 2 pax. Each additional counted pax (adults + young adults, ages 7+) is **+₱300 flat per booking** (not per night), max 4 counted pax total (fee caps at ₱600). Children 7-under are free, uncapped, and excluded from the count entirely. More than 4 counted pax isn't bookable online — routes to Facebook/Messenger instead. Implemented in `extraPaxFee()` in `src/lib/pricing.ts`.

**Payment:** 50% down payment to reserve, 50% balance + a ₱1,000 refundable security deposit due at check-in. GCash or BPI transfer.

**Cancellation:** none. One-time date change allowed if requested ≥7 days out, new date within 1 month of the original.

**Do not hardcode rates.** `havens.{ten_hour_rate,six_hour_rate,weekday_rate,weekend_rate}` in the DB is the source of truth — the owner edits it live in the admin. `scripts/set-dlux-rates.mjs` exists but is manual-only; never run it to "correct" rates.
