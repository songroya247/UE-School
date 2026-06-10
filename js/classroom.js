/* ═══════════════════════════════════════════════════════════════════
   UE School — js/classroom.js  (v4 rewrite)
   ───────────────────────────────────────────────────────────────────

   KEY IMPROVEMENT IN THIS VERSION
   ────────────────────────────────
   Video container sizing is now source-aware:

     YouTube → #video-box gets class "mode-youtube"
               The container uses aspect-ratio:16/9. YouTube embeds
               fill this perfectly with no chrome outside the video.

     GDrive  → #video-box gets class "mode-drive"
               Google Drive's /preview player includes a bottom toolbar
               (~44px). If the container is exactly 16:9 the toolbar is
               clipped. We switch to height:0 + padding-bottom:calc(
               56.25% + 44px) which gives 16:9 content height plus 44px
               extra, so the full GDrive player is always visible.

     None    → #video-box gets class "mode-placeholder"
               Standard 16:9 container showing the animated play button.

   PUBLIC API (must remain stable — skill_chamber.js monkey-patches
   CLASSROOM.loadTopic)
   ─────────────────────
   CLASSROOM.init(authData)
   CLASSROOM.mergeSheetIntoCurriculum()
   CLASSROOM.switchSubject(key, tabEl)
   CLASSROOM.selectTopic(topicId, tier)
   CLASSROOM.selectTier(tier)
   CLASSROOM.loadTopic(topicId, opts)
   CLASSROOM.nextLesson()
   CLASSROOM.prevLesson()
   CLASSROOM.playVideo(topicId)
   CLASSROOM.toggleSidebar()
   CLASSROOM.closeSidebar()
   CLASSROOM.stopFloat()
   CLASSROOM.CURRICULUM

   PIPELINE (classroom.html loads scripts in this order):
     1. supabase.min.js
     2. auth.js          → window.sb
     3. auth-guard.js    → AUTH_GUARD
     4. storage.js / skill_questions.js / curriculum.js / intervention_modal.js
     5. gdrive-video.js  → GDRIVE_VIDEO
     6. gsheet-curriculum.js → GSHEET_CURRICULUM
     7. classroom.js     ← THIS FILE
     8. skill_chamber.js → monkey-patches CLASSROOM.loadTopic
═══════════════════════════════════════════════════════════════════ */

