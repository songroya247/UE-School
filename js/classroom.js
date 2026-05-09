/* ═══════════════════════════════════════════════════════════════════
   UE School — js/classroom.js  —  Classroom Engine
   ───────────────────────────────────────────────────────────────────
   ⚠️  CRITICAL PATH — CORE OF THE GSHEETS → VIDEO RENDERING PIPELINE
   ───────────────────────────────────────────────────────────────────

   ROLE IN THE PIPELINE
   ────────────────────
   This file is the FINAL CONSUMER of all data prepared by the
   Google Sheets pipeline.  It owns:
     • The hardcoded CURRICULUM (fallback content for every subject)
     • mergeSheetIntoCurriculum() — ingests TOPIC_BLUEPRINT entries
       (written by gsheet-curriculum.js) into CURRICULUM at runtime
     • renderLesson() — picks the right video URL from topic.videos
       and injects it into the <iframe> in the #video-area element
     • The full UI: tabs, sidebar, lesson panel, quiz, navigation

   FULL PIPELINE IN EXECUTION ORDER
   ─────────────────────────────────
   classroom.html loads scripts in this order (script tags, body end):

     1. supabase.min.js        (CDN)
     2. auth.js                → window.sb (Supabase client)
     3. auth-guard.js          → AUTH_GUARD (session + premium check)
     4. storage.js             → adaptive storage (Skill Chamber dep)
     5. skill_questions.js     → Skill Chamber question bank
     6. curriculum.js          → TOPIC_BLUEPRINT base (hardcoded)
     7. intervention_modal.js  → diagnostic modal UI
     8. gsheet-curriculum.js   → GSHEET_CURRICULUM loader
     9. gdrive-video.js        → GDRIVE_VIDEO.embedUrl() helper
    10. classroom.js           ← THIS FILE (registers CLASSROOM global)
    11. skill_chamber.js       → monkey-patches CLASSROOM.loadTopic

   Then the inline DOMContentLoaded script runs:

     A. await AUTH_GUARD.init()           (auth check / redirect)
     B. await GSHEET_CURRICULUM.init()    (fetch + parse CSV sheets)
     C. mergeSheetIntoCurriculum()        (sheet topics → CURRICULUM)
     D. window._ueProfile = authData.profile  (student name for watermark)
     E. await CLASSROOM.init()            (renders sidebar + first topic)
     F. IntersectionObserver setup        (floating video behaviour)

   ───────────────────────────────────────────────────────────────────
   ⛔  DO NOT MODIFY THIS FILE WITHOUT READING THE FULL PIPELINE NOTES
   ───────────────────────────────────────────────────────────────────

   WHAT THIS FILE OWNS (do not move these responsibilities elsewhere)
   ──────────────────────────────────────────────────────────────────
   • CURRICULUM constant  — the hardcoded topic tree (fallback data)
   • mergeSheetIntoCurriculum()  — TOPIC_BLUEPRINT → CURRICULUM merge
   • init()  — auth, sheet load, tab render, first topic selection
   • renderLesson()  — video URL resolution and iframe injection
   • injectIframe()  — DOM manipulation for the video player
   • getVideoUrl()  — tier-aware video URL picker with fallback chain
   • Free-tier sample tracking  — localStorage + AUTH_GUARD.canSampleFeature
   • Supabase topic_mastery upsert  — study progress tracking

   WHAT THIS FILE DOES NOT OWN (do not add these here)
   ──────────────────────────────────────────────────────
   • Fetching Google Sheets CSV data         → gsheet-curriculum.js
   • Converting Drive URLs to /preview       → gdrive-video.js
   • Config constants (URLs, limits)         → config.js (UE_CONFIG)
   • Auth session management                 → auth.js + auth-guard.js
   • Supabase client initialisation          → supabase.js + auth.js
   • Skill Chamber adaptive routing          → skill_chamber.js

   KEY DATA CONTRACT (between gsheet-curriculum.js and this file)
   ─────────────────────────────────────────────────────────────────
   After GSHEET_CURRICULUM.init() resolves, window.TOPIC_BLUEPRINT
   contains entries shaped like:
     {
       id:         'mathematics.quadratics',
       subject:    'mathematics',
       title:      'Quadratic Equations',
       duration:   '14 mins',
       _source:    'gsheet',          ← mergeSheetIntoCurriculum() filters on this
       videos: {
         standard:   { url, duration, tagline },
         foundation: { url, duration, tagline },
         mastery:    { url, duration, tagline },
       },
       blurb:      'One-sentence intro',
       objectives: ['point 1', 'point 2'],
       formulas:   ['formula string'],
     }

   After mergeSheetIntoCurriculum(), CURRICULUM['mathematics'].topics
   contains classroomTopic objects shaped like:
     {
       id, title, duration, premium: false,
       videos: { standard, foundation, mastery },  ← read by getVideoUrl()
       content: { intro, points, formulas },        ← rendered in lesson panel
       quiz: [],
     }
═══════════════════════════════════════════════════════════════════ */

