-- Migration 0014: regional intake foundation tables
-- Additive only. No existing table is altered or dropped.
-- Secret bytes are never stored in integration_client.
--
-- SCHEMA GUARD — plain CREATE TABLE is intentional.
-- Both CREATE TABLE statements below are deliberately written without
-- IF NOT EXISTS.  If integration_client or gateway_booking_context already
-- exists when this migration runs, PostgreSQL will raise an error and the
-- migration will fail loudly.  Silent success on a pre-existing table would
-- mask a schema collision and is not acceptable.
-- Do not convert these statements to CREATE TABLE IF NOT EXISTS without a
-- separately reviewed migration decision.

-- ── integration_client ───────────────────────────────────────────────────────
-- key_id max 64 chars: matches Phase A KEY_ID_REGEX maximum length.
-- Enabled means: disabled_at IS NULL. No boolean column.

CREATE TABLE integration_client (
  id           SERIAL      NOT NULL,
  key_id       VARCHAR(64) NOT NULL,
  brand_code   VARCHAR(50) NOT NULL,
  disabled_at  TIMESTAMP,
  created_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP   NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_ic             PRIMARY KEY (id),
  CONSTRAINT uq_ic_key_id      UNIQUE      (key_id),
  CONSTRAINT chk_ic_brand_code CHECK       (brand_code IN ('batumicars', 'kutaisicars'))
);

-- ── gateway_booking_context ──────────────────────────────────────────────────
-- Idempotency anchor for gateway-originated bookings.
-- total_amount_cents is BIGINT:
--   Core NUMERIC(10,2) max = 99,999,999.99 EUR = 9,999,999,999 cents.
--   INT4 max (2,147,483,647) is insufficient. BIGINT covers the full range.
-- payload_fingerprint is lowercase hex SHA-256, exactly 64 chars.

CREATE TABLE gateway_booking_context (
  id                          SERIAL      NOT NULL,
  booking_id                  INTEGER     NOT NULL,
  brand_code                  VARCHAR(50) NOT NULL,
  gateway_booking_id          UUID        NOT NULL,
  gateway_quote_id            UUID        NOT NULL,
  payload_fingerprint_version SMALLINT    NOT NULL DEFAULT 1,
  payload_fingerprint         CHAR(64)    NOT NULL,
  total_amount_cents          BIGINT      NOT NULL,
  created_at                  TIMESTAMP   NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_gbc                       PRIMARY KEY (id),
  CONSTRAINT uq_gbc_booking_id            UNIQUE      (booking_id),
  CONSTRAINT uq_gbc_brand_gateway_booking UNIQUE      (brand_code, gateway_booking_id),
  CONSTRAINT uq_gbc_brand_gateway_quote   UNIQUE      (brand_code, gateway_quote_id),
  CONSTRAINT fk_gbc_booking_id            FOREIGN KEY (booking_id)
                                            REFERENCES booking(id) ON DELETE CASCADE,
  CONSTRAINT chk_gbc_brand_code           CHECK (brand_code IN ('batumicars', 'kutaisicars')),
  CONSTRAINT chk_gbc_total_amount_cents   CHECK (total_amount_cents > 0
                                            AND total_amount_cents <= 9999999999),
  CONSTRAINT chk_gbc_fingerprint          CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$')
);

-- No redundant indexes: all needed indexes are created by UNIQUE constraints above.

-- Down migration (used in rollback proof against isolated test DB only):
-- DROP TABLE IF EXISTS gateway_booking_context;
-- DROP TABLE IF EXISTS integration_client;
