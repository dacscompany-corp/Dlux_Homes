-- Migration: 2026-10-31-booking-extensions
-- Admin-only Extend Booking (owner spec, 2026-10-31).
--
-- Each extension is its own record linked to the booking: the checkout it
-- moved from and to, how many nights it added, the price the system suggested
-- and the charge the admin actually set, and who did it. The booking's
-- checkout date and booking_payments.total_amount / remaining_balance are
-- updated alongside, but amount_paid is never touched here — so the original
-- payment history stays as it was and the extension shows up as money owed.
--
-- Paying for an extension is its own step (status unpaid → paid): it adds to
-- amount_paid without collecting another security deposit.
-- Idempotent: safe to re-run via `npm run db:setup`.

CREATE TABLE IF NOT EXISTS booking_extensions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  old_check_out_date  DATE NOT NULL,
  new_check_out_date  DATE NOT NULL,
  check_out_time      TIME,
  added_nights        INT NOT NULL CHECK (added_nights > 0),
  -- What the Haven Management pricing rules suggested, and what was charged.
  suggested_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  charge_amount       DECIMAL(10,2) NOT NULL CHECK (charge_amount >= 0),
  note                TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid', 'paid')),
  payment_method      VARCHAR(50),
  paid_at             TIMESTAMPTZ,
  paid_by             UUID,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (new_check_out_date > old_check_out_date)
);

CREATE INDEX IF NOT EXISTS idx_booking_extensions_booking ON booking_extensions (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_extensions_unpaid ON booking_extensions (status) WHERE status = 'unpaid';
