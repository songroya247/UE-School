-- ═══════════════════════════════════════════════════════════════════
-- UE School — Migration 002
-- Adds weekly performance-report email opt-in.
--
-- HOW TO APPLY (Supabase → SQL Editor → New Query → paste → Run):
--   Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Required extension ──────────────────────────────────────────
-- gen_random_bytes() lives in pgcrypto. It is enabled by default on
-- every recent Supabase project, but we make sure here so the
-- migration is portable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Columns on profiles ─────────────────────────────────────────
-- weekly_report_optin   true by default — every existing user is opted-in
--                       and can flip the switch from the dashboard.
-- email_unsub_token     opaque random string used in the unsubscribe URL
--                       so the user does NOT need to be logged in to
--                       opt out from the email itself.
-- last_weekly_email_at  bookkeeping so the cron job never double-sends.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weekly_report_optin   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_unsub_token     TEXT,
  ADD COLUMN IF NOT EXISTS last_weekly_email_at  TIMESTAMPTZ;

-- Backfill an unsubscribe token for every existing row that doesn't have one.
UPDATE profiles
   SET email_unsub_token = encode(gen_random_bytes(18), 'hex')
 WHERE email_unsub_token IS NULL;

-- New rows from this point on get a token automatically via a trigger.
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

-- Unique index so the token is a safe lookup key
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unsub_token_idx
  ON profiles (email_unsub_token);

-- Index used by the cron job's queue scan
CREATE INDEX IF NOT EXISTS profiles_weekly_report_optin_idx
  ON profiles (weekly_report_optin)
  WHERE weekly_report_optin = true;

-- ── 2. Public unsubscribe RPC ──────────────────────────────────────
-- Lets the unsubscribe.html page call this with a token only.
-- SECURITY DEFINER so the anon role can update the row even though
-- the table-level UPDATE policy is restricted to the row owner.
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

-- ── 3. (Optional) public RE-subscribe RPC ──────────────────────────
-- Mirrored helper for the unsubscribe page's "changed your mind?" link.
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
