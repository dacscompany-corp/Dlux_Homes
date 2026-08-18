-- Per-night peso discounts, and a ceiling on what one offer can give away.
--
-- A peso promotion used to come off the booking ONCE, however long the stay:
-- "₱200 off" on a 3-night booking took ₱200 off the total. Meanwhile the
-- storefront subtracted the full ₱200 from the *nightly* rate in its headline,
-- so the card advertised ₱1,699/night and the total only moved by ₱200. The two
-- readings were both defensible and the code shipped one of each.
--
-- `per_night` makes the owner's intent explicit instead:
--   false (default) → ₱200 off the stay, once. What every existing row means.
--   true            → ₱200 off EACH night. A 3-night stay saves ₱600.
--
-- Only meaningful for a fixed peso amount: a percentage already scales with the
-- stay, because it is taken on the total.
--
-- `max_discount` is the ceiling, and exists because per-night is unbounded by
-- nature. ₱200 × 30 nights is ₱6,000 off a stay already priced at the
-- discounted monthly bundle rate. NULL = no ceiling.
--
-- Both columns live on `discounts` AND `promotions` because the two redemption
-- paths are enforced in different places: a voucher is priced by
-- validateDiscount() reading `discounts`, an automatic promo by promoDiscountOn()
-- reading `promotions`. syncVoucherDiscount() copies them across on save.

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS per_night BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10,2);

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS per_night BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10,2);

-- Per-night on a percentage discount would be applied twice over (the
-- percentage is already taken on a total that grew with the night count), so
-- reject the combination rather than let it silently double-count.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'discounts'::regclass AND conname = 'discounts_per_night_fixed_only'
  ) THEN
    ALTER TABLE discounts
      ADD CONSTRAINT discounts_per_night_fixed_only
        CHECK (per_night = FALSE OR discount_type = 'fixed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'promotions'::regclass AND conname = 'promotions_per_night_fixed_only'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_per_night_fixed_only
        CHECK (per_night = FALSE OR discount_type = 'fixed');
  END IF;
END $$;

-- A zero or negative ceiling would silently disable the offer it is attached
-- to; NULL is how you say "no ceiling".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'discounts'::regclass AND conname = 'discounts_max_discount_positive'
  ) THEN
    ALTER TABLE discounts
      ADD CONSTRAINT discounts_max_discount_positive
        CHECK (max_discount IS NULL OR max_discount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'promotions'::regclass AND conname = 'promotions_max_discount_positive'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_max_discount_positive
        CHECK (max_discount IS NULL OR max_discount > 0);
  END IF;
END $$;
