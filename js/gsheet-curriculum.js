/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-curriculum.js
   Loads the syllabus from a published Google Sheet CSV and merges
   it into TOPIC_BLUEPRINT so the rest of the app works unchanged.

   HOW TO USE (school operator — no coding needed):
   ─────────────────────────────────────────────────
   1. Open your Google Sheet (see SHEET COLUMN GUIDE below)
   2. File → Share → Anyone with the link → Viewer
   3. File → Publish to web → Sheet1 → CSV → copy the link
   4. Paste that link into config.js as:
        GOOGLE_SHEET_CURRICULUM_CSV_URL: 'https://docs.google.com/...'
   5. Done. Every time the page loads it pulls fresh data from the sheet.

   SHEET COLUMN GUIDE
   ──────────────────
   Required columns (headers must be on row 1):

   topic_id        | Unique key e.g.  mathematics.quadratics
   subject         | mathematics  /  literature  /  biology  /  english
   title           | Quadratic Equations
   duration        | 14 mins
   blurb           | One-sentence description shown on the card
   objectives      | Pipe-separated list: "Solve by factorising | Use the formula | Read the discriminant"
   formulas        | Pipe-separated list: "ax²+bx+c=0 | x=(-b±√...)÷2a"

   Video columns (paste full Google Drive share URL — leave blank if not ready yet):

   video_foundation | Slow walkthrough for struggling students
   video_standard   | Main lesson — the default tier
   video_mastery    | Exam-focused rapid revision

   Tagline columns (optional — short description shown under each video button):

   tagline_foundation | e.g.  Slow walkthrough · 6 worked examples
   tagline_standard   | e.g.  Default lesson · all methods explained
   tagline_mastery    | e.g.  Exam-focused · past-paper patterns

   Duration columns (optional — shown next to each video button):

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
   No error is shown to students — they simply get the best video available.
   Example: you only have a standard video uploaded → students see that.
            You later add foundation → it appears automatically for weaker students.

   CACHE
   ─────
   Parsed rows are cached in memory for GS_CURRICULUM_CACHE_MIN minutes
   (default 30). A hard refresh (Ctrl+Shift+R / ⌘+Shift+R) clears it.
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_CURRICULUM = (function () {
  'use strict';

  const cfg       = window.UE_CONFIG || {};

  // Support both the new array (GOOGLE_SHEET_CURRICULUM_CSV_URLS) and
  // the legacy single-URL key so old deployments keep working.
  const SHEET_URLS = (
    cfg.GOOGLE_SHEET_CURRICULUM_CSV_URLS ||
    (cfg.GOOGLE_SHEET_CURRICULUM_CSV_URL ? [cfg.GOOGLE_SHEET_CURRICULUM_CSV_URL] : [])
  ).filter(Boolean); // remove empty/blank entries

  const CACHE_MS  = (cfg.GS_CURRICULUM_CACHE_MIN || 30) * 60 * 1000;

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
    // Fallback: extract ID from share URL manually
    const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return v; // already an embed URL or custom URL
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

  // ── FALLBACK LOGIC ────────────────────────────────────────────────
  // Builds a videos object for the classroom player.
  // Any tier whose URL is blank is automatically filled with the best
  // available alternative so students always get a video, never a 404.
  //
  // Priority for fallback:
  //   standard → foundation → mastery
  //   (standard is the safest middle-ground for any student)
  function buildVideos(row, idx) {
    const raw = {
      foundation: normaliseVideoUrl(g(row, idx, 'video_foundation')),
      standard:   normaliseVideoUrl(g(row, idx, 'video_standard')),
      mastery:    normaliseVideoUrl(g(row, idx, 'video_mastery')),
    };

    // Fill blanks with fallback so the player never breaks.
    // If NO video at all, values stay '' — topic still shows in sidebar,
    // player will display a "coming soon" state instead of crashing.
    const filled = {
      foundation: raw.foundation || raw.standard || raw.mastery || '',
      standard:   raw.standard   || raw.foundation || raw.mastery || '',
      mastery:    raw.mastery    || raw.standard || raw.foundation || '',
    };

    // Build the full video tier objects
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

      // Mark with _fallback so the player can optionally show a badge
      const isFallback = !raw[tier] && url;

      videos[tier] = {
        url,
        duration: g(row, idx, 'dur_' + tier) || defaultDurations[tier],
        tagline:  g(row, idx, 'tagline_' + tier) || defaultTaglines[tier],
        _fallback: isFallback ? true : undefined,
      };
    }

    return videos;
  }

  function rowToBlueprint(row, idx) {
    const topicId = g(row, idx, 'topic_id');
    const subject  = g(row, idx, 'subject').toLowerCase();
    const title    = g(row, idx, 'title');
    if (!topicId || !subject || !title) return null;

    const videos = buildVideos(row, idx);
    // videos may have empty URLs — that is fine, topic still shows in sidebar

    const rawObj = g(row, idx, 'objectives');
    const rawFor = g(row, idx, 'formulas');

    return {
      id:         topicId,
      subject,
      title,
      duration:   g(row, idx, 'duration') || '14 mins',
      videos,
      blurb:      g(row, idx, 'blurb') || '',
      objectives: rawObj ? rawObj.split('|').map(s => s.trim()).filter(Boolean) : [],
      formulas:   rawFor ? rawFor.split('|').map(s => s.trim()).filter(Boolean) : [],
      subSkills:  [],
      _source:    'gsheet',
    };
  }

  // ── Fetch & parse one sheet URL ───────────────────────────────────
  async function fetchOneSheet(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) return {};

      const idx = buildIndex(rows[0]);
      const blueprint = {};
      for (let i = 1; i < rows.length; i++) {
        const topic = rowToBlueprint(rows[i], idx);
        if (topic) blueprint[topic.id] = topic;
      }
      console.info(`[GSHEET_CURRICULUM] Loaded ${Object.keys(blueprint).length} topics from ${url.split('gid=')[1] || url}`);
      return blueprint;
    } catch (e) {
      console.warn('[GSHEET_CURRICULUM] fetch failed for', url, ':', e.message);
      return {};
    }
  }

  // ── Fetch & merge all sheet URLs ──────────────────────────────────
  async function fetchBlueprint(force = false) {
    if (!SHEET_URLS.length) return {};
    const now = Date.now();
    if (!force && _cache && (now - _cache.at) < CACHE_MS) return _cache.blueprint;
    if (_inflight) return _inflight;

    _inflight = (async () => {
      try {
        // Fetch all sheets in parallel
        const results = await Promise.all(SHEET_URLS.map(fetchOneSheet));
        // Merge — later entries in the array override earlier ones on ID clash
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
  // Sheet topics OVERRIDE hardcoded ones with the same topic_id.
  // Topics only in the code (no sheet row) are kept as-is.
  // Call this once at page load before the classroom renders.
  async function init() {
    if (_loaded) return;
    const sheetBlueprint = await fetchBlueprint();
    if (Object.keys(sheetBlueprint).length === 0) {
      console.info('[GSHEET_CURRICULUM] No sheet data — using built-in curriculum.');
      _loaded = true;
      return;
    }
    window.TOPIC_BLUEPRINT = Object.assign(
      {},
      window.TOPIC_BLUEPRINT || {},
      sheetBlueprint            // sheet wins over hardcoded fallback
    );
    _loaded = true;
    console.info(`[GSHEET_CURRICULUM] Loaded ${Object.keys(sheetBlueprint).length} topics from Google Sheet.`);
  }

  function clearCache() { _cache = null; _loaded = false; }
  function isEnabled()  { return SHEET_URLS.length > 0; }

  return { init, clearCache, isEnabled, fetchBlueprint };
})();
