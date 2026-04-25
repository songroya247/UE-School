# UE School — Fixes Applied

## ACCESS-CONTROL HOTFIX (v5 — supersedes the bullets below)

The previous build was leaking protected pages to anonymous visitors and
giving free users ~1.8 s of usable premium content before the redirect
fired. This hotfix closes both holes.

### What changed

- `js/head-gatekeeper.js` (rewritten, v4)
  - Hides `<body>` immediately with an injected `<style>` veil so that
    a slow auth check can never flash protected content.
  - The "came from login.html" referrer escape hatch was removed; now
    only a real OAuth / email-confirm callback URL (`#access_token=…`,
    `?code=…`, `?token_hash=…`) is allowed through without a session.
    Hitting Back after a logout no longer leaks the page.
  - Hard expiry check: if `expires_at` is in the past and there is no
    refresh token, the session is treated as missing.
  - Optimistic premium pre-redirect: for `classroom.html` / `cbt.html`
    we read the cached profile and bounce known-non-premium users to
    `pricing.html` BEFORE the page renders.
  - Optimistic admin pre-redirect for `admin-dashboard.html` and
    `admin-actions.html`.
  - `PROTECTED_PAGES` default now includes the two admin pages.

- `js/auth-guard.js`
  - The premium gate now redirects IMMEDIATELY (no `setTimeout(…, 1800)`).
    The veil stays in place until every gate has passed, so free
    users never see a frame of the premium page.
  - New `enforceAdminGate()` runs before `enforcePremiumGate()` for any
    page in `ADMIN_ONLY_PAGES`. Non-admins land on `dashboard.html`.
  - The "redirect reason" message is stashed in `sessionStorage`
    under `ue_premium_redirect_msg`; `pricing.html` shows it in the
    bottom toast so the user knows why they were sent there.

- `js/config.js`
  - `PROTECTED_PAGES` now contains the admin pages.
  - New `ADMIN_ONLY_PAGES` list.

- `admin-dashboard.html`
  - Now loads `config.js` + `head-gatekeeper.js` in `<head>` and
    `auth-guard.js` after the Supabase SDK.
  - Calls `AUTH_GUARD.init()` on boot so the authoritative DB-backed
    `is_admin` check runs before the PIN gate is even visible.
  - `<meta name="robots" content="noindex,nofollow">` added.

- `pricing.html`
  - Reads `ue_premium_redirect_msg` and shows it in the toast on load.

### Behaviour after this patch

| Visitor                          | dashboard.html | classroom.html / cbt.html | admin-dashboard.html |
|----------------------------------|----------------|---------------------------|----------------------|
| Anonymous (never signed up)      | → login.html   | → login.html              | → login.html         |
| Signed up, no active subscription| ✓ allowed      | → pricing.html (toast)    | → dashboard.html     |
| Active subscriber                | ✓ allowed      | ✓ allowed                 | → dashboard.html     |
| `is_admin = true`                | ✓ allowed      | ✓ allowed                 | ✓ allowed            |

### One thing you still need to do in Supabase

Make sure `profiles.is_premium` defaults to `false` (the master schema
already does this — `000_master_schema.sql` line 50). Anyone who is
currently set to `true` in the DB without a paid plan was the source of
the previous "free users see premium pages" reports.

---

# UE School — Fixes Applied (previous notes)

This patch fixes the three reported bugs and a handful of related issues
spotted during the code review. Below is what changed, why, and the
**three Supabase / Paystack steps you must do** before the fixes take
effect in production.

---

## 1. Blank dashboard / classroom / CBT pages — FIXED

**Root cause:** `js/head-gatekeeper.js` could not parse the Supabase
auth token written by current Supabase JS v2 builds (base64-prefixed
and/or chunked across multiple `localStorage` keys), then it injected a
`body { visibility:hidden !important }` veil that downstream scripts
could not always remove.

**Files changed**
- `js/head-gatekeeper.js` — rewritten. Handles every Supabase v2
  storage shape (plain JSON, `base64-…`, chunked array). The body
  veil is GONE — the SDK refreshes silently in the background.
- `js/auth-guard.js` —
  - profile fetch uses `.maybeSingle()` (no more PGRST116 false errors)
  - profile fetch retries once after 500 ms (absorbs replication lag
    right after email confirm — the loop-to-login bug)
  - profile auto-create now ALWAYS sets `email`, runs at most once
    per tab, and falls back to a clear toast instead of looping
  - `logout()` now wipes every `ue_*` sessionStorage key

**No action required** — just deploy the new files.

---

## 2. Signup confirmation email never arrives — REQUIRES SUPABASE CONFIG

The code is fine. The cause is the Supabase project's email setup.
Do these three things in the Supabase dashboard:

