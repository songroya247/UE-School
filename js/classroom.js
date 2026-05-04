/* ═══════════════════════════════════════════════════
   UE School — Classroom Engine  (patched v2)
   Fixes applied:
     1. init() accepts authData to avoid double AUTH_GUARD call
     2. Subject/topic persisted in localStorage — survives refresh
     3. iframe injected only on play click (Drive URL never in DOM early)
     4. playVideo() fully gated — re-checks premium at play-time
     5. skill_chamber loadTopic properly wired to renderLesson with tier
     6. Tier switcher pills read from topic.videos after sheet load
     7. renderLesson correctly reads tier from opts passed by skill_chamber
═══════════════════════════════════════════════════ */

const CLASSROOM = (function () {

  // ─── Subject meta ─────────────────────────────────
  const SUBJECT_META = {
    mathematics: { label: 'Mathematics',     icon: '&#x1F4D0;', color: '#3b82f6' },
    english:     { label: 'English Language', icon: '&#x1F4D6;', color: '#10b981' },
    physics:     { label: 'Physics',          icon: '&#x269B;',  color: '#7c3aed' },
    chemistry:   { label: 'Chemistry',        icon: '&#x1F9EA;', color: '#ff6b35' },
    biology:     { label: 'Biology',          icon: '&#x1F33F;', color: '#0891b2' },
    literature:  { label: 'Literature',       icon: '&#x1F4DA;', color: '#7c3aed' },
    economics:   { label: 'Economics',        icon: '&#x1F4C8;', color: '#f59e0b' },
    government:  { label: 'Government',       icon: '&#x1F3DB;', color: '#6366f1' },
  };

  // ─── Curriculum builder ───────────────────────────
  function buildCurriculumFromBlueprint() {
    const bp = window.TOPIC_BLUEPRINT || {};
    const result = {};
    for (const topic of Object.values(bp)) {
      const subj = (topic.subject || '').toLowerCase();
      if (!subj) continue;
      if (!result[subj]) {
        const meta = SUBJECT_META[subj] || { label: subj, icon: '&#x1F4DA;', color: '#6b7280' };
        result[subj] = { label: meta.label, icon: meta.icon, color: meta.color, topics: [] };
      }
      result[subj].topics.push(topic);
    }
    return result;
  }

  let CURRICULUM = null;
  function getCurriculum() {
    if (CURRICULUM) return CURRICULUM;
    const dynamic = buildCurriculumFromBlueprint();
    CURRICULUM = Object.keys(dynamic).length ? dynamic : LEGACY_CURRICULUM;
    return CURRICULUM;
  }

  // ─── localStorage keys ────────────────────────────
  const FREE_VIDEOS_KEY  = 'ue_free_videos_watched';
  const LAST_SUBJECT_KEY = 'ue_last_subject';
  const LAST_TOPIC_KEY   = 'ue_last_topic';

  // ─── Free-tier helpers ────────────────────────────
  function getWatchedVideoIds() {
    try { return JSON.parse(localStorage.getItem(FREE_VIDEOS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function rememberWatchedVideo(topicId) {
    const ids = getWatchedVideoIds();
    if (!ids.includes(topicId)) {
      ids.push(topicId);
      try { localStorage.setItem(FREE_VIDEOS_KEY, JSON.stringify(ids)); } catch (_) {}
    }
  }

  function topicUnlockedForUser(topic) {
    if (isPremiumUser) return true;
    const watched = getWatchedVideoIds();
    if (watched.includes(topic.id)) return true;
    return AUTH_GUARD.canSampleFeature('video');
  }

  // ─── State ────────────────────────────────────────
  let currentSubject = 'mathematics';
  let currentTopicId = null;
  let quizState      = { idx: 0, questions: [] };
  let isPremiumUser  = false;
  let userId         = null;

  // ─── Init ─────────────────────────────────────────
  // Accepts optional pre-resolved authData from classroom.html to avoid
  // a redundant second Supabase round-trip.
  async function init(authData) {
    const result = authData || await AUTH_GUARD.init();
    if (!result) return;

    const { profile, session } = result;
    userId       = session?.user?.id;
    isPremiumUser = AUTH_GUARD.isPremium(profile);

    // Defaulter banner
    const banner = document.getElementById('defaulter-banner');
    if (banner) {
      const status = AUTH_GUARD.subscriptionStatus(profile);
      banner.style.display = status === 'EXPIRED' ? 'block' : 'none';
    }

    // Rebuild curriculum from now-populated TOPIC_BLUEPRINT
    CURRICULUM = null;
    const userSubjects = profile?.exam_subjects?.length
      ? profile.exam_subjects.filter(s => getCurriculum()[s])
      : Object.keys(getCurriculum());

    renderSubjectTabs(userSubjects);

    // ── Subject resolution — FIX for refresh restoring wrong subject ──
    // Priority: URL param → localStorage → userSubjects[0] → 'mathematics'
    const params      = new URLSearchParams(window.location.search);
    const urlSubj     = params.get('subject');
    const urlTopic    = params.get('topic');
    const savedSubj   = localStorage.getItem(LAST_SUBJECT_KEY);
    const savedTopic  = localStorage.getItem(LAST_TOPIC_KEY);

    let startSubject;
    if (urlSubj && getCurriculum()[urlSubj]) {
      startSubject = urlSubj;
    } else if (savedSubj && getCurriculum()[savedSubj] && userSubjects.includes(savedSubj)) {
      startSubject = savedSubj;
    } else {
      startSubject = userSubjects[0] || 'mathematics';
    }

    currentSubject = startSubject;

    // Activate correct tab
    document.querySelectorAll('.subject-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.subject === startSubject);
    });

    // Topic to auto-select: URL param → saved topic (only if same subject) → first unlocked
    const autoTopic = urlTopic || (!urlSubj && savedTopic) || null;
    renderSidebar(startSubject, autoTopic);
  }

  // ─── Render subject tabs ──────────────────────────
  function renderSubjectTabs(subjects) {
    const container = document.getElementById('subject-tabs');
    if (!container) return;
    container.innerHTML = subjects.map(s => {
      const meta = getCurriculum()[s];
      if (!meta) return '';
      return `<button class="subject-tab" data-subject="${s}"
                onclick="CLASSROOM.switchSubject('${s}', this)">
                ${meta.label}
              </button>`;
    }).join('');
  }

  // ─── Switch subject ───────────────────────────────
  function switchSubject(subjKey, tabEl) {
    if (!getCurriculum()[subjKey]) return;
    currentSubject = subjKey;

    // Persist — this is what the refresh fix reads
    try { localStorage.setItem(LAST_SUBJECT_KEY, subjKey); } catch (_) {}
    // Clear saved topic so we don't restore a topic from the wrong subject
    try { localStorage.removeItem(LAST_TOPIC_KEY); } catch (_) {}

    document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');

    renderSidebar(subjKey, null);
  }

  // ─── Render sidebar topic list ────────────────────
  function renderSidebar(subjKey, autoSelectTopic) {
    const subj = getCurriculum()[subjKey];
    if (!subj) return;

    const headEl  = document.getElementById('sidebar-subject-name');
    const countEl = document.getElementById('sidebar-lesson-count');
    if (headEl)  headEl.textContent  = subj.label;
    if (countEl) countEl.textContent = `${subj.topics.length} Lesson${subj.topics.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('topic-list');
    if (!list) return;

    list.innerHTML = subj.topics.map((topic, idx) => {
      const isLocked = !topicUnlockedForUser(topic);
      const isActive = topic.id === currentTopicId;
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

    // Auto-select topic
    const firstUnlocked = subj.topics.find(t => topicUnlockedForUser(t));
    let targetId = null;

    if (autoSelectTopic) {
      const match = subj.topics.find(t =>
        t.id === autoSelectTopic ||
        t.id.endsWith(autoSelectTopic) ||
        t.title.toLowerCase() === autoSelectTopic.toLowerCase()
      );
      targetId = match ? match.id : (firstUnlocked ? firstUnlocked.id : null);
    } else {
      targetId = firstUnlocked ? firstUnlocked.id : null;
    }

    if (targetId) selectTopic(targetId);
  }

  // ─── Select topic ─────────────────────────────────
  function selectTopic(topicId) {
    let topic = null;
    for (const subj of Object.values(getCurriculum())) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    if (!topicUnlockedForUser(topic)) {
      AUTH_GUARD.bouncePremium(
        'You\'ve used your free video sample. Upgrade to UE Premium to unlock every lesson.'
      );
      return;
    }

    // Spend free-sample credit on first open
    const watched = getWatchedVideoIds();
    if (!isPremiumUser && !watched.includes(topic.id)) {
      AUTH_GUARD.recordSampleUse('video');
      rememberWatchedVideo(topic.id);
    }

    currentTopicId = topicId;

    // Persist — survives refresh
    try { localStorage.setItem(LAST_SUBJECT_KEY, topic.subject || currentSubject); } catch (_) {}
    try { localStorage.setItem(LAST_TOPIC_KEY,   topicId); } catch (_) {}

    // Update sidebar
    document.querySelectorAll('.topic-item').forEach(el => {
      el.classList.toggle('active', el.dataset.topicId === topicId);
    });

    renderLesson(topic);
    if (window.innerWidth <= 720) closeSidebar();
  }

  // ─── Resolve video URL from a topic + tier ────────
  function resolveVideoUrl(topic, tier) {
    tier = tier || 'standard';
    if (topic.videos) {
      // Sheet topic — try requested tier, then fallback chain
      const preferred = [tier, 'standard', 'foundation', 'mastery'];
      for (const t of preferred) {
        const v = topic.videos[t];
        if (v && v.url) return { url: v.url, tier: t, duration: v.duration || '' };
      }
    }
    // Legacy topic fields
    if (topic.youtubeId)
      return { url: `https://www.youtube.com/embed/${topic.youtubeId}?rel=0&modestbranding=1`, tier, duration: topic.duration || '' };
    if (topic.driveId)
      return { url: `https://drive.google.com/file/d/${topic.driveId}/preview`, tier, duration: topic.duration || '' };
    if (topic.driveUrl && window.GDRIVE_VIDEO)
      return { url: window.GDRIVE_VIDEO.embedUrl(topic.driveUrl), tier, duration: topic.duration || '' };
    return null;
  }

  // ─── Render lesson ────────────────────────────────
  // opts.tier — if provided by skill_chamber, loads that video tier
  function renderLesson(topic, opts) {
    opts = opts || {};

    setEl('topic-tag',            topic.id.split('.')[1] || topic.title);
    setEl('topic-title',          topic.title);
    setEl('lesson-duration-badge', (topic.duration || '') + ' mins');

    // ── Video area — show play-button placeholder ──
    // The iframe src is NEVER written to the DOM until the user clicks play.
    // This prevents the Drive URL from being visible in DevTools for free users.
    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      const resolved  = resolveVideoUrl(topic, opts.tier || 'standard');
      const hasVideo  = !!resolved;
      const tierLabel = resolved ? (resolved.tier.charAt(0).toUpperCase() + resolved.tier.slice(1)) : '';
      const durationLabel = resolved ? (resolved.duration || topic.duration || '') : (topic.duration || '');

      // Build tier-switcher pills if topic has multiple tiers
      let tierSwitcher = '';
      if (topic.videos) {
        const availableTiers = ['foundation', 'standard', 'mastery'].filter(t => topic.videos[t] && topic.videos[t].url);
        if (availableTiers.length > 1) {
          const activeTier = (opts.tier && availableTiers.includes(opts.tier)) ? opts.tier : (resolved ? resolved.tier : 'standard');
          tierSwitcher = `<div style="position:absolute;top:12px;left:12px;z-index:4;display:flex;gap:6px">
            ${availableTiers.map(t => `
              <button onclick="CLASSROOM.switchTier('${topic.id}','${t}')"
                style="font-size:.68rem;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.5);cursor:pointer;letter-spacing:.04em;transition:all .2s;
                background:${t===activeTier ? 'rgba(37,99,235,.85)' : 'rgba(255,255,255,.2)'};
                color:${t===activeTier ? '#fff' : 'rgba(255,255,255,.8)'};
                backdrop-filter:blur(6px)">
                ${t.charAt(0).toUpperCase()+t.slice(1)}
              </button>`).join('')}
          </div>`;
        }
      }

      videoArea.innerHTML = `
        <div class="video-bg"></div>
        <div class="video-grid"></div>
        ${tierSwitcher}
        ${hasVideo
          ? `<div class="video-play-btn" onclick="CLASSROOM.playVideo('${topic.id}','${opts.tier||'standard'}')">&#x25B6;</div>`
          : `<div class="video-play-btn" style="opacity:.4;cursor:default">&#x25B6;</div>
             <div style="position:absolute;bottom:50px;left:50%;transform:translateX(-50%);font-size:.8rem;color:rgba(15,28,63,.55);white-space:nowrap">Video coming soon</div>`
        }
        <div class="video-duration" id="video-duration-badge">${durationLabel}</div>`;
    }

    // ── Lesson content ────────────────────────────────
    const contentEl = document.getElementById('lesson-content');
    if (contentEl) {
      let intro = '', points = [], formulas = [];
      if (topic.content) {
        intro    = topic.content.intro    || '';
        points   = topic.content.points   || [];
        formulas = topic.content.formulas || [];
      } else {
        intro  = topic.blurb || '';
        points = topic.objectives || [];
        formulas = (topic.formulas || []).map(f => {
          const colonIdx = f.indexOf(':');
          if (colonIdx > 0 && colonIdx < 30)
            return { label: f.slice(0, colonIdx).trim(), formula: f.slice(colonIdx + 1).trim() };
          return { label: '', formula: f };
        });
      }

      const pointsHTML = points.length ? `
        <h3>Key Points</h3>
        <ul>${points.map(p => `<li><span class="bullet">•</span>${p}</li>`).join('')}</ul>
      ` : '';

      const formulaHTML = formulas.length ? `
        <div class="formula-box">
          <div class="formula-box-label">Formula Box</div>
          <div class="formula-grid">
            ${formulas.map(f => `<div class="formula-item">${f.label ? `<strong style="font-size:.72rem;color:var(--muted);display:block;margin-bottom:4px">${f.label}</strong>` : ''}${f.formula}</div>`).join('')}
          </div>
        </div>
      ` : '';

      contentEl.innerHTML = intro
        ? `<p>${intro}</p>${pointsHTML}${formulaHTML}`
        : `${pointsHTML}${formulaHTML}`;
    }

    // ── Quiz ──────────────────────────────────────────
    quizState = { idx: 0, questions: topic.quiz || [], answered: 0, correct: 0 };
    renderQuiz();

    // ── Practice button ───────────────────────────────
    const practiceBtn = document.getElementById('practice-btn');
    if (practiceBtn) {
      const parts = topicIdParts(topic);
      practiceBtn.href = `cbt.html?subject=${parts.subj}&topic=${encodeURIComponent(parts.topic)}`;
    }

    // ── Record study in Supabase (fire-and-forget) ────
    if (userId) {
      window.sb.from('topic_mastery').upsert({
        user_id:      userId,
        topic_id:     topic.id,
        last_studied: new Date().toISOString(),
        status:       'IN_PROGRESS'
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: false }).then(() => {});
    }
  }

  function topicIdParts(topic) {
    const parts = topic.id.split('.');
    return { subj: parts[0], topic: parts.slice(1).join('.') };
  }

  // ─── Tier switcher (pill buttons in video area) ───
  function switchTier(topicId, tier) {
    let topic = null;
    for (const subj of Object.values(getCurriculum())) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;
    // Save chosen tier to STORAGE so skill_chamber remembers it
    if (window.STORAGE) window.STORAGE.setChosenTier(topicId, tier);
    renderLesson(topic, { tier, skipDiagnostic: true });
  }

  // ─── Play video (called on play-button click) ─────
  // Re-confirms premium at play-time. The iframe src is ONLY injected here —
  // never earlier — so the Drive URL never appears in the DOM for free users.
  function playVideo(topicId, tier) {
    let topic = null;
    for (const subj of Object.values(getCurriculum())) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    // Gate re-check at play-time
    if (!topicUnlockedForUser(topic)) {
      AUTH_GUARD.bouncePremium('Upgrade to UE Premium to watch this lesson video.');
      return;
    }

    const resolved = resolveVideoUrl(topic, tier || 'standard');
    const videoArea = document.getElementById('video-area');
    if (!videoArea) return;

    if (!resolved || !resolved.url) {
      toast('Video lesson coming soon! Practice with CBT questions in the meantime.');
      return;
    }

    const isYoutube = resolved.url.includes('youtube.com') || resolved.url.includes('youtu.be');
    // Add autoplay only for YouTube (Drive ignores it without user gesture anyway)
    const src = isYoutube && !resolved.url.includes('autoplay')
      ? resolved.url + (resolved.url.includes('?') ? '&' : '?') + 'autoplay=1'
      : resolved.url;

    videoArea.innerHTML = `<iframe
      src="${src}"
      style="width:100%;height:100%;border:none;border-radius:var(--radius-lg)"
      ${isYoutube ? '' : 'allow="autoplay"'}
      allowfullscreen></iframe>`;
  }

  // ─── Locked state ─────────────────────────────────
  function showLockedState(topic) {
    currentTopicId = null;
    setEl('topic-title',          topic.title);
    setEl('topic-tag',            'Premium');
    setEl('lesson-duration-badge', topic.duration + ' mins');

    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      videoArea.innerHTML = `
        <div class="video-bg"></div>
        <div class="video-grid"></div>
        <div class="video-locked">
          <div style="font-size:2.5rem;margin-bottom:14px">&#x1F512;</div>
          <h3 style="font-family:var(--font-head);font-size:1.8rem;margin-bottom:8px">Premium Content</h3>
          <p style="color:rgba(15,28,63,.55);margin-bottom:22px">Upgrade your plan to unlock this lesson.</p>
          <a href="pricing.html" class="btn btn-primary btn-lg">Unlock Premium &#x2192;</a>
        </div>`;
    }

    const contentEl = document.getElementById('lesson-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="text-align:center;padding:40px 20px;background:var(--surface2);border-radius:var(--radius-lg);border:1px solid var(--border2)">
          <div style="font-size:2rem;margin-bottom:12px">&#x1F512;</div>
          <div style="font-weight:700;margin-bottom:8px">This lesson requires a premium subscription</div>
          <div style="font-size:.88rem;color:var(--muted);margin-bottom:20px">From ₦1,500/month — less than a data bundle</div>
          <a href="pricing.html" class="btn btn-primary">View Plans</a>
        </div>`;
    }

    const quizSection = document.getElementById('quiz-section');
    if (quizSection) quizSection.style.display = 'none';
  }

  // ─── Next / Prev navigation ───────────────────────
  function nextLesson() {
    const subj = getCurriculum()[currentSubject];
    if (!subj) return;
    const idx  = subj.topics.findIndex(t => t.id === currentTopicId);
    const next = subj.topics.slice(idx + 1).find(t => topicUnlockedForUser(t));
    if (next) selectTopic(next.id);
    else toast('You\'ve completed all available lessons in this subject! &#x1F389;');
  }

  function prevLesson() {
    const subj = getCurriculum()[currentSubject];
    if (!subj) return;
    const idx  = subj.topics.findIndex(t => t.id === currentTopicId);
    if (idx > 0) selectTopic(subj.topics[idx - 1].id);
  }

  // ─── loadTopic — public alias (monkey-patched by skill_chamber) ──
  // skill_chamber wraps this to run the diagnostic before calling
  // selectTopic. The opts.tier it passes is forwarded to renderLesson.
  function loadTopic(topicId, opts) {
    opts = opts || {};
    // If skill_chamber resolved a tier, pass it through to renderLesson
    // by temporarily hooking selectTopic's call to renderLesson.
    if (opts.tier) {
      let topic = null;
      for (const subj of Object.values(getCurriculum())) {
        topic = subj.topics.find(t => t.id === topicId);
        if (topic) break;
      }
      if (topic) {
        // Run the normal select logic (gates, persistence, sidebar)
        // then override the renderLesson call with the correct tier
        selectTopic(topicId);
        // renderLesson was already called by selectTopic — re-call with tier
        renderLesson(topic, { tier: opts.tier, skipDiagnostic: true });
        return;
      }
    }
    selectTopic(topicId);
  }

  // ─── Quiz ─────────────────────────────────────────
  function renderQuiz() {
    const section = document.getElementById('quiz-section');
    if (!section) return;
    if (!quizState.questions.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    const q = quizState.questions[quizState.idx];
    setEl('quiz-q-num',   String(quizState.idx + 1));
    setEl('quiz-q-total', String(quizState.questions.length));

    const questionEl = document.getElementById('quiz-question');
    if (questionEl) questionEl.innerHTML = q.q;

    const dotsEl = document.getElementById('quiz-dots');
    if (dotsEl) {
      dotsEl.innerHTML = quizState.questions.map((_, i) => {
        const cls = i < quizState.idx ? 'done' : i === quizState.idx ? 'active' : '';
        return `<div class="quiz-dot ${cls}"></div>`;
      }).join('');
    }

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
        fb.textContent = '✓ Correct! Well done.';
      } else {
        fb.style.cssText = 'display:block;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
        fb.textContent = `✗ Not quite. Correct answer: ${q.opts[q.ans]}.`;
        const allBtns = document.querySelectorAll('#quiz-options .drill-option');
        if (allBtns[q.ans]) allBtns[q.ans].style.borderColor = '#22c55e';
      }
    }

    setTimeout(() => {
      if (quizState.idx < quizState.questions.length - 1) {
        quizState.idx++;
        renderQuiz();
      } else {
        const pct = Math.round((quizState.correct / quizState.questions.length) * 100);
        if (fb) {
          fb.style.cssText = 'display:block;background:rgba(79,142,255,.1);color:#3b82f6;border:1px solid rgba(79,142,255,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
          fb.innerHTML = `🎉 Quiz complete! You scored <strong>${pct}%</strong>. <a href="${document.getElementById('practice-btn')?.href || 'cbt.html'}" style="color:var(--accent);text-decoration:underline">Take full practice →</a>`;
        }
        const optsEl = document.getElementById('quiz-options');
        if (optsEl) optsEl.innerHTML = '';
      }
    }, 1500);
  }

  // ─── Sidebar helpers ──────────────────────────────
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

  // ─── Utility ──────────────────────────────────────
  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ─── Legacy curriculum (fallback when sheet unavailable) ─────────
  const LEGACY_CURRICULUM = {
    mathematics: {
      label: 'Mathematics', icon: '&#x1F4D0;', color: '#3b82f6',
      topics: [
        {
          id: 'mathematics.Number Bases', title: 'Number Bases', duration: '12:30', subject: 'mathematics',
          content: {
            intro: 'Number bases are systems for representing numbers using a fixed number of digits.',
            points: [
              'In base 10, the digits are 0–9. In base 2, only 0 and 1 are used.',
              'To convert from base 10 to another base, repeatedly divide by the base and record remainders.',
              'To convert to base 10, multiply each digit by the base raised to its position power.',
              'Addition and subtraction can be performed directly in any base.'
            ],
            formulas: [
              { label: 'Base 10 → Base n', formula: 'Divide by n, read remainders upward' },
              { label: 'Base n → Base 10', formula: 'Σ (digit × nᵖᵒˢⁱᵗⁱᵒⁿ)' }
            ]
          },
          quiz: [
            { q: 'Convert 13 (base 10) to base 2', opts: ['1100', '1101', '1010', '1111'], ans: 1 },
            { q: 'What is 1011₂ in base 10?',       opts: ['9', '10', '11', '12'],          ans: 2 },
            { q: 'Convert 255 (base 10) to base 16', opts: ['EF', 'FF', 'FE', 'F0'],        ans: 1 }
          ]
        },
        {
          id: 'mathematics.Quadratics', title: 'Quadratic Equations', duration: '20:15', subject: 'mathematics',
          content: {
            intro: 'A quadratic equation is any equation of the form ax² + bx + c = 0.',
            points: [
              'Factoring works when the equation factors cleanly into (x−p)(x−q) = 0.',
              'The quadratic formula x = (−b ± √(b²−4ac)) / 2a works for all quadratics.',
              'The discriminant (b²−4ac) tells you the nature of roots.',
              'Sum of roots = −b/a; Product of roots = c/a.'
            ],
            formulas: [
              { label: 'Quadratic formula', formula: 'x = (−b ± √(b²−4ac)) / 2a' },
              { label: 'Sum of roots',      formula: 'α + β = −b/a' },
              { label: 'Product of roots',  formula: 'αβ = c/a' },
              { label: 'Discriminant',      formula: 'Δ = b² − 4ac' }
            ]
          },
          quiz: [
            { q: 'Solve x² − 5x + 6 = 0', opts: ['x=2 or x=3', 'x=−2 or x=3', 'x=1 or x=6', 'x=−2 or x=−3'], ans: 0 },
            { q: 'Sum of roots of 3x² − 9x + 4 = 0 is', opts: ['3', '9', '4/3', '−3'], ans: 0 },
            { q: 'The discriminant of x² + 2x + 5 = 0 is', opts: ['−16', '16', '24', '−24'], ans: 0 }
          ]
        }
      ]
    },
    english: {
      label: 'English Language', icon: '&#x1F4D6;', color: '#10b981',
      topics: [
        {
          id: 'english.Comprehension', title: 'Reading Comprehension', duration: '14:00', subject: 'english',
          content: {
            intro: 'Comprehension tests your ability to understand written passages.',
            points: [
              'Read the questions before reading the passage.',
              'Identify the main idea in each paragraph.',
              'For vocabulary questions, use context clues.',
              'Inference questions: the answer is implied, not directly stated.'
            ],
            formulas: []
          },
          quiz: [
            { q: '"Benevolent" means closest to', opts: ['Generous', 'Cruel', 'Strict', 'Ambitious'],   ans: 0 },
            { q: '"Ephemeral" means',              opts: ['Short-lived', 'Eternal', 'Enormous', 'Ordinary'], ans: 0 },
            { q: 'The antonym of "diligent" is',   opts: ['Lazy', 'Hardworking', 'Clever', 'Smart'],    ans: 0 }
          ]
        }
      ]
    }
  };

  return {
    init, switchSubject, selectTopic, loadTopic, nextLesson, prevLesson,
    playVideo, switchTier, toggleSidebar, closeSidebar, getCurriculum
  };

})();
