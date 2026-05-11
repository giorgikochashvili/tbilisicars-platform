-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0006_service_comments
-- Purpose:   Add internal staff comments for Service/Maintenance records.
--
--            New table:
--              maintenance_service_comments — append-only internal notes
--              written by admin/staff, scoped to a single service record.
--
-- Safety:    CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS are
--            fully idempotent. No existing columns, tables, or data are altered.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_service_comments (
  id               SERIAL PRIMARY KEY,
  service_id       INTEGER NOT NULL REFERENCES maintenance_services(id) ON DELETE CASCADE,
  author_admin_id  INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  body             TEXT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_svc_comments_service_id ON maintenance_service_comments(service_id);
CREATE INDEX IF NOT EXISTS idx_svc_comments_created_at ON maintenance_service_comments(created_at);
