/* ═══════════════════════════════════════════════════════════════════
   UE School — js/config.js  (v3 — Admin + Google Drive/Sheets)
   Single source of truth for all environment-level constants.
   Frozen at runtime — no script may overwrite these values.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (window.UE_CONFIG) return;

  const _config = {
    // ── Supabase ──────────────────────────────────────────────────
    SUPABASE_URL:  'https://nmkuujtupgcgxzxbenti.supabase.co',
    SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3V1anR1cGdjZ3h6eGJlbnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njg2NDYsImV4cCI6MjA5MjQ0NDY0Nn0.89PvF3HdNL5FPwsyQoZQrmeQxwgpmDCFBjqVA_lBY_w',

    // ── App ───────────────────────────────────────────────────────
    APP_NAME:      'UE School',
    LOGIN_PAGE:    'login.html',
    PRICING_PAGE:  'pricing.html',

    PROTECTED_PAGES: [
      'dashboard.html', 'classroom.html', 'cbt.html', 'report.html',
      'admin-dashboard.html', 'admin-actions.html', 'tutor.html',
      'study-guides.html', 'daily-quiz.html'
    ],
    // NOTE (v3.1): pages no longer hard-redirect non-premium users.
    // Instead, the premium "tools" do per-feature gating so a free
    // registered user can sample one video, one CBT test, etc. before
    // being sent to the payment page. See FREE_SAMPLE below + the
    // gating in classroom.js / cbt.html / study-guides.html.
    PREMIUM_PAGES:    [],
    ADMIN_ONLY_PAGES: ['admin-dashboard.html', 'admin-actions.html'],

    // ── Free-tier sample limits ───────────────────────────────────
    // Registered users who have NOT yet paid can try every premium
    // tool exactly once as a quality sample. After they spend their
    // sample, the next click on that tool sends them to PRICING_PAGE.
    // The 1-on-1 tutor is exempt — it is always reachable so prospects
    // can talk to a human before paying.
    FREE_SAMPLE: {
      VIDEOS_PER_ACCOUNT: 1,   // total videos a free user can watch
      CBT_PER_ACCOUNT:    1,   // total CBT sessions a free user can run
      GUIDES_PER_ACCOUNT: 1,   // total study-guide PDFs a free user can open
    },

    // ── Admin pass-through ────────────────────────────────────────
    // Any account whose `is_admin` column is TRUE in `profiles` is
    // automatically treated as PREMIUM by auth-guard.js — no separate
    // login, no duplicate account. They sign up like a normal user
    // and then a single SQL UPDATE flips the flag.
    //
    // The list below is an OPTIONAL fallback "allow-list" by email
    // for the very first bootstrap, before the column exists in
    // their profile row. Leave empty in production.
    ADMIN_EMAILS: [
      // 'founder@ueschool.com',
    ],

    // ── Google Drive — videos ─────────────────────────────────────
    // Each lesson topic in classroom.js can already declare a
    //   { driveId: 'FILE_ID' }
    // and the player auto-embeds:
    //   https://drive.google.com/file/d/FILE_ID/preview
    //
    // To use a SHARED FOLDER as your video library, drop the folder
    // ID here and use GDRIVE_VIDEO.embedUrl(fileId) helper.
    // Make every video file "Anyone with the link → Viewer".
    GOOGLE_DRIVE_VIDEO_FOLDER_ID: '',  // e.g. '1AbCdEfGhIjKlMnOpQrStUvWxYz'

    // ── Google Sheets — questions bank ────────────────────────────
    // 1. Build a Google Sheet with these columns (header row required):
    //      id | subject | topic | exam_type | year | text | opt_a | opt_b | opt_c | opt_d | ans | explanation | image_url
    //    `ans` is 0..3 (index of the correct option). `image_url`
    //    is OPTIONAL — paste a public Drive image URL or any https
    //    image; the CBT player will render it above the question.
    // 2. File → Share → "Anyone with the link" → Viewer.
    // 3. File → Publish to web → Sheet1 → CSV → copy the URL.
    // 4. Paste that CSV URL below.
    //
    // Leaving this blank disables the Sheets path; questions.js then
    // falls back to the Supabase RPC + local bank as before.
    GOOGLE_SHEET_QUESTIONS_CSV_URL: '',

    // Cache the parsed sheet in memory for this many minutes
    GS_QUESTIONS_CACHE_MIN: 30,

    // ── Google Sheets — curriculum / syllabus ─────────────────────
    // Each subject lives on its own named sheet tab inside the same
    // Google Spreadsheet (or different ones — any mix works).
    //
    // HOW TO ADD A NEW SUBJECT SHEET:
    // 1. In Google Sheets, click the "+" at the bottom to add a tab.
    // 2. Rename the tab (e.g. "English", "Biology").
    // 3. File → Publish to web → select that tab → CSV → Publish.
    // 4. Copy the URL and add it to the array below.
    //
    // The gid= number in the URL identifies which tab is published.
    // All sheets must use the same column headers as the Mathematics sheet.
    //
    // Leave a slot as '' to disable it without deleting the entry.
    GOOGLE_SHEET_CURRICULUM_CSV_URLS: [
      // Mathematics
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNMrbaNyNzjOTPTx5NMh_pROLKJqWX-ya9qB7H8tJcAkwzH-OVnixp-9X27XO4Yhk-sbR7WQMzjZeF/pub?gid=0&single=true&output=csv',
      // English
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNMrbaNyNzjOTPTx5NMh_pROLKJqWX-ya9qB7H8tJcAkwzH-OVnixp-9X27XO4Yhk-sbR7WQMzjZeF/pub?gid=1130134472&single=true&output=csv',
      // Biology      ← paste published CSV URL here when ready
      '',
      // Literature   ← paste published CSV URL here when ready
      '',
    ],

    // How long to cache the curriculum sheets (minutes).
    GS_CURRICULUM_CACHE_MIN: 30,

    // ── WhatsApp support ──────────────────────────────────────────
    // International format, digits only (no '+', no spaces). Leaving
    // it blank hides every "Chat on WhatsApp" button across the app.
    WHATSAPP_SUPPORT_NUMBER: '2347037426480',
    WHATSAPP_DEFAULT_MESSAGE:
      'Hi UE School support — I need help with my account.',

    // ── 1-on-1 tutor booking ──────────────────────────────────────
    // The Tutor Staffroom is a separate sub-site that handles booking,
    // tutor profiles and live sessions. Clicking the "1-on-1 Tutor"
    // tile sends every registered user (free OR premium) here so they
    // can speak to a human before paying.
    TUTOR_BOOKING_URL: 'https://staffroom.ultimateedge.info',
    TUTOR_LEAD_TIME_DAYS: 2,

    // ── PDF Study Guides per subject ──────────────────────────────
    // ── Premium-locked PDFs ───────────────────────────────────────
    // Files live in a PRIVATE Supabase Storage bucket (locked by RLS
    // — see migrations/008_lock_study_guides.sql).  The page never
    // exposes a public URL; it asks Supabase for a 60-second signed
    // URL on click, which only succeeds for active premium users.
    //
    // Each entry: { title, path, size }
    //   path = object key inside the STUDY_GUIDES_BUCKET
    //          (e.g. "mathematics/jamb-master-guide.pdf" — match
    //           exactly the folder/filename you upload in the
    //           Supabase Storage dashboard).
    //   size = display label, free-text.
    //
    // Legacy { file: 'https://…' } entries are still supported as an
    // escape hatch for guides you intentionally want public.
    STUDY_GUIDES_BUCKET: 'study-guides',
    STUDY_GUIDES: {
      mathematics: [
        { title: 'JAMB Mathematics — Master Guide',
          path:  'mathematics/jamb-master-guide.pdf', size: '4.2 MB' },
        { title: 'WAEC/NECO Mathematics — Quick Revision',
          path:  'mathematics/waec-revision.pdf',     size: '2.8 MB' },
      ],
      english: [
        { title: 'English Language — JAMB Survival Pack',
          path:  'english/jamb-survival.pdf',         size: '3.1 MB' },
        { title: 'WAEC English — Essay & Comprehension',
          path:  'english/waec-essay.pdf',            size: '2.4 MB' },
      ],
      physics:    [{ title:'Physics — Full Syllabus Guide',  path:'physics/syllabus.pdf',    size:'5.0 MB' }],
      chemistry:  [{ title:'Chemistry — Full Syllabus Guide',path:'chemistry/syllabus.pdf',  size:'4.7 MB' }],
      biology:    [{ title:'Biology — Full Syllabus Guide',  path:'biology/syllabus.pdf',    size:'4.1 MB' }],
      economics:  [{ title:'Economics — Theory & Diagrams',  path:'economics/guide.pdf',     size:'3.6 MB' }],
      government: [{ title:'Government — Constitutions',     path:'government/guide.pdf',    size:'3.0 MB' }],
      literature: [{ title:'Literature — Set Texts Notes',   path:'literature/set-texts.pdf',size:'3.4 MB' }],
    },

    // ── Post-UTME — universities offered in the bank ──────────────
    // Add or remove freely. The CBT setup screen shows this list when
    // the student picks Post-UTME as their exam type.
    POST_UTME_UNIVERSITIES: [
      'University of Lagos (UNILAG)',
      'University of Ibadan (UI)',
      'Obafemi Awolowo University (OAU)',
      'University of Nigeria, Nsukka (UNN)',
      'Ahmadu Bello University (ABU)',
      'University of Benin (UNIBEN)',
      'University of Ilorin (UNILORIN)',
      'Lagos State University (LASU)',
      'Covenant University',
      'Babcock University',
    ],

    // ── Exam-countdown reminders ──────────────────────────────────
    // Days before exam_date at which the send-exam-reminders Edge
    // Function will email the student. Order matters only for log
    // readability; the function dedupes via last_reminder_sent_at.
    EXAM_REMINDER_DAYS: [60, 30, 14, 7, 3, 1],

    // ── News feed ─────────────────────────────────────────────────
    // Used by the "Education News & Updates" strip on the dashboard
    // (and the small ticker shown on every other page). Two sources
    // are supported — the simpler one wins:
    //
    //   1. NEWS_ITEMS — a hand-curated array. Edit this file to add
    //      or remove cards. Best for announcements you want to push
    //      yourself (exam date drops, new features, school holidays).
    //
    //   2. NEWS_FEED_URL — optional URL that returns JSON of the same
    //      shape as NEWS_ITEMS. If set AND reachable, items are
    //      MERGED in front of NEWS_ITEMS. CORS must allow the call;
    //      we silently fall back to NEWS_ITEMS on any error.
    //
    // Each item:
    //   { id, date, tag, title, body, link, source }
    //     date   ISO string (YYYY-MM-DD) — newest first sorts visually
    //     tag    short label, eg "JAMB", "WAEC", "UE School"
    //     link   optional full URL ("Read more →")
    //     source optional short publisher name shown beside the date
    NEWS_FEED_URL: '',
    NEWS_ITEMS: [
      {
        id:    'ue-2026-01',
        date:  '2026-04-20',
        tag:   'UE School',
        title: 'New 1-on-1 Tutor Staffroom is live',
        body:  'You can now book a verified UE School tutor directly from the dashboard. Free for every registered student to try.',
        link:  'https://staffroom.ultimateedge.info',
        source:'UE School',
      },
      {
        id:    'jamb-2026-01',
        date:  '2026-04-15',
        tag:   'JAMB',
        title: 'JAMB releases 2026 UTME timetable',
        body:  'JAMB has confirmed the official UTME timetable. Check your subject combinations and CBT centre as soon as possible.',
        link:  'https://www.jamb.gov.ng/',
        source:'JAMB',
      },
      {
        id:    'waec-2026-01',
        date:  '2026-04-10',
        tag:   'WAEC',
        title: 'WAEC SSCE registration window opens',
        body:  'Registration for the May/June WAEC SSCE has opened. Make sure your school submits your photo and bio data on time.',
        link:  'https://www.waecnigeria.org/',
        source:'WAEC',
      },
      {
        id:    'ue-2026-02',
        date:  '2026-04-05',
        tag:   'UE School',
        title: 'Free sample: try one CBT, one video & one PDF',
        body:  'Every newly-registered student now gets a no-charge sample of every premium tool. Like what you see? Upgrade in two taps.',
        link:  'pricing.html',
        source:'UE School',
      },
    ],
  };

  Object.defineProperty(window, 'UE_CONFIG', {
    value:        Object.freeze(_config),
    writable:     false,
    configurable: false,
    enumerable:   true,
  });
})();
