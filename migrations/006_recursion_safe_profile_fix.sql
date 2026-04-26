-- ═══════════════════════════════════════════════════════════════════
-- UE School — SUPABASE_FIX.sql   (v2 — recursion-safe)
--
-- One-shot, fully idempotent fix for production:
--   • "We could not load your profile. Please contact support."
--   • "infinite recursion detected in policy for relation 'profiles'"
--
-- Run in Supabase  →  SQL Editor  →  New Query  →  Run.
-- Safe to run on a live database with real students.
-- Safe to re-run as many times as you like.
--
-- WHAT v2 ADDS OVER v1
--   • Drops EVERY existing policy on `profiles` before re-creating —
--     this purges leftover admin policies from earlier migrations
--     that recursively query `profiles` themselves and cause Postgres
--     to throw "infinite recursion detected in policy for relation
--     profiles" (which is exactly what the new auth-guard toast is
--     reporting on production right now).
--   • Replaces the admin SELECT/UPDATE policies with non-recursive
--     versions backed by JWT `app_metadata.is_admin`. Reading a JWT
--     claim never touches the `profiles` table, so it cannot recurse.
--   • Keeps the `is_current_user_admin()` helper (still useful for
--     server-side / RPC code) but isolates it so it can NEVER be
--     called from a policy on `profiles`.
-- ═══════════════════════════════════════════════════════════════════

-- 1. EXTENSIONS ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. PROFILES table — create + add every catch-up column ────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  email                 TEXT,
  is_premium            BOOLEAN     NOT NULL DEFAULT false,
  status                TEXT        NOT NULL DEFAULT 'NIL',
  total_xp              INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone                TEXT,
  ADD COLUMN IF NOT EXISTS cs_notes             TEXT,
  ADD COLUMN IF NOT EXISTS is_admin             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_expiry  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_types           TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exam_subjects        TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exam_date            DATE,
  ADD COLUMN IF NOT EXISTS target_score         INTEGER,
  ADD COLUMN IF NOT EXISTS target_grade         TEXT,
  ADD COLUMN IF NOT EXISTS current_skill_level  INTEGER     DEFAULT 3,
  ADD COLUMN IF NOT EXISTS study_mode           TEXT        DEFAULT 'drill',
  ADD COLUMN IF NOT EXISTS accuracy_avg         NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mastery_level        TEXT        DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS usage_logs           JSONB       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS smartpath_queue      JSONB       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_report_optin  BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_unsub_token    TEXT,
  ADD COLUMN IF NOT EXISTS last_weekly_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_share_token   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill unsub token for existing rows
UPDATE profiles
   SET email_unsub_token = encode(gen_random_bytes(18), 'hex')
 WHERE email_unsub_token IS NULL;

-- Indexes (idempotent)
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

-- 3. ░░░  WIPE EVERY EXISTING POLICY ON profiles  ░░░ ───────────────
--    This is what kills the "infinite recursion" error. Anything
--    that called itself, queried profiles, or referenced is_admin
--    from inside an RLS expression is gone after this block.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
     WHERE polrelid = 'public.profiles'::regclass
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.polname);
  END LOOP;
END $$;

-- 4. RE-CREATE ONLY THE SAFE, NON-RECURSIVE POLICIES ────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Each user can read their own row.  No subquery, no function call,
-- no chance of recursion.
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING ( auth.uid() = id );

-- Each user can insert their own row (used by the auto-create path
-- in auth-guard.js).
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK ( auth.uid() = id );

-- Each user can update their own row.
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING      ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

-- Admin SELECT / UPDATE — gated by a JWT claim, NOT by a query
-- against profiles. Reading a JWT claim cannot recurse.
-- Promote a user to admin by setting auth.users.raw_app_meta_data.is_admin = true
-- (see Step 5 below for the helper trigger).
CREATE POLICY "profiles_admin_select_all"
  ON profiles FOR SELECT TO authenticated
  USING (
    COALESCE(
      ((auth.jwt() -> 'app_metadata') ->> 'is_admin')::boolean,
      false
    ) = true
  );

CREATE POLICY "profiles_admin_update_all"
  ON profiles FOR UPDATE TO authenticated
  USING (
    COALESCE(
      ((auth.jwt() -> 'app_metadata') ->> 'is_admin')::boolean,
      false
    ) = true
  );

-- 5. KEEP profiles.is_admin AND auth.users.app_metadata.is_admin IN SYNC
--    Whenever you flip profiles.is_admin, mirror it onto the auth user's
--    app_metadata so the JWT-based policies above start applying on
--    the user's NEXT login (or token refresh).
CREATE OR REPLACE FUNCTION public.sync_admin_claim()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    UPDATE auth.users
       SET raw_app_meta_data =
             COALESCE(raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object('is_admin', NEW.is_admin)
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_admin_claim ON profiles;
CREATE TRIGGER profiles_sync_admin_claim
  AFTER UPDATE OF is_admin ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_claim();

-- One-time backfill: copy current is_admin values into app_metadata.
UPDATE auth.users u
   SET raw_app_meta_data =
         COALESCE(u.raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('is_admin', p.is_admin)
  FROM profiles p
 WHERE p.id = u.id
   AND COALESCE((u.raw_app_meta_data ->> 'is_admin')::boolean, false)
       IS DISTINCT FROM COALESCE(p.is_admin, false);

-- 6. is_current_user_admin() — kept for server-side / RPC use only.
--    Do NOT call this from a policy on `profiles`. Use the JWT-based
--    policies above instead. This version is fully recursion-proof
--    because it reads from the JWT, not from the table.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    ((auth.jwt() -> 'app_metadata') ->> 'is_admin')::boolean,
    false
  );
$$;
REVOKE ALL    ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Older alias kept for any code that imports it.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT public.is_current_user_admin();
$$;
REVOKE ALL    ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 7. Auto-fill email_unsub_token trigger ────────────────────────────
CREATE OR REPLACE FUNCTION public.set_email_unsub_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  FOR EACH ROW EXECUTE FUNCTION public.set_email_unsub_token();

-- 8. Loosen status CHECK ───────────────────────────────────────────
DO $$ BEGIN
  EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check';
END $$;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN (
    'NIL', 'ACTIVE', 'EXPIRED',
    'CANCEL_SCHEDULED', 'PAYMENT_FAILED', 'REFUNDED'
  ));

-- 9. Refresh PostgREST schema cache so changes show up immediately ──
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- DONE.  Open dashboard.html in an Incognito window. The toast is gone.
--
-- Optional: promote yourself to admin (run AFTER this script):
--   UPDATE profiles SET is_admin = true
--    WHERE email = 'you@ultimateedge.info';
--   -- then sign out and sign back in so the new JWT carries the claim.
-- ═══════════════════════════════════════════════════════════════════
