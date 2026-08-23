-- Overhead Expense Management (phase 1).
--
-- Two-level model: overhead_expenses holds the recurring DEFINITION;
-- overhead_expense_periods holds each generated OCCURRENCE with the amount
-- SNAPSHOTTED at generation time. The snapshot is what lets a rate change
-- (Internet 1,500 -> 1,700) leave last month's history untouched.
--
-- Statuses here are only scheduled/paid/cancelled. 'due' and 'overdue' are
-- derived at read time from due_date, so no nightly job is needed to flip them
-- (this deploy has no working cron).

CREATE TABLE IF NOT EXISTS overhead_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overhead_expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(150) NOT NULL,
    category_id       UUID NOT NULL REFERENCES overhead_categories(id) ON DELETE RESTRICT,
    description       TEXT,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    frequency         VARCHAR(20) NOT NULL CHECK (frequency IN
                        ('one-time','daily','weekly','monthly',
                         'quarterly','semiannual','annual','custom')),
    interval_count    INT CHECK (interval_count > 0),
    interval_unit     VARCHAR(10) CHECK (interval_unit IN ('day','week','month')),
    start_date        DATE NOT NULL,
    end_date          DATE,
    due_day           INT CHECK (due_day BETWEEN 1 AND 31),
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    notes             TEXT,
    generated_through DATE,
    created_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT overhead_expenses_dates_chk
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT overhead_expenses_custom_chk
        CHECK (frequency <> 'custom'
               OR (interval_count IS NOT NULL AND interval_unit IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_overhead_expenses_active
    ON overhead_expenses(active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_overhead_expenses_category
    ON overhead_expenses(category_id);

CREATE TABLE IF NOT EXISTS overhead_expense_periods (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID NOT NULL REFERENCES overhead_expenses(id) ON DELETE RESTRICT,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    due_date      DATE NOT NULL,
    amount_due    NUMERIC(12,2) NOT NULL CHECK (amount_due > 0),
    status        VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','paid','cancelled')),
    accrual_month DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT overhead_periods_unique UNIQUE (expense_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_overhead_periods_accrual
    ON overhead_expense_periods(accrual_month);
CREATE INDEX IF NOT EXISTS idx_overhead_periods_due
    ON overhead_expense_periods(due_date) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_overhead_periods_expense
    ON overhead_expense_periods(expense_id);

CREATE TABLE IF NOT EXISTS overhead_expense_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id   UUID NOT NULL REFERENCES overhead_expense_periods(id) ON DELETE RESTRICT,
    paid_on     DATE NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    method      VARCHAR(50),
    reference   VARCHAR(100),
    notes       TEXT,
    recorded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overhead_payments_period
    ON overhead_expense_payments(period_id);

-- Six top-level groups from the module doc. The doc's sub-bullets
-- ("Internet", "Cloud services") are expense NAMES, not categories.
INSERT INTO overhead_categories (name, sort_order) VALUES
    ('Property', 1),
    ('Utilities', 2),
    ('Software & Technology', 3),
    ('Maintenance', 4),
    ('Administrative', 5),
    ('Other', 6)
ON CONFLICT (name) DO NOTHING;
