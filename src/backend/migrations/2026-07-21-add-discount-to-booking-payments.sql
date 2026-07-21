-- Tracks which discount code (if any) a guest redeemed at checkout, so the
-- discount actually reduces the charged total and admins can see which code
-- was used per booking. discount_amount is the peso amount subtracted from
-- room_rate + add_ons_total to reach total_amount.
ALTER TABLE booking_payments
  ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_booking_payments_discount_id ON booking_payments(discount_id);
