async function init() {
  // ── WAIT FOR GOOGLE SHEET CURRICULUM TO LOAD ─────────────────
  // This ensures TOPIC_BLUEPRINT is enriched with sheet data
  // before we render any topics or resolve videos.
  if (window.GDRIVE_CURRICULUM_INIT) {
    try {
      await window.GDRIVE_CURRICULUM_INIT.init();
    } catch (e) {
      console.warn('Curriculum sheet load failed, using local blueprint only', e);
      // Continue with local TOPIC_BLUEPRINT as fallback
    }
  }

  // ── EXISTING AUTH GUARD INIT ─────────────────────────────────
  const result = await AUTH_GUARD.init();
  if (!result) return;
  const { profile, session } = result;
  userId = session?.user?.id;
  isPremiumUser = AUTH_GUARD.isPremium(profile);

  // ... rest of your existing init() code continues unchanged ...