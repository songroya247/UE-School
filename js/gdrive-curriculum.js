/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gdrive-curriculum.js
   Fetches the operator's Google Sheet, parses it, and exposes
   resolveVideo(topic, tier) + masteryToTier(score) for the
   3-tier video player in classroom.js.

   Sheet column order (minimum required):
     topic_id | title | subject | video_standard
   Optional: video_foundation | video_mastery | duration | blurb | active

   Operator usage: paste a Google Drive share URL OR a YouTube URL
   into any video_* column.  This module handles both automatically.
═══════════════════════════════════════════════════════════════════ */

window.GDRIVE_CURRICULUM = (function () {
  'use strict';

  const cfg      = window.UE_CONFIG || {};
  const SHEET_URL = cfg.CURRICULUM_SHEET_CSV_URL || '';
  const CACHE_MS  = 5 * 60 * 1000; // 5-minute in-memory cache

  let _cache    = null;
  let _inflight = null;

  // ── RFC-4180 CSV parser ──────────────────────────────────────────
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
        else if (c === ',')  { row.push(cell.trim()); cell = ''; }
        else if (c === '\r') { /* skip CR */ }
        else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
        else                 { cell += c; }
      }
    }
    if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim()));
  }

  // ── Extract Google Drive file ID from any URL format or bare ID ──
  function extractDriveId(raw) {
    if (!raw) return '';
    const s = raw.trim();
    if (!s.includes('/') && !s.includes('?')) return s; // bare ID
    const m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    return m ? m[1] : '';
  }

  // ── Extract YouTube video ID from any YouTube URL ────────────────
  function extractYouTubeId(raw) {
    if (!raw) return '';
    const s = raw.trim();
    let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  // ── Classify a raw cell → { type, id, embedUrl } or null ────────
  function classifyVideoCell(raw) {
    if (!raw || !raw.trim()) return null;

    const ytId = extractYouTubeId(raw);
    if (ytId) return {
      type: 'youtube',
      id:   ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`
    };

    const driveId = extractDriveId(raw);
    if (driveId) return {
      type: 'drive',
      id:   driveId,
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`
    };

    return null;
  }

  // ── Convert a CSV row object into a topic blueprint entry ────────
  function rowToTopic(h) {
    const id      = (h.topic_id || '').trim();
    const subject = (h.subject  || '').trim().toLowerCase();
    if (!id || !subject) return null;
    if ((h.active || 'TRUE').toUpperCase() === 'FALSE') return null;

    return {
      id,
      subject,
      title:    (h.title    || id).trim(),
      duration: (h.duration || '—') + ' mins',
      blurb:    (h.blurb    || '').trim(),
      videos: {
        foundation: classifyVideoCell(h.video_foundation),
        standard:   classifyVideoCell(h.video_standard),
        mastery:    classifyVideoCell(h.video_mastery),
      }
    };
  }

  // ── Fetch and parse the Google Sheet CSV ─────────────────────────
  async function fetchSheet() {
    if (!SHEET_URL) return {};

    const res  = await fetch(SHEET_URL, { cache: 'no-store' });
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return {};

    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const bp = {};

    for (let i = 1; i < rows.length; i++) {
      const h = {};
      headers.forEach((k, idx) => { h[k] = rows[i][idx] || ''; });
      const t = rowToTopic(h);
      if (t) bp[t.id] = t;
    }

    return bp;
  }

  // ── Load with 5-minute cache ─────────────────────────────────────
  async function load() {
    if (_cache && Date.now() - _cache.at < CACHE_MS) return _cache.blueprint;
    if (_inflight) return _inflight;

    _inflight = fetchSheet().then(bp => {
      _cache    = { blueprint: bp, at: Date.now() };
      _inflight = null;
      console.log('[GDRIVE_CURRICULUM] Loaded', Object.keys(bp).length, 'topics from sheet');
      return bp;
    }).catch(err => {
      console.warn('[GDRIVE_CURRICULUM] Sheet fetch failed — using static fallback', err);
      _inflight = null;
      return {};
    });

    return _inflight;
  }

  // ── Merge sheet data into window.TOPIC_BLUEPRINT ─────────────────
  async function init() {
    const bp = await load();
    if (Object.keys(bp).length) {
      window.TOPIC_BLUEPRINT = Object.assign(window.TOPIC_BLUEPRINT || {}, bp);
    }
  }

  // ── 3-tier fallback order ────────────────────────────────────────
  // foundation → tries foundation first, then standard, then mastery
  // standard   → tries standard first,   then foundation, then mastery
  // mastery    → tries mastery first,     then standard, then foundation
  const ORDER = {
    foundation: ['foundation', 'standard', 'mastery'],
    standard:   ['standard',   'foundation', 'mastery'],
    mastery:    ['mastery',    'standard', 'foundation'],
  };

  // ── resolveVideo(topic, tier) ────────────────────────────────────
  // Returns { embedUrl, type, isFallback, servedTier }
  // topic.videos must have { foundation, standard, mastery } keys
  // (each is the classifyVideoCell result object, or null if blank).
  function resolveVideo(topic, tier) {
    const t     = (tier || 'standard').toLowerCase();
    const order = ORDER[t] || ORDER.standard;

    for (const key of order) {
      const v = topic.videos && topic.videos[key];
      if (v && v.embedUrl) {
        return { ...v, isFallback: key !== t, servedTier: key };
      }
    }

    return { embedUrl: '', type: null, isFallback: false, servedTier: null };
  }

  // ── masteryToTier(score) ─────────────────────────────────────────
  // Maps a 0–1 mastery score to one of the three video tiers:
  //   0.00 – 0.39  → foundation  (struggling students)
  //   0.40 – 0.74  → standard    (average students)
  //   0.75 – 1.00  → mastery     (high scorers)
  function masteryToTier(score) {
    if (score === null || score === undefined || score === '') return 'foundation';
    const n = Number(score);
    if (n >= 0.75) return 'mastery';
    if (n >= 0.40) return 'standard';
    return 'foundation';
  }

  return { init, load, resolveVideo, masteryToTier };
})();
