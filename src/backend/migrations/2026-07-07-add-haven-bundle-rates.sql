-- Length-of-stay bundle discounts for the Overnight/Full-Stay (21h) rate.
-- Each is a flat per-night rate applied to the WHOLE stay once it reaches the
-- given number of nights (7 / 14 / 30) — NOT a mix of the normal nightly rate.
-- Weekday vs weekend tier is decided by the check-in date, same as the normal
-- weekday_rate/weekend_rate split. NULL = no discount configured for that
-- tier yet (falls back to pricing every night at weekday_rate/weekend_rate).
ALTER TABLE havens
  ADD COLUMN IF NOT EXISTS weekday_week_rate     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weekday_twoweek_rate   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weekday_month_rate     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weekend_week_rate      DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weekend_twoweek_rate    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS weekend_month_rate     DECIMAL(10,2);

-- Seed both tiers from the rate card given at rollout time:
--   Weekday (₱1,899/night base) → ₱1,799 at 7+ nights, ₱1,699 at 14+, ₱1,599 at 30+.
--   Weekend (₱2,099/night base) → ₱1,899 at 7+ nights, ₱1,799 at 14+, ₱1,699 at 30+.
UPDATE havens
SET weekday_week_rate    = COALESCE(weekday_week_rate, 1799),
    weekday_twoweek_rate  = COALESCE(weekday_twoweek_rate, 1699),
    weekday_month_rate   = COALESCE(weekday_month_rate, 1599)
WHERE weekday_rate = 1899;

UPDATE havens
SET weekend_week_rate    = COALESCE(weekend_week_rate, 1899),
    weekend_twoweek_rate  = COALESCE(weekend_twoweek_rate, 1799),
    weekend_month_rate   = COALESCE(weekend_month_rate, 1699)
WHERE weekend_rate = 2099;
