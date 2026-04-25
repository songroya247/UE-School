/* ============================================================
   skill_chamber.js — The Adaptive Tier Router.

   Wraps CLASSROOM.loadTopic via monkey-patch (additive only).

     • Topics not in TOPIC_BLUEPRINT fall through to legacy.
     • If a tier has already been chosen for the student, load
       the lesson immediately at that tier.
     • Otherwise the InterventionModal runs the diagnostic and
       then calls back with the recommended tier.

   Toggle window.UE_FLAGS.SKILL_CHAMBERS_ENABLED = false to
   restore legacy behaviour (always Standard tier, no diagnostic).
============================================================ */

window.UE_FLAGS = Object.assign({ SKILL_CHAMBERS_ENABLED: true }, window.UE_FLAGS || {});

(function(){
  function attach(){
    if (!window.CLASSROOM || typeof window.CLASSROOM.loadTopic !== 'function') {
      return setTimeout(attach, 30);
    }
    if (window.CLASSROOM.__chamberWrapped) return;
    window.CLASSROOM.__chamberWrapped = true;

    const __origLoadTopic = window.CLASSROOM.loadTopic.bind(window.CLASSROOM);

    window.CLASSROOM.loadTopic = async (topicId, opts) => {
      opts = opts || {};
      if (!window.UE_FLAGS || !window.UE_FLAGS.SKILL_CHAMBERS_ENABLED) {
        return __origLoadTopic(topicId, Object.assign({}, opts, { tier: 'standard' }));
      }
      const handled = await window.CLASSROOM.handleGatekeeper(topicId, opts);
      if (handled === 'PROCEED') return __origLoadTopic(topicId, opts);
    };

    window.CLASSROOM.handleGatekeeper = async function(topicId, opts){
      const bp = window.getBlueprint(topicId);
      if (!bp) return 'PROCEED';   // legacy fallthrough

      const mastery = window.STORAGE.getTopicMastery(topicId);

      // Already diagnosed? Skip the check and load the chosen tier directly.
      if (mastery && mastery.chosen_tier) {
        opts.tier = mastery.chosen_tier;
        return 'PROCEED';
      }

      // Honour explicit override (e.g. tier switcher pills) without re-diagnosing.
      if (opts && opts.skipDiagnostic && opts.tier) return 'PROCEED';

      // Run the diagnostic, then load at the recommended tier.
      window.InterventionModal.open({
        topicId, mode:'diagnostic',
        payload:{
          onCleared: (tier) => {
            window.STORAGE.setChosenTier(topicId, tier);
            __origLoadTopic(topicId, Object.assign({}, opts, { tier }));
          }
        }
      });
      return 'INTERCEPTED';
    };
  }
  attach();
})();
