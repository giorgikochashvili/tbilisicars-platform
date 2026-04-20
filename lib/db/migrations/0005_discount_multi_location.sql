-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0005_discount_multi_location
-- Purpose:   Add multi-pickup-location support for website discounts.
--
--            New table:
--              website_discount_pickup_location — join table linking one
--              discount to multiple pickup locations.
--
--            Backfill:
--              All existing discounts are seeded into the join table from
--              website_discount.pickup_location_id so they continue to resolve
--              correctly without any manual intervention.
--
-- Safety:    CREATE TABLE IF NOT EXISTS and INSERT ON CONFLICT DO NOTHING are
--            fully idempotent. No existing columns are altered or dropped.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS website_discount_pickup_location (
  id           SERIAL PRIMARY KEY,
  discount_id  INTEGER NOT NULL REFERENCES website_discount(id) ON DELETE CASCADE,
  location_id  INTEGER NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (discount_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_wdisc_pl_discount_id ON website_discount_pickup_location(discount_id);
CREATE INDEX IF NOT EXISTS idx_wdisc_pl_location_id ON website_discount_pickup_location(location_id);

-- Backfill: seed every existing single-location discount into the join table.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO website_discount_pickup_location (discount_id, location_id)
SELECT id, pickup_location_id
FROM website_discount
ON CONFLICT DO NOTHING;
