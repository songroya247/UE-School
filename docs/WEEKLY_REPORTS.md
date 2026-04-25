# UE School &mdash; Weekly Performance Email Reports

Sends every opted-in student a tidy snapshot of their performance every
**Saturday morning (Africa/Lagos, 09:00)**. Each email contains a
one-click unsubscribe link. The dashboard also shows a toggle so a
logged-in user can flip the preference at any time.

This is purely additive &mdash; nothing in the existing app changes. If you
skip the setup below, the dashboard hides the toggle silently and no
emails are sent. The site keeps working exactly as before.

---

## Files added

```
migrations/002_weekly_reports_optin.sql                NEW   columns + unsubscribe RPCs
unsubscribe.html                                       NEW   public one-click unsubscribe page
supabase/functions/send-weekly-reports/index.ts        NEW   Edge Function
supabase/functions/send-weekly-reports/deno.json       NEW   import map
js/quotes.js                                           NEW   (separate feature, see below)
dashboard.html                                         EDIT  quote ribbon + email toggle
docs/WEEKLY_REPORTS.md                                 NEW   this guide
```

The Edge Function uses **[Resend](https://resend.com)** as the e-mail
provider (free tier is plenty for a school of a few hundred students).
You can swap it for SendGrid, Postmark, Mailgun or AWS SES &mdash; only the
`sendEmail()` function in `index.ts` needs editing.

---

## Setup &mdash; once, takes about 10 minutes

### 1. Apply the SQL migration

Supabase &rarr; SQL Editor &rarr; New query &rarr; paste the contents of
`migrations/002_weekly_reports_optin.sql` &rarr; **Run**. This:

- Adds `weekly_report_optin`, `email_unsub_token`, `last_weekly_email_at`
  to `profiles`.
- Backfills a unique unsubscribe token for every existing user.
- Creates `unsubscribe_weekly_report(token)` and
  `resubscribe_weekly_report(token)` RPCs that `unsubscribe.html` calls.

Idempotent &mdash; safe to re-run.

### 2. Get a Resend API key

1. Sign up at <https://resend.com> (free).
2. Verify a sending domain (or use the default `onboarding@resend.dev`
   while testing &mdash; deliverability is poor without a verified domain).
3. **API Keys** &rarr; create a key &rarr; copy it.

### 3. Set Edge Function secrets

Supabase &rarr; **Project Settings** &rarr; **Edge Functions** &rarr; **Secrets**:

| Key                  | Example value                                 |
| -------------------- | --------------------------------------------- |
| `RESEND_API_KEY`     | `re_xxxxxxxxxxxxxxxxxxxx`                     |
| `EMAIL_FROM`         | `UE School <reports@ueschool.com>`            |
| `PUBLIC_SITE_URL`    | `https://www.ueschool.com` (no trailing `/`)  |
| `CRON_SHARED_SECRET` | any long random string &mdash; e.g. `openssl rand -hex 32` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected and do
not need to be set.

### 4. Deploy the Edge Function

Install the Supabase CLI if you don&rsquo;t have it
(<https://supabase.com/docs/guides/cli>), then from the project root:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy send-weekly-reports --no-verify-jwt
```

`--no-verify-jwt` is required because the function uses its own
`X-Cron-Secret` header for auth instead of a Supabase JWT.

### 5. Smoke-test it

```bash
curl -X POST \
  -H "X-Cron-Secret: $CRON_SHARED_SECRET" \
  "https://<project-ref>.functions.supabase.co/send-weekly-reports?dry=1"
```

`?dry=1` runs the full query but does **not** send any e-mail. You
should get back something like:

```json
{ "ok": true, "dryRun": true, "candidates": 12, "sent": 12, "failed": 0 }
```

To send to **just yourself** before going live, in Supabase SQL Editor:

```sql
UPDATE profiles
   SET weekly_report_optin = false
 WHERE email <> 'you@example.com';
```

Then call the function without `?dry=1`. Re-enable everyone afterwards:

```sql
UPDATE profiles SET weekly_report_optin = true;
```

### 6. Schedule it for every Saturday

Supabase &rarr; SQL Editor &rarr; New query:

```sql
-- Make sure the extensions exist
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Save the secret + URL ONCE in the database (so the cron line stays clean)
SELECT vault.create_secret('https://<project-ref>.functions.supabase.co/send-weekly-reports',
                           'weekly_reports_url');
SELECT vault.create_secret('<your CRON_SHARED_SECRET>', 'cron_shared_secret');

-- Saturday 09:00 Lagos = Saturday 08:00 UTC (Lagos has no DST)
SELECT cron.schedule(
  'send-weekly-reports',
  '0 8 * * 6',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_reports_url'),
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To remove the schedule later: `SELECT cron.unschedule('send-weekly-reports');`

To inspect runs: `SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 10;`

---

## How users opt out

Three independent paths &mdash; all go through the same column
(`profiles.weekly_report_optin`):

| From                | How                                                           |
| ------------------- | ------------------------------------------------------------- |
| The e-mail itself   | Click **Unsubscribe** &rarr; `unsubscribe.html?token=...&confirm=1` &rarr; one click, no login. |
| The dashboard       | The **Weekly performance report by email** toggle inside the &ldquo;Performance Analytics&rdquo; card. |
| Manual (admin)      | `UPDATE profiles SET weekly_report_optin = false WHERE email = '...';`                          |

The Edge Function only e-mails users where `weekly_report_optin = true`
**and** `last_weekly_email_at` is null or older than 5 days, so no
duplicate sends if cron fires twice.

---

## How it stays surgical

- The dashboard JS that draws the toggle catches the &ldquo;column does
  not exist&rdquo; error from Supabase and just hides the row. So the
  page works whether or not migration 002 has been applied yet.
- The Edge Function never touches existing tables &mdash; it only reads
  `profiles`, `topic_mastery`, `session_scores` (already there) and
  writes one column (`last_weekly_email_at`).
- `unsubscribe.html` is a stand-alone page; nothing else links to it
  except the e-mail itself.
- Every existing user is opted in by default. If you&rsquo;d rather start
  opt-in only, change the column default in the migration to `false`
  before running it.

---

## Troubleshooting

| Symptom                                            | Likely cause                                      | Fix                                                         |
| -------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Function returns `{ "error": "unauthorized" }`     | `X-Cron-Secret` header missing or wrong           | Re-check the value matches the `CRON_SHARED_SECRET` secret  |
| Function returns `{ "error": "missing RESEND_API_KEY" }` | Secret not set / function deployed before the secret was added | Add the secret, then re-deploy the function          |
| `{ "ok": true, ..., "failed": N }` with `resend 422` | Sending domain not verified or `EMAIL_FROM` doesn&rsquo;t match a verified domain | Verify the domain in Resend or use `onboarding@resend.dev` while testing |
| Toggle doesn&rsquo;t appear on the dashboard       | Migration 002 not yet applied                     | Run the SQL migration                                       |
| pg_cron schedule never fires                       | `pg_cron` / `pg_net` extension not enabled        | `CREATE EXTENSION IF NOT EXISTS pg_cron; pg_net;`           |
| Users get duplicate emails                         | You ran the function manually after the cron     | Bookkeeping skips anyone emailed in the last 5 days &mdash; this is by design |

---

## Bonus: dashboard motivational quotes

Unrelated to email but shipped together:

- `js/quotes.js` &mdash; ~40 curated quotes, rotates every 12 s, fades
  smoothly, pauses on hover, advances on click.
- `dashboard.html` &mdash; thin ribbon at the top of the dashboard,
  marked up so the rotator file mounts into it. Loading the script
  on any other page is a silent no-op.

No setup, no dependencies, no network calls. Edit the `QUOTES` array
in `js/quotes.js` to add or remove quotes.
