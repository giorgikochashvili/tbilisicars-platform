-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_location_prefix_backfill
-- Purpose:   Idempotent ONE-TIME seeding of reservation_code_prefix for the
--            three core Georgian cities (Tbilisi, Kutaisi, Batumi).
--            All three prefixes match what was agreed in the system design:
--              TBS → Tbilisi locations
--              KUT → Kutaisi locations
--              BAT → Batumi locations
-- Safety:    Each UPDATE only touches rows WHERE reservation_code_prefix IS NULL
--            so repeated runs are safe.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE location
SET reservation_code_prefix = 'TBS'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'tbilisi'
    OR LOWER(name) LIKE '%tbilisi%'
    OR LOWER(name) LIKE '%tbs%'
  );

UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'kutaisi'
    OR LOWER(name) LIKE '%kutaisi%'
    OR LOWER(name) LIKE '%kut%'
  );

UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'batumi'
    OR LOWER(name) LIKE '%batumi%'
    OR LOWER(name) LIKE '%bat%'
  );
