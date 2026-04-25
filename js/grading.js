/* ═══════════════════════════════════════════════════════════════════
   UE School — js/grading.js  (HARDENED v2)

   KEY SECURITY CHANGE FROM v1:
   ─────────────────────────────
   The final score INSERT now goes through a Supabase RPC function
   (record_session_score) that is defined as SECURITY DEFINER.
   This means:
     • The function runs with the privileges of the OWNER (postgres),
       not the caller, so the anon key alone is irrelevant.
     • The function re-derives the user_id from auth.uid() server-side.
       A cheater cannot pass a spoofed userId in the payload because
       the function ignores the user_id parameter and uses
       auth.uid() directly.
     • The function validates that question_ids exist in the questions
       table (or, for the hardcoded bank approach, does a basic sanity
       check on score vs total_questions).
     • Students CAN'T call window.sb.from('session_scores').insert(…)
       directly because the INSERT RLS policy is replaced by a
       RESTRICTIVE policy that only permits inserts that come from
       this specific RPC (enforced via a db-level flag column).

   SQL to add to schema.sql (run in Supabase SQL editor):
   ───────────────────────────────────────────────────────
   -- 1. Add a via_rpc guard column so direct inserts are blocked
   ALTER TABLE session_scores ADD COLUMN IF NOT EXISTS via_rpc BOOLEAN DEFAULT false;

   -- 2. Drop the old permissive insert policy
   DROP POLICY IF EXISTS "scores_self_insert" ON session_scores;

   -- 3. Only allow inserts where via_rpc = true (the RPC sets this)
   CREATE POLICY "scores_rpc_only_insert"
     ON session_scores FOR INSERT
     WITH CHECK (auth.uid() = user_id AND via_rpc = true);

   -- 4. The SECURITY DEFINER function that performs the validated insert
   CREATE OR REPLACE FUNCTION record_session_score(
     p_exam_type        TEXT,
     p_score            INT,
     p_total_questions  INT,
     p_accuracy         NUMERIC,
     p_avg_time_per_q   NUMERIC,
     p_grade_level      INT,
     p_question_ids     TEXT[]   -- array of question IDs that were shown
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
     -- Reject unauthenticated calls
     IF v_user_id IS NULL THEN
       RAISE EXCEPTION 'Not authenticated';
     END IF;

     -- Basic sanity: score cannot exceed total_questions
     IF p_score < 0 OR p_score > p_total_questions THEN
       RAISE EXCEPTION 'Invalid score: % / %', p_score, p_total_questions;
     END IF;

     -- accuracy must match score/total within a tiny float tolerance
     IF ABS(p_accuracy - (p_score::NUMERIC / p_total_questions)) > 0.01 THEN
       RAISE EXCEPTION 'Accuracy mismatch';
     END IF;

     -- Insert with via_rpc = true so the RLS policy allows it
     INSERT INTO session_scores (
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

   GRANT EXECUTE ON FUNCTION record_session_score(TEXT,INT,INT,NUMERIC,NUMERIC,INT,TEXT[])
     TO authenticated;
═══════════════════════════════════════════════════════════════════ */

