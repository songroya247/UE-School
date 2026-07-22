/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-curriculum.js  (v3 — ground-up rewrite)
   ───────────────────────────────────────────────────────────────────
   ROLE: Fetch published Google Sheet CSVs → parse → write to
         window.TOPIC_BLUEPRINT so classroom.js can render lessons.

   PIPELINE ORDER (classroom.html loads scripts in this sequence):
     config.js           → UE_CONFIG (SUBJECT_SHEET_URLS, cache settings)
     gdrive-video.js     → GDRIVE_VIDEO.embedUrl()        ← MUST BE BEFORE THIS
     gsheet-curriculum.js  ← THIS FILE
     classroom.js        → reads window.TOPIC_BLUEPRINT

   WHAT THIS FILE OWNS:
     • Fetch + parse published CSV URLs from UE_CONFIG.SUBJECT_SHEET_URLS
     • Normalise video URLs (YouTube and Google Drive)
     • Write structured topic objects to window.TOPIC_BLUEPRINT
     • Session cache (respects UE_CONFIG.GS_CURRICULUM_CACHE_MIN)
     • Clear, surfaced errors — no silent failures

   WHAT THIS FILE DOES NOT OWN:
     • Rendering UI           → classroom.js
     • Auth / premium gating  → auth-guard.js
     • Supabase writes        → classroom.js
═══════════════════════════════════════════════════════════════════ */

