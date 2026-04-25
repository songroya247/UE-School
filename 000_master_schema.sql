-- ═══════════════════════════════════════════════════════════════════
-- UE School — MASTER SCHEMA  (merged from 001 → 005)
--
-- ✅ FULLY IDEMPOTENT — safe to run on a FRESH database OR on top
--    of a live database that already has students enrolled.
--    Every statement uses IF NOT EXISTS / CREATE OR REPLACE /
--    DROP … IF EXISTS so nothing breaks if already applied.
--
-- HOW TO APPLY
--   Supabase → SQL Editor → New Query → paste entire file → Run
--
-- ORDER OF SECTIONS
--   1.  Extensions
--   2.  profiles table  (CREATE if not exists + all columns)
--   3.  Helper functions  (is_admin, is_current_user_admin)
--   4.  profiles — RLS policies
--   5.  Triggers  (email_unsub_token auto-fill)
--   6.  Public RPCs  (unsubscribe / resubscribe weekly report)
--   7.  payments table, indexes, RLS
--   8.  admin_audit_log table, indexes, RLS
--   9.  Constraint fixes  (status CHECK values)
--  10.  Bootstrap comment  (how to promote yourself to admin)
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes() for unsub tokens


-- ─────────────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE
--    References auth.users (managed by Supabase Auth).
--    CREATE TABLE IF NOT EXISTS — skipped entirely on a live DB that
--    already has this table; no data is lost.
--    All ADD COLUMN IF NOT EXISTS below handle the case where the
--    table exists but is missing columns added in later migrations.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  -- Identity
  id                    UUID          PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  cs_notes              TEXT,

  -- Subscription / access
  is_premium            BOOLEAN       NOT NULL DEFAULT false,
  is_admin              BOOLEAN       NOT NULL DEFAULT false,
  subscription_expiry   TIMESTAMPTZ,
  status                TEXT          NOT NULL DEFAULT 'NIL',

  -- Exam goals
  exam_types            TEXT[]        DEFAULT '{}',
  exam_subjects         TEXT[]        DEFAULT '{}',
  exam_date             DATE,
  target_score          INTEGER,
  target_grade          TEXT,
  current_skill_level   INTEGER       DEFAULT 3,
  study_mode            TEXT          DEFAULT 'drill',

  -- Progress / analytics
  total_xp              INTEGER       NOT NULL DEFAULT 0,
  accuracy_avg          NUMERIC(5,2)  DEFAULT 0,
  mastery_level         TEXT          DEFAULT 'beginner',
  usage_logs            JSONB         DEFAULT '[]'::jsonb,
  smartpath_queue       JSONB         DEFAULT '[]'::jsonb,

  -- Email / reporting
  weekly_report_optin   BOOLEAN       NOT NULL DEFAULT true,
  email_unsub_token     TEXT,
  last_weekly_email_at  TIMESTAMPTZ,
  report_share_token    TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Catch-up columns for existing databases missing later additions.
-- All are no-ops when the column already exists.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone                TEXT,
  ADD COLUMN IF NOT EXISTS cs_notes             TEXT,
  ADD COLUMN IF NOT EXISTS is_admin             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_expiry  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weekly_report_optin  BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_unsub_token    TEXT,
  ADD COLUMN IF NOT EXISTS last_weekly_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_share_token   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill unsub token for any existing rows that don't have one yet