### 2a. Turn confirmation ON
**Authentication → Sign In / Providers → Email**
- "Confirm email" → **ON**

(If this is OFF, `signUp` returns a session immediately and the user
is auto-redirected to dashboard — no email is ever sent.)

### 2b. Set up custom SMTP
**Authentication → Emails → SMTP Settings**

The built-in Supabase SMTP is rate-limited to ~3–4 emails/hour and
delivers to spam most of the time. Use Resend (recommended), SendGrid,
Postmark, or AWS SES. Free tiers are enough for hundreds of signups
per day.

### 2c. Whitelist the redirect URL
**Authentication → URL Configuration → Redirect URLs**

Add **every** URL where you host the site, e.g.:
- `https://www.ueschool.com/confirm.html`
- `https://www.ueschool.com/reset-password.html`
- `https://ueschool.netlify.app/confirm.html` (if you also use a staging URL)

If the URL the browser sends is not in this list, Supabase silently
drops it and the email's link goes to the project default Site URL.

### Code-side improvement (also applied)
- `confirm.html` — race fixed: the `_confirmHandled` lock is now set
  **before** the `await`, so the `onAuthStateChange` listener and the
  500 ms fallback IIFE can no longer both run `handlePostConfirm`.

---

## 3. Payment link does not work — FIXED + REQUIRES TWO SETUP STEPS

### Code changes (already applied)
- `js/payment.js` — `verifyWithServer` now ALWAYS pulls a fresh access
  token from the SDK (the cached token on `UE_USER` could be stale
  after a silent refresh, causing the Edge Function to 401).
- `supabase/functions/verify-payment/index.ts` — **NEW.** Server-side
  verification using your Paystack secret key. Includes:
  - bearer-token auth check
  - amount-tamper protection (re-derives amount from plan key)
  - cross-user reference protection
  - idempotency (re-verifying the same reference is safe)
  - subscription extension (paying again before expiry adds time
    instead of resetting the clock)
- `supabase/functions/verify-payment/deno.json` — import map.
- `migrations/003_payments_table.sql` — **NEW.** Creates the
  `payments` table, adds `profiles.subscription_expiry`, and the RLS
  policies that let users insert their own pending row but never
  flip themselves premium.

### What you must do

#### 3a. Apply the SQL migration
**Supabase → SQL Editor → New Query** → paste the entire contents
of `migrations/003_payments_table.sql` → **Run**.

(If you have not yet applied `001_admin_role_and_phone.sql`, run that
first — migration 003 references the `public.is_admin()` function it
defines.)

#### 3b. Deploy the Edge Function
From your local machine, in the project root:
```bash
supabase functions deploy verify-payment
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxx
# Optional — restrict CORS to your production domain:
supabase secrets set CORS_ORIGIN=https://www.ueschool.com
```
Get the secret key from **Paystack → Settings → API Keys & Webhooks →
Secret Key**. Use the **live** key for production, **test** key for
staging.

That's it. The "Subscribe" button now triggers Paystack → server
verifies via Paystack API → the user's profile is flipped to
`is_premium = true` with the correct `subscription_expiry`.

---

## Other issues spotted during the review (not fixed — your call)

| # | Severity | Issue | Recommendation |
|---|----------|-------|----------------|
| A | Medium | The Paystack public key is hardcoded in `js/payment.js`. | Move it to `js/config.js` next to `SUPABASE_ANON`. Public keys are safe to expose, but having one place for keys helps when you switch to test mode. |
| B | Medium | GitHub Pages does not honour `_redirects` (Netlify) or `.htaccess` (Apache). Pretty URLs like `/dashboard` will 404 there. | Either keep `.html` in every link, or host on Netlify / Cloudflare Pages where `_redirects` works. |
| C | Low | `payments.email` and `payments.raw` are stored — make sure your privacy policy mentions you keep payment metadata. | Update `privacy.html`. |
| D | Low | No CSP headers. | Add a `Content-Security-Policy` header in `_headers` once Paystack/Supabase domains are stable. |
| E | Low | `head-gatekeeper.js` redirects to login when there is no session. On a sign-out flow the referrer is set, so the redirect message is suppressed — fine. But a manually-cleared localStorage on a protected page will still flash white for a frame before the redirect. Acceptable. | – |

---

## 4. Paystack webhook — auto-renewals, cancels, refunds — NEW

Without a webhook, Paystack's recurring charges never reach your
database. A user paying for a monthly subscription would silently lose
access on day 30 even though Paystack billed them — they'd have to
log in and pay again. A refund would not revoke access either.

