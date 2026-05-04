/* ═══════════════════════════════════════════════════════════════════
   UE School — js/gdrive-video.js
   Tiny helper that turns a Google Drive file ID (or a full Drive
   share URL) into the embeddable preview URL the <iframe> wants.

   USAGE:
     <iframe src="${GDRIVE_VIDEO.embedUrl('FILE_ID_OR_URL')}"
             allow="autoplay" allowfullscreen></iframe>

   Drop a `driveId: 'FILE_ID'` (or `driveUrl: 'https://...'`) on any
   topic in classroom.js — the existing player picks it up.
═══════════════════════════════════════════════════════════════════ */

window.GDRIVE_VIDEO = (function () {
  'use strict';

  // Pull a Google Drive file ID out of any of the formats Google
  // hands out:
  //   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  //   https://drive.google.com/open?id=FILE_ID
  //   https://drive.google.com/uc?id=FILE_ID&export=download
  //   FILE_ID
  function extractId(input) {
    if (!input) return '';
    const s = String(input).trim();
    if (!s.includes('/') && !s.includes('?') && !s.includes('=')) return s;
    let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    m = s.match(/([a-zA-Z0-9_-]{25,})/);
    return m ? m[1] : '';
  }

  function embedUrl(input) {
    const id = extractId(input);
    return id ? `https://drive.google.com/file/d/${id}/preview` : '';
  }

  // Direct image / asset URL (works for thumbnails too)
  function imageUrl(input) {
    const id = extractId(input);
    return id ? `https://drive.google.com/uc?export=view&id=${id}` : input || '';
  }

  return { extractId, embedUrl, imageUrl };
})();