window.CLASSROOM = (function () {
  'use strict';

  /* ── Curriculum shells ──────────────────────────────────────────
     Topic arrays are populated entirely at runtime by
     mergeSheetIntoCurriculum() from window.TOPIC_BLUEPRINT.
  ───────────────────────────────────────────────────────────────── */
  const CURRICULUM = {
    mathematics: { label: 'Mathematics',      icon: '📐', color: '#3b82f6', topics: [] },
    english:     { label: 'English Language', icon: '📖', color: '#10b981', topics: [] },
    physics:     { label: 'Physics',          icon: '⚛',  color: '#7c3aed', topics: [] },
    chemistry:   { label: 'Chemistry',        icon: '🧪', color: '#ff6b35', topics: [] },
    biology:     { label: 'Biology',          icon: '🌿', color: '#0891b2', topics: [] },
    economics:   { label: 'Economics',        icon: '📈', color: '#f59e0b', topics: [] },
    government:  { label: 'Government',       icon: '🏛', color: '#6366f1', topics: [] },
  };

  /* ── Free-tier video tracking ──────────────────────────────────
     Key must NOT be renamed — it is stable across sessions.
  ───────────────────────────────────────────────────────────────── */
  const FREE_VIDEOS_KEY = 'ue_free_videos_watched';

  function getWatchedIds() {
    try { return JSON.parse(localStorage.getItem(FREE_VIDEOS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function rememberWatched(topicId) {
    const ids = getWatchedIds();
    if (!ids.includes(topicId)) {
      ids.push(topicId);
      try { localStorage.setItem(FREE_VIDEOS_KEY, JSON.stringify(ids)); } catch (_) {}
    }
  }

  /* ── Module state ───────────────────────────────────────────── */
  let currentSubject   = 'mathematics';
  let currentTopicId   = null;
  let currentTier      = 'standard';
  let quizState        = { idx: 0, correct: 0, questions: [] };
  let isPremiumUser    = false;
  let userId           = null;
  let skeletonTimer    = null;
  let studentName      = '';

  /* ── topicUnlockedForUser ───────────────────────────────────── */
  function topicUnlockedForUser(topic) {
    if (isPremiumUser) return true;
    if (getWatchedIds().includes(topic.id)) return true;
    return AUTH_GUARD.canSampleFeature('video');
  }

  /* ── mergeSheetIntoCurriculum ───────────────────────────────── */
  function mergeSheetIntoCurriculum() {
    const blueprint = window.TOPIC_BLUEPRINT || {};
    let merged = 0;
    const norm = id => (id || '').toLowerCase().replace(/[\s_]+/g, '');

    for (const topic of Object.values(blueprint)) {
      if (topic._source !== 'gsheet') continue;
      const subj = topic.subject;
      if (!subj) continue;

      if (!CURRICULUM[subj]) {
        CURRICULUM[subj] = {
          label:  subj.charAt(0).toUpperCase() + subj.slice(1),
          icon:   '📖', color: '#6366f1', topics: []
        };
      }

      const classroomTopic = {
        id:       topic.id,
        title:    topic.title,
        duration: topic.duration || '14 mins',
        premium:  false,
        videos:   topic.videos || null,
        content: {
          intro:    topic.blurb || `${topic.title} — lesson from Google Sheets.`,
          points:   topic.objectives || [],
          formulas: (topic.formulas || []).map(f => ({ label: '', formula: f })),
        },
        quiz: [],
      };

      const normId = norm(topic.id);
      let idx = CURRICULUM[subj].topics.findIndex(t => t.id === topic.id);
      if (idx < 0) {
        idx = CURRICULUM[subj].topics.findIndex(t => norm(t.id) === normId);
        if (idx >= 0) classroomTopic.id = CURRICULUM[subj].topics[idx].id;
      }

      if (idx >= 0) CURRICULUM[subj].topics[idx] = classroomTopic;
      else          CURRICULUM[subj].topics.push(classroomTopic);
      merged++;
    }

    if (merged > 0) console.info(`[CLASSROOM] Merged ${merged} sheet topics.`);
  }

  /* ── init ───────────────────────────────────────────────────── */
  async function init(authData) {
    if (!authData) return;
    const { profile, session } = authData;
    userId        = session?.user?.id;
    isPremiumUser = AUTH_GUARD.isPremium(profile);
    studentName   = profile?.full_name || '';

    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.style.display =
      AUTH_GUARD.subscriptionStatus(profile) === 'EXPIRED' ? 'block' : 'none';

    const userSubjects = profile?.exam_subjects?.length
      ? profile.exam_subjects.filter(s => CURRICULUM[s])
      : Object.keys(CURRICULUM);

    renderSubjectTabs(userSubjects);

    const params      = new URLSearchParams(window.location.search);
    const urlSubj     = params.get('subject');
    const urlTopic    = params.get('topic');
    const startSubj   = (urlSubj && CURRICULUM[urlSubj]) ? urlSubj : (userSubjects[0] || 'mathematics');
    currentSubject    = startSubj;

    renderSidebar(startSubj, urlTopic);

    document.querySelectorAll('.tab-btn').forEach(t => {
      t.classList.toggle('active', t.dataset.subject === startSubj);
    });
  }

  /* ── renderSubjectTabs ──────────────────────────────────────── */
  function renderSubjectTabs(subjects) {
    const container = document.getElementById('subject-tabs');
    if (!container) return;
    container.innerHTML = subjects.map(s => {
      const meta = CURRICULUM[s];
      if (!meta) return '';
      return `<button class="tab-btn" data-subject="${s}"
                onclick="CLASSROOM.switchSubject('${s}',this)">${meta.label}</button>`;
    }).join('');
  }

  /* ── switchSubject ──────────────────────────────────────────── */
  function switchSubject(key, tabEl) {
    if (!CURRICULUM[key]) return;
    currentSubject = key;
    currentTopicId = null;
    currentTier    = 'standard';

    clearVideo();

    const titleEl = document.getElementById('lesson-title');
    const chipEl  = document.getElementById('topic-chip');
    const cEl     = document.getElementById('lesson-content');
    const qEl     = document.getElementById('quiz-section');
    const trEl    = document.getElementById('tier-row');
    if (titleEl) titleEl.textContent = 'Select a topic';
    if (chipEl)  chipEl.textContent  = 'Topic';
    if (cEl)     cEl.innerHTML = '<p style="color:var(--muted)">Select a topic from the sidebar to begin.</p>';
    if (qEl)     qEl.style.display = 'none';
    if (trEl)    trEl.style.display = 'none';

    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');

    renderSidebar(key, null);
  }

  /* ── renderSidebar ──────────────────────────────────────────── */
  function renderSidebar(subjKey, autoSelect) {
    const subj = CURRICULUM[subjKey];
    if (!subj) return;

    const subjEl  = document.getElementById('sb-subject');
    const countEl = document.getElementById('sb-count');
    if (subjEl)  subjEl.textContent  = subj.label;
    if (countEl) countEl.textContent = `${subj.topics.length} Lesson${subj.topics.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('topic-list');
    if (!list) return;

    if (subj.topics.length === 0) {
      const cfgd = window.UE_CONFIG?.SUBJECT_SHEET_URLS?.[subjKey];
      const err  = window.GSHEET_CURRICULUM?.getLastError?.();
      const msg  = !cfgd  ? `${subj.label} — no sheet configured`
                 : err    ? `${subj.label} — sheet failed to load`
                 :          `${subj.label} coming soon`;
      const hint = !cfgd  ? `Add a published CSV URL for <strong>${subjKey}</strong> in <code>config.js → SUBJECT_SHEET_URLS</code>.`
                 : err    ? `Verify the sheet is published (File → Publish to web → CSV).`
                 :          `No lessons added yet.`;
      list.innerHTML = `<div style="padding:28px 14px;text-align:center;color:var(--muted);font-size:.82rem;line-height:1.65">
        <div style="font-size:1.8rem;margin-bottom:10px">📋</div>
        <strong style="display:block;margin-bottom:7px;color:var(--text2)">${msg}</strong>
        <span style="font-size:.76rem">${hint}</span>
      </div>`;
      return;
    }

    list.innerHTML = subj.topics.map((topic, i) => {
      const locked = !topicUnlockedForUser(topic);
      const active = topic.id === currentTopicId;
      const icon   = locked ? '🔒' : active ? '▶' : '📖';
      return `<button class="t-item${active ? ' active' : ''}${locked ? ' locked' : ''}"
                data-topic-id="${topic.id}"
                onclick="CLASSROOM.loadTopic('${topic.id}')">
                <span class="t-num">${i + 1}</span>
                <span class="t-title">${topic.title}</span>
                ${locked ? '<span class="t-pro">PRO</span>' : ''}
              </button>`;
    }).join('');

    const firstUnlocked = subj.topics.find(t => topicUnlockedForUser(t));
    let targetId = null;
    if (autoSelect) {
      const match = subj.topics.find(t =>
        t.id.endsWith(autoSelect) || t.title.toLowerCase() === autoSelect.toLowerCase()
      );
      targetId = match ? match.id : (firstUnlocked?.id || null);
    } else {
      targetId = firstUnlocked?.id || null;
    }
    if (targetId) selectTopic(targetId);
  }

  /* ── selectTopic ────────────────────────────────────────────── */
  function selectTopic(topicId, tier) {
    let topic = null;
    for (const subj of Object.values(CURRICULUM)) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    if (!topicUnlockedForUser(topic)) {
      AUTH_GUARD.bouncePremium('You\'ve used your free video sample. Upgrade to UE Premium to unlock every lesson.');
      return;
    }

    const watched = getWatchedIds();
    if (!isPremiumUser && !watched.includes(topic.id)) {
      AUTH_GUARD.recordSampleUse('video');
      rememberWatched(topic.id);
    }

    currentTopicId = topicId;
    currentTier    = tier || 'standard';

    document.querySelectorAll('.t-item').forEach(el => {
      el.classList.toggle('active', el.dataset.topicId === topicId);
    });

    renderLesson(topic, currentTier);

    // Close mobile sidebar
    closeSidebar();

    // Scroll to top
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;

    // Supabase topic_mastery upsert (non-blocking)
    if (userId) {
      window.sb?.from('topic_mastery').upsert({
        user_id:    userId,
        topic_id:   topicId,
        started_at: new Date().toISOString(),
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn('[CLASSROOM] mastery upsert:', error.message); });
    }
  }

  /* ── selectTier (public — called by tier pill buttons) ──────── */
  function selectTier(tier) {
    if (!currentTopicId) return;
    currentTier = tier;

    // Update pill active state
    document.querySelectorAll('.tier-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.tier === tier);
    });

    // Re-inject video for the new tier
    let topic = null;
    for (const subj of Object.values(CURRICULUM)) {
      topic = subj.topics.find(t => t.id === currentTopicId);
      if (topic) break;
    }
    if (!topic) return;

    const url = getVideoUrl(topic, tier);
    const ytId = extractYouTubeId(url);
    if (ytId) {
      injectIframe(`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`, true);
    } else if (url) {
      injectIframe(url, false);
    }

    // Update tier tagline
    const tagline = topic.videos?.[tier]?.tagline || '';
    const tlEl = document.getElementById('tier-tagline');
    if (tlEl) tlEl.textContent = tagline ? `— ${tagline}` : '';

    // Update tier badge in video
    showTierBadge(tier);
  }

  /* ── renderLesson ───────────────────────────────────────────── */
  function renderLesson(topic, tier) {
    tier = tier || 'standard';

    // Meta
    const chipEl  = document.getElementById('topic-chip');
    const durEl   = document.getElementById('dur-chip');
    const titleEl = document.getElementById('lesson-title');
    if (chipEl)  chipEl.textContent  = topic.title;
    if (durEl)   durEl.textContent   = topic.duration || '14 mins';
    if (titleEl) titleEl.textContent = topic.title;

    // Tier row
    const tierRow = document.getElementById('tier-row');
    if (tierRow) {
      // Only show if topic has multiple tiers
      const hasTiers = topic.videos && Object.keys(topic.videos).length > 1;
      tierRow.style.display = hasTiers ? 'flex' : 'none';
      if (hasTiers) {
        document.querySelectorAll('.tier-pill').forEach(p => {
          p.classList.toggle('active', p.dataset.tier === tier);
        });
        const tlEl = document.getElementById('tier-tagline');
        if (tlEl) {
          const tagline = topic.videos?.[tier]?.tagline || '';
          tlEl.textContent = tagline ? `— ${tagline}` : '';
        }
      }
    }

    // Video
    const url  = getVideoUrl(topic, tier);
    const ytId = topic.youtubeId || extractYouTubeId(url);

    if (ytId) {
      showTierBadge(tier);
      injectIframe(`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`, true);
    } else if (url) {
      showTierBadge(tier);
      injectIframe(url, false);
    } else {
      clearVideo();
    }

    // Lesson content
    renderContent(topic);

    // Quiz
    if (topic.quiz && topic.quiz.length > 0) {
      quizState = { idx: 0, correct: 0, questions: topic.quiz };
      renderQuiz();
      const qSec = document.getElementById('quiz-section');
      if (qSec) qSec.style.display = 'block';
    } else {
      const qSec = document.getElementById('quiz-section');
      if (qSec) qSec.style.display = 'none';
    }
  }

  /* ── getVideoUrl — tier-aware resolver ──────────────────────── */
  function getVideoUrl(topic, requestedTier) {
    requestedTier = requestedTier || 'standard';

    // Check topic.videos (sheet data)
    if (topic.videos) {
      const tiers = ['standard', 'foundation', 'mastery'];
      const ordered = [requestedTier, ...tiers.filter(t => t !== requestedTier)];
      for (const t of ordered) {
        const v = topic.videos[t];
        if (v?.url) return v.url;
      }
    }

    // Legacy: driveId or driveUrl
    if (topic.driveId) return `https://drive.google.com/file/d/${topic.driveId}/preview`;
    if (topic.driveUrl && window.GDRIVE_VIDEO) return GDRIVE_VIDEO.embedUrl(topic.driveUrl);

    return '';
  }

  /* ── extractYouTubeId ────────────────────────────────────────── */
  function extractYouTubeId(url) {
    if (!url) return '';
    // youtu.be short link
    const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (short) return short[1];
    // youtube.com/watch?v=
    const watch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watch) return watch[1];
    // youtube.com/embed/
    const embed = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
    return '';
  }

  /* ── injectIframe ─────────────────────────────────────────────
     THE CORE FIX: container class switches between .mode-youtube
     and .mode-drive so each source type gets the right sizing.

     .mode-youtube → aspect-ratio:16/9 (CSS)
       YouTube iframes have no extra chrome; 16:9 is perfect.

     .mode-drive   → height:0 + padding-bottom:calc(56.25% + 44px) (CSS)
       GDrive /preview embeds include a ~44px bottom toolbar.
       Pure 16:9 clips it off. The extra 44px ensures the full
       player (including its controls bar) is always visible.
  ─────────────────────────────────────────────────────────────── */
  function injectIframe(src, isYouTube) {
    if (skeletonTimer) { clearTimeout(skeletonTimer); skeletonTimer = null; }

    const vb = document.getElementById('video-box');
    if (!vb) return;

    // ★ Switch container mode based on source type
    vb.className = isYouTube ? 'mode-youtube' : 'mode-drive';
    // (If vb was floating, floating class needs to be re-added)
    // floating is handled by IntersectionObserver; it re-adds itself if needed

    showSkeleton();
    hidePlaceholder();

    // Remove old iframe and overlays
    vb.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
    vb.querySelectorAll('#v-blocker, #v-watermark').forEach(el => el.remove());

    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'autoplay; fullscreen';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;z-index:3';
    iframe.addEventListener('load', hideSkeleton);
    skeletonTimer = setTimeout(() => { hideSkeleton(); skeletonTimer = null; }, 8000);
    vb.appendChild(iframe);

    // GDrive: overlay a transparent div in top-right to block the
    // external-link arrow icon Drive renders there
    if (!isYouTube) {
      const blocker = document.createElement('div');
      blocker.id = 'v-blocker';
      blocker.style.cssText = 'position:absolute;top:0;right:0;width:80px;height:56px;z-index:10;pointer-events:all;cursor:default;background:transparent';
      vb.appendChild(blocker);
    }

    // Student watermark
    if (studentName) {
      const wm = document.createElement('div');
      wm.id = 'v-watermark';
      wm.style.cssText = 'position:absolute;inset:0;z-index:9;pointer-events:none;overflow:hidden';
      const esc = studentName.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      wm.innerHTML = `<div style="position:absolute;bottom:10px;right:12px;
        display:flex;align-items:center;gap:5px;
        background:rgba(0,0,0,.45);backdrop-filter:blur(6px);
        -webkit-backdrop-filter:blur(6px);
        border:1px solid rgba(255,255,255,.1);border-radius:5px;
        padding:3px 9px 3px 7px;pointer-events:none;user-select:none">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="rgba(255,255,255,0.4)" stroke-width="0.9"/>
          <path d="M3.2 3.2h2.6L3.2 5.8h2.6" stroke="rgba(255,255,255,0.4)" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="color:rgba(255,255,255,.48);font-size:.56rem;font-weight:600;letter-spacing:.07em;white-space:nowrap;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif">${esc}</span>
      </div>`;
      vb.appendChild(wm);
    }
  }

  /* ── Skeleton helpers ────────────────────────────────────────── */
  function showSkeleton() {
    const sk = document.getElementById('v-skel');
    if (sk) sk.style.display = 'flex';
  }
  function hideSkeleton() {
    const sk = document.getElementById('v-skel');
    if (sk) sk.style.display = 'none';
  }
  function hidePlaceholder() {
    const ph = document.getElementById('v-empty');
    if (ph) ph.style.display = 'none';
  }
  function showPlaceholder() {
    const ph = document.getElementById('v-empty');
    if (ph) ph.style.display = '';
  }

  /* ── Tier badge in video ─────────────────────────────────────── */
  function showTierBadge(tier) {
    const badge = document.getElementById('vbadge');
    if (!badge) return;
    const labels = { foundation: 'Foundation', standard: 'Standard', mastery: 'Mastery' };
    badge.textContent = labels[tier] || '';
    badge.className = `vbadge ${tier}`;
    badge.style.display = 'block';
  }

  /* ── clearVideo — resets to placeholder state ────────────────── */
  function clearVideo() {
    if (skeletonTimer) { clearTimeout(skeletonTimer); skeletonTimer = null; }
    const vb = document.getElementById('video-box');
    if (!vb) return;
    vb.querySelectorAll('iframe').forEach(f => { f.src = ''; f.remove(); });
    vb.querySelectorAll('#v-blocker, #v-watermark').forEach(el => el.remove());
    // Remove floating if present
    vb.classList.remove('floating');
    // Set to placeholder mode
    vb.className = 'mode-placeholder';
    hideSkeleton();
    showPlaceholder();
    const badge = document.getElementById('vbadge');
    if (badge) badge.style.display = 'none';
    const hint = document.getElementById('video-floating-hint');
    if (hint) hint.classList.remove('show');
  }

  /* ── renderContent ────────────────────────────────────────────── */
  function renderContent(topic) {
    const el = document.getElementById('lesson-content');
    if (!el) return;

    const c = topic.content || {};
    let html = '';

    if (c.intro) {
      html += `<p>${escHtml(c.intro)}</p>`;
    }

    if (c.points && c.points.length > 0) {
      html += '<h3>Key Points</h3><ul>';
      html += c.points.map(p => `<li><span class="bullet">&#x25CF;</span>${escHtml(p)}</li>`).join('');
      html += '</ul>';
    }

    if (c.formulas && c.formulas.length > 0) {
      html += '<div class="formula-box"><div class="formula-lbl">Key Formulas</div><div class="formula-grid">';
      html += c.formulas.map(f => {
        const txt = typeof f === 'string' ? f : (f.formula || '');
        return `<div class="formula-item">${escHtml(txt)}</div>`;
      }).join('');
      html += '</div></div>';
    }

    if (!html) {
      html = '<p style="color:var(--muted)">Lesson content will appear here once it has been added to your curriculum sheet.</p>';
    }

    el.innerHTML = html;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Quiz ────────────────────────────────────────────────────── */
  function renderQuiz() {
    const q   = quizState.questions[quizState.idx];
    const num = document.getElementById('q-num');
    const tot = document.getElementById('q-total');
    const dotsEl = document.getElementById('quiz-dots');
    const qEl    = document.getElementById('quiz-question');
    const optsEl = document.getElementById('quiz-options');
    const fb     = document.getElementById('quiz-feedback');

    if (num) num.textContent = quizState.idx + 1;
    if (tot) tot.textContent = quizState.questions.length;

    if (dotsEl) {
      dotsEl.innerHTML = quizState.questions.map((_, i) => {
        const cls = i < quizState.idx ? 'qdot done' : i === quizState.idx ? 'qdot active' : 'qdot';
        return `<span class="${cls}"></span>`;
      }).join('');
    }

    if (qEl) qEl.textContent = q.q || '';
    if (fb)  fb.style.display = 'none';

    if (optsEl) {
      const letters = ['A','B','C','D'];
      optsEl.innerHTML = (q.opts || []).map((opt, i) => `
        <button class="opt" onclick="CLASSROOM._checkAnswer(${i},this)">
          <span class="opt-ltr">${letters[i]}</span>${escHtml(opt)}
        </button>`).join('');
    }
  }

  function _checkAnswer(idx, btn) {
    const q  = quizState.questions[quizState.idx];
    const fb = document.getElementById('quiz-feedback');
    document.querySelectorAll('#quiz-options .opt').forEach(b => b.style.pointerEvents = 'none');
    btn.classList.add('selected');

    const correct = idx === q.ans;
    if (correct) quizState.correct++;

    if (fb) {
      fb.style.display = 'block';
      if (correct) {
        fb.style.cssText = 'display:block;background:rgba(22,163,74,.1);color:#15803d;border:1px solid rgba(22,163,74,.25);padding:11px 14px;border-radius:9px;font-weight:600;margin-top:12px';
        fb.textContent = '✓ Correct! Well done.';
      } else {
        fb.style.cssText = 'display:block;background:rgba(239,68,68,.1);color:#dc2626;border:1px solid rgba(239,68,68,.22);padding:11px 14px;border-radius:9px;font-weight:600;margin-top:12px';
        fb.textContent = `✗ Not quite. Correct answer: ${(q.opts || [])[q.ans] || ''}`;
        const all = document.querySelectorAll('#quiz-options .opt');
        if (all[q.ans]) all[q.ans].style.borderColor = '#16a34a';
      }
    }

    setTimeout(() => {
      if (quizState.idx < quizState.questions.length - 1) {
        quizState.idx++;
        renderQuiz();
      } else {
        const pct = Math.round((quizState.correct / quizState.questions.length) * 100);
        const href = document.getElementById('practice-btn')?.href || 'cbt.html';
        if (fb) {
          fb.style.cssText = 'display:block;background:rgba(37,99,235,.08);color:#1d4ed8;border:1px solid rgba(37,99,235,.2);padding:11px 14px;border-radius:9px;font-weight:600;margin-top:12px';
          fb.innerHTML = `🎉 Quiz complete! Score: <strong>${pct}%</strong>. <a href="${href}" style="color:var(--accent);text-decoration:underline">Full practice →</a>`;
        }
        const optsEl = document.getElementById('quiz-options');
        if (optsEl) optsEl.innerHTML = '';
      }
    }, 1500);
  }

  /* ── Navigation ──────────────────────────────────────────────── */
  function nextLesson() {
    const topics = CURRICULUM[currentSubject]?.topics || [];
    const idx = topics.findIndex(t => t.id === currentTopicId);
    for (let i = idx + 1; i < topics.length; i++) {
      if (topicUnlockedForUser(topics[i])) { selectTopic(topics[i].id); return; }
    }
    toast('You\'ve reached the last lesson in this subject.');
  }

  function prevLesson() {
    const topics = CURRICULUM[currentSubject]?.topics || [];
    const idx = topics.findIndex(t => t.id === currentTopicId);
    for (let i = idx - 1; i >= 0; i--) {
      if (topicUnlockedForUser(topics[i])) { selectTopic(topics[i].id); return; }
    }
    toast('You\'re on the first lesson.');
  }

  /* ── playVideo — called by placeholder play button ───────────── */
  function playVideo(topicId) {
    const id = topicId || currentTopicId;
    if (id) selectTopic(id, currentTier);
  }

  /* ── Sidebar open/close ──────────────────────────────────────── */
  function toggleSidebar() {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sb-overlay');
    const open = sb?.classList.toggle('drawer-open');
    ov?.classList.toggle('open', !!open);
  }
  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('drawer-open');
    document.getElementById('sb-overlay')?.classList.remove('open');
  }

  /* ── stopFloat — dock mini-player back to normal ─────────────── */
  function stopFloat() {
    const vb   = document.getElementById('video-box');
    const hint = document.getElementById('video-floating-hint');
    if (vb) vb.classList.remove('floating');
    if (hint) hint.classList.remove('show');
  }

  /* ── loadTopic — public alias (monkey-patched by skill_chamber) ── */
  function loadTopic(topicId, opts) {
    opts = opts || {};
    selectTopic(topicId, opts.tier);
  }

  /* ── toast helper ────────────────────────────────────────────── */
  function toast(msg, dur) {
    if (typeof window.toast === 'function') { window.toast(msg, dur); return; }
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), dur || 2800);
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
    _checkAnswer,
    CURRICULUM,
  };

})();
