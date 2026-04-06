-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0002_user_password_hash
-- Purpose:   Add nullable password_hash column to the "user" table so that
--            customers who book via the public website can be issued a login
--            credential (bcrypt, 12 rounds).
--
-- Safety:    ALTER TABLE ... ADD COLUMN IF NOT EXISTS is idempotent — safe to
--            run multiple times (Drizzle push also handles this automatically).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS password_hash varchar(255) NULL;
