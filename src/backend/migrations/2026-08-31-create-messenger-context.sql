-- Short-lived conversation memory for the Messenger bot.
--
-- The webhook parses every message in isolation, so a guest who asked
-- "dec 1 is available?" and then "4 pax po kami" got a generic rate card back
-- asking for the date they had just given. One row per PSID carries the last
-- enquiry forward so the second message can be answered as a continuation.
--
-- Deliberately NOT a transcript: only the parsed enquiry is kept — a date, a
-- head count, a window name — never message text, names, or contact details.
-- Rows go stale after MESSENGER_CONTEXT_TTL_MINUTES (see src/lib/messenger-
-- context.ts) and are ignored past that; a guest returning the next day is
-- treated as a fresh enquiry rather than quoted yesterday's date.
--
-- `quoted_at` doubles as the follow-up alarm. It is stamped when the bot sends
-- a real quote and cleared the moment the guest replies, so the nudge cron only
-- ever finds conversations that actually went quiet after a quote.

CREATE TABLE IF NOT EXISTS messenger_context (
    psid            TEXT PRIMARY KEY,

    -- The last enquiry, as parsed. All nullable: a guest may name a date with
    -- no pax, or a pax count before any date.
    from_date       DATE,
    to_date         DATE,
    pax             SMALLINT CHECK (pax IS NULL OR pax > 0),
    stay            VARCHAR(20) CHECK (stay IS NULL OR stay IN
                      ('Daycation', 'Nightcation', 'Overnight')),

    -- Set when a bookable quote goes out, NULL once the guest answers.
    quoted_at       TIMESTAMPTZ,
    -- One nudge per quiet spell; reset to FALSE on the guest's next message.
    follow_up_sent  BOOLEAN NOT NULL DEFAULT FALSE,

    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The nudge cron's only query: quotes still awaiting a reply. Partial, because
-- rows that already got their nudge are dead weight to it.
CREATE INDEX IF NOT EXISTS idx_messenger_context_awaiting
    ON messenger_context (quoted_at)
    WHERE quoted_at IS NOT NULL AND follow_up_sent = FALSE;
