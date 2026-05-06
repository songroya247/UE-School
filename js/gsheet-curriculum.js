/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-curriculum.js  (v2 — multi-subject)
   Loads the syllabus from one or more published Google Sheet CSVs
   and merges them into TOPIC_BLUEPRINT so the rest of the app works
   unchanged.

   HOW TO USE (school operator — no coding needed):
   ─────────────────────────────────────────────────
   1. Open config.js and find SUBJECT_SHEET_URLS.
   2. For each subject, paste its published CSV URL:
        mathematics: 'https://docs.google.com/...csv',
        english:     'https://docs.google.com/...csv',
   3. Save config.js — done. Every page load pulls fresh data.

   SHEET COLUMN GUIDE
   ──────────────────
   Required columns (headers must be on row 1):

   topic_id        | Unique key  e.g.  mathematics.quadratics
   subject         | mathematics  /  english  /  biology  etc.
   title           | Quadratic Equations
   duration        | 14 mins
   blurb           | One-sentence description shown on the card
   objectives      | Pipe-separated: "Solve by factorising | Use formula"
   formulas        | Pipe-separated: "ax²+bx+c=0 | x=(-b±√...)÷2a"

   Video columns (paste full Google Drive share URL or /preview URL):

   video_foundation | Slow walkthrough for struggling students
   video_standard   | Main lesson — the default tier
   video_mastery    | Exam-focused rapid revision

   Tagline columns (optional):
   tagline_foundation | e.g.  Slow walkthrough · 6 worked examples
   tagline_standard   | e.g.  Default lesson · all methods explained
   tagline_mastery    | e.g.  Exam-focused · past-paper patterns

   Duration columns (optional):
   duration_foundation | e.g.  22 mins
   duration_standard   | e.g.  14 mins
   duration_mastery    | e.g.   9 mins

   FALLBACK LOGIC (automatic — nothing to configure)
   ──────────────────────────────────────────────────
   The player always tries tiers in this order:
     1. standard   (the normal lesson)
     2. foundation (slower walkthrough)
     3. mastery    (exam-focused)
   If a tier's URL is blank the next available tier is used instead.

   CACHE
   ─────
   Parsed rows are cached in memory for GS_CURRICULUM_CACHE_MIN minutes
   (default 30). A hard refresh (Ctrl+Shift+R / ⌘+Shift+R) clears it.
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_CURRICULUM = (function () {
  'use strict';

  const cfg = window.UE_CONFIG || {};

  // ── Multi-subject sheet support ───────────────────────────────────
  // SUBJECT_SHEET_URLS maps { subjectKey: csvUrl }.
  // Falls back to legacy single GOOGLE_SHEET_CURRICULUM_CSV_URL.
  const SUBJECT_URLS = cfg.SUBJECT_SHEET_URLS || {};
  const LEGACY_URL   = cfg.GOOGLE_SHEET_CURRICULUM_CSV_URL || '';
  const CACHE_MS     = (cfg.GS_CURRICULUM_CACHE_MIN || 30) * 60 * 1000;

  // Build the list of { subject, url } pairs to fetch
  function getSheetEntries() {
    const entries = Object.entries(SUBJECT_URLS)
      .filter(([, url]) => url && url.trim())
      .map(([subject, url]) => ({ subject, url: url.trim() }));
    // Fall back to legacy single URL (subject inferred from sheet rows)
    if (entries.length === 0 && LEGACY_URL) {
      entries.push({ subject: null, url: LEGACY_URL });
    }
    return entries;
  }

  let _cache    = null; // { blueprint: {}, at: number }
  let _inflight = null;
  let _loaded   = false;

  // ── Minimal RFC-4180 CSV parser (handles quoted fields + commas) ──
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
    return rows.filter(r => r.some(v => v && v.trim()));
  }

  function norm(s) { return (s || '').toString().trim(); }

  // Accept either a full Drive share URL or a bare file ID
  function normaliseVideoUrl(raw) {
    const v = norm(raw);
    if (!v) return '';
    if (window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.embedUrl(v);
    const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return v;
  }

  // Map every column header the sheet might use → a canonical key
  const HEADER_MAP = {
    topic_id:           ['topic_id', 'id', 'topic'],
    subject:            ['subject'],
    title:              ['title', 'name'],
    duration:           ['duration', 'card_duration'],
    blurb:              ['blurb', 'description', 'summary'],
    objectives:         ['objectives', 'objective', 'learning_objectives'],
    formulas:           ['formulas', 'formula', 'key_facts', 'facts'],
    video_foundation:   ['video_foundation', 'foundation_url', 'foundation_video', 'video_slow'],
    video_standard:     ['video_standard',   'standard_url',   'standard_video',   'video_main', 'video_url', 'video'],
    video_mastery:      ['video_mastery',    'mastery_url',    'mastery_video',    'video_exam'],
    tagline_foundation: ['tagline_foundation', 'foundation_tagline', 'foundation_label'],
    tagline_standard:   ['tagline_standard',   'standard_tagline',   'standard_label'],
    tagline_mastery:    ['tagline_mastery',    'mastery_tagline',    'mastery_label'],
    dur_foundation:     ['duration_foundation', 'foundation_duration', 'dur_foundation'],
    dur_standard:       ['duration_standard',   'standard_duration',   'dur_standard'],
    dur_mastery:        ['duration_mastery',    'mastery_duration',    'dur_mastery'],
  };

  function buildIndex(headerRow) {
    const idx = {};
    const lc  = headerRow.map(h => norm(h).toLowerCase());
    for (const key of Object.keys(HEADER_MAP)) {
      const aliases = HEADER_MAP[key];
      idx[key] = lc.findIndex(h => aliases.includes(h));
    }
    return idx;
  }

  function g(row, idx, key) {
    const i = idx[key];
    return i >= 0 ? norm(row[i]) : '';
  }

  function buildVideos(row, idx) {
    const raw = {
      foundation: normaliseVideoUrl(g(row, idx, 'video_foundation')),
      standard:   normaliseVideoUrl(g(row, idx, 'video_standard')),
      mastery:    normaliseVideoUrl(g(row, idx, 'video_mastery')),
    };
    const bestUrl = raw.standard || raw.foundation || raw.mastery || '';
    if (!bestUrl) return null;

    const filled = {
      foundation: raw.foundation || raw.standard || raw.mastery,
      standard:   raw.standard   || raw.foundation || raw.mastery,
      mastery:    raw.mastery    || raw.standard || raw.foundation,
    };

    const videos = {};
    const tiers = ['foundation', 'standard', 'mastery'];
    const defaultTaglines = {
      foundation: 'Slow walkthrough · step-by-step with lots of examples',
      standard:   'Default lesson · full topic covered clearly',
      mastery:    'Exam-focused · past-paper patterns & tricky cases',
    };
    const defaultDurations = {
      foundation: g(row, idx, 'duration') || '20 mins',
      standard:   g(row, idx, 'duration') || '14 mins',
      mastery:    g(row, idx, 'duration') || '9 mins',
    };

    for (const tier of tiers) {
      const url = filled[tier];
      if (!url) continue;
      videos[tier] = {
        url,
        duration: g(row, idx, 'dur_' + tier) || defaultDurations[tier],
        tagline:  g(row, idx, 'tagline_' + tier) || defaultTaglines[tier],
        _fallback: (!raw[tier] && url) ? true : undefined,
      };
    }
    return videos;
  }

  // subjectOverride: when fetching from a named-subject URL, force
  // the subject value to that key (ignores what the sheet says).
  function rowToBlueprint(row, idx, subjectOverride) {
    const topicId = g(row, idx, 'topic_id');
    const subject  = subjectOverride || g(row, idx, 'subject').toLowerCase();
    const title    = g(row, idx, 'title');
    if (!topicId || !subject || !title) return null;

    // Videos are optional — topics without video URLs still appear in the sidebar
    const videos = buildVideos(row, idx) || null;

    return {
      id:         topicId,
      subject,
      title,
      duration:   g(row, idx, 'duration') || '14 mins',
      videos,
      blurb:      g(row, idx, 'blurb') || '',
      objectives: (g(row, idx, 'objectives') || '').split('|').map(s => s.trim()).filter(Boolean),
      formulas:   (g(row, idx, 'formulas')   || '').split('|').map(s => s.trim()).filter(Boolean),
      subSkills:  [],
      _source:    'gsheet',
    };
  }

  // ── Fetch a single sheet and return partial blueprint ─────────────
  async function fetchOneSheet(url, subjectOverride) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) return {};

      const idx       = buildIndex(rows[0]);
      console.info(`[GSHEET_CURRICULUM] Headers found:`, rows[0]);
      const partial   = {};
      let skipped = 0;
      for (let i = 1; i < rows.length; i++) {
        const topic = rowToBlueprint(rows[i], idx, subjectOverride);
        if (topic) partial[topic.id] = topic;
        else skipped++;
      }
      if (skipped > 0) console.warn(`[GSHEET_CURRICULUM] Skipped ${skipped} rows (missing topic_id, subject, or title).`);
      console.info(
        `[GSHEET_CURRICULUM] Loaded ${Object.keys(partial).length} topics` +
        (subjectOverride ? ` for "${subjectOverride}"` : '') + '.'
      );
      return partial;
    } catch (e) {
      console.warn('[GSHEET_CURRICULUM] fetch failed for', url, '—', e.message);
      return {};
    }
  }

  // ── Fetch ALL subject sheets in parallel ──────────────────────────
  async function fetchBlueprint(force = false) {
    const entries = getSheetEntries();
    if (entries.length === 0) return {};

    const now = Date.now();
    if (!force && _cache && (now - _cache.at) < CACHE_MS) return _cache.blueprint;
    if (_inflight) return _inflight;

    _inflight = (async () => {
      try {
        // Fetch all sheets in parallel for speed
        const results = await Promise.all(
          entries.map(({ subject, url }) => fetchOneSheet(url, subject))
        );
        // Merge all partial blueprints together
        const blueprint = Object.assign({}, ...results);
        _cache = { blueprint, at: now };
        return blueprint;
      } finally {
        _inflight = null;
      }
    })();

    return _inflight;
  }

  // ── Merge sheet topics into TOPIC_BLUEPRINT ───────────────────────
  async function init() {
    if (_loaded) return;
    const sheetBlueprint = await fetchBlueprint();
    const count = Object.keys(sheetBlueprint).length;
    if (count === 0) {
      console.info('[GSHEET_CURRICULUM] No sheet data — using built-in curriculum.');
      _loaded = true;
      return;
    }
    window.TOPIC_BLUEPRINT = Object.assign(
      {},
      window.TOPIC_BLUEPRINT || {},
      sheetBlueprint
    );
    _loaded = true;
    console.info(`[GSHEET_CURRICULUM] Merged ${count} topics into TOPIC_BLUEPRINT.`);
  }

  function clearCache() { _cache = null; _loaded = false; }
  function isEnabled()  { return getSheetEntries().length > 0; }

  return { init, clearCache, isEnabled, fetchBlueprint };
})();
