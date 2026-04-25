/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js  (HARDENED v4)

   ▸ PURPOSE : Synchronously block protected pages from rendering for
               unauthenticated visitors and from showing premium-only
               content to free / expired users.

   ▸ WHAT CHANGED (v4):
       • IMMEDIATE veil: an inline <style> tag hides <body> until the
         async auth-guard.js finishes. The veil is removed AFTER the
         server-validated session + premium check pass. This closes
         the "1.8s of free premium access" window in v3.
       • Tightened auth-flow exception: we no longer trust
         document.referrer (it survives a logout + Back-button). The
         only case we let through without a localStorage session is a
         genuine OAuth/email-confirm callback — i.e. the URL has
         #access_token=… or ?code= in the query string.
       • Optimistic premium pre-check: for PREMIUM_PAGES (classroom,
         cbt, …) we read the cached profile snapshot written by
         auth-guard.js on the previous load. If we already know the
         user is NOT premium, we redirect to pricing.html BEFORE the
         page renders — no flash of premium content.
       • PROTECTED_PAGES default now includes admin-dashboard.html.
       • Veil also applies to admin-only pages — the admin role is
         re-checked in auth-guard.js.

   ▸ LOAD ORDER (unchanged):
       <head>
         <script src="js/config.js"></script>
         <script src="js/head-gatekeeper.js"></script>
         … fonts, CSS …
       </head>
       <body>
         …
         <script src="…supabase.min.js"></script>
         <script src="js/auth-guard.js"></script>
       </body>
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Step 1: Resolve config ───────────────────────────────────────
  var cfg          = window.UE_CONFIG || {};
  var LOGIN_PAGE   = cfg.LOGIN_PAGE   || 'login.html';
  var PRICING_PAGE = cfg.PRICING_PAGE || 'pricing.html';
  var PROTECTED    = cfg.PROTECTED_PAGES || [
    'dashboard.html', 'classroom.html', 'cbt.html', 'report.html',
    'admin-dashboard.html', 'admin-actions.html'
  ];
  var PREMIUM      = cfg.PREMIUM_PAGES || ['classroom.html', 'cbt.html'];
  var ADMIN_ONLY   = cfg.ADMIN_ONLY_PAGES || ['admin-dashboard.html', 'admin-actions.html'];

  // ── Step 2: Determine which page we are on ───────────────────────
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (PROTECTED.indexOf(currentPage) === -1) return; // public page

  // ── Step 3: INSTALL THE VEIL ─────────────────────────────────────
  // Inject a CSS rule that hides <body> until auth-guard.js confirms
  // a valid session (and the right plan/role). Auth-guard removes the
  // <style id="ue-gatekeeper-veil"> tag with liftVeil().
  //
  // We use a <style> tag (not body.style.visibility) because the
  // <body> element does not exist yet when this runs in <head>.
  try {
    var veil = document.createElement('style');
    veil.id   = 'ue-gatekeeper-veil';
    veil.type = 'text/css';
    veil.appendChild(document.createTextNode(
      'body{visibility:hidden!important}' +
      // Show a plain "Loading…" so a slow network does not look broken.
      'html::before{' +
        'content:"Loading…";position:fixed;top:50%;left:50%;' +
        'transform:translate(-50%,-50%);font:600 14px/1 system-ui,sans-serif;' +
        'color:#6b7280;z-index:2147483647;letter-spacing:.02em;' +
      '}'
    ));
    (document.head || document.documentElement).appendChild(veil);
  } catch (_) { /* non-fatal */ }

  // ── Step 4: Try every known Supabase v2 storage format ───────────
  //   We DO NOT try to detect "expired" here. The SDK refreshes
  //   silently — guessing the wrong expiry just hides the page.
  var session = readSupabaseSession();

  // ── Step 5: No session? Decide based on URL, not referrer. ───────
  if (!session) {
    // Allow the auth callback URL through. Supabase's email-confirm /
    // password-reset / OAuth links arrive with either:
    //   - hash fragment:  #access_token=…&refresh_token=…&type=…
    //   - query param:    ?code=… (PKCE)
    //   - query param:    ?token_hash=… (magic link)
    var hash   = window.location.hash || '';
    var search = window.location.search || '';
    var isAuthCallback =
      hash.indexOf('access_token=') !== -1 ||
      hash.indexOf('refresh_token=') !== -1 ||
      hash.indexOf('type=signup') !== -1 ||
      hash.indexOf('type=recovery') !== -1 ||
      /[?&](code|token_hash|token)=/.test(search);

    if (isAuthCallback) {
      // The SDK will exchange the token in the next tick.
      // auth-guard.js will then validate and lift the veil.
      return;
    }

    redirectTo(LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage));
    return;
  }

  // ── Step 6: Optimistic premium pre-check ─────────────────────────
  // Use the cached profile snapshot to redirect known-non-premium
  // users to /pricing BEFORE the page renders. This is purely a UX
  // optimisation — auth-guard.js still re-checks against the DB.
  if (PREMIUM.indexOf(currentPage) !== -1) {
    var cached = readProfileCache();
    if (cached) {
      var notPremium = !cached.is_premium;
      var expired = cached.subscription_expiry &&
        new Date(cached.subscription_expiry) < new Date();
      var notAdmin = !cached.is_admin;
      if (notAdmin && (notPremium || expired)) {
        redirectTo(PRICING_PAGE +
          '?reason=' + (expired ? 'subscription_expired' : 'not_subscribed') +
          '&next=' + encodeURIComponent(currentPage));
        return;
      }
    }
  }

  // ── Step 7: Optimistic admin pre-check ───────────────────────────
  if (ADMIN_ONLY.indexOf(currentPage) !== -1) {
    var cachedA = readProfileCache();
    if (cachedA && cachedA.is_admin === false) {
      redirectTo('dashboard.html');
      return;
    }
  }

  // ── Step 8: Seed window.UE_USER for downstream scripts ───────────
  var user = (session.user) ? session.user : {};
  try {
    Object.defineProperty(window, 'UE_USER', {
      value: {
        id:           user.id    || null,
        email:        user.email || null,
        full_name:    (user.user_metadata && user.user_metadata.full_name) || null,
        access_token: session.access_token || null,
        // Premium / admin status is UNKNOWN at this stage; auth-guard.js fills it in.
        is_premium:   null,
        is_admin:     null,
      },
      writable:     true,
      configurable: true,
      enumerable:   true,
    });
  } catch (_) { /* property already defined — non-fatal */ }


  /* ─────────────────────────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────────────────────────── */

  function redirectTo(url) {
    // Use replace() so the protected URL is removed from history —
    // the browser's Back button cannot return to a never-rendered
    // protected page.
    window.location.replace(url);
  }

  function readProfileCache() {
    try {
      var raw = sessionStorage.getItem('ue_profile_cache');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     Supabase v2 storage parser.
     Returns a session-like object { access_token, user } or null.
     Never throws.
  ───────────────────────────────────────────────────────────────── */
  function readSupabaseSession() {
    try {
      // 1. Find the primary auth-token key (e.g. sb-<ref>-auth-token).
      var primaryKey = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf('sb-') === 0 &&
            k.indexOf('-auth-token') !== -1 &&
            // exclude chunk keys: sb-…-auth-token.0, .1, …
            !/-auth-token\.\d+$/.test(k) &&
            // exclude code-verifier helper keys
            k.indexOf('-auth-token-code-verifier') === -1) {
          primaryKey = k;
          break;
        }
      }
      if (!primaryKey) return null;

      var raw = localStorage.getItem(primaryKey);
      if (!raw) return null;

      // 2. If the value is a JSON array of strings, the token was
      //    chunked across multiple keys. Reassemble it.
      if (raw.charAt(0) === '[') {
        try {
          var parts = JSON.parse(raw);
          if (Array.isArray(parts)) {
            var assembled = parts
              .map(function (key) { return localStorage.getItem(key) || ''; })
              .join('');
            raw = assembled;
          }
        } catch (_) { /* fall through */ }
      }

      // 3. base64-prefixed format introduced in newer Supabase clients.
      if (raw.indexOf('base64-') === 0) {
        try {
          var b64 = raw.slice(7);
          var decoded = decodeURIComponent(escape(atob(b64)));
          raw = decoded;
        } catch (_) { return null; }
      }

      // 4. Plain JSON object.
      var obj;
      try { obj = JSON.parse(raw); } catch (_) { return null; }
      if (!obj) return null;

      var s = obj.currentSession || obj;
      if (!s || !s.access_token) return null;

      // 5. Hard expiry check. The SDK CAN refresh silently, but if the
      //    refresh token itself is gone or the access token has been
      //    expired for hours, treat the session as missing rather
      //    than letting protected content render.
      if (typeof s.expires_at === 'number') {
        var nowSec = Math.floor(Date.now() / 1000);
        // Allow the SDK a 60s grace period to refresh in the background.
        if (s.expires_at + 60 < nowSec && !s.refresh_token) return null;
      }

      return s;
    } catch (_) {
      return null;
    }
  }
})();
