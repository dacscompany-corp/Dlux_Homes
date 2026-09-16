-- One promo per guest, for guests who never signed in.
--
-- `discount_users` and `promotion_users` both keyed a redemption on
-- `users.user_id` and nothing else. A guest who books without an account has no
-- user_id at booking time (it is backfilled only when the booking is APPROVED,
-- see resolveOrCreateGuestAccount in bookingController.ts), so:
--
--   * validateDiscount() skipped its already-used check entirely, and
--   * createBooking() wrote no redemption row at all.
--
-- Which meant the same person could reuse the same code on every booking,
-- forever. Only the global `discounts.used_count` cap moved.
--
-- The fix is to make the NORMALIZED EMAIL the identity instead. It is collected
-- at checkout regardless of sign-in, and it is the same address the account is
-- later created from — so a guest who books twice, then signs in and books a
-- third time, is one guest throughout.
--
-- user_id is kept alongside it: still written when known, still the key the
-- older rows are matched on, and now backfilled onto a guest row the moment
-- that guest turns out to have an account.

-- ── discount_users ────────────────────────────────────────────────────────
ALTER TABLE discount_users ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- A guest redemption has no account yet. Postgres allows repeated NULLs in a
-- UNIQUE constraint, so the existing UNIQUE(discount_id, user_id) survives this
-- and keeps doing its job for account-backed rows.
ALTER TABLE discount_users ALTER COLUMN user_id DROP NOT NULL;

-- Existing rows are all account-backed; their address is the account's.
UPDATE discount_users du
SET guest_email = LOWER(u.email)
FROM users u
WHERE u.user_id = du.user_id
  AND du.guest_email IS NULL;

-- Nothing should survive that with neither key, but a row with no identity is
-- unenforceable and would block the NOT NULL below. Drop it rather than stall
-- the migration: it cannot be matched against anyone either way.
DELETE FROM discount_users WHERE guest_email IS NULL;

ALTER TABLE discount_users ALTER COLUMN guest_email SET NOT NULL;

-- The ON CONFLICT target for the redemption insert, and the index behind the
-- "has this email used this code" lookup.
CREATE UNIQUE INDEX IF NOT EXISTS discount_users_discount_email_key
  ON discount_users (discount_id, guest_email);

-- ── promotion_users ───────────────────────────────────────────────────────
ALTER TABLE promotion_users ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE promotion_users ALTER COLUMN user_id DROP NOT NULL;

UPDATE promotion_users pu
SET guest_email = LOWER(u.email)
FROM users u
WHERE u.user_id = pu.user_id
  AND pu.guest_email IS NULL;

DELETE FROM promotion_users WHERE guest_email IS NULL;

ALTER TABLE promotion_users ALTER COLUMN guest_email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS promotion_users_promotion_email_key
  ON promotion_users (promotion_id, guest_email);
