/* ═══════════════════════════════════════════════════════════════════
   UE School — js/home-video-preview.js
   ───────────────────────────────────────────────────────────────────
   PURPOSE
   ───────
   Fetches a dedicated "home preview" Google Sheet tab (CSV), takes
   the LAST 5 rows that contain a valid video URL, and rotates them
   automatically inside the .classroom-video-mock slot on index.html.

   • If only one valid video row exists it plays on a loop (no rotation).
   • If the sheet is empty or unreachable the original placeholder is
     restored silently.
   • Uses GDRIVE_VIDEO.embedUrl() (gdrive-video.js) to normalise any
     Google Drive share URL into a /preview embed URL.

   ───────────────────────────────────────────────────────────────────
   LOAD ORDER (in index.html, before </body>)
   ──────────────────────────────────────────
     <script src="js/gdrive-video.js"></script>          ← must come first
     <script src="js/home-video-preview.js"></script>    ← this file

   NO other UE School module is required on the home page.

   ───────────────────────────────────────────────────────────────────
   GOOGLE SHEET FORMAT
   ───────────────────
   The sheet tab must have a header row (row 1) and at least these
   two columns (column names are case-insensitive, extra columns are
   ignored):

     title      — display label shown below the iframe  (optional but nice)
     video_url  — full Google Drive share URL or bare file ID

   Example:
     title              | video_url
     Quadratic Equations| https://drive.google.com/file/d/ABC123/view?usp=sharing
     Number Theory      | https://drive.google.com/file/d/DEF456/view?usp=sharing

   The module reads the LAST 5 rows that have a non-empty video_url.
   Add new rows to the bottom of your sheet — the newest always wins.

   ───────────────────────────────────────────────────────────────────
   CONFIGURATION
   ─────────────
   Edit the two constants directly below.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG ──────────────────────────────────────────────────────
     HOME_VIDEO_SHEET_CSV_URL
       The "Publish to web → CSV" URL for the dedicated preview tab.

     ROTATION_INTERVAL_MS
       How long each video plays before switching to the next one.
       Default: 30 seconds. Set to 0 to disable auto-rotation.
  ─────────────────────────────────────────────────────────────────── */
  var HOME_VIDEO_SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/' +
    '2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_' +
    '/pub?gid=175294299&single=true&output=csv';

  var ROTATION_INTERVAL_MS = 30000; // 30 s per video

  /* ── INTERNAL STATE ──────────────────────────────────────────────── */
  var videos        = [];   // [{title, embedUrl}, …] — last ≤5 valid rows
  var currentIndex  = 0;
  var rotationTimer = null;
  var slot          = null; // the .classroom-video-mock DOM element

  /* ── PLACEHOLDER (restored on error / empty sheet) ──────────────── */
  var PLACEHOLDER_HTML =
    '<div style="text-align:center;color:rgba(255,255,255,.25)">' +
      '<div style="font-size:3.5rem;margin-bottom:8px">&#x25B6;</div>' +
      '<div style="font-size:.85rem;font-weight:600">Sample Lesson Preview</div>' +
    '</div>';

  /* ── CSV PARSER ──────────────────────────────────────────────────
     Minimal RFC-4180-compatible parser.
     Handles quoted fields (including commas and newlines inside quotes)
     without relying on any external library.
  ─────────────────────────────────────────────────────────────────── */
  function parseCsv(text) {
    var rows   = [];
    var row    = [];
    var field  = '';
    var inQ    = false;
    var i      = 0;
    var len    = text.length;

    while (i < len) {
      var ch = text[i];

      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') {   // escaped quote ""
            field += '"';
            i += 2;
          } else {                      // closing quote
            inQ = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQ = true;
          i++;
        } else if (ch === ',') {
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\r' && text[i + 1] === '\n') {
          row.push(field);
          rows.push(row);
          row   = [];
          field = '';
          i += 2;
        } else if (ch === '\n') {
          row.push(field);
          rows.push(row);
          row   = [];
          field = '';
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }

    // Flush last field / row
    if (field || row.length) {
      row.push(field);
      if (row.some(function (c) { return c.trim() !== ''; })) {
        rows.push(row);
      }
    }

    return rows;
  }

  /* ── SHEET → VIDEO OBJECTS ───────────────────────────────────────
     Reads parsed CSV rows, finds the header indices for
     "title" and "video_url", then converts each data row into a
     {title, embedUrl} object, filtering out rows with no URL.
     Returns the LAST ≤5 valid entries (newest rows first for display,
     but we keep sheet order so the rotation feels natural).
  ─────────────────────────────────────────────────────────────────── */
  function sheetToVideos(rows) {
    if (!rows || rows.length < 2) return [];

    var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var titleIdx = headers.indexOf('title');
    var urlIdx   = headers.indexOf('video_url');

    // Also accept "url" or "video" as column aliases
    if (urlIdx === -1) urlIdx = headers.indexOf('url');
    if (urlIdx === -1) urlIdx = headers.indexOf('video');

    if (urlIdx === -1) {
      console.warn('[home-video-preview] No "video_url" column found in sheet header:', headers);
      return [];
    }

    var valid = [];
    for (var r = 1; r < rows.length; r++) {
      var rawUrl = (rows[r][urlIdx] || '').trim();
      if (!rawUrl) continue;

      var embedUrl = (window.GDRIVE_VIDEO && window.GDRIVE_VIDEO.embedUrl)
        ? window.GDRIVE_VIDEO.embedUrl(rawUrl)
        : rawUrl;   // fallback: use URL as-is (e.g. a YouTube embed)

      if (!embedUrl) continue;

      var title = titleIdx !== -1 ? (rows[r][titleIdx] || '').trim() : '';
      valid.push({ title: title, embedUrl: embedUrl });
    }

    // Keep only the last 5 valid rows
    return valid.slice(-5);
  }

  /* ── RENDER ONE VIDEO ────────────────────────────────────────────
     Injects the iframe for videos[idx] into the slot.
     Includes navigation dots when there are multiple videos.
  ─────────────────────────────────────────────────────────────────── */
  function renderVideo(idx) {
    if (!slot || !videos.length) return;
    var v = videos[idx];

    var dotsHtml = '';
    if (videos.length > 1) {
      dotsHtml = '<div style="' +
        'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);' +
        'display:flex;gap:6px;z-index:10;pointer-events:none' +
      '">';
      for (var d = 0; d < videos.length; d++) {
        var active = d === idx
          ? 'background:rgba(255,255,255,.9);'
          : 'background:rgba(255,255,255,.3);';
        dotsHtml +=
          '<div style="width:7px;height:7px;border-radius:50%;' + active + '"></div>';
      }
      dotsHtml += '</div>';
    }

    var labelHtml = v.title
      ? '<div style="' +
          'position:absolute;bottom:' + (videos.length > 1 ? '28px' : '10px') + ';' +
          'left:0;right:0;text-align:center;' +
          'font-size:.75rem;color:rgba(255,255,255,.55);' +
          'pointer-events:none;padding:0 12px;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
        '">' + escapeHtml(v.title) + '</div>'
      : '';

    slot.innerHTML =
      '<iframe' +
        ' src="' + v.embedUrl + '"' +
        ' style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"' +
        ' allow="autoplay; encrypted-media"' +
        ' allowfullscreen' +
        ' title="' + escapeHtml(v.title || 'Featured Lesson') + '"' +
      '></iframe>' +
      labelHtml +
      dotsHtml;
  }

  /* ── ROTATION LOGIC ──────────────────────────────────────────────
     Advances to the next video and re-schedules itself.
     Stops automatically if the slot is removed from the DOM.
  ─────────────────────────────────────────────────────────────────── */
  function advance() {
    if (!slot || !document.body.contains(slot)) {
      clearInterval(rotationTimer);
      return;
    }
    currentIndex = (currentIndex + 1) % videos.length;
    renderVideo(currentIndex);
  }

  function startRotation() {
    if (videos.length < 2 || ROTATION_INTERVAL_MS <= 0) return;
    rotationTimer = setInterval(advance, ROTATION_INTERVAL_MS);
  }

  /* ── ESCAPE HELPER ───────────────────────────────────────────────── */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ── LOADING SPINNER ─────────────────────────────────────────────── */
  function showSpinner() {
    if (!slot) return;
    slot.innerHTML =
      '<div style="text-align:center;color:rgba(255,255,255,.35)">' +
        '<div style="' +
          'width:36px;height:36px;border:3px solid rgba(255,255,255,.15);' +
          'border-top-color:rgba(255,255,255,.7);border-radius:50%;' +
          'animation:hvpSpin .8s linear infinite;margin:0 auto 10px' +
        '"></div>' +
        '<div style="font-size:.78rem">Loading preview…</div>' +
      '</div>' +
      // Inject keyframes once into <head> if not already there
      '<style id="hvp-spin-style">' +
        '@keyframes hvpSpin{to{transform:rotate(360deg)}}' +
      '</style>';
  }

  /* ── MAIN INIT ───────────────────────────────────────────────────
     Called on DOMContentLoaded.  Fetches the sheet, parses videos,
     renders the first one, and starts the rotation timer.
  ─────────────────────────────────────────────────────────────────── */
  function init() {
    slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;  // not on the home page — do nothing

    showSpinner();

    fetch(HOME_VIDEO_SHEET_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (csvText) {
        var rows   = parseCsv(csvText);
        videos     = sheetToVideos(rows);

        if (!videos.length) {
          slot.innerHTML = PLACEHOLDER_HTML;
          return;
        }

        currentIndex = 0;
        renderVideo(currentIndex);
        startRotation();
      })
      .catch(function (err) {
        console.warn('[home-video-preview] Could not load sheet:', err);
        slot.innerHTML = PLACEHOLDER_HTML;
      });
  }

  /* ── BOOT ────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();   // already parsed (e.g. script is deferred)
  }

})();
