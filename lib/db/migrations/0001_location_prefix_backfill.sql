-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_location_prefix_backfill
-- Purpose:   Idempotent ONE-TIME seeding of reservation_code_prefix for the
--            three core Georgian cities. All location types in a city
--            (airport, city center, downtown, hotel, meet & greet, etc.)
--            share the same city prefix per the agreed system design:
--              TBS → Tbilisi  (Tbilisi International Airport, Tbilisi City Center, etc.)
--              KUT → Kutaisi  (Kutaisi International Airport, Kutaisi City, etc.)
--              BAT → Batumi   (Batumi International Airport, Batumi City Center, etc.)
--
-- Safety:    Each UPDATE only touches rows WHERE reservation_code_prefix IS NULL
--            so repeated runs are always safe (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Tbilisi locations (all types: airport, city center, downtown, hotel, etc.)
UPDATE location
SET reservation_code_prefix = 'TBS'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'tbilisi'
    OR LOWER(name) LIKE '%tbilisi%'
    OR LOWER(name) LIKE '%tbs airport%'
    OR LOWER(name) LIKE '%tbilisi international%'
  );

-- Kutaisi locations (all types: airport, city center, downtown, hotel, etc.)
UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'kutaisi'
    OR LOWER(name) LIKE '%kutaisi%'
    OR LOWER(name) LIKE '%kut airport%'
    OR LOWER(name) LIKE '%kutaisi international%'
  );

-- Batumi locations (all types: airport, city center, downtown, hotel, etc.)
UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'batumi'
    OR LOWER(name) LIKE '%batumi%'
    OR LOWER(name) LIKE '%bat airport%'
    OR LOWER(name) LIKE '%batumi international%'
  );
