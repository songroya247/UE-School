-- ═══════════════════════════════════════════════════════════════════
-- UE School — Migration 004
-- Loosens the profiles.status check (if any) so the webhook can write
-- the new lifecycle states, and adds a 'refunded' status to payments.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. profiles.status — make sure ALL webhook states are allowed ──
-- (No-op if there is no CHECK constraint. We drop and re-add as a
--  TEXT column; existing rows are unaffected.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.constraint_column_usage
     WHERE table_name  = 'profiles'
       AND column_name = 'status'
  ) THEN
    EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check';
  END IF;
END $$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN (
    'NIL', 'ACTIVE', 'EXPIRED',
    'CANCEL_SCHEDULED', 'PAYMENT_FAILED', 'REFUNDED'
  ));

-- ── 2. payments.status — accept 'refunded' too ─────────────────────
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'refunded'));

-- ── 3. Useful index for the webhook lookup ─────────────────────────
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles (lower(email));
