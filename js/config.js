/* ═══════════════════════════════════════════════════════════════════
UE School — js/config.js  (v3.1 — FIXED URLs)
═══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.UE_CONFIG) return;

const _config = {
  SUPABASE_URL:  'https://nmkuujtupgcgxzxbenti.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3V1anR1cGdjZ3h6eGJlbnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njg2NDYsImV4cCI6MjA5MjQ0NDY0Nn0.89PvF3HdNL5FPwsyQoZQrmeQxwgpmDCFBjqVA_lBY_w',
  
  APP_NAME:      'UE School',
  LOGIN_PAGE:    'login.html',
  PRICING_PAGE:  'pricing.html',

  PROTECTED_PAGES: [
    'dashboard.html', 'classroom.html', 'cbt.html', 'report.html',
    'admin-dashboard.html', 'admin-actions.html', 'tutor.html',
    'study-guides.html', 'daily-quiz.html'
  ],

  PREMIUM_PAGES:    [],
  ADMIN_ONLY_PAGES: ['admin-dashboard.html', 'admin-actions.html'],

  FREE_SAMPLE: {
    VIDEOS_PER_ACCOUNT: 1,
    CBT_PER_ACCOUNT:    1,
    GUIDES_PER_ACCOUNT: 1,
  },

  ADMIN_EMAILS: [],

  GOOGLE_DRIVE_VIDEO_FOLDER_ID: '',
  GOOGLE_SHEET_QUESTIONS_CSV_URL: '',

  // ✅ FIXED: No spaces in URLs
  CURRICULUM_SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/1sVVEWsi674b5k2Z6uLiS1OoAW_169ThVXIP9BtSMELw/pub?gid=0&single=true&output=csv',
  
  GOOGLE_SHEET_CURRICULUM_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNMrbaNyNzjOTPTx5NMh_pROLKJqWX-ya9qB7H8tJcAkwzH-OVnixp-9X27X04Yhk-sbR7WQMzjZeF/pub?gid=0&single=true&output=csv',

  GS_QUESTIONS_CACHE_MIN: 30,
  GS_CURRICULUM_CACHE_MIN: 30,

  WHATSAPP_SUPPORT_NUMBER: '2347037426480',
  WHATSAPP_DEFAULT_MESSAGE: 'Hi UE School support — I need help with my account.',

  TUTOR_BOOKING_URL: 'https://staffroom.ultimateedge.info',
  TUTOR_LEAD_TIME_DAYS: 2,

  STUDY_GUIDES_BUCKET: 'study-guides',  STUDY_GUIDES: {
    mathematics: [
      { title: 'JAMB Mathematics — Master Guide', path: 'mathematics/jamb-master-guide.pdf', size: '4.2 MB' },
      { title: 'WAEC/NECO Mathematics — Quick Revision', path: 'mathematics/waec-revision.pdf', size: '2.8 MB' },
    ],
    english: [
      { title: 'English Language — JAMB Survival Pack', path: 'english/jamb-survival.pdf', size: '3.1 MB' },
      { title: 'WAEC English — Essay & Comprehension', path: 'english/waec-essay.pdf', size: '2.4 MB' },
    ],
    physics:    [{ title:'Physics — Full Syllabus Guide',  path:'physics/syllabus.pdf',     size:'5.0 MB' }],
    chemistry:  [{ title:'Chemistry — Full Syllabus Guide',path:'chemistry/syllabus.pdf',  size:'4.7 MB' }],
    biology:    [{ title:'Biology — Full Syllabus Guide',   path:'biology/syllabus.pdf',    size:'4.1 MB' }],
    economics:  [{ title:'Economics — Theory & Diagrams',  path:'economics/guide.pdf',     size:'3.6 MB' }],
    government: [{ title:'Government — Constitutions',     path:'government/guide.pdf',    size:'3.0 MB' }],
    literature: [{ title:'Literature — Set Texts Notes',   path:'literature/set-texts.pdf',size:'3.4 MB' }],
  },

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

  EXAM_REMINDER_DAYS: [60, 30, 14, 7, 3, 1],

  NEWS_FEED_URL: '',
  NEWS_ITEMS: [
    {
      id:    'ue-2026-01',
      date:  '2026-04-20',
      tag:   'UE School',
      title: 'New 1-on-1 Tutor Staffroom is live',
      body:  'You can now book a verified UE School tutor directly from the dashboard.',
      link:  'https://staffroom.ultimateedge.info',
      source:'UE School',
    },
  ],
};

Object.defineProperty(window, 'UE_CONFIG', {
  value:        Object.freeze(_config),
  writable:     false,
  configurable: false,  enumerable:   true,
});
})();