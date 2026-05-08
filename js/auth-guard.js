/* ═══════════════════════════════════════════════════════════════════
   UE School — js/auth-guard.js  (HARDENED v3 — schema-drift safe)

   ▸ Drop-in replacement for the previous auth-guard.js.

   ▸ WHAT CHANGED IN v3
       1. Profile read uses select('*') instead of an explicit column
          list, so a future migration that adds a column never again
          breaks the dashboard (the v2 SELECT was the root cause of
          the "We could not load your profile" toast on production —
          if even one of the 22 hard-coded columns was missing in the
          DB, PostgREST returned 400 and the read silently nulled).

       2. Real error reporting. The toast now shows the actual cause
          ("column 'foo' does not exist", "permission denied for table
          profiles", network error, etc.) and the console gets a
          single, clear log line. Support can fix the next incident
          in seconds instead of hours.

       3. Last-ditch fallback. If the hardened read still returns
          nothing, we try a minimal select('id, email, full_name,
          is_premium, is_admin, status, subscription_expiry') so the
          page can at least render the user, let them log out, etc.

       4. Auto-create upsert is now safe even on freshly-migrated
          databases — only columns we KNOW are universal are sent;
          everything else relies on column DEFAULTs.

   ▸ Everything else (head-gatekeeper veil lifecycle, premium / admin
     gate logic, auth-state-change listener, navigation render) is
     unchanged so this is truly a drop-in patch.
═══════════════════════════════════════════════════════════════════ */

