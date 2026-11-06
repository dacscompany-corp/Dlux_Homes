-- Migration: 2026-11-06-room-stock-pullout
-- Room Stock pull-outs (owner, 2026-11-06): besides asking for supplies, a
-- cleaner can ask for items to be TAKEN OUT of the room — damaged, stained,
-- too many, expired. Same request list and the same Pending → Processing →
-- Completed steps; completing a pull-out lowers the room's count instead of
-- raising it. `reason` says why. Existing rows are all restocks.
-- Idempotent: safe to re-run via `npm run db:setup`.
ALTER TABLE restock_requests ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'restock';
ALTER TABLE restock_requests ADD COLUMN IF NOT EXISTS reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_requests_kind_check') THEN
    ALTER TABLE restock_requests
      ADD CONSTRAINT restock_requests_kind_check CHECK (kind IN ('restock', 'pullout'));
  END IF;
END $$;
