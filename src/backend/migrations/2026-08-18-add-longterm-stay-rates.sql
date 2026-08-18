-- Long-term stay pricing (owner spec, 2026-08-18) — replaces the old 3-tier
-- weekday/weekend bundle system for Overnight/Full-Stay with 4 flat nightly
-- tiers, no weekday/weekend split:
--   3-10 nights   -> weekday_week_rate replaced by longterm_tier1_rate
--   11-17 nights  -> longterm_tier2_rate
--   18-25 nights  -> longterm_tier3_rate
--   26+ nights    -> longterm_tier4_rate
-- The old weekday_week_rate/weekday_twoweek_rate/weekday_month_rate/
-- weekend_*_rate columns (2026-07-07-add-haven-bundle-rates.sql) and their
-- active flags (2026-07-09) are left in place but no longer read by
-- bundleNightlyRate() — kept only so a rollback doesn't lose owner-entered
-- data. NULL = tier not configured, falls back to normal per-night pricing.
ALTER TABLE havens
  ADD COLUMN IF NOT EXISTS longterm_tier1_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS longterm_tier2_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS longterm_tier3_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS longterm_tier4_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS longterm_active     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS longterm_extra_pax_fee DECIMAL(10,2) NOT NULL DEFAULT 100;

-- Seed D'Lux Tower 4's rates from the owner's rate card given at rollout.
UPDATE havens
SET longterm_tier1_rate = COALESCE(longterm_tier1_rate, 1700),
    longterm_tier2_rate = COALESCE(longterm_tier2_rate, 1600),
    longterm_tier3_rate = COALESCE(longterm_tier3_rate, 1500),
    longterm_tier4_rate = COALESCE(longterm_tier4_rate, 1400)
WHERE weekday_rate = 1899;
