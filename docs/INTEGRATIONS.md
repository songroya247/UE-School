# UE School — Integration Guide (Admin · Google Drive · Google Sheets)

This update adds four things without breaking anything that already
worked. Apply the SQL migration, set the two Google URLs in
`js/config.js`, and you're done. No build step, no server, still a
flat static deploy.

---

## 1. Admin pass-through (sign up normally → see premium)

**Goal:** an internal team member signs up like every other student,
then is granted admin access with a single SQL line. From that
moment they can open `classroom.html`, `cbt.html`, every premium
page, exactly as a paying user would — same UI, same data, same
flow. Nothing extra to install.

### Setup

1. Open Supabase → **SQL Editor** → New query.
2. Paste the contents of `migrations/001_admin_role_and_phone.sql`
   and click **Run**. This:
   - adds `is_admin`, `phone`, `cs_notes` columns to `profiles`,
   - creates a `public.is_admin()` helper,
   - adds the RLS policy that lets admins read every profile (so
     the master dashboard works),
   - adds an UPDATE policy so admins can save CS notes / flags.
3. Promote a user:
   ```sql
   UPDATE profiles SET is_admin = true
    WHERE email = 'ops@ueschool.com';
   ```
4. That user logs out and back in. The nav now shows an **ADMIN**
   badge, and every premium gate is silently bypassed.

### How it works in code

`js/auth-guard.js` selects `is_admin` along with `is_premium` and
treats `is_admin === true` as an active subscription. The
authoritative check is server-side via RLS — the front-end flag is
a UX hint, not a security boundary.

To revoke: `UPDATE profiles SET is_admin = false WHERE email = '…';`

### Granting normal Premium access manually

Use this when a customer paid you outside the app (bank transfer,
cash, voucher, gifted access, etc.) and you want their account
flipped to Premium for a fixed period — same as a paying user, but
without going through the gateway.

In Supabase → SQL Editor:

```sql
-- Grant Premium for 30 days
UPDATE profiles
   SET is_premium = true,
       subscription_expiry = NOW() + INTERVAL '30 days'
 WHERE email = 'student@example.com';

-- Or for a full year
UPDATE profiles
   SET is_premium = true,
       subscription_expiry = NOW() + INTERVAL '1 year'
 WHERE email = 'student@example.com';

-- Or for a specific date (exam season ends 30 Jun 2026)
UPDATE profiles
   SET is_premium = true,
       subscription_expiry = '2026-06-30'
 WHERE email = 'student@example.com';
```

To revoke immediately:

```sql
UPDATE profiles
   SET is_premium = false,
       subscription_expiry = NULL
 WHERE email = 'student@example.com';
```

To extend an already-premium user by another 30 days without
shortening their existing time:

```sql
UPDATE profiles
   SET is_premium = true,
       subscription_expiry = GREATEST(
         COALESCE(subscription_expiry, NOW()),
         NOW()
       ) + INTERVAL '30 days'
 WHERE email = 'student@example.com';
```

The user must log out and log back in for the PRO badge to appear
in their nav. The premium gate (`auth-guard.js`) re-checks
`subscription_expiry` against the current time on every protected
page load, so an expired account silently drops back to Free with
no extra cleanup needed.

> **Difference from `is_admin`**: `is_premium` is a normal paying
> account — it expires, it counts toward your revenue numbers in
> the dashboard, and it does **not** unlock the master dashboard.
> `is_admin` is a staff-only flag that bypasses the premium gate
> AND grants access to `admin-dashboard.html`. Use the right one
> for the situation.

---

## 2. Master Dashboard (`admin-dashboard.html`)

Already shipped. With migration 001 applied it now also shows:

- **Phone** column + click-to-call button (`tel:…`)
- **Score / Grade** auto-formatted by exam type (JAMB → score,
  WAEC/NECO → grade letter)
- **At-Risk Alerts** panel with a one-click Call button
- **CS Notes** textarea per user (saved back to `profiles.cs_notes`
  by the admin update policy)
- **Top Users** leaderboard

Open `admin-dashboard.html`, enter the same Supabase URL + anon
key from `js/config.js` once, and the table populates.

---

## 3. JAMB vs WAEC/NECO — separation by exam type

The signup wizard already shows the correct goal field
conditionally (Step 2 of the form):

