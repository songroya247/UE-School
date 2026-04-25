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

    // Cache the parsed sheet in memory for this many minutes
    GS_QUESTIONS_CACHE_MIN: 30,
  };

  Object.defineProperty(window, 'UE_CONFIG', {
    value:        Object.freeze(_config),
    writable:     false,
    configurable: false,
    enumerable:   true,
  });
})();
