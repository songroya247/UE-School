/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-questions.js
   Fetches the published Google Sheets CSV from
   UE_CONFIG.GOOGLE_SHEET_QUESTIONS_CSV_URL and converts each row
   into the same question shape the rest of the app already uses:
     { id, subject, topic, examType, year, text,
       opts:[a,b,c,d], ans, explanation, image }

   It also handles questions WITH IMAGES — Google Sheets cannot
   display images inline in CSV, but it can hold an image URL in a
   plain text column. The CBT player renders that image above the
   question text. For Drive-hosted images, paste either the share
   URL or the FILE_ID; gdrive-video.js normalises it.

   Cache: parsed rows are kept in memory for
   UE_CONFIG.GS_QUESTIONS_CACHE_MIN minutes (default 30) so a
   200-question CBT session is one network round-trip, not 200.
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_QUESTIONS = (function () {
  'use strict';

  const cfg = window.UE_CONFIG || {};
  const SHEET_URL   = cfg.GOOGLE_SHEET_QUESTIONS_CSV_URL || '';
  const SUBJ_URLS   = cfg.SUBJECT_SHEET_URLS || {};
  const CACHE_MS    = (cfg.GS_QUESTIONS_CACHE_MIN || 30) * 60 * 1000;

  let _cache    = null; // { rows:[], at: number }  (legacy single-sheet cache)
  let _inflight = null;

  // Per-subject cache: subjectKey -> { rows:[], at: number }
  const _subjCache    = {};
  const _subjInflight = {};

  function urlForSubject(subject) {
    const key = (subject || '').toString().trim().toLowerCase();
    return SUBJ_URLS[key] || '';
  }

  // isEnabled(subject?) — with a subject, checks that subject's own sheet
  // (or the legacy single sheet as a fallback); without one, reports
  // whether the Sheets path is configured at all.
  function isEnabled(subject) {
    if (subject) return !!(urlForSubject(subject) || SHEET_URL);
    return !!(SHEET_URL || Object.keys(SUBJ_URLS).length);
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
    id:          ['id', 'question_id', 'qid'],
    subject:     ['subject'],
    topic:       ['topic'],
    examType:    ['exam_type', 'examtype', 'exam'],
    year:        ['year'],
    text:        ['text', 'question', 'prompt'],
    opt_a:       ['opt_a', 'option_a', 'a'],
    opt_b:       ['opt_b', 'option_b', 'b'],
    opt_c:       ['opt_c', 'option_c', 'c'],
    opt_d:       ['opt_d', 'option_d', 'd'],
    ans:         ['ans', 'answer', 'correct'],
    explanation: ['explanation', 'reason', 'why'],
    image:       ['image_url', 'image', 'img', 'picture'],
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

  function normaliseImage(raw) {
    const v = norm(raw);
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    // Looks like a Drive file ID
    if (window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.imageUrl(v);
    return v;
  }

  function rowToQuestion(row, idx, lineNo) {
    const opts = [
      norm(row[idx.opt_a]), norm(row[idx.opt_b]),
      norm(row[idx.opt_c]), norm(row[idx.opt_d]),
    ].filter(Boolean);
    const ans = answerToIndex(row[idx.ans], opts);
    if (!norm(row[idx.text]) || opts.length < 2 || ans < 0) return null;

    return {
      id:          norm(row[idx.id]) || ('gs' + String(lineNo).padStart(4, '0')),
      subject:     norm(row[idx.subject]).toLowerCase() || 'general',
      topic:       norm(row[idx.topic]) || 'General',
      examType:    norm(row[idx.examType]).toUpperCase() || 'JAMB',
      year:        parseInt(norm(row[idx.year]), 10) || null,
      text:        norm(row[idx.text]),
      opts,
      ans,
      explanation: norm(row[idx.explanation]),
      image:       idx.image >= 0 ? normaliseImage(row[idx.image]) : '',
      _source:     'gsheet',
    };
  }

  // Shared fetch+parse: pulls one published CSV URL into question rows.
  async function _fetchCsv(url, fallbackSubject) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const idx = buildIndex(rows[0]);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const q = rowToQuestion(rows[i], idx, i);
      if (!q) continue;
      // A per-subject sheet may omit the `subject` column entirely —
      // fall back to the subject key the sheet is mapped under.
      if (q.subject === 'general' && fallbackSubject) q.subject = fallbackSubject;
      out.push(q);
    }
    return out;
  }

  async function fetchAll(force = false) {
    if (!SHEET_URL) return [];
    const now = Date.now();
    if (!force && _cache && (now - _cache.at) < CACHE_MS) return _cache.rows;
    if (_inflight) return _inflight;

    _inflight = (async () => {
      try {
        const out = await _fetchCsv(SHEET_URL);
        _cache = { rows: out, at: now };
        return out;
      } catch (e) {
        console.warn('[GSHEET_QUESTIONS] fetch failed:', e.message);
        return _cache ? _cache.rows : [];
      } finally {
        _inflight = null;
      }
    })();

    return _inflight;
  }

  // Fetch (with per-subject caching) the sheet mapped to one subject key.
  async function fetchSubject(subject, force = false) {
    const key = (subject || '').toString().trim().toLowerCase();
    const url = urlForSubject(key);
    if (!url) return [];

    const now = Date.now();
    const cached = _subjCache[key];
    if (!force && cached && (now - cached.at) < CACHE_MS) return cached.rows;
    if (_subjInflight[key]) return _subjInflight[key];

    _subjInflight[key] = (async () => {
      try {
        const out = await _fetchCsv(url, key);
        _subjCache[key] = { rows: out, at: now };
        return out;
      } catch (e) {
        console.warn('[GSHEET_QUESTIONS] fetch failed for "' + key + '":', e.message);
        return cached ? cached.rows : [];
      } finally {
        delete _subjInflight[key];
      }
    })();

    return _subjInflight[key];
  }

  // Public: filter + sample using the same shape as questions.js
  async function getQuestions({ subject, topic, examType, count = 10 } = {}) {
    // Prefer the subject's own published sheet; fall back to the
    // legacy single combined sheet if no per-subject mapping exists.
    let bank = subject && urlForSubject(subject)
      ? await fetchSubject(subject)
      : await fetchAll();

    if (subject)  bank = bank.filter(q => q.subject  === String(subject).toLowerCase());
    if (topic)    bank = bank.filter(q => q.topic    === topic);
    if (examType) bank = bank.filter(q => q.examType === String(examType).toUpperCase());
    bank = bank.sort(() => Math.random() - 0.5).slice(0, Math.min(count, bank.length));
    return bank;
  }

  function clearCache() {
    _cache = null;
    for (const k of Object.keys(_subjCache)) delete _subjCache[k];
  }

  return { isEnabled, fetchAll, fetchSubject, getQuestions, clearCache };
})();
