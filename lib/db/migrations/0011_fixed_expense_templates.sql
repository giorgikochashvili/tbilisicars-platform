-- Phase 5: Fixed Monthly Expense Templates
-- Additive only. No existing rows touched.

-- 1. Template table
CREATE TABLE IF NOT EXISTS fixed_expense_templates (
  id              serial        PRIMARY KEY,
  name            varchar(150)  NOT NULL,
  category        varchar(100)  NOT NULL,
  amount          numeric(12,2) NOT NULL,
  currency        accounting_currency_enum NOT NULL DEFAULT 'GEL',
  due_day         smallint      NOT NULL DEFAULT 1
                  CONSTRAINT chk_due_day CHECK (due_day BETWEEN 1 AND 28),
  is_active       boolean       NOT NULL DEFAULT true,
  notes           text,
  created_by_id   integer,
  created_at      timestamp     NOT NULL DEFAULT now(),
  updated_at      timestamp     NOT NULL DEFAULT now()
);

-- 2. Back-link columns on accounting_entries only
ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS fixed_expense_template_id  integer  DEFAULT NULL
    REFERENCES fixed_expense_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fixed_expense_month        varchar(7) DEFAULT NULL;

-- 3. Unique partial index — prevents duplicate monthly post at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_expense_post
  ON accounting_entries(fixed_expense_template_id, fixed_expense_month)
  WHERE fixed_expense_template_id IS NOT NULL
    AND fixed_expense_month IS NOT NULL;

-- 4. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_fixed_expense_templates_is_active
  ON fixed_expense_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_template_id
  ON accounting_entries(fixed_expense_template_id)
  WHERE fixed_expense_template_id IS NOT NULL;
