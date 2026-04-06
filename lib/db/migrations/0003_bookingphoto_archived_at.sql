-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0003_bookingphoto_archived_at
-- Purpose:   Add nullable photo_archived_at column to the "bookingphoto" table
--            as the foundation for the photo lifecycle system.
--
--            NULL  → photo is active (booking ongoing or recently closed)
--            SET   → photo has been moved to the 30-day archive tier and is
--                    a candidate for object-storage archival / deletion.
--
-- Safety:    ADD COLUMN IF NOT EXISTS is idempotent — safe to run multiple
--            times. All existing rows will have NULL (no action required).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "bookingphoto"
  ADD COLUMN IF NOT EXISTS photo_archived_at timestamp NULL;
