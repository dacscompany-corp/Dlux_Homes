-- Senior citizen / PWD discount (RA 9994, RA 10754): 20% off a qualifying
-- guest's own share of the room rate.
--
-- Recorded per guest rather than per booking because the entitlement belongs to
-- the person, not the reservation: front desk verifies each flagged guest's
-- senior citizen / PWD ID against the birthdate at check-in.
--
-- `birthdate` is captured for verification only and is NOT validated against a
-- minimum age — PWD status has no age floor, so an age gate would wrongly
-- exclude valid PWD guests.
ALTER TABLE booking_guests
  ADD COLUMN IF NOT EXISTS is_senior_pwd BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS birthdate     DATE;

-- The peso amount actually deducted, kept apart from `discounts` (promo codes)
-- so statutory and promotional reductions can be reported separately. The promo
-- code, when present, applies to the already-reduced subtotal.
ALTER TABLE booking_payments
  ADD COLUMN IF NOT EXISTS senior_discount DECIMAL(10,2) NOT NULL DEFAULT 0;
