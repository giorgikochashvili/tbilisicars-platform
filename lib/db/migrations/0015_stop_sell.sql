-- Migration 0015: Stop Sell rules
-- Adds three tables for admin-managed stop-sell rules that suppress specific
-- vehicle models from public website results for a given city + date range.
-- Does NOT alter any existing table.

-- ─── Main rule table ─────────────────────────────────────────────────────────

CREATE TABLE stop_sell (
  id           SERIAL        PRIMARY KEY,
  name         VARCHAR(200),
  start_date   DATE          NOT NULL,
  end_date     DATE          NOT NULL,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT stop_sell_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_stop_sell_is_active  ON stop_sell (is_active);
CREATE INDEX idx_stop_sell_start_date ON stop_sell (start_date);
CREATE INDEX idx_stop_sell_end_date   ON stop_sell (end_date);

-- ─── Stop Sell ↔ Vehicle Model (many-to-many) ────────────────────────────────

CREATE TABLE stop_sell_vehicle_model (
  stop_sell_id      INTEGER NOT NULL
    REFERENCES stop_sell (id) ON DELETE CASCADE,
  vehicle_model_id  INTEGER NOT NULL
    REFERENCES vehicle_model (id) ON DELETE CASCADE,
  PRIMARY KEY (stop_sell_id, vehicle_model_id)
);

CREATE INDEX idx_ssvm_model ON stop_sell_vehicle_model (vehicle_model_id);

-- ─── Stop Sell ↔ City/Region (many-to-many) ──────────────────────────────────
-- city is constrained to the three Tbilisicars operating cities.

CREATE TABLE stop_sell_region (
  stop_sell_id  INTEGER      NOT NULL
    REFERENCES stop_sell (id) ON DELETE CASCADE,
  city          VARCHAR(100) NOT NULL,
  PRIMARY KEY (stop_sell_id, city),
  CONSTRAINT stop_sell_region_city_check CHECK (city IN ('Tbilisi', 'Kutaisi', 'Batumi'))
);

CREATE INDEX idx_ssr_city ON stop_sell_region (city);
