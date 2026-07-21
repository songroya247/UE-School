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
      'admin-dashboard.html', 'admin-actions.html'
    ],
    PREMIUM_PAGES:    ['classroom.html', 'cbt.html'],
    ADMIN_ONLY_PAGES: ['admin-dashboard.html', 'admin-actions.html'],

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

    // ── Google Sheets — questions bank (PER-SUBJECT tabs) ─────────
    // The CBT question bank lives as separate tabs (gid=) of one
    // Google Sheet, each published to web as its own CSV. Map each
    // subject key (must match the `value` used in cbt.html's subject
    // <select>) to its published CSV URL below. gsheet-questions.js
    // fetches/caches each subject's sheet independently.
    SUBJECT_SHEET_URLS: {
      mathematics:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=0&single=true&output=csv',
      english:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1658933018&single=true&output=csv',
      biology:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=249163164&single=true&output=csv',
      agric:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1606390188&single=true&output=csv',
      chemistry:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1758913667&single=true&output=csv',
      crs:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1557227201&single=true&output=csv',
      commerce:     'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=906700658&single=true&output=csv',
      computer:     'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=392494980&single=true&output=csv',
      economics:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=39501907&single=true&output=csv',
      physics:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1954223493&single=true&output=csv',
      phe:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=2099233715&single=true&output=csv',
      literature:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1135539231&single=true&output=csv',
      government:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1070093724&single=true&output=csv',
      history:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=683065308&single=true&output=csv',
      fineart:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=895577052&single=true&output=csv',
      accounting:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=2097289299&single=true&output=csv',
      french:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1337647868&single=true&output=csv',
      irs:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=592461938&single=true&output=csv',
      music:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=972413627&single=true&output=csv',
      arabic:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1685044296&single=true&output=csv',
      geography:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=240277282&single=true&output=csv',
      homeeconomics:'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=118667393&single=true&output=csv',
      yoruba:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=2022769992&single=true&output=csv',
      igbo:         'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=914056802&single=true&output=csv',
      hausa:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vT53h7VABgCjHRjkGoKMaV2jPKiwHlNfqj2ut8mNseJQxJ0Fd-zBBJMY96dbvmWqUFXNjO9GfLO2P5Z/pub?gid=1356784415&single=true&output=csv',
    },

    // Cache the parsed sheet in memory for this many minutes
    GS_QUESTIONS_CACHE_MIN: 30,

    // ── Google Sheets — CLASSROOM CURRICULUM / VIDEOS (separate sheet!) ──
    // This is a DIFFERENT sheet from SUBJECT_SHEET_URLS above — that one
    // is the CBT question bank. This one feeds classroom.js's video
    // lessons via gsheet-curriculum.js.
    //
    // 1. Build a Google Sheet (per-subject tabs, like the questions bank)
    //    with these columns (header row required):
    //      topic_id | subject | title | duration | blurb | objectives |
    //      formulas | video_foundation | video_standard | video_mastery |
    //      tagline_foundation | tagline_standard | tagline_mastery |
    //      duration_foundation | duration_standard | duration_mastery
    //    Only `topic_id`, `subject` (or rely on the per-tab key below),
    //    `title`, and at least one `video_*` column are required — the
    //    rest are optional. video_* values can be a full Drive/YouTube
    //    URL or just a bare Drive file ID.
    // 2. File → Share → "Anyone with the link" → Viewer for each video.
    // 3. File → Publish to web → [tab] → CSV → copy the URL.
    // 4. Paste each subject's CSV URL below (same key names as
    //    SUBJECT_SHEET_URLS above, e.g. mathematics, english, physics...).
    //
    // Leaving this empty means classroom.js shows "no sheet configured"
    // for every subject and relies only on any hardcoded curriculum.js
    // topics — no videos will load until this is filled in.
    CURRICULUM_SHEET_URLS: {
      mathematics: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=0&single=true&output=csv',
      english: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1567958511&single=true&output=csv',
      chemistry: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1868007193&single=true&output=csv',
      biology: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=325628962&single=true&output=csv',
      physics: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=804615175&single=true&output=csv',
      agric: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1140281368&single=true&output=csv',
      crs: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1888341293&single=true&output=csv',
      commerce: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=359201715&single=true&output=csv',
      computer: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1307176408&single=true&output=csv',
      economics: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1824923062&single=true&output=csv',
      homeeconomics: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1891958827&single=true&output=csv',
      phe: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1306404706&single=true&output=csv',
      literature: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=201971843&single=true&output=csv',
      government: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1624472995&single=true&output=csv',
      history: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1304083970&single=true&output=csv',
      fineart: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=209846962&single=true&output=csv',
      accounting: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1543893992&single=true&output=csv',
      french: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=26724450&single=true&output=csv',
      irs: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1344241747&single=true&output=csv',
      music: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=993483772&single=true&output=csv',
      arabic: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1282304803&single=true&output=csv',
      geography: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1028770153&single=true&output=csv',
      yoruba: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=534323528&single=true&output=csv',
      igbo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=1266935560&single=true&output=csv',
      hausa: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQce-Cfet2xotc8r3VOlroMApc-qPKy9uSMls_Y85n2XSXmf7_sHM23YIoh9e37WUXi0M0hz6V2uqe_/pub?gid=356409504&single=true&output=csv',
      // A "Home Video" tab (gid=175294299) was also given but doesn't map
      // to a subject — it's already handled separately by
      // home-video-preview.js for the homepage hero, not wired in here.
    },

    // Cache the parsed curriculum sheet in memory for this many minutes
    GS_CURRICULUM_CACHE_MIN: 30,
  };

  Object.defineProperty(window, 'UE_CONFIG', {
    value:        Object.freeze(_config),
    writable:     false,
    configurable: false,
    enumerable:   true,
  });
})();
