/* ═══════════════════════════════════════════════════
   UE School — SmartPath™ Engine
   Computes AI-style recommendations from topic_mastery.
   Called after every CBT session and on dashboard load.
═══════════════════════════════════════════════════ */

const SMARTPATH = (function () {

  // ── Constants ─────────────────────────────────────
  const MASTERY_THRESHOLDS = {
    MASTERED:    0.75,   // >= 75% = Mastered / On Track
    BUILDING:    0.40,   // 40–74% = Building Up
    ATTENTION:   0.01,   // 1–39%  = Needs Attention
    // below 0.01 or null = Not Started
  };

  // ── Classify a single topic ───────────────────────
  function classifyTopic(masteryRow) {
    const m = masteryRow?.mastery_level;
    if (m === null || m === undefined || m === 0) return 'Not Started';
    if (m >= MASTERY_THRESHOLDS.MASTERED)         return 'On Track';
    if (m >= MASTERY_THRESHOLDS.BUILDING)         return 'Building Up';
    return 'Needs Attention';
  }

  // ── Generate queue from mastery rows ─────────────
  // Returns array of recommendation objects sorted by priority
  function buildQueue(masteryRows, limit = 6) {
    const rows = masteryRows || [];

    const scored = rows.map(row => {
      const classification = classifyTopic(row);
      let priority = 0;
      switch (classification) {
        case 'Needs Attention': priority = 3; break;
        case 'Building Up':     priority = 2; break;
        case 'Not Started':     priority = 1; break;
        case 'On Track':        priority = 0; break;
      }
      // Boost older topics (last_studied further back = higher priority)
      const daysSince = row.last_studied
        ? (Date.now() - new Date(row.last_studied)) / 86400000
        : 999;
      const recencyBoost = Math.min(daysSince / 30, 1) * 0.5;

      return {
        topic_id:       row.topic_id,
        classification,
        priority:       priority + recencyBoost,
        mastery_level:  row.mastery_level,
        accuracy_avg:   row.accuracy_avg,
        last_studied:   row.last_studied
      };
    });

    // Sort by priority desc, then return top N
    return scored
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  // ── JAMB score prediction ─────────────────────────
  // Formula: weighted average of mastery across registered subjects,
  // scaled to JAMB's 400-point range.
  // Requires at least some activity to give a prediction.
  function predictJAMBScore(profile, masteryRows) {
    const rows = (masteryRows || []).filter(r =>
      r.mastery_level !== null && r.mastery_level !== undefined
    );

    if (rows.length === 0) return null; // Not enough data

    // Average mastery across all attempted topics
    const avgMastery = rows.reduce((s, r) => s + r.mastery_level, 0) / rows.length;

    // Scale: 0% mastery → ~120 (random guess baseline), 100% → ~380
    const baseline = 120;
    const ceiling  = 380;
    const raw      = Math.round(baseline + avgMastery * (ceiling - baseline));

    // Return a ±20 range
    return {
      low:  Math.max(100, raw - 20),
      high: Math.min(400, raw + 20),
      raw,
      pct:  Math.round(((raw - 100) / 300) * 100) // % toward max
    };
  }

  // ── Build SmartPath description ───────────────────
  function buildDescription(classification, topicId) {
    const label = formatTopicLabel(topicId);
    switch (classification) {
      case 'Needs Attention':
        return `Your accuracy in ${label} is below 40%. Revisit the fundamentals before your next session.`;
      case 'Building Up':
        return `You're making progress in ${label}. A few more focused sessions will push you to On Track.`;
      case 'Not Started':
        return `You haven't started ${label} yet. Begin with the foundational lesson now.`;
      default:
        return `Keep up the great work in ${label}!`;
    }
  }

  // ── Topic label formatter ─────────────────────────
  function formatTopicLabel(topicId) {
    // Convert snake_case or dotted IDs to readable labels
    return topicId
      .split(/[._-]/).pop()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Persist queue to Supabase ─────────────────────
  async function saveQueue(userId, queue) {
    if (!window.sb || !userId) return;
    await window.sb
      .from('profiles')
      .update({ smartpath_queue: queue })
      .eq('id', userId);
  }

  return {
    classifyTopic,
    buildQueue,
    predictJAMBScore,
    buildDescription,
    formatTopicLabel,
    saveQueue,
    MASTERY_THRESHOLDS
  };

})();
