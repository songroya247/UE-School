/* ═══════════════════════════════════════════════════
   UE School — Dashboard Live Data
   Wires all dashboard UI to real Supabase data.
   Handles brand-new users (zero records) gracefully.
═══════════════════════════════════════════════════ */

const DASHBOARD = (function () {

  // ── Subject registry ──────────────────────────────
  const SUBJECT_META = {
    mathematics: { icon: '&#x1F4D0;', label: 'Mathematics',     color: '#3b82f6' },
    english:     { icon: '&#x1F4D6;', label: 'English Language', color: '#10b981' },
    physics:     { icon: '&#x269B;', label: 'Physics',          color: '#7c3aed' },
    chemistry:   { icon: '&#x1F9EA;', label: 'Chemistry',        color: '#ff6b35' },
    biology:     { icon: '&#x1F33F;', label: 'Biology',           color: '#0891b2' },
    economics:   { icon: '&#x1F4C8;', label: 'Economics',        color: '#f59e0b' },
    government:  { icon: '&#x1F3DB;', label: 'Government',       color: '#6366f1' },
    literature:  { icon: '&#x1F4DA;', label: 'Literature',        color: '#ec4899' },
    geography:   { icon: '&#x1F30D;', label: 'Geography',         color: '#10b981' },
    commerce:    { icon: '&#x1F3EA;', label: 'Commerce',          color: '#8b5cf6' },
    accounts:    { icon: '&#x1F4BC;', label: 'Accounts',          color: '#14b8a6' },
    crk:         { icon: '&#x271D;', label: 'CRK',               color: '#6d28d9' },
  };

  // Topic lists per subject
  const SUBJECT_TOPICS = {
    mathematics: ['Quadratics','Indices','Logarithms','Probability','Calculus','Sets','Geometry','Statistics'],
    english:     ['Comprehension','Essay Writing','Summary','Oral English','Lexis & Structure'],
    physics:     ['Mechanics','Waves','Electricity','Optics','Thermodynamics','Modern Physics'],
    chemistry:   ['Organic Chemistry','Periodic Table','Acids & Bases','Electrochemistry','Kinetics'],
    biology:     ['Cell Biology','Genetics','Ecology','Nutrition','Evolution'],
    economics:   ['Supply & Demand','National Income','Money & Banking','Trade','Development'],
    government:  ['Constitution','Legislature','Executive','Judiciary','International Relations'],
    literature:  ['Prose','Poetry','Drama','Oral Literature'],
    geography:   ['Physical Geography','Human Geography','Map Reading','Climate'],
    commerce:    ['Trade','Business Finance','Insurance','Transportation'],
    accounts:    ['Bookkeeping','Final Accounts','Costing','Partnership'],
    crk:         ['Old Testament','New Testament','Church History'],
  };

  // ── Progress colour ───────────────────────────────
  function progressColor(pct) {
    if (pct === null || pct === undefined) return 'fill-grey';
    if (pct >= 70) return 'fill-green';
    if (pct >= 40) return 'fill-orange';
    return 'fill-blue';
  }

  // ── Days until exam ───────────────────────────────
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    // examDate stored as "May 2026" — parse to 1st of that month
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.ceil((d - Date.now()) / 86400000);
  }

  // ── Streak calculation ────────────────────────────
  function calcStreak(usageLogs) {
    if (!usageLogs || usageLogs.length === 0) return 0;
    const days = new Set(
      usageLogs.map(l => new Date(l.ts).toDateString())
    );
    let streak = 0;
    let d = new Date();
    while (days.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  // ── Aggregate mastery by subject ──────────────────
  function groupMasteryBySubject(masteryRows) {
    const map = {};
    for (const row of (masteryRows || [])) {
      // topic_id format: "subject.TopicName" e.g. "mathematics.Quadratics"
      const subjKey = row.topic_id.split('.')[0];
      if (!map[subjKey]) map[subjKey] = [];
      map[subjKey].push(row);
    }
    return map;
  }

  function subjectMasteryPct(rows) {
    const active = rows.filter(r => r.mastery_level !== null && r.mastery_level !== undefined);
    if (active.length === 0) return null;
    return Math.round((active.reduce((s, r) => s + r.mastery_level, 0) / active.length) * 100);
  }

  // ════════════════════════════════════════════════
  //  RENDER FUNCTIONS
  // ════════════════════════════════════════════════

  // ── Welcome Card ──────────────────────────────────
  function renderWelcome(profile, masteryRows) {
    const firstName  = (profile.full_name || 'Student').split(' ')[0];
    const examDays   = daysUntil(profile.exam_date);
    const streak     = calcStreak(profile.usage_logs);

    // Welcome card headline
    const welcomeEl = document.getElementById('dash-welcome-name');
    if (welcomeEl) welcomeEl.textContent = firstName;

    // Subtitle
    const subEl = document.getElementById('dash-welcome-subtitle');
    if (subEl) {
      let text = '';
      if (examDays !== null && examDays > 0) {
        text = `${examDays} day${examDays !== 1 ? 's' : ''} to your exam. `;
      } else if (examDays !== null && examDays <= 0) {
        text = 'Exam time is here! ';
      }
      text += streak > 0
        ? `You're on a ${streak}-day streak — keep it up! &#x1F525;`
        : 'Start a session today to build your streak.';
      subEl.innerHTML = text; // innerHTML needed for HTML entities (emoji)
    }

    // Next recommended topic
    const nextTopicEl = document.getElementById('dash-next-topic');
    if (nextTopicEl) {
      const queue = SMARTPATH.buildQueue(masteryRows, 1);
      if (queue.length > 0) {
        const rec   = queue[0];
        const parts = rec.topic_id.split('.');
        const subj  = parts[0], topic = parts[1] || SMARTPATH.formatTopicLabel(rec.topic_id);
        const meta  = SUBJECT_META[subj] || { label: subj, icon: '&#x1F4DA;' };
        nextTopicEl.textContent = `${meta.label}: ${topic}`;
      } else {
        nextTopicEl.textContent = 'Choose a subject below to get started';
      }
    }

    // Nav streak badge
    const streakEl = document.getElementById('nav-streak');
    if (streakEl) {
      streakEl.innerHTML = streak > 0 ? `&#x1F525; ${streak}-day streak` : '&#x1F525; Start streak';
    }

    // Nav XP
    const xpEl = document.getElementById('nav-xp');
    if (xpEl) xpEl.textContent = `${profile.total_xp ?? 0} XP`;
  }

  // ── Exam context helpers ──────────────────────────
  function getExamContext(profile) {
    const exams = profile.exam_types || [];
    return {
      isJAMBOnly:  exams.includes('JAMB') && !exams.includes('WAEC') && !exams.includes('NECO'),
      isGradeOnly: !exams.includes('JAMB') && (exams.includes('WAEC') || exams.includes('NECO')),
      hasBoth:     exams.includes('JAMB') && (exams.includes('WAEC') || exams.includes('NECO')),
      exams
    };
  }

  function accToGrade(acc) {
    if (acc >= 90) return 'A1'; if (acc >= 80) return 'B2';
    if (acc >= 75) return 'B3'; if (acc >= 65) return 'C4';
    if (acc >= 55) return 'C5'; if (acc >= 50) return 'C6';
    if (acc >= 40) return 'D7'; if (acc >= 30) return 'E8';
    return 'F9';
  }

  // ── Score Prediction Card ─────────────────────────
  function renderScoreCard(profile, masteryRows) {
    const ctx     = getExamContext(profile);
    const cardEl  = document.querySelector('.score-card');
    const labelEl = cardEl?.querySelector('.score-label');
    const valueEl = document.getElementById('score-value');
    const hintEl  = document.getElementById('score-hint');
    const fillEl  = document.getElementById('score-progress-fill');

    if (!valueEl) return;

    // ── WAEC/NECO only — show grade tracker instead ──
    if (ctx.isGradeOnly) {
      if (labelEl) labelEl.textContent = 'Estimated Grade';
      if (fillEl) fillEl.closest('.score-progress-wrap') && (fillEl.closest('.score-progress-wrap').style.display = 'none');

      const totalQ   = masteryRows.reduce((s, r) => s + (r.attempts || 0), 0);
      const totalC   = masteryRows.reduce((s, r) => s + (r.correct  || 0), 0);
      const acc      = totalQ > 0 ? (totalC / totalQ) * 100 : null;
      const target   = profile.target_grade || 'B3';

      if (acc === null) {
        valueEl.innerHTML = `<span style="font-size:1.5rem;color:var(--muted)">No data yet</span>`;
        if (hintEl) hintEl.textContent = 'Complete your first practice session to see your estimated grade.';
      } else {
        const grade = accToGrade(acc);
        valueEl.innerHTML = `${grade}<span class="score-denom" style="font-size:1.2rem;margin-left:6px">/ A1</span>`;
        if (hintEl) {
          if (grade <= target) {
            hintEl.innerHTML = `You're on track for ${target} or better. Keep it up! &#x1F31F;`;
          } else {
            hintEl.textContent = `Target: ${target}. Focus on weak topics to push your grade up.`;
          }
        }
        if (fillEl) {
          const gradeMap = { A1:100, B2:87, B3:77, C4:70, C5:60, C6:52, D7:45, E8:35, F9:20 };
          fillEl.style.width = (gradeMap[grade] || 0) + '%';
          if (fillEl.closest('.score-progress-wrap')) fillEl.closest('.score-progress-wrap').style.display = '';
        }
      }
      return;
    }

    // ── Mixed (JAMB + WAEC) — show accuracy % ──
    if (ctx.hasBoth) {
      if (labelEl) labelEl.textContent = 'Overall Accuracy';
      const totalQ = masteryRows.reduce((s, r) => s + (r.attempts || 0), 0);
      const totalC = masteryRows.reduce((s, r) => s + (r.correct  || 0), 0);
      const acc    = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : null;

      if (acc === null) {
        valueEl.innerHTML = `<span style="font-size:1.5rem;color:var(--muted)">No data yet</span>`;
        if (hintEl) hintEl.textContent = 'Complete a session to see your accuracy.';
        if (fillEl) fillEl.style.width = '0%';
      } else {
        valueEl.innerHTML = `${acc}<span class="score-denom">%</span>`;
        if (hintEl) hintEl.textContent = acc >= 70 ? 'Strong accuracy across both exams!' : 'Keep practising to improve your accuracy.';
        if (fillEl) fillEl.style.width = acc + '%';
      }
      return;
    }

    // ── JAMB only (default) — score prediction ──
    if (labelEl) labelEl.textContent = 'Predicted JAMB Score';
    const prediction = SMARTPATH.predictJAMBScore(profile, masteryRows);
    const target     = profile.target_score || 250;

    if (!prediction) {
      valueEl.innerHTML = `<span style="font-size:1.5rem;color:var(--muted)">No data yet</span>`;
      if (hintEl) hintEl.textContent = 'Complete your first practice session to see your predicted score.';
      if (fillEl) fillEl.style.width = '0%';
    } else {
      valueEl.innerHTML = `${prediction.low}–${prediction.high}<span class="score-denom">/400</span>`;
      const midpoint = Math.round((prediction.low + prediction.high) / 2);
      const gap = target - midpoint;
      if (hintEl) {
        if (gap > 0) {
          hintEl.textContent = `${gap} points away from your target of ${target}. Keep pushing!`;
        } else {
          hintEl.innerHTML = `You've hit your target of ${target}! Aim higher? &#x1F389;`;
        }
      }
      if (fillEl) fillEl.style.width = prediction.pct + '%';
    }
  }

  // ── Subjects Slider ───────────────────────────────
  function renderSubjectsSlider(profile, masteryBySubject) {
    const track     = document.getElementById('dash-track');
    const subjects  = profile.exam_subjects || [];

    if (!track) return;

    if (subjects.length === 0) {
      track.innerHTML = `
        <div style="padding:32px;color:var(--muted);font-size:.9rem;text-align:center;width:100%">
          No subjects selected yet.
          <a href="login.html?tab=signup" style="color:var(--accent);font-weight:700">Update your profile \u2192</a>
        </div>`;
      return;
    }

    track.innerHTML = subjects.map(subj => {
      const meta   = SUBJECT_META[subj] || { icon: '&#x1F4DA;', label: subj, color: '#6b7280' };
      const rows   = masteryBySubject[subj] || [];
      const pct    = subjectMasteryPct(rows);
      const pctStr = pct !== null ? `${pct}%` : 'NIL';
      const fill   = pct !== null ? progressColor(pct) : 'fill-grey';
      const fillW  = pct !== null ? pct : 0;
      const masteryColor = pct !== null ? '' : 'color:var(--muted)';

      return `
        <div class="dash-subj-slide" style="flex:0 0 280px">
          <div class="dash-subj-card">
            <div class="dash-subj-head">
              <div class="dash-subj-icon">${meta.icon}</div>
              <div class="dash-subj-name" style="color:${meta.color}">${meta.label}</div>
            </div>
            <div class="dash-subj-mastery-row">
              <span>Mastery</span>
              <span style="font-family:var(--font-mono);font-weight:700;${masteryColor}">${pctStr}</span>
            </div>
            <div class="subj-progress-track">
              <div class="subj-progress-fill ${fill}" style="width:${fillW}%"></div>
            </div>
            <div class="dash-subj-btns">
              <a href="classroom.html?subject=${subj}" class="btn btn-primary" style="font-size:.78rem">▶ Lesson</a>
              <a href="cbt.html?subject=${subj}" class="btn btn-outline" style="font-size:.78rem">Practice</a>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Detailed Performance Section ──────────────────
  function renderPerformance(profile, masteryRows) {
    const container = document.getElementById('perf-container');
    if (!container) return;

    const subjects  = profile.exam_subjects || [];

    if (subjects.length === 0 || masteryRows.length === 0) {
      container.innerHTML = `
        <div style="padding:48px 24px;text-align:center;color:var(--muted)">
          <div style="font-size:2rem;margin-bottom:12px">&#x1F4CA;</div>
          <div style="font-weight:700;margin-bottom:6px">No performance data yet</div>
          <div style="font-size:.88rem">Complete your first CBT session to see your results here.</div>
          <a href="cbt.html" class="btn btn-primary" style="margin-top:20px;display:inline-flex">Start Practice</a>
        </div>`;
      return;
    }

    const masteryMap = {};
    for (const row of masteryRows) masteryMap[row.topic_id] = row;

    const masteryBySubject = groupMasteryBySubject(masteryRows);

    container.innerHTML = subjects.map((subj, idx) => {
      const meta      = SUBJECT_META[subj] || { icon: '&#x1F4DA;', label: subj };
      const rows      = masteryBySubject[subj] || [];
      const subjPct   = subjectMasteryPct(rows);
      const pctStr    = subjPct !== null ? `${subjPct}%` : 'NIL';
      const pctColor  = subjPct !== null ? '' : 'color:var(--muted)';
      const fill      = subjPct !== null ? progressColor(subjPct) : 'fill-grey';
      const fillW     = subjPct !== null ? subjPct : 0;
      const expandId  = `expand-${subj}`;
      const isLast    = idx === subjects.length - 1;

      // Topic rows
      const topics    = SUBJECT_TOPICS[subj] || [];
      const topicHTML = topics.map(topicName => {
        const topicId    = `${subj}.${topicName}`;
        const row        = masteryMap[topicId];
        const topicPct   = row?.mastery_level !== undefined && row?.mastery_level !== null
          ? Math.round(row.mastery_level * 100) : null;
        const topicFill  = topicPct !== null ? progressColor(topicPct) : 'fill-grey';
        const topicFillW = topicPct !== null ? topicPct : 0;
        const status     = row ? SMARTPATH.classifyTopic(row) : 'Not Started';
        const statusColor = status === 'Needs Attention' ? 'color:#f87171' :
                            status === 'On Track'        ? 'color:#34d399' : '';
        return `
          <div class="perf-topic-row">
            <span class="perf-topic-name">${topicName}</span>
            <div class="perf-topic-track">
              <div class="perf-topic-fill ${topicFill}" style="width:${topicFillW}%"></div>
            </div>
            <span class="perf-topic-label" style="${statusColor}">${status}</span>
            <a href="classroom.html?subject=${subj}&topic=${encodeURIComponent(topicName)}" class="btn btn-sm btn-outline">Study</a>
            <a href="cbt.html?subject=${subj}&topic=${encodeURIComponent(topicName)}" class="btn btn-sm btn-primary" style="margin-left:4px">Practice</a>
          </div>`;
      }).join('');

      return `
        <div>
          <div class="perf-bar-row" onclick="toggleExpand('${expandId}',this)"
               ${isLast ? 'style="border-bottom:none"' : ''}>
            <span class="perf-subject-name">${meta.icon} ${meta.label}</span>
            <div class="perf-bar-track">
              <div class="perf-bar-fill ${fill}" style="width:${fillW}%"></div>
            </div>
            <span class="perf-pct" style="${pctColor}">${pctStr}</span>
            <span class="perf-expand-chevron">▾</span>
          </div>
          <div class="perf-subject-detail" id="${expandId}">
            ${topicHTML}
          </div>
        </div>`;
    }).join('');
  }

  // ── SmartPath Recommendations ─────────────────────
  function renderSmartPath(masteryRows) {
    const container = document.getElementById('smartpath-container');
    if (!container) return;

    const queue = SMARTPATH.buildQueue(masteryRows, 3);

    if (queue.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;padding:40px 24px;text-align:center;
             background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg)">
          <div style="font-size:2rem;margin-bottom:12px">&#x1F680;</div>
          <div style="font-weight:700;margin-bottom:6px;font-size:1rem">SmartPath is getting ready</div>
          <div style="font-size:.88rem;color:var(--muted)">
            Complete a few practice sessions and SmartPath™ will start recommending what to study next.
          </div>
          <a href="cbt.html" class="btn btn-primary" style="margin-top:20px;display:inline-flex">Start First Session</a>
        </div>`;
      return;
    }

    container.innerHTML = queue.map(rec => {
      const parts    = rec.topic_id.split('.');
      const subj     = parts[0];
      const topicName = parts.slice(1).join(' ') || SMARTPATH.formatTopicLabel(rec.topic_id);
      const meta     = SUBJECT_META[subj] || { icon: '&#x1F4DA;' };
      const desc     = SMARTPATH.buildDescription(rec.classification, rec.topic_id);
      const type     = rec.classification;

      return `
        <div class="smartpath-card">
          <div class="smartpath-tag" data-type="${type}">${type}</div>
          <div class="smartpath-topic">${meta.icon} ${topicName}</div>
          <div class="smartpath-desc">${desc}</div>
          <div class="smartpath-btns">
            <a href="classroom.html?subject=${subj}&topic=${encodeURIComponent(topicName)}"
               class="btn btn-primary btn-sm">Watch Lesson</a>
            <a href="cbt.html?subject=${subj}&topic=${encodeURIComponent(topicName)}"
               class="btn btn-outline btn-sm">Practice</a>
          </div>
        </div>`;
    }).join('');
  }

  // ── Subscription status banner ────────────────────
  function renderSubscriptionStatus(profile) {
    const status   = AUTH_GUARD.subscriptionStatus(profile);
    const banner   = document.getElementById('defaulter-banner');
    const upgradeSection = document.getElementById('upgrade-cta');

    if (banner) {
      banner.style.display = status === 'EXPIRED' ? 'block' : 'none';
    }

    if (upgradeSection) {
      upgradeSection.style.display = status === 'NIL' ? 'block' : 'none';
    }
  }

  // ── Recent sessions ───────────────────────────────
  async function loadRecentSessions(userId) {
    const { data } = await window.sb
      .from('session_scores')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    return data || [];
  }

  // ════════════════════════════════════════════════
  //  MAIN INIT — called on DOMContentLoaded
  // ════════════════════════════════════════════════
  async function init() {
    const authResult = await AUTH_GUARD.init();
    if (!authResult) return; // redirecting to login

    const { profile, session } = authResult;
    const userId = session.user.id;

    // Show skeleton loaders while fetching
    showSkeletons();

    // ── Fetch mastery data ──
    const { data: masteryRows } = await window.sb
      .from('topic_mastery')
      .select('*')
      .eq('user_id', userId);

    const rows           = masteryRows || [];
    const masteryBySubj  = groupMasteryBySubject(rows);

    // ── Render all sections ──
    renderWelcome(profile, rows);
    renderScoreCard(profile, rows);
    renderSubjectsSlider(profile, masteryBySubj);
    renderPerformance(profile, rows);
    renderSmartPath(rows);
    renderSubscriptionStatus(profile);

    // ── Re-init slider after subjects are rendered ──
    if (typeof initSlider === 'function') {
      initSlider('dash-track', 'dash-prev', 'dash-next');
    }

    // ── Hide skeletons ──
    hideSkeletons();

    // ── Save updated SmartPath queue to profile ──
    const queue = SMARTPATH.buildQueue(rows, 6);
    if (queue.length > 0 && userId) {
      await SMARTPATH.saveQueue(userId, queue);
    }

    // ── Track dashboard visit ──
    await AUTH.trackAction('dashboard_view');
  }

  function showSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      el.style.opacity = '.4';
      el.style.pointerEvents = 'none';
    });
  }

  function hideSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      el.style.opacity = '';
      el.style.pointerEvents = '';
    });
  }

  return { init };

})();
