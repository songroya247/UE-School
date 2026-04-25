/* ═══════════════════════════════════════════════════════════════════
   UE School — js/admin-actions.js
   Powers admin-actions.html. Reads/writes go through:
     - window.sb       (anon-key client, authenticated by user JWT)
     - admin-action    Edge Function (uses service role server-side)
   The Edge Function re-checks is_admin server-side, so even if the
   RLS policies are wrong, no privilege escalation is possible.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Tiny helpers ─────────────────────────────────────────────────
  const $  = (s) => document.querySelector(s);
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtDate = (s) => s ? new Date(s).toLocaleString('en-GB',
    { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const fmtMoney = (kobo) => '₦' + (Number(kobo||0)/100).toLocaleString('en-NG');

  function toast(msg, kind = 'ok') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show ' + (kind === 'err' ? 'err' : 'ok');
    setTimeout(() => { t.className = ''; }, 3500);
  }

  // ── State ────────────────────────────────────────────────────────
  let currentTarget = null;   // profile row of the user being acted on

  // ── Boot: wait for auth-guard to finish ──────────────────────────
  async function boot() {
    // auth-guard.js redirects to login if no session, so by the time
    // this runs we either have window.sb + window.UE_USER set, or
    // we've already been bounced.
    let attempts = 0;
    while ((!window.sb || !window.UE_USER) && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (!window.sb || !window.UE_USER) {
      // Fallback — head-gatekeeper hadn't redirected yet.
      window.location.href = window.UE_CONFIG.LOGIN_PAGE;
      return;
    }

    // Verify admin server-side via the profiles row.
    const { data: me, error } = await window.sb
      .from('profiles')
      .select('is_admin, full_name, email')
      .eq('id', window.UE_USER.id)
      .maybeSingle();

    if (error) {
      $('#boot').style.display = 'none';
      $('#denied').style.display = 'block';
      $('#denied p').textContent = 'Could not verify admin status: ' + error.message;
      return;
    }
    if (!me?.is_admin) {
      $('#boot').style.display = 'none';
      $('#denied').style.display = 'block';
      return;
    }

    $('#who-email').textContent = me.email || window.UE_USER.email || '—';
    $('#boot').style.display = 'none';
    $('#app').style.display = 'block';

    wireUI();
    loadAudit();
  }

  // ── UI wiring ────────────────────────────────────────────────────
  function wireUI() {
    $('#search-btn').addEventListener('click', searchUser);
    $('#search-email').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); searchUser(); }
    });
    $('#refresh-audit').addEventListener('click', loadAudit);

    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => onAction(b.dataset.act, Number(b.dataset.days || 0)));
    });
  }

  // ── Look up a user by email ──────────────────────────────────────
  async function searchUser() {
    const email = $('#search-email').value.trim();
    if (!email) { toast('Enter an email first', 'err'); return; }

    const btn = $('#search-btn');
    btn.disabled = true; btn.textContent = 'Searching…';

    try {
      const { data, error } = await window.sb
        .from('profiles')
        .select('id, full_name, email, phone, is_premium, is_admin, subscription_expiry, status, created_at')
        .ilike('email', email)
        .maybeSingle();

      if (error) { toast(error.message, 'err'); return; }
      if (!data) { toast('No user found with that email', 'err'); hideTarget(); return; }

      currentTarget = data;
      renderTarget(data);
      loadPayments(data.id);
    } finally {
      btn.disabled = false; btn.textContent = 'Look up';
    }
  }

  function hideTarget() {
    currentTarget = null;
    $('#target').classList.remove('show');
  }

  function renderTarget(u) {
    const planBadge = u.is_premium
      ? '<span class="badge b-prem">Premium</span>'
      : '<span class="badge b-free">Free</span>';
    const adminBadge = u.is_admin ? ' <span class="badge b-admin">Admin</span>' : '';

    $('#t-name').textContent   = u.full_name || '—';
    $('#t-email').textContent  = u.email || '—';
    $('#t-id').textContent     = u.id;
    $('#t-plan').innerHTML     = planBadge + adminBadge;
    $('#t-expiry').textContent = u.subscription_expiry ? fmtDate(u.subscription_expiry) : '—';
    $('#t-status').textContent = u.status || '—';
    $('#t-joined').textContent = fmtDate(u.created_at);

    $('#target').classList.add('show');
  }

  // ── Load payments for the current target ─────────────────────────
  async function loadPayments(userId) {
    const wrap = $('#pay-list');
    wrap.innerHTML = '<div class="empty">Loading…</div>';
    $('#pay-count').textContent = '';

    const { data, error } = await window.sb
      .from('payments')
      .select('reference, amount, plan, status, paid_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { wrap.innerHTML = `<div class="empty">${escHtml(error.message)}</div>`; return; }
    if (!data?.length) { wrap.innerHTML = '<div class="empty">No payments on record.</div>'; return; }

    $('#pay-count').textContent = `${data.length} record${data.length === 1 ? '' : 's'}`;

    const rows = data.map((p) => `
      <tr>
        <td class="mono">${escHtml(p.reference)}</td>
        <td>${escHtml(p.plan || '—')}</td>
        <td>${fmtMoney(p.amount)}</td>
        <td><span class="badge ${p.status==='success'?'b-prem':p.status==='refunded'?'b-free':'b-free'}">${escHtml(p.status)}</span></td>
        <td>${fmtDate(p.paid_at || p.created_at)}</td>
        <td>${p.status === 'success'
            ? `<button class="btn btn-warn" style="padding:4px 10px;font-size:.72rem"
                  onclick="window.__refund('${escHtml(p.reference)}')">Mark refunded</button>`
            : ''}</td>
      </tr>`).join('');

    wrap.innerHTML = `<table>
      <thead><tr><th>Reference</th><th>Plan</th><th>Amount</th><th>Status</th><th>When</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ── Privileged actions ───────────────────────────────────────────
  async function onAction(kind, days) {
    if (!currentTarget) { toast('Look up a user first', 'err'); return; }
    const u = currentTarget;

    let payload = { target_id: u.id, target_email: u.email };
    let confirmMsg, action;

    if (kind === 'grant') {
      action = 'grant_premium';
      payload.action = action; payload.days = days;
      confirmMsg = `Grant ${days} days of premium to ${u.email}?`;
    } else if (kind === 'extend') {
      action = 'extend';
      payload.action = action; payload.days = days;
      confirmMsg = `Extend ${u.email}'s subscription by ${days} days?`;
    } else if (kind === 'custom') {
      const v = prompt('How many days of premium to grant? (1–3650)', '30');
      if (!v) return;
      const n = parseInt(v, 10);
      if (!n || n < 1 || n > 3650) { toast('Invalid number', 'err'); return; }
      action = 'grant_premium';
      payload.action = action; payload.days = n;
      confirmMsg = `Grant ${n} days of premium to ${u.email}?`;
    } else if (kind === 'revoke') {
      action = 'revoke_premium';
      payload.action = action;
      confirmMsg = `REVOKE premium from ${u.email}? They will lose access immediately.`;
    } else {
      return;
    }

    if (!confirm(confirmMsg)) return;
    const reason = prompt('Reason (optional, stored in audit log):', '');
    if (reason) payload.reason = reason;

    await callAdmin(payload);
    // Refresh the user card.
    await searchUser();
    loadAudit();
  }

  window.__refund = async function (reference) {
    if (!confirm(`Mark payment ${reference} as refunded and revoke premium?`)) return;
    const reason = prompt('Refund reason (optional):', '');
    await callAdmin({ action: 'mark_refunded', reference, reason: reason || undefined });
    if (currentTarget) loadPayments(currentTarget.id);
    loadAudit();
  };

  async function callAdmin(payload) {
    // Always pull a fresh access token (same pattern as payment.js).
    let token = window.UE_USER?.access_token;
    try {
      const { data } = await window.sb.auth.getSession();
      if (data?.session?.access_token) token = data.session.access_token;
    } catch (_) { /* keep cached */ }

    const url = window.UE_CONFIG.SUPABASE_URL + '/functions/v1/admin-action';
    let res, json;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
          'apikey':        window.UE_CONFIG.SUPABASE_ANON,
        },
        body: JSON.stringify(payload),
      });
      json = await res.json().catch(() => ({}));
    } catch (e) {
      toast('Network error: ' + e.message, 'err');
      return;
    }
    if (!res.ok || json.error) {
      toast(json.error || `Failed (HTTP ${res.status})`, 'err');
      return;
    }
    toast('Done.', 'ok');
  }

  // ── Recent audit log ─────────────────────────────────────────────
  async function loadAudit() {
    const wrap = $('#audit-list');
    wrap.innerHTML = '<div class="empty">Loading…</div>';

    const { data, error } = await window.sb
      .from('admin_audit_log')
      .select('admin_email, target_email, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) { wrap.innerHTML = `<div class="empty">${escHtml(error.message)}</div>`; return; }
    if (!data?.length) { wrap.innerHTML = '<div class="empty">No admin activity yet.</div>'; return; }

    const rows = data.map((r) => {
      const det = r.details || {};
      const extra = [
        det.days   ? `+${det.days}d`           : null,
        det.reference ? `ref: ${det.reference}`: null,
        det.reason ? `“${det.reason}”`         : null,
      ].filter(Boolean).join(' · ');
      return `<tr>
        <td>${fmtDate(r.created_at)}</td>
        <td>${escHtml(r.admin_email||'—')}</td>
        <td><span class="badge b-admin">${escHtml(r.action)}</span></td>
        <td>${escHtml(r.target_email||'—')}</td>
        <td style="color:var(--muted);font-size:.75rem">${escHtml(extra)}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table>
      <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
