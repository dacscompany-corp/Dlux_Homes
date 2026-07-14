-- Admin-editable weekend/holiday calendar rules for pricing. Replaces the
-- previously hardcoded Fri/Sat + PH_HOLIDAYS constants in src/lib/pricing.ts
-- (which remain there only as the fallback if this table is unreachable).
CREATE TABLE IF NOT EXISTS pricing_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  weekend_days INTEGER[] NOT NULL DEFAULT '{5,6}',   -- 0=Sun .. 6=Sat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pricing_settings (id, weekend_days)
VALUES (1, '{5,6}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pricing_holidays (
  holiday_date DATE PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with the previously-hardcoded PH holiday list so pricing doesn't
-- change the moment this migration is applied.
INSERT INTO pricing_holidays (holiday_date, label) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-17', 'Chinese New Year'),
  ('2026-04-02', 'Maundy Thursday'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-04', 'Black Saturday'),
  ('2026-04-09', 'Araw ng Kagitingan'),
  ('2026-05-01', 'Labor Day'),
  ('2026-06-12', 'Independence Day'),
  ('2026-08-21', 'Ninoy Aquino Day'),
  ('2026-08-31', 'National Heroes Day'),
  ('2026-11-01', 'All Saints'' Day'),
  ('2026-11-30', 'Bonifacio Day'),
  ('2026-12-08', 'Immaculate Conception'),
  ('2026-12-24', 'Christmas Eve'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-30', 'Rizal Day'),
  ('2026-12-31', 'New Year''s Eve'),
  ('2027-01-01', 'New Year''s Day')
ON CONFLICT (holiday_date) DO NOTHING;
