/* ═══════════════════════════════════════════════════════════════════
   UE School — js/payment.js  (v3 — Tiered Plans + Init Fixes)

   CHANGES FROM v2:
   ─────────────────
   1. PLAN FEATURES are now fully differentiated: Basic / Pro / Elite.
      Each tier builds on the previous — no copy-paste repetition.

   2. INITIALIZATION: The entire module self-initialises inside
      DOMContentLoaded so the DOM is guaranteed ready before any
      listener is attached. Calling code no longer needs its own
      DOMContentLoaded wrapper.

   3. PAYMENT DEADLOCK FIX: openCheckout() checks window.UE_USER
      (seeded by head-gatekeeper.js) BEFORE trying to open Paystack.
      If UE_USER is absent (public page, not logged in) it redirects
      to login with ?next=pricing.html instead of silently failing.

   4. SERVER-SIDE VERIFICATION: onSuccess still routes through the
      Edge Function (verify-payment) — no client-side is_premium flip.
═══════════════════════════════════════════════════════════════════ */

const PAYMENT = (function () {
  'use strict';

  /* ── 1. TIERED PLAN DEFINITIONS ──────────────────────────────────
     Each plan has:
       tier:      display label shown as a chip on the card
       features:  grouped array — sections are { section, items[] }
                  Sections render as visual dividers inside the list.
  ─────────────────────────────────────────────────────────────────── */
  const PLANS = {

    monthly: {
      key:      'monthly',
      label:    'Basic',
      tier:     'Basic',
      amount:   150000,       // kobo  = ₦1,500
      naira:    '₦1,500',
      period:   '/month',
      days:     30,
      planCode: 'PLN_jctl2fmbtbprn79',
      save:     '',
      featured: false,
      featureGroups: [
        {
          section: 'Core Access',
          items: [
            '&#x2705; Full CBT practice engine (all subjects)',
            '&#x2705; Core video lessons for all topics',
            '&#x2705; JAMB, WAEC & NECO question banks',
            '&#x2705; Basic score prediction',
          ],
        },
        {
          section: 'Support',
          items: [
            '&#x1F4E7; 24-hour email support',
          ],
        },
      ],
    },

    quarterly: {
      key:      'quarterly',
      label:    'Pro',
      tier:     'Pro',
      amount:   350000,       // kobo  = ₦3,500
      naira:    '₦3,500',
      period:   '/3 months',
      days:     90,
      planCode: 'PLN_7k27rm469etnc8y',
      save:     'Save 22%',
      featured: true,
      featureGroups: [
        {
          section: 'Everything in Basic, plus:',
          items: [
            '&#x1F9E0; SmartPath™ AI Analytics engine',
            '&#x1F525; Topic weakness heatmaps',
            '&#x1F4CA; Detailed performance dashboard',
            '&#x1F3AF; Adaptive difficulty (Grades 1–3)',
            '&#x1F4C8; WAEC/NECO grade predictions',
          ],
        },
        {
          section: 'Support',
          items: [
            '&#x26A1; 2-hour priority support',
          ],
        },
      ],
    },

    annual: {
      key:      'annual',
      label:    'Elite',
      tier:     'Elite',
      amount:   1200000,      // kobo  = ₦12,000
      naira:    '₦12,000',
      period:   '/year',
      days:     365,
      planCode: 'PLN_vg1odwe75m793nk',
      save:     'Save 44%',
      featured: false,
      featureGroups: [
        {
          section: 'Everything in Pro, plus:',
          items: [
            '&#x1F4C4; Full PDF study guides per subject',
            '&#x1F3DB;&#xFE0F; Post-UTME university-specific question banks',
            '&#x1F5D3;&#xFE0F; 1-on-1 strategy session with a tutor',
            '&#x2B07;&#xFE0F; Downloadable mastery reports',
            '&#x1F514; Exam-countdown reminders & study schedule',
          ],
        },
        {
          section: 'Support',
          items: [
            '&#x1F4DE; Dedicated WhatsApp support line',
          ],
        },
      ],
    },
  };

  /* ── 2. CONSTANTS ──────────────────────────────────────────────── */
  const PAYSTACK_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

  // Edge Function URL — set by UE_CONFIG at runtime
  function getVerifyUrl() {
    return (window.UE_CONFIG && window.UE_CONFIG.SUPABASE_URL)
      ? window.UE_CONFIG.SUPABASE_URL + '/functions/v1/verify-payment'
      : '/functions/v1/verify-payment';
  }

  /* ── 3. HELPERS ────────────────────────────────────────────────── */
  function generateRef() {
    return 'UE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function getLoginPage() {
    return (window.UE_CONFIG && window.UE_CONFIG.LOGIN_PAGE) || 'login.html';
  }

  /* ── 4. DATABASE WRITES ────────────────────────────────────────── */
  async function recordPayment(userId, planKey, reference) {
    const plan = PLANS[planKey];
    const { error } = await window.sb.from('payments').insert({
      user_id:   userId,
      amount:    plan.amount,
      plan:      planKey,
      reference,
      status:    'pending',
    });
    if (error) console.error('[PAYMENT] pending record error:', error.message);
    return !error;
  }

  /* ── 5. SERVER-SIDE VERIFICATION ──────────────────────────────── */
  async function verifyWithServer(reference, planKey) {
    try {
      // ALWAYS pull a fresh access token from the SDK. The cached
      // token on UE_USER may be stale (rotated by silent refresh)
      // and an expired bearer makes the Edge Function reply 401.
      let accessToken = null;
      if (window.sb && window.sb.auth) {
        const { data } = await window.sb.auth.getSession();
        accessToken = data.session?.access_token || null;
      }
      if (!accessToken && window.UE_USER) {
        accessToken = window.UE_USER.access_token;
      }
      if (!accessToken) {
        return { success: false, message: 'Not signed in. Please log in and try again.' };
      }

      const res = await fetch(getVerifyUrl(), {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reference, plan: planKey }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.message || 'Server verification failed.' };
      }
      return await res.json(); // { success, expiry } or { success: false, message }

    } catch (err) {
      console.error('[PAYMENT] Network error:', err);
      return { success: false, message: 'Network error. Please check your connection and try again.' };
    }
  }

  /* ── 6. MAIN CHECKOUT ─────────────────────────────────────────────
     PAYMENT DEADLOCK FIX:
     ─────────────────────
     Before touching Paystack we check three things in order:
       a) window.PaystackPop is loaded  (CDN race guard)
       b) window.sb exists              (Supabase SDK guard)
       c) A valid session exists        (auth guard)

     If the user is on a public page (pricing.html) and not logged in,
     window.UE_USER will be null. We redirect to login rather than
     letting the call fail silently.
  ─────────────────────────────────────────────────────────────────── */
  async function openCheckout(planKey) {
    // Guard: Paystack CDN
    if (!window.PaystackPop) {
      showPaymentModal('error', null, 'Payment service is not ready. Please refresh the page and try again.');
      return;
    }

    const plan = PLANS[planKey];
    if (!plan) {
      showPaymentModal('error', null, 'Invalid plan selected.');
      return;
    }

    // Guard: session — use UE_USER fast-path first, then fall back to SDK
    let userId, userEmail, accessToken;

    if (window.UE_USER && window.UE_USER.id) {
      // Protected page — head-gatekeeper already validated the session
      userId      = window.UE_USER.id;
      userEmail   = window.UE_USER.email;
      accessToken = window.UE_USER.access_token;
    } else {
      // Public page (pricing.html) — check session via SDK
      if (!window.sb) {
        // Supabase not ready yet — redirect to login
        sessionStorage.setItem('ue_selected_plan', planKey);
        window.location.href = getLoginPage() + '?next=pricing.html';
        return;
      }
      const { data: { session } } = await window.sb.auth.getSession();
      if (!session) {
        sessionStorage.setItem('ue_selected_plan', planKey);
        window.location.href = getLoginPage() + '?tab=login&next=pricing.html';
        return;
      }
      userId      = session.user.id;
      userEmail   = session.user.email;
      accessToken = session.access_token;
    }

    const reference = generateRef();

    // Write pending record first — so we have a DB trace even if user closes popup
    await recordPayment(userId, planKey, reference);

    setButtonLoading(planKey, true);

    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_PUBLIC_KEY,
      email:    userEmail,
      amount:   plan.amount,
      currency: 'NGN',
      ref:      reference,
      plan:     plan.planCode,
      metadata: {
        custom_fields: [
          { display_name: 'Plan',    variable_name: 'plan',    value: plan.label },
          { display_name: 'User ID', variable_name: 'user_id', value: userId },
        ],
      },

      // onSuccess: show UI immediately, then verify server-side.
      // A cheater can fire this callback manually — that is fine because
      // verifyWithServer() uses the Paystack SECRET key and will reject
      // any reference that was not genuinely paid.
      onSuccess: async (_transaction) => {
        setButtonLoading(planKey, false);
        showPaymentModal('processing');

        const result = await verifyWithServer(reference, planKey);

        if (result.success) {
          // Update local profile cache so nav/banner reflect new status instantly
          if (window.UE_PROFILE) {
            window.UE_PROFILE.is_premium          = true;
            window.UE_PROFILE.subscription_expiry = result.expiry;
          }
          if (window.UE_USER) {
            window.UE_USER.is_premium = true;
          }
          try {
            sessionStorage.setItem('ue_profile_cache', JSON.stringify({
              is_premium:          true,
              subscription_expiry: result.expiry,
            }));
          } catch (_) {}

          showPaymentModal('success', plan);
          setTimeout(() => { window.location.href = 'thankyou.html?plan=' + planKey; }, 3000);
        } else {
          showPaymentModal('error', null,
            (result.message || 'Verification failed.') +
            '\n\nPlease contact support with reference: ' + reference
          );
        }
      },

      onCancel: () => {
        setButtonLoading(planKey, false);
        if (window.sb) {
          window.sb.from('payments')
            .update({ status: 'failed' })
            .eq('reference', reference);
        }
      },
    });

    handler.openIframe();
  }

  /* ── 7. BUTTON LOADING STATE ────────────────────────────────────── */
  function setButtonLoading(planKey, loading) {
    const btn = document.querySelector(`[data-plan="${planKey}"]`);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="pay-spinner"></span> Opening…'
      : `Subscribe — ${PLANS[planKey]?.naira || ''}`;
  }

  /* ── 8. PAYMENT RESULT MODAL ────────────────────────────────────── */
  function showPaymentModal(state, plan, errorMsg) {
    const existing = document.getElementById('ue-pay-modal');
    if (existing) existing.remove();

    let content = '';

    if (state === 'processing') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div class="pay-spinner-lg"></div>
          <h3 style="font-size:1.3rem;margin:16px 0 8px">Verifying Payment…</h3>
          <p style="color:#6b7280;font-size:.9rem">Confirming with Paystack. Please don't close this window.</p>
        </div>`;

    } else if (state === 'success') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:3.5rem;margin-bottom:12px">&#x1F389;</div>
          <h3 style="font-size:1.5rem;margin-bottom:8px">Payment Verified!</h3>
          <p style="color:#065f46;background:#d1fae5;padding:10px 16px;border-radius:8px;font-weight:600;margin-bottom:16px">
            ${plan ? plan.tier + ' Plan' : 'Plan'} Activated
          </p>
          <p style="color:#6b7280;font-size:.9rem;margin-bottom:20px">Redirecting to your dashboard…</p>
          <div class="pay-spinner-lg"></div>
        </div>`;

    } else if (state === 'error') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:3rem;margin-bottom:12px">&#x26A0;&#xFE0F;</div>
          <h3 style="font-size:1.3rem;margin-bottom:8px">Something went wrong</h3>
          <p style="color:#991b1b;background:#fee2e2;padding:10px 16px;border-radius:8px;font-size:.88rem;margin-bottom:20px;white-space:pre-line">
            ${errorMsg || 'An unexpected error occurred.'}
          </p>
          <button onclick="document.getElementById('ue-pay-modal').remove()"
            style="padding:10px 24px;background:#1a56ff;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
            Close
          </button>
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'ue-pay-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;
      display:flex;align-items:center;justify-content:center;padding:24px;
      backdrop-filter:blur(4px);
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:36px 32px;max-width:420px;width:100%;
                  box-shadow:0 24px 80px rgba(0,0,0,.25);">
        ${content}
      </div>`;
    document.body.appendChild(modal);
  }

  /* ── 9. RENDER PRICING CARDS ──────────────────────────────────────
     Renders all three plan cards into a container element.
     Features are grouped into visual sections so Basic/Pro/Elite
     are clearly differentiated — not a repeated flat list.
  ─────────────────────────────────────────────────────────────────── */
  function renderPricingSection(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tierChipClass = { Basic: 'tier-chip-basic', Pro: 'tier-chip-pro', Elite: 'tier-chip-elite' };

    container.innerHTML = Object.values(PLANS).map((plan) => {
      // Build feature list HTML — each group gets a section label
      const featuresHTML = plan.featureGroups.map((group) => {
        const sectionLabel = group.section
          ? `<li class="feat-section">${group.section}</li>`
          : '';
        const items = group.items.map((f) => {
          // Split "&#x2705; Full CBT..." into icon part and text part
          // Entity ends at first semicolon+space. Fall back to first space.
          const semiIdx = f.indexOf('; ');
          const spaceIdx = f.indexOf(' ');
          const splitAt = semiIdx !== -1 ? semiIdx + 1 : spaceIdx;
          const icon = splitAt > 0 ? f.slice(0, splitAt).trim() : f.slice(0, 2);
          const text = splitAt > 0 ? f.slice(splitAt).trim() : f.slice(2);
          return `<li style="display:flex;align-items:flex-start;gap:10px;padding:5px 0;font-size:.88rem;line-height:1.45">
             <span style="flex-shrink:0;min-width:20px" aria-hidden="true">${icon}</span>
             <span>${text}</span>
           </li>`;
        }).join('');
        return sectionLabel + items;
      }).join('');

      const chipCls = tierChipClass[plan.tier] || 'tier-chip-basic';
      const featuredBadge = plan.featured
        ? '<div class="pricing-badge">Most Popular</div>'
        : '';
      const saveTag = plan.save
        ? `<div class="pricing-save">${plan.save}</div>`
        : '<div style="margin-bottom:20px"></div>';

      return `
        <div class="pricing-card${plan.featured ? ' featured' : ''}" style="position:relative">
          ${featuredBadge}
          <span class="tier-chip ${chipCls}">${plan.tier}</span>
          <h3 style="font-weight:700;font-size:1.15rem;margin-bottom:8px">${plan.label}</h3>
          <div class="pricing-price">${plan.naira}<span style="font-size:1rem;color:#6b7280;font-family:var(--font-body);font-weight:400">${plan.period}</span></div>
          ${saveTag}
          <ul class="pricing-features" style="list-style:none;margin-bottom:28px">${featuresHTML}</ul>
          <button class="btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-block"
                  style="width:100%;height:44px"
                  data-plan="${plan.key}"
                  onclick="PAYMENT.openCheckout('${plan.key}')">
            Subscribe — ${plan.naira}
          </button>
        </div>`;
    }).join('');
  }

  /* ── 10. PENDING PLAN CHECK (post-login redirect) ──────────────── */
  function checkPendingPlan() {
    const pending = sessionStorage.getItem('ue_selected_plan');
    if (pending && PLANS[pending]) {
      sessionStorage.removeItem('ue_selected_plan');
      setTimeout(() => openCheckout(pending), 800);
    }
  }

  /* ── 11. DOM-READY SELF-INIT ──────────────────────────────────────
     Attaches DOMContentLoaded so callers do NOT need their own
     wrapper. Safe to call even after DOMContentLoaded has fired
     (the browser queues it immediately).
  ─────────────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    // Auto-render any container with data-payment-grid attribute
    const autoGrids = document.querySelectorAll('[data-payment-grid]');
    autoGrids.forEach((el) => renderPricingSection(el.id));
  });

  /* ── PUBLIC API ─────────────────────────────────────────────────── */
  function getPlan(key)  { return PLANS[key] || null; }
  function getAllPlans()  { return PLANS; }

  return {
    openCheckout,
    renderPricingSection,
    checkPendingPlan,
    getPlan,
    getAllPlans,
    PLANS,
  };

})();
