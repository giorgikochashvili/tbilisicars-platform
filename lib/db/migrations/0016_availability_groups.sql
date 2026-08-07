-- Migration 0016: availability groups — fleet capacity planning metadata
-- Strictly additive. No existing table is altered, updated, or dropped.
-- Two new standalone tables only. No operational data is modified.
--
-- SCHEMA GUARD — plain CREATE TABLE is intentional.
-- Both CREATE TABLE statements are written without IF NOT EXISTS.
-- A collision with a pre-existing table will raise an error loudly rather
-- than silently succeeding on a stale schema.
-- Do not convert to CREATE TABLE IF NOT EXISTS without a separate reviewed decision.

-- ─── availability_group ───────────────────────────────────────────────────────
-- Display-only groups used for fleet capacity planning in the CRM.
-- Deleting a group cascades only to availability_group_vehicle_model rows;
-- no operational vehicle, model, or booking data is affected.

CREATE TABLE availability_group (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── availability_group_vehicle_model ─────────────────────────────────────────
-- Membership table: each vehicle_model belongs to at most one availability_group.
-- UNIQUE(vehicle_model_id) enforces one-group-per-model at the DB level.
-- ON DELETE CASCADE applies only from parent → membership row.
-- The cascade never reaches operational vehicle, model, or booking tables.

CREATE TABLE availability_group_vehicle_model (
  id               SERIAL    PRIMARY KEY,
  group_id         INTEGER   NOT NULL
    REFERENCES availability_group (id) ON DELETE CASCADE,
  vehicle_model_id INTEGER   NOT NULL
    REFERENCES vehicle_model (id) ON DELETE CASCADE,
  CONSTRAINT uq_agvm_vehicle_model_id UNIQUE (vehicle_model_id)
);

CREATE INDEX idx_agvm_group_id ON availability_group_vehicle_model (group_id);

-- Down migration (rollback proof against isolated test DB only):
-- DROP TABLE IF EXISTS availability_group_vehicle_model;
-- DROP TABLE IF EXISTS availability_group;