const AUTH_GUARD = (function () {
  'use strict';

  // ── Config from centralised source ─────────────────────────────
  const cfg          = window.UE_CONFIG;
  const SUPABASE_URL  = cfg.SUPABASE_URL;
  const SUPABASE_ANON = cfg.SUPABASE_ANON;
  const LOGIN_PAGE    = cfg.LOGIN_PAGE   || 'login.html';
  const PRICING_PAGE  = cfg.PRICING_PAGE || 'pricing.html';
  const PREMIUM_PAGES = cfg.PREMIUM_PAGES || ['classroom.html', 'cbt.html'];

  // ── Toast helper (used for premium-redirect messages) ──────────
  function showToast(message, type = 'info', duration = 5000) {
    const existing = document.getElementById('ue-auth-toast');
    if (existing) existing.remove();

    const colours = {
      info:    { bg: '#1a56ff', icon: '\u2139' },
      warning: { bg: '#d97706', icon: '\u26A0\uFE0F' },
      error:   { bg: '#dc2626', icon: '\u26D4' },
      success: { bg: '#059669', icon: '\u2705' },
    };
    const c = colours[type] || colours.info;

    const toast = document.createElement('div');
    toast.id = 'ue-auth-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
      background:${c.bg};color:#fff;padding:14px 22px;border-radius:12px;
      font-family:inherit;font-size:.9rem;font-weight:600;z-index:99999;
      box-shadow:0 8px 32px rgba(0,0,0,.25);max-width:90vw;text-align:center;
      transition:transform .35s cubic-bezier(.34,1.56,.64,1);
      display:flex;align-items:center;gap:10px;
    `;
    toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(80px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // ── Remove the veil injected by head-gatekeeper ─────────────────
  function liftVeil() {
    const veil = document.getElementById('ue-gatekeeper-veil');
    if (veil) veil.remove();
    if (document.body) document.body.style.visibility = '';
  }

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function redirectToLogin(reason) {
    const page = currentPage();
    if (page === LOGIN_PAGE || page === 'confirm.html' || page === 'index.html' ||
        page === 'pricing.html' || page === 'forgot-password.html') return;
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(page) +
      (reason ? '&reason=' + encodeURIComponent(reason) : '')
    );
  }

  function redirectToPricing(reason) {
    const page = currentPage();
    if (page === PRICING_PAGE) return;
    window.location.replace(
      PRICING_PAGE + '?reason=' + encodeURIComponent(reason || 'premium_required') +
      '&next=' + encodeURIComponent(page)
    );
  }

  async function getSession() {
    const { data: { session }, error } = await window.sb.auth.getSession();
    if (error) return null;
    return session;
  }

  /* ─────────────────────────────────────────────────────────────────
     Profile fetch — schema-drift safe.

     We try select('*') first. If that fails (very old PostgREST
     installs, schema-cache flake, an ill-formed request), we fall
     back to a minimal column list of fields that have existed in
     EVERY version of the schema. The minimal read keeps the
     dashboard working — features that need newer columns just
     degrade gracefully instead of bricking the page.

     Returns { profile, errorMsg }.
   ───────────────────────────────────────────────────────────────── */
  async function getProfile(userId) {
    // Attempt 1 — wildcard select.
    let res;
    try {
      res = await window.sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
    } catch (netErr) {
      const msg = (netErr && netErr.message) ? netErr.message : 'Network error';
      console.error('[AUTH_GUARD] profile fetch (select *) threw:', msg);
      return { profile: null, errorMsg: msg };
    }

    if (!res.error && res.data) {
      cacheProfile(res.data);
      return { profile: res.data, errorMsg: null };
    }

    // Row legitimately missing (no error, no data) — caller will try
    // the auto-create path.
    if (!res.error && !res.data) {
      return { profile: null, errorMsg: null };
    }

    // We got an error — log it loudly and try the minimal fallback.
    console.error('[AUTH_GUARD] profile fetch (select *) error:',
      res.error.code || '', res.error.message || res.error);

    // Attempt 2 — minimal column list (every column here has existed
    // since v1 of the schema, so this should never fail unless RLS
    // is denying the read entirely).
    const MINIMAL_COLS =
      'id, full_name, email, is_premium, is_admin, status, ' +
      'subscription_expiry, total_xp, exam_subjects, exam_types';
    let res2;
    try {
      res2 = await window.sb
        .from('profiles')
        .select(MINIMAL_COLS)
        .eq('id', userId)
        .maybeSingle();
    } catch (netErr2) {
      return { profile: null,
               errorMsg: (netErr2 && netErr2.message) || 'Network error' };
    }

    if (!res2.error && res2.data) {
      cacheProfile(res2.data);
      console.warn('[AUTH_GUARD] profile loaded via MINIMAL fallback. ' +
        'Some columns may be missing in your DB. Run SUPABASE_FIX.sql.');
      return { profile: res2.data, errorMsg: null };
    }

    if (res2.error) {
      console.error('[AUTH_GUARD] minimal profile fetch error:',
        res2.error.code || '', res2.error.message || res2.error);
      // Surface the FIRST attempt's error message to the user since
      // it is more specific (e.g. names the missing column).
      return { profile: null,
               errorMsg: res.error.message || res2.error.message || 'Unknown profile read error' };
    }

    // No error, no data on the minimal read either — row truly missing.
    return { profile: null, errorMsg: null };
  }

  function cacheProfile(data) {
    try {
      sessionStorage.setItem('ue_profile_cache', JSON.stringify({
        is_premium:          data.is_premium,
        is_admin:            data.is_admin,
        subscription_expiry: data.subscription_expiry,
      }));
    } catch (_) { /* storage full / blocked — non-fatal */ }
  }

  // ── Admin / subscription helpers ────────────────────────────────
  function isAdmin(profile) {
    if (!profile) return false;
    if (profile.is_admin === true) return true;
    const list = (window.UE_CONFIG && window.UE_CONFIG.ADMIN_EMAILS) || [];
    return list.length > 0 && profile.email
      && list.map(e => e.toLowerCase()).includes(profile.email.toLowerCase());
  }

  function subscriptionStatus(profile) {
    if (!profile)                       return 'NIL';
    if (isAdmin(profile))               return 'ACTIVE';
    if (!profile.is_premium)            return 'NIL';
    if (!profile.subscription_expiry)   return 'NIL';
    const expiry = new Date(profile.subscription_expiry);
    if (expiry < new Date())            return 'EXPIRED';
    return 'ACTIVE';
  }

  function isPremium(profile) {
    return subscriptionStatus(profile) === 'ACTIVE';
  }

  // ── Premium gate ────────────────────────────────────────────────
  function enforcePremiumGate(profile) {
    const page = currentPage();
    if (PREMIUM_PAGES.indexOf(page) === -1) return true;

    const status = subscriptionStatus(profile);

    if (status === 'NIL') {
      try {
        sessionStorage.setItem(
          'ue_premium_redirect_msg',
          'This feature requires a UE School subscription. Choose a plan to continue.'
        );
      } catch (_) {}
      safeRedirectToPricing('not_subscribed');
      return false;
    }

    if (status === 'EXPIRED') {
      try {
        sessionStorage.setItem(
          'ue_premium_redirect_msg',
          'Your subscription has expired. Renew your plan to access this content.'
        );
      } catch (_) {}
      safeRedirectToPricing('subscription_expired');
      return false;
    }

    return true;
  }

  // ── Admin gate ─────────────────────────────────────────────────
  function enforceAdminGate(profile) {
    const ADMIN_ONLY = (cfg.ADMIN_ONLY_PAGES) ||
      ['admin-dashboard.html', 'admin-actions.html'];
    const page = currentPage();
    if (ADMIN_ONLY.indexOf(page) === -1) return true;

    if (!isAdmin(profile)) {
      try {
        sessionStorage.setItem('ue_admin_redirect_msg', 'Admin access only.');
      } catch (_) {}
      _redirecting = true;
      window.location.replace('dashboard.html?reason=admin_only');
      return false;
    }
    return true;
  }

  // ── Nav rendering ───────────────────────────────────────────────
  function renderNavUser(profile) {
    const avatarEl = document.getElementById('nav-avatar');
    const nameEl   = document.getElementById('nav-user-name');
    const xpEl     = document.getElementById('nav-xp');

    const initials = (profile.full_name || 'U')
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const status   = subscriptionStatus(profile);
    const admin    = isAdmin(profile);
    const proBadge = admin
      ? '<span class="nav-pro-badge" style="background:#7c3aed">ADMIN</span>'
      : (status === 'ACTIVE'
          ? '<span class="nav-pro-badge">PRO</span>'
          : '');

    if (avatarEl) avatarEl.innerHTML = initials + proBadge;
    if (nameEl)   nameEl.textContent = (profile.full_name || '').split(' ').slice(0, 2).join(' ');
    if (xpEl)     xpEl.textContent   = `${profile.total_xp ?? 0} XP`;

    if (!avatarEl && !nameEl) {
      const rightEl = document.getElementById('nav-right');
      if (!rightEl) return;
      rightEl.innerHTML = `
        <div class="nav-user-pill">
          <div class="nav-avatar" style="position:relative">${initials}${proBadge}</div>
          <span style="font-weight:700;font-size:.9rem">
            ${(profile.full_name || '').split(' ')[0]}
          </span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="AUTH_GUARD.logout()">Logout</button>
      `;
    }
  }

  function renderDefaulterBanner(profile) {
    const banner = document.getElementById('defaulter-banner');
    if (!banner) return;
    banner.style.display = subscriptionStatus(profile) === 'EXPIRED' ? 'block' : 'none';
  }

  // ── Logout ──────────────────────────────────────────────────────
  async function logout() {
    await window.sb.auth.signOut();
    try {
      sessionStorage.removeItem('ue_profile_cache');
      sessionStorage.removeItem('ue_pending_profile');
      sessionStorage.removeItem('ue_selected_plan');
      sessionStorage.removeItem('ue_profile_autocreate_tried');
    } catch (_) {}
    window.location.replace(LOGIN_PAGE);
  }

  let _redirecting = false;
  function safeRedirectToLogin(reason) {
    if (_redirecting) return;
    _redirecting = true;
    redirectToLogin(reason);
  }
  function safeRedirectToPricing(reason) {
    if (_redirecting) return;
    _redirecting = true;
    redirectToPricing(reason);
  }

  // ── Main init ────────────────────────────────────────────────────
  async function init() {
    if (!window.sb) {
      if (!window.supabase) {
        console.error('[AUTH_GUARD] Supabase SDK not loaded.');
        safeRedirectToLogin('sdk_missing');
        return null;
      }
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }

    const session = await getSession();

    if (!session) {
      try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
      safeRedirectToLogin('no_session');
      return null;
    }

    // Profile fetch with one retry for replication lag.
    let { profile, errorMsg } = await getProfile(session.user.id);
    if (!profile && !errorMsg) {
      // Truly missing row — wait briefly then re-read once before
      // resorting to auto-create.
      await new Promise(r => setTimeout(r, 500));
      ({ profile, errorMsg } = await getProfile(session.user.id));
    }

    // ── Auto-create path (only when there is no DB error AND no row)
    if (!profile && !errorMsg) {
      const ATTEMPT_KEY = 'ue_profile_autocreate_tried';
      const alreadyTried = sessionStorage.getItem(ATTEMPT_KEY) === '1';
      try { sessionStorage.setItem(ATTEMPT_KEY, '1'); } catch (_) {}

      if (!alreadyTried) {
        try {
          const meta        = session.user.user_metadata || {};
          const pending     = sessionStorage.getItem('ue_pending_profile');
          const pendingData = pending ? JSON.parse(pending) : {};

          const formData = {
            fullName:    pendingData.fullName    || meta.full_name    || session.user.email.split('@')[0],
            email:       session.user.email,
            examTypes:   pendingData.examTypes   || [],
            examDate:    pendingData.examDate    || null,
            targetScore: pendingData.targetScore || null,
            targetGrade: pendingData.targetGrade || null,
            subjects:    pendingData.subjects    || [],
            studyMode:   pendingData.studyMode   || 'drill'
          };

          // Conservative upsert payload — only fields known to exist
          // in v1 of the schema. Anything newer (subscription_expiry,
          // is_admin, weekly_report_optin, etc.) gets the column DEFAULT.
          const { error: upsertErr } = await window.sb.from('profiles').upsert({
            id:                  session.user.id,
            full_name:           formData.fullName,
            email:               formData.email,
            exam_types:          formData.examTypes,
            exam_date:           formData.examDate || null,
            target_score:        formData.targetScore,
            target_grade:        formData.targetGrade,
            current_skill_level: 3,
            status:              'NIL',
            is_premium:          false,
            exam_subjects:       formData.subjects,
            study_mode:          formData.studyMode,
            smartpath_queue:     [],
            total_xp:            0,
            usage_logs:          []
          }, { onConflict: 'id', ignoreDuplicates: false });

          if (upsertErr) {
            errorMsg = upsertErr.message || 'profile auto-create failed';
            console.error('[AUTH_GUARD] profile upsert failed:', errorMsg);
          } else if (pending) {
            sessionStorage.removeItem('ue_pending_profile');
          }

          // Re-fetch the profile we just created.
          ({ profile, errorMsg: errorMsg } = await getProfile(session.user.id));
        } catch (profileErr) {
          errorMsg = (profileErr && profileErr.message) || String(profileErr);
          console.error('[AUTH_GUARD] profile auto-create exception:', errorMsg);
        }
      }
    }

    if (!profile) {
      // Reveal the page so the user isn't staring at "Loading…" forever.
      liftVeil();

      // Surface the actual reason — NOT the generic "contact support".
      // The most common reason is a missing column or RLS policy in
      // the user's Supabase project; tell them so they can fix it.
      const detail = errorMsg
        ? ` (${truncate(errorMsg, 140)})`
        : ' (no profile row was found and auto-create did not return one).';
      showToast(
        'Profile load failed' + detail +
        ' Run SUPABASE_FIX.sql in Supabase SQL Editor, then reload.',
        'error', 12000
      );
      return null;
    }

    // ── Gates ────────────────────────────────────────────────────
    if (enforceAdminGate(profile)   === false) return null;
    if (enforcePremiumGate(profile) === false) return null;

    // ── Reveal page ──────────────────────────────────────────────
    liftVeil();

    // ── Auth state listener ──────────────────────────────────────
    window.sb.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
        safeRedirectToLogin('signed_out');
        return;
      }
      if (event === 'TOKEN_REFRESHED' && newSession) {
        if (window.UE_USER) window.UE_USER.access_token = newSession.access_token;
        window.UE_SESSION = newSession;
      }
    });

    // ── Globals ──────────────────────────────────────────────────
    window.UE_USER = {
      id:           session.user.id,
      email:        session.user.email,
      full_name:    profile.full_name,
      access_token: session.access_token,
      is_premium:   isPremium(profile),
      is_admin:     isAdmin(profile),
      _expired:     false,
    };
    window.UE_SESSION = session;
    window.UE_PROFILE = profile;
    window.UE_USER_ID = session.user.id;

    // Signal that auth-guard has finished — pages can listen for this
    // instead of using a fragile timed poll (fixes admin-actions login issue).
    try { document.dispatchEvent(new CustomEvent('ue:ready')); } catch (_) {}

    renderNavUser(profile);
    renderDefaulterBanner(profile);

    return { session, profile };
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  }

  // ── Free-tier sample tracker ────────────────────────────────────
  // Free (registered, not premium) users get N samples of every
  // premium tool — see UE_CONFIG.FREE_SAMPLE. We persist the count
  // per user in localStorage (key prefix below + user-id) so the
  // sample survives reloads but is private to the device. We also
  // mirror the key without a user-id so it survives a logout/login
  // cycle on the same device — that prevents spam-creating throw-
  // away accounts from racking up free attempts on a shared phone.
  const SAMPLE_KEY_PREFIX = 'ue_free_sample::';

  function _sampleKeys(feature) {
    const uid = (window.UE_USER_ID || (window.UE_USER && window.UE_USER.id) || '');
    return [
      SAMPLE_KEY_PREFIX + feature + '::' + uid,
      SAMPLE_KEY_PREFIX + feature + '::device',
    ];
  }

  // Read how many times a free user has spent this sample.
  function getFreeSampleCount(feature) {
    try {
      const keys = _sampleKeys(feature);
      let max = 0;
      for (const k of keys) {
        const n = parseInt(localStorage.getItem(k) || '0', 10);
        if (n > max) max = n;
      }
      return max;
    } catch (_) { return 0; }
  }

  // Returns the per-feature limit from UE_CONFIG.FREE_SAMPLE.
  function freeSampleLimit(feature) {
    const m = (window.UE_CONFIG && window.UE_CONFIG.FREE_SAMPLE) || {};
    const map = {
      video:  m.VIDEOS_PER_ACCOUNT,
      cbt:    m.CBT_PER_ACCOUNT,
      guide:  m.GUIDES_PER_ACCOUNT,
    };
    const v = map[feature];
    return Number.isFinite(v) ? v : 1;
  }

  // True iff a non-premium user is allowed to try this feature now.
  // Premium / admin users always get true.
  function canSampleFeature(feature, profile) {
    profile = profile || window.UE_PROFILE;
    if (isPremium(profile) || isAdmin(profile)) return true;
    return getFreeSampleCount(feature) < freeSampleLimit(feature);
  }

  // Mark one use against the free quota. No-op for premium/admin.
  function recordSampleUse(feature, profile) {
    profile = profile || window.UE_PROFILE;
    if (isPremium(profile) || isAdmin(profile)) return;
    try {
      const keys = _sampleKeys(feature);
      const cur  = getFreeSampleCount(feature);
      keys.forEach(k => localStorage.setItem(k, String(cur + 1)));
    } catch (_) { /* ignore */ }
  }

  // Send the user to the pricing page with a friendly toast hint.
  // Pages call this when a free user clicks a tool they have already
  // sampled (or that is premium-only with no sample at all).
  function bouncePremium(reason) {
    const cfg = window.UE_CONFIG || {};
    try {
      sessionStorage.setItem(
        'ue_premium_redirect_msg',
        reason || 'Upgrade to unlock the full UE School experience.'
      );
    } catch (_) {}
    window.location.replace((cfg.PRICING_PAGE || 'pricing.html') +
      '?reason=sample_used&from=' + encodeURIComponent(location.pathname.split('/').pop() || ''));
  }

  return {
    init,
    getSession,
    getProfile,
    logout,
    showToast,
    subscriptionStatus,
    isPremium,
    isAdmin,
    // Free-tier sample API
    canSampleFeature,
    recordSampleUse,
    getFreeSampleCount,
    freeSampleLimit,
    bouncePremium,
  };

})();
