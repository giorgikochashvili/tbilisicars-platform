-- Phase 4: Advance Payment / Pending Receivables
-- Adds ADVANCE_PAYMENT payment type and three lifecycle tracking columns.
-- Safe: ADD VALUE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. No existing rows touched.

-- 1. New payment type enum value
ALTER TYPE booking_payment_type_enum ADD VALUE IF NOT EXISTS 'ADVANCE_PAYMENT';

-- 2. Lifecycle tracking columns on booking_payment
ALTER TABLE booking_payment
  ADD COLUMN IF NOT EXISTS advance_status  varchar(10)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS received_at     timestamp    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS received_by_id  integer      DEFAULT NULL;

-- 3. Partial index — only indexes pending/received rows (tiny footprint)
CREATE INDEX IF NOT EXISTS idx_booking_payment_advance_status
  ON booking_payment(advance_status)
  WHERE advance_status IS NOT NULL;
