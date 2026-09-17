-- Per-slot blocked dates.
--
-- Until now a blocked_dates row always closed the WHOLE day. The owner also
-- needs to close just one stay window — e.g. "no Daycation on the 25th" while
-- the Overnight that evening stays sellable.
--
--   slots IS NULL      → whole-day block (every existing row; unchanged)
--   slots = '{daycation}' / '{nightcation,overnight}' / … → only those windows,
--     on every date from from_date to to_date inclusive.
--
-- A slot's clock times are NOT stored here: they are read from the haven's
-- ten_hour / six_hour / twenty_one_hour check-in/out columns at check time, so
-- a block follows the owner if they later move a window. See src/lib/blockedSlots.ts.

BEGIN;

ALTER TABLE blocked_dates
  ADD COLUMN IF NOT EXISTS slots TEXT[];

ALTER TABLE blocked_dates
  DROP CONSTRAINT IF EXISTS blocked_dates_slots_valid;

ALTER TABLE blocked_dates
  ADD CONSTRAINT blocked_dates_slots_valid
  CHECK (
    slots IS NULL
    OR (cardinality(slots) > 0
        AND slots <@ ARRAY['daycation','nightcation','overnight']::TEXT[])
  );

COMMIT;