| User picks   | Field shown                       | Profile column            |
| ------------ | --------------------------------- | ------------------------- |
| JAMB         | "Target JAMB Score" (200..330+)   | `target_score` (integer)  |
| WAEC / NECO  | "Target WAEC/NECO Grade"          | `target_grade` (text)     |
| Both         | Both — they're independent goals  | both columns              |
| Post-UTME    | "Target Post-UTME Score"          | (folded into target_score)|

Downstream pages now respect this:

- **Dashboard** (`js/dashboard.js`) — JAMB-only users see "Predicted
  JAMB Score / 400". WAEC/NECO-only users see "Predicted Grade A1..F9"
  and the score widget never appears. Mixed users see accuracy %.
- **Report** (`report.html`) — same conditional rendering, so a
  WAEC student never sees an irrelevant "/ 400" number.
- **CBT** (`cbt.html`) — the question filter passes the user's
  selected `examType` so a WAEC student is never served JAMB-only
  past papers when running a single-exam mock.
- **Master dashboard** (`admin-dashboard.html`) — Score/Grade column
  is dynamic per row.

Nothing else to set up; this just works once a user picks their
exams at signup. Existing users will keep whatever was on their
profile; they can change it on `dashboard.html` → Settings.

### Improving signups

Step 1 of signup now also collects **Phone (WhatsApp)** so customer
service can call. It's optional — empty is fine — but encouraged
with copy on the form.

---

## 4. Google Drive (videos) + Google Sheets (questions)

### A. Videos via Google Drive

The classroom player already accepts a `driveId` per topic and
embeds `https://drive.google.com/file/d/FILE_ID/preview`. The new
`js/gdrive-video.js` is a tiny helper that accepts any of:

- a raw file ID,
- a full share URL `https://drive.google.com/file/d/.../view`,
- an `?id=` URL.

To wire your library:

1. Drop every lesson video into one Google Drive folder.
2. Right-click each file → **Share → Anyone with the link → Viewer**.
3. In `js/classroom.js`, give each topic a `driveId`:
   ```js
   { id:'me-2', title:'Newton\'s Laws', duration:'14:08',
     driveId:'1AbCdEfGhIjKlMnOpQrStUvWxYz', premium:true }
   ```
   Or use the helper in your own page:
   ```html
   <iframe src="${GDRIVE_VIDEO.embedUrl('FILE_ID_OR_URL')}"
           allow="autoplay" allowfullscreen></iframe>
   ```
4. Optional: paste the parent folder ID into
   `UE_CONFIG.GOOGLE_DRIVE_VIDEO_FOLDER_ID` so future automation
   can list it.

> **Why Drive and not YouTube?** Drive lets you control sharing
> permissions, hide the file from search, and pull it down at any
> time. The trade-off is no DRM — Drive videos can still be
> screen-recorded.

### B. Questions via Google Sheets (with images)

**Yes, Google Sheets can hold questions with images.** Sheets
itself can't ship images inside a CSV cell, but it can hold an
**image URL** in a plain text column, and the CBT player will
render the image above the question. The recommended pattern:

1. Upload each question image to the same Drive folder as your
   videos. Right-click → Share → Anyone with the link.
2. Copy the file's share URL (or just the file ID) into the
   `image_url` column of the Sheet. `gdrive-video.js` normalises
   it to a renderable `?export=view&id=…` link automatically.

#### Sheet structure

| id   | subject     | topic       | exam_type | year | text                                  | opt_a | opt_b | opt_c | opt_d | ans | explanation                  | image_url                                      |
| ---- | ----------- | ----------- | --------- | ---- | ------------------------------------- | ----- | ----- | ----- | ----- | --- | ---------------------------- | ---------------------------------------------- |
| m101 | mathematics | Quadratics  | JAMB      | 2023 | Solve x² − 5x + 6 = 0                 | 2 or 3| -2,-3 | 1,6   | -1,-6 | A   | (x−2)(x−3)=0                  |                                                |
| p014 | physics     | Optics      | WAEC      | 2022 | What is the angle of incidence here?  | 30°   | 45°   | 60°   | 90°   | B   | Law of reflection: i = r      | https://drive.google.com/file/d/AAAA/view      |

Notes:

- `ans` accepts `0..3`, `A..D`, or the literal option text.
- `image_url` is optional. Empty = text-only question.
- `year` is optional.
- New rows are picked up after the in-memory cache expires
  (default 30 min) — or call `GSHEET_QUESTIONS.clearCache()` from
  the console.