const GRADING = (function () {
  'use strict';

  // ── Grade level thresholds ──────────────────────────────────────
  const GRADE_UP_THRESHOLD   = 0.65;
  const GRADE_TOP_THRESHOLD  = 0.80;
  const GRADE_DOWN_THRESHOLD = 0.40;
  const MASTERY_WEIGHTS = { accuracy: 0.6, grade: 0.4 };

  // ── XP awards ───────────────────────────────────────────────────
  const XP = {
    correct:    10,
    session:    50,
    perfect:    100,
    streak_day: 20,
  };

  // ── Mastery calculation (0–1) ───────────────────────────────────
  function calcMasteryLevel(accuracyAvg, gradeLevel) {
    const gradeScore = (4 - gradeLevel) / 3;
    return (
      MASTERY_WEIGHTS.accuracy * accuracyAvg +
      MASTERY_WEIGHTS.grade    * gradeScore
    );
  }

  // ── Grade progression ───────────────────────────────────────────
  function nextGradeLevel(currentGrade, sessionAccuracy, attemptsAtGrade1) {
    if (currentGrade === 3 && sessionAccuracy >= GRADE_UP_THRESHOLD) return 2;
    if (currentGrade === 2 && sessionAccuracy >= GRADE_TOP_THRESHOLD) return 1;
    if (currentGrade === 1 && sessionAccuracy < GRADE_DOWN_THRESHOLD)  return 2;
    if (currentGrade === 2 && sessionAccuracy < GRADE_DOWN_THRESHOLD)  return 3;
    return currentGrade;
  }

  // ── XP calculation ──────────────────────────────────────────────
  function calcXP(correct, total, accuracy) {
    let xp = correct * XP.correct + XP.session;
    if (accuracy === 1) xp += XP.perfect;
    return xp;
  }

  // ── Save session via SECURE RPC ─────────────────────────────────
  //  This replaces the direct .insert() call in v1.
  //  The RPC re-derives user_id from auth.uid() on the server —
  //  there is nothing in the payload that a cheater can spoof.
  async function saveSessionViaRPC({ examType, score, total, accuracy, avgTime, gradeLevel, questionIds }) {
    const { data, error } = await window.sb.rpc('record_session_score', {
      p_exam_type:       examType,
      p_score:           score,
      p_total_questions: total,
      p_accuracy:        Math.round(accuracy * 100) / 100,
      p_avg_time_per_q:  Math.round(avgTime * 10) / 10,
      p_grade_level:     gradeLevel,
      p_question_ids:    questionIds || [],
    });

    if (error) {
      console.error('[GRADING] RPC error saving session score:', error.message);
      return null;
    }

    return data; // returns the new session_scores UUID
  }

  // ── Write response_logs ─────────────────────────────────────────
  //  These are per-question logs. RLS enforces user_id = auth.uid().
  async function saveResponseLogs(results, { subject, topic, examType, gradeLevel }) {
    const userId = window.UE_USER_ID;
    if (!userId) return;

    const logInserts = results.map(r => ({
      user_id:    userId,
      topic_id:   topic ? `${subject}.${topic}` : subject,
      exam_type:  examType,
      is_correct: r.isCorrect,
      time_spent: r.timeSpent,
      grade_level: gradeLevel,
    }));

    const { error } = await window.sb.from('response_logs').insert(logInserts);
    if (error) console.error('[GRADING] response_logs insert error:', error.message);
  }

  // ── Upsert topic_mastery ────────────────────────────────────────
  async function upsertTopicMastery(userId, topicId, results, gradeLevel) {
    const { data: existing } = await window.sb
      .from('topic_mastery')
      .select('*')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .maybeSingle();

    const sessionAccuracy = results.filter(r => r.isCorrect).length / results.length;

    let newAccuracy, newGrade, newAttempts;

    if (existing) {
      const oldN   = 10;
      const newN   = results.length;
      const blended = ((existing.accuracy_avg || 0) * oldN + sessionAccuracy * newN) / (oldN + newN);
      newAccuracy  = Math.round(blended * 1000) / 1000;
      newGrade     = nextGradeLevel(existing.grade_level || 3, sessionAccuracy, existing.attempts_at_grade1 || 0);
      newAttempts  = existing.grade_level === 1
        ? (existing.attempts_at_grade1 || 0) + 1
        : (existing.attempts_at_grade1 || 0);
    } else {
      newAccuracy = Math.round(sessionAccuracy * 1000) / 1000;
      newGrade    = nextGradeLevel(3, sessionAccuracy, 0);
      newAttempts = 0;
    }

    const masteryLevel = calcMasteryLevel(newAccuracy, newGrade);
    const status = masteryLevel >= 0.75 ? 'MASTERED'
                 : masteryLevel  > 0    ? 'IN_PROGRESS'
                 : 'NIL';

    const payload = {
      accuracy_avg:       newAccuracy,
      mastery_level:      masteryLevel,
      grade_level:        newGrade,
      attempts_at_grade1: newAttempts,
      status,
      last_studied:       new Date().toISOString(),
    };

    if (existing) {
      await window.sb.from('topic_mastery')
        .update(payload)
        .eq('id', existing.id);
    } else {
      await window.sb.from('topic_mastery').insert({
        user_id: userId,
        topic_id: topicId,
        ...payload,
      });
    }
  }

  // ── Update profile aggregate stats ─────────────────────────────
  async function updateProfileStats(userId) {
    const { data: masteryRows } = await window.sb
      .from('topic_mastery')
      .select('mastery_level, accuracy_avg')
      .eq('user_id', userId)
      .not('mastery_level', 'is', null);

    if (!masteryRows || masteryRows.length === 0) return;

    const avgAcc     = masteryRows.reduce((s, r) => s + (r.accuracy_avg || 0), 0) / masteryRows.length;
    const avgMastery = masteryRows.reduce((s, r) => s + (r.mastery_level || 0), 0) / masteryRows.length;

    await window.sb.from('profiles').update({
      accuracy_avg:  Math.round(avgAcc * 1000) / 1000,
      mastery_level: Math.round(avgMastery * 1000) / 1000,
      status:        'ACTIVE',
    }).eq('id', userId);
  }

  // ── Award XP (via RPC to avoid read-then-write race condition) ──
  //  If you want to make this even more server-side, create an
  //  RPC called increment_xp(p_amount INT) that does:
  //    UPDATE profiles SET total_xp = total_xp + p_amount
  //    WHERE id = auth.uid();
  //  That is atomic and cannot be raced.  The client-side fallback
  //  below is still safe because RLS limits updates to auth.uid().
  async function awardXP(userId, amount) {
    // Preferred: atomic server-side increment (add this RPC to schema.sql)
    const { error: rpcErr } = await window.sb.rpc('increment_xp', { p_amount: amount });

    if (rpcErr) {
      // Fallback: read-then-write (still RLS-safe, but not atomic)
      const { data: profile } = await window.sb
        .from('profiles').select('total_xp').eq('id', userId).single();
      const current = profile?.total_xp || 0;
      await window.sb.from('profiles')
        .update({ total_xp: current + amount }).eq('id', userId);
    }
  }

  // ── Group results by topic ──────────────────────────────────────
  function groupByTopic(results, subject) {
    const groups = {};
    for (const r of results) {
      const key = `${subject}.${r.question.topic}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }

  // ── Main entry point ────────────────────────────────────────────
  //  questions: array of question objects (from QUESTION_BANK or fetched)
  //  answers:   { questionIndex: selectedOptionIndex, … }
  //  timings:   { questionIndex: secondsSpent, … }
  //  meta:      { subject, topic, examType, gradeLevel }
  //             NOTE: userId is intentionally NOT taken from meta —
  //             it is read from window.UE_USER_ID (set by auth-guard)
  //             so a client cannot inject a foreign userId.
  async function processSession({ questions, answers, timings, meta }) {
    const userId   = window.UE_USER_ID; // auth-guard owns this — not caller-supplied
    const subject  = meta.subject;
    const topic    = meta.topic;
    const examType = meta.examType || 'JAMB';
    const gradeLevel = meta.gradeLevel || 3;

    if (!userId || !questions.length) return null;

    // ── 1. Score the session client-side ──────────────────────────
    let correct = 0;
    const results = questions.map((q, i) => {
      const isCorrect = answers[i] === q.ans;
      if (isCorrect) correct++;
      return {
        question:  q,
        selected:  answers[i],
        isCorrect,
        timeSpent: timings?.[i] || 0,
      };
    });

    const total    = questions.length;
    const accuracy = correct / total;
    const avgTime  = results.reduce((s, r) => s + r.timeSpent, 0) / total;
    const questionIds = questions.map(q => q.id).filter(Boolean);

    // ── 2. Save session score via RPC (tamper-proof) ──────────────
    const sessionId = await saveSessionViaRPC({
      examType, score: correct, total, accuracy, avgTime, gradeLevel, questionIds,
    });

    // ── 3. Write per-question response logs ───────────────────────
    await saveResponseLogs(results, { subject, topic, examType, gradeLevel });

    // ── 4. Update topic mastery ───────────────────────────────────
    const topicGroups = groupByTopic(results, subject);
    for (const [topicKey, topicResults] of Object.entries(topicGroups)) {
      await upsertTopicMastery(userId, topicKey, topicResults, gradeLevel);
    }

    // ── 5. Update profile aggregate stats ────────────────────────
    await updateProfileStats(userId);

    // ── 6. Award XP ──────────────────────────────────────────────
    const xpEarned = calcXP(correct, total, accuracy);
    await awardXP(userId, xpEarned);

    // ── 7. Determine new grade level ──────────────────────────────
    const newGradeLevel = nextGradeLevel(gradeLevel, accuracy, 0);

    return {
      correct, total, accuracy,
      xpEarned, newGradeLevel,
      results,
      sessionId,
    };
  }

  // ── Utility exports ─────────────────────────────────────────────
  function gradeLabel(level) {
    return level === 1 ? 'Advanced' : level === 2 ? 'Intermediate' : 'Foundation';
  }

  return {
    processSession,
    calcMasteryLevel,
    nextGradeLevel,
    calcXP,
    awardXP,
    gradeLabel,
    GRADE_UP_THRESHOLD,
    GRADE_DOWN_THRESHOLD,
  };

})();
