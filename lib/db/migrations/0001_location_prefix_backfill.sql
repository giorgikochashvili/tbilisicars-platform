-- Idempotent backfill: set reservation_code_prefix for the three core Georgian locations.
-- This is a ONE-TIME migration. Safe to re-run: UPDATE only touches NULL rows.
-- Prefixes: TBS = Tbilisi, KUT = Kutaisi, BAT = Batumi

UPDATE location
SET reservation_code_prefix = 'TBS'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'tbilisi';

UPDATE location
SET reservation_code_prefix = 'KUT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'kutaisi';

UPDATE location
SET reservation_code_prefix = 'BAT'
WHERE reservation_code_prefix IS NULL
  AND LOWER(city) = 'batumi';
