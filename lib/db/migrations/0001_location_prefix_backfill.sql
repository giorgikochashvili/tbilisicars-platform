-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_location_prefix_backfill
-- Purpose:   Idempotent ONE-TIME seeding of reservation_code_prefix for
--            existing location rows that match known named patterns.
--
-- IMPORTANT: Only rows matching explicit patterns below are updated.
--            Rows that do not match are left with NULL and must be configured
--            by an admin via the CRM Locations Settings page.
--
-- Prefix mapping per spec:
--   Tbilisi  — TBI (Airport/International), TBD (Downtown/City Center), TBH (Hotel)
--   Kutaisi  — KUT (Airport/International), KTD (Downtown/City Center), KTH (Hotel)
--   Batumi   — BAT (Airport/International), BATD (Downtown/City Center), BATH (Hotel)
--
-- Safety:    Every UPDATE is guarded with WHERE reservation_code_prefix IS NULL
--            so re-running this script is always safe (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tbilisi Airport / International Airport → TBI ────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBI'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'tbilisi'
  AND (
    LOWER(name) LIKE '%airport%'
    OR LOWER(name) LIKE '%international%'
  );

-- ── Tbilisi Downtown / City Center → TBD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBD'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'tbilisi'
  AND (
    LOWER(name) LIKE '%downtown%'
    OR LOWER(name) LIKE '%city center%'
    OR LOWER(name) LIKE '%city centre%'
  );

-- ── Tbilisi Hotel → TBH ──────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'TBH'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'tbilisi'
  AND LOWER(name) LIKE '%hotel%';

-- ── Kutaisi Airport / International Airport → KUT ────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'kutaisi'
  AND (
    LOWER(name) LIKE '%airport%'
    OR LOWER(name) LIKE '%international%'
  );

-- ── Kutaisi Downtown / City Center → KTD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KTD'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'kutaisi'
  AND (
    LOWER(name) LIKE '%downtown%'
    OR LOWER(name) LIKE '%city center%'
    OR LOWER(name) LIKE '%city centre%'
  );

-- ── Kutaisi Hotel → KTH ──────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'KTH'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'kutaisi'
  AND LOWER(name) LIKE '%hotel%';

-- ── Batumi Airport / International Airport → BAT ─────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'batumi'
  AND (
    LOWER(name) LIKE '%airport%'
    OR LOWER(name) LIKE '%international%'
  );

-- ── Batumi Downtown / City Center → BATD ─────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BATD'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'batumi'
  AND (
    LOWER(name) LIKE '%downtown%'
    OR LOWER(name) LIKE '%city center%'
    OR LOWER(name) LIKE '%city centre%'
  );

-- ── Batumi Hotel → BATH ───────────────────────────────────────────────────────
UPDATE location
SET reservation_code_prefix = 'BATH'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'batumi'
  AND LOWER(name) LIKE '%hotel%';

-- Rows that do not match any pattern above will remain NULL.
-- Admins must configure those locations manually via CRM → Locations Settings.
