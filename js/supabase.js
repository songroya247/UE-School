/* ═══════════════════════════════════════════════════════════════════
   UE School — js/supabase.js  (UPDATED v2)
   This file is now a thin shim.
   All credentials live in js/config.js.
   All pages use window.sb which is set by auth-guard.js on init.

   For PUBLIC pages (index, pricing, contact) that don't load
   auth-guard.js, include this file to get window.sb:
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (window.sb) return; // auth-guard.js already set it

  if (!window.supabase) {
    console.error('[supabase.js] Supabase SDK not loaded.');
    return;
  }

  const cfg = window.UE_CONFIG;
  if (!cfg) {
    console.error('[supabase.js] UE_CONFIG not defined. Load js/config.js first.');
    return;
  }

  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON);
})();
