-- How a promotion's discount reaches the guest.
--
-- Until now a `promotions` row could carry discount_type/discount_value, but
-- nothing consumed them for pricing — the only thing that ever reduced a charge
-- was a `discounts` code entered (or deep-linked) at checkout. So every
-- promotion created from the admin UI was decorative: it rendered a "10% off"
-- badge and then charged full price.
--
--   'voucher'   → backed by a real `discounts` row (promotions.discount_id).
--                 Checkout validates and applies the code, as it always has.
--   'automatic' → no code. The storefront and checkout apply the promotion's
--                 own discount_type/discount_value directly.
--
-- Only meaningful when discount_type is set; a promotion with no discount is an
-- announcement either way. Defaults to 'automatic' so the column reads the way
-- an owner would expect ("I set a discount, guests get it") — existing rows are
-- all codeless, which is exactly the automatic case.
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS redemption TEXT NOT NULL DEFAULT 'automatic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'promotions'::regclass AND conname = 'promotions_redemption_valid'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_redemption_valid
        CHECK (redemption IN ('automatic', 'voucher'));
  END IF;
END $$;

-- A voucher promotion must actually point at a code, otherwise the guest is
-- told to enter one that doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'promotions'::regclass AND conname = 'promotions_voucher_needs_discount'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_voucher_needs_discount
        CHECK (redemption <> 'voucher' OR discount_id IS NOT NULL);
  END IF;
END $$;
