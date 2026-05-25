/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-questions.js  (v2 — grade_level + diagram)

   Fetches the published Google Sheets CSV from
   UE_CONFIG.GOOGLE_SHEET_QUESTIONS_CSV_URL / QUESTION_SUBJECT_URLS
   and converts each row into the question shape the app uses:
     { id, subject, topic, examType, year, grade_level, text,
       opts:[a,b,c,d], ans, explanation, image, diagram_type }

   DEPENDENCIES: none. This file is fully self-contained.
   It does NOT depend on gdrive-video.js, supabase.js, or any other
   UE School module. Drive File IDs are converted to display URLs
   inline — see normaliseImage() below.

   GRADE LEVEL FILTERING:
   ──────────────────────
   Each row carries a `grade_level` column (1=Advanced,
   2=Intermediate, 3=Foundation). getQuestions() filters so harder
   questions are only served to students who have earned them via
   the grading algorithm. Missing/blank defaults to 3 (Foundation).

   DIAGRAM SUPPORT:
   ────────────────
   Questions with diagrams store a Google Drive File ID (or full
   public URL) in the `image_url` column. The CBT player renders
   it above the question text. `diagram_type` is optional:
   geometry | graph | table | photo.

   CACHING:
   ────────
   Parsed rows are kept in memory per URL for
   UE_CONFIG.GS_QUESTIONS_CACHE_MIN minutes (default 30).
   Per-subject sheets are cached independently so fetching maths
   does not evict physics from cache.
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_QUESTIONS = (function () {
  'use strict';

  const cfg            = window.UE_CONFIG || {};
  const FALLBACK_URL   = cfg.GOOGLE_SHEET_QUESTIONS_CSV_URL || '';
  const SUBJECT_URLS   = cfg.QUESTION_SUBJECT_URLS || {};
  const CACHE_MS       = (cfg.GS_QUESTIONS_CACHE_MIN || 30) * 60 * 1000;
  const CACHE_VERSION  = 'v4'; // bump this whenever normaliseImage logic changes

  // Per-URL cache keyed by version so stale entries are auto-discarded
  const _caches   = {};
  const _inflight = {};

  function isEnabled() {
    return !!FALLBACK_URL || Object.keys(SUBJECT_URLS).length > 0;
  }

  // Resolve the best URL for a given subject (may be null)
  function _urlFor(subject) {
    if (subject && SUBJECT_URLS[String(subject).toLowerCase()]) {
      return SUBJECT_URLS[String(subject).toLowerCase()];
    }
    return FALLBACK_URL || null;
  }

  // ── Minimal RFC-4180-ish CSV parser (handles quotes + escapes) ──
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') { cell += '"'; i++; }
        else if (c === '"')         { inQ = false; }
        else                        { cell += c; }
      } else {
        if (c === '"')              { inQ = true; }
        else if (c === ',')         { row.push(cell); cell = ''; }
        else if (c === '\r')        { /* skip */ }
        else if (c === '\n')        { row.push(cell); rows.push(row); row = []; cell = ''; }
        else                        { cell += c; }
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.length && r.some(v => v && v.trim().length));
  }

  function norm(s) { return (s || '').toString().trim(); }

  // Map header names → canonical keys we care about
  const HEADER_MAP = {
    id:           ['id', 'question_id', 'qid'],
    subject:      ['subject'],
    topic:        ['topic'],
    examType:     ['exam_type', 'examtype', 'exam'],
    year:         ['year'],
    grade_level:  ['grade_level', 'grade', 'difficulty', 'level'],
    text:         ['text', 'question', 'prompt'],
    opt_a:        ['opt_a', 'option_a', 'a'],
    opt_b:        ['opt_b', 'option_b', 'b'],
    opt_c:        ['opt_c', 'option_c', 'c'],
    opt_d:        ['opt_d', 'option_d', 'd'],
    ans:          ['ans', 'answer', 'correct'],
    explanation:  ['explanation', 'reason', 'why'],
    image:        ['image_url', 'image', 'img', 'picture'],
    diagram_type: ['diagram_type', 'diagram', 'image_type'],
  };

  function buildIndex(headerRow) {
    const idx = {};
    const lc  = headerRow.map(h => norm(h).toLowerCase());
    for (const key of Object.keys(HEADER_MAP)) {
      const aliases = HEADER_MAP[key];
      const found = lc.findIndex(h => aliases.includes(h));
      idx[key] = found;
    }
    return idx;
  }

  function answerToIndex(raw, opts) {
    const v = norm(raw);
    if (!v) return -1;
    if (/^[0-3]$/.test(v))   return parseInt(v, 10);          // already an index
    if (/^[A-Da-d]$/.test(v)) return v.toUpperCase().charCodeAt(0) - 65; // A..D
    // Match by option text
    const i = opts.findIndex(o => o && o.toLowerCase() === v.toLowerCase());
    return i >= 0 ? i : -1;
  }

  function driveImgUrl(fileId) {
    // thumbnail endpoint works publicly without Google login
    // sz=w800 gives up to 800px wide — sufficient for exam diagrams
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }

  function normaliseImage(raw) {
    const v = norm(raw);
    if (!v) return '';

    // Reject Drive folder URLs — they are never images
    if (/\/drive\/folders\//i.test(v)) {
      console.warn('[GSHEET_QUESTIONS] image_url is a Drive folder URL, not a file:', v);
      return '';
    }

    // Extract File ID from any Drive file URL format
    const fileMatch = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (fileMatch) return driveImgUrl(fileMatch[1]);

    // Drive open?id= or uc?id= or thumbnail?id= formats
    const idMatch = v.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (idMatch) return driveImgUrl(idMatch[1]);

    // Direct image URL (Imgur, Cloudinary, S3, etc.)
    if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(v)) return v;

    // Bare Drive File ID — 25–44 alphanumeric/dash/underscore chars
    if (/^[a-zA-Z0-9_-]{25,44}$/.test(v)) return driveImgUrl(v);

    // Anything else — unrecognised, skip
    console.warn('[GSHEET_QUESTIONS] Unrecognised or invalid image_url (ignored):', v);
    return '';
  }

  function rowToQuestion(row, idx, lineNo) {
    const opts = [
      norm(row[idx.opt_a]), norm(row[idx.opt_b]),
      norm(row[idx.opt_c]), norm(row[idx.opt_d]),
    ].filter(Boolean);
    const ans = answerToIndex(row[idx.ans], opts);
    if (!norm(row[idx.text]) || opts.length < 2 || ans < 0) return null;

    // grade_level: 1=Advanced, 2=Intermediate, 3=Foundation (default)
    const rawGrade = parseInt(norm(row[idx.grade_level]), 10);
    const grade_level = (rawGrade >= 1 && rawGrade <= 3) ? rawGrade : 3;

    return {
      id:           norm(row[idx.id]) || ('gs' + String(lineNo).padStart(4, '0')),
      subject:      norm(row[idx.subject]).toLowerCase() || 'general',
      topic:        norm(row[idx.topic]) || 'General',
      examType:     norm(row[idx.examType]).toUpperCase() || 'JAMB',
      year:         parseInt(norm(row[idx.year]), 10) || null,
      grade_level,
      text:         norm(row[idx.text]),
      opts,
      ans,
      explanation:  norm(row[idx.explanation]),
      image:        normaliseImage(idx.image >= 0 ? row[idx.image] : ''),
      diagram_type: idx.diagram_type >= 0 ? norm(row[idx.diagram_type]).toLowerCase() : '',
      _source:      'gsheet',
    };
  }

  async function _fetchUrl(url, force = false) {
    if (!url) return [];
    const cacheKey = `${CACHE_VERSION}:${url}`;
    const now = Date.now();
    if (!force && _caches[cacheKey] && (now - _caches[cacheKey].at) < CACHE_MS) return _caches[cacheKey].rows;
    if (_inflight[cacheKey]) return _inflight[cacheKey];

    _inflight[cacheKey] = (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const rows = parseCSV(text);
        if (rows.length < 2) return [];
        const idx = buildIndex(rows[0]);
        const out = [];
        for (let i = 1; i < rows.length; i++) {
          const q = rowToQuestion(rows[i], idx, i);
          if (q) out.push(q);
        }
        _caches[cacheKey] = { rows: out, at: now };
        console.log(`[GSHEET_QUESTIONS] Loaded ${out.length} questions from sheet.`);
        return out;
      } catch (e) {
        console.warn('[GSHEET_QUESTIONS] fetch failed:', url, e.message);
        return _caches[cacheKey] ? _caches[cacheKey].rows : [];
      } finally {
        delete _inflight[cacheKey];
      }
    })();

    return _inflight[cacheKey];
  }

  // fetchAll: loads the correct sheet for a subject, or the fallback sheet
  async function fetchAll(subject, force = false) {
    const url = _urlFor(subject);
    if (!url) return [];
    return _fetchUrl(url, force);
  }

  // Public: filter + sample using the same shape as questions.js
  async function getQuestions({ subject, topic, examType, gradeLevel, university, count = 10 } = {}) {
    // Fetch from the subject-specific sheet if available, else fallback sheet
    let bank = await fetchAll(subject);

    if (subject)              bank = bank.filter(q => q.subject  === String(subject).toLowerCase());
    if (topic)                bank = bank.filter(q => q.topic    === topic);
    if (examType && examType !== '') bank = bank.filter(q => q.examType === String(examType).toUpperCase());
    if (university) {
      const u = String(university).toLowerCase();
      bank = bank.filter(q => !q.university || String(q.university).toLowerCase() === u);
    }

    // Grade level filter:
    // Students start at grade 3 (Foundation) and progress toward grade 1 (Advanced)
    // as mastery improves. Serve questions AT or BELOW the student's current level.
    // grade 3 student → sees grades 1, 2, 3 (all questions)
    // grade 2 student → sees grades 1, 2
    // grade 1 student → sees grade 1 only (hardest)
    // Rule: q.grade_level <= gradeLevel
    if (gradeLevel) {
      bank = bank.filter(q => (q.grade_level || 3) <= gradeLevel);
    }

    // Shuffle and cap
    bank = bank.sort(() => Math.random() - 0.5).slice(0, Math.min(count, bank.length));
    return bank;
  }

  // Public: list unique topics for a subject (mirrors questions.js API)
  async function getTopics(subject) {
    const bank = await fetchAll(subject);
    const filtered = subject ? bank.filter(q => q.subject === String(subject).toLowerCase()) : bank;
    return [...new Set(filtered.map(q => q.topic))].filter(Boolean).sort();
  }

  // Public: count available questions for a subject+topic combo
  async function countFor(subject, topic) {
    let bank = await fetchAll(subject);
    if (subject) bank = bank.filter(q => q.subject === String(subject).toLowerCase());
    if (topic)   bank = bank.filter(q => q.topic   === topic);
    return bank.length;
  }

  // Clear one subject's cache, or all caches if no subject given
  function clearCache(subject) {
    if (subject) {
      const url = _urlFor(subject);
      if (url) delete _caches[`${CACHE_VERSION}:${url}`];
    } else {
      Object.keys(_caches).forEach(k => delete _caches[k]);
    }
  }

  return { isEnabled, fetchAll, getQuestions, getTopics, countFor, clearCache };
})();
