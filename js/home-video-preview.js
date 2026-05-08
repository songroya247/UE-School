/* ═══════════════════════════════════════════════════════════════════
   UE School — js/home-video-preview.js
   ───────────────────────────────────────────────────────────────────
   FIXES IN THIS VERSION
   ─────────────────────
   1. SWIPE SUPPORT — touch swipe left/right switches videos on mobile.
   2. POOR NETWORK / DRIVE PROMPT BLOCKED — the iframe is hidden behind
      a branded loading overlay while the video buffers. The Drive
      "download" UI never shows because the iframe is invisible until
      the video fires its first "load" event. If it takes > 12 s the
      overlay shows a friendly "Poor connection" message instead of the
      Drive error screen.

   LOAD ORDER in index.html:
     <script src="js/gdrive-video.js"></script>
     <script src="js/home-video-preview.js"></script>

   GOOGLE SHEET columns: title (optional) | video_url (required)
   Add new rows at the bottom — last 5 rows with a URL are used.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────────────── */
  var HOME_VIDEO_SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/' +
    '2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_' +
    '/pub?gid=175294299&single=true&output=csv';

  // Max ms to wait for iframe "load" before showing poor-network message
  var LOAD_TIMEOUT_MS = 12000;

  /* ── STATE ──────────────────────────────────────────────────────── */
  var videos       = [];
  var currentIndex = 0;
  var slot         = null;
  var loadTimer    = null;

  /* ── PLACEHOLDER ────────────────────────────────────────────────── */
  var PLACEHOLDER_HTML =
    '<div style="text-align:center;color:rgba(255,255,255,.25)">' +
      '<div style="font-size:3.5rem;margin-bottom:8px">&#x25B6;</div>' +
      '<div style="font-size:.85rem;font-weight:600">Sample Lesson Preview</div>' +
    '</div>';

  /* ── CSV PARSER ─────────────────────────────────────────────────── */
  function parseCsv(text) {
    var rows = [], row = [], field = '', inQ = false, i = 0, len = text.length;
    while (i < len) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; }
          else { inQ = false; i++; }
        } else { field += ch; i++; }
      } else {
        if      (ch === '"')  { inQ = true; i++; }
        else if (ch === ',')  { row.push(field); field = ''; i++; }
        else if (ch === '\r' && text[i+1] === '\n') {
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
      if (row.some(function(c){ return c.trim() !== ''; })) rows.push(row);
    }
    return rows;
  }

  /* ── URL RESOLVER ──────────────────────────────────────────────────
     Detects whether a raw URL is YouTube or Google Drive and returns
     the correct embeddable URL for each.

     YouTube formats supported:
       https://www.youtube.com/watch?v=VIDEO_ID
       https://youtu.be/VIDEO_ID
       https://www.youtube.com/shorts/VIDEO_ID
       https://www.youtube.com/embed/VIDEO_ID  (already embed — params appended)

     YouTube embed params applied:
       rel=0             — no "related videos" panel at the end
       modestbranding=1  — hides YouTube logo in the control bar
       controls=1        — keeps scrub bar, volume, fullscreen

     Google Drive: handled by existing GDRIVE_VIDEO.embedUrl().
  ─────────────────────────────────────────────────────────────────── */
  function resolveEmbedUrl(rawUrl) {
    var s = (rawUrl || '').trim();
    if (!s) return '';

    var YT_PARAMS = '?rel=0&modestbranding=1&controls=1';

    // Already a YouTube embed URL — just add our params
    if (s.indexOf('youtube.com/embed/') !== -1) {
      return s + (s.indexOf('?') !== -1 ? '&' : '?') + 'rel=0&modestbranding=1&controls=1';
    }

    var m;

    // youtu.be/VIDEO_ID
    m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + YT_PARAMS;

    // youtube.com/watch?v=VIDEO_ID  or  ?v=  anywhere in query string
    m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + YT_PARAMS;

    // youtube.com/shorts/VIDEO_ID
    m = s.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + YT_PARAMS;

    // Google Drive — delegate to existing helper
    if (window.GDRIVE_VIDEO && window.GDRIVE_VIDEO.embedUrl) {
      return window.GDRIVE_VIDEO.embedUrl(s) || s;
    }

    return s; // unknown format — pass through as-is
  }

  /* ── SHEET → VIDEO OBJECTS ──────────────────────────────────────── */
  function sheetToVideos(rows) {
    if (!rows || rows.length < 2) return [];
    var headers  = rows[0].map(function(h){ return h.trim().toLowerCase(); });
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
      var embedUrl = resolveEmbedUrl(rawUrl);
      if (!embedUrl) continue;
      var title = titleIdx !== -1 ? (rows[r][titleIdx] || '').trim() : '';
      valid.push({ title: title, embedUrl: embedUrl });
    }
    return valid.slice(-5);
  }

  /* ── ESCAPE HELPER ──────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
                    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── OVERLAY HELPERS ────────────────────────────────────────────────
     The overlay sits on top of the (invisible) iframe and shows a
     branded spinner. Once the iframe loads it fades out, revealing
     the video cleanly — the Drive "download" UI is never seen.
  ─────────────────────────────────────────────────────────────────── */
  function showOverlay(message) {
    var ov = slot.querySelector('#hvp-overlay');
    if (!ov) return;
    ov.innerHTML = message;
    ov.style.opacity = '1';
    ov.style.pointerEvents = 'auto';
  }

  function hideOverlay() {
    var ov = slot.querySelector('#hvp-overlay');
    if (!ov) return;
    ov.style.transition = 'opacity .5s';
    ov.style.opacity = '0';
    ov.style.pointerEvents = 'none';
  }

  function spinnerMsg(text) {
    return (
      '<div style="text-align:center;color:rgba(255,255,255,.75)">' +
        '<div style="' +
          'width:38px;height:38px;border:3px solid rgba(255,255,255,.15);' +
          'border-top-color:rgba(255,255,255,.8);border-radius:50%;' +
          'animation:hvpSpin .8s linear infinite;margin:0 auto 12px' +
        '"></div>' +
        '<div style="font-size:.82rem;font-weight:600">' + text + '</div>' +
      '</div>'
    );
  }

  function poorNetworkMsg(title) {
    return (
      '<div style="text-align:center;color:rgba(255,255,255,.7);padding:0 20px">' +
        '<div style="font-size:2rem;margin-bottom:8px">&#128246;</div>' +
        '<div style="font-size:.88rem;font-weight:700;margin-bottom:6px">Slow connection detected</div>' +
        '<div style="font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:14px">' +
          (title ? escapeHtml(title) : 'Video') + ' will play once loaded' +
        '</div>' +
        '<button onclick="window.__HVP_RETRY()" style="' +
          'background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);' +
          'color:#fff;border-radius:6px;padding:6px 18px;cursor:pointer;font-size:.8rem' +
        '">Retry</button>' +
      '</div>'
    );
  }

  /* ── RENDER ONE VIDEO ───────────────────────────────────────────────
     Structure:
       slot (position:relative)
         ├─ iframe          (hidden under overlay until loaded)
         ├─ #hvp-overlay    (branded spinner / poor-network msg)
         ├─ label div       (video title)
         └─ nav div         (arrows + dots) — only if 2+ videos
  ─────────────────────────────────────────────────────────────────── */
  function renderVideo(idx) {
    if (!slot || !videos.length) return;
    clearTimeout(loadTimer);

    var v = videos[idx];

    /* — Navigation HTML (arrows + dots) — */
    var navHtml = '';
    if (videos.length > 1) {
      var dotItems = '';
      for (var d = 0; d < videos.length; d++) {
        var bg = (d === idx) ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.3)';
        dotItems +=
          '<div onclick="window.__HVP_GO(' + d + ')" style="' +
            'width:9px;height:9px;border-radius:50%;cursor:pointer;' +
            'background:' + bg + ';transition:background .2s' +
          '"></div>';
      }
      var btnBase =
        'position:absolute;top:50%;transform:translateY(-50%);' +
        'background:rgba(0,0,0,.5);border:none;border-radius:50%;' +
        'width:36px;height:36px;cursor:pointer;color:#fff;' +
        'font-size:1.3rem;line-height:1;z-index:12;' +
        'display:flex;align-items:center;justify-content:center;';
      navHtml =
        '<button onclick="window.__HVP_PREV()" title="Previous" style="' + btnBase + 'left:10px;">&#8249;</button>' +
        '<button onclick="window.__HVP_NEXT()" title="Next"     style="' + btnBase + 'right:10px;">&#8250;</button>' +
        '<div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:12;">' +
          dotItems +
        '</div>';
    }

    /* — Title label — */
    var labelHtml = v.title
      ? '<div style="' +
          'position:absolute;bottom:' + (videos.length > 1 ? '28px' : '10px') + ';' +
          'left:0;right:0;text-align:center;font-size:.75rem;' +
          'color:rgba(255,255,255,.55);pointer-events:none;' +
          'padding:0 52px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:12' +
        '">' + escapeHtml(v.title) + '</div>'
      : '';

    /* — Assemble — */
    slot.innerHTML =
      /* iframe: starts invisible; overlay hides Drive UI until ready */
      '<iframe id="hvp-frame"' +
        ' src="' + v.embedUrl + '"' +
        ' style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;opacity:0;"' +
        ' allow="autoplay; encrypted-media"' +
        ' allowfullscreen' +
        ' title="' + escapeHtml(v.title || 'Featured Lesson') + '"' +
      '></iframe>' +

      /* overlay — sits above iframe, removed once video loads */
      '<div id="hvp-overlay" style="' +
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background:#0d1117;border-radius:inherit;' +
        'display:flex;align-items:center;justify-content:center;' +
        'z-index:11;opacity:1;' +
      '">' +
        spinnerMsg('Loading video\u2026') +
      '</div>' +

      /* keyframes (injected once) */
      '<style id="hvp-style">' +
        '@keyframes hvpSpin{to{transform:rotate(360deg)}}' +
      '</style>' +

      labelHtml +
      navHtml;

    /* — Wire iframe load event — */
    var frame = slot.querySelector('#hvp-frame');
    frame.addEventListener('load', function () {
      clearTimeout(loadTimer);
      // Fade in iframe, fade out overlay
      frame.style.transition = 'opacity .4s';
      frame.style.opacity    = '1';
      hideOverlay();
    });

    /* — Poor-network timeout — */
    loadTimer = setTimeout(function () {
      showOverlay(poorNetworkMsg(v.title));
    }, LOAD_TIMEOUT_MS);

    /* — Attach swipe listeners to slot — */
    attachSwipe(slot);
  }

  /* ── SWIPE SUPPORT ──────────────────────────────────────────────────
     Detects left/right touch swipes on the slot element.
     Threshold: 40 px horizontal movement, < 80 px vertical drift.
     The iframe captures touch events so we listen on the OVERLAY
     and the nav layer, which sit above the iframe.
  ─────────────────────────────────────────────────────────────────── */
  var swipeStartX = null;
  var swipeStartY = null;

  function attachSwipe(el) {
    // Remove previous listeners by cloning the overlay + nav wrapper
    // (the iframe itself swallows touches — overlay is always on top)
    el.removeEventListener('touchstart', onTouchStart, { passive: true });
    el.removeEventListener('touchend',   onTouchEnd);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend',   onTouchEnd);
  }

  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (swipeStartX === null) return;
    if (!e.changedTouches || !e.changedTouches[0]) return;
    var dx = e.changedTouches[0].clientX - swipeStartX;
    var dy = e.changedTouches[0].clientY - swipeStartY;
    swipeStartX = null;
    swipeStartY = null;
    if (Math.abs(dx) < 40 || Math.abs(dy) > 80) return; // not a clean swipe
    if (dx < 0) window.__HVP_NEXT(); // swipe left  → next
    else         window.__HVP_PREV(); // swipe right → prev
  }

  /* ── NAVIGATION HANDLERS ────────────────────────────────────────── */
  window.__HVP_GO = function (idx) {
    if (!videos.length) return;
    currentIndex = ((idx % videos.length) + videos.length) % videos.length;
    renderVideo(currentIndex);
  };
  window.__HVP_PREV   = function () { window.__HVP_GO(currentIndex - 1); };
  window.__HVP_NEXT   = function () { window.__HVP_GO(currentIndex + 1); };
  window.__HVP_RETRY  = function () { renderVideo(currentIndex); };

  /* ── INITIAL SPINNER (before sheet fetch) ───────────────────────── */
  function showSpinner() {
    if (!slot) return;
    slot.innerHTML =
      '<div style="text-align:center;color:rgba(255,255,255,.35)">' +
        '<div style="' +
          'width:36px;height:36px;border:3px solid rgba(255,255,255,.15);' +
          'border-top-color:rgba(255,255,255,.7);border-radius:50%;' +
          'animation:hvpSpin .8s linear infinite;margin:0 auto 10px' +
        '"></div>' +
        '<div style="font-size:.78rem">Loading\u2026</div>' +
      '</div>' +
      '<style id="hvp-style">@keyframes hvpSpin{to{transform:rotate(360deg)}}</style>';
  }

  /* ── MAIN INIT ──────────────────────────────────────────────────── */
  function init() {
    slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;
    showSpinner();

    fetch(HOME_VIDEO_SHEET_CSV_URL)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(csvText) {
        videos = sheetToVideos(parseCsv(csvText));
        if (!videos.length) { slot.innerHTML = PLACEHOLDER_HTML; return; }
        currentIndex = 0;
        renderVideo(currentIndex);
      })
      .catch(function(err) {
        console.warn('[home-video-preview] Sheet fetch failed:', err);
        slot.innerHTML = PLACEHOLDER_HTML;
      });
  }

  /* ── BOOT ───────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();


/* ═══════════════════════════════════════════════════════════════════
   FLOATING VIDEO PIP — v4: single iframe, DOM move, slot preserved
   ───────────────────────────────────────────────────────────────────
   ONE iframe element is physically relocated so playback never
   interrupts. The slot is never left broken — a transparent placeholder
   div occupies its space while the iframe is in the pip, so the page
   layout and all existing JS (overlay, nav, swipe) stay intact.

   Flow:
     scroll OUT  → drop a placeholder into slot, move iframe → pip shell
     scroll IN   → remove placeholder, move iframe → back into slot
     ✕ button    → pip hides visually; iframe stays in pip until
                   user scrolls back to slot (then silently returned)
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var pip         = null;
  var placeholder = null;   // transparent div that keeps slot layout intact
  var frameInPip  = false;
  var dismissed   = false;

  /* ── Build the pip shell ────────────────────────────────────────── */
  function buildPip() {
    if (document.getElementById('hvp-pip')) {
      pip = document.getElementById('hvp-pip');
      return;
    }
    pip = document.createElement('div');
    pip.id = 'hvp-pip';

    var closeBtn = document.createElement('button');
    closeBtn.id        = 'hvp-pip-close';
    closeBtn.title     = 'Close';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.addEventListener('click', function () {
      dismissed = true;
      pip.classList.remove('hvp-pip--visible');
    });

    var label = document.createElement('div');
    label.id          = 'hvp-pip-label';
    label.textContent = 'Now Playing';

    pip.appendChild(closeBtn);
    pip.appendChild(label);
    document.body.appendChild(pip);
  }

  /* ── Build the invisible placeholder that holds the slot's space ── */
  function buildPlaceholder() {
    if (placeholder) return;
    placeholder = document.createElement('div');
    /* Fills slot exactly — slot is position:relative so this works */
    placeholder.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'background:transparent;pointer-events:none;';
  }

  /* ── Get the live iframe — slot first, then pip (video switch case) */
  function getSlotFrame() {
    var slot  = document.querySelector('.classroom-video-mock');
    var frame = slot ? slot.querySelector('iframe#hvp-frame') : null;
    if (!frame && pip) frame = pip.querySelector('iframe#hvp-frame');
    return frame || null;
  }

  /* ── Move iframe into pip ───────────────────────────────────────── */
  function moveToPip() {
    if (frameInPip) { pip.classList.add('hvp-pip--visible'); return; }

    var slot  = document.querySelector('.classroom-video-mock');
    var frame = getSlotFrame();
    if (!slot || !frame) return;   // video not loaded yet — skip

    /* 1. Drop placeholder into slot so layout/existing JS stays intact */
    buildPlaceholder();
    slot.insertBefore(placeholder, slot.firstChild);

    /* 2. Style the iframe to fill the pip shell */
    frame.style.position = 'absolute';
    frame.style.top      = '0';
    frame.style.left     = '0';
    frame.style.width    = '100%';
    frame.style.height   = '100%';
    frame.style.opacity  = '1';

    /* 3. Move iframe node into pip — no src change → no reload */
    pip.insertBefore(frame, pip.firstChild);
    frameInPip = true;

    /* 4. Update label */
    var labelEl = document.getElementById('hvp-pip-label');
    if (labelEl) {
      var titleEl = slot.querySelector('div[style*="bottom"]');
      labelEl.textContent =
        (titleEl && titleEl.textContent.trim()) ? titleEl.textContent.trim() : 'Now Playing';
    }

    pip.classList.add('hvp-pip--visible');
  }

  /* ── Move iframe back to slot ───────────────────────────────────── */
  function moveToSlot() {
    pip.classList.remove('hvp-pip--visible');
    dismissed = false;
    if (!frameInPip) return;

    var slot  = document.querySelector('.classroom-video-mock');
    var frame = pip.querySelector('iframe');
    if (!slot || !frame) return;

    /* 1. Return iframe to slot as first child (original position) */
    slot.insertBefore(frame, slot.firstChild);

    /* 2. Remove placeholder */
    if (placeholder && placeholder.parentNode === slot) {
      slot.removeChild(placeholder);
    }

    frameInPip = false;
  }

  /* ── IntersectionObserver ───────────────────────────────────────── */
  function setupObserver() {
    var slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) {
        if (!dismissed) moveToPip();
      } else {
        moveToSlot();
      }
    }, { threshold: 0, rootMargin: '0px' });

    io.observe(slot);
  }

  /* ── MutationObserver: handle video switch while pip is showing ────
     renderVideo() calls slot.innerHTML = '...' which wipes the slot
     entirely. If the iframe is in the pip when this fires, a fresh
     iframe lands in the slot while the old one is still in pip —
     frameInPip goes stale. We watch for that, discard the stale pip
     iframe, reset state, and re-trigger moveToPip for the new video.
  ─────────────────────────────────────────────────────────────────── */
  function watchForVideoSwitch() {
    var slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;

    var mo = new MutationObserver(function () {
      if (!frameInPip) return;
      var freshFrame = slot.querySelector('iframe#hvp-frame');
      if (!freshFrame) return;
      /* New iframe in slot while old one is in pip — clean up */
      var stale = pip.querySelector('iframe');
      if (stale) pip.removeChild(stale);
      if (placeholder && placeholder.parentNode === slot) {
        slot.removeChild(placeholder);
      }
      frameInPip = false;
      setTimeout(function () { if (!dismissed) moveToPip(); }, 50);
    });

    mo.observe(slot, { childList: true });
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  function init() {
    setTimeout(function () {
      buildPip();
      setupObserver();
      watchForVideoSwitch();
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
