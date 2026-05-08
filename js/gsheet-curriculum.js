/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-curriculum.js  (v2 — multi-subject)
   ───────────────────────────────────────────────────────────────────
   ⚠️  CRITICAL PATH — PART OF THE GSHEETS → VIDEO RENDERING PIPELINE
   ───────────────────────────────────────────────────────────────────

   ROLE IN THE PIPELINE
   ────────────────────
   This module is STEP 1 of the data pipeline that feeds videos into
   the classroom player.  The full pipeline in execution order is:

     [config.js]           → Provides UE_CONFIG with SUBJECT_SHEET_URLS
                             and cache settings.  Must load first.

     [gdrive-video.js]     → Provides GDRIVE_VIDEO.embedUrl() helper
                             used inside normaliseVideoUrl() below.

     [gsheet-curriculum.js]  ← THIS FILE
       │  Fetches published CSV files from Google Sheets.
       │  Parses them into structured TOPIC_BLUEPRINT entries.
       │  Exposes:  window.GSHEET_CURRICULUM.init()
       ↓
     [classroom.html inline script — Step 1]
       │  await GSHEET_CURRICULUM.init()
       │  → Sets window.TOPIC_BLUEPRINT = { topicId: topicObject, ... }
       ↓
     [classroom.html inline script — Step 2]
       │  mergeSheetIntoCurriculum()
       │  → Copies TOPIC_BLUEPRINT entries into CLASSROOM.CURRICULUM
       │    so the sidebar and video player can find them.
       ↓
     [classroom.js — CLASSROOM.init()]
       │  Calls mergeSheetIntoCurriculum() internally as well,
       │  then renders the sidebar tabs and topic list.
       ↓
     [classroom.js — renderLesson()]
          Reads topic.videos.standard.url (set by this module) and
          injects it into the <iframe> in the video-area element.

   ───────────────────────────────────────────────────────────────────
   ⛔  DO NOT MODIFY THIS FILE WITHOUT READING THE FULL PIPELINE NOTES
   ───────────────────────────────────────────────────────────────────

   WHAT THIS FILE OWNS
   ───────────────────
   • Fetching the published Google Sheet CSV(s).
   • Parsing raw CSV text into JavaScript row arrays.
   • Mapping row values → structured topic objects (TOPIC_BLUEPRINT
     entries) with normalised video URLs, objectives, formulas, etc.
   • In-memory cache (default 30 min) to avoid refetching on nav.
   • Merging all subject blueprints into window.TOPIC_BLUEPRINT.

   WHAT THIS FILE DOES NOT OWN
   ───────────────────────────
   • Rendering the sidebar or video player  → classroom.js
   • Converting Drive URLs to /preview      → gdrive-video.js
   • Config values (URLs, cache time)       → config.js (UE_CONFIG)
   • Auth or premium gating                 → auth-guard.js
   • Supabase writes (topic_mastery)        → classroom.js

   HOW TO USE (school operator — no coding needed)
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

  /* ─────────────────────────────────────────────────────────────────
     Configuration — read from UE_CONFIG (config.js)

     SUBJECT_SHEET_URLS  — { subjectKey: csvUrl } map. Each entry is a
       separate published Google Sheet tab.  This module fetches ALL
       of them in parallel (Promise.all) to minimise latency.

     LEGACY_URL  — single CSV URL, used only when SUBJECT_SHEET_URLS
       is empty. Kept for backwards compatibility.

     CACHE_MS  — milliseconds to reuse the last-fetched blueprint
       without hitting the network again. Avoids re-parsing on soft
       navigation within the same page session.
  ───────────────────────────────────────────────────────────────────── */
  const cfg = window.UE_CONFIG || {};

  const SUBJECT_URLS = cfg.SUBJECT_SHEET_URLS || {};
  const LEGACY_URL   = cfg.GOOGLE_SHEET_CURRICULUM_CSV_URL || '';
  const CACHE_MS     = (cfg.GS_CURRICULUM_CACHE_MIN || 30) * 60 * 1000;

  /* ─────────────────────────────────────────────────────────────────
     getSheetEntries() — INTERNAL HELPER
     ─────────────────────────────────────────────────────────────────
     Returns an array of { subject, url } objects — one per CSV to fetch.

     If SUBJECT_SHEET_URLS has entries, each key becomes the forced
     `subject` override for all rows in that sheet.  This means a
     mathematics sheet never accidentally imports rows as "english"
     even if the sheet column contains a typo.

     Falls back to LEGACY_URL with subject=null (inferred per-row from
     the sheet's own "subject" column) for backwards compatibility.
  ───────────────────────────────────────────────────────────────────── */
  function getSheetEntries() {
    const entries = Object.entries(SUBJECT_URLS)
      .filter(([, url]) => url && url.trim())
      .map(([subject, url]) => ({ subject, url: url.trim() }));
    if (entries.length === 0 && LEGACY_URL) {
      entries.push({ subject: null, url: LEGACY_URL });
    }
    return entries;
  }

  /* ─────────────────────────────────────────────────────────────────
     Module-level state (all private — NOT exported)

     _cache     — { blueprint: {}, at: timestamp } or null.
                  Avoids re-fetching/re-parsing within CACHE_MS window.

     _inflight  — a Promise while a fetch is in progress.
                  Prevents duplicate parallel fetches if init() is
                  called twice rapidly (e.g. by classroom.html AND
                  the DOMContentLoaded handler).

     _loaded    — boolean guard; init() is idempotent after first run.
  ───────────────────────────────────────────────────────────────────── */
  let _cache    = null;
  let _inflight = null;
  let _loaded   = false;

  /* ─────────────────────────────────────────────────────────────────
     parseCSV(text) — INTERNAL CSV PARSER
     ─────────────────────────────────────────────────────────────────
     Minimal RFC-4180-compliant CSV parser.  Handles:
       • Quoted fields containing commas   → "hello, world"
       • Escaped double-quotes inside quotes → "she said ""hi"""
       • Windows-style \r\n line endings (strips \r silently)

     This parser exists because the Google Sheets published CSV output
     does NOT always produce simple unquoted values — subject names
     and blurbs can contain commas.  Using String.split(',') would
     silently corrupt those fields.

     Returns: array of arrays — [[col0, col1, ...], [col0, col1, ...]]
              Empty / whitespace-only rows are filtered out.

     ⚠️  Do not replace this with a library call — the environment
         does not guarantee any CSV library is available, and this
         parser is battle-tested against the specific Google Sheets
         CSV dialect.
  ───────────────────────────────────────────────────────────────────── */
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') { cell += '"'; i++; }   // escaped quote
        else if (c === '"')         { inQ = false; }         // closing quote
        else                        { cell += c; }           // normal char inside quotes
      } else {
        if (c === '"')              { inQ = true; }           // opening quote
        else if (c === ',')         { row.push(cell); cell = ''; }  // field separator
        else if (c === '\r')        { /* skip CR — handle CRLF endings */ }
        else if (c === '\n')        { row.push(cell); rows.push(row); row = []; cell = ''; }
        else                        { cell += c; }
      }
    }
    // Flush last row (file may not end with \n)
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    // Remove rows that are entirely empty or whitespace
    return rows.filter(r => r.some(v => v && v.trim()));
  }

  /* ─────────────────────────────────────────────────────────────────
     norm(s) — trims and coerces to string.  Used throughout to guard
     against undefined/null values in sheet cells.
  ───────────────────────────────────────────────────────────────────── */
  function norm(s) { return (s || '').toString().trim(); }

  /* ─────────────────────────────────────────────────────────────────
     normaliseVideoUrl(raw) — INTERNAL HELPER  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     Converts a raw string from a sheet cell (which can be a full
     Google Drive share URL, a /preview URL, a bare file ID, or blank)
     into the canonical /preview embed URL.

     Delegates to GDRIVE_VIDEO.embedUrl() when available (preferred,
     handles all 4 Drive URL formats). Falls back to a local regex
     that covers the most common /file/d/... format only.

     Called once per tier (foundation / standard / mastery) per topic
     row during parseCSV → buildVideos().

     Returns: '' for blank/invalid input, otherwise a /preview URL.
  ───────────────────────────────────────────────────────────────────── */
  function normaliseVideoUrl(raw) {
    const v = norm(raw);
    if (!v) return '';
    // ── YouTube: return as-is so classroom.js extractYouTubeId() handles it
    // Must check BEFORE passing to GDRIVE_VIDEO — Drive helper has no YouTube
    // awareness and will silently return '' for any youtu.be / youtube.com URL.
    if (/youtu\.be\/|youtube\.com\//i.test(v)) return v;
    // ── Google Drive: use the dedicated helper (loaded before this file)
    if (window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.embedUrl(v);
    // Fallback: extract /file/d/ID pattern directly
    const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return v; // return as-is if we can't parse it (may be a direct /preview URL)
  }

  /* ─────────────────────────────────────────────────────────────────
     HEADER_MAP — column alias table
     ─────────────────────────────────────────────────────────────────
     Maps canonical field names (used throughout this module) to the
     list of lowercase column header strings that the sheet might use.

     This allows operators to use slightly different column names
     without breaking the integration. The FIRST matching alias wins.

     To add a new supported column header for an existing field, add
     the lowercase alias to the relevant array below — no other code
     change is needed.

     To add an entirely new field, add a new key with its aliases,
     then read it in rowToBlueprint() using g(row, idx, 'new_key').
  ───────────────────────────────────────────────────────────────────── */
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
    locked:             ['locked', 'lock', 'is_locked', 'status'],
  };

  /* ─────────────────────────────────────────────────────────────────
     buildIndex(headerRow) — INTERNAL HELPER
     ─────────────────────────────────────────────────────────────────
     Scans the CSV header row (row 0) and returns a lookup object:
       { canonicalKey: columnIndex, ... }

     Index values of -1 mean the column was not found in the sheet.
     The g() getter below returns '' for -1 indices, so missing
     optional columns are silently treated as empty strings.

     Called ONCE per fetchOneSheet() call.  The resulting index object
     is passed to g() and buildVideos() for every data row.
  ───────────────────────────────────────────────────────────────────── */
  function buildIndex(headerRow) {
    const idx = {};
    const lc  = headerRow.map(h => norm(h).toLowerCase());
    for (const key of Object.keys(HEADER_MAP)) {
      const aliases = HEADER_MAP[key];
      idx[key] = lc.findIndex(h => aliases.includes(h));
    }
    return idx;
  }

  /* ─────────────────────────────────────────────────────────────────
     g(row, idx, key) — INTERNAL GETTER
     ─────────────────────────────────────────────────────────────────
     Reads one cell from a data row using the column index built by
     buildIndex().  Returns '' if the column wasn't found (idx=-1)
     or if the cell is empty.

     Every field access in rowToBlueprint() and buildVideos() goes
     through this function — never access row[n] directly.
  ───────────────────────────────────────────────────────────────────── */
  function g(row, idx, key) {
    const i = idx[key];
    return i >= 0 ? norm(row[i]) : '';
  }

  /* ─────────────────────────────────────────────────────────────────
     buildVideos(row, idx) — INTERNAL HELPER  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     Extracts and normalises the three video tier URLs from one data
     row and builds the `videos` object that classroom.js expects.

     The `videos` object shape (consumed by classroom.js getVideoUrl):
       {
         foundation: { url, duration, tagline, _fallback? },
         standard:   { url, duration, tagline, _fallback? },
         mastery:    { url, duration, tagline, _fallback? },
       }

     TIER FALLBACK LOGIC (applied here, NOT in classroom.js):
     ──────────────────────────────────────────────────────────
     If a sheet row only fills in one video column (e.g. video_standard),
     all three tier entries are set to that same URL — guaranteeing
     that classroom.js always finds a valid URL regardless of which
     tier is requested.

     The `_fallback: true` flag marks entries that were filled by
     fallback rather than having an explicit URL in the sheet.
     classroom.js uses this for informational/diagnostic purposes only
     and does not alter playback behaviour based on it.

     Returns null if no video URL is found at all — rowToBlueprint()
     skips rows that return null here.
  ───────────────────────────────────────────────────────────────────── */
  function buildVideos(row, idx) {
    // Step 1: Normalise the raw URL from each tier column
    const raw = {
      foundation: normaliseVideoUrl(g(row, idx, 'video_foundation')),
      standard:   normaliseVideoUrl(g(row, idx, 'video_standard')),
      mastery:    normaliseVideoUrl(g(row, idx, 'video_mastery')),
    };

    // Step 2: Find the "best" URL to use as default fallback
    // Order: standard → foundation → mastery (mirrors classroom.js fallback order)
    const bestUrl = raw.standard || raw.foundation || raw.mastery || '';
    if (!bestUrl) return null; // ← Row has no video at all; skip it

    // Step 3: Apply fallback — missing tiers get the best available URL
    const filled = {
      foundation: raw.foundation || raw.standard || raw.mastery,
      standard:   raw.standard   || raw.foundation || raw.mastery,
      mastery:    raw.mastery    || raw.standard || raw.foundation,
    };

    // Step 4: Build the final videos object with metadata
    const videos = {};
    const tiers = ['foundation', 'standard', 'mastery'];

    // Default taglines shown in the tier-badge UI in classroom.js
    const defaultTaglines = {
      foundation: 'Slow walkthrough · step-by-step with lots of examples',
      standard:   'Default lesson · full topic covered clearly',
      mastery:    'Exam-focused · past-paper patterns & tricky cases',
    };

    // Default durations when tier-specific columns are not in the sheet
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
        // Prefer tier-specific duration from sheet, fall back to card-level duration
        duration: g(row, idx, 'dur_' + tier) || defaultDurations[tier],
        // Prefer operator-supplied tagline from sheet, fall back to generic text
        tagline:  g(row, idx, 'tagline_' + tier) || defaultTaglines[tier],
        // Mark fallback-filled entries for diagnostics (no functional effect)
        _fallback: (!raw[tier] && url) ? true : undefined,
      };
    }
    return videos;
  }

  /* ─────────────────────────────────────────────────────────────────
     rowToBlueprint(row, idx, subjectOverride) — INTERNAL FACTORY
     ─────────────────────────────────────────────────────────────────
     Converts one parsed CSV data row into a TOPIC_BLUEPRINT entry.

     The returned object shape is the TOPIC_BLUEPRINT contract that
     classroom.js's mergeSheetIntoCurriculum() consumes:
       {
         id:         string  — unique topic key, e.g. 'mathematics.quadratics'
         subject:    string  — lowercase subject key
         title:      string  — display name
         duration:   string  — card-level duration label
         videos:     object  — tier-to-URL map (from buildVideos)
         blurb:      string  — one-sentence intro for lesson-content panel
         objectives: string[] — bullet points for Key Points section
         formulas:   string[] — raw formula strings (classroom.js wraps them)
         subSkills:  []      — always empty from sheets; Skill Chamber populates this
         _source:    'gsheet' — used by classroom.js to distinguish sheet vs
                                hardcoded topics during the merge step
       }

     Returns null if required fields (topic_id, subject, title) are
     missing, or if no usable video URL exists (buildVideos returns null).
     Null rows are silently skipped in fetchOneSheet().
  ───────────────────────────────────────────────────────────────────── */
  function rowToBlueprint(row, idx, subjectOverride) {
    const topicId = g(row, idx, 'topic_id');
    // subjectOverride forces the subject key for sheets where every row
    // belongs to one subject.  Without it, we read the sheet's own column.
    const subject  = subjectOverride || g(row, idx, 'subject').toLowerCase();
    const title    = g(row, idx, 'title');

    // Skip rows missing any required field — prevents broken entries
    // from appearing in the sidebar or video player.
    if (!topicId || !subject || !title) return null;

    const videos = buildVideos(row, idx);
    // Skip rows with no video — UNLESS the row is locked (coming soon placeholder).
    // Locked rows appear in the sidebar as greyed-out stubs even before a video exists.
    const isLocked = /^(yes|true|1|locked)$/i.test(g(row, idx, 'locked'));
    if (!videos && !isLocked) return null;

    return {
      id:         topicId,
      subject,
      title,
      duration:   g(row, idx, 'duration') || '14 mins',
      videos:     videos || null,
      blurb:      g(row, idx, 'blurb') || '',
      objectives: (g(row, idx, 'objectives') || '').split('|').map(s => s.trim()).filter(Boolean),
      formulas:   (g(row, idx, 'formulas')   || '').split('|').map(s => s.trim()).filter(Boolean),
      subSkills:  [],
      locked:     isLocked,
      _source:    'gsheet',
    };
  }

  /* ─────────────────────────────────────────────────────────────────
     fetchOneSheet(url, subjectOverride) — INTERNAL ASYNC FETCHER
     ─────────────────────────────────────────────────────────────────
     Fetches one Google Sheets published CSV URL and returns a partial
     TOPIC_BLUEPRINT object (keyed by topic_id).

     The { cache: 'no-store' } fetch option ensures we always get the
     latest published sheet data, not a stale browser-cache copy.

     Errors (network failure, non-200 response, malformed CSV) are
     caught and logged — they return an empty {} so a single bad sheet
     does not prevent other subjects from loading.

     Called by fetchBlueprint() for each entry in getSheetEntries().
  ───────────────────────────────────────────────────────────────────── */
  async function fetchOneSheet(url, subjectOverride) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        console.warn('[GSHEET_CURRICULUM] Sheet appears empty (header-only or no rows):', url);
        return {};
      }

      const idx     = buildIndex(rows[0]); // row 0 is always the header

      // Warn if required columns are missing — helps diagnose header name mismatches
      const requiredCols = ['topic_id', 'title'];
      for (const col of requiredCols) {
        if (idx[col] === -1) {
          console.error(
            `[GSHEET_CURRICULUM] Required column "${col}" not found in sheet headers.`,
            'Found headers:', rows[0]
          );
        }
      }

      const partial = {};
      for (let i = 1; i < rows.length; i++) {
        const topic = rowToBlueprint(rows[i], idx, subjectOverride);
        if (topic) partial[topic.id] = topic;
      }

      const loadedCount = Object.keys(partial).length;
      const dataRows    = rows.length - 1;
      if (loadedCount === 0 && dataRows > 0) {
        console.error(
          `[GSHEET_CURRICULUM] Parsed ${dataRows} rows but produced 0 topics.`,
          'Check that topic_id, title, and a video column are all filled in.',
          'Sheet headers detected:', rows[0]
        );
      } else {
        console.info(
          `[GSHEET_CURRICULUM] Loaded ${loadedCount} topics` +
          (subjectOverride ? ` for "${subjectOverride}"` : '') + '.'
        );
      }
      return partial;
    } catch (e) {
      // Non-fatal — log clearly and return empty so other sheets still load
      console.error('[GSHEET_CURRICULUM] ❌ Fetch FAILED for', url, '—', e.message,
        '\nCheck: Is the sheet published? File → Share → Publish to web → CSV.');
      return {};
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     fetchBlueprint(force) — INTERNAL ORCHESTRATOR
     ─────────────────────────────────────────────────────────────────
     Fetches ALL subject sheets in parallel (Promise.all) and merges
     their partial blueprints into one combined object.

     Cache behaviour:
       • If a valid in-memory cache exists and hasn't expired, returns
         it immediately — no network request.
       • If a fetch is already in-flight (_inflight Promise), returns
         that same Promise — prevents duplicate parallel requests if
         init() is called twice before the first resolves.
       • On success, stores { blueprint, at: Date.now() } in _cache.

     force=true bypasses the cache check (used by clearCache() after
     an operator manually refreshes the sheet).
  ───────────────────────────────────────────────────────────────────── */
  async function fetchBlueprint(force = false) {
    const entries = getSheetEntries();
    if (entries.length === 0) return {}; // no URLs configured → nothing to fetch

    const now = Date.now();
    // Return cached data if still fresh
    if (!force && _cache && (now - _cache.at) < CACHE_MS) return _cache.blueprint;
    // Return existing in-flight Promise to avoid duplicate fetches
    if (_inflight) return _inflight;

    _inflight = (async () => {
      try {
        // Fetch all subject sheets simultaneously for minimum load time
        const results = await Promise.all(
          entries.map(({ subject, url }) => fetchOneSheet(url, subject))
        );
        // Merge all partial blueprints — later entries overwrite earlier ones
        // if topic_ids collide (intentional: allows overriding by order)
        const blueprint = Object.assign({}, ...results);
        _cache = { blueprint, at: now };
        return blueprint;
      } finally {
        _inflight = null; // always clear the in-flight guard
      }
    })();

    return _inflight;
  }

  /* ─────────────────────────────────────────────────────────────────
     init() — PRIMARY PUBLIC METHOD  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     Called by classroom.html (DOMContentLoaded inline script, Step 1)
     BEFORE mergeSheetIntoCurriculum() and BEFORE CLASSROOM.init().

     Execution sequence within classroom.html:
       1. await GSHEET_CURRICULUM.init()          ← this function
       2. mergeSheetIntoCurriculum()               ← inline script Step 2
       3. await CLASSROOM.init()                   ← classroom.js

     What it does:
       • Calls fetchBlueprint() to get all sheet data.
       • Merges the result into window.TOPIC_BLUEPRINT (creates it if
         it doesn't exist yet, preserving any entries from other sources).
       • Sets _loaded = true so subsequent calls are no-ops (idempotent).

     The window.TOPIC_BLUEPRINT object is the HANDOFF POINT between
     this module and classroom.js.  After init() resolves:
       window.TOPIC_BLUEPRINT = {
         'mathematics.quadratics': { id, subject, title, videos, ... },
         'english.comprehension':  { ... },
         ...
       }
     classroom.js then reads this during mergeSheetIntoCurriculum() and
     incorporates it into CLASSROOM.CURRICULUM for rendering.
  ───────────────────────────────────────────────────────────────────── */
  async function init() {
    // Idempotency guard: if already loaded in this session, skip
    if (_loaded) return;
    const sheetBlueprint = await fetchBlueprint();
    const count = Object.keys(sheetBlueprint).length;
    if (count === 0) {
      console.info('[GSHEET_CURRICULUM] No sheet data — using built-in curriculum.');
      _loaded = true;
      return;
    }
    // Merge into TOPIC_BLUEPRINT, sheet data wins over any pre-existing entries
    // (Object.assign: later keys overwrite earlier ones)
    window.TOPIC_BLUEPRINT = Object.assign(
      {},
      window.TOPIC_BLUEPRINT || {},
      sheetBlueprint
    );
    _loaded = true;
    console.info(`[GSHEET_CURRICULUM] Merged ${count} topics into TOPIC_BLUEPRINT.`);
  }

  /* ─────────────────────────────────────────────────────────────────
     clearCache() — UTILITY (admin / debugging use only)
     Resets the in-memory cache and _loaded flag so the next init()
     call re-fetches from Google Sheets.  Not called in normal flow.
  ───────────────────────────────────────────────────────────────────── */
  function clearCache() { _cache = null; _loaded = false; }

  /* ─────────────────────────────────────────────────────────────────
     isEnabled() — GUARD USED BY classroom.js
     ─────────────────────────────────────────────────────────────────
     Returns true if at least one CSV URL is configured.
     classroom.js calls this before calling init() to decide whether
     to attempt a sheet load at all:

       if (window.GSHEET_CURRICULUM && window.GSHEET_CURRICULUM.isEnabled()) {
         await window.GSHEET_CURRICULUM.init();
         mergeSheetIntoCurriculum();
       }

     When false, classroom.js runs entirely on its hardcoded CURRICULUM.
  ───────────────────────────────────────────────────────────────────── */
  function isEnabled() { return getSheetEntries().length > 0; }

  /* ─────────────────────────────────────────────────────────────────
     Public API surface — intentionally minimal.

     init            — ★ The only method classroom.html must await.
     clearCache      — Admin / diagnostic use only.
     isEnabled       — Guard check used by classroom.js before init().
     fetchBlueprint  — Exposed for diagnostic tooling; production code
                       should call init() instead.
  ───────────────────────────────────────────────────────────────────── */
  return { init, clearCache, isEnabled, fetchBlueprint };
})();