window.CLASSROOM = (function () {

  // ─── Curriculum ───────────────────────────────────
  // Each topic has: id, title, duration, premium, youtubeId (optional),
  // content (key points), formulas (optional), quiz questions
  /* ─────────────────────────────────────────────────────────────────
     CURRICULUM — subject shells only.
     Topic arrays are intentionally empty — they are populated entirely
     at runtime by mergeSheetIntoCurriculum() from Google Sheets.
     To add a new subject, add a shell entry here and a matching
     published CSV URL in config.js SUBJECT_SHEET_URLS.
  ───────────────────────────────────────────────────────────────────── */
  const CURRICULUM = {
    mathematics: { label: 'Mathematics',      icon: '&#x1F4D0;', color: '#3b82f6', topics: [] },
    english:     { label: 'English Language', icon: '&#x1F4D6;', color: '#10b981', topics: [] },
    physics:     { label: 'Physics',          icon: '&#x269B;',  color: '#7c3aed', topics: [] },
    chemistry:   { label: 'Chemistry',        icon: '&#x1F9EA;', color: '#ff6b35', topics: [] },
    biology:     { label: 'Biology',          icon: '&#x1F33F;', color: '#0891b2', topics: [] },
    economics:   { label: 'Economics',        icon: '&#x1F4C8;', color: '#f59e0b', topics: [] },
    government:  { label: 'Government',       icon: '&#x1F3DB;', color: '#6366f1', topics: [] },
  };

  /* ───────────────────────────────────────────────────────────────────
     FREE-TIER SAMPLE TRACKING  ★ CRITICAL PATH ★
     ───────────────────────────────────────────────────────────────────
     Free (registered-but-unpaid) users may watch a limited number of
     distinct video topics — configured in UE_CONFIG.FREE_SAMPLE.
     VIDEOS_PER_ACCOUNT (default: 1).

     HOW IT WORKS:
     ─────────────
     • When a user opens a topic video for the first time, we store its
       topic ID in localStorage under FREE_VIDEOS_KEY.
     • On subsequent visits (or page reloads), we read this list back.
     • topicUnlockedForUser() uses this list + AUTH_GUARD.canSampleFeature()
       to decide whether to let the user in or bounce them to pricing.

     TWO SYSTEMS WORKING TOGETHER:
     ──────────────────────────────
     1. AUTH_GUARD.canSampleFeature('video')  — reads from Supabase (or
        local storage fallback) the QUOTA: how many video samples are
        still available for this account.  Decremented by recordSampleUse().

     2. getWatchedVideoIds() / rememberWatchedVideo()  — local cache of
        WHICH topic IDs have been watched.  A user who has already watched
        topic X can re-watch X without spending a new sample credit.

     WHY BOTH?
     ─────────
     A user might close the browser and return.  The quota in Supabase
     (via AUTH_GUARD) is the authoritative cap.  The local list of watched
     IDs ensures re-opening a previously-viewed topic feels free — without
     having to re-query Supabase for every click.

     ⚠️  FREE_VIDEOS_KEY is a stable localStorage key name.  Changing it
         would reset all existing free-sample state for every user on that
         device.  Do NOT rename this constant.

     ⚠️  This tracking ONLY applies in classroom.js.  The CBT and
         study-guides pages have their own equivalent tracking logic.
         Do not centralise it here without updating those pages too.
  ───────────────────────────────────────────────────────────────────── */

  const FREE_VIDEOS_KEY = 'ue_free_videos_watched'; // ← DO NOT RENAME

  /* getWatchedVideoIds() — returns array of topic IDs already watched
     by this user on this device.  Catches JSON parse errors silently
     (corrupted localStorage) and returns [] as a safe default. */
  function getWatchedVideoIds() {
    try { return JSON.parse(localStorage.getItem(FREE_VIDEOS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  /* rememberWatchedVideo(topicId) — adds topicId to the watched list
     if not already present.  Idempotent; safe to call multiple times.
     Silently suppresses storage errors (private browsing, quota full). */
  function rememberWatchedVideo(topicId) {
    const ids = getWatchedVideoIds();
    if (!ids.includes(topicId)) {
      ids.push(topicId);
      try { localStorage.setItem(FREE_VIDEOS_KEY, JSON.stringify(ids)); } catch (_) {}
    }
  }

  /* ───────────────────────────────────────────────────────────────────
     topicUnlockedForUser(topic)  ★ CRITICAL PATH ★
     ───────────────────────────────────────────────────────────────────
     Central gating function.  Called by:
       • renderSidebar()   — to show lock icon / PRO badge in topic list
       • selectTopic()     — to bounce free users to pricing page
       • nextLesson()      — to skip locked topics in navigation

     Decision logic (in order of precedence):
       1. Premium user → always unlocked (no further checks)
       2. Free user, already watched this topic → unlocked (re-watch free)
       3. Free user, still has sample credits → unlocked (first watch)
       4. Free user, no credits left → locked (returns false → bounce)

     Returns: boolean
  ───────────────────────────────────────────────────────────────────── */
  function topicUnlockedForUser(topic) {
    if (isPremiumUser) return true;
    const watched = getWatchedVideoIds();
    if (watched.includes(topic.id)) return true;      // re-watch: always free
    return AUTH_GUARD.canSampleFeature('video');       // first watch: check quota
  }

  /* ─────────────────────────────────────────────────────────────────
     Module-level state (private — NOT exported)

     currentSubject  — key of the active subject tab ('mathematics' etc)
     currentTopicId  — id of the topic currently rendered in the player
     quizState       — tracks current quiz question index and score
     isPremiumUser   — cached from AUTH_GUARD.isPremium() at init time
     userId          — Supabase user UUID, used for topic_mastery upserts
  ───────────────────────────────────────────────────────────────────── */
  let currentSubject    = 'mathematics';
  let currentTopicId    = null;
  let quizState         = { idx: 0, questions: [] };
  let isPremiumUser     = false;
  let userId            = null;
  let skeletonTimeoutId = null; // tracks the 8s skeleton-hide timer so it can be cancelled

  /* ─────────────────────────────────────────────────────────────────
     mergeSheetIntoCurriculum()  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     WHEN CALLED:
       Once — by classroom.html DOMContentLoaded after both AUTH_GUARD.init()
       and GSHEET_CURRICULUM.init() have resolved (Promise.all).
       CLASSROOM.init() does NOT call this — the HTML handles it first.

     WHAT IT DOES:
     ─────────────
     Reads window.TOPIC_BLUEPRINT (written by gsheet-curriculum.js)
     and converts each entry with _source='gsheet' into a
     classroomTopic object that matches the CURRICULUM topic shape.
     These objects are then injected into CURRICULUM[subject].topics,
     either replacing an existing hardcoded topic of the same ID or
     being appended as a new topic.

     After this function runs, CURRICULUM is fully populated with
     both hardcoded AND sheet-sourced topics.  Every downstream
     function (renderSidebar, selectTopic, renderLesson) reads from
     CURRICULUM — none of them read from TOPIC_BLUEPRINT directly.

     DATA SHAPE TRANSLATION:
     ────────────────────────
     TOPIC_BLUEPRINT entry (from gsheet-curriculum.js):
       { id, subject, title, duration, videos, blurb, objectives, formulas }

     classroomTopic (the CURRICULUM topic shape):
       {
         id, title, duration,
         premium: false,           ← sheet topics are always free-gated via subscription,
                                      not topic-level premium flag; false = show in sidebar
         videos: topic.videos,     ← { standard, foundation, mastery } — read by getVideoUrl()
         content: {
           intro:    topic.blurb,
           points:   topic.objectives,
           formulas: topic.formulas.map(f => ({ label:'', formula:f }))
                                   ← CURRICULUM expects { label, formula } objects;
                                      sheet stores bare strings; we normalise here
         },
         quiz: [],                 ← sheets don't supply quizzes; left empty
       }

     SHEET WINS:
     ───────────
     If a hardcoded CURRICULUM topic has the same ID as a sheet topic,
     the sheet version REPLACES the hardcoded one.  This lets operators
     update content without touching classroom.js.

     ⚠️  The _source check (`topic._source !== 'gsheet'`) is the guard
         that prevents non-sheet entries in TOPIC_BLUEPRINT from being
         double-processed.  Do NOT remove this check.
  ───────────────────────────────────────────────────────────────────── */
  function mergeSheetIntoCurriculum() {
    const blueprint = window.TOPIC_BLUEPRINT || {};
    let merged = 0;

    for (const topic of Object.values(blueprint)) {
      // Only process entries that came from Google Sheets
      if (topic._source !== 'gsheet') continue;

      const subj = topic.subject;
      if (!subj) continue;

      // Create a new subject bucket if the sheet introduces a subject
      // not present in the hardcoded CURRICULUM (e.g. 'further_maths')
      if (!CURRICULUM[subj]) {
        CURRICULUM[subj] = {
          label:  subj.charAt(0).toUpperCase() + subj.slice(1),
          icon:   '&#x1F4D6;',
          color:  '#6366f1',
          topics: [],
        };
      }

      // Build the classroomTopic object from the TOPIC_BLUEPRINT entry
      // This is the shape that renderSidebar(), selectTopic(), and
      // renderLesson() all expect.
      const classroomTopic = {
        id:       topic.id,
        title:    topic.title,
        duration: topic.duration || '14 mins',
        premium:  false, // sheet topics are always subscription-gated, not topic-level locked
        videos:   topic.videos || null, // { standard, foundation, mastery } — see getVideoUrl()
        content: {
          intro:    topic.blurb || `${topic.title} — lesson loaded from Google Sheets.`,
          points:   topic.objectives || [],
          // CURRICULUM formulas expect { label, formula } objects;
          // sheet formulas are bare strings → normalise with empty label
          formulas: (topic.formulas || []).map(f => ({ label: '', formula: f })),
        },
        quiz: [], // sheets do not supply quiz questions; CBT questions come from a separate sheet
      };

      // Sheet wins: replace hardcoded topic with same ID, or append if new.
      // Use case-insensitive + whitespace/underscore-normalised comparison as a fallback
      // so 'mathematics.number_bases' (curriculum.js) matches 'mathematics.Number Bases'
      // (classroom.js CURRICULUM) and any sheet variation in between.
      const normalise = id => (id || '').toLowerCase().replace(/[\s_]+/g, '');
      const normalisedSheetId = normalise(topic.id);

      let existing = CURRICULUM[subj].topics.findIndex(t => t.id === topic.id);
      if (existing < 0) {
        // Fuzzy fallback: match ignoring case and whitespace differences
        existing = CURRICULUM[subj].topics.findIndex(
          t => normalise(t.id) === normalisedSheetId
        );
        if (existing >= 0) {
          // ID matched fuzzily — adopt the hardcoded ID so sidebar links still work
          classroomTopic.id = CURRICULUM[subj].topics[existing].id;
        }
      }

      if (existing >= 0) {
        CURRICULUM[subj].topics[existing] = classroomTopic; // overwrite hardcoded
      } else {
        CURRICULUM[subj].topics.push(classroomTopic);       // append new
      }
      merged++;
    }

    if (merged > 0) {
      console.info(`[CLASSROOM] Merged ${merged} sheet topics into CURRICULUM.`);
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     init()  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     The main entry point for the classroom page.  Called by the
     classroom.html DOMContentLoaded inline script as Step E (after
     auth, sheet loading, and merging are complete).

     PARAMETERS:
     ───────────
     authData — the result of AUTH_GUARD.init() already awaited in
                classroom.html.  Passed in to avoid a second Supabase
                round-trip.  Shape: { profile, session }.

     SEQUENCE OF OPERATIONS:
     ────────────────────────
     1. Read profile + session from authData.  Set isPremiumUser and userId.

     2. Defaulter banner — show/hide the "subscription expired" banner
        based on subscriptionStatus(profile) from auth-guard.js.

     3. renderSubjectTabs() — build the horizontal tab bar from the
        user's registered exam_subjects (from Supabase profile), or all
        subjects if none are registered.
        (Sheet data already merged into CURRICULUM by classroom.html
        before this function is called — no repeat fetch needed.)

     4. Deep-link handling — parse ?subject= and ?topic= from the URL
        to allow external links to jump directly to a specific lesson.

     5. renderSidebar() — build the topic list for the initial subject
        and auto-select the first unlocked topic (or the URL-specified one).
  ───────────────────────────────────────────────────────────────────── */
  // authData is passed in from classroom.html (already awaited there).
  // CLASSROOM.init() must NOT call AUTH_GUARD.init() again — that would
  // make a second Supabase round-trip for no reason.
  async function init(authData) {
    if (!authData) return; // unauthenticated — AUTH_GUARD already redirected

    const { profile, session } = authData;
    userId        = session?.user?.id;
    isPremiumUser = AUTH_GUARD.isPremium(profile);

    // Show "subscription expired" banner for lapsed subscribers
    const banner = document.getElementById('defaulter-banner');
    if (banner) {
      const status = AUTH_GUARD.subscriptionStatus(profile);
      banner.style.display = status === 'EXPIRED' ? 'block' : 'none';
    }

    // Sheet data is already loaded and merged by classroom.html before
    // CLASSROOM.init() is called. No repeat fetch needed here.

    // Build subject tabs: use the user's registered subjects if available,
    // otherwise show all subjects in CURRICULUM (including sheet-sourced ones)
    const userSubjects = profile?.exam_subjects?.length
      ? profile.exam_subjects.filter(s => CURRICULUM[s])
      : Object.keys(CURRICULUM);

    renderSubjectTabs(userSubjects);

    // Deep-link from URL params
    const params   = new URLSearchParams(window.location.search);
    const urlSubj  = params.get('subject');
    const urlTopic = params.get('topic');

    const startSubject = (urlSubj && CURRICULUM[urlSubj]) ? urlSubj : (userSubjects[0] || 'mathematics');
    currentSubject = startSubject;

    renderSidebar(startSubject, urlTopic);

    // Activate the right subject tab
    document.querySelectorAll('.subject-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.subject === startSubject);
    });
  }

  // ─── Render subject tabs ──────────────────────────
  function renderSubjectTabs(subjects) {
    const container = document.getElementById('subject-tabs');
    if (!container) return;

    container.innerHTML = subjects.map(s => {
      const meta = CURRICULUM[s];
      if (!meta) return '';
      return `<button class="subject-tab" data-subject="${s}"
                onclick="CLASSROOM.switchSubject('${s}', this)">
                ${meta.label}
              </button>`;
    }).join('');
  }

  // ─── Switch subject ───────────────────────────────
  function switchSubject(subjKey, tabEl) {
    if (!CURRICULUM[subjKey]) return;
    currentSubject = subjKey;
    currentTopicId = null;

    // Stop and clear the current video — the previous subject's video
    // should not keep playing or showing when you switch subjects.
    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      // Stop and blank any playing iframe — cuts audio immediately
      videoArea.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
      // Remove per-video overlays (watermark, arrow blocker)
      videoArea.querySelectorAll('#video-watermark, #video-arrow-blocker').forEach(el => el.remove());
      // Restore placeholder visuals without destroying structural elements
      // (video-skeleton, video-tier-badge must survive for renderLesson to find them)
      videoArea.querySelectorAll('.video-bg,.video-grid,.video-play-btn,.video-duration')
        .forEach(el => el.remove());
      const ph = ['<div class="video-bg"></div>',
                   '<div class="video-grid"></div>',
                   '<div class="video-play-btn" onclick="CLASSROOM.playVideo(null)">&#x25B6;</div>'].join('');
      videoArea.insertAdjacentHTML('beforeend', ph);
      // Hide skeleton and tier badge
      const sk = document.getElementById('video-skeleton');
      if (sk) sk.style.display = 'none';
      const tb = document.getElementById('video-tier-badge');
      if (tb) tb.style.display = 'none';
      if (skeletonTimeoutId) { clearTimeout(skeletonTimeoutId); skeletonTimeoutId = null; }
    }

    // Reset lesson panel
    const titleEl = document.getElementById('topic-title');
    if (titleEl) titleEl.textContent = 'Select a topic';
    const tagEl = document.getElementById('topic-tag');
    if (tagEl) tagEl.textContent = 'Topic';
    const contentEl = document.getElementById('lesson-content');
    if (contentEl) contentEl.innerHTML = '<p style="color:var(--muted)">Select a topic from the sidebar to begin.</p>';
    const quizSection = document.getElementById('quiz-section');
    if (quizSection) quizSection.style.display = 'none';

    document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');

    renderSidebar(subjKey, null); // auto-selects and plays first unlocked topic
  }

  // ─── Render sidebar topic list ────────────────────
  function renderSidebar(subjKey, autoSelectTopic) {
    const subj    = CURRICULUM[subjKey];
    if (!subj) return;

    const headEl = document.getElementById('sidebar-subject-name');
    const countEl = document.getElementById('sidebar-lesson-count');
    if (headEl)  headEl.textContent  = subj.label;
    if (countEl) countEl.textContent = `${subj.topics.length} Lesson${subj.topics.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('topic-list');
    if (!list) return;

    if (subj.topics.length === 0) {
      list.innerHTML = `<div style="padding:28px 16px;text-align:center;color:var(--muted);font-size:.84rem;line-height:1.6">
        <div style="font-size:1.8rem;margin-bottom:10px">&#x1F4CB;</div>
        <strong style="display:block;margin-bottom:6px;color:var(--text2)">${subj.label} coming soon</strong>
        No lessons have been added for this subject yet.
      </div>`;
      return;
    }

    list.innerHTML = subj.topics.map((topic, idx) => {
      const isLocked   = !topicUnlockedForUser(topic);
      const isActive   = topic.id === currentTopicId;

      const icon = isLocked ? '&#x1F512;'
                 : isActive  ? '<span style="color:var(--accent)">▶</span>'
                 :             '<span style="color:var(--muted2)">&#x1F4D6;</span>';

      return `<button class="topic-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}"
                data-topic-id="${topic.id}"
                onclick="CLASSROOM.loadTopic('${topic.id}')">
                ${icon}
                <span class="topic-text">${idx + 1}. ${topic.title}</span>
                ${isLocked ? '<span style="font-size:.7rem;color:var(--muted);margin-left:auto">PRO</span>' : ''}
              </button>`;
    }).join('');

    // Auto-select first unlocked topic or the URL-specified topic
    const firstUnlocked = subj.topics.find(t => topicUnlockedForUser(t));
    let targetId = null;

    if (autoSelectTopic) {
      const match = subj.topics.find(t =>
        t.id.endsWith(autoSelectTopic) || t.title.toLowerCase() === autoSelectTopic.toLowerCase()
      );
      targetId = match ? match.id : (firstUnlocked ? firstUnlocked.id : null);
    } else {
      targetId = firstUnlocked ? firstUnlocked.id : null;
    }

    if (targetId) selectTopic(targetId);
  }

  // ─── Select topic ─────────────────────────────────
  function selectTopic(topicId, tier) {
    // Find topic across all subjects
    let topic = null;
    for (const subj of Object.values(CURRICULUM)) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    // Free-tier gate: if the user has spent their video sample and
    // is opening a NEW topic, redirect to the pricing page instead
    // of showing an in-page locked state. (Already-watched topics
    // remain available so the sample never feels like a punishment.)
    if (!topicUnlockedForUser(topic)) {
      AUTH_GUARD.bouncePremium(
        'You\'ve used your free video sample. Upgrade to UE Premium to unlock every lesson.'
      );
      return;
    }

    // Spend a free-sample credit the first time we open this topic.
    const watched = getWatchedVideoIds();
    if (!isPremiumUser && !watched.includes(topic.id)) {
      AUTH_GUARD.recordSampleUse('video');
      rememberWatchedVideo(topic.id);
    }

    currentTopicId = topicId;

    // Update sidebar active state
    document.querySelectorAll('.topic-item').forEach(el => {
      el.classList.toggle('active', el.dataset.topicId === topicId);
    });

    renderLesson(topic, tier);

    // Close mobile sidebar
    if (window.innerWidth <= 720) closeSidebar();
  }

  /* ─────────────────────────────────────────────────────────────────
     renderLesson(topic, tier)  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     The VIDEO RENDERING function.  This is where the Google Sheets
     data ultimately delivers its payload: the video URL is resolved
     from topic.videos (built by gsheet-curriculum.js → buildVideos)
     and injected as an <iframe> into the #video-area element.

     PARAMETERS:
     ───────────
     topic  — classroomTopic object from CURRICULUM (merged from
               TOPIC_BLUEPRINT or hardcoded).  Shape:
               { id, title, duration, videos, youtubeId, driveId,
                 driveUrl, content: { intro, points, formulas }, quiz }

     tier   — optional string: 'foundation' | 'standard' | 'mastery'
               Provided by skill_chamber.js after its adaptive
               diagnostic determines the student's level.
               If undefined, defaults to 'standard' via fallback chain.

     EXECUTION STEPS:
     ────────────────
     1. Set title, tag, and duration badge in the DOM.
     2. Resolve video URL via getVideoUrl() (tier-aware, with fallback).
     3. Determine YouTube vs Google Drive source.
     4. Inject the appropriate <iframe> via injectIframe().
     5. Render lesson text (intro, key points, formula box).
     6. Initialise the quick quiz.
     7. Set the "Practice in CBT" button href.
     8. Upsert topic_mastery row in Supabase (fire-and-forget).

     FALLBACK CHAIN (step 2 above — see getVideoUrl):
     ─────────────────────────────────────────────────
       requested tier → 'standard' → 'foundation' → 'mastery'
       → topic.driveId  (legacy)
       → topic.driveUrl (legacy, via GDRIVE_VIDEO.embedUrl)
       → '' (no video → show animated placeholder)

     ⚠️  renderLesson() reads topic.videos which is set during
         mergeSheetIntoCurriculum() (from gsheet-curriculum.js).
         If you change the `videos` object shape in gsheet-curriculum.js
         you MUST update getVideoUrl() in this function accordingly.
  ───────────────────────────────────────────────────────────────────── */
  function renderLesson(topic, tier) {
    // Title + meta
    setEl('topic-tag',    topic.id.split('.')[1] || topic.title);
    setEl('topic-title',  topic.title);
    { const d = (topic.duration || '').toString().replace(/\s*mins?\s*$/i, '').trim(); setEl('lesson-duration-badge', d ? d + ' mins' : '—'); }

    // Video area — supports YouTube, Google Drive ID, Drive URL, or Sheet video tiers
    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      /* ── getVideoUrl(t, requestedTier) — TIER-AWARE URL RESOLVER  ★ CRITICAL PATH ★
         ─────────────────────────────────────────────────────────────────────────────
         Resolves the video URL to embed for the given topic and requested tier.

         This is the BRIDGE between the Google Sheet data and the iframe player:
           • topic.videos  → built by gsheet-curriculum.js buildVideos()
                             normalised via gdrive-video.js embedUrl()
                             stored in CURRICULUM via mergeSheetIntoCurriculum()
           • Returns       → a /preview or YouTube embed URL string for injectIframe()

         FALLBACK CHAIN (applied when a tier's URL is missing):
         ────────────────────────────────────────────────────────
         1. requestedTier  — the tier skill_chamber.js selected for this student
         2. 'standard'     — the default lesson (most complete)
         3. 'foundation'   — slower walkthrough
         4. 'mastery'      — exam-focused rapid version
         5. topic.driveId  — legacy field (hardcoded in classroom.js CURRICULUM)
         6. topic.driveUrl — legacy field (converted via GDRIVE_VIDEO.embedUrl)
         7. ''             — no video available; caller shows animated placeholder

         DEDUPLICATION:
         The order array is deduplicated with filter+indexOf to prevent the same
         tier from being tried twice (e.g. if requestedTier === 'standard', we
         don't want standard appearing at both positions 0 and 1).

         ⚠️  The tier key names ('foundation', 'standard', 'mastery') must match
             exactly what gsheet-curriculum.js uses in buildVideos().  If you
             rename a tier there, rename it in the order array here too.
         ──────────────────────────────────────────────────────────────────── */
      const getVideoUrl = (t, requestedTier) => {
        if (t.videos) {
          const order = [requestedTier, 'standard', 'foundation', 'mastery']
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i); // dedupe
          for (const t_tier of order) {
            const url = t.videos[t_tier] && t.videos[t_tier].url;
            if (url) return url;
          }
        }
        if (t.driveId) return `https://drive.google.com/file/d/${t.driveId}/preview`;
        if (t.driveUrl && window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.embedUrl(t.driveUrl);
        return '';
      };

      // ── Helpers for skeleton + tier badge ──
      const skeleton  = document.getElementById('video-skeleton');
      const tierBadge = document.getElementById('video-tier-badge');

      function showSkeleton() {
        if (skeleton) skeleton.style.display = 'flex';
      }
      function hideSkeleton() {
        if (skeleton) skeleton.style.display = 'none';
      }
      function showTierBadge(t) {
        if (!tierBadge) return;
        const labels = { foundation: '🟠 Foundation', standard: '🔵 Standard', mastery: '🟣 Mastery' };
        tierBadge.textContent = labels[t] || '';
        tierBadge.className = `video-tier-badge tier-${t}`;
        tierBadge.style.display = t ? 'block' : 'none';
      }

      // ── Detect YouTube URL ──
      function extractYouTubeId(url) {
        if (!url) return null;
        // Strip ?si= tracking params (e.g. youtu.be/ID?si=xxx) before matching
        const clean = url.replace(/[?&]si=[^&]*/i, '');
        const m = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
      }

      // ── Get student name for watermark ──
      const studentName = (window._ueProfile?.full_name || window._ueProfile?.email || 'UE School Student').trim();

      /* ── injectIframe(src, isYouTube)  ★ CRITICAL PATH ★
         ─────────────────────────────────────────────────────────────────
         The final step of the video pipeline — injects the <iframe>
         element into #video-area with the resolved embed URL.

         Called by renderLesson() with either:
           • A YouTube embed URL (isYouTube = true):
               https://www.youtube.com/embed/{ytId}?rel=0&...
           • A Google Drive /preview URL (isYouTube = false):
               https://drive.google.com/file/d/{FILE_ID}/preview
             (the URL comes from getVideoUrl() → gsheet-curriculum.js
              buildVideos() → gdrive-video.js embedUrl())

         WHAT injectIframe DOES:
         ───────────────────────
         1. Shows the loading skeleton (#video-skeleton) immediately.
         2. Creates an <iframe> with the resolved src.
         3. Hides the skeleton when iframe fires 'load' (or after 8s timeout).
         4. For Drive iframes only: overlays a transparent cover div in the
            top-right corner to block the Drive external-link arrow icon.
         5. Adds a repeating diagonal watermark overlay with the student's
            name (read from window._ueProfile, set in DOMContentLoaded).

         ⚠️  The `isYouTube` parameter controls the arrow blocker:
             YouTube iframes do not have the Drive external-link icon,
             so the blocker is only added for Drive embeds.  Do not add
             the blocker for YouTube embeds — it would cover the player UI.

         ⚠️  window._ueProfile is set by the DOMContentLoaded inline script
             (Step D) BEFORE CLASSROOM.init() is called.  If you change the
             profile storage point, the watermark will break.

         ⚠️  The iframe src is the direct output of the Google Sheets pipeline:
             Sheet CSV → gsheet-curriculum.js normaliseVideoUrl()
                       → gdrive-video.js embedUrl()
                       → TOPIC_BLUEPRINT[id].videos.standard.url
                       → CURRICULUM[subj].topics[n].videos.standard.url
                       → getVideoUrl() → here.
             Any breakage in that chain produces an empty src, which will
             result in a blank video area (no iframe injected).
      ──────────────────────────────────────────────────────────────── */
      function injectIframe(src, isYouTube) {
        // Cancel any pending skeleton-hide from a previous video load
        if (skeletonTimeoutId) { clearTimeout(skeletonTimeoutId); skeletonTimeoutId = null; }
        showSkeleton();

        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.allow = 'autoplay; fullscreen';
        iframe.allowFullscreen = true;
        iframe.loading = 'lazy';
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;z-index:3';

        iframe.addEventListener('load', hideSkeleton);
        skeletonTimeoutId = setTimeout(() => { hideSkeleton(); skeletonTimeoutId = null; }, 8000);

        // Stop and remove any existing iframe before injecting the new one.
        // Setting src='' first cuts the network connection and stops audio
        // immediately — without this, the old video keeps playing after removal.
        videoArea.querySelectorAll('iframe').forEach(old => {
          old.src = '';
          old.remove();
        });

        // Remove arrow blocker and watermark overlays from the previous video
        videoArea.querySelectorAll('#video-watermark, #video-arrow-blocker')
          .forEach(el => el.remove());

        // Clear placeholder elements
        videoArea.querySelectorAll('.video-bg,.video-grid,.video-play-btn,.video-duration')
          .forEach(el => el.remove());
        videoArea.appendChild(iframe);

        // ── Arrow blocker — sits ABOVE the iframe ──
        // Covers the top-right corner where Drive/YouTube puts the external link icon
        if (!isYouTube) {
          const cover = document.createElement('div');
          cover.id = 'video-arrow-blocker';
          cover.style.cssText = [
            'position:absolute',
            'top:0','right:0',
            'width:80px','height:60px',
            'z-index:10',
            'background:transparent',
            'pointer-events:all',
            'cursor:default',
          ].join(';');
          videoArea.appendChild(cover);
        }

        // ── Watermark overlay ──
        if (studentName) {
          const wm = document.createElement('div');
          wm.id = 'video-watermark';
          const escaped = studentName.replace(/</g,'&lt;').replace(/>/g,'&gt;');

          wm.style.cssText = [
            'position:absolute','inset:0',
            'z-index:9',
            'pointer-events:none',
            'overflow:hidden',
          ].join(';');

          wm.innerHTML = `
            <div style="
              position:absolute;bottom:10px;right:12px;
              display:flex;align-items:center;gap:5px;
              background:rgba(0,0,0,0.45);
              backdrop-filter:blur(6px);
              -webkit-backdrop-filter:blur(6px);
              border:1px solid rgba(255,255,255,0.1);
              border-radius:5px;
              padding:3px 9px 3px 7px;
              pointer-events:none;user-select:none;
            ">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.5 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="rgba(255,255,255,0.45)" stroke-width="0.9"/>
                <path d="M3.2 3.2h2.6L3.2 5.8h2.6" stroke="rgba(255,255,255,0.45)" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span style="
                color:rgba(255,255,255,0.5);
                font-size:0.58rem;
                font-weight:600;
                letter-spacing:0.07em;
                white-space:nowrap;
                text-transform:uppercase;
                font-family:'DM Sans',system-ui,sans-serif;
              ">${escaped}</span>
            </div>`;

          videoArea.appendChild(wm);
        }
      }

      // Determine video source — YouTube takes priority
      const rawUrl = getVideoUrl(topic, tier);
      const ytId   = topic.youtubeId || extractYouTubeId(rawUrl);

      if (ytId) {
        // YouTube embed — no Drive cover needed
        showTierBadge(tier);
        injectIframe(
          `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`,
          true
        );
      } else if (rawUrl) {
        // Google Drive embed
        showTierBadge(tier);
        injectIframe(rawUrl, false);
      } else {
        // No video yet — show animated placeholder.
        // Remove any existing iframe/overlays but preserve structural elements
        // (video-skeleton, video-tier-badge) so they remain findable later.
        videoArea.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
        videoArea.querySelectorAll('#video-watermark, #video-arrow-blocker').forEach(el => el.remove());
        videoArea.querySelectorAll('.video-bg,.video-grid,.video-play-btn,.video-duration').forEach(el => el.remove());
        videoArea.insertAdjacentHTML('beforeend',
          '<div class="video-bg"></div>' +
          '<div class="video-grid"></div>' +
          `<div class="video-play-btn" onclick="CLASSROOM.playVideo('${topic.id}')">&#x25B6;</div>` +
          `<div class="video-duration">${topic.duration}</div>`
        );
        hideSkeleton();
        if (tierBadge) tierBadge.style.display = 'none';
      }
    }

    // Lesson content
    const contentEl = document.getElementById('lesson-content');
    if (contentEl) {
      const { intro, points = [], formulas = [] } = topic.content;

      const pointsHTML = points.length ? `
        <h3>Key Points</h3>
        <ul>${points.map(p => `<li><span class="bullet">•</span>${p}</li>`).join('')}</ul>
      ` : '';

      const formulaHTML = formulas.length ? `
        <div class="formula-box">
          <div class="formula-box-label">Formula Box</div>
          <div class="formula-grid">
            ${formulas.map(f => `<div class="formula-item"><strong style="font-size:.72rem;color:var(--muted);display:block;margin-bottom:4px">${f.label}</strong>${f.formula}</div>`).join('')}
          </div>
        </div>
      ` : '';

      contentEl.innerHTML = `<p>${intro}</p>${pointsHTML}${formulaHTML}`;
    }

    // Quick quiz
    quizState = { idx: 0, questions: topic.quiz || [], answered: 0, correct: 0 };
    renderQuiz();

    // Practice button
    const practiceBtn = document.getElementById('practice-btn');
    if (practiceBtn) {
      const parts = topicId(topic);
      practiceBtn.href = `cbt.html?subject=${parts.subj}&topic=${encodeURIComponent(parts.topic)}`;
    }

    // Mark as studied in Supabase (fire-and-forget)
    if (userId) {
      window.sb.from('topic_mastery').upsert({
        user_id:     userId,
        topic_id:    topic.id,
        last_studied: new Date().toISOString(),
        status:      'IN_PROGRESS'
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: false }).then(() => {});
    }
  }

  function topicId(topic) {
    const parts = topic.id.split('.');
    return { subj: parts[0], topic: parts.slice(1).join('.') };
  }

  // ─── Video placeholder click ──────────────────────
  function playVideo(topicId) {
    toast('Video lesson coming soon! Practice with CBT questions in the meantime.');
  }

  // ─── Next / Prev lesson navigation ───────────────
  function nextLesson() {
    const subj   = CURRICULUM[currentSubject];
    if (!subj) return;
    const idx    = subj.topics.findIndex(t => t.id === currentTopicId);
    const next   = subj.topics.slice(idx + 1).find(t => topicUnlockedForUser(t));
    if (next) selectTopic(next.id);
    else toast('You\'ve completed all available lessons in this subject! &#x1F389;');
  }

  function prevLesson() {
    const subj = CURRICULUM[currentSubject];
    if (!subj) return;
    const idx  = subj.topics.findIndex(t => t.id === currentTopicId);
    if (idx > 0) selectTopic(subj.topics[idx - 1].id);
  }

  // ─── Quiz ─────────────────────────────────────────
  function renderQuiz() {
    const section = document.getElementById('quiz-section');
    if (!section) return;

    if (!quizState.questions.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    const q = quizState.questions[quizState.idx];

    setEl('quiz-q-num',   String(quizState.idx + 1));
    setEl('quiz-q-total', String(quizState.questions.length));

    const questionEl = document.getElementById('quiz-question');
    if (questionEl) questionEl.innerHTML = q.q;

    // Dots
    const dotsEl = document.getElementById('quiz-dots');
    if (dotsEl) {
      dotsEl.innerHTML = quizState.questions.map((_, i) => {
        const cls = i < quizState.idx ? 'done' : i === quizState.idx ? 'active' : '';
        return `<div class="quiz-dot ${cls}"></div>`;
      }).join('');
    }

    // Options
    const optsEl = document.getElementById('quiz-options');
    if (optsEl) {
      optsEl.innerHTML = '';
      q.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'drill-option';
        btn.innerHTML = `<span class="opt-label">${String.fromCharCode(65 + i)}</span>${opt}`;
        btn.onclick = () => checkAnswer(i, btn);
        optsEl.appendChild(btn);
      });
    }

    const fb = document.getElementById('quiz-feedback');
    if (fb) fb.style.display = 'none';
  }

  function checkAnswer(idx, btn) {
    const q  = quizState.questions[quizState.idx];
    const fb = document.getElementById('quiz-feedback');

    document.querySelectorAll('#quiz-options .drill-option').forEach(b => b.style.pointerEvents = 'none');
    btn.classList.add('selected');

    const isCorrect = idx === q.ans;
    if (isCorrect) quizState.correct++;

    if (fb) {
      fb.style.display = 'block';
      if (isCorrect) {
        fb.style.cssText = 'display:block;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
        fb.innerHTML   = '&#x2713; Correct! Well done.';
      } else {
        fb.style.cssText = 'display:block;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
        fb.innerHTML   = `&#x2717; Not quite. Correct answer: ${q.opts[q.ans]}.`;
        const allBtns = document.querySelectorAll('#quiz-options .drill-option');
        if (allBtns[q.ans]) allBtns[q.ans].style.borderColor = '#22c55e';
      }
    }

    setTimeout(() => {
      if (quizState.idx < quizState.questions.length - 1) {
        quizState.idx++;
        renderQuiz();
      } else {
        // Quiz complete
        const pct = Math.round((quizState.correct / quizState.questions.length) * 100);
        if (fb) {
          fb.style.cssText = 'display:block;background:rgba(79,142,255,.1);color:#3b82f6;border:1px solid rgba(79,142,255,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
          fb.innerHTML = `&#x1F389; Quiz complete! You scored <strong>${pct}%</strong>. <a href="${document.getElementById('practice-btn')?.href || 'cbt.html'}" style="color:var(--accent);text-decoration:underline">Take full practice \u2192</a>`;
        }
        if (document.getElementById('quiz-options')) document.getElementById('quiz-options').innerHTML = '';
      }
    }, 1500);
  }

  // ─── Helpers ──────────────────────────────────────
  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function closeSidebar() {
    document.querySelector('.classroom-sidebar')?.classList.remove('drawer-open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');
  }

  function toggleSidebar() {
    const sidebar = document.querySelector('.classroom-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const isOpen  = sidebar?.classList.toggle('drawer-open');
    overlay?.classList.toggle('open', isOpen);
  }

  // ─── loadTopic — public alias used by Skill Chamber monkey-patch ─
  // skill_chamber.js wraps this function to intercept topic loading
  // and run the adaptive diagnostic before rendering the lesson.
  // opts.tier: 'foundation' | 'standard' | 'mastery'
  function loadTopic(topicId, opts) {
    opts = opts || {};
    selectTopic(topicId, opts.tier);
  }

  // ── Stop floating — dock video back ──
  function stopFloat() {
    const va = document.getElementById('video-area');
    const ph = document.getElementById('video-placeholder-box');
    if (va) { va.classList.remove('floating'); va.style.left = ''; va.style.top = ''; }
    if (ph) ph.classList.remove('visible');
    if (skeletonTimeoutId) { clearTimeout(skeletonTimeoutId); skeletonTimeoutId = null; }
  }

  return {
    init, switchSubject, selectTopic, loadTopic, nextLesson, prevLesson,
    playVideo, toggleSidebar, closeSidebar, stopFloat, CURRICULUM,
    mergeSheetIntoCurriculum,
  };

})();