window.GSHEET_CURRICULUM = (function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────
  const cfg          = window.UE_CONFIG || {};
  const SUBJECT_URLS = cfg.CURRICULUM_SHEET_URLS || {};
  const LEGACY_URL   = cfg.GOOGLE_SHEET_CURRICULUM_CSV_URL || '';
  const CACHE_MIN    = (cfg.GS_CURRICULUM_CACHE_MIN > 0) ? cfg.GS_CURRICULUM_CACHE_MIN : 30;
  const CACHE_MS     = CACHE_MIN * 60 * 1000;
  // Every subject tab is fetched in parallel (see fetchAll below). With 25
  // subjects sharing one spreadsheet, Google can throttle/stall some of
  // those simultaneous requests. Without a timeout, a single stalled
  // request would hang Promise.all forever, freezing the whole classroom
  // page on its "Loading…" placeholder. Capping each request at 10s means
  // a throttled tab fails fast (shown as a per-subject "sheet error")
  // instead of blocking every other subject from ever loading.
  const FETCH_TIMEOUT_MS = 12000;

  // ─── State ────────────────────────────────────────────────────────
  let _promise   = null;   // in-flight or resolved Promise (dedup + cache)
  let _loadedAt  = 0;      // timestamp of last successful load (0 = never)
  let _loadError = null;   // last error message, shown in renderSidebar

  // ─── Public: expose last error so classroom.js can surface it ─────
  function getLastError() { return _loadError; }

  // ─── getSheetEntries() ────────────────────────────────────────────
  // Returns [{ subject, url }, ...] from config.  Falls back to
  // LEGACY_URL (single sheet, subject inferred per-row).
  function getSheetEntries() {
    const entries = Object.entries(SUBJECT_URLS)
      .filter(([, url]) => typeof url === 'string' && url.trim())
      .map(([subject, url]) => ({ subject: subject.toLowerCase().trim(), url: url.trim() }));

    if (entries.length === 0 && LEGACY_URL && LEGACY_URL.trim()) {
      entries.push({ subject: null, url: LEGACY_URL.trim() });
    }
    return entries;
  }

  function isEnabled() { return getSheetEntries().length > 0; }

  // ─── parseCSV(text) ───────────────────────────────────────────────
  // Minimal RFC-4180 parser — handles quoted fields, embedded commas,
  // escaped double-quotes, and CRLF line endings.
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
        if      (c === '"')  { inQ = true; }
        else if (c === ',')  { row.push(cell); cell = ''; }
        else if (c === '\r') { /* skip CR */ }
        else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else                 { cell += c; }
      }
    }
    // Flush last row (file may not end with \n)
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v && v.trim()));
  }

  // ─── norm(s) ──────────────────────────────────────────────────────
  function norm(s) { return (s == null ? '' : String(s)).trim(); }

  // ─── normaliseVideoUrl(raw) ───────────────────────────────────────
  // Converts any raw value from a sheet cell into a playable embed URL.
  // YouTube URLs pass through unchanged (classroom.js extracts the ID).
  // Everything else is treated as a Google Drive reference.
  function normaliseVideoUrl(raw) {
    const v = norm(raw);
    if (!v) return '';
    // YouTube — pass through; classroom.js extractYouTubeId() handles it
    if (/youtu\.be\/|youtube\.com\//i.test(v)) return v;
    // Google Drive — use dedicated helper (guaranteed loaded before this file)
    if (window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.embedUrl(v) || '';
    // Fallback: extract /file/d/ID directly
    const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    // Already a valid-looking URL → return as-is
    if (/^https?:\/\//i.test(v)) return v;
    return '';
  }

  // ─── Column alias table ───────────────────────────────────────────
  // Maps canonical field names → accepted lowercase header aliases.
  // Operators can use any of the aliases; the first match wins.
  const HEADER_MAP = {
    topic_id:           ['topic_id', 'id', 'topic'],
    subject:            ['subject'],
    title:              ['title', 'name'],
    // Optional: the CBT question-bank "topic" tag this lesson's practice
    // questions live under. Use this when the question bank groups several
    // curriculum lessons into one broader topic (e.g. four Biology lessons
    // — Classification, Organization of Life, Cell Forms, Cell Structure —
    // all filed under the single question-bank topic "Variety of Organisms").
    // When present, classroom.js sends this instead of the lesson title to
    // cbt.html so the topic dropdown auto-selects correctly.
    exam_topic:         ['exam_topic', 'question_topic', 'qbank_topic', 'cbt_topic'],
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
    dur_standard:       ['duration_standard',   'standard_duration',  'dur_standard'],
    dur_mastery:        ['duration_mastery',    'mastery_duration',   'dur_mastery'],
  };

  // buildIndex: row[0] headers → { canonicalKey: colIndex } (-1 = absent)
  function buildIndex(headerRow) {
    const lc  = headerRow.map(h => norm(h).toLowerCase());
    const idx = {};
    for (const key of Object.keys(HEADER_MAP)) {
      idx[key] = lc.findIndex(h => HEADER_MAP[key].includes(h));
    }
    return idx;
  }

  // g: safe cell getter — returns '' for missing/out-of-range columns
  function g(row, idx, key) {
    const i = idx[key];
    return (i >= 0 && i < row.length) ? norm(row[i]) : '';
  }

  // ─── buildVideos(row, idx) ────────────────────────────────────────
  // Returns the videos object  { foundation, standard, mastery }
  // or null if the row has no video URL at all.
  // Each tier: { url, duration, tagline, _fallback? }
  function buildVideos(row, idx) {
    const raw = {
      foundation: normaliseVideoUrl(g(row, idx, 'video_foundation')),
      standard:   normaliseVideoUrl(g(row, idx, 'video_standard')),
      mastery:    normaliseVideoUrl(g(row, idx, 'video_mastery')),
    };

    const best = raw.standard || raw.foundation || raw.mastery;
    if (!best) return null;

    const filled = {
      foundation: raw.foundation || raw.standard || raw.mastery,
      standard:   raw.standard   || raw.foundation || raw.mastery,
      mastery:    raw.mastery    || raw.standard || raw.foundation,
    };

    const defaultTaglines = {
      foundation: 'Slow walkthrough · step-by-step with lots of examples',
      standard:   'Default lesson · full topic covered clearly',
      mastery:    'Exam-focused · past-paper patterns & tricky cases',
    };
    const cardDur = g(row, idx, 'duration');
    const defaultDur = { foundation: '20 mins', standard: '14 mins', mastery: '9 mins' };

    const videos = {};
    for (const tier of ['foundation', 'standard', 'mastery']) {
      const url = filled[tier];
      if (!url) continue;
      videos[tier] = {
        url,
        duration: g(row, idx, 'dur_' + tier) || cardDur || defaultDur[tier],
        tagline:  g(row, idx, 'tagline_' + tier) || defaultTaglines[tier],
        _fallback: (!raw[tier] && url) ? true : undefined,
      };
    }
    return videos;
  }

  // ─── rowToBlueprint(row, idx, subjectOverride) ────────────────────
  // Returns a TOPIC_BLUEPRINT entry or null if the row should be skipped.
  function rowToBlueprint(row, idx, subjectOverride) {
    const topicId = g(row, idx, 'topic_id');
    const subject  = subjectOverride || g(row, idx, 'subject').toLowerCase();
    const title    = g(row, idx, 'title');

    // Skip rows missing required fields — prevents phantom entries
    if (!topicId || !subject || !title) return null;

    const videos = buildVideos(row, idx);
    if (!videos) return null; // no video URL → not useful in classroom

    return {
      id:         topicId,
      subject,
      title,
      examTopic:  g(row, idx, 'exam_topic') || '',
      duration:   g(row, idx, 'duration') || '14 mins',
      videos,
      blurb:      g(row, idx, 'blurb') || '',
      objectives: (g(row, idx, 'objectives') || '').split('|').map(s => s.trim()).filter(Boolean),
      formulas:   (g(row, idx, 'formulas')   || '').split('|').map(s => s.trim()).filter(Boolean),
      subSkills:  [],
      _source:    'gsheet',
    };
  }

  // ─── fetchOneSheet(url, subjectOverride) ─────────────────────────
  // Fetches one CSV and returns a partial { topicId: topicObj } map.
  // Network / parse errors return {} (non-fatal) and set _loadError.
  async function fetchOneSheet(url, subjectOverride) {
    let res;
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      // Use cache:reload to always get the latest published sheet,
      // bypassing any stale service-worker or CDN cache.
      res = await fetch(url, { cache: 'reload', signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (networkErr) {
      clearTimeout(timeoutId);
      const timedOut = networkErr && networkErr.name === 'AbortError';
      const msg = timedOut
        ? `Timed out (${FETCH_TIMEOUT_MS / 1000}s) fetching sheet${subjectOverride ? ' for "' + subjectOverride + '"' : ''} — Google may be throttling multiple simultaneous requests to the same spreadsheet. Try again shortly.`
        : `Network error fetching sheet${subjectOverride ? ' for "' + subjectOverride + '"' : ''}: ${networkErr.message}. Check your internet connection.`;
      console.error('[GSHEET_CURRICULUM] ❌', msg, '\nURL:', url);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      return {};
    }

    if (!res.ok) {
      const msg = `Sheet fetch returned HTTP ${res.status}${subjectOverride ? ' for "' + subjectOverride + '"' : ''}. `
        + (res.status === 404 ? 'URL not found — re-publish the sheet (File → Publish to web → CSV).'
         : res.status === 403 ? 'Access denied — make sure the sheet is shared "Anyone with the link".'
         : 'Check the URL in config.js.');
      console.error('[GSHEET_CURRICULUM] ❌', msg, '\nURL:', url);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      return {};
    }

    let text;
    try {
      text = await res.text();
    } catch (readErr) {
      const msg = `Failed to read sheet response: ${readErr.message}`;
      console.error('[GSHEET_CURRICULUM] ❌', msg);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      return {};
    }

    if (!text || !text.trim()) {
      const msg = `Sheet is empty${subjectOverride ? ' for "' + subjectOverride + '"' : ''}. Add at least a header row and one data row.`;
      console.warn('[GSHEET_CURRICULUM] ⚠️', msg);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      return {};
    }

    const rows = parseCSV(text);
    if (rows.length < 2) {
      const msg = `Sheet has only ${rows.length} row(s)${subjectOverride ? ' for "' + subjectOverride + '"' : ''} — header row and at least one data row are required.`;
      console.warn('[GSHEET_CURRICULUM] ⚠️', msg);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      return {};
    }

    const idx = buildIndex(rows[0]);

    // Warn about missing required columns so operators can fix their sheet
    for (const col of ['topic_id', 'title']) {
      if (idx[col] < 0) {
        const msg = `Required column "${col}" not found in sheet${subjectOverride ? ' for "' + subjectOverride + '"' : ''}. `
          + `Headers found: [${rows[0].map(h => '"' + h + '"').join(', ')}]`;
        console.error('[GSHEET_CURRICULUM] ❌', msg);
        _loadError = (_loadError ? _loadError + '\n' : '') + msg;
      }
    }

    const partial = {};
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const topic = rowToBlueprint(rows[i], idx, subjectOverride);
      if (topic) {
        partial[topic.id] = topic;
      } else {
        skipped++;
      }
    }

    const loaded = Object.keys(partial).length;
    const dataRows = rows.length - 1;

    if (loaded === 0 && dataRows > 0) {
      const msg = `Parsed ${dataRows} row(s) but produced 0 topics${subjectOverride ? ' for "' + subjectOverride + '"' : ''}. `
        + 'Each row needs: topic_id, title (or name), and at least one video column filled in.';
      console.error('[GSHEET_CURRICULUM] ❌', msg);
      _loadError = (_loadError ? _loadError + '\n' : '') + msg;
    } else {
      const skippedNote = skipped > 0 ? ` (${skipped} row(s) skipped — missing topic_id, title, or video URL)` : '';
      console.info(`[GSHEET_CURRICULUM] ✓ Loaded ${loaded} topic(s)${subjectOverride ? ' for "' + subjectOverride + '"' : ''}${skippedNote}.`);
    }

    return partial;
  }

  // ─── fetchAll() ───────────────────────────────────────────────────
  // Fetches all configured sheets with LIMITED CONCURRENCY, merges results.
  //
  // Firing all subject sheets at once (25 simultaneous requests to the
  // SAME spreadsheet) overwhelms slow/constrained connections — on a
  // very slow mobile connection, 25-way contention means almost none of
  // them finish within any reasonable timeout, so subjects that should
  // load successfully end up failing too. Processing a bounded number at
  // a time (a worker pool) means slower connections just take a bit
  // longer overall, instead of everything failing together.
  const FETCH_CONCURRENCY = 5;

  async function fetchAll() {
    const entries = getSheetEntries();
    if (entries.length === 0) return {};

    _loadError = null; // reset error accumulator before each full fetch

    const results = new Array(entries.length);
    let next = 0;
    async function worker() {
      while (next < entries.length) {
        const i = next++;
        const { subject, url } = entries[i];
        results[i] = await fetchOneSheet(url, subject);
      }
    }
    const workerCount = Math.min(FETCH_CONCURRENCY, entries.length);
    await Promise.all(Array.from({ length: workerCount }, worker));

    // Merge — later entries win on topic_id collision
    return Object.assign({}, ...results);
  }

  // ─── init() ───────────────────────────────────────────────────────
  // The primary public method.  Call: await GSHEET_CURRICULUM.init()
  //
  // Idempotent within the cache window (CACHE_MIN minutes).
  // After cache expires, the next init() call re-fetches automatically.
  // Returns the blueprint object (may be empty {} on failure).
  async function init() {
    // Already have a fresh result in cache → return the same promise
    const now = Date.now();
    if (_promise && (now - _loadedAt) < CACHE_MS) {
      return _promise;
    }

    // Start a new fetch and cache the promise immediately (dedup
    // concurrent callers — they all await the same Promise).
    _promise = (async () => {
      const blueprint = await fetchAll();
      const count = Object.keys(blueprint).length;

      if (count === 0) {
        // Don't update _loadedAt — a failed/empty fetch should retry
        // on the next navigation rather than being silently cached.
        console.info('[GSHEET_CURRICULUM] No topics loaded. Classroom will use built-in content only.');
        // Return empty — don't blow away any existing TOPIC_BLUEPRINT
        return blueprint;
      }

      // Merge into window.TOPIC_BLUEPRINT (sheet wins over hardcoded)
      window.TOPIC_BLUEPRINT = Object.assign(
        {},
        window.TOPIC_BLUEPRINT || {},
        blueprint
      );

      _loadedAt = Date.now();
      console.info(`[GSHEET_CURRICULUM] ✓ Merged ${count} topic(s) into TOPIC_BLUEPRINT.`);
      return blueprint;
    })();

    return _promise;
  }

  // ─── clearCache() ────────────────────────────────────────────────
  // Force a re-fetch on the next init() call.  Admin / debug use only.
  function clearCache() {
    _loadedAt = 0;
    _promise  = null;
    _loadError = null;
    console.info('[GSHEET_CURRICULUM] Cache cleared. Next init() will re-fetch.');
  }

  return { init, clearCache, isEnabled, getLastError };

})();
