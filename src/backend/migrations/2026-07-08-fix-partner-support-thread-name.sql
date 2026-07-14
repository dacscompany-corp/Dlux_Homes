-- Corrects a leftover "Staycation Haven Support" display name on partner
-- message threads. src/app/api/partners/me/messages/route.ts upserts this
-- name only on first creation (ON CONFLICT only bumps updated_at), so any
-- thread already created before the rename stays stuck with the old name.
UPDATE partner_message_threads
SET display_name = 'D''Lux Homes Support'
WHERE thread_key = 'support' AND display_name = 'Staycation Haven Support';
