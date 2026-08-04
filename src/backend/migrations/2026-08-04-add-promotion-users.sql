-- One redemption per guest account, for automatic (codeless) promotions.
--
-- Voucher promotions already had this: `discount_users` records who redeemed a
-- `discounts` code, and /api/discounts/validate refuses a second use. Automatic
-- promotions had no equivalent — they applied to every qualifying booking,
-- unlimited times, for the whole date window.
--
-- This is the mirror of `discount_users`, keyed on the promotion instead. The
-- UNIQUE pair is what actually enforces the rule; the API filter and the
-- booking-time insert both rely on it.
CREATE TABLE IF NOT EXISTS promotion_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- The booking that consumed it, for auditing. Nullable so a redemption is
    -- still recorded if the booking row is later removed.
    booking_id UUID,
    used BOOLEAN NOT NULL DEFAULT TRUE,
    used_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT promotion_users_promotion_id_user_id_key UNIQUE (promotion_id, user_id)
);

-- The hot path is "has THIS user used THIS promotion", already served by the
-- unique constraint's index. This one serves "who used this promotion".
CREATE INDEX IF NOT EXISTS idx_promotion_users_promotion ON promotion_users(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_users_user ON promotion_users(user_id);
