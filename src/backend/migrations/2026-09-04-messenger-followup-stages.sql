-- Three follow-up nudges instead of one.
--
-- The bot used to nudge a quiet guest once, ten minutes after a quote, and then
-- give up: `follow_up_sent` was a boolean with room for exactly that. The owner
-- wants a sequence — 10 minutes, 1 hour, then the next day — so the column has
-- to count how many have gone out rather than whether any has.
--
-- 0 = none sent yet, 1..3 = that many nudges delivered, 3 = sequence finished.
-- The thresholds live in MESSENGER_FOLLOWUP_STAGES (src/lib/messenger-context.ts),
-- NOT here, so the schedule can change without a migration.
--
-- Backfill: a row that already had its single nudge is stage 1, which correctly
-- makes it eligible for the new 1-hour and next-day nudges if it is still quiet.
-- That is the intended behaviour, not a side effect — those conversations were
-- promised a follow-up sequence the moment the owner asked for one.

ALTER TABLE messenger_context
    ADD COLUMN IF NOT EXISTS follow_up_stage SMALLINT NOT NULL DEFAULT 0
        CHECK (follow_up_stage BETWEEN 0 AND 3);

-- Carry the old boolean across, once.
--
-- `follow_up_sent` is deliberately NOT dropped here. The migration and the
-- deploy cannot land at the same instant, so whichever goes first would meet
-- the other's schema: migrating first leaves the running OLD code querying a
-- dropped column, and deploying first leaves the NEW code querying a column
-- that does not exist yet. Keeping both columns for one release means either
-- order is safe — old code keeps using the boolean, new code uses the stage,
-- and neither notices the other.
--
-- Drop it in a follow-up migration once the new code is live. It keeps its
-- NOT NULL DEFAULT FALSE, so the new code's INSERT — which never names it —
-- still satisfies the constraint.
--
-- Overlap caveat: if the old code sends a nudge in the minutes between the two
-- steps, it sets the boolean without advancing the stage, and the new code will
-- then send its stage-1 nudge to that guest as well. One duplicate message, only
-- for conversations that fell due inside that window.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'messenger_context' AND column_name = 'follow_up_sent'
    ) THEN
        UPDATE messenger_context
           SET follow_up_stage = 1
         WHERE follow_up_sent = TRUE AND follow_up_stage = 0;
    END IF;
END $$;

-- The nudge cron's only query: quotes still awaiting a reply. Partial, because
-- a finished sequence (stage 3) is dead weight to it. Replaces the old index,
-- which was predicated on the dropped boolean.
DROP INDEX IF EXISTS idx_messenger_context_awaiting;

CREATE INDEX IF NOT EXISTS idx_messenger_context_awaiting
    ON messenger_context (quoted_at)
    WHERE quoted_at IS NOT NULL AND follow_up_stage < 3;
