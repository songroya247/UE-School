-- ═══════════════════════════════════════════════════════════════════
-- UE School — Migration 005
-- Adds proper admin role separation, RLS policies for admins to
-- read all profiles + payments, and an audit log for every
-- privileged admin action performed via the admin-action function.
--
-- This decouples ADMIN from PREMIUM. Previously the project told
-- you to set is_premium=true to make someone an admin — that's
-- wrong (a paying student would have admin powers). Use is_admin.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. is_admin column ─────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON profiles (is_admin) WHERE is_admin = TRUE;

-- ── 2. RLS — admins can SELECT every profile ───────────────────────
-- Uses a SECURITY-DEFINER helper to avoid the classic recursive-RLS
-- problem (a policy on `profiles` that also queries `profiles`).
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins read all profiles" ON profiles;
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- ── 3. RLS — admins can SELECT every payment ───────────────────────
DROP POLICY IF EXISTS "Admins read all payments" ON payments;
CREATE POLICY "Admins read all payments"
  ON payments FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- ── 4. Audit log table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email  TEXT,
  target_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  action       TEXT NOT NULL,         -- grant_premium | revoke_premium | extend | refund
  details      JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON admin_audit_log;
CREATE POLICY "Admins read audit log"
  ON admin_audit_log FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- (No INSERT policy — only the service role / Edge Function writes.)

-- ── 5. Bootstrap: turn yourself into an admin ──────────────────────
-- Uncomment, set your email, run once:
--
--   UPDATE profiles SET is_admin = TRUE WHERE email = 'you@example.com';
--
-- After that, log in normally and visit /admin-actions.html.
