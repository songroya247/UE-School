/* ═══════════════════════════════════════════════════════════════════
   UE School — js/home-video-preview.js
   ───────────────────────────────────────────────────────────────────
   PURPOSE
   ───────
   Fetches a dedicated "home preview" Google Sheet tab (CSV), takes
   the LAST 5 rows that contain a valid video URL, and displays them
   inside the .classroom-video-mock slot on index.html.

   • Users navigate manually with ‹ › arrow buttons and dot indicators.
   • Auto-rotation is disabled — videos play fully without interruption.
   • If only one valid video row exists, no navigation controls appear.
   • If the sheet is empty or unreachable the original placeholder is
     restored silently.
   • Uses GDRIVE_VIDEO.embedUrl() (gdrive-video.js) to normalise any
     Google Drive share URL into a /preview embed URL.

   ───────────────────────────────────────────────────────────────────
   LOAD ORDER (in index.html, before </body>)
   ──────────────────────────────────────────
     <script src="js/gdrive-video.js"></script>          ← must come first
     <script src="js/home-video-preview.js"></script>    ← this file

   ───────────────────────────────────────────────────────────────────
   GOOGLE SHEET FORMAT
   ───────────────────
   Header row (row 1) must have these column names:

     title      — display label shown below the iframe (optional)
     video_url  — full Google Drive share URL or bare file ID

   Add new videos at the bottom — the last 5 rows are always used.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG ──────────────────────────────────────────────────────── */
  var HOME_VIDEO_SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/' +
    '2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_' +
    '/pub?gid=175294299&single=true&output=csv';

  /* ── INTERNAL STATE ────────────────────────────────────────────────── */
  var videos       = [];   // [{title, embedUrl}, …] — last ≤5 valid rows
  var currentIndex = 0;
  var slot         = null; // the .classroom-video-mock DOM element

  /* ── PLACEHOLDER (restored on error / empty sheet) ─────────────────── */
  var PLACEHOLDER_HTML =
    '<div style="text-align:center;color:rgba(255,255,255,.25)">' +
      '<div style="font-size:3.5rem;margin-bottom:8px">&#x25B6;</div>' +
      '<div style="font-size:.85rem;font-weight:600">Sample Lesson Preview</div>' +
    '</div>';

  /* ── CSV PARSER ──────────────────────────────────────────────────────
     Minimal RFC-4180-compatible parser — no external dependencies.
  ─────────────────────────────────────────────────────────────────────── */
  function parseCsv(text) {
    var rows  = [];
    var row   = [];
    var field = '';
    var inQ   = false;
    var i = 0, len = text.length;

    while (i < len) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; }
          else { inQ = false; i++; }
        } else { field += ch; i++; }
      } else {
        if      (ch === '"')  { inQ = true; i++; }
        else if (ch === ',')  { row.push(field); field = ''; i++; }
        else if (ch === '\r' && text[i + 1] === '\n') {
          row.push(field); rows.push(row); row = []; field = ''; i += 2;
        }
        else if (ch === '\n') {
          row.push(field); rows.push(row); row = []; field = ''; i++;
        }
        else { field += ch; i++; }
      }
    }
    if (field || row.length) {
      row.push(field);
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
    }
    return rows;
  }

  /* ── SHEET → VIDEO OBJECTS ─────────────────────────────────────────── */
  function sheetToVideos(rows) {
    if (!rows || rows.length < 2) return [];

    var headers  = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var titleIdx = headers.indexOf('title');
    var urlIdx   = headers.indexOf('video_url');
    if (urlIdx === -1) urlIdx = headers.indexOf('url');
    if (urlIdx === -1) urlIdx = headers.indexOf('video');

    if (urlIdx === -1) {
      console.warn('[home-video-preview] No "video_url" column found. Headers:', headers);
      return [];
    }

    var valid = [];
    for (var r = 1; r < rows.length; r++) {
      var rawUrl = (rows[r][urlIdx] || '').trim();
      if (!rawUrl) continue;

      var embedUrl = (window.GDRIVE_VIDEO && window.GDRIVE_VIDEO.embedUrl)
        ? window.GDRIVE_VIDEO.embedUrl(rawUrl)
        : rawUrl;
      if (!embedUrl) continue;

      var title = titleIdx !== -1 ? (rows[r][titleIdx] || '').trim() : '';
      valid.push({ title: title, embedUrl: embedUrl });
    }

    return valid.slice(-5); // last 5 rows only
  }

  /* ── ESCAPE HELPER ──────────────────────────────────────────────────── */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/"/g,  '&quot;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;');
  }

  /* ── RENDER ONE VIDEO ───────────────────────────────────────────────
     Injects the iframe + manual nav controls for videos[idx].
  ─────────────────────────────────────────────────────────────────────── */
  function renderVideo(idx) {
    if (!slot || !videos.length) return;
    var v = videos[idx];

    var navHtml = '';
    if (videos.length > 1) {

      // Dot indicators — clickable
      var dotItems = '';
      for (var d = 0; d < videos.length; d++) {
        var bg = (d === idx) ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.3)';
        dotItems +=
          '<div onclick="window.__HVP_GO(' + d + ')" style="' +
            'width:9px;height:9px;border-radius:50%;cursor:pointer;' +
            'background:' + bg + ';transition:background .2s' +
          '"></div>';
      }

      // Arrow button shared styles
      var btn =
        'position:absolute;top:50%;transform:translateY(-50%);' +
        'background:rgba(0,0,0,.5);border:none;border-radius:50%;' +
        'width:36px;height:36px;cursor:pointer;color:#fff;' +
        'font-size:1.3rem;line-height:1;z-index:11;' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:background .2s;';

      navHtml =
        // Prev ‹
        '<button onclick="window.__HVP_PREV()" title="Previous video" style="' + btn + 'left:10px;">&#8249;</button>' +
        // Next ›
        '<button onclick="window.__HVP_NEXT()" title="Next video"     style="' + btn + 'right:10px;">&#8250;</button>' +
        // Dots row
        '<div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:10;">' +
          dotItems +
        '</div>';
    }

    // Label (title) sits just above the dots
    var labelHtml = v.title
      ? '<div style="' +
          'position:absolute;bottom:' + (videos.length > 1 ? '28px' : '10px') + ';' +
          'left:0;right:0;text-align:center;font-size:.75rem;' +
          'color:rgba(255,255,255,.55);pointer-events:none;' +
          'padding:0 48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
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
      navHtml;
  }

  /* ── MANUAL NAVIGATION HANDLERS (attached to window for onclick) ──── */
  window.__HVP_GO = function (idx) {
    if (!videos.length) return;
    currentIndex = ((idx % videos.length) + videos.length) % videos.length;
    renderVideo(currentIndex);
  };
  window.__HVP_PREV = function () { window.__HVP_GO(currentIndex - 1); };
  window.__HVP_NEXT = function () { window.__HVP_GO(currentIndex + 1); };

  /* ── LOADING SPINNER ────────────────────────────────────────────────── */
  function showSpinner() {
    if (!slot) return;
    slot.innerHTML =
      '<div style="text-align:center;color:rgba(255,255,255,.35)">' +
        '<div style="' +
          'width:36px;height:36px;border:3px solid rgba(255,255,255,.15);' +
          'border-top-color:rgba(255,255,255,.7);border-radius:50%;' +
          'animation:hvpSpin .8s linear infinite;margin:0 auto 10px' +
        '"></div>' +
        '<div style="font-size:.78rem">Loading preview\u2026</div>' +
      '</div>' +
      '<style id="hvp-spin-style">@keyframes hvpSpin{to{transform:rotate(360deg)}}</style>';
  }

  /* ── MAIN INIT ──────────────────────────────────────────────────────── */
  function init() {
    slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;

    showSpinner();

    fetch(HOME_VIDEO_SHEET_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (csvText) {
        videos = sheetToVideos(parseCsv(csvText));
        if (!videos.length) { slot.innerHTML = PLACEHOLDER_HTML; return; }
        currentIndex = 0;
        renderVideo(currentIndex);
      })
      .catch(function (err) {
        console.warn('[home-video-preview] Could not load sheet:', err);
        slot.innerHTML = PLACEHOLDER_HTML;
      });
  }

  /* ── BOOT ────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
