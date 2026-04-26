/* ═══════════════════════════════════════════════════════════════════
   UE School — Profile-load diagnostic / one-shot repair

   HOW TO USE
   ──────────
   1. Open  https://ultimateedge.info/dashboard.html  (must be logged in)
   2. Open the browser DevTools Console
        • Desktop Chrome / Edge / Firefox: press F12 → "Console" tab
        • Android Chrome: open chrome://inspect on a desktop, OR install
          the "Eruda" bookmarklet (one-line search), OR temporarily add
            <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
            <script>eruda.init()</script>
          to dashboard.html
   3. Copy EVERYTHING in this file, paste it into the Console, press Enter
   4. Read the alert. It tells you the EXACT cause and the EXACT fix.

   WHAT IT DOES
   ────────────
   • Confirms you have a Supabase session
   • Tries to read your profile row with `select('*')`
   • If the read fails → prints the real PostgREST error (column missing
     / RLS denial / network) and tells you to run SUPABASE_FIX.sql
   • If the row is missing → tries to insert it with minimum-required
     fields. If THAT fails, it prints why.
   • If the row reads fine → the DB is healthy and the toast is being
     served by a cached old `auth-guard.js`. Tells you to hard-refresh.
═══════════════════════════════════════════════════════════════════ */

(async function ueDiagnose() {
  function out(label, value) {
    // eslint-disable-next-line no-console
    console.log('%c[UE-DIAG] ' + label, 'color:#1a56ff;font-weight:700', value);
  }
  function err(label, value) {
    // eslint-disable-next-line no-console
    console.error('[UE-DIAG] ' + label, value);
  }

  if (!window.sb) {
    alert('window.sb is not initialised. You must run this on a UE School page (e.g. dashboard.html), not the home page.');
    return;
  }

  const { data: { session }, error: sessErr } = await window.sb.auth.getSession();
  if (sessErr) { err('getSession error', sessErr); alert('Auth error: ' + sessErr.message); return; }
  if (!session) { alert('No active session — log in first, then re-run.'); return; }

  out('user.id', session.user.id);
  out('user.email', session.user.email);

  // ── 1. SELECT * with explicit array return so we can distinguish
  //      "row missing" from "RLS hides row" from "real error"
  const r1 = await window.sb
    .from('profiles')
    .select('*')
    .eq('id', session.user.id);

  out('SELECT * result', r1);

  if (r1.error) {
    err('READ ERROR', r1.error);
    alert(
      'Profile READ failed.\n\n' +
      'code: '    + (r1.error.code    || '(none)') + '\n' +
      'message: ' + (r1.error.message || r1.error) + '\n\n' +
      'Fix: open Supabase → SQL Editor → paste SUPABASE_FIX.sql → Run, then hard-refresh this page.'
    );
    return;
  }

  if (!r1.data || r1.data.length === 0) {
    out('Profile row missing — attempting auto-create…', null);
    const meta = session.user.user_metadata || {};
    const r2 = await window.sb.from('profiles').insert({
      id:        session.user.id,
      email:     session.user.email,
      full_name: meta.full_name || session.user.email.split('@')[0],
    }).select();

    out('INSERT result', r2);

    if (r2.error) {
      err('INSERT ERROR', r2.error);
      alert(
        'Profile auto-create failed.\n\n' +
        'code: '    + (r2.error.code    || '(none)') + '\n' +
        'message: ' + (r2.error.message || r2.error) + '\n\n' +
        'Most likely cause: RLS INSERT policy missing or a NOT NULL column has no default.\n' +
        'Fix: run SUPABASE_FIX.sql in Supabase → SQL Editor → New Query.'
      );
      return;
    }
    alert('Profile created successfully. Reloading the page…');
    location.reload();
    return;
  }

  // ── 3. DB read works fine → JS file is stale.
  out('Profile read OK', r1.data[0]);
  alert(
    'Profile reads fine from the database.\n\n' +
    'That means the red toast is being shown by a CACHED OLD copy of js/auth-guard.js, ' +
    'not by a real error.\n\n' +
    'Fix:\n' +
    '  • Open dashboard.html in an Incognito / Private window, OR\n' +
    '  • Bump the cache: change <script src="js/auth-guard.js"> to ' +
    '<script src="js/auth-guard.js?v=3"> in every page, push, redeploy.'
  );
})();