#### Publish the sheet

1. **File → Share → Anyone with the link → Viewer**.
2. **File → Publish to web → choose the sheet → CSV → Publish**.
3. Copy the URL it gives you (`…/pub?output=csv`).
4. Paste it into `js/config.js`:
   ```js
   GOOGLE_SHEET_QUESTIONS_CSV_URL:
     'https://docs.google.com/spreadsheets/d/e/XXXX/pub?output=csv',
   ```
5. Reload `cbt.html`. The question bank is now your sheet.

#### Routing rules

`js/questions.js` decides where to fetch from in this order:

1. If `GOOGLE_SHEET_QUESTIONS_CSV_URL` is set → **Google Sheets**.
2. Else if `LOCAL_ONLY === false` → Supabase RPC `fetch_questions`.
3. Else → bundled local bank (the original fallback).

A failure at step 1 falls through to step 2 or 3 transparently, so
a flaky network never breaks an exam.

#### Security note

Because Sheets is published public-CSV, the correct answer column
is technically visible to a determined student who guesses your
URL. Two good options if that matters:

- Keep using the Supabase RPC for **graded** sessions (it never
  returns the answer key) and use Sheets only for **practice**.
- Or split the sheet: one publish-to-web tab without the `ans`
  column for the client, and a private master tab you grade
  against via a small Apps Script endpoint.

---

## File map of changes

```
migrations/001_admin_role_and_phone.sql   NEW  schema + RLS for admin/CS
js/config.js                              EDIT v3 — admin + Google URLs
js/auth-guard.js                          EDIT  honors is_admin → premium
js/auth.js                                EDIT  saves phone at signup
js/questions.js                           EDIT  prefers Google Sheets bank
js/gdrive-video.js                        NEW   Drive video URL helper
js/gsheet-questions.js                    NEW   Sheets→questions adapter
login.html                                EDIT  phone field at step 1
report.html                               EDIT  conditional JAMB/WAEC
docs/INTEGRATIONS.md                      NEW   this guide
docs/CHANGELOG.md                         NEW
```

## Deploying

It's still a flat static site:

- Drop the whole folder on GitHub Pages, Netlify, Cloudflare Pages,
  Vercel, or any static host.
- No build step. No server. Supabase is the only backend.
- Make sure the deploy URL is added under
  Supabase → **Authentication → URL Configuration → Site URL** and
  **Redirect URLs**, otherwise the email-confirm link will 404.


  ## Forcing UTF-8 on stubborn hosts

  If after uploading you still see "â€¢", "ðŸ'ï" or "â†'" anywhere
  on the site, the host is overriding the in-document
  `<meta charset="UTF-8">` with a Latin-1 `Content-Type` header.

  The bundle ships three files at the web root that fix this on the
  common static hosts — make sure they were uploaded:

  | Host                              | File           | Notes                              |
  | --------------------------------- | -------------- | ---------------------------------- |
  | Apache, cPanel, most shared hosts | `.htaccess`    | Hidden file — verify it transferred |
  | Netlify, Cloudflare Pages         | `_headers`     | Plain text, applied at the edge    |
  | Netlify (clean URLs only)         | `_redirects`   | Maps `/dashboard` → `/dashboard.html` |

  ### Hosts that ignore those files

  - **Nginx (no `.htaccess` support).** Add to your server block:
    ```nginx
    charset utf-8;
    charset_types text/html text/css application/javascript application/json image/svg+xml;
    ```
  - **Vercel.** Create `vercel.json` with:
    ```json
    { "headers": [{
        "source": "/(.*).html",
        "headers": [{ "key": "Content-Type", "value": "text/html; charset=utf-8" }]
    }]}
    ```
  - **GitHub Pages, S3 + CloudFront, Firebase Hosting.** Each has its
    own metadata mechanism — search "<host name> set Content-Type
    charset utf-8".

  ### Belt-and-braces

  Even when the host is misconfigured, every visible emoji in the
  HTML is now an HTML numeric entity (`&#x1F441;` etc.) and every
  emoji in JavaScript is a Unicode escape (`'\uD83D\uDC41'`). So
  the page should render correctly even before the server fix lands.
  The host fix is still recommended — fonts, dashes and bullets
  inside dynamic content (e.g. user-supplied notes, sheet rows) are
  served as raw UTF-8 and depend on the correct charset header.
  