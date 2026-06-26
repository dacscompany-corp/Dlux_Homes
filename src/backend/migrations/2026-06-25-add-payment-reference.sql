-- Pay-during-checkout flow: the guest pays the 50% down payment at checkout,
-- entering the payment reference number and uploading a receipt. Store the
-- reference alongside the proof so the admin can verify the payment.
ALTER TABLE booking_payments
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;