UPDATE profiles
   SET email_unsub_token = encode(gen_random_bytes(18), 'hex')
 WHERE email_unsub_token IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON profiles (is_admin) WHERE is_admin = true;

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON profiles (created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_subscription_expiry_idx
  ON profiles (subscription_expiry);

CREATE INDEX IF NOT EXISTS profiles_weekly_report_optin_idx
  ON profiles (weekly_report_optin) WHERE weekly_report_optin = true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unsub_token_idx
  ON profiles (email_unsub_token);

CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON profiles (lower(email));


-- ─────────────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTIONS
--    SECURITY DEFINER prevents the recursive-RLS problem: a policy on
--    `profiles` that also queries `profiles` would loop forever without
--    this. Both names are kept so older policies that reference
--    is_admin() still compile.
-- ─────────────────────────────────────────────────────────────────────

-- is_admin() — legacy name, kept for backward compat
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;
REVOKE ALL    ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- is_current_user_admin() — canonical name used in all new policies
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;
REVOKE ALL    ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. PROFILES — RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Own row: read
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING ( auth.uid() = id );

-- Own row: update
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING ( auth.uid() = id );

-- Own row: insert (used by the auto-create path in auth-guard.js)
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK ( auth.uid() = id );

-- Admin: read ALL profiles
DROP POLICY IF EXISTS "admin_read_all_profiles"  ON profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles"
  ON profiles FOR SELECT TO authenticated
  USING ( public.is_current_user_admin() );

-- Admin: update ANY profile (CS notes, flags, etc.)
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE TO authenticated
  USING ( public.is_current_user_admin() );

-- Optional: admin read on session_scores if that table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'session_scores'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_scores" ON session_scores';
    EXECUTE $p$
      CREATE POLICY "admin_read_all_scores"
        ON session_scores FOR SELECT
        USING ( public.is_current_user_admin() )
    $p$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 5. TRIGGER — auto-fill email_unsub_token on INSERT
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_email_unsub_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_unsub_token IS NULL THEN
    NEW.email_unsub_token := encode(gen_random_bytes(18), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_email_unsub_token ON profiles;
CREATE TRIGGER profiles_set_email_unsub_token
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_email_unsub_token();


-- ─────────────────────────────────────────────────────────────────────
-- 6. PUBLIC RPCs — weekly report opt in / out
--    SECURITY DEFINER lets the anon role update a row via token alone,
--    without needing to be logged in (for email unsubscribe links).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unsubscribe_weekly_report(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN json_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  UPDATE profiles
     SET weekly_report_optin = false
   WHERE email_unsub_token = p_token
   RETURNING email INTO v_email;

  IF v_email IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN json_build_object('ok', true, 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unsubscribe_weekly_report(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resubscribe_weekly_report(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN json_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  UPDATE profiles
     SET weekly_report_optin = true
   WHERE email_unsub_token = p_token
   RETURNING email INTO v_email;

  IF v_email IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN json_build_object('ok', true, 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resubscribe_weekly_report(TEXT) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 7. PAYMENTS TABLE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id          BIGSERIAL    PRIMARY KEY,
  reference   TEXT         NOT NULL UNIQUE,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INTEGER      NOT NULL,          -- kobo  (150000 = ₦1,500)
  plan        TEXT         NOT NULL,          -- 'monthly' | 'quarterly' | 'annual'
  status      TEXT         NOT NULL DEFAULT 'pending',
  email       TEXT,
  paid_at     TIMESTAMPTZ,
  raw         JSONB,                          -- raw Paystack transaction payload
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  payments IS 'Paystack subscription payments. Verified server-side by the verify-payment Edge Function.';
COMMENT ON COLUMN payments.amount IS 'Paid amount in kobo (e.g. 150000 = ₦1,500)';
COMMENT ON COLUMN payments.status IS 'pending → success | failed | refunded';

CREATE INDEX IF NOT EXISTS payments_user_id_idx    ON payments (user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx     ON payments (status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments (created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users insert their own pending rows only
DROP POLICY IF EXISTS "payments_insert_own_pending" ON payments;
CREATE POLICY "payments_insert_own_pending"
  ON payments FOR INSERT TO authenticated
  WITH CHECK ( auth.uid() = user_id AND status = 'pending' );

-- Users read their own payment history
DROP POLICY IF EXISTS "payments_select_own" ON payments;
CREATE POLICY "payments_select_own"
  ON payments FOR SELECT TO authenticated
  USING ( auth.uid() = user_id );

-- Users can cancel (pending → failed) but CANNOT mark success
DROP POLICY IF EXISTS "payments_update_own_cancel" ON payments;
CREATE POLICY "payments_update_own_cancel"
  ON payments FOR UPDATE TO authenticated
  USING  ( auth.uid() = user_id AND status = 'pending' )
  WITH CHECK ( auth.uid() = user_id AND status = 'failed' );

-- Admins read all payments
DROP POLICY IF EXISTS "payments_admin_read_all"  ON payments;
DROP POLICY IF EXISTS "Admins read all payments" ON payments;
CREATE POLICY "payments_admin_read_all"
  ON payments FOR SELECT TO authenticated
  USING ( public.is_current_user_admin() );


-- ─────────────────────────────────────────────────────────────────────
-- 8. ADMIN AUDIT LOG TABLE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           BIGSERIAL    PRIMARY KEY,
  admin_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email  TEXT,
  target_id    UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  action       TEXT         NOT NULL,    -- grant_premium | revoke_premium | extend | refund
  details      JSONB        DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON admin_audit_log;
CREATE POLICY "Admins read audit log"
  ON admin_audit_log FOR SELECT TO authenticated
  USING ( public.is_current_user_admin() );
-- INSERT is service-role only (Edge Functions) — no client policy needed


-- ─────────────────────────────────────────────────────────────────────
-- 9. CONSTRAINT FIXES
--    Drop the old constraint first (if any), then re-add with the
--    full canonical set of values the webhook / Edge Functions write.
-- ─────────────────────────────────────────────────────────────────────

-- profiles.status
DO $$
BEGIN
  EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check';
END $$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN (
    'NIL', 'ACTIVE', 'EXPIRED',
    'CANCEL_SCHEDULED', 'PAYMENT_FAILED', 'REFUNDED'
  ));

-- payments.status
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'refunded'));


-- ─────────────────────────────────────────────────────────────────────
-- 10. BOOTSTRAP — promote your first admin
--     Uncomment ONE line, replace the email, run once, then re-comment.
--     After this, log in normally and visit /admin-actions.html.
-- ─────────────────────────────────────────────────────────────────────
-- UPDATE profiles SET is_admin = true WHERE email = 'you@ultimateedge.info';
