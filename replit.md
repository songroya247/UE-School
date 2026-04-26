# UE School

Static HTML/JS Nigerian exam-prep web app (JAMB / WAEC / NECO / Post-UTME)
backed by Supabase + Paystack. Hosted as a static site at
`ultimateedge.info`.

## Layout
- Plain HTML pages at the root: `dashboard.html`, `cbt.html`, `classroom.html`,
  `report.html`, `pricing.html`, `contact.html`, `study-guides.html`,
  `tutor.html`, etc.
- `js/` — vanilla browser modules:
  - `config.js` — single source of truth for keys, URLs, feature flags
  - `supabase.js` — boots `window.sb` from `UE_CONFIG`
  - `auth.js`, `auth-guard.js` — session bootstrapping
  - `dashboard.js` — renders every dashboard widget
  - `smartpath.js` — JAMB + WAEC/NECO predictions, queue building
  - `questions.js` + `gsheet-questions.js` — question bank (Sheets ▸ RPC ▸ local)
- `css/main.css` — shared theme tokens
- `migrations/` — numbered SQL files applied via Supabase SQL editor
- `supabase/functions/` — Deno edge functions (cron-driven jobs)

## Features (v2 — added April 2026)
1. **Topic weakness heatmap** — `dashboard.html` + `renderHeatmap()` in `dashboard.js`
2. **WAEC/NECO grade prediction** — `SMARTPATH.predictWAECGrade()` + dashboard widget
3. **PDF study guides** — `study-guides.html`; PDFs live in a private Supabase
   Storage bucket (`study-guides`) locked to active premium subscribers via RLS
   (see `migrations/008_lock_study_guides.sql`). Catalog and bucket name are
   configured in `UE_CONFIG.STUDY_GUIDES` / `UE_CONFIG.STUDY_GUIDES_BUCKET`.
4. **Post-UTME university-specific question banks** — `cbt.html` exposes a university
   selector when exam type = Post-UTME; questions filtered by `questions.university`
5. **1-on-1 tutor booking** — `tutor.html` (Calendly iframe OR fallback form writing
   to the `tutor_bookings` table)
6. **Downloadable mastery reports** — `report.html` uses jsPDF + html2canvas to
   render the visible report card to a multi-page PDF
7. **Exam-countdown reminders** — opt-in toggle on dashboard, emails sent by the
   `send-exam-reminders` Supabase edge function (cron daily)
8. **Dedicated WhatsApp support** — floating FAB on dashboard + card on contact page,
   number controlled by `UE_CONFIG.WHATSAPP_SUPPORT_NUMBER`

## Deployment / activation checklist for v2
1. Run `migrations/007_features_v2.sql` AND `migrations/008_lock_study_guides.sql`
   in the Supabase SQL editor.
   After 008 runs, open Storage → `study-guides` and upload one PDF per
   `STUDY_GUIDES[*].path` entry in `js/config.js`. Folder names = subject
   slugs (mathematics/, english/, …). Direct URLs to the bucket will 404
   for everyone — only signed URLs handed out by the page work, and only
   for premium users.
2. Set the new fields in `js/config.js`:
   - `WHATSAPP_SUPPORT_NUMBER` (international format, digits only)
   - `TUTOR_BOOKING_URL` (Calendly / Cal.com URL — leave blank for in-app form)
   - `STUDY_GUIDES` (subject → array of `{ title, path, size }`) — `path` is
     the storage object key inside `STUDY_GUIDES_BUCKET` (or use the legacy
     `{ file: 'https://…' }` shape for guides you intentionally want public)
   - `POST_UTME_UNIVERSITIES` (already populated; edit to taste)
3. Tag any university-specific questions with the `university` column in Supabase.
4. Deploy the new edge function:
   ```
   supabase functions deploy send-exam-reminders --no-verify-jwt
   ```
   Set its secrets the same way as `send-weekly-reports` (Resend key, EMAIL_FROM,
   PUBLIC_SITE_URL, CRON_SHARED_SECRET).
5. Schedule it daily in pg_cron (07:00 Africa/Lagos recommended), passing the
   `X-Cron-Secret` header.

## What we deliberately did NOT change
- Pricing tiers stay packaging-only — every paid user has equal access to all
  features per the product owner's call.
- The marketing pages (`index.html`, `pricing.html`, `about.html`) keep their
  existing copy. Update separately when the new features go live.