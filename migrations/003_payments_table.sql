-- ═══════════════════════════════════════════════════════════════════
-- UE School — Migration 003
-- Payments table + subscription_expiry column on profiles.
--
-- This is the schema the browser (`js/payment.js → recordPayment`)
-- and the Edge Function (`supabase/functions/verify-payment`) both
-- write to. Without it the "Subscribe" button silently fails on the
-- INSERT and verification cannot mark the user premium.
--
-- HOW TO APPLY (Supabase → SQL Editor → New Query → paste → Run):
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. profiles.subscription_expiry (idempotent) ───────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_expiry TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_subscription_expiry_idx
  ON profiles (subscription_expiry);

-- ── 2. payments table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id          BIGSERIAL PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,                 -- kobo
  plan        TEXT    NOT NULL,                 -- 'monthly' | 'quarterly' | 'annual'
  status      TEXT    NOT NULL DEFAULT 'pending',
              -- 'pending' | 'success' | 'failed'
  email       TEXT,
  paid_at     TIMESTAMPTZ,
  raw         JSONB,                            -- raw Paystack payload
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx  ON payments (status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments (created_at DESC);

-- ── 3. Row-Level Security ──────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 3a. A signed-in user may INSERT a pending row for THEMSELVES.
--     The Edge Function uses the service role and bypasses RLS.
DROP POLICY IF EXISTS "payments_insert_own_pending" ON payments;
CREATE POLICY "payments_insert_own_pending"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

-- 3b. A signed-in user may SELECT their own payment history.
DROP POLICY IF EXISTS "payments_select_own" ON payments;
CREATE POLICY "payments_select_own"
  ON payments FOR SELECT TO authenticated
  USING ( auth.uid() = user_id );

-- 3c. A signed-in user may UPDATE their own pending row to 'failed'
--     when they cancel the Paystack popup. They CANNOT mark success.
DROP POLICY IF EXISTS "payments_update_own_cancel" ON payments;
CREATE POLICY "payments_update_own_cancel"
  ON payments FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'failed'
  );

-- 3d. Admins (profiles.is_admin = true) can read every payment.
DROP POLICY IF EXISTS "payments_admin_read_all" ON payments;
CREATE POLICY "payments_admin_read_all"
  ON payments FOR SELECT TO authenticated
  USING ( public.is_admin() );

-- ── 4. Sanity helpers (optional) ───────────────────────────────────
COMMENT ON TABLE  payments IS 'Paystack subscription payments. Verified by the verify-payment Edge Function using PAYSTACK_SECRET_KEY.';
COMMENT ON COLUMN payments.amount IS 'Paid amount in kobo (e.g. 150000 = ₦1,500)';
COMMENT ON COLUMN payments.status IS 'pending → success or failed (mutated by Edge Function or user-cancel)';
