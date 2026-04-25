/* ── UE School — Shared JS ── */

// Toast notification
function toast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// Slider factory
function initSlider(trackId, prevBtnId, nextBtnId) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);

  let pos = 0;
  let isDragging = false, startX = 0, startPos = 0;
  let autoTimer;

  function getSlideWidth() {
    const slide = track.querySelector('.feature-slide, .dash-subj-slide, .subj-slide');
    if (!slide) return 296;
    return slide.offsetWidth + 16;
  }

  function maxPos() {
    return Math.max(0, track.scrollWidth - track.parentElement.offsetWidth);
  }

  function moveTo(p) {
    pos = Math.max(0, Math.min(p, maxPos()));
    track.style.transform = `translateX(-${pos}px)`;
  }

  function next() { moveTo(pos + getSlideWidth()); }
  function prev() { moveTo(pos - getSlideWidth()); }

  if (nextBtn) nextBtn.addEventListener('click', () => { next(); resetAuto(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); resetAuto(); });

  // Drag-to-scroll
  track.addEventListener('mousedown', e => {
    isDragging = true; startX = e.pageX; startPos = pos;
    track.style.transition = 'none';
    track.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    moveTo(startPos - (e.pageX - startX));
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    track.style.transition = '';
    track.style.cursor = '';
  });

  // Touch
  track.addEventListener('touchstart', e => { startX = e.touches[0].pageX; startPos = pos; track.style.transition = 'none'; }, { passive: true });
  track.addEventListener('touchmove', e => { moveTo(startPos - (e.touches[0].pageX - startX)); }, { passive: true });
  track.addEventListener('touchend', () => { track.style.transition = ''; });

  // Auto-scroll
  function startAuto() {
    autoTimer = setInterval(() => {
      if (pos >= maxPos()) { moveTo(0); } else { next(); }
    }, 3500);
  }
  function resetAuto() {
    clearInterval(autoTimer);
    startAuto();
  }

  track.parentElement.addEventListener('mouseenter', () => clearInterval(autoTimer));
  track.parentElement.addEventListener('mouseleave', startAuto);
  startAuto();

  return { next, prev, moveTo };
}

// Nav active state
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
});
