/* ═══════════════════════════════════════════════════════════════════
   UE School — Migration 007: Features v2
   Backs the eight new features added on top of the v1 dashboard:
     1. Topic weakness heatmap          (no schema change — uses topic_mastery)
     2. WAEC/NECO grade prediction      (no schema change — uses topic_mastery)
     3. PDF study guides                (no schema change — config-driven)
     4. Post-UTME university question banks → questions.university + RPC
     5. 1-on-1 tutor session            → tutor_bookings table
     6. Downloadable mastery reports    (no schema change — client-side PDF)
     7. Exam-countdown reminders        → profiles.exam_reminder_optin +
                                          profiles.last_reminder_sent_at
     8. WhatsApp support                (no schema change — config-driven)

   Idempotent. Safe to re-run. Apply via the Supabase SQL editor OR
   `psql $DATABASE_URL -f migrations/007_features_v2.sql`.
   ═══════════════════════════════════════════════════════════════════ */

BEGIN;

/* ── 1. Profile additions ──────────────────────────────────────── */
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_reminder_optin   BOOLEAN     DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_university     TEXT;

COMMENT ON COLUMN public.profiles.exam_reminder_optin   IS
  'When true, send-exam-reminders edge function emails the user at the milestones in UE_CONFIG.EXAM_REMINDER_DAYS.';
COMMENT ON COLUMN public.profiles.last_reminder_sent_at IS
  'Timestamp of the most recent exam-countdown reminder, used to dedupe across cron runs.';
COMMENT ON COLUMN public.profiles.target_university     IS
  'Optional Post-UTME university label, mirrors UE_CONFIG.POST_UTME_UNIVERSITIES values.';

/* ── 2. Question bank: per-university tagging ──────────────────── */
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS university TEXT;

CREATE INDEX IF NOT EXISTS questions_university_idx
  ON public.questions (lower(university))
  WHERE university IS NOT NULL;

COMMENT ON COLUMN public.questions.university IS
  'Free-text university label. NULL means the question is general (offered to every Post-UTME student). Set to a value matching UE_CONFIG.POST_UTME_UNIVERSITIES to scope it.';

/* ── 3. fetch_questions RPC: add p_university ──────────────────── */
DROP FUNCTION IF EXISTS public.fetch_questions(TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.fetch_questions(TEXT, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.fetch_questions(
  p_subject    TEXT DEFAULT NULL,
  p_topic      TEXT DEFAULT NULL,
  p_exam_type  TEXT DEFAULT NULL,
  p_university TEXT DEFAULT NULL,
  p_count      INT  DEFAULT 10
) RETURNS TABLE (
  id          TEXT,
  subject     TEXT,
  topic       TEXT,
  "examType"  TEXT,
  year        INT,
  text        TEXT,
  opts        JSONB,
  explanation TEXT,
  image       TEXT,
  university  TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.subject, q.topic, q.exam_type, q.year, q.text,
         q.opts, q.explanation, q.image, q.university
  FROM   public.questions q
  WHERE  (p_subject    IS NULL OR q.subject   = lower(p_subject))
    AND  (p_topic      IS NULL OR q.topic     = p_topic)
    AND  (p_exam_type  IS NULL OR q.exam_type = p_exam_type)
    AND  (p_university IS NULL OR q.university IS NULL
                                OR lower(q.university) = lower(p_university))
  ORDER BY random()
  LIMIT  GREATEST(1, COALESCE(p_count, 10));
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_questions(TEXT,TEXT,TEXT,TEXT,INT) TO authenticated, anon;

/* ── 4. Tutor bookings ─────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.tutor_bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_at     TIMESTAMPTZ NOT NULL,
  subject     TEXT,
  topic       TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'requested'
              CHECK (status IN ('requested','confirmed','completed','cancelled','no_show')),
  meet_url    TEXT,
  tutor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_bookings_user_idx
  ON public.tutor_bookings (user_id, slot_at DESC);
CREATE INDEX IF NOT EXISTS tutor_bookings_status_idx
  ON public.tutor_bookings (status, slot_at);

ALTER TABLE public.tutor_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tutor_bookings_select_own ON public.tutor_bookings;
CREATE POLICY tutor_bookings_select_own
  ON public.tutor_bookings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS tutor_bookings_insert_own ON public.tutor_bookings;
CREATE POLICY tutor_bookings_insert_own
  ON public.tutor_bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tutor_bookings_update_own ON public.tutor_bookings;
CREATE POLICY tutor_bookings_update_own
  ON public.tutor_bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* keep updated_at fresh */
CREATE OR REPLACE FUNCTION public.tutor_bookings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tutor_bookings_touch ON public.tutor_bookings;
CREATE TRIGGER tutor_bookings_touch
  BEFORE UPDATE ON public.tutor_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tutor_bookings_touch_updated_at();

COMMIT;
