-- Checkout amenity rates, owner-editable (owner spec, 2026-09-22): the
-- "Choose your amenities" step at checkout (Swimming Pool / Basketball Court)
-- billed guests a fee that was hardcoded in bookingController.ts. Moving it
-- to per-haven columns, same convention as extra_pax_fee, so the owner can
-- change it from Haven Management -> Add-ons without a code deploy.
-- NULL = not configured for this haven, falls back to the code default
-- (AMENITY_RATE = 150 in src/backend/controller/bookingController.ts).
ALTER TABLE havens
  ADD COLUMN IF NOT EXISTS swimming_pool_amenity_fee DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS basketball_court_amenity_fee DECIMAL(10,2);

UPDATE havens
SET swimming_pool_amenity_fee = COALESCE(swimming_pool_amenity_fee, 150),
    basketball_court_amenity_fee = COALESCE(basketball_court_amenity_fee, 150);
