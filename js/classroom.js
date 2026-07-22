/* ═══════════════════════════════════════════════════════════════════
   UE School — js/classroom.js  (v6 — Drive mobile fix)
   ───────────────────────────────────────────────────────────────────

   VIDEO PLAYER — HOW IT WORKS
   ──────────────────────────────
   The #vp element uses a data-state attribute as a CSS state machine:

     data-state="empty"    → only #vp-empty is visible   (placeholder)
     data-state="loading"  → only #vp-spin  is visible   (spinner)
     data-state="playing"  → only the iframe is visible  (video)

   CSS (in classroom.html) enforces "display:none" on all children by
   default and selectively shows exactly one based on data-state. This
   makes it physically impossible for multiple elements to overlap.

   VIDEO SIZING — YOUTUBE vs GOOGLE DRIVE
   ────────────────────────────────────────
   YouTube: simple absolute fill (position:absolute;inset:0;width:100%;
   height:100%). YouTube's compact player keeps controls at the bottom
   even at narrow widths, so no special treatment is needed.

   Google Drive /preview: Drive detects the iframe's rendered pixel
   dimensions and switches to a "compact" layout when the iframe is
   narrower than ~480 px (typical on mobile). In compact mode the
   progress bar moves to the top and bottom controls are clipped by the
   container's overflow:hidden.

   Fix: render the Drive iframe at a fixed large logical size (1280×720)
   and CSS-scale it down to fill the container. Drive sees a desktop-
   sized viewport and keeps its full-size control layout. A ResizeObserver
   recalculates the scale on orientation change or split-screen resize.

   ?rm=minimal is also appended to Drive URLs to strip the top chrome
   bar (file title + "Open in Drive" button), freeing the full height
   for the video and controls.

   PUBLIC API (stable — skill_chamber.js monkey-patches loadTopic)
   ─────────────────────────────────────────────────────────────────
   CLASSROOM.init(authData)
   CLASSROOM.mergeSheetIntoCurriculum()
   CLASSROOM.switchSubject(key, tabEl)
   CLASSROOM.selectTopic(topicId, tier)
   CLASSROOM.selectTier(tier)
   CLASSROOM.loadTopic(topicId, opts)       ← monkey-patched
   CLASSROOM.nextLesson()
   CLASSROOM.prevLesson()
   CLASSROOM.playVideo(topicId)
   CLASSROOM.toggleSidebar()
   CLASSROOM.closeSidebar()
   CLASSROOM.stopFloat()
   CLASSROOM.CURRICULUM

   LOAD ORDER (enforced by classroom.html):
     supabase → auth.js → auth-guard.js →
     storage / skill_questions / curriculum / intervention_modal →
     gdrive-video.js → gsheet-curriculum.js → THIS FILE → skill_chamber.js
═══════════════════════════════════════════════════════════════════ */

