# UE School — Update Notes

## v3.2 — Weekly e-mail reports + dashboard motivational quotes

### Added
- **Weekly performance e-mail report** (every Saturday, 09:00 Africa/Lagos).
  - New SQL migration `migrations/002_weekly_reports_optin.sql` adds
    `weekly_report_optin`, `email_unsub_token`, `last_weekly_email_at`
    columns to `profiles` and two RPCs (`unsubscribe_weekly_report`,
    `resubscribe_weekly_report`) callable by the public.
  - New Supabase Edge Function `supabase/functions/send-weekly-reports/`
    queries opted-in users, builds an HTML+text e-mail mirroring the
    `report.html` figures and posts to Resend. Triggered by `pg_cron`.
  - New `unsubscribe.html` — public, token-based, one-click. No login
    required. Includes a re-subscribe button.
  - `dashboard.html` — new toggle inside the *Performance Analytics*
    card so logged-in users can flip the preference too. Hides itself
    silently if migration 002 hasn't been applied yet, so the page
    keeps working in either state.
  - Setup guide: `docs/WEEKLY_REPORTS.md`.
- **Auto-rotating motivational quote ribbon** at the top of the
  dashboard.
  - New `js/quotes.js` — ~40 curated quotes, rotates every 12 s, fades
    smoothly, pauses on hover, advances on click. Zero dependencies,
    zero network calls. Loading it on any page without the ribbon
    element is a silent no-op.
  - `dashboard.html` — slim ribbon mounted at the top of `<main>`,
    plus the matching CSS in the head.

### Changed
- `dashboard.html` — additive only. Two new sections (quote ribbon,
  email-toggle row) and the matching CSS. No existing markup was
  altered, no scripts re-ordered.

### Migration
Run `migrations/002_weekly_reports_optin.sql` in Supabase SQL Editor.
Idempotent — safe to re-run.

### Deploy
Static site changes (`dashboard.html`, `js/quotes.js`,
`unsubscribe.html`) drop into the deploy folder unchanged. The
e-mail pipeline lives entirely in Supabase (Edge Function + pg_cron),
so the static host is not affected.

---

## v3.1 — Mobile / encoding hot-fixes

### Fixed
- **Mojibake on emojis & arrows** ("â€¢", "ðŸ'ï", "â†'", etc.).
  The host (e.g. cPanel / Apache shared hosting) was serving HTML
  with `Content-Type: text/html; charset=ISO-8859-1` which
  *overrides* the in-document `<meta charset="UTF-8">`.
  - **Belt:** every visible non-ASCII glyph in the HTML files
    (eye, monkey, checks, arrows, locks, bullets, em-dash, naira
    sign, geometric shapes, etc.) has been rewritten as an HTML
    numeric entity (`&#x1F441;`, `&rarr;`, `&bull;`, `&mdash;`,
    `&#x20A6;`, `&#x25B6;`, `&#x2630;`, etc.). Entities are pure
    ASCII so they survive any charset header.
  - **Braces:** every emoji *string literal* inside `<script>`
    blocks **and** in `js/*.js` has been converted to JS Unicode
    escape sequences (`'\uD83D\uDC41'`, `'\u2713'` etc.) so the
    runtime value is correct even if the JS file is mis-served.
  - **Suspenders:** new `.htaccess`, `_headers` and `_redirects`
    files at the web root force UTF-8 from compliant hosts and
    add clean-URL fallbacks. See "Server config" below.
- **`pricing.html` had no hamburger button on mobile.** Added the
  same mobile slide-down nav that `index.html` / `about.html` /
  `dashboard.html` already use. Three menu links + "Login / Sign
  Up" button now collapse behind the hamburger on screens
  ≤768 px.
- **Blank page when a logged-out visitor clicks Dashboard /
  Classroom / CBT / Report.** Two reinforcements:
  1. Added a `<noscript>` fallback at the top of every protected
     page so browsers without JS still show a "click here to log
     in" link instead of a blank screen.
  2. The new `_redirects` / `.htaccess` rules ensure links such
     as `/dashboard` (no `.html`) resolve correctly — some hosts
     strip the extension which previously produced a hard 404.

### Added — server config
- **`.htaccess`** (Apache / cPanel) — `AddDefaultCharset UTF-8`,
  per-extension charset override, `mod_rewrite` to drop `.html`,
  cache & gzip headers, custom 404.
- **`_headers`** (Netlify / Cloudflare Pages) — explicit
  `Content-Type: …; charset=utf-8` for HTML / CSS / JS plus
  `X-Content-Type-Options: nosniff`.
- **`_redirects`** (Netlify) — clean-URL fallbacks for the most
  common routes (`/dashboard`, `/login`, `/classroom`, etc.).

### How to verify after upload
1. Open `pricing.html` on a phone (or DevTools mobile mode at
   ≤768 px). The hamburger should appear and toggle the menu.
2. Hard-refresh `login.html` (Ctrl-Shift-R / Cmd-Shift-R). The
   eye icon next to the password field should be a 👁, the
   placeholder should be `••••••••`, and "Create account →"
   should have a clean right arrow — no boxes, no `â€¢`.
3. Log out, then click any nav link (Dashboard / Classroom /
   Practice). You should land on the login screen, not a blank
   page.
4. In your browser's network tab, the response headers for any
   `*.html` should now include `Content-Type: text/html;
   charset=UTF-8`. If they still show `ISO-8859-1`, your host
   is ignoring `.htaccess` — see `docs/INTEGRATIONS.md`
   ("Forcing UTF-8 on stubborn hosts").

---

## v3 — Admin role · Master CS dashboard · Sheets/Drive content sources

### Added
- **Admin pass-through.** `profiles.is_admin = true` automatically
  treats the account as a premium subscriber. No separate login,
  no duplicate account; the admin signs up like a normal student
  and then a single SQL line flips the flag.
- **Phone (WhatsApp) at signup**, surfaced in the master dashboard
  with click-to-call buttons.
- **Master dashboard policies** so the table actually reads every
  user under RLS. CS notes are persisted per user.
- **Google Drive video helper** (`js/gdrive-video.js`) — accepts a
  bare file ID, share URL or `?id=` URL.
- **Google Sheets question source** (`js/gsheet-questions.js`) —
  one CSV-published sheet drives the entire bank. Supports
  per-question images via an `image_url` column. Cached in memory
  for 30 minutes.

### Changed
- `js/auth-guard.js` selects `is_admin`, treats it as an active
  subscription, renders an ADMIN nav badge.
- `js/auth.js` writes the new `phone` field on profile create.
- `js/questions.js` prefers the Sheets source when configured;
  Supabase RPC and the local bundled bank remain as fallbacks.
- `report.html` now hides the "/ 400" JAMB widget for WAEC-only
  students and vice-versa, matching what the dashboard already did.
- `login.html` Step 1 collects phone; Step 2 already conditionally
  shows JAMB target-score vs WAEC/NECO target-grade — the wiring
  has been verified end-to-end.

### Migration
Run `migrations/001_admin_role_and_phone.sql` in Supabase SQL
Editor. Idempotent — safe to re-run.

### Deploy
No build step changed. Still a flat static site — drop the folder
on any static host.
