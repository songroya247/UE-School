-- ═══════════════════════════════════════════════════════════════════
-- UE School — Migration 001
-- Adds admin role, phone number, and the RLS policies that let an
-- admin user bypass the premium gate AND read every profile from
-- the master dashboard.
--
-- HOW TO APPLY (Supabase → SQL Editor → New Query → paste → Run):
--   1. Run this entire file once.
--   2. To promote a user to admin, run:
--        UPDATE profiles SET is_admin = true
--         WHERE email = 'ops@ueschool.com';
--      That user can now sign up normally, then log in and SEE/USE
--      every premium page exactly as a paying user would — no extra
--      account, no separate password.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add the columns (idempotent) ────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS cs_notes   TEXT;

-- A small helper view for the master dashboard alerts
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON profiles (is_admin);
CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON profiles (created_at DESC);

-- ── 2. Helper function: is the caller an admin? ────────────────────
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
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── 3. RLS — admins can SELECT every profile ───────────────────────
-- (Existing policies that let users read their OWN row stay in place.)
DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles"
  ON profiles FOR SELECT
  USING ( public.is_admin() );

-- Admins can update notes / flags on any profile (CS workflow)
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE
  USING ( public.is_admin() );

-- ── 4. (Optional) admin can read every session_scores row ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_scores') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_scores" ON session_scores';
    EXECUTE 'CREATE POLICY "admin_read_all_scores"
               ON session_scores FOR SELECT
               USING ( public.is_admin() )';
  END IF;
END $$;

-- ── 5. Promote your first admin ────────────────────────────────────
-- (Replace the email below with the founder / ops account, then run.)
-- UPDATE profiles SET is_admin = true WHERE email = 'YOU@example.com';
