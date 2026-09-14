-- One email address = one account, regardless of capitalization.
--
-- Guest checkout auto-creates an account from the address typed into "How can
-- we reach you?" (resolveOrCreateGuestAccount in bookingController.ts). That
-- lookup was case-insensitive, but `users_email_key` and the sign-in queries in
-- lib/auth.ts compared the stored value exactly. So an address saved as
-- "Maria@Gmail.com" produced an account the guest could not sign in to by
-- typing "maria@gmail.com" — the row existed, the login said no such user.
--
-- The application now lowercases on write and matches case-insensitively on
-- read. This migration makes the database agree, so nothing can reintroduce a
-- second account that differs only by case.
--
-- Verified safe before writing: at the time of this migration no two accounts
-- differed only by case, and no stored address contained uppercase characters,
-- so the UPDATE is a no-op on current data and the index cannot collide. The
-- UPDATE is kept anyway because this file must also be correct against any
-- database where that is not yet true.

-- 1. Fold existing addresses to lowercase — but only where doing so cannot
--    collide with an account that already holds the lowercase form.
UPDATE users u
SET email = LOWER(u.email)
WHERE u.email <> LOWER(u.email)
  AND NOT EXISTS (
    SELECT 1 FROM users o
    WHERE o.user_id <> u.user_id
      AND LOWER(o.email) = LOWER(u.email)
  );

-- 2. Enforce it. Any remaining mixed-case duplicate (two real accounts on one
--    address) is left for a human to merge: this index will fail loudly rather
--    than silently pick a winner and strand someone's bookings.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email));
