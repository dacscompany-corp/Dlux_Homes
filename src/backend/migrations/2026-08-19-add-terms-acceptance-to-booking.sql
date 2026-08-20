-- Terms & Conditions acceptance, recorded per booking.
--
-- WHY THIS IS STORED: §22 of the Terms says "the version applicable to a booking
-- is the version in effect when the booking was submitted". That clause is
-- unenforceable unless the version the guest actually saw is captured at the
-- moment they accepted it — the published document changes over time, so
-- re-reading TERMS_AND_CONDITIONS.md later cannot tell you what an older guest
-- agreed to.
--
-- WHEN IT IS CAPTURED: at checkout, on the step 1 -> step 2 transition, BEFORE
-- the guest is shown the GCash/BPI details and sends the down payment. The
-- no-cancellation and no-refund terms (§8) govern the decision to pay, and the
-- down payment is an irreversible manual transfer, so consent has to precede it.
-- Accepting is a hard gate: the payment step cannot be reached without it.
--
-- NULLABLE ON PURPOSE: bookings created before this migration have no
-- acceptance record, and inventing one would be worse than admitting the gap.
-- NULL means "taken before acceptance was captured", not "did not accept".
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS terms_version     VARCHAR(16),
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN booking.terms_version IS
  'Version string of the Guest Terms & Conditions the guest accepted at checkout (e.g. "2.1"). NULL for bookings predating acceptance capture.';
COMMENT ON COLUMN booking.terms_accepted_at IS
  'When the guest ticked the acceptance box, immediately before the payment step. NULL for bookings predating acceptance capture.';
