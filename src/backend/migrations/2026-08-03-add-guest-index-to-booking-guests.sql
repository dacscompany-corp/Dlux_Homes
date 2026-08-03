-- Give booking_guests a real, stored order.
--
-- WHY: booking_guests.id is a random UUID (gen_random_uuid()), yet every query
-- identified the booker as "ORDER BY id LIMIT 1" — the lexicographically
-- smallest UUID, which is arbitrary. On booking DL-BK5708590768 that surfaced a
-- 3-year-old infant as the main guest, showed her (legitimately absent) valid ID
-- as "Not uploaded", and listed the adult who actually booked under "other
-- guests". Insertion order was never recoverable because the table has no
-- created_at and no ordinal.
--
-- guest_index: 0 = the main guest (the person who booked), 1..n = the others in
-- the order they were entered at checkout.
--
-- Safe to re-run. Existing rows default to 0, which reproduces today's behaviour
-- exactly (ties fall back to id), so this migration alone changes nothing until
-- the rows are backfilled and the queries updated.

ALTER TABLE booking_guests
  ADD COLUMN IF NOT EXISTS guest_index INTEGER NOT NULL DEFAULT 0;

-- Main-guest lookups filter by booking_id and take the lowest guest_index.
CREATE INDEX IF NOT EXISTS idx_booking_guests_booking_order
  ON booking_guests(booking_id, guest_index);

COMMENT ON COLUMN booking_guests.guest_index IS
  '0 = main guest / booker, 1..n = additional guests in checkout order. Never infer the booker from id — it is a random UUID.';
