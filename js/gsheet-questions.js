/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-questions.js  (v2 — per-subject sheets)

   Supports two config modes (set in js/config.js):

   OPTION A — single sheet (all subjects in one tab):
     UE_CONFIG.GOOGLE_SHEET_QUESTIONS_CSV_URL = '<csv-url>'

   OPTION B — per-subject sheets (one tab per subject):
     UE_CONFIG.GOOGLE_SHEET_SUBJECT_URLS = {
       'mathematics': '<csv-url>',
       'english':     '<csv-url>',
       ...
     }
   Option B is preferred: the app only fetches the sheet(s) it needs,
   making single-subject CBT sessions much faster.

   Question shape (same as questions.js):
     { id, subject, topic, examType, year, text,
       opts:[a,b,c,d], ans, explanation, image }

   Cache: each sheet URL is cached independently for
   UE_CONFIG.GS_QUESTIONS_CACHE_MIN minutes (default 30).
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_QUESTIONS = (function () {
  'use strict';

  const cfg         = window.UE_CONFIG || {};
  const SINGLE_URL  = cfg.GOOGLE_SHEET_QUESTIONS_CSV_URL || '';
  // Matches the key name used in config.js: SUBJECT_SHEET_URLS
  const SUBJECT_MAP = cfg.SUBJECT_SHEET_URLS || cfg.GOOGLE_SHEET_SUBJECT_URLS || {};
  const CACHE_MS    = (cfg.GS_QUESTIONS_CACHE_MIN || 30) * 60 * 1000;

  // Per-URL cache: { [url]: { rows:[], at: number } }
  const _cache     = {};
  // Per-URL in-flight promises
  const _inflight  = {};

  function isEnabled() {
    return !!SINGLE_URL || Object.keys(SUBJECT_MAP).length > 0;
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

  // Map header names → canonical keys
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
    if (/^[0-3]$/.test(v))    return parseInt(v, 10);
    if (/^[A-Da-d]$/.test(v)) return v.toUpperCase().charCodeAt(0) - 65;
    const i = opts.findIndex(o => o && o.toLowerCase() === v.toLowerCase());
    return i >= 0 ? i : -1;
  }

  function normaliseImage(raw) {
    const v = norm(raw);
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
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

  // ── Fetch and parse a single CSV URL (with per-URL cache) ────────
  async function _fetchUrl(url, force) {
    const now = Date.now();
    if (!force && _cache[url] && (now - _cache[url].at) < CACHE_MS) {
      return _cache[url].rows;
    }
    if (_inflight[url]) return _inflight[url];

    _inflight[url] = (async () => {
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
        _cache[url] = { rows: out, at: now };
        return out;
      } catch (e) {
        console.warn('[GSHEET_QUESTIONS] fetch failed (' + url + '):', e.message);
        return _cache[url] ? _cache[url].rows : [];
      } finally {
        delete _inflight[url];
      }
    })();

    return _inflight[url];
  }

  // ── Fetch all questions (all subjects) ───────────────────────────
  async function fetchAll(force) {
    if (!isEnabled()) return [];

    // Option A: single URL
    if (SINGLE_URL) return _fetchUrl(SINGLE_URL, force);

    // Option B: fetch all subject sheets in parallel
    const urls   = Object.values(SUBJECT_MAP);
    const arrays = await Promise.all(urls.map(u => _fetchUrl(u, force)));
    return [].concat(...arrays);
  }

  // ── Fetch questions for one subject only ─────────────────────────
  async function _fetchForSubject(subjectKey, force) {
    // Option B: direct per-subject URL
    const url = SUBJECT_MAP[subjectKey];
    if (url) return _fetchUrl(url, force);

    // Option A fallback: load everything and filter
    const all = await _fetchUrl(SINGLE_URL, force);
    return all.filter(q => q.subject === subjectKey);
  }

  // ── Public: filter + sample (same signature as v1) ───────────────
  async function getQuestions({ subject, topic, examType, count = 10 } = {}) {
    if (!isEnabled()) return [];

    let bank;
    const subjectKey = subject ? String(subject).toLowerCase() : null;

    if (subjectKey) {
      bank = await _fetchForSubject(subjectKey, false);
    } else {
      bank = await fetchAll(false);
    }

    if (topic)    bank = bank.filter(q => q.topic    === topic);
    if (examType) bank = bank.filter(q => q.examType === String(examType).toUpperCase());

    bank = bank.sort(() => Math.random() - 0.5).slice(0, Math.min(count, bank.length));
    return bank;
  }

  function clearCache() {
    Object.keys(_cache).forEach(k => delete _cache[k]);
  }

  return { isEnabled, fetchAll, getQuestions, clearCache };
})();
