-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0004_website_discount_system
-- Purpose:   Add website-only Discount system tables and booking snapshot columns.
--
--            New tables:
--              website_discount             — named discount with date range + location scope
--              website_discount_vehicle_model — join table linking discounts to models
--
--            New columns on booking:
--              website_discount_id, website_discount_name, website_discount_type,
--              website_discount_value, website_discount_amount,
--              original_rental_price, discounted_rental_price
--
-- Safety:    CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS are idempotent.
--            Safe to run multiple times. No data is mutated.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create enum type for website discount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'websitediscounttypeenum') THEN
    CREATE TYPE websitediscounttypeenum AS ENUM ('PERCENT', 'FIXED');
  END IF;
END
$$;

-- Create website_discount table
CREATE TABLE IF NOT EXISTS website_discount (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  discount_type       websitediscounttypeenum NOT NULL,
  value               NUMERIC(10, 2) NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  pickup_location_id  INTEGER NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_discount_pickup_location_id ON website_discount(pickup_location_id);
CREATE INDEX IF NOT EXISTS idx_website_discount_is_active ON website_discount(is_active);
CREATE INDEX IF NOT EXISTS idx_website_discount_start_date ON website_discount(start_date);
CREATE INDEX IF NOT EXISTS idx_website_discount_end_date ON website_discount(end_date);

-- Create website_discount_vehicle_model join table
CREATE TABLE IF NOT EXISTS website_discount_vehicle_model (
  id                SERIAL PRIMARY KEY,
  discount_id       INTEGER NOT NULL REFERENCES website_discount(id) ON DELETE CASCADE,
  vehicle_model_id  INTEGER NOT NULL REFERENCES vehicle_model(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wdisc_vm_discount_id ON website_discount_vehicle_model(discount_id);
CREATE INDEX IF NOT EXISTS idx_wdisc_vm_vehicle_model_id ON website_discount_vehicle_model(vehicle_model_id);

-- Add discount snapshot columns to booking table
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS website_discount_id       INTEGER,
  ADD COLUMN IF NOT EXISTS website_discount_name     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS website_discount_type     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS website_discount_value    NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS website_discount_amount   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS original_rental_price     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS discounted_rental_price   NUMERIC(10, 2);
