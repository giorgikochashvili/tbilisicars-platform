-- Idempotent backfill: set reservation_code_prefix for known Georgian locations.
-- Run this once after deploying the reservation_code_prefix column.
-- Uses UPDATE ... WHERE to ensure no accidental overwrites on re-run.

UPDATE location
SET reservation_code_prefix = 'TBS'
WHERE reservation_code_prefix IS NULL
  AND (LOWER(name) LIKE '%tbilisi%' OR LOWER(city) LIKE '%tbilisi%');

UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND (LOWER(name) LIKE '%kutaisi%' OR LOWER(city) LIKE '%kutaisi%');

UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND (LOWER(name) LIKE '%batumi%' OR LOWER(city) LIKE '%batumi%');

UPDATE location
SET reservation_code_prefix = 'KAZ'
WHERE reservation_code_prefix IS NULL
  AND (LOWER(name) LIKE '%kazbegi%' OR LOWER(city) LIKE '%kazbegi%');
