-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_location_prefix_backfill
-- Purpose:   Idempotent ONE-TIME seeding of reservation_code_prefix for
--            existing location rows where the prefix is not yet set.
--
-- Prefix mapping per spec:
--   Tbilisi  — TBI (Airport / International), TBD (Downtown), TBH (Hotel)
--   Kutaisi  — KUT (Airport / International), KTD (Downtown), KTH (Hotel)
--   Batumi   — BAT (Airport / International), BATD (Downtown), BATH (Hotel)
--
-- Safety:    Every UPDATE is guarded with WHERE reservation_code_prefix IS NULL
--            so re-running this script on an already-backfilled database is safe.
--
-- Important: After this backfill, operators MUST maintain the prefix field via
--            the CRM Locations Settings page. This script covers only historical
--            rows and is not a substitute for proper location configuration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tbilisi Airport / International Airport → TBI ────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBI'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'tbilisi'
    AND (
      LOWER(name) LIKE '%airport%'
      OR LOWER(name) LIKE '%international%'
      OR LOWER(name) LIKE '%tbi%'
    )
  );

-- ── Tbilisi Downtown / City Center → TBD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBD'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'tbilisi'
    AND (
      LOWER(name) LIKE '%downtown%'
      OR LOWER(name) LIKE '%city center%'
      OR LOWER(name) LIKE '%centre%'
      OR LOWER(name) LIKE '%tbd%'
    )
  );

-- ── Tbilisi Hotel → TBH ──────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBH'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'tbilisi'
    AND (
      LOWER(name) LIKE '%hotel%'
      OR LOWER(name) LIKE '%tbh%'
    )
  );

-- ── Tbilisi (remaining / unclassified) → TBI (airport is primary) ─────────────
-- Any remaining Tbilisi location without a prefix gets TBI as the default
UPDATE location
SET reservation_code_prefix = 'TBI'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'tbilisi';

-- ── Kutaisi Airport / International Airport → KUT ────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'kutaisi'
    AND (
      LOWER(name) LIKE '%airport%'
      OR LOWER(name) LIKE '%international%'
      OR LOWER(name) LIKE '%kut%'
    )
  );

-- ── Kutaisi Downtown / City Center → KTD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KTD'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'kutaisi'
    AND (
      LOWER(name) LIKE '%downtown%'
      OR LOWER(name) LIKE '%city center%'
      OR LOWER(name) LIKE '%centre%'
      OR LOWER(name) LIKE '%ktd%'
    )
  );

-- ── Kutaisi Hotel → KTH ──────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KTH'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'kutaisi'
    AND (
      LOWER(name) LIKE '%hotel%'
      OR LOWER(name) LIKE '%kth%'
    )
  );

-- ── Kutaisi (remaining / unclassified) → KUT (airport is primary) ─────────────
UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'kutaisi';

-- ── Batumi Airport / International Airport → BAT ─────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'batumi'
    AND (
      LOWER(name) LIKE '%airport%'
      OR LOWER(name) LIKE '%international%'
      OR LOWER(name) LIKE '%bat%'
    )
  );

-- ── Batumi Downtown / City Center → BATD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BATD'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'batumi'
    AND (
      LOWER(name) LIKE '%downtown%'
      OR LOWER(name) LIKE '%city center%'
      OR LOWER(name) LIKE '%centre%'
      OR LOWER(name) LIKE '%batd%'
    )
  );

-- ── Batumi Hotel → BATH ───────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BATH'
WHERE reservation_code_prefix IS NULL
  AND (
    LOWER(city) = 'batumi'
    AND (
      LOWER(name) LIKE '%hotel%'
      OR LOWER(name) LIKE '%bath%'
    )
  );

-- ── Batumi (remaining / unclassified) → BAT (airport is primary) ──────────────
UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'batumi';
