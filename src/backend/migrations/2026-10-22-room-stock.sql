-- Migration: 2026-10-22-room-stock
-- Cleaning Operations → Room Stock (owner MVP, 2026-10-22).
--
-- Cleaners check the supplies kept IN the unit (toilet paper, soap, water…),
-- update how many are left after cleaning, and ask for what's low. Owner/CSR
-- see the requests, move them Pending → Processing → Completed, and completing
-- a request tops the room's count back up.
--
-- Separate from the existing `inventory` table, which is the stockroom /
-- master supply list Owner/CSR manage; room_supplies is what sits in the room.
-- Idempotent: safe to re-run via `npm run db:setup`.

CREATE TABLE IF NOT EXISTS room_supplies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The unit (havens.uuid_id). One property today, but kept per room.
  haven_id         UUID NOT NULL,
  item_name        VARCHAR(100) NOT NULL,
  unit_type        VARCHAR(40)  NOT NULL DEFAULT 'pcs',
  -- How many the room should have when fully stocked.
  par_quantity     INT NOT NULL DEFAULT 1 CHECK (par_quantity >= 0),
  -- How many are in the room right now (last count).
  current_quantity INT NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  display_order    INT NOT NULL DEFAULT 0,
  last_counted_at  TIMESTAMPTZ,
  last_counted_by  UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_room_supplies_haven_item
  ON room_supplies (haven_id, lower(item_name));
CREATE INDEX IF NOT EXISTS idx_room_supplies_haven ON room_supplies (haven_id);

CREATE TABLE IF NOT EXISTS restock_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  haven_id         UUID NOT NULL,
  -- The room supply this is for; NULL for a one-off item not on the list.
  room_supply_id   UUID REFERENCES room_supplies(id) ON DELETE SET NULL,
  item_name        VARCHAR(100) NOT NULL,
  quantity         INT NOT NULL CHECK (quantity > 0),
  note             TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'completed')),
  requested_by     UUID,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_by       UUID,
  processing_at    TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  admin_note       TEXT
);

CREATE INDEX IF NOT EXISTS idx_restock_requests_status ON restock_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_restock_requests_haven ON restock_requests (haven_id);
