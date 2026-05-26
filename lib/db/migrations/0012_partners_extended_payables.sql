-- Migration 0012: extend partner table, add vehicle.partner_id, create partner_payable
-- Safe: only adds new columns/tables/indexes. No existing data is altered or dropped.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE partner_role_enum AS ENUM ('VEHICLE_OWNER', 'BROKER_REFERRER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE partner_payable_status_enum AS ENUM ('PENDING', 'PAID', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Extend partner table ─────────────────────────────────────────────────────
-- Existing rows default to 'BROKER_REFERRER', preserving current broker/referrer usage.

ALTER TABLE partner
  ADD COLUMN IF NOT EXISTS partner_role    partner_role_enum NOT NULL DEFAULT 'BROKER_REFERRER',
  ADD COLUMN IF NOT EXISTS type            varchar(20)       DEFAULT 'Individual',
  ADD COLUMN IF NOT EXISTS personal_id_or_company_id varchar(100),
  ADD COLUMN IF NOT EXISTS bank_name       varchar(150),
  ADD COLUMN IF NOT EXISTS bank_account    varchar(100),
  ADD COLUMN IF NOT EXISTS iban            varchar(50),
  ADD COLUMN IF NOT EXISTS account_holder_name varchar(150),
  ADD COLUMN IF NOT EXISTS agreement_notes text,
  ADD COLUMN IF NOT EXISTS general_notes   text,
  ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_partner_role      ON partner (partner_role);
CREATE INDEX IF NOT EXISTS idx_partner_is_active ON partner (is_active);

-- ─── Add vehicle.partner_id ───────────────────────────────────────────────────

ALTER TABLE vehicle
  ADD COLUMN IF NOT EXISTS partner_id integer REFERENCES partner(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_partner_id ON vehicle (partner_id);

-- ─── Create partner_payable table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_payable (
  id                              serial PRIMARY KEY,
  partner_id                      integer NOT NULL REFERENCES partner(id),
  booking_id                      integer REFERENCES booking(id) ON DELETE SET NULL,
  vehicle_id                      integer REFERENCES vehicle(id) ON DELETE SET NULL,
  source_income_accounting_entry_id integer NOT NULL REFERENCES accounting_entries(id),
  amount                          numeric(12, 2) NOT NULL,
  currency                        accounting_currency_enum NOT NULL DEFAULT 'GEL',
  status                          partner_payable_status_enum NOT NULL DEFAULT 'PENDING',
  notes                           text,
  created_by_admin_id             integer REFERENCES admins(id) ON DELETE SET NULL,
  paid_by_admin_id                integer REFERENCES admins(id) ON DELETE SET NULL,
  paid_at                         timestamp,
  expense_accounting_entry_id     integer REFERENCES accounting_entries(id) ON DELETE SET NULL,
  created_at                      timestamp NOT NULL DEFAULT now(),
  updated_at                      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_partner_id      ON partner_payable (partner_id);
CREATE INDEX IF NOT EXISTS idx_pp_source_income_id ON partner_payable (source_income_accounting_entry_id);
CREATE INDEX IF NOT EXISTS idx_pp_status           ON partner_payable (status);
CREATE INDEX IF NOT EXISTS idx_pp_booking_id       ON partner_payable (booking_id);
CREATE INDEX IF NOT EXISTS idx_pp_vehicle_id       ON partner_payable (vehicle_id);

-- One non-canceled payable per source income entry.
-- Blocks both PENDING and PAID — only CANCELED allows a new payable for the same income entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pp_active_per_income
  ON partner_payable (source_income_accounting_entry_id)
  WHERE status != 'CANCELED';
