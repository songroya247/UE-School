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
   3. DRIVE MOBILE FIX — Google Drive's /preview player switches to a
      compact layout on mobile (progress bar at top, controls clipped)
      when the rendered iframe is narrower than ~480 px. Fix: render the
      Drive iframe at 1280×720 logical pixels and CSS-scale it down to
      fill the container. Drive sees a desktop viewport and keeps its
      full-size control layout. A ResizeObserver recalculates the scale
      on orientation change. ?rm=minimal strips Drive's top chrome bar.
      YouTube iframes keep the simple 100%×100% fill (their compact
      layout keeps controls at the bottom even on narrow screens).
   4. DRIVE LOAD RELIABILITY — Drive iframes on Android Chrome do not
      always fire the "load" event reliably (especially when Drive
      shows a sign-in or download prompt before the player). A 3-second
      fallback unconditionally reveals the iframe so the overlay never
      gets permanently stuck. The 12-second "poor network" message path
      is kept as a last resort.

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

  // Drive iframes on mobile may not fire "load" reliably.
  // After this many ms, unconditionally reveal the iframe anyway.
  var DRIVE_REVEAL_MS = 3000;

  /* ── DRIVE SCALE CONSTANTS ──────────────────────────────────────── */
  // Render Drive iframes at this logical size so Drive uses its full
  // desktop control layout, then CSS-scale down to fit the container.
  var DRIVE_W = 1280;
  var DRIVE_H = 720;

  /* ── STATE ──────────────────────────────────────────────────────── */
  var videos       = [];
  var currentIndex = 0;
  var slot         = null;
  var loadTimer    = null;
  var revealTimer  = null;  // Drive-specific 3-second unconditional reveal
  var currentRO    = null;  // active ResizeObserver (Drive only)

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

     Google Drive: handled by existing GDRIVE_VIDEO.embedUrl(), then
     ?rm=minimal is appended to strip Drive's top chrome bar.
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

    // Google Drive — delegate to existing helper, then add ?rm=minimal
    if (window.GDRIVE_VIDEO && window.GDRIVE_VIDEO.embedUrl) {
      var driveUrl = window.GDRIVE_VIDEO.embedUrl(s) || '';
      if (driveUrl) {
        // Append ?rm=minimal (strips Drive's top chrome bar so the full
        // height is used for the video and controls)
        return driveUrl + (driveUrl.indexOf('?') !== -1 ? '&' : '?') + 'rm=minimal';
      }
    }

    return s; // unknown format — pass through as-is
  }

  /* ── DRIVE URL DETECTOR ─────────────────────────────────────────── */
  function isDriveUrl(embedUrl) {
    return embedUrl.indexOf('drive.google.com') !== -1;
  }

  /* ── DRIVE SCALE HELPERS ────────────────────────────────────────── */
  function applyDriveScale(iframe, container) {
    var cw = container.offsetWidth;
    var ch = container.offsetHeight;
    if (!cw || !ch) return;
    var scale = Math.min(cw / DRIVE_W, ch / DRIVE_H);
    var left  = (cw - DRIVE_W * scale) / 2;
    var top   = (ch - DRIVE_H * scale) / 2;
    // Preserve opacity from whatever state the iframe is in
    var currentOpacity = iframe.style.opacity || '0';
    iframe.style.cssText = [
      'position:absolute',
      'border:none',
      'width:'  + DRIVE_W + 'px',
      'height:' + DRIVE_H + 'px',
      'left:'   + left + 'px',
      'top:'    + top  + 'px',
      'transform:scale(' + scale + ')',
      'transform-origin:top left',
      'opacity:' + currentOpacity,
    ].join(';');
  }

  function revealFrame(frame) {
    frame.style.transition = 'opacity .4s';
    frame.style.opacity    = '1';
    hideOverlay();
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

  /* ── OVERLAY HELPERS ────────────────────────────────────────────── */
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

     DRIVE vs YOUTUBE sizing:
       YouTube — simple position:absolute;width:100%;height:100%.
       Drive   — rendered at DRIVE_W×DRIVE_H logical pixels, then
                 CSS-scaled down via applyDriveScale(). Prevents
                 Drive's compact mobile layout.
  ─────────────────────────────────────────────────────────────────── */
  function renderVideo(idx) {
    if (!slot || !videos.length) return;

    // Clear previous timers and ResizeObserver
    clearTimeout(loadTimer);
    clearTimeout(revealTimer);
    if (currentRO) { currentRO.disconnect(); currentRO = null; }

    var v = videos[idx];
    var drive = isDriveUrl(v.embedUrl);

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

    /* — iframe inline style —
         Drive: start at 1280×720 with scale; JavaScript sets exact
                values via applyDriveScale() right after innerHTML.
         YouTube: simple absolute fill.
    — */
    var iframeStyle = drive
      ? 'position:absolute;border:none;opacity:0;'          // size set by applyDriveScale()
      : 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;opacity:0;';

    /* — Assemble — */
    slot.innerHTML =
      '<iframe id="hvp-frame"' +
        ' src="' + v.embedUrl + '"' +
        ' style="' + iframeStyle + '"' +
        ' allow="autoplay; encrypted-media"' +
        ' allowfullscreen' +
        ' title="' + escapeHtml(v.title || 'Featured Lesson') + '"' +
      '></iframe>' +

      '<div id="hvp-overlay" style="' +
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background:#0d1117;border-radius:inherit;' +
        'display:flex;align-items:center;justify-content:center;' +
        'z-index:11;opacity:1;' +
      '">' +
        spinnerMsg('Loading video\u2026') +
      '</div>' +

      '<style id="hvp-style">' +
        '@keyframes hvpSpin{to{transform:rotate(360deg)}}' +
      '</style>' +

      labelHtml +
      navHtml;

    /* — Apply Drive scale immediately after innerHTML is set — */
    var frame = slot.querySelector('#hvp-frame');

    if (drive) {
      applyDriveScale(frame, slot);

      // Re-apply scale on orientation change / resize
      if (typeof ResizeObserver !== 'undefined') {
        currentRO = new ResizeObserver(function () {
          applyDriveScale(frame, slot);
        });
        currentRO.observe(slot);
      }

      // Drive "load" event on Android Chrome is unreliable — the event
      // may fire for an intermediate redirect page (sign-in, download
      // prompt) rather than the actual video player. Reveal the iframe
      // after DRIVE_REVEAL_MS unconditionally so the overlay never gets
      // permanently stuck. The load event can still fire earlier.
      revealTimer = setTimeout(function () {
        revealTimer = null;
        revealFrame(frame);
      }, DRIVE_REVEAL_MS);
    }

    /* — Wire iframe load event (works reliably for YouTube; bonus for Drive) — */
    frame.addEventListener('load', function () {
      // For Drive: cancel the unconditional reveal timer; load event beat it
      clearTimeout(revealTimer);
      revealTimer = null;
      clearTimeout(loadTimer);
      revealFrame(frame);
    });

    /* — Poor-network timeout (last resort) — */
    loadTimer = setTimeout(function () {
      showOverlay(poorNetworkMsg(v.title));
    }, LOAD_TIMEOUT_MS);

    /* — Attach swipe listeners to slot — */
    attachSwipe(slot);
  }

  /* ── SWIPE SUPPORT ─────────────────────────────────────────────── */
  var swipeStartX = null;
  var swipeStartY = null;

  function attachSwipe(el) {
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
    if (Math.abs(dx) < 40 || Math.abs(dy) > 80) return;
    if (dx < 0) window.__HVP_NEXT();
    else         window.__HVP_PREV();
  }

  /* ── NAVIGATION HANDLERS ─────────────────────────────────────────── */
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
   FLOATING VIDEO PIP — scroll-away widget
   ───────────────────────────────────────────────────────────────────
   Surgically self-contained. Reads the LIVE src from the iframe that
   the code above already manages, then mirrors it in a fixed pip div.
   Activates when .classroom-video-mock scrolls fully out of view.
   Closes via ✕ button or when the original scrolls back into view.
   Zero changes to existing code above.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var pip        = null;
  var pipIframe  = null;
  var dismissed  = false;
  var observer   = null;

  function buildPip() {
    if (document.getElementById('hvp-pip')) return;

    pip = document.createElement('div');
    pip.id = 'hvp-pip';

    var closeBtn = document.createElement('button');
    closeBtn.id = 'hvp-pip-close';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.addEventListener('click', function () {
      dismissed = true;
      hidePip();
    });

    var label = document.createElement('div');
    label.id = 'hvp-pip-label';
    label.textContent = 'Now Playing';

    pipIframe = document.createElement('iframe');
    pipIframe.allow = 'autoplay; encrypted-media';
    pipIframe.allowFullscreen = true;

    pip.appendChild(pipIframe);
    pip.appendChild(closeBtn);
    pip.appendChild(label);
    document.body.appendChild(pip);
  }

  function showPip(src, title) {
    if (!pip) buildPip();
    if (pipIframe.src !== src) {
      pipIframe.src = src;
    }
    var label = document.getElementById('hvp-pip-label');
    if (label) label.textContent = title || 'Now Playing';
    pip.classList.add('hvp-pip--visible');
  }

  function hidePip() {
    if (!pip) return;
    pip.classList.remove('hvp-pip--visible');
  }

  function getLiveVideoInfo() {
    var slot = document.querySelector('.classroom-video-mock');
    if (!slot) return null;
    var frame = slot.querySelector('iframe');
    if (!frame || !frame.src) return null;
    var titleEl = slot.querySelector('div[style*="bottom"]');
    var title = titleEl ? titleEl.textContent.trim() : 'Now Playing';
    return { src: frame.src, title: title };
  }

  function setupObserver() {
    var slot = document.querySelector('.classroom-video-mock');
    if (!slot) return;

    observer = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      if (!entry.isIntersecting) {
        var info = getLiveVideoInfo();
        if (info) {
          dismissed = false;
          showPip(info.src, info.title);
        }
      } else {
        dismissed = false;
        hidePip();
      }
    }, {
      threshold: 0,
      rootMargin: '0px'
    });

    observer.observe(slot);
  }

  function init() {
    setTimeout(function () {
      buildPip();
      setupObserver();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
