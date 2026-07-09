-- Per-tier activate/deactivate for the Overnight (21h) length-of-stay bundle
-- discounts. Each flag turns its whole tier (both weekday & weekend rates) on or
-- off WITHOUT clearing the configured rate — so an owner can pause a bundle
-- promo and re-enable it later with the same pricing. Default TRUE so existing
-- havens keep their currently-configured bundles active.
ALTER TABLE havens
  ADD COLUMN IF NOT EXISTS week_bundle_active    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS twoweek_bundle_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS month_bundle_active   BOOLEAN NOT NULL DEFAULT TRUE;
