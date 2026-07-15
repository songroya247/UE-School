/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gsheet-curriculum.js
   Optional Google Sheets curriculum enricher.

   PURPOSE:
   Loads BEFORE classroom.js. If UE_CONFIG.GOOGLE_SHEET_CURRICULUM_URL
   is set (a published-to-web CSV), this script fetches it and enriches
   window.TOPIC_BLUEPRINT with driveId / youtubeId entries so the
   classroom player can embed the matching video for each topic.

   CSV columns expected (header row required):
     topic_id | drive_id | youtube_id | notes
   topic_id must match the keys used in TOPIC_BLUEPRINT, e.g.
     mathematics.quadratics

   If GOOGLE_SHEET_CURRICULUM_URL is blank / absent, this script does
   nothing — classroom.js falls back to whatever driveId / youtubeId
   values are already hardcoded in TOPIC_BLUEPRINT (curriculum.js).

   Enrichment is fire-and-forget. classroom.js reads TOPIC_BLUEPRINT
   when a topic is clicked, so even if the fetch is a little slow the
   data will be ready by the time the user selects their first lesson.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cfg = window.UE_CONFIG || {};
  const SHEET_URL = cfg.GOOGLE_SHEET_CURRICULUM_URL || '';

  // Nothing configured — graceful no-op.
  if (!SHEET_URL) return;

  // ── Minimal CSV parser (handles quotes) ─────────────────────────
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
    return rows.filter(r => r.some(v => v.trim()));
  }

  function norm(s) { return (s || '').toString().trim(); }

  // ── Fetch + enrich TOPIC_BLUEPRINT ──────────────────────────────
  (async function enrich() {
    try {
      const res = await fetch(SHEET_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = parseCSV(await res.text());
      if (rows.length < 2) return;

      const lc  = rows[0].map(h => norm(h).toLowerCase());
      const col = key => lc.findIndex(h => h === key);
      const iId = col('topic_id');
      const iDr = col('drive_id');
      const iYt = col('youtube_id');
      if (iId < 0) return;  // no topic_id column — can't proceed

      // Ensure TOPIC_BLUEPRINT exists
      window.TOPIC_BLUEPRINT = window.TOPIC_BLUEPRINT || {};

      for (let i = 1; i < rows.length; i++) {
        const r       = rows[i];
        const topicId = norm(r[iId]);
        if (!topicId) continue;

        if (!window.TOPIC_BLUEPRINT[topicId]) {
          window.TOPIC_BLUEPRINT[topicId] = {};
        }

        const driveId   = iDr >= 0 ? norm(r[iDr]) : '';
        const youtubeId = iYt >= 0 ? norm(r[iYt]) : '';

        if (driveId)   window.TOPIC_BLUEPRINT[topicId].driveId   = driveId;
        if (youtubeId) window.TOPIC_BLUEPRINT[topicId].youtubeId = youtubeId;
      }

      console.info('[GSHEET_CURRICULUM] Enriched', Object.keys(window.TOPIC_BLUEPRINT).length, 'topics.');
    } catch (e) {
      console.warn('[GSHEET_CURRICULUM] Could not load curriculum sheet:', e.message);
    }
  })();

})();
