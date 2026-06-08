-- Migration 0013: booking_attribution satellite table
-- Safe: additive only. No existing table is altered or dropped.
-- Captures per-booking marketing attribution data for public website bookings.
-- 1:0-or-1 relation with booking (UNIQUE on booking_id).
-- All attribution columns are nullable — booking creation is never gated on attribution.

CREATE TABLE IF NOT EXISTS booking_attribution (
  id            SERIAL        PRIMARY KEY,
  booking_id    INTEGER       NOT NULL UNIQUE
                              REFERENCES booking(id) ON DELETE CASCADE,

  -- Server-derived from Host header allowlist (authoritative)
  source_domain VARCHAR(100),
  source_brand  VARCHAR(50),

  -- Client-captured via sessionStorage (informational, not authoritative)
  utm_source    VARCHAR(200),
  utm_medium    VARCHAR(200),
  utm_campaign  VARCHAR(200),
  utm_content   VARCHAR(200),
  utm_term      VARCHAR(200),
  gclid         VARCHAR(200),
  referrer      VARCHAR(1000),
  landing_path  VARCHAR(1000),

  created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_attribution_source_brand
  ON booking_attribution(source_brand);

CREATE INDEX IF NOT EXISTS idx_booking_attribution_gclid
  ON booking_attribution(gclid)
  WHERE gclid IS NOT NULL;
