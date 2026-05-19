/* ═══════════════════════════════════════════════════════════════════
   UE School — js/questions.js  (v3 — GSheet-primary)

   ALL questions now come exclusively from Google Sheets via
   gsheet-questions.js. The local bank and Supabase RPC path have
   been removed. This means:

     • Adding a new subject = create a new Sheet, paste its CSV URL
       into config.js → QUESTION_SUBJECT_URLS. Zero code changes.
     • Adding questions    = add rows to the Sheet. Live within 30 min
       (GS_QUESTIONS_CACHE_MIN). No redeploy needed.
     • Subjects + topics   = derived dynamically from the Sheet data,
       so the CBT dropdown always reflects exactly what's in the Sheet.

   SHAPE OF A QUESTION OBJECT (from gsheet-questions.js):
   ────────────────────────────────────────────────────────
   {
     id:           string   e.g. 'waec_2019_m016'
     subject:      string   lowercase  e.g. 'mathematics'
     topic:        string   e.g. 'Significant Figures'
     examType:     string   uppercase  e.g. 'WAEC'
     year:         number | null
     grade_level:  1 | 2 | 3   (1=Advanced, 2=Intermediate, 3=Foundation)
     text:         string   full question text
     opts:         string[] exactly 4 options
     ans:          0-3      index of the correct option
     explanation:  string   shown after the student submits
     image:        string   public URL or '' for text-only questions
     diagram_type: string   'geometry' | 'graph' | 'table' | 'photo' | ''
     _source:      'gsheet'
   }

   PUBLIC API (mirrors the old questions.js so no other file changes):
   QUESTION_BANK.getQuestions({ subject, topic, examType, university,
                                 gradeLevel, count })  -> Promise<Question[]>
   QUESTION_BANK.getMockExam(subjects, examType, total) -> Promise<Question[]>
   QUESTION_BANK.getSubjects()                          -> Promise<string[]>
   QUESTION_BANK.getTopics(subject)                     -> Promise<string[]>
   QUESTION_BANK.countFor(subject, topic)               -> Promise<number>
═══════════════════════════════════════════════════════════════════ */

const QUESTION_BANK = (function () {
  'use strict';

  // ── Guard ───────────────────────────────────────────────────────
  function _gs() {
    if (window.GSHEET_QUESTIONS && window.GSHEET_QUESTIONS.isEnabled()) {
      return window.GSHEET_QUESTIONS;
    }
    console.warn(
      '[QUESTION_BANK] GSHEET_QUESTIONS not enabled. ' +
      'Set GOOGLE_SHEET_QUESTIONS_CSV_URL or QUESTION_SUBJECT_URLS in config.js.'
    );
    return null;
  }

  // ── getQuestions ────────────────────────────────────────────────
  async function getQuestions(opts = {}) {
    const gs = _gs();
    if (!gs) return [];
    try {
      return await gs.getQuestions(opts);
    } catch (e) {
      console.error('[QUESTION_BANK] getQuestions failed:', e.message);
      return [];
    }
  }

  // ── getMockExam ─────────────────────────────────────────────────
  // Multi-subject mock exam — splits totalQuestions evenly across
  // subjects then tops up any shortfall.
  async function getMockExam(subjects = [], examType = 'JAMB', totalQuestions = 40) {
    const gs = _gs();
    if (!gs || !subjects.length) return [];

    const perSubject = Math.floor(totalQuestions / subjects.length);
    let questions = [];

    for (const subj of subjects) {
      try {
        const qs = await gs.getQuestions({ subject: subj, examType, count: perSubject });
        questions = questions.concat(qs);
      } catch (e) {
        console.warn('[QUESTION_BANK] getMockExam: skipping', subj, e.message);
      }
    }

    // Top up if short
    if (questions.length < totalQuestions) {
      const needed = totalQuestions - questions.length;
      const ids    = new Set(questions.map(q => q.id));
      for (const subj of subjects) {
        if (questions.length >= totalQuestions) break;
        try {
          const extra = await gs.getQuestions({ subject: subj, examType, count: needed });
          for (const q of extra) {
            if (!ids.has(q.id)) { questions.push(q); ids.add(q.id); }
            if (questions.length >= totalQuestions) break;
          }
        } catch (_) {}
      }
    }

    return questions.sort(() => Math.random() - 0.5).slice(0, totalQuestions);
  }

  // ── getSubjects ─────────────────────────────────────────────────
  // Derives subject list from config keys + live Sheet data.
  // Adding a new subject URL to config.js automatically surfaces it
  // in the CBT dropdown with zero code changes.
  async function getSubjects() {
    const gs = _gs();
    if (!gs) return [];
    try {
      const cfg         = window.UE_CONFIG || {};
      const subjectKeys = Object.keys(cfg.QUESTION_SUBJECT_URLS || {});
      const subjectSet  = new Set(subjectKeys); // seed from config keys

      if (subjectKeys.length) {
        // Each subject has its own sheet — fetch all in parallel
        const results = await Promise.allSettled(subjectKeys.map(s => gs.fetchAll(s)));
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            r.value.forEach(q => q.subject && subjectSet.add(q.subject));
          }
        });
      } else {
        // Single fallback sheet covers all subjects
        const all = await gs.fetchAll(null);
        all.forEach(q => q.subject && subjectSet.add(q.subject));
      }

      return [...subjectSet].filter(Boolean).sort();
    } catch (e) {
      console.error('[QUESTION_BANK] getSubjects failed:', e.message);
      return [];
    }
  }

  // ── getTopics ───────────────────────────────────────────────────
  async function getTopics(subject) {
    const gs = _gs();
    if (!gs) return [];
    try {
      return await gs.getTopics(subject);
    } catch (e) {
      console.error('[QUESTION_BANK] getTopics failed:', e.message);
      return [];
    }
  }

  // ── countFor ────────────────────────────────────────────────────
  async function countFor(subject, topic) {
    const gs = _gs();
    if (!gs) return 0;
    try {
      return await gs.countFor(subject, topic);
    } catch (e) {
      return 0;
    }
  }

  return { getQuestions, getMockExam, getSubjects, getTopics, countFor };

})();
