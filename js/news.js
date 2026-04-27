/* ════════════════════════════════════════════════════════════════
   UE School — Education news strip                          v3.1.0
   ────────────────────────────────────────────────────────────────
   Renders the dashboard's "Education News & Updates" section and
   (optionally) a slim ticker on every other authenticated page.
   The data source is UE_CONFIG.NEWS_ITEMS; if UE_CONFIG.NEWS_FEED_URL
   is set we also try to fetch + merge a remote JSON feed at the same
   shape, silently falling back to NEWS_ITEMS on any error.
   ──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _cfg() { return window.UE_CONFIG || {}; }
  function _items() { return Array.isArray(_cfg().NEWS_ITEMS) ? _cfg().NEWS_ITEMS.slice() : []; }
  function _url() { return String(_cfg().NEWS_FEED_URL || '').trim(); }

  // Sort newest-first by ISO date. Items without a parseable date
  // sink to the bottom so they don't break the visual order.
  function sortItems(items) {
    return items.sort(function (a, b) {
      var da = Date.parse(a.date || '') || 0;
      var db = Date.parse(b.date || '') || 0;
      return db - da;
    });
  }

  // Friendly relative date — "Today", "Yesterday", "3 days ago",
  // then falls back to "Apr 15, 2026" once it's older than a week.
  function relDate(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!t) return iso;
    var d  = new Date(t);
    var ms = Date.now() - t;
    var day = 86400000;
    if (ms < day && d.getDate() === new Date().getDate()) return 'Today';
    if (ms < 2 * day) return 'Yesterday';
    if (ms < 7 * day) return Math.floor(ms / day) + ' days ago';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Tag → colour. Anything not in the map gets the neutral palette,
  // so adding new tags in config.js never breaks the layout.
  var TAG_COLOURS = {
    'JAMB':       { bg: '#dbeafe', fg: '#1d4ed8' },
    'WAEC':       { bg: '#fef3c7', fg: '#a16207' },
    'NECO':       { bg: '#ede9fe', fg: '#6d28d9' },
    'UE School':  { bg: '#d1fae5', fg: '#065f46' },
    'Post-UTME':  { bg: '#fce7f3', fg: '#a21caf' },
  };
  function tagPill(tag) {
    var c = TAG_COLOURS[tag] || { bg: '#f1f5f9', fg: '#475569' };
    return '<span class="ue-news-tag" style="background:' + c.bg + ';color:' + c.fg + '">' + escape(tag || 'News') + '</span>';
  }

  function cardHTML(item) {
    var link = item.link ? escape(item.link) : '';
    var isExternal = /^https?:\/\//i.test(link);
    var anchorOpen  = link
      ? '<a class="ue-news-card-link" href="' + link + '"' + (isExternal ? ' target="_blank" rel="noopener"' : '') + '>'
      : '<div class="ue-news-card-link">';
    var anchorClose = link ? '</a>' : '</div>';

    return ''
      + '<article class="ue-news-card">'
      +   anchorOpen
      +     '<div class="ue-news-meta">'
      +       tagPill(item.tag)
      +       '<span class="ue-news-date">' + escape(relDate(item.date)) + '</span>'
      +     '</div>'
      +     '<h3 class="ue-news-title">' + escape(item.title || 'Untitled update') + '</h3>'
      +     '<p class="ue-news-body">' + escape(item.body || '') + '</p>'
      +     (item.source ? '<div class="ue-news-source">' + escape(item.source) + '</div>' : '')
      +     (link ? '<div class="ue-news-readmore">Read more &rarr;</div>' : '')
      +   anchorClose
      + '</article>';
  }

  // Inject (once) the small CSS the strip + ticker need.
  function injectStyles() {
    if (document.getElementById('ue-news-styles')) return;
    var s = document.createElement('style');
    s.id = 'ue-news-styles';
    s.textContent = ''
      // ── Section + horizontal scroller ────────────────────────────
      + '.ue-news-section{margin:28px 0}'
      + '.ue-news-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}'
      + '.ue-news-head h2{font-family:var(--font-head,inherit);font-size:1.4rem;font-weight:800;margin:0;color:var(--text,#0f1c3f)}'
      + '.ue-news-head h2 span{color:var(--accent,#2563eb)}'
      + '.ue-news-head .ue-news-link{font-size:.82rem;color:var(--accent,#2563eb);text-decoration:none;font-weight:700}'
      + '.ue-news-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(280px,320px);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;-webkit-overflow-scrolling:touch}'
      + '.ue-news-strip::-webkit-scrollbar{height:6px}'
      + '.ue-news-strip::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:6px}'
      // ── Card ─────────────────────────────────────────────────────
      + '.ue-news-card{scroll-snap-align:start;background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:16px;display:flex;flex-direction:column;min-height:170px;transition:box-shadow .15s ease,transform .15s ease}'
      + '.ue-news-card:hover{box-shadow:0 6px 20px rgba(15,28,63,.08);transform:translateY(-2px)}'
      + '.ue-news-card-link{color:inherit;text-decoration:none;display:flex;flex-direction:column;height:100%}'
      + '.ue-news-meta{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:.72rem}'
      + '.ue-news-tag{padding:3px 8px;border-radius:999px;font-weight:700;letter-spacing:.02em;font-size:.7rem}'
      + '.ue-news-date{color:var(--muted,#6b7280)}'
      + '.ue-news-title{font-family:var(--font-head,inherit);font-size:1rem;font-weight:800;line-height:1.3;margin:0 0 6px;color:var(--text,#0f1c3f)}'
      + '.ue-news-body{font-size:.85rem;color:var(--muted,#6b7280);line-height:1.5;margin:0 0 10px;flex:1}'
      + '.ue-news-source{font-size:.7rem;color:var(--muted2,#9ca3af);text-transform:uppercase;letter-spacing:.04em;margin-top:auto}'
      + '.ue-news-readmore{font-size:.78rem;color:var(--accent,#2563eb);font-weight:700;margin-top:6px}'
      + '.ue-news-empty{padding:18px;border:1px dashed var(--border,#e5e7eb);border-radius:12px;color:var(--muted,#6b7280);font-size:.85rem;text-align:center}'
      // ── Slim cross-page ticker ───────────────────────────────────
      + '.ue-news-ticker{position:relative;background:linear-gradient(90deg,#0f1c3f,#1e3a8a);color:#fff;font-size:.82rem;padding:8px 14px;display:flex;align-items:center;gap:12px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.12)}'
      + '.ue-news-ticker-label{flex-shrink:0;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:.7rem;background:rgba(255,255,255,.16);padding:3px 8px;border-radius:6px}'
      + '.ue-news-ticker-track{flex:1;overflow:hidden;white-space:nowrap;mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}'
      + '.ue-news-ticker-inner{display:inline-block;padding-left:100%;animation:ueNewsScroll 38s linear infinite}'
      + '.ue-news-ticker-inner a{color:#fff;text-decoration:none;margin-right:36px;font-weight:600}'
      + '.ue-news-ticker-inner a:hover{text-decoration:underline}'
      + '.ue-news-ticker-inner span{opacity:.6;margin-right:36px}'
      + '@keyframes ueNewsScroll{from{transform:translateX(0)}to{transform:translateX(-100%)}}'
      // ── Mobile tweaks ────────────────────────────────────────────
      + '@media(max-width:720px){'
      +   '.ue-news-section{margin:20px 0}'
      +   '.ue-news-head h2{font-size:1.2rem}'
      +   '.ue-news-strip{grid-auto-columns:minmax(82vw,84vw);gap:10px;padding:0 14px 8px;margin:0 -14px;scroll-padding-left:14px}'
      +   '.ue-news-card{min-height:160px}'
      +   '.ue-news-ticker{font-size:.78rem;padding:7px 10px;gap:8px}'
      +   '.ue-news-ticker-label{font-size:.65rem}'
      + '}';
    document.head.appendChild(s);
  }

  // Render a horizontal scrolling strip of cards into `mountEl`.
  function renderStrip(mountEl, items) {
    if (!mountEl) return;
    if (!items.length) {
      mountEl.innerHTML = '<div class="ue-news-empty">No updates yet — check back soon!</div>';
      return;
    }
    mountEl.innerHTML = items.map(cardHTML).join('');
  }

  // Render a slim, single-line marquee (used at the top of feature
  // pages so news is visible everywhere, not just the dashboard).
  function renderTicker(mountEl, items) {
    if (!mountEl || !items.length) return;
    var inner = items.slice(0, 8).map(function (it) {
      var label = (it.tag ? '[' + escape(it.tag) + '] ' : '') + escape(it.title || '');
      if (it.link) {
        var ext = /^https?:\/\//i.test(it.link);
        return '<a href="' + escape(it.link) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
      }
      return '<span>' + label + '</span>';
    }).join('');
    mountEl.innerHTML = ''
      + '<div class="ue-news-ticker-label">News</div>'
      + '<div class="ue-news-ticker-track"><div class="ue-news-ticker-inner">' + inner + inner + '</div></div>';
  }

  // Try to fetch the remote JSON feed. Returns [] on any failure.
  async function fetchRemote() {
    var url = _url();
    if (!url) return [];
    try {
      var ctrl = new AbortController();
      setTimeout(function () { ctrl.abort(); }, 6000);
      var res  = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
      if (!res.ok) return [];
      var data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    } catch (_) { return []; }
  }

  // Public mount entry-points ────────────────────────────────────
  async function mountStrip(targetIdOrEl) {
    injectStyles();
    var el = (typeof targetIdOrEl === 'string')
      ? document.getElementById(targetIdOrEl)
      : targetIdOrEl;
    if (!el) return;

    // Render the local items immediately so the section never feels empty.
    var local = sortItems(_items());
    renderStrip(el, local);

    // Then layer in the remote feed (if any).
    var remote = await fetchRemote();
    if (remote.length) {
      var seen   = Object.create(null);
      var merged = remote.concat(local).filter(function (it) {
        var k = it.id || (it.title + '|' + it.date);
        if (seen[k]) return false;
        seen[k] = true; return true;
      });
      renderStrip(el, sortItems(merged));
    }
  }

  async function mountTicker(targetIdOrEl) {
    injectStyles();
    var el = (typeof targetIdOrEl === 'string')
      ? document.getElementById(targetIdOrEl)
      : targetIdOrEl;
    if (!el) return;
    var local  = sortItems(_items());
    renderTicker(el, local);
    var remote = await fetchRemote();
    if (remote.length) renderTicker(el, sortItems(remote.concat(local)).slice(0, 8));
  }

  window.UE_NEWS = { mountStrip: mountStrip, mountTicker: mountTicker };
})();
