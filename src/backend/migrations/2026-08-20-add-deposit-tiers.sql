-- Security deposit tiers (owner spec, 2026-08-20) — the refundable deposit
-- collected at check-in now scales with nights booked, same 3/11/18/26 night
-- bands as long-term pricing:
--   1-2 nights (and Daycation/Nightcation) -> havens.security_deposit (existing column)
--   3-10 nights   -> deposit_tier1_amount
--   11-17 nights  -> deposit_tier2_amount
--   18-25 nights  -> deposit_tier3_amount
--   26+ nights    -> deposit_tier4_amount
-- NULL tier = not configured for this haven, falls back to the code default
-- for that tier (securityDepositFor() in src/lib/pricing.ts). Seeded from the
-- values that were hardcoded in code before this migration, so nothing
-- changes for existing havens until the owner edits them.
ALTER TABLE havens
  ADD COLUMN IF NOT EXISTS deposit_tier1_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS deposit_tier2_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS deposit_tier3_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS deposit_tier4_amount DECIMAL(10,2);

UPDATE havens
SET deposit_tier1_amount = COALESCE(deposit_tier1_amount, 1500),
    deposit_tier2_amount = COALESCE(deposit_tier2_amount, 2000),
    deposit_tier3_amount = COALESCE(deposit_tier3_amount, 3000),
    deposit_tier4_amount = COALESCE(deposit_tier4_amount, 5000);
