/* ═══════════════════════════════════════════════════════════════════
   UE School — js/home-video-preview.js  (v2 — Drive mobile fix)
   ───────────────────────────────────────────────────────────────────

   Injects the sample lesson preview iframe into .classroom-video-mock
   on the home page.

   FEATURES
   ─────────
   • Lazy loading via IntersectionObserver — the iframe is only created
     when the section scrolls near the viewport, so it never blocks the
     initial page render.
   • Drive mobile fix — same applyDriveScale() technique used in
     classroom.js. Renders the iframe at 1280×720 logical pixels then
     CSS-scales it down. Prevents Drive's compact mobile layout (progress
     bar at top, controls clipped).
   • ?rm=minimal appended to Drive URLs — strips the top chrome bar.
   • ResizeObserver keeps the scale correct on orientation change.
   • Graceful fallback if IntersectionObserver isn't available (unlikely
     but possible on very old WebViews).

   CONFIGURATION
   ─────────────
   Set window.UE_CONFIG.HOME_PREVIEW_VIDEO in js/config.js:

     UE_CONFIG.HOME_PREVIEW_VIDEO = {
       type:    'drive',          // 'drive' | 'youtube'
       id:      'YOUR_FILE_ID',   // Google Drive file ID
     };

   Or for YouTube:
     UE_CONFIG.HOME_PREVIEW_VIDEO = { type: 'youtube', id: 'dQw4w9WgXcQ' };

   If HOME_PREVIEW_VIDEO is not set, the placeholder stays visible.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Drive scale constants (must match classroom.js) ── */
  var DRIVE_W = 1280;
  var DRIVE_H = 720;

  function applyDriveScale(iframe, container) {
    var cw = container.offsetWidth;
    var ch = container.offsetHeight;
    if (!cw || !ch) return;
    var scale = Math.min(cw / DRIVE_W, ch / DRIVE_H);
    var left  = (cw - DRIVE_W * scale) / 2;
    var top   = (ch - DRIVE_H * scale) / 2;
    iframe.style.cssText = [
      'position:absolute',
      'border:none',
      'width:'  + DRIVE_W + 'px',
      'height:' + DRIVE_H + 'px',
      'left:'   + left + 'px',
      'top:'    + top  + 'px',
      'transform:scale(' + scale + ')',
      'transform-origin:top left',
    ].join(';');
  }

  function buildSrc(cfg) {
    if (!cfg || !cfg.id) return '';
    if (cfg.type === 'youtube') {
      return 'https://www.youtube.com/embed/' + cfg.id
           + '?rel=0&modestbranding=1&playsinline=1&mute=1&autoplay=1';
    }
    // Default: Google Drive
    return 'https://drive.google.com/file/d/' + cfg.id + '/preview?rm=minimal';
  }

  function injectVideo(container, cfg) {
    var src = buildSrc(cfg);
    if (!src) return;

    var isDrive = !cfg.type || cfg.type === 'drive';

    // Prepare container — must be position:relative with overflow:hidden
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    // Hide the static placeholder
    var placeholder = container.querySelector('[data-vp-placeholder]')
                   || container.firstElementChild;
    if (placeholder) {
      placeholder.style.transition = 'opacity .4s';
      placeholder.style.opacity = '0';
      setTimeout(function () { placeholder.style.display = 'none'; }, 400);
    }

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.setAttribute('loading', 'lazy');

    if (isDrive) {
      applyDriveScale(iframe, container);

      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function () {
          applyDriveScale(iframe, container);
        });
        ro.observe(container);
      }
    } else {
      // YouTube: simple absolute fill
      iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none';
    }

    container.appendChild(iframe);
  }

  function init() {
    var container = document.querySelector('.classroom-video-mock');
    if (!container) return;

    var cfg = (window.UE_CONFIG && window.UE_CONFIG.HOME_PREVIEW_VIDEO) || null;
    if (!cfg || !cfg.id) return; // no video configured — leave placeholder

    /* ── Lazy load via IntersectionObserver ── */
    if (typeof IntersectionObserver !== 'undefined') {
      var observer = new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          injectVideo(container, cfg);
        }
      }, { rootMargin: '200px' }); // start loading 200px before it enters view
      observer.observe(container);
    } else {
      // Fallback: inject immediately
      injectVideo(container, cfg);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
