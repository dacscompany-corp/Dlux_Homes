-- Corrects a stale value from 2026-07-07-add-haven-bundle-rates.sql: that
-- migration originally seeded weekend_month_rate to 1599, but the rate card
-- was updated to 1699 for that tier. Its COALESCE guard only fills NULLs, so
-- any database that already ran it is stuck at the old number — fix it here.
-- Only touches rows that still have exactly the stale auto-seeded value, so
-- it won't clobber a rate an owner has since set deliberately.
UPDATE havens
SET weekend_month_rate = 1699
WHERE weekend_rate = 2099 AND weekend_month_rate = 1599;
