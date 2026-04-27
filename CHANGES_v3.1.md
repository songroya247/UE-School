# UE School — v3.1 update notes

This update is **surgical** — every change lives in the files listed
below. Drop the modified files into your existing build and re-deploy.
No database migration is required.

## Files changed

| File | What changed |
|---|---|
| `js/config.js` | `WHATSAPP_SUPPORT_NUMBER` → `2347037426480`, `TUTOR_BOOKING_URL` → `https://staffroom.ultimateedge.info`, `PREMIUM_PAGES` cleared, new `FREE_SAMPLE` + `NEWS_FEED_URL` / `NEWS_ITEMS` blocks |
| `js/auth-guard.js` | New free-sample helpers: `canSampleFeature`, `recordSampleUse`, `getFreeSampleCount`, `freeSampleLimit`, `bouncePremium` |
| `js/classroom.js` | Per-topic gating now uses the free-sample helpers — non-premium users can watch **one** video, then any further topic click sends them to `pricing.html` |
| `cbt.html` | `startExam()` now consumes a CBT sample for free users; out-of-credit users are bounced to `pricing.html` |
| `study-guides.html` | Card click consumes a guide sample for free users; out-of-credit users are bounced to `pricing.html` |
| `tutor.html` | Rebuilt as a branded launch pad that auto-redirects to **https://staffroom.ultimateedge.info**. No premium check — every registered student can reach it |
| `dashboard.html` | New "Education News & Updates" strip just under the score card; tutor tile marked `data-paywall="none"`; PDF / report tiles intercept clicks for free users |
| `js/news.js` *(new)* | Renders the news strip + an optional cross-page ticker from `UE_CONFIG.NEWS_ITEMS` |

## What free (registered, not paid) users now get

* **1 video** (any one classroom topic of their choosing) — after that, every topic click → pricing.
* **1 CBT session** — after that, "Start Session" → pricing.
* **1 PDF study guide** — after that, opening any PDF → pricing.
* **Mastery report** → pricing immediately (no sample).
* **1-on-1 Tutor** → always available, opens `staffroom.ultimateedge.info`.
* **WhatsApp support** → always available.
* **Daily Quiz / News feed / Dashboard** → always available.

The samples are tracked in `localStorage` against both the user-id and a
device key, so creating a second free account on the same browser does
not reset the sample. Premium and admin accounts bypass every check.

## How to add news items

Edit `UE_CONFIG.NEWS_ITEMS` in `js/config.js`:

```js
NEWS_ITEMS: [
  {
    id:    'jamb-2026-02',
    date:  '2026-05-01',                // ISO date — newest first sorts visually
    tag:   'JAMB',                      // colour-coded pill (JAMB / WAEC / NECO / UE School / Post-UTME)
    title: 'JAMB postpones mock exam',
    body:  'JAMB has shifted the mock UTME by one week. New date inside.',
    link:  'https://www.jamb.gov.ng/',  // optional — opens externally if http(s)
    source:'JAMB',
  },
  // …add more
]
```

If you'd rather pull live news from a JSON endpoint, set
`NEWS_FEED_URL` to that URL. The endpoint must return either an array
of items or `{ items: [...] }` in the same shape, and must allow CORS
from your domain. Local items remain as a fallback.

## How to upload your own videos

Each topic in `js/classroom.js` (inside the big `CURRICULUM` object)
accepts one of two video fields:

### Option A — YouTube (easiest)

1. Upload the video to YouTube (Public **or** Unlisted is fine).
2. Copy the 11-character ID from the URL — e.g. for
   `https://www.youtube.com/watch?v=dQw4w9WgXcQ` the ID is `dQw4w9WgXcQ`.
3. In `js/classroom.js`, find the topic and add `youtubeId: 'dQw4w9WgXcQ'`:

```js
{
  id: 'mathematics.algebra',
  title: 'Algebra Foundations',
  duration: '12 min',
  premium: false,
  youtubeId: 'dQw4w9WgXcQ',   // ← here
  content: { … },
  quiz:    [ … ],
}
```

### Option B — Google Drive (private, good for paid content)

1. Upload the MP4 to Google Drive.
2. Right-click → **Share** → "Anyone with the link" can **View**.
3. Copy the file ID from the share URL — for
   `https://drive.google.com/file/d/1AbCDeFgHiJk/view` it's `1AbCDeFgHiJk`.
4. Add `driveId: '1AbCDeFgHiJk'` to the topic object (same place as `youtubeId`).

The classroom auto-detects which field is set and embeds the
corresponding player. If neither field is set, the placeholder card is
shown ("Video lesson coming soon!") so the rest of the lesson still
works.

> Tip: keep file sizes under 200 MB and stick to MP4 (H.264 + AAC) for
> the smoothest playback on Nigerian mobile data.