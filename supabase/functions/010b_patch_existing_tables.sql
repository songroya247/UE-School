/* ═══════════════════════════════════════════════════════════════════
   UE School — Migration 010b: Core CBT tables + patches
   
   Run this in Supabase SQL Editor AFTER 000_master_schema.sql.

   What it does
   ─────────────
   • Creates questions, session_scores, response_logs, topic_mastery
     tables if they do not exist (safe on a fresh project)
   • Patches any columns missing on an existing project
   • Fixes profiles.mastery_level type mismatch (TEXT → NUMERIC)
   • Creates / replaces fetch_questions, record_session_score,
     increment_xp RPCs
   • Sets up all RLS policies

   Fully idempotent — safe to re-run.
═══════════════════════════════════════════════════════════════════ */

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- 1. QUESTIONS
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.questions (
  id            TEXT        PRIMARY KEY,
  subject       TEXT        NOT NULL,
  topic         TEXT        NOT NULL,
  exam_type     TEXT        NOT NULL,
  year          INT,
  text          TEXT        NOT NULL,
  opts          JSONB       NOT NULL,
  ans           SMALLINT    NOT NULL,
  explanation   TEXT,
  image         TEXT,
  university    TEXT,
  grade_level   SMALLINT    NOT NULL DEFAULT 3,
  image_url     TEXT,
  diagram_type  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patch columns in case table already existed without them
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS university    TEXT,
  ADD COLUMN IF NOT EXISTS grade_level   SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS image_url     TEXT,
  ADD COLUMN IF NOT EXISTS diagram_type  TEXT;

-- Add CHECK constraint only if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'questions'
    AND constraint_name LIKE '%grade_level%'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_grade_level_check
      CHECK (grade_level BETWEEN 1 AND 3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS questions_subject_exam_idx
  ON public.questions (subject, exam_type);
CREATE INDEX IF NOT EXISTS questions_topic_idx
  ON public.questions (topic);
CREATE INDEX IF NOT EXISTS questions_grade_subject_idx
  ON public.questions (grade_level, subject, exam_type);
CREATE INDEX IF NOT EXISTS questions_university_idx
  ON public.questions (lower(university))
  WHERE university IS NOT NULL;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_read_authenticated ON public.questions;
CREATE POLICY questions_read_authenticated
  ON public.questions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS questions_write_service_role ON public.questions;
CREATE POLICY questions_write_service_role
  ON public.questions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 2. SESSION_SCORES
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.session_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT,
  topic           TEXT,
  exam_type       TEXT        NOT NULL,
  score           INT         NOT NULL,
  total_questions INT         NOT NULL,
  accuracy        NUMERIC(5,4) NOT NULL,
  avg_time_per_q  NUMERIC(8,2),
  grade_level     SMALLINT    NOT NULL DEFAULT 3,
  via_rpc         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patch columns in case table already existed without them
ALTER TABLE public.session_scores
  ADD COLUMN IF NOT EXISTS subject        TEXT,
  ADD COLUMN IF NOT EXISTS topic          TEXT,
  ADD COLUMN IF NOT EXISTS avg_time_per_q NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS grade_level    SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS via_rpc        BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS session_scores_user_idx
  ON public.session_scores (user_id, created_at DESC);

ALTER TABLE public.session_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scores_select_own        ON public.session_scores;
DROP POLICY IF EXISTS "scores_self_select"     ON public.session_scores;
CREATE POLICY scores_select_own
  ON public.session_scores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS scores_rpc_only_insert   ON public.session_scores;
DROP POLICY IF EXISTS "scores_self_insert"     ON public.session_scores;
CREATE POLICY scores_rpc_only_insert
  ON public.session_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id AND via_rpc = TRUE);

DROP POLICY IF EXISTS admin_read_all_scores    ON public.session_scores;
CREATE POLICY admin_read_all_scores
  ON public.session_scores FOR SELECT
  USING (public.is_current_user_admin());

-- ══════════════════════════════════════════════════════════════════
-- 3. RESPONSE_LOGS
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.response_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id    TEXT        NOT NULL,
  exam_type   TEXT,
  is_correct  BOOLEAN     NOT NULL,
  time_spent  NUMERIC(8,2),
  grade_level SMALLINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.response_logs
  ADD COLUMN IF NOT EXISTS exam_type   TEXT,
  ADD COLUMN IF NOT EXISTS time_spent  NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS grade_level SMALLINT;

CREATE INDEX IF NOT EXISTS response_logs_user_topic_idx
  ON public.response_logs (user_id, topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS response_logs_user_recent_idx
  ON public.response_logs (user_id, created_at DESC);

ALTER TABLE public.response_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS response_logs_select_own ON public.response_logs;
CREATE POLICY response_logs_select_own
  ON public.response_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS response_logs_insert_own ON public.response_logs;
CREATE POLICY response_logs_insert_own
  ON public.response_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 4. TOPIC_MASTERY
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.topic_mastery (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id            TEXT        NOT NULL,
  accuracy_avg        NUMERIC(5,4),
  mastery_level       NUMERIC(5,4),
  grade_level         SMALLINT    NOT NULL DEFAULT 3,
  attempts_at_grade1  INT         NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'NIL',
  last_studied        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patch columns in case table already existed without them
ALTER TABLE public.topic_mastery
  ADD COLUMN IF NOT EXISTS accuracy_avg       NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS mastery_level      NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS grade_level        SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS attempts_at_grade1 INT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status             TEXT     NOT NULL DEFAULT 'NIL',
  ADD COLUMN IF NOT EXISTS last_studied       TIMESTAMPTZ;

-- Add status CHECK constraint only if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'topic_mastery'
    AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE public.topic_mastery
      ADD CONSTRAINT topic_mastery_status_check
      CHECK (status IN ('NIL', 'IN_PROGRESS', 'MASTERED'));
  END IF;
END $$;

-- Add unique constraint only if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'topic_mastery'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.topic_mastery
      ADD CONSTRAINT topic_mastery_user_topic_unique
      UNIQUE (user_id, topic_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS topic_mastery_user_idx
  ON public.topic_mastery (user_id, topic_id);
CREATE INDEX IF NOT EXISTS topic_mastery_last_studied_idx
  ON public.topic_mastery (user_id, last_studied DESC);

ALTER TABLE public.topic_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_mastery_select_own ON public.topic_mastery;
CREATE POLICY topic_mastery_select_own
  ON public.topic_mastery FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS topic_mastery_insert_own ON public.topic_mastery;
CREATE POLICY topic_mastery_insert_own
  ON public.topic_mastery FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS topic_mastery_update_own ON public.topic_mastery;
CREATE POLICY topic_mastery_update_own
  ON public.topic_mastery FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 5. PROFILES — fix type mismatches
-- ══════════════════════════════════════════════════════════════════
-- mastery_level was TEXT 'beginner' in the original schema but
-- grading.js writes a NUMERIC value (0.0–1.0). Fix it.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'mastery_level'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN mastery_level;
    ALTER TABLE public.profiles ADD COLUMN mastery_level NUMERIC(5,4) DEFAULT 0;
  END IF;
END $$;

-- accuracy_avg: ensure it exists as numeric
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accuracy_avg NUMERIC(5,4) DEFAULT 0;

-- ══════════════════════════════════════════════════════════════════
-- 6. fetch_questions RPC
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.fetch_questions(TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.fetch_questions(TEXT, TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.fetch_questions(TEXT, TEXT, TEXT, TEXT, SMALLINT, INT);

CREATE OR REPLACE FUNCTION public.fetch_questions(
  p_subject     TEXT     DEFAULT NULL,
  p_topic       TEXT     DEFAULT NULL,
  p_exam_type   TEXT     DEFAULT NULL,
  p_university  TEXT     DEFAULT NULL,
  p_grade_level SMALLINT DEFAULT NULL,
  p_count       INT      DEFAULT 10
)
RETURNS TABLE (
  id            TEXT,
  subject       TEXT,
  topic         TEXT,
  "examType"    TEXT,
  year          INT,
  grade_level   SMALLINT,
  text          TEXT,
  opts          JSONB,
  explanation   TEXT,
  image_url     TEXT,
  diagram_type  TEXT,
  university    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.subject,
    q.topic,
    q.exam_type   AS "examType",
    q.year,
    q.grade_level,
    q.text,
    q.opts,
    q.explanation,
    q.image_url,
    q.diagram_type,
    q.university
  FROM public.questions q
  WHERE
    (p_subject      IS NULL OR q.subject     = lower(p_subject))
    AND (p_topic    IS NULL OR q.topic       = p_topic)
    AND (p_exam_type IS NULL OR q.exam_type  = p_exam_type)
    AND (
      p_university IS NULL
      OR q.university IS NULL
      OR lower(q.university) = lower(p_university)
    )
    AND (
      p_grade_level IS NULL
      OR q.grade_level >= p_grade_level
    )
  ORDER BY random()
  LIMIT LEAST(GREATEST(1, COALESCE(p_count, 10)), 60);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_questions(TEXT, TEXT, TEXT, TEXT, SMALLINT, INT)
  TO authenticated, anon;

-- ══════════════════════════════════════════════════════════════════
-- 7. record_session_score RPC
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_session_score(
  p_exam_type        TEXT,
  p_score            INT,
  p_total_questions  INT,
  p_accuracy         NUMERIC,
  p_avg_time_per_q   NUMERIC,
  p_grade_level      INT,
  p_question_ids     TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_score_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_score < 0 OR p_score > p_total_questions THEN
    RAISE EXCEPTION 'Invalid score: % / %', p_score, p_total_questions;
  END IF;

  IF p_total_questions > 0 AND
     ABS(p_accuracy - (p_score::NUMERIC / p_total_questions)) > 0.01 THEN
    RAISE EXCEPTION 'Accuracy mismatch';
  END IF;

  INSERT INTO public.session_scores (
    user_id, exam_type, score, total_questions,
    accuracy, avg_time_per_q, grade_level, via_rpc
  )
  VALUES (
    v_user_id, p_exam_type, p_score, p_total_questions,
    p_accuracy, p_avg_time_per_q, p_grade_level, TRUE
  )
  RETURNING id INTO v_score_id;

  RETURN v_score_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_session_score(TEXT, INT, INT, NUMERIC, NUMERIC, INT, TEXT[])
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 8. increment_xp RPC
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_xp(p_amount INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET total_xp = COALESCE(total_xp, 0) + p_amount
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_xp(INT)
  TO authenticated;

COMMIT;
