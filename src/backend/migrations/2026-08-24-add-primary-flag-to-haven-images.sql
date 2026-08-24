-- Explicit primary/cover image flag for haven_images.
--
-- Previously the storefront picked the cover photo purely by sort order
-- (lowest display_order after a client-side sort in haven-adapter.ts), but
-- the haven update path in roomController.ts re-indexes newly uploaded
-- photos starting at display_order=0 while leaving kept photos' original
-- display_order untouched — so editing a haven and adding one photo could
-- silently displace the intended cover image. An explicit flag removes that
-- dependency on ordering being correct.

ALTER TABLE haven_images
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- At most one primary image per haven.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_haven_primary_image
    ON haven_images (haven_id) WHERE is_primary;

-- Backfill: havens with existing photos but no primary get their
-- lowest-display_order photo promoted, preserving today's de facto behavior.
UPDATE haven_images hi
SET is_primary = true
WHERE hi.id = (
    SELECT id FROM haven_images
    WHERE haven_id = hi.haven_id
    ORDER BY display_order ASC, id ASC
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1 FROM haven_images WHERE haven_id = hi.haven_id AND is_primary
);
