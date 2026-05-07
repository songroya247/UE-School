/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gdrive-video.js
   ───────────────────────────────────────────────────────────────────
   ⚠️  CRITICAL PATH — PART OF THE GSHEETS → VIDEO RENDERING PIPELINE
   ───────────────────────────────────────────────────────────────────

   PURPOSE
   ───────
   This module is a PURE UTILITY used by two other critical-path
   modules:

     1. gsheet-curriculum.js  — calls GDRIVE_VIDEO.embedUrl() when
        normalising raw Drive URLs parsed from the Google Sheet CSV.
        Every video URL stored in TOPIC_BLUEPRINT passes through here.

     2. classroom.js (renderLesson / getVideoUrl) — calls
        GDRIVE_VIDEO.embedUrl() as a fallback when a topic has a
        `driveUrl` string but no `driveId`.

   It must be loaded BEFORE both of those files.  The load order in
   classroom.html is:

       gsheet-curriculum.js   ← uses GDRIVE_VIDEO.embedUrl()
       gdrive-video.js        ← THIS FILE — must precede classroom.js
       classroom.js           ← uses GDRIVE_VIDEO.embedUrl() in renderLesson

   ───────────────────────────────────────────────────────────────────
   ⛔  DO NOT MODIFY THIS FILE WITHOUT READING THE FULL PIPELINE NOTES
   ───────────────────────────────────────────────────────────────────

   WHAT THIS FILE DOES (and what it deliberately does NOT do)
   ──────────────────────────────────────────────────────────
   • It accepts ANY of the 4 URL formats Google hands out for Drive
     files and converts them to the single `/preview` embed format
     that the <iframe> inside classroom.js requires.
   • It does NOT fetch, stream, or cache video data.
   • It does NOT communicate with Supabase or Google Sheets.
   • It does NOT depend on any other UE School JS module.
   • It exposes only THREE public methods (extractId, embedUrl,
     imageUrl); the rest of the app only ever calls embedUrl().

   ADDING A NEW VIDEO SOURCE FORMAT
   ─────────────────────────────────
   If Google changes their URL format, add a new regex branch to
   extractId() only.  Do not change embedUrl() — the /preview endpoint
   format has been stable for years and is the required embed target.

   USAGE (from classroom.js / gsheet-curriculum.js)
   ─────────────────────────────────────────────────
     GDRIVE_VIDEO.embedUrl('1AbCdEfGhIjKlMnOpQrStUvWxYz')
     // → 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview'

     GDRIVE_VIDEO.embedUrl('https://drive.google.com/file/d/FILE_ID/view?usp=sharing')
     // → 'https://drive.google.com/file/d/FILE_ID/preview'

     GDRIVE_VIDEO.imageUrl('FILE_ID')
     // → 'https://drive.google.com/uc?export=view&id=FILE_ID'
       (used for thumbnail images, NOT video embeds)
═══════════════════════════════════════════════════════════════════ */

window.GDRIVE_VIDEO = (function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
     extractId(input) — INTERNAL HELPER
     ─────────────────────────────────────────────────────────────────
     Accepts any of the four URL formats Google produces for Drive
     files and returns the raw alphanumeric File ID string.

     Supported input formats:
       A) Bare file ID string, e.g.:
            '1AbCdEfGhIjKlMnOpQrStUvWxYz'
          → Detected by absence of '/', '?', '=' characters.
          → Returned as-is.

       B) File path URL, e.g.:
            'https://drive.google.com/file/d/FILE_ID/view?usp=sharing'
            'https://drive.google.com/file/d/FILE_ID/preview'
          → Captured by the /file/d/(ID) regex (branch 1).

       C) Query-param URL, e.g.:
            'https://drive.google.com/open?id=FILE_ID'
            'https://drive.google.com/uc?id=FILE_ID&export=download'
          → Captured by the [?&]id=(ID) regex (branch 2).

       D) Ambiguous long string (last resort), e.g.:
            any URL not matching A/B/C but containing a 25+ char token
          → Captured by the generic long-token regex (branch 3).
            Use only as a fallback — may produce false positives.

     ⚠️  This function is ONLY called by embedUrl() and imageUrl()
         inside this module.  No external code should call it directly.

     Returns: string — the raw file ID, or '' if nothing matched.
  ───────────────────────────────────────────────────────────────────── */
  function extractId(input) {
    if (!input) return '';
    const s = String(input).trim();

    // Branch A — bare file ID: no slashes, question marks, or equals
    // signs means this is already the raw ID; skip all regex work.
    if (!s.includes('/') && !s.includes('?') && !s.includes('=')) return s;

    // Branch B — /file/d/FILE_ID/... path format (most common share URL)
    let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];

    // Branch C — ?id=FILE_ID or &id=FILE_ID query-param format
    m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];

    // Branch D — last-resort: grab first token ≥25 chars (loose match)
    m = s.match(/([a-zA-Z0-9_-]{25,})/);
    return m ? m[1] : '';
  }

  /* ─────────────────────────────────────────────────────────────────
     embedUrl(input) — PRIMARY PUBLIC METHOD  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     Converts any supported Drive file reference into the canonical
     /preview embed URL required by the classroom.js <iframe> player.

     Called from:
       • gsheet-curriculum.js → normaliseVideoUrl()  (during CSV parse)
       • classroom.js → getVideoUrl()  (inside renderLesson, at runtime)

     The /preview endpoint is the ONLY iframe-compatible embed format
     Google Drive exposes without OAuth.  Do not change the URL
     template below — alternatives (/view, /edit, /uc) will either
     redirect or refuse to embed inside iframes.

     Returns: string — full embeddable URL, or '' if input is empty/invalid.
  ───────────────────────────────────────────────────────────────────── */
  function embedUrl(input) {
    const id = extractId(input);
    // Deliberately returns '' (not null/undefined) so callers can do
    // a simple falsy check: `if (rawUrl) { ... }`
    return id ? `https://drive.google.com/file/d/${id}/preview` : '';
  }

  /* ─────────────────────────────────────────────────────────────────
     imageUrl(input) — SECONDARY PUBLIC METHOD (thumbnails only)
     ─────────────────────────────────────────────────────────────────
     Returns the direct-view URL for a Drive file used as an image
     or thumbnail asset.  NOT used for video embeds.

     The /uc?export=view endpoint serves the raw file bytes directly,
     suitable for <img src="...">.  This is different from the /preview
     embed used for video iframes.

     Returns: string — direct image URL, or the original input string
              as a fallback (allows plain https:// image URLs to pass
              through unchanged).
  ───────────────────────────────────────────────────────────────────── */
  function imageUrl(input) {
    const id = extractId(input);
    return id ? `https://drive.google.com/uc?export=view&id=${id}` : input || '';
  }

  /* ─────────────────────────────────────────────────────────────────
     Public API surface — intentionally minimal.

     extractId  — exposed only for diagnostic/testing convenience.
                  Not required by any other production module.
     embedUrl   — ★ The only method other modules MUST call.
     imageUrl   — Used for thumbnail rendering, NOT video embeds.
  ───────────────────────────────────────────────────────────────────── */
  return { extractId, embedUrl, imageUrl };
})();