window.CLASSROOM = (function () {
  'use strict';

  /* ── Curriculum shells ─────────────────────────────────────────
     Topics are populated at runtime by mergeSheetIntoCurriculum().
  ─────────────────────────────────────────────────────────────── */
  const CURRICULUM = {
    mathematics:    { label:'Mathematics',                  topics:[] },
    english:        { label:'English Language',             topics:[] },
    physics:        { label:'Physics',                      topics:[] },
    chemistry:      { label:'Chemistry',                    topics:[] },
    biology:        { label:'Biology',                      topics:[] },
    agric:          { label:'Agricultural Science',         topics:[] },
    economics:      { label:'Economics',                    topics:[] },
    government:     { label:'Government',                   topics:[] },
    literature:     { label:'Literature in English',        topics:[] },
    commerce:       { label:'Commerce',                     topics:[] },
    accounting:     { label:'Principles of Accounting',     topics:[] },
    crs:            { label:'Christian Religious Studies',  topics:[] },
    irs:            { label:'Islamic Religious Studies',    topics:[] },
    history:        { label:'History',                      topics:[] },
    geography:      { label:'Geography',                    topics:[] },
    computer:       { label:'Computer Studies',             topics:[] },
    phe:            { label:'Physical & Health Education',  topics:[] },
    fineart:        { label:'Fine Art',                     topics:[] },
    music:          { label:'Music',                        topics:[] },
    homeeconomics:  { label:'Home Economics',               topics:[] },
    french:         { label:'French',                       topics:[] },
    arabic:         { label:'Arabic',                       topics:[] },
    yoruba:         { label:'Yoruba',                        topics:[] },
    igbo:           { label:'Igbo',                          topics:[] },
    hausa:          { label:'Hausa',                         topics:[] },
  };

  /* ── Free-tier video tracking ─────────────────────────────── */
  const FREE_KEY = 'ue_free_videos_watched';
  function getWatched()    { try{return JSON.parse(localStorage.getItem(FREE_KEY)||'[]');}catch(_){return[];} }
  function markWatched(id) {
    const ids = getWatched();
    if (!ids.includes(id)) { ids.push(id); try{localStorage.setItem(FREE_KEY,JSON.stringify(ids));}catch(_){} }
  }

  /* ── State ─────────────────────────────────────────────────── */
  let currentSubject = 'mathematics';
  let currentTopicId = null;
  let currentTier    = 'standard';
  let isPremiumUser  = false;
  let userId         = null;
  let studentName    = '';
  let loadingTimer   = null;   // auto-dismiss spinner

  /* ── Helpers ───────────────────────────────────────────────── */
  function topicUnlocked(topic) {
    if (isPremiumUser) return true;
    if (getWatched().includes(topic.id)) return true;
    return AUTH_GUARD.canSampleFeature('video');
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showToast(msg, dur) {
    if (typeof window.toast === 'function') { window.toast(msg, dur); return; }
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), dur || 2800);
  }

  /* ═══════════════════════════════════════════════════════════════
     VIDEO STATE MACHINE
     ════════════════════
     setVideoState(s) is the ONLY function that touches data-state.
     All other functions call setVideoState to transition.

     'empty'   — no topic selected (placeholder UI)
     'loading' — topic selected, iframe being prepared
     'playing' — iframe visible and playing
  ═══════════════════════════════════════════════════════════════ */

  function setVideoState(state) {
    const vp = document.getElementById('vp');
    if (vp) vp.dataset.state = state;
  }

  /* ── Drive iframe scale helper ───────────────────────────────
     Google Drive's /preview player switches to a compact layout
     (progress bar at top, bottom controls clipped) when the
     rendered iframe width is below ~480 px — typical on mobile.

     Fix: render the iframe at DRIVE_LOGICAL_W × DRIVE_LOGICAL_H
     and CSS-scale it down to fill the container. Drive sees a
     desktop viewport and renders its full-size control layout.

     Called once on inject and again via ResizeObserver on resize.
  ──────────────────────────────────────────────────────────────── */
  const DRIVE_LOGICAL_W = 1280;
  const DRIVE_LOGICAL_H = 720;

  function applyDriveScale(iframe, container) {
    var cw = container.offsetWidth;
    var ch = container.offsetHeight;
    if (!cw || !ch) return;

    var scale = Math.min(cw / DRIVE_LOGICAL_W, ch / DRIVE_LOGICAL_H);
    var left  = (cw - DRIVE_LOGICAL_W * scale) / 2;
    var top   = (ch - DRIVE_LOGICAL_H * scale) / 2;

    iframe.style.cssText = [
      'position:absolute',
      'border:none',
      'width:'  + DRIVE_LOGICAL_W + 'px',
      'height:' + DRIVE_LOGICAL_H + 'px',
      'left:'   + left  + 'px',
      'top:'    + top   + 'px',
      'transform:scale(' + scale + ')',
      'transform-origin:top left',
    ].join(';');
  }

  /* ── injectIframe ────────────────────────────────────────────
     The single point of iframe injection. Cleans up previous
     iframe, creates a new one, transitions through loading→playing.

     YouTube: simple absolute fill — compact layout keeps controls
     at the bottom even on narrow screens, no special handling needed.

     Google Drive: uses applyDriveScale() to render at a large
     logical size and CSS-scale down, preventing Drive's compact
     mobile layout. A ResizeObserver keeps the scale correct on
     orientation change or split-screen resize.
  ──────────────────────────────────────────────────────────────── */
  function injectIframe(src, isDrive) {
    const vp = document.getElementById('vp');
    if (!vp) return;

    // Clear any previous iframe (and its ResizeObserver if Drive)
    vp.querySelectorAll('iframe').forEach(function(f) {
      if (f._driveRO) { f._driveRO.disconnect(); f._driveRO = null; }
      f.src = ''; f.remove();
    });

    // Clear previous overlays
    const wm  = document.getElementById('vp-wm');
    const blk = document.getElementById('vp-blk');
    if (wm)  wm.innerHTML = '';
    if (blk) blk.style.pointerEvents = 'none';

    // Cancel previous loading timer
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }

    // Transition to loading state
    setVideoState('loading');

    // Build the iframe
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.setAttribute('loading', 'lazy');

    if (isDrive) {
      // ── Google Drive: scale trick for mobile ──────────────────
      // Render at a large logical size so Drive uses its full-size
      // control layout, then CSS-scale down to fit the container.
      applyDriveScale(iframe, vp);

      // Re-apply whenever the container resizes (orientation change,
      // split-screen, etc.)
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function() { applyDriveScale(iframe, vp); });
        ro.observe(vp);
        iframe._driveRO = ro;   // stored so clearVideo() can disconnect it
      }
    } else {
      // ── YouTube / other: simple absolute fill ─────────────────
      iframe.style.cssText = [
        'position:absolute',
        'inset:0',
        'width:100%',
        'height:100%',
        'border:none',
      ].join(';');
    }

    // Insert iframe BEFORE overlays so overlays stay on top
    const wm2 = document.getElementById('vp-wm');
    vp.insertBefore(iframe, wm2);

    // Transition to playing after a brief moment.
    // We DON'T rely on iframe.load event because:
    //   • Cross-origin iframes (GDrive, YouTube) block load-event timing
    //   • Drive's /preview may redirect internally before content shows
    // Instead we give a short delay so the browser can start rendering
    // the iframe, then flip the state. User sees video appear naturally.
    loadingTimer = setTimeout(function() {
      loadingTimer = null;
      setVideoState('playing');
    }, 1200);

    // GDrive: activate arrow-icon blocker
    if (isDrive && blk) {
      blk.style.pointerEvents = 'all';
    }

    // Student watermark
    if (studentName && wm2) {
      const safeName = esc(studentName);
      wm2.innerHTML = `<div style="
        position:absolute;bottom:9px;right:11px;
        background:rgba(0,0,0,.42);backdrop-filter:blur(6px);
        -webkit-backdrop-filter:blur(6px);
        border:1px solid rgba(255,255,255,.1);border-radius:5px;
        padding:3px 9px 3px 7px;pointer-events:none;user-select:none;
        display:flex;align-items:center;gap:5px">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="5" cy="5" r="4" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
          <path d="M3.5 3.5h3L3.5 6.5h3" stroke="rgba(255,255,255,0.35)" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="color:rgba(255,255,255,.45);font-size:.55rem;font-weight:600;
          letter-spacing:.07em;white-space:nowrap;text-transform:uppercase;
          font-family:'Inter',system-ui,sans-serif">${safeName}</span>
      </div>`;
    }
  }

  /* ── clearVideo — return to empty state ─────────────────────── */
  function clearVideo() {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    const vp  = document.getElementById('vp');
    const wm  = document.getElementById('vp-wm');
    const blk = document.getElementById('vp-blk');
    const bdg = document.getElementById('vp-badge');
    if (vp)  {
      vp.querySelectorAll('iframe').forEach(function(f) {
        // Disconnect Drive ResizeObserver before removing the iframe
        if (f._driveRO) { f._driveRO.disconnect(); f._driveRO = null; }
        f.src=''; f.remove();
      });
      vp.classList.remove('floating');
    }
    if (wm)  { wm.innerHTML = ''; }
    if (blk) { blk.style.pointerEvents = 'none'; }
    if (bdg) { bdg.style.display = 'none'; }
    setVideoState('empty');
    const hint = document.getElementById('vp-hint');
    if (hint) hint.classList.remove('show');
  }

  /* ── getVideoUrl — tier-aware ────────────────────────────────── */
  function getVideoUrl(topic, requestedTier) {
    requestedTier = requestedTier || 'standard';
    if (topic.videos) {
      const order = [requestedTier, 'standard', 'foundation', 'mastery'];
      const seen  = new Set();
      for (const t of order) {
        if (seen.has(t)) continue; seen.add(t);
        const v = topic.videos[t];
        if (v && v.url) return v.url;
      }
    }
    // ?rm=minimal strips Drive's top chrome bar (file title + open-in-Drive
    // button), freeing the full iframe height for the video and controls.
    if (topic.driveId) return `https://drive.google.com/file/d/${topic.driveId}/preview?rm=minimal`;
    if (topic.driveUrl && window.GDRIVE_VIDEO) return GDRIVE_VIDEO.embedUrl(topic.driveUrl) || '';
    return '';
  }

  /* ── extractYouTubeId ────────────────────────────────────────── */
  function extractYouTubeId(url) {
    if (!url) return '';
    const m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
           || url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
           || url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  /* ── showTierBadge ───────────────────────────────────────────── */
  function showTierBadge(tier) {
    const b = document.getElementById('vp-badge');
    if (!b) return;
    const labels = { foundation:'Foundation', standard:'Standard', mastery:'Mastery' };
    b.textContent = labels[tier] || '';
    b.className   = tier;
    b.id          = 'vp-badge';   // keep id after className reassign
    b.style.display = 'block';
  }

  /* ── mergeSheetIntoCurriculum ────────────────────────────────── */
  function mergeSheetIntoCurriculum() {
    const blueprint = window.TOPIC_BLUEPRINT || {};
    let count = 0;
    for (const topic of Object.values(blueprint)) {
      if (topic._source !== 'gsheet') continue;
      const subj = topic.subject;
      if (!subj) continue;
      if (!CURRICULUM[subj]) {
        CURRICULUM[subj] = { label: subj.charAt(0).toUpperCase() + subj.slice(1), topics: [] };
      }
      const t = {
        id:      topic.id,
        title:   topic.title,
        examTopic: topic.examTopic || '',
        duration:topic.duration || '14 mins',
        premium: false,
        videos:  topic.videos || null,
        content: {
          intro:    topic.blurb || '',
          points:   topic.objectives || [],
          formulas: (topic.formulas || []).map(f => ({ formula: f })),
        },
        quiz: [],
      };
      const idx = CURRICULUM[subj].topics.findIndex(x => x.id === topic.id);
      if (idx >= 0) CURRICULUM[subj].topics[idx] = t;
      else          CURRICULUM[subj].topics.push(t);
      count++;
    }
    if (count) console.info(`[CLASSROOM] Merged ${count} topics from sheet.`);
  }

  /* ── init ────────────────────────────────────────────────────── */
  async function init(authData) {
    if (!authData) return;
    const { profile, session } = authData;
    userId        = session?.user?.id;
    isPremiumUser = AUTH_GUARD.isPremium(profile);
    studentName   = profile?.full_name || '';

    const banner = document.getElementById('exp-banner');
    if (banner) banner.style.display =
      AUTH_GUARD.subscriptionStatus(profile) === 'EXPIRED' ? 'block' : 'none';

    const subs = (profile?.exam_subjects || []).filter(s => CURRICULUM[s]);
    const list = subs.length ? subs : Object.keys(CURRICULUM);

    renderTabs(list);

    const params   = new URLSearchParams(window.location.search);
    const urlSubj  = params.get('subject');
    const urlTopic = params.get('topic');
    const startS   = (urlSubj && CURRICULUM[urlSubj]) ? urlSubj : list[0] || 'mathematics';
    currentSubject = startS;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.subject === startS));
    renderSidebar(startS, urlTopic);
  }

  /* ── renderTabs ──────────────────────────────────────────────── */
  function renderTabs(subjects) {
    const c = document.getElementById('subject-tabs');
    if (!c) return;
    c.innerHTML = subjects.map(s => {
      const m = CURRICULUM[s];
      return m ? `<button class="tab-btn" data-subject="${s}" onclick="CLASSROOM.switchSubject('${s}',this)">${m.label}</button>` : '';
    }).join('');
  }

  /* ── switchSubject ───────────────────────────────────────────── */
  function switchSubject(key, tabEl) {
    if (!CURRICULUM[key]) return;
    currentSubject = key; currentTopicId = null; currentTier = 'standard';
    clearVideo();
    const ti = document.getElementById('lesson-title');
    const ci = document.getElementById('lesson-content');
    const qi = document.getElementById('quiz-section');
    const ri = document.getElementById('tier-row');
    if (ti) ti.textContent = 'Select a topic';
    if (ci) ci.innerHTML = '<p style="color:var(--muted)">Select a topic from the sidebar to begin.</p>';
    if (qi) qi.style.display = 'none';
    if (ri) ri.style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');
    renderSidebar(key, null);
  }

  /* ── renderSidebar ───────────────────────────────────────────── */
  function renderSidebar(subjKey, autoSelect) {
    const subj = CURRICULUM[subjKey];
    if (!subj) return;
    const sEl = document.getElementById('sb-subj');
    const cEl = document.getElementById('sb-cnt');
    if (sEl) sEl.textContent = subj.label;
    if (cEl) cEl.textContent = `${subj.topics.length} Lesson${subj.topics.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('topic-list');
    if (!list) return;

    if (!subj.topics.length) {
      const cfgd = window.UE_CONFIG?.CURRICULUM_SHEET_URLS?.[subjKey];
      const err  = window.GSHEET_CURRICULUM?.getLastError?.();
      list.innerHTML = `<div style="padding:28px 14px;text-align:center;color:var(--muted);font-size:.8rem;line-height:1.65">
        <div style="font-size:1.8rem;margin-bottom:10px">📋</div>
        <strong style="display:block;margin-bottom:7px;color:var(--txt2)">${
          !cfgd ? `${subj.label} — no sheet configured`
        : err   ? `${subj.label} — sheet error`
        :          `${subj.label} coming soon`
        }</strong>
        <span style="font-size:.75rem">${
          !cfgd ? `Add a CSV URL for <strong>${subjKey}</strong> in <code>config.js → CURRICULUM_SHEET_URLS</code>.`
        : err   ? `Check that the sheet is published (File → Publish to web → CSV).`
        :          `No topics added yet.`
        }</span>
      </div>`;
      return;
    }

    list.innerHTML = subj.topics.map((t, i) => {
      const locked = !topicUnlocked(t);
      const active = t.id === currentTopicId;
      return `<button class="ti${active?' active':''}${locked?' locked':''}" data-topic-id="${t.id}"
        onclick="CLASSROOM.loadTopic('${t.id}')">
        <span class="ti-n">${i+1}</span>
        <span class="ti-t">${esc(t.title)}</span>
        ${locked ? '<span class="ti-p">PRO</span>' : ''}
      </button>`;
    }).join('');

    const first = subj.topics.find(t => topicUnlocked(t));
    let target = null;
    if (autoSelect) {
      const match = subj.topics.find(t =>
        t.id.endsWith(autoSelect) || t.title.toLowerCase() === autoSelect.toLowerCase()
      );
      target = match?.id || first?.id || null;
    } else {
      target = first?.id || null;
    }
    if (target) selectTopic(target);
  }

  /* ── selectTopic ─────────────────────────────────────────────── */
  function selectTopic(topicId, tier) {
    let topic = null;
    for (const s of Object.values(CURRICULUM)) {
      topic = s.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    if (!topicUnlocked(topic)) {
      AUTH_GUARD.bouncePremium('You\'ve used your free video sample. Upgrade to UE Premium to unlock every lesson.');
      return;
    }

    if (!isPremiumUser && !getWatched().includes(topic.id)) {
      AUTH_GUARD.recordSampleUse('video');
      markWatched(topic.id);
    }

    currentTopicId = topicId;
    currentTier    = tier || 'standard';

    document.querySelectorAll('.ti').forEach(el =>
      el.classList.toggle('active', el.dataset.topicId === topicId));

    renderLesson(topic, currentTier);
    closeSidebar();
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;

    // Non-blocking Supabase progress log
    if (userId && window.sb) {
      window.sb.from('topic_mastery').upsert({
        user_id:    userId,
        topic_id:   topicId,
        started_at: new Date().toISOString(),
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn('[CLASSROOM] mastery upsert:', error.message); });
    }
  }

  /* ── renderLesson ────────────────────────────────────────────── */
  function renderLesson(topic, tier) {
    tier = tier || 'standard';

    // Meta
    const chipEl  = document.getElementById('topic-chip');
    const durEl   = document.getElementById('dur-chip');
    const titleEl = document.getElementById('lesson-title');
    if (chipEl)  chipEl.textContent  = topic.title;
    if (durEl)   durEl.textContent   = topic.duration || '14 mins';
    if (titleEl) titleEl.textContent = topic.title;

    // Practice-Questions deep link → cbt.html, pre-filling subject + topic
    // so a student can immediately drill what they just watched.
    //
    // Prefer topic.examTopic when the curriculum sheet declares one — this
    // covers subjects (e.g. Biology) where the question bank groups several
    // fine-grained curriculum lessons under one broader topic tag, so the
    // lesson title itself wouldn't match anything in the question bank.
    // Falls back to the human-readable lesson title (matches the question
    // bank's topic column reliably for subjects with 1:1 granularity, like
    // Maths), with topic.id as a last-resort fuzzy-match candidate.
    //
    // A curriculum row can set exam_topic to the literal word "SKIP" to
    // explicitly mark a lesson as not yet mapped to any question-bank
    // topic — this greys out the button instead of linking to a guess.
    // A genuinely blank exam_topic is NOT treated as SKIP: it just falls
    // back to the title match, same as subjects that never use this
    // column at all (e.g. Maths), so nothing breaks for them.
    const practiceBtn = document.getElementById('practice-btn');
    if (practiceBtn) {
      // Cache the button's original label the first time we see it, so we
      // can restore it exactly when switching away from a skipped lesson.
      if (!practiceBtn.dataset.originalLabel) {
        practiceBtn.dataset.originalLabel = practiceBtn.innerHTML;
      }
      const isSkipped = (topic.examTopic || '').trim().toLowerCase() === 'skip';
      if (isSkipped) {
        practiceBtn.removeAttribute('href');
        practiceBtn.setAttribute('aria-disabled', 'true');
        practiceBtn.title = 'Practice questions for this lesson are coming soon';
        practiceBtn.innerHTML = '&#128274;&nbsp;Coming Soon';
        practiceBtn.style.pointerEvents = 'none';
        practiceBtn.style.opacity = '0.45';
        practiceBtn.style.filter = 'grayscale(1)';
        practiceBtn.style.cursor = 'not-allowed';
      } else {
        practiceBtn.removeAttribute('aria-disabled');
        practiceBtn.title = '';
        practiceBtn.innerHTML = practiceBtn.dataset.originalLabel;
        practiceBtn.style.pointerEvents = '';
        practiceBtn.style.opacity = '';
        practiceBtn.style.filter = '';
        practiceBtn.style.cursor = '';
        const subjKey = topic.subject || currentSubject;
        const topicParam = topic.examTopic || topic.title || topic.id;
        practiceBtn.href = `cbt.html?subject=${encodeURIComponent(subjKey)}`
          + `&topic=${encodeURIComponent(topicParam)}`
          + `&topicId=${encodeURIComponent(topic.id)}`;
      }
    }

    // Tier pills
    const tierRow = document.getElementById('tier-row');
    if (tierRow) {
      const hasTiers = topic.videos && Object.keys(topic.videos).length > 1;
      tierRow.style.display = hasTiers ? 'flex' : 'none';
      if (hasTiers) {
        document.querySelectorAll('.tier-pill').forEach(p =>
          p.classList.toggle('active', p.dataset.tier === tier));
        const tagEl = document.getElementById('tier-tag');
        if (tagEl) tagEl.textContent = topic.videos?.[tier]?.tagline
          ? `— ${topic.videos[tier].tagline}` : '';
      }
    }

    // Video
    const url  = getVideoUrl(topic, tier);
    const ytId = topic.youtubeId || extractYouTubeId(url);

    if (ytId) {
      showTierBadge(tier);
      injectIframe(`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`, false);
    } else if (url) {
      showTierBadge(tier);
      injectIframe(url, true); // isDrive=true → scale trick + arrow blocker
    } else {
      clearVideo();
    }

    renderContent(topic);
    renderQuizSection(topic);
  }

  /* ── selectTier (public, called by tier pills) ───────────────── */
  function selectTier(tier) {
    if (!currentTopicId) return;
    currentTier = tier;
    document.querySelectorAll('.tier-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.tier === tier));

    let topic = null;
    for (const s of Object.values(CURRICULUM)) {
      topic = s.topics.find(t => t.id === currentTopicId);
      if (topic) break;
    }
    if (!topic) return;

    const url  = getVideoUrl(topic, tier);
    const ytId = extractYouTubeId(url);
    if (ytId)      injectIframe(`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`, false);
    else if (url)  injectIframe(url, true);

    const tagEl = document.getElementById('tier-tag');
    if (tagEl) tagEl.textContent = topic.videos?.[tier]?.tagline
      ? `— ${topic.videos[tier].tagline}` : '';
    showTierBadge(tier);
  }

  /* ── renderContent ───────────────────────────────────────────── */
  function renderContent(topic) {
    const el = document.getElementById('lesson-content');
    if (!el) return;
    const c = topic.content || {};
    let html = '';
    if (c.intro) html += `<p>${esc(c.intro)}</p>`;
    if (c.points?.length) {
      html += '<h3>Key Points</h3><ul>';
      html += c.points.map(p => `<li><span class="blt">&#x25CF;</span>${esc(p)}</li>`).join('');
      html += '</ul>';
    }
    if (c.formulas?.length) {
      html += '<div class="fbox"><div class="fbox-lbl">Key Formulas</div><div class="fgrid">';
      html += c.formulas.map(f => `<div class="fitem">${esc(typeof f==='string'?f:f.formula||'')}</div>`).join('');
      html += '</div></div>';
    }
    if (!html) html = '<p style="color:var(--muted)">Lesson content will appear once it has been added to your curriculum sheet.</p>';
    el.innerHTML = html;
  }

  /* ── renderQuizSection ───────────────────────────────────────── */
  function renderQuizSection(topic) {
    const qs = document.getElementById('quiz-section');
    if (!qs) return;
    if (topic.quiz?.length) {
      _quiz = { idx:0, correct:0, questions: topic.quiz };
      renderQuiz();
      qs.style.display = 'block';
    } else {
      qs.style.display = 'none';
    }
  }

  let _quiz = { idx:0, correct:0, questions:[] };

  function renderQuiz() {
    const q   = _quiz.questions[_quiz.idx];
    const nEl = document.getElementById('q-num');
    const tEl = document.getElementById('q-tot');
    const dEl = document.getElementById('q-dots');
    const qEl = document.getElementById('quiz-q');
    const oEl = document.getElementById('quiz-opts');
    const fEl = document.getElementById('quiz-fb');
    if (nEl) nEl.textContent = _quiz.idx + 1;
    if (tEl) tEl.textContent = _quiz.questions.length;
    if (dEl) dEl.innerHTML = _quiz.questions.map((_,i) => {
      const cls = i < _quiz.idx ? 'qdot done' : i === _quiz.idx ? 'qdot active' : 'qdot';
      return `<span class="${cls}"></span>`;
    }).join('');
    if (qEl) qEl.textContent = q.q || '';
    if (fEl) fEl.style.display = 'none';
    if (oEl) {
      const ltrs = ['A','B','C','D'];
      oEl.innerHTML = (q.opts||[]).map((o,i) =>
        `<button class="opt" onclick="CLASSROOM._qa(${i},this)">
           <span class="opt-l">${ltrs[i]}</span>${esc(o)}</button>`
      ).join('');
    }
  }

  function _qa(idx, btn) {
    const q  = _quiz.questions[_quiz.idx];
    const fEl = document.getElementById('quiz-fb');
    document.querySelectorAll('#quiz-opts .opt').forEach(b => b.style.pointerEvents = 'none');
    btn.classList.add('sel');
    const ok = idx === q.ans;
    if (ok) _quiz.correct++;
    if (fEl) {
      fEl.style.display = 'block';
      fEl.style.cssText = ok
        ? 'display:block;background:rgba(22,163,74,.1);color:#15803d;border:1px solid rgba(22,163,74,.25);padding:10px 14px;border-radius:9px;font-weight:600;margin-top:11px'
        : 'display:block;background:rgba(239,68,68,.1);color:#dc2626;border:1px solid rgba(239,68,68,.22);padding:10px 14px;border-radius:9px;font-weight:600;margin-top:11px';
      fEl.textContent = ok ? '✓ Correct! Well done.'
        : `✗ Not quite. Answer: ${(q.opts||[])[q.ans]||''}`;
      if (!ok) {
        const all = document.querySelectorAll('#quiz-opts .opt');
        if (all[q.ans]) all[q.ans].style.borderColor = '#16a34a';
      }
    }
    setTimeout(() => {
      if (_quiz.idx < _quiz.questions.length - 1) {
        _quiz.idx++;
        renderQuiz();
      } else {
        const pct = Math.round((_quiz.correct / _quiz.questions.length) * 100);
        if (fEl) {
          fEl.style.cssText = 'display:block;background:rgba(37,99,235,.08);color:#1d4ed8;border:1px solid rgba(37,99,235,.2);padding:10px 14px;border-radius:9px;font-weight:600;margin-top:11px';
          fEl.innerHTML = `🎉 Quiz done! Score: <strong>${pct}%</strong>.`;
        }
        const oEl = document.getElementById('quiz-opts');
        if (oEl) oEl.innerHTML = '';
      }
    }, 1500);
  }

  /* ── Navigation ──────────────────────────────────────────────── */
  function nextLesson() {
    const topics = CURRICULUM[currentSubject]?.topics || [];
    const idx = topics.findIndex(t => t.id === currentTopicId);
    for (let i = idx + 1; i < topics.length; i++) {
      if (topicUnlocked(topics[i])) { selectTopic(topics[i].id); return; }
    }
    showToast('You\'re on the last lesson.');
  }

  function prevLesson() {
    const topics = CURRICULUM[currentSubject]?.topics || [];
    const idx = topics.findIndex(t => t.id === currentTopicId);
    for (let i = idx - 1; i >= 0; i--) {
      if (topicUnlocked(topics[i])) { selectTopic(topics[i].id); return; }
    }
    showToast('You\'re on the first lesson.');
  }

  function playVideo(topicId) {
    selectTopic(topicId || currentTopicId, currentTier);
  }

  /* ── Sidebar ─────────────────────────────────────────────────── */
  function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sb-ov');
    const open = sb?.classList.toggle('open');
    ov?.classList.toggle('open', !!open);
  }
  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sb-ov')?.classList.remove('open');
  }

  /* ── stopFloat — dock mini-player ────────────────────────────── */
  function stopFloat() {
    document.getElementById('vp')?.classList.remove('floating');
    document.getElementById('vp-hint')?.classList.remove('show');
  }

  /* ── loadTopic — public alias (monkey-patched by skill_chamber) */
  function loadTopic(topicId, opts) {
    selectTopic(topicId, (opts || {}).tier);
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return {
    init,
    mergeSheetIntoCurriculum,
    switchSubject,
    selectTopic,
    selectTier,
    loadTopic,
    nextLesson,
    prevLesson,
    playVideo,
    toggleSidebar,
    closeSidebar,
    stopFloat,
    _qa,
    CURRICULUM,
  };

})();