### Code added
- `supabase/functions/paystack-webhook/index.ts` — verifies the
  Paystack `x-paystack-signature` (HMAC SHA-512 of the raw body),
  then handles:
  - `charge.success` — extends `subscription_expiry`
  - `subscription.disable` / `subscription.not_renew` — marks
    `status = 'CANCEL_SCHEDULED'` (lets the user keep the time
    they already paid for)
  - `invoice.payment_failed` — marks `status = 'PAYMENT_FAILED'`
  - `refund.processed` — flips `is_premium = false` immediately
- `supabase/functions/paystack-webhook/deno.json` — import map.
- `migrations/004_payment_status_extras.sql` — relaxes the
  `profiles.status` check so the new lifecycle states are accepted,
  and indexes `profiles.email` for the webhook lookup.

### What you must do

#### 4a. Apply migration 004
**Supabase → SQL Editor** → paste `migrations/004_payment_status_extras.sql`
→ **Run**.

#### 4b. Deploy the webhook function
```bash
supabase functions deploy paystack-webhook --no-verify-jwt
```
The `--no-verify-jwt` flag is required — Paystack does not send a JWT,
authentication is via the signature header which the function checks
itself.

#### 4c. Register the webhook URL with Paystack
**Paystack Dashboard → Settings → API Keys & Webhooks**
- Webhook URL: `https://<project-ref>.functions.supabase.co/paystack-webhook`
- Click **Save**, then **Send Test Event**. You should see a `200 OK`.

That's it. From now on, Paystack pushes every relevant event and the
user's status stays in sync automatically.

---

## 5. Admin actions — grant/revoke premium, view payments, audit log — NEW

A clean, properly-secured admin page at `/admin-actions.html` for the
day-to-day support workflow: look up a user by email, see their
payment history, and grant or revoke premium with one click. Every
action is logged to an audit table.

### Why this is separate from the existing `admin-dashboard.html`
The existing dashboard asks you to paste your Supabase URL and key
into a browser form and stores them in `localStorage` — anyone with
access to the device can extract them, and the suggested RLS policy
(`USING (true)`) opens reads to **every** logged-in user, not just
admins. It also conflates `is_premium` with admin permissions.

This new page fixes all of that:
- Uses the **logged-in user's own Supabase session** (no pasted keys).
- Re-checks `is_admin` **server-side** in the Edge Function — so even
  if RLS is misconfigured, non-admins can't escalate.
- Introduces a real `is_admin` column, separate from `is_premium`.

### Code added
- `migrations/005_admin.sql` — adds `is_admin BOOLEAN`, a
  `is_current_user_admin()` SECURITY DEFINER helper (avoids the
  recursive-RLS trap), policies that let admins SELECT all profiles
  and payments, an `admin_audit_log` table, and indexes.
- `supabase/functions/admin-action/index.ts` — handles
  `grant_premium`, `extend`, `revoke_premium`, and `mark_refunded`.
  Verifies the caller's JWT, re-checks `is_admin`, then writes via
  service role and logs every action.
- `supabase/functions/admin-action/deno.json` — import map.
- `admin-actions.html` + `js/admin-actions.js` — the UI: search by
  email → user card → quick-grant buttons (30 / 90 / 365 / custom) →
  revoke → recent payments table → site-wide audit log feed.

### What you must do

#### 5a. Apply migration 005
**Supabase → SQL Editor** → paste `migrations/005_admin.sql` → **Run**.

#### 5b. Bootstrap your first admin
Still in the SQL Editor:
```sql
UPDATE profiles SET is_admin = TRUE WHERE email = 'you@example.com';
```

#### 5c. Deploy the function
```bash
supabase functions deploy admin-action
```
(Default JWT-verification is fine here — admins must be logged in.)

#### 5d. Visit the page
Log in as the admin user, then navigate to `/admin-actions.html`.

---

## Files changed by this patch

```
js/head-gatekeeper.js                            (rewritten)
js/auth-guard.js                                 (edited — profile fetch + logout)
js/payment.js                                    (edited — fresh token)
js/admin-actions.js                              (NEW)
admin-actions.html                               (NEW)
confirm.html                                     (edited — race lock)
migrations/003_payments_table.sql                (NEW)
migrations/004_payment_status_extras.sql         (NEW)
migrations/005_admin.sql                         (NEW)
supabase/functions/verify-payment/index.ts       (NEW)
supabase/functions/verify-payment/deno.json      (NEW)
supabase/functions/paystack-webhook/index.ts     (NEW)
supabase/functions/paystack-webhook/deno.json    (NEW)
supabase/functions/admin-action/index.ts         (NEW)
supabase/functions/admin-action/deno.json        (NEW)
FIXES.md                                         (this file)
```

After uploading the changed files to your host and completing the
five setup steps (3 SQL migrations + 3 function deploys + 1 Paystack
webhook URL + your first admin bootstrap), all three reported bugs
are resolved, subscriptions stay in sync automatically, and you
have a proper admin console for day-to-day support.
