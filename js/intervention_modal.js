/* ============================================================
   intervention_modal.js \u2014 Adaptive Skill Chamber UI.

   The diagnostic now ROUTES students to the correct video tier
   instead of gate-keeping them. Every student gets a lesson \u2014
   the system just picks the right *level* of explanation.

     Score 0\u201339%  \u2192  Foundation video (slow, basics, examples)
     Score 40\u201379% \u2192  Standard   video (default lesson)
     Score 80%+   \u2192  Mastery    video (exam-focused, fast)

   Public API:
     InterventionModal.open({ topicId, mode, payload, onClose })
     InterventionModal.close()
     scoreToTier(pct, history)   \u2190 exported helper
============================================================ */

(function(){

  const TIER_ORDER  = ['foundation','standard','mastery'];
  const TIER_LABEL  = { foundation:'Foundation', standard:'Standard', mastery:'Mastery' };
  const TIER_BLURB  = {
    foundation: 'Slower pace, more worked examples, no prior knowledge assumed.',
    standard:   'The default lesson at expected grade level.',
    mastery:    'Faster pace, exam-focused \u2014 past-paper patterns and trickier cases.'
  };
  const TIER_THRESHOLD = { mastery: 0.80, standard: 0.40 };  // \u226580 mastery, \u226540 standard, else foundation

  function scoreToTier(pct){
    if (pct >= TIER_THRESHOLD.mastery * 100) return 'mastery';
    if (pct >= TIER_THRESHOLD.standard * 100) return 'standard';
    return 'foundation';
  }

  let activeRoot = null, activeOnClose = null;

  function el(tag, cls, html){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function close(){
    if (!activeRoot) return;
    activeRoot.style.opacity = '0';
    setTimeout(() => {
      if (activeRoot && activeRoot.parentNode) activeRoot.parentNode.removeChild(activeRoot);
      activeRoot = null;
      const cb = activeOnClose; activeOnClose = null;
      if (cb) cb();
    }, 200);
  }

  function open({ topicId, mode, payload, onClose }){
    close();
    activeOnClose = onClose || null;
    const blueprint = window.getBlueprint(topicId);
    if (!blueprint) return;

    const root = el('div','skill-chamber-modal');
    root.style.transition = 'opacity .2s';
    const overlay = el('div','skill-chamber-modal__overlay');
    overlay.addEventListener('click', close);
    const panel = el('div','skill-chamber-modal__panel');

    let parts;
    switch(mode){
      case 'diagnostic':  parts = renderDiagnostic(blueprint, payload || {}); break;
      case 'tier_result': parts = renderTierResult(blueprint, payload || {}); break;
      case 'powerup':     parts = renderPowerUp(blueprint, payload || {});    break;
      case 'drill':       parts = renderDrill(blueprint, payload || {});      break;
      default: return;
    }
    panel.appendChild(parts.head);
    panel.appendChild(parts.body);
    panel.appendChild(parts.foot);
    root.appendChild(overlay);
    root.appendChild(panel);
    document.body.appendChild(root);
    activeRoot = root;
  }

  /* =========================================================
     MODE: DIAGNOSTIC \u2014 short check, then route to a tier.
     ========================================================= */
  function renderDiagnostic(bp, payload){
    const questions = window.getQuickCheck(bp.id).slice(0, 3);
    const state = { idx:0, correct:0, perSubSkill:{} };

    const head = el('div','sc-head');
    head.innerHTML = `
      <span class="sc-mode-tag boss">\u26A1 Quick Skill Check</span>
      <button class="sc-close" aria-label="Close">×</button>
      <h2 class="sc-title">${escapeHtml(bp.title)}</h2>
      <p class="sc-subtitle">3 quick questions so we pick the right version of the video for you. There's no wrong outcome \u2014 every result unlocks a lesson tailored to your level.</p>`;
    head.querySelector('.sc-close').addEventListener('click', close);

    const body = el('div','sc-body');
    const foot = el('div','sc-foot');

    function draw(){
      body.innerHTML = '';
      const q = questions[state.idx];
      if (!q) return finish();

      body.innerHTML = `
        <div class="sc-stat-row" style="margin-bottom:10px">
          <div class="sc-stat"><div class="sc-stat-label">Question</div><div class="sc-stat-value">${state.idx+1} <span style="font-size:.9rem;color:#9ca3af">/ ${questions.length}</span></div></div>
          <div class="sc-stat"><div class="sc-stat-label">Correct so far</div><div class="sc-stat-value good">${state.correct}</div></div>
        </div>
        <div class="sc-progress"><div class="sc-progress-fill" style="width:${(state.idx/questions.length)*100}%"></div></div>
        <div class="card-body" style="margin-top:6px">
          <h3 id="quiz-question">${escapeHtml(q.q)}</h3>
          <div id="quiz-options"></div>
        </div>`;

      const optsEl = body.querySelector('#quiz-options');
      q.options.forEach((opt, i) => {
        const b = el('button','drill-option', `<span class="opt-label">${String.fromCharCode(65+i)}</span><span>${escapeHtml(opt)}</span>`);
        b.addEventListener('click', () => {
          [...optsEl.children].forEach(c => c.classList.add('disabled'));
          const ok = (i === q.answer);
          b.classList.add(ok ? 'correct' : 'wrong');
          if (!ok && optsEl.children[q.answer]) optsEl.children[q.answer].classList.add('correct');
          if (ok) state.correct++;
          if (q.sub_skill_tag){
            const t = state.perSubSkill[q.sub_skill_tag] || { ok:0, n:0 };
            t.n++; if (ok) t.ok++;
            state.perSubSkill[q.sub_skill_tag] = t;
          }
          setTimeout(() => { state.idx++; draw(); }, 950);
        });
        optsEl.appendChild(b);
      });
    }
    draw();

    function finish(){
      const total = questions.length || 1;
      const pct = Math.round((state.correct / total) * 100);
      const tier = scoreToTier(pct);

      // Persist sub-skill outcomes (idempotent merge).
      Object.entries(state.perSubSkill).forEach(([tag, t]) => {
        const subPct = t.n ? t.ok / t.n : 0;
        window.STORAGE.upsertSubSkill(bp.id, tag, subPct, subPct >= 0.8);
      });

      // Persist recommended tier.
      window.STORAGE.setRecommendedTier(bp.id, tier, pct);

      // Find weakest sub-skill \u2014 used if the student wants extra support.
      const ranked = Object.entries(state.perSubSkill)
        .sort(([,a],[,b]) => (a.ok/a.n) - (b.ok/b.n))
        .map(([tag]) => tag);
      const weak = ranked.find(tag => window.getDrills(bp.id, tag).length > 0)
                || (bp.subSkills || []).find(tag => window.getDrills(bp.id, tag).length > 0);

      open({ topicId: bp.id, mode:'tier_result',
             payload:{ pct, tier, weak, onCleared: payload.onCleared } });
    }
    return { head, body, foot };
  }

  /* =========================================================
     MODE: TIER RESULT \u2014 show recommended tier + switcher + extras.
     ========================================================= */
  function renderTierResult(bp, payload){
    const { pct, tier, weak, onCleared } = payload;
    const v = (bp.videos && bp.videos[tier]) || {};

    const head = el('div','sc-head');
    head.innerHTML = `
      <span class="sc-mode-tag success">\u2713 Lesson Ready</span>
      <button class="sc-close" aria-label="Close">×</button>
      <h2 class="sc-title">Your level: <span style="color:#1d4ed8">${TIER_LABEL[tier]}</span></h2>
      <p class="sc-subtitle">You scored <strong>${pct}%</strong> on the check. Based on that, here's the lesson version we recommend \u2014 but you can change it any time on the lesson page.</p>`;
    head.querySelector('.sc-close').addEventListener('click', () => { close(); if (onCleared) onCleared(tier); });

    const body = el('div','sc-body');
    body.innerHTML = `
      <div class="sc-tier-pick">
        <div class="sc-tier-pick-head">
          <div class="sc-tier-pick-label">${TIER_LABEL[tier]} video</div>
          <div class="sc-tier-pick-dur">${escapeHtml(v.duration || bp.duration || '')}</div>
        </div>
        <div class="sc-tier-pick-tag">${escapeHtml(v.tagline || TIER_BLURB[tier])}</div>
      </div>

      <div class="pu-section-title" style="margin-top:18px">Other versions available</div>
      <div class="sc-tier-row">
        ${TIER_ORDER.filter(t => t !== tier).map(t => {
          const tv = (bp.videos && bp.videos[t]) || {};
          return `<button class="sc-tier-mini" data-tier="${t}">
            <div class="sc-tier-mini-name">${TIER_LABEL[t]}</div>
            <div class="sc-tier-mini-dur">${escapeHtml(tv.duration || '')}</div>
            <div class="sc-tier-mini-tag">${escapeHtml(tv.tagline || TIER_BLURB[t])}</div>
          </button>`;
        }).join('')}
      </div>`;

    body.querySelectorAll('.sc-tier-mini').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.tier;
        window.STORAGE.setChosenTier(bp.id, t);
        close(); if (onCleared) onCleared(t);
      });
    });

    const foot = el('div','sc-foot');
    if (weak && tier !== 'mastery'){
      const reinforce = el('button','sc-btn outline','Quick Power-Up first');
      reinforce.addEventListener('click', () => {
        open({ topicId: bp.id, mode:'powerup', payload:{ weak, tier, onCleared } });
      });
      foot.appendChild(reinforce);
    }
    const go = el('button','sc-btn primary',`Open ${TIER_LABEL[tier]} lesson \u2192`);
    go.addEventListener('click', () => { close(); if (onCleared) onCleared(tier); });
    foot.appendChild(go);

    return { head, body, foot };
  }

  /* =========================================================
     MODE: POWERUP \u2014 subject-specific scaffold (optional).
     ========================================================= */
  function renderPowerUp(bp, payload){
    const head = el('div','sc-head');
    head.innerHTML = `
      <span class="sc-mode-tag powerup">\u26A1 Power-Up</span>
      <button class="sc-close" aria-label="Close">×</button>
      <h2 class="sc-title">Quick scaffold before the lesson</h2>
      <p class="sc-subtitle">A 30-second visual aid for <strong>${escapeHtml(bp.title)}</strong>. Read it, then open the lesson.</p>`;
    head.querySelector('.sc-close').addEventListener('click', close);

    const body = el('div','sc-body');
    body.appendChild(renderPowerUpContent(bp.powerUp || {}, bp));

    const foot = el('div','sc-foot');
    if (payload.weak){
      const drill = el('button','sc-btn outline','Try a Drill');
      drill.addEventListener('click', () => {
        open({ topicId: bp.id, mode:'drill', payload:{ subSkillTag: payload.weak, tier: payload.tier, onCleared: payload.onCleared } });
      });
      foot.appendChild(drill);
    }
    const go = el('button','sc-btn primary','Open lesson \u2192');
    go.addEventListener('click', () => { close(); if (payload.onCleared) payload.onCleared(payload.tier); });
    foot.appendChild(go);

    return { head, body, foot };
  }

  function renderPowerUpContent(pu, bp){
    const wrap = el('div');
    const kind = pu.kind || (bp.subject === 'mathematics' ? 'math.slide_divide'
                            : bp.subject === 'literature'  ? 'literature.character_tree'
                            : bp.subject === 'biology'     ? 'biology.decoder'
                            : 'english.grammar_formula');
    if      (kind === 'math.formula_triangle')      wrap.appendChild(renderMathTriangle(pu.content));
    else if (kind === 'math.slide_divide')          wrap.appendChild(renderSlideDivide());
    else if (kind === 'literature.character_tree')  wrap.appendChild(renderCharacterTree(pu.content));
    else if (kind === 'biology.decoder')            wrap.appendChild(renderDecoder(pu.content));
    else if (kind === 'english.grammar_formula')    wrap.appendChild(renderGrammarFormula(pu.content));
    else                                            wrap.appendChild(renderSlideDivide());
    return wrap;
  }

  function renderSlideDivide(){
    const wrap = el('div');
    wrap.innerHTML = `
      <div class="pu-section-title">Slide-&-Divide · works on any quadratic</div>
      <div class="pu-card">
        <div class="pu-formula">Given:  ax² + bx + c = 0</div>
        <div class="pu-note">A safety net when factorising looks ugly. It works every time.</div>
      </div>
      <div class="pu-steps">
        <div class="pu-step"><div class="pu-step-num">1</div><div class="pu-step-text"><strong>Slide</strong> \u2014 multiply <code>a</code> into <code>c</code>. New equation: <code>x² + bx + (a·c) = 0</code>.</div></div>
        <div class="pu-step"><div class="pu-step-num">2</div><div class="pu-step-text"><strong>Factor</strong> as <code>(x + p)(x + q) = 0</code>. Find two numbers that multiply to <code>a·c</code> and add to <code>b</code>.</div></div>
        <div class="pu-step"><div class="pu-step-num">3</div><div class="pu-step-text"><strong>Divide</strong> each <code>p</code> and <code>q</code> by the original <code>a</code>, then simplify.</div></div>
      </div>`;
    return wrap;
  }

  function renderMathTriangle(c){
    const wrap = el('div');
    const top   = (c && c.top)   || 'd';
    const left  = (c && c.left)  || 's';
    const right = (c && c.right) || 't';
    wrap.innerHTML = `
      <div class="pu-section-title">Formula Triangle</div>
      <div class="pu-triangle">
        <svg viewBox="0 0 220 200">
          <defs><linearGradient id="trg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs>
          <polygon points="110,15 210,180 10,180" fill="url(#trg)" opacity=".15" stroke="#3b82f6" stroke-width="2"/>
          <line x1="110" y1="100" x2="210" y2="180" stroke="#3b82f6" stroke-width="1.4" opacity=".5"/>
          <line x1="110" y1="100" x2="10"  y2="180" stroke="#3b82f6" stroke-width="1.4" opacity=".5"/>
          <line x1="10"  y1="180" x2="210" y2="180" stroke="#3b82f6" stroke-width="1.4" opacity=".5"/>
          <text x="110" y="70"  text-anchor="middle" font-family="Syne,sans-serif" font-size="34" font-weight="800" fill="#1d4ed8">${top}</text>
          <text x="55"  y="155" text-anchor="middle" font-family="Syne,sans-serif" font-size="28" font-weight="700" fill="#0f1c3f">${left}</text>
          <text x="165" y="155" text-anchor="middle" font-family="Syne,sans-serif" font-size="28" font-weight="700" fill="#0f1c3f">${right}</text>
        </svg>
      </div>
      <div class="pu-card"><div class="pu-formula">${top} = ${left} × ${right}      ${left} = ${top} ÷ ${right}      ${right} = ${top} ÷ ${left}</div>
      <div class="pu-note">Cover the unknown letter with your finger \u2014 what's left is the formula you need.</div></div>`;
    return wrap;
  }

  function renderCharacterTree(c){
    const wrap = el('div');
    const nodes = (c && c.nodes) || [];
    const edges = (c && c.edges) || [];
    let html = `<div class="pu-section-title">Character Map</div><div class="pu-tree">`;
    nodes.forEach(n => {
      html += `<div class="pu-tree-node">
        <div class="pu-tree-icon">${escapeHtml(n.icon || '\uD83C\uDFAD')}</div>
        <div><div class="pu-tree-name">${escapeHtml(n.name)}</div>
        <div class="pu-tree-role">${escapeHtml(n.role || '')}</div></div></div>`;
    });
    html += `</div>`;
    if (edges.length){
      html += `<div class="pu-section-title">Relationships</div>`;
      edges.forEach(e => { html += `<div class="pu-tree-edges" style="margin-bottom:8px">${escapeHtml(e)}</div>`; });
    }
    wrap.innerHTML = html;
    return wrap;
  }

  function renderDecoder(c){
    const wrap = el('div');
    const items = (c && c.items) || [];
    let html = `<div class="pu-section-title">Word-Part Decoder</div><div class="pu-decoder">`;
    items.forEach(it => {
      html += `<div class="pu-decode">
        <div class="pu-decode-tag">${escapeHtml(it.tag)}</div>
        <div class="pu-decode-arrow">\u2192</div>
        <div class="pu-decode-meaning">${escapeHtml(it.meaning)}</div></div>`;
    });
    html += `</div><div class="pu-card"><div class="pu-note">Break long biology words into prefixes and suffixes \u2014 most exam terms are built from just a few of these parts.</div></div>`;
    wrap.innerHTML = html;
    return wrap;
  }

  function renderGrammarFormula(c){
    const wrap = el('div');
    const tokens = (c && c.tokens) || ['Singular Subject','+','Verb-s','=','\u2714'];
    const note   = (c && c.note)   || 'When the subject is one person/thing, add an "s" to the verb.';
    let formula = '<div class="pu-grammar"><div class="pu-grammar-formula">';
    tokens.forEach(t => {
      const isOp = ['+','=','-','×'].includes(t);
      formula += isOp
        ? `<span class="pu-grammar-op">${escapeHtml(t)}</span>`
        : `<span class="pu-grammar-token">${escapeHtml(t)}</span>`;
    });
    formula += `</div><div class="pu-grammar-note">${escapeHtml(note)}</div></div>`;
    wrap.innerHTML = `<div class="pu-section-title">Grammar Formula</div>${formula}`;
    return wrap;
  }

  /* =========================================================
     MODE: DRILL \u2014 focused practice, drills are excluded from
     Predicted Score (see storage.js).
     ========================================================= */
  function renderDrill(bp, payload){
    const subSkillTag = payload.subSkillTag;
    let questions = window.getDrills(bp.id, subSkillTag);
    if (!questions.length) questions = window.getDrills(bp.id);
    questions = questions.slice(0, 3);
    const state = { idx:0, correct:0 };

    const head = el('div','sc-head');
    head.innerHTML = `
      <span class="sc-mode-tag drill">\uD83C\uDFAF Skill Drill · ${escapeHtml(subSkillTag || 'practice')}</span>
      <button class="sc-close" aria-label="Close">×</button>
      <h2 class="sc-title">Lock in the sub-skill</h2>
      <p class="sc-subtitle">Drills don't affect your Predicted Score \u2014 they only ever help.</p>`;
    head.querySelector('.sc-close').addEventListener('click', close);

    const body = el('div','sc-body');
    const foot = el('div','sc-foot');

    function draw(){
      body.innerHTML = '';
      const q = questions[state.idx];
      if (!q) return finish();
      body.innerHTML = `
        <div class="sc-stat-row">
          <div class="sc-stat"><div class="sc-stat-label">Question</div><div class="sc-stat-value">${state.idx+1} / ${questions.length}</div></div>
          <div class="sc-stat"><div class="sc-stat-label">Correct</div><div class="sc-stat-value good">${state.correct}</div></div>
        </div>
        <div class="sc-progress"><div class="sc-progress-fill" style="width:${(state.idx/questions.length)*100}%"></div></div>
        <div class="card-body" style="margin-top:6px">
          <h3 id="quiz-question">${escapeHtml(q.q)}</h3>
          <div id="quiz-options"></div>
        </div>`;
      const optsEl = body.querySelector('#quiz-options');
      q.options.forEach((opt, i) => {
        const b = el('button','drill-option',`<span class="opt-label">${String.fromCharCode(65+i)}</span><span>${escapeHtml(opt)}</span>`);
        b.addEventListener('click', () => {
          [...optsEl.children].forEach(c => c.classList.add('disabled'));
          const ok = (i === q.answer);
          b.classList.add(ok ? 'correct' : 'wrong');
          if (!ok && optsEl.children[q.answer]) optsEl.children[q.answer].classList.add('correct');
          if (ok) state.correct++;
          const fb = el('div','quiz-feedback show ' + (ok ? 'ok' : 'no'));
          fb.innerHTML = `<strong>${ok ? 'Correct' : 'Not quite'}</strong>${escapeHtml(q.explain || '')}`;
          body.querySelector('.card-body').appendChild(fb);
          setTimeout(() => { state.idx++; draw(); }, 1400);
        });
        optsEl.appendChild(b);
      });
    }
    draw();

    function finish(){
      const total = questions.length || 1;
      const score = state.correct / total;
      const passed = score >= 0.8;
      const out = window.STORAGE.recordChamberAttempt({
        topicId: bp.id, subSkillTag, score: Math.round(score*100), passed
      });
      window.STORAGE.upsertSubSkill(bp.id, subSkillTag, score, passed);
      if (out.firstPass) window.STORAGE.addXP(15);

      // Always continue to the lesson (drills are reinforcement, not gatekeepers).
      close();
      if (payload.onCleared) payload.onCleared(payload.tier);
    }
    return { head, body, foot };
  }

  window.InterventionModal = { open, close, scoreToTier, TIER_ORDER, TIER_LABEL, TIER_BLURB };
})();
