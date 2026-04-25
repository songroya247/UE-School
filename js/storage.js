/* ============================================================
   storage.js — Local persistence layer (mirrors the role of
   the topic_mastery + chamber_attempts tables in the spec,
   but lives in the browser so the app is fully self-contained).
============================================================ */

(function(){
  const KEY = 'ue_school_v1';

  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      return Object.assign(defaults(), parsed);
    } catch(e){ return defaults(); }
  }

  function defaults(){
    return {
      xp: 0,
      streak: 0,
      lastActiveDay: null,
      topic_mastery: {},      // { [topicId]: { sub_skills:{}, boss_cleared_at:null } }
      chamber_attempts: []    // { topicId, sub_skill_tag, score, passed, ts }
    };
  }

  function save(state){ localStorage.setItem(KEY, JSON.stringify(state)); }

  function ensureTopic(state, topicId){
    if (!state.topic_mastery[topicId]) {
      state.topic_mastery[topicId] = { sub_skills:{}, boss_cleared_at:null };
    }
    return state.topic_mastery[topicId];
  }

  function bumpStreak(state){
    const today = new Date().toISOString().slice(0,10);
    if (state.lastActiveDay === today) return;
    if (state.lastActiveDay) {
      const diff = (new Date(today) - new Date(state.lastActiveDay)) / 86400000;
      state.streak = (diff === 1) ? state.streak + 1 : 1;
    } else {
      state.streak = 1;
    }
    state.lastActiveDay = today;
  }

  /* ---------- Public API ---------- */
  window.STORAGE = {
    get(){ return load(); },

    addXP(amount){
      const s = load();
      s.xp += amount;
      bumpStreak(s);
      save(s);
      return s;
    },

    /* Mark a sub-skill as practised at a given score (0..1). Idempotent merge. */
    upsertSubSkill(topicId, subSkillTag, score, passed){
      const s = load();
      const t = ensureTopic(s, topicId);
      if (subSkillTag) {
        const prev = t.sub_skills[subSkillTag] || { score: 0, attempts: 0, mastered: false };
        t.sub_skills[subSkillTag] = {
          score:    Math.max(prev.score, score),
          attempts: prev.attempts + 1,
          mastered: prev.mastered || passed
        };
      }
      save(s);
      return s;
    },

    /* Adaptive video tier — recommended (from diagnostic) and chosen (student override). */
    setRecommendedTier(topicId, tier, score){
      const s = load();
      const t = ensureTopic(s, topicId);
      t.recommended_tier = tier;
      t.last_diagnostic_score = score;
      t.last_diagnostic_at = new Date().toISOString();
      if (!t.chosen_tier) t.chosen_tier = tier;
      save(s);
      return s;
    },
    setChosenTier(topicId, tier){
      const s = load();
      const t = ensureTopic(s, topicId);
      t.chosen_tier = tier;
      const w = new Set(t.watched_tiers || []);
      w.add(tier);
      t.watched_tiers = [...w];
      save(s);
      return s;
    },

    /* Mark the boss (full quick-check) cleared. */
    setBossCleared(topicId){
      const s = load();
      const t = ensureTopic(s, topicId);
      if (!t.boss_cleared_at) t.boss_cleared_at = new Date().toISOString();
      save(s);
      return s;
    },

    /* Append a chamber attempt. Returns true on first PASSED insertion (for XP idempotency). */
    recordChamberAttempt({ topicId, subSkillTag, score, passed }){
      const s = load();
      const alreadyPassed = s.chamber_attempts.some(a =>
        a.topicId === topicId && a.sub_skill_tag === subSkillTag && a.passed
      );
      s.chamber_attempts.push({
        topicId,
        sub_skill_tag: subSkillTag || null,
        score,
        passed,
        ts: new Date().toISOString()
      });
      save(s);
      return { firstPass: passed && !alreadyPassed };
    },

    getTopicMastery(topicId){
      const s = load();
      return s.topic_mastery[topicId] || { sub_skills:{}, boss_cleared_at:null };
    },

    /* Predicted-score aggregator. SKILL_CHAMBERS: drills (is_drill:true) and
       chamber_attempts are intentionally excluded to prevent score inflation.
       Do not remove without product approval. */
    predictedScore(){
      const s = load();
      const cleared = Object.values(s.topic_mastery).filter(t => t.boss_cleared_at).length;
      const total   = Object.keys(window.TOPIC_BLUEPRINT).length;
      return total ? Math.round((cleared / total) * 100) : 0;
    },

    reset(){ localStorage.removeItem(KEY); }
  };
})();
