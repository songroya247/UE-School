/* ═══════════════════════════════════════════════════════
UE School — gdrive-curriculum.js
Fetches Google Sheet CSVs, parses topics, merges with TOPIC_BLUEPRINT,
and provides video resolution + tier mapping.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GDRIVE_CURRICULUM = (function () {
    let topics = {};
    let loaded = false;
    let lastFetch = 0;
    const CACHE_MIN = UE_CONFIG.GS_CURRICULUM_CACHE_MIN || 30;

    // ── Simple CSV parser (handles basic quoted fields) ─────────
    function parseCSV(text) {
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return [];

      // Parse header row
      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < headers.length) continue;

        const row = {};
        headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
        rows.push(row);
      }
      return rows;
    }

    // Parse a single CSV line respecting quoted fields
    function parseCSVLine(line) {
      const values = [];
      let current = '', inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
          if (inQuotes && next === '"') { current += '"'; i++; } // escaped quote
          else inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {          current += char;
        }
      }
      values.push(current);
      return values;
    }

    // ── Convert sheet row to topic blueprint format ─────────────
    function rowToTopic(row, subject = 'mathematics') {
      if (!row.topic_id) return null;

      const id = row.topic_id.toLowerCase().replace(/\s+/g, '_');
      const subjectPrefix = id.includes('.') ? id.split('.')[0] : subject;

      // Build videos object from sheet columns
      const videos = {};
      ['foundation', 'standard', 'mastery'].forEach(tier => {
        const url = row[`video_${tier}`]?.trim();
        if (url && url !== 'null' && url !== '' && !url.startsWith('https://placeholder')) {
          // Convert Drive view URLs to preview for embedding
          let embedUrl = url;
          if (embedUrl.includes('drive.google.com') && !embedUrl.includes('/preview')) {
            embedUrl = embedUrl.replace('/view', '/preview').replace('/edit', '/preview');
          }
          videos[tier] = {
            url: embedUrl,
            duration: row[`duration_${tier}`]?.trim() || row.duration?.trim() || '12 mins',
            tagline: row.blurb?.trim() || ''
          };
        }
      });

      return {
        id: `${subjectPrefix}.${id.split('.').pop()}`,
        subject: subjectPrefix,
        title: row.title?.trim() || id.split('.').pop().replace(/_/g, ' '),
        duration: row.duration?.trim() || '12 mins',
        blurb: row.blurb?.trim() || '',
        objectives: row.objectives?.split(';').map(o => o.trim()).filter(Boolean) || [],
        formulas: row.formulas?.split(';').map(f => f.trim()).filter(Boolean) || [],
        videos: Object.keys(videos).length ? videos : undefined,
        driveId: videos.standard?.url?.match(/\/file\/d\/([^\/\?]+)/)?.[1],
        active: row.active?.toLowerCase() !== 'false' && row.active?.toLowerCase() !== 'no'
      };
    }

    // ── Fetch and parse a sheet ─────────────────────────────────
    async function fetchSheet(url, subject = 'mathematics') {
      if (!url) return {};
      try {
        console.log(`[GDRIVE] Fetching ${subject} curriculum...`);
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        const sheetTopics = {};
        for (const row of rows) {
          const topic = rowToTopic(row, subject);
          if (topic?.active !== false && topic?.id) {
            sheetTopics[topic.id] = topic;
          }
        }

        console.log(`[GDRIVE] Loaded ${Object.keys(sheetTopics).length} ${subject} topics`);
        return sheetTopics;

      } catch (err) {
        console.warn(`[GDRIVE] Failed to fetch ${subject} sheet:`, err.message);
        return {};
      }
    }

    // ── Map mastery score (0-100) to video tier ─────────────────
    function masteryToTier(score) {
      if (score === null || score === undefined) return 'standard';
      if (score < 40) return 'foundation';
      if (score < 75) return 'standard';
      return 'mastery';
    }

    // ── Resolve the best video URL for a topic + tier ───────────
    function resolveVideo(topic, tier = 'standard') {
      if (!topic?.videos) {
        // Fallback to legacy driveId or youtubeId
        if (topic.driveId) {
          return {
            embedUrl: `https://drive.google.com/file/d/${topic.driveId}/preview`,
            type: 'drive', servedTier: tier, isFallback: true
          };
        }
        if (topic.youtubeId) {
          return {
            embedUrl: `https://www.youtube.com/embed/${topic.youtubeId}`,
            type: 'youtube', servedTier: tier, isFallback: true
          };
        }        return { embedUrl: '', type: null, servedTier: tier };
      }

      // Try exact tier first, then fallback chain
      const priority = [tier, 'standard', 'foundation', 'mastery'];
      for (const tryTier of priority) {
        const video = topic.videos[tryTier];
        if (video?.url) {
          return {
            embedUrl: video.url,
            type: video.url.includes('youtube') ? 'youtube' :
                  video.url.includes('drive.google') ? 'drive' : 'external',
            servedTier: tryTier,
            isFallback: tryTier !== tier
          };
        }
      }
      return { embedUrl: '', type: null, servedTier: tier };
    }

    // ── Merge sheet topics into TOPIC_BLUEPRINT ─────────────────
    function mergeWithBlueprint(sheetTopics) {
      if (!window.TOPIC_BLUEPRINT) return 0;

      let mergedCount = 0;
      for (const [id, sheetTopic] of Object.entries(sheetTopics)) {
        const existing = window.TOPIC_BLUEPRINT[id];
        if (existing) {
          // Merge: sheet data overrides blueprint for videos/blurb/formulas
          window.TOPIC_BLUEPRINT[id] = {
            ...existing,
            ...sheetTopic,
            videos: sheetTopic.videos || existing.videos,
            formulas: sheetTopic.formulas.length ? sheetTopic.formulas : existing.formulas
          };
          mergedCount++;
        } else {
          // Add new topic from sheet
          window.TOPIC_BLUEPRINT[id] = sheetTopic;
          mergedCount++;
        }
      }
      console.log(`[GDRIVE] Merged ${mergedCount} topics into TOPIC_BLUEPRINT`);
      return mergedCount;
    }

    // ── Public API ──────────────────────────────────────────────
    return {
      async init() {
        // Cache check        const now = Date.now();
        if (loaded && now - lastFetch < CACHE_MIN * 60 * 1000) {
          console.log('[GDRIVE] Using cached curriculum');
          window.GDRIVE_CURRICULUM = this;
          return true;
        }

        // Fetch Mathematics sheet (default)
        const mathTopics = await fetchSheet(UE_CONFIG.CURRICULUM_SHEET_CSV_URL, 'mathematics');

        // Fetch English sheet if configured
        const englishTopics = UE_CONFIG.CURRICULUM_SHEET_ENGLISH_CSV_URL
          ? await fetchSheet(UE_CONFIG.CURRICULUM_SHEET_ENGLISH_CSV_URL, 'english')
          : {};

        // Merge all sheets
        const allTopics = { ...mathTopics, ...englishTopics };
        Object.assign(topics, allTopics);
        mergeWithBlueprint(allTopics);

        loaded = true;
        lastFetch = now;

        // Expose globally
        window.GDRIVE_CURRICULUM = this;
        console.log('[GDRIVE] Initialization complete');
        return true;
      },

      getTopic: (id) => {
        const key = id?.toLowerCase?.();
        return topics[key] || topics[id] || null;
      },

      getAllTopics: () => ({ ...topics }),

      masteryToTier,
      resolveVideo,
      isLoaded: () => loaded,

      refresh: async () => {
        lastFetch = 0;
        loaded = false;
        return this.init();
      }
    };
  })();

  // Auto-init if config exists and DOM is ready
  if (window.UE_CONFIG?.CURRICULUM_SHEET_CSV_URL) {    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => GDRIVE_CURRICULUM.init());
    } else {
      GDRIVE_CURRICULUM.init();
    }
  }

  // Expose for manual use/testing
  window.GDRIVE_CURRICULUM_INIT = GDRIVE_CURRICULUM;
})();