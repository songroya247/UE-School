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
    // Required columns (header row):
    //   id | subject | topic | exam_type | year | grade_level |
    //   text | opt_a | opt_b | opt_c | opt_d | ans | explanation | image_url
    //
    //   grade_level : 1 = Advanced, 2 = Intermediate, 3 = Foundation
    //                 The CBT engine filters questions to the student's
    //                 current mastery level automatically.
    //   ans         : A / B / C / D  (letter) — or 0..3 (index)
    //   image_url   : OPTIONAL — paste a Google Drive File ID or any
    //                 public https image URL. The CBT renders it above
    //                 the question text. Leave blank for text-only Qs.
    //   diagram_type: OPTIONAL — geometry | graph | table | photo
    //
    // Use QUESTION_SUBJECT_URLS below for per-subject sheets (recommended).
    // This fallback URL is only used if a subject has no entry there.
    // Leave blank unless you have one single sheet covering all subjects.
    GOOGLE_SHEET_QUESTIONS_CSV_URL: '',

    // Cache parsed sheets in memory for this many minutes
    GS_QUESTIONS_CACHE_MIN: 30,

    // ── Per-subject question sheets ───────────────────────────────
    // Add one entry per subject. Each key must be lowercase and match
    // the `subject` column in your sheet exactly.
    //
    // HOW TO ADD A NEW SUBJECT:
    //   1. Create a Google Sheet with the 14 required headers
    //   2. File → Share → "Anyone with the link" → Viewer
    //   3. File → Publish to web → CSV → copy URL
    //   4. Add a line below:  subjectkey: 'https://...csv',
    //   5. Save config.js — the CBT subject dropdown updates automatically.
    //      No other file needs to change.
    QUESTION_SUBJECT_URLS: {
      // ── CORE (already connected) ──────────────────────────────────
      'mathematics':                       'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=0&single=true&output=csv',
      'english language':                  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1658933018&single=true&output=csv',
      'biology':                           'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=249163164&single=true&output=csv',
      'agricultural science':              'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1606390188&single=true&output=csv',
      'chemistry':                         'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1758913667&single=true&output=csv',
      'christian religious studies':       'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1557227201&single=true&output=csv',
      'commerce':                          'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=906700658&single=true&output=csv',
      'computer studies':                  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=709734130&single=true&output=csv',
      'economics':                         'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=39501907&single=true&output=csv',
      'physics':                           'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1954223493&single=true&output=csv',

      // ── AWAITING QUESTION SHEETS ─────────────────────────────────
      // Follow the same 5-step process above to add question banks.
      'further mathematics':               '', // ← paste CSV URL here
      'government':                        '', // ← paste CSV URL here
      'civic education':                   '', // ← paste CSV URL here
      'history':                           '', // ← paste CSV URL here
      'geography':                         '', // ← paste CSV URL here
      'literature in english':             '', // ← paste CSV URL here
      'accounting':                        '', // ← paste CSV URL here
      'business studies':                  '', // ← paste CSV URL here
      'home economics':                    '', // ← paste CSV URL here
      'food and nutrition':                '', // ← paste CSV URL here
      'technical drawing':                 '', // ← paste CSV URL here
      'auto mechanics':                    '', // ← paste CSV URL here
      'building construction':             '', // ← paste CSV URL here
      'electrical installation':           '', // ← paste CSV URL here
      'metal work':                        '', // ← paste CSV URL here
      'wood work':                         '', // ← paste CSV URL here
      'yoruba':                            '', // ← paste CSV URL here
      'igbo':                              '', // ← paste CSV URL here
      'hausa':                             '', // ← paste CSV URL here
      'french':                            '', // ← paste CSV URL here
      'arabic':                            '', // ← paste CSV URL here
      'islamic religious studies':         '', // ← paste CSV URL here
      'physical and health education':     '', // ← paste CSV URL here
      'visual arts':                       '', // ← paste CSV URL here
      'music':                             '', // ← paste CSV URL here
    },

    // ── Google Sheets — curriculum / syllabus (multi-subject) ─────
    // Add one entry per subject. Each value is the published CSV URL
    // from that subject's Google Sheet tab or separate sheet.
    //
    // HOW TO ADD A NEW SUBJECT SHEET:
    //   1. Open the Google Sheet for that subject.
    //   2. File → Share → "Anyone with the link" → Viewer.
    //   3. File → Publish to web → (select the tab) → CSV → Copy URL.
    //   4. Add a new line below:  subjectkey: 'https://...',
    //   5. Save config.js — done. No other file needs to change.
    //
    // Subject keys must match the subject column values in your sheet
    // (e.g. "mathematics", "english", "physics" — all lowercase).
    //
    // Legacy single-URL key is still supported as a fallback:
    //   GOOGLE_SHEET_CURRICULUM_CSV_URL: 'https://...'
    // but SUBJECT_SHEET_URLS takes priority when present.
    //
    SUBJECT_SHEET_URLS: {
      // ── HOW TO CONNECT A SUBJECT TO VIDEOS ───────────────────────
      // 1. Create / open a Google Sheet tab for that subject.
      //    Required columns: topic_id, subject, title, duration, blurb,
      //    objectives, formulas, video_foundation, video_standard, video_mastery
      //    (see gsheet-curriculum.js SHEET COLUMN GUIDE for full details).
      // 2. File → Share → "Anyone with the link" → Viewer.
      // 3. File → Publish to web → select the tab → CSV → Copy URL.
      // 4. Replace '' below with your copied URL.
      // 5. Save config.js and deploy — videos appear on the next page load.
      //
      // Subject keys are lowercase. They must match the value stored in the
      // student's exam_subjects profile field AND the subject column in your sheet.
      // ─────────────────────────────────────────────────────────────

      // ── CORE (already connected) ──────────────────────────────────
      mathematics:                         'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=0&single=true&output=csv',
      english:                             'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1567958511&single=true&output=csv',

      // ── SCIENCES ─────────────────────────────────────────────────
      physics:                             '', // ← paste CSV URL here
      chemistry:                           'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1868007193&single=true&output=csv',
      biology:                             'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=325628962&single=true&output=csv',
      'further mathematics':               '', // ← paste CSV URL here

      // ── COMMERCIAL ───────────────────────────────────────────────
      economics:                           '', // ← paste CSV URL here
      commerce:                            '', // ← paste CSV URL here
      accounting:                          '', // ← paste CSV URL here
      'business studies':                  '', // ← paste CSV URL here

      // ── ARTS & SOCIAL SCIENCES ───────────────────────────────────
      government:                          '', // ← paste CSV URL here
      'civic education':                   '', // ← paste CSV URL here
      history:                             '', // ← paste CSV URL here
      geography:                           '', // ← paste CSV URL here
      'literature in english':             '', // ← paste CSV URL here

      // ── VOCATIONAL / TECHNICAL ───────────────────────────────────
      'agricultural science':              '', // ← paste CSV URL here
      'home economics':                    '', // ← paste CSV URL here
      'food and nutrition':                '', // ← paste CSV URL here
      'technical drawing':                 '', // ← paste CSV URL here
      'auto mechanics':                    '', // ← paste CSV URL here
      'building construction':             '', // ← paste CSV URL here
      'electrical installation':           '', // ← paste CSV URL here
      'metal work':                        '', // ← paste CSV URL here
      'wood work':                         '', // ← paste CSV URL here

      // ── LANGUAGES ────────────────────────────────────────────────
      'yoruba':                            '', // ← paste CSV URL here
      'igbo':                              '', // ← paste CSV URL here
      'hausa':                             '', // ← paste CSV URL here
      'french':                            '', // ← paste CSV URL here
      'arabic':                            '', // ← paste CSV URL here

      // ── RELIGIOUS STUDIES ────────────────────────────────────────
      'christian religious studies':       '', // ← paste CSV URL here
      'islamic religious studies':         '', // ← paste CSV URL here

      // ── ICT ───────────────────────────────────────────────────────
      'computer studies':                  '', // ← paste CSV URL here

      // ── HEALTH & PHYSICAL EDUCATION ──────────────────────────────
      'physical and health education':     '', // ← paste CSV URL here

      // ── FINE & CREATIVE ARTS ─────────────────────────────────────
      'visual arts':                       '', // ← paste CSV URL here
      'music':                             '', // ← paste CSV URL here
    },

    // Legacy single-sheet URL (used only if SUBJECT_SHEET_URLS is empty)
    GOOGLE_SHEET_CURRICULUM_CSV_URL: '',

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
      // ── CORE ─────────────────────────────────────────────────────
      mathematics: [
        { title: 'JAMB Mathematics — Master Guide',          path: 'mathematics/jamb-master-guide.pdf',  size: '4.2 MB' },
        { title: 'WAEC/NECO Mathematics — Quick Revision',   path: 'mathematics/waec-revision.pdf',      size: '2.8 MB' },
      ],
      english: [
        { title: 'English Language — JAMB Survival Pack',    path: 'english/jamb-survival.pdf',          size: '3.1 MB' },
        { title: 'WAEC English — Essay & Comprehension',     path: 'english/waec-essay.pdf',             size: '2.4 MB' },
      ],
      // ── SCIENCES ─────────────────────────────────────────────────
      physics:                  [{ title: 'Physics — Full Syllabus Guide',             path: 'physics/syllabus.pdf',                    size: '5.0 MB' }],
      chemistry:                [{ title: 'Chemistry — Full Syllabus Guide',           path: 'chemistry/syllabus.pdf',                  size: '4.7 MB' }],
      biology:                  [{ title: 'Biology — Full Syllabus Guide',             path: 'biology/syllabus.pdf',                    size: '4.1 MB' }],
      'further mathematics':    [{ title: 'Further Mathematics — Exam Guide',          path: 'further-mathematics/guide.pdf',           size: '3.8 MB' }],
      // ── COMMERCIAL ───────────────────────────────────────────────
      economics:                [{ title: 'Economics — Theory & Diagrams',             path: 'economics/guide.pdf',                     size: '3.6 MB' }],
      commerce:                 [{ title: 'Commerce — Full Syllabus Guide',            path: 'commerce/guide.pdf',                      size: '3.2 MB' }],
      accounting:               [{ title: 'Financial Accounting — Study Guide',        path: 'accounting/guide.pdf',                    size: '3.5 MB' }],
      'business studies':       [{ title: 'Business Studies — WAEC/JAMB Guide',        path: 'business-studies/guide.pdf',              size: '3.0 MB' }],
      // ── ARTS & SOCIAL SCIENCES ───────────────────────────────────
      government:               [{ title: 'Government — Constitutions & Governance',   path: 'government/guide.pdf',                    size: '3.0 MB' }],
      'civic education':        [{ title: 'Civic Education — Study Guide',             path: 'civic-education/guide.pdf',               size: '2.5 MB' }],
      history:                  [{ title: 'History — Study Guide',                     path: 'history/guide.pdf',                       size: '3.1 MB' }],
      geography:                [{ title: 'Geography — Physical & Human Guide',        path: 'geography/guide.pdf',                     size: '3.4 MB' }],
      'literature in english':  [{ title: 'Literature in English — Set Texts Notes',   path: 'literature/set-texts.pdf',                size: '3.4 MB' }],
      // ── VOCATIONAL / TECHNICAL ───────────────────────────────────
      'agricultural science':   [{ title: 'Agricultural Science — Study Guide',        path: 'agricultural-science/guide.pdf',          size: '3.3 MB' }],
      'home economics':         [{ title: 'Home Economics — Study Guide',              path: 'home-economics/guide.pdf',                size: '2.8 MB' }],
      'food and nutrition':     [{ title: 'Food & Nutrition — Study Guide',            path: 'food-and-nutrition/guide.pdf',            size: '2.7 MB' }],
      'technical drawing':      [{ title: 'Technical Drawing — Study Guide',           path: 'technical-drawing/guide.pdf',             size: '2.9 MB' }],
      'auto mechanics':         [{ title: 'Auto Mechanics — Study Guide',              path: 'auto-mechanics/guide.pdf',                size: '2.6 MB' }],
      'building construction':  [{ title: 'Building Construction — Study Guide',       path: 'building-construction/guide.pdf',         size: '2.8 MB' }],
      'electrical installation':[{ title: 'Electrical Installation — Study Guide',     path: 'electrical-installation/guide.pdf',       size: '2.7 MB' }],
      'metal work':             [{ title: 'Metal Work — Study Guide',                  path: 'metal-work/guide.pdf',                    size: '2.5 MB' }],
      'wood work':              [{ title: 'Wood Work — Study Guide',                   path: 'wood-work/guide.pdf',                     size: '2.5 MB' }],
      // ── LANGUAGES ────────────────────────────────────────────────
      yoruba:                   [{ title: 'Yoruba Language — Study Guide',             path: 'yoruba/guide.pdf',                        size: '2.4 MB' }],
      igbo:                     [{ title: 'Igbo Language — Study Guide',               path: 'igbo/guide.pdf',                          size: '2.4 MB' }],
      hausa:                    [{ title: 'Hausa Language — Study Guide',              path: 'hausa/guide.pdf',                         size: '2.4 MB' }],
      french:                   [{ title: 'French Language — Study Guide',             path: 'french/guide.pdf',                        size: '2.6 MB' }],
      arabic:                   [{ title: 'Arabic Language — Study Guide',             path: 'arabic/guide.pdf',                        size: '2.5 MB' }],
      // ── RELIGIOUS STUDIES ────────────────────────────────────────
      'christian religious studies': [{ title: 'CRS — Study Guide',                   path: 'christian-religious-studies/guide.pdf',   size: '2.9 MB' }],
      'islamic religious studies':   [{ title: 'IRS — Study Guide',                   path: 'islamic-religious-studies/guide.pdf',     size: '2.9 MB' }],
      // ── ICT ───────────────────────────────────────────────────────
      'computer studies':       [{ title: 'Computer Studies — Study Guide',            path: 'computer-studies/guide.pdf',              size: '3.0 MB' }],
      // ── HEALTH & PHYSICAL EDUCATION ──────────────────────────────
      'physical and health education': [{ title: 'PHE — Study Guide',                 path: 'physical-health-education/guide.pdf',     size: '2.6 MB' }],
      // ── FINE & CREATIVE ARTS ─────────────────────────────────────
      'visual arts':            [{ title: 'Visual Arts — Study Guide',                 path: 'visual-arts/guide.pdf',                   size: '2.7 MB' }],
      music:                    [{ title: 'Music — Study Guide',                       path: 'music/guide.pdf',                         size: '2.5 MB' }],
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
    // ── HOW TO UPDATE NEWS ────────────────────────────────────────
    // Edit NEWS_ITEMS below — newest item first.
    // Each item needs: id (unique), date (YYYY-MM-DD), tag, title, body.
    // Optional: link (URL for "Read more"), source (publisher name).
    // Deploy config.js after editing to push updates live immediately.
    // Set this to your deployed Edge Function URL after running:
    //   supabase functions deploy news-feed --no-verify-jwt
    // URL format: https://<your-project-ref>.supabase.co/functions/v1/news-feed
    NEWS_FEED_URL: '',  // ← paste your Edge Function URL here
    NEWS_ITEMS: [
      {
        id:    'ue-2026-06',
        date:  '2026-06-01',
        tag:   'UE School',
        title: '9 subjects now live on CBT Practice',
        body:  'Mathematics, English Language, Biology, Chemistry, Physics, Economics, Commerce, Agricultural Science, Computer Studies and CRS are now available on the Exam Engine.',
        link:  'cbt.html',
        source:'UE School',
      },
      {
        id:    'waec-2026-02',
        date:  '2026-05-20',
        tag:   'WAEC',
        title: 'WAEC May/June 2026 exams ongoing',
        body:  'The 2026 WAEC SSCE May/June examinations are currently in progress. Stay focused, revise past questions, and use the CBT engine daily.',
        link:  'https://www.waecnigeria.org/',
        source:'WAEC',
      },
      {
        id:    'jamb-2026-02',
        date:  '2026-05-10',
        tag:   'JAMB',
        title: 'JAMB 2026 UTME results released',
        body:  'JAMB has released the 2026 UTME results. Check your score on the JAMB portal and begin preparation for Post-UTME screening.',
        link:  'https://www.jamb.gov.ng/',
        source:'JAMB',
      },
      {
        id:    'ue-2026-05',
        date:  '2026-04-20',
        tag:   'UE School',
        title: '1-on-1 Tutor Staffroom is live',
        body:  'Book a verified UE School tutor directly from the dashboard. Free for every registered student to try.',
        link:  'https://staffroom.ultimateedge.info',
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