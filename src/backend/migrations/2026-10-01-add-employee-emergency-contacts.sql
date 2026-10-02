-- employees.emergency_contact_* — written by createEmployee (Owner/CSR "Add
-- staff") and editable on the profile, but these columns were added to the
-- live database by hand and never recorded in a migration. Without them, a
-- database built from this repo (`npm run db:setup`, the test suite) can't
-- create any staff account.
--
-- A no-op where they already exist (the live Supabase database has them).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT;
