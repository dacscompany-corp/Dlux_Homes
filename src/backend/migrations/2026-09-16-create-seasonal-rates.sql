-- 2026-09-16 — Seasonal rates (owner spec: "Seasonal Rate MVP Terms & Requirements").
--
-- An owner-set date range (Christmas, Holy Week, …) whose four rates REPLACE
-- the haven's regular rates for any date inside it, start and end inclusive:
--
--   overnight_weekday_rate  ↔ havens.weekday_rate   (price21hr)
--   overnight_weekend_rate  ↔ havens.weekend_rate   (price21hrWeekend)
--   daynight_weekday_rate   ↔ havens.ten_hour_rate  (price10hr)
--   daynight_weekend_rate   ↔ havens.six_hour_rate  (price10hrWeekend)
--
-- Weekend/holiday inside a season is still decided by pricing_settings +
-- pricing_holidays. Property-wide (not per haven) — D'Lux is one property.
--
-- `active` is the ON/OFF toggle: an OFF season never affects pricing, so an
-- owner can prepare one ahead of time. `allow_promos` = false (default) means
-- no promo code or automatic promotion applies to a stay touching the season.
--
-- Pricing logic lives in src/lib/pricing.ts (seasonFor / stayBreakdown).
-- Idempotent — safe to re-run via npm run db:setup.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS seasonal_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    overnight_weekday_rate NUMERIC(10,2) NOT NULL,
    overnight_weekend_rate NUMERIC(10,2) NOT NULL,
    daynight_weekday_rate NUMERIC(10,2) NOT NULL,
    daynight_weekend_rate NUMERIC(10,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    allow_promos BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasonal_rates_active_dates
    ON seasonal_rates (start_date, end_date) WHERE active;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_rates_date_order') THEN
    ALTER TABLE seasonal_rates
      ADD CONSTRAINT seasonal_rates_date_order CHECK (start_date <= end_date);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_rates_positive_rates') THEN
    ALTER TABLE seasonal_rates
      ADD CONSTRAINT seasonal_rates_positive_rates CHECK (
        overnight_weekday_rate > 0 AND overnight_weekend_rate > 0
        AND daynight_weekday_rate > 0 AND daynight_weekend_rate > 0
      );
  END IF;

  -- Two ACTIVE seasons may never cover the same date — otherwise a date's price
  -- would depend on which row the query happened to return first. OFF seasons
  -- are exempt so the owner can stage next year's season alongside this one.
  -- Violations raise SQLSTATE 23P01, which the controller turns into a 409.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_rates_no_active_overlap') THEN
    ALTER TABLE seasonal_rates
      ADD CONSTRAINT seasonal_rates_no_active_overlap
      EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
      WHERE (active);
  END IF;
END $$;

-- Optional long-term stay rates for the season, on the same 3–10 / 11–17 /
-- 18–25 / 26+ night bands as havens.longterm_tier*_rate. NULL = not set: the
-- season's nightly rates apply to its nights instead. Added after the table
-- first shipped, hence ADD COLUMN rather than the CREATE TABLE above.
ALTER TABLE seasonal_rates ADD COLUMN IF NOT EXISTS longterm_tier1_rate NUMERIC(10,2);
ALTER TABLE seasonal_rates ADD COLUMN IF NOT EXISTS longterm_tier2_rate NUMERIC(10,2);
ALTER TABLE seasonal_rates ADD COLUMN IF NOT EXISTS longterm_tier3_rate NUMERIC(10,2);
ALTER TABLE seasonal_rates ADD COLUMN IF NOT EXISTS longterm_tier4_rate NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_rates_positive_longterm_rates') THEN
    ALTER TABLE seasonal_rates
      ADD CONSTRAINT seasonal_rates_positive_longterm_rates CHECK (
        (longterm_tier1_rate IS NULL OR longterm_tier1_rate > 0)
        AND (longterm_tier2_rate IS NULL OR longterm_tier2_rate > 0)
        AND (longterm_tier3_rate IS NULL OR longterm_tier3_rate > 0)
        AND (longterm_tier4_rate IS NULL OR longterm_tier4_rate > 0)
      );
  END IF;
END $$;

-- Snapshot of the season that priced a booking, kept beside room_rate so the
-- admin can see why a booking cost what it did even after the season is edited
-- or deleted (hence no FK).
ALTER TABLE booking_payments ADD COLUMN IF NOT EXISTS seasonal_rate_id UUID;
ALTER TABLE booking_payments ADD COLUMN IF NOT EXISTS seasonal_rate_name TEXT;
