-- Phase 3A: Vehicle model × brand website visibility join table
-- Forward-only, additive migration.
-- DO NOT apply until Phase 3B backend + CRM UI changes are reviewed and ready.
-- available_for_external_systems is intentionally left untouched.

CREATE TABLE IF NOT EXISTS vehicle_model_brand_visibility (
  vehicle_model_id INTEGER      NOT NULL
    REFERENCES vehicle_model(id) ON DELETE CASCADE,
  brand_key        VARCHAR(50)  NOT NULL
    CHECK (brand_key IN ('tbilisicars', 'kutaisicars', 'batumicars')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vehicle_model_id, brand_key)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_model_brand_visibility_brand_key
  ON vehicle_model_brand_visibility (brand_key);

-- Backfill: Tbilisicars visibility from the existing available_for_external_systems flag.
-- kutaisicars and batumicars are intentionally NOT populated (default invisible).
INSERT INTO vehicle_model_brand_visibility (vehicle_model_id, brand_key)
SELECT id, 'tbilisicars'
FROM vehicle_model
WHERE available_for_external_systems = true
ON CONFLICT DO NOTHING;
