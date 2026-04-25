/* ═══════════════════════════════════════════════════════════════════
   UE School — js/quotes.js
   Auto-rotating motivational quote ribbon for the dashboard.
   - 100% client-side, zero network calls.
   - Picks a random starting quote, then advances every ROTATE_MS.
   - Crossfades smoothly. Pauses on hover. Respects prefers-reduced-motion.
   - Mounts into #ue-quote-ribbon if present. Silent no-op otherwise,
     so loading this file on any page is harmless.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ROTATE_MS = 12000;          // 12 s between quotes
  var FADE_MS   = 600;

  var QUOTES = [
    { t: 'Success is the sum of small efforts repeated day in and day out.',                     a: 'Robert Collier' },
    { t: 'The expert in anything was once a beginner.',                                          a: 'Helen Hayes' },
    { t: 'You don\u2019t have to be great to start, but you have to start to be great.',           a: 'Zig Ziglar' },
    { t: 'Discipline is choosing between what you want now and what you want most.',             a: 'Abraham Lincoln' },
    { t: 'Don\u2019t watch the clock; do what it does. Keep going.',                                a: 'Sam Levenson' },
    { t: 'A river cuts through rock not because of its power, but because of its persistence.',  a: 'James N. Watkins' },
    { t: 'It always seems impossible until it\u2019s done.',                                       a: 'Nelson Mandela' },
    { t: 'Believe you can and you\u2019re halfway there.',                                         a: 'Theodore Roosevelt' },
    { t: 'The future depends on what you do today.',                                             a: 'Mahatma Gandhi' },
    { t: 'Quality is not an act, it is a habit.',                                                a: 'Aristotle' },
    { t: 'Practice isn\u2019t the thing you do once you\u2019re good. It\u2019s the thing you do that makes you good.', a: 'Malcolm Gladwell' },
    { t: 'The secret of getting ahead is getting started.',                                      a: 'Mark Twain' },
    { t: 'Education is the most powerful weapon which you can use to change the world.',         a: 'Nelson Mandela' },
    { t: 'Hard work beats talent when talent doesn\u2019t work hard.',                             a: 'Tim Notke' },
    { t: 'I have not failed. I\u2019ve just found 10,000 ways that won\u2019t work.',                a: 'Thomas Edison' },
    { t: 'Strive for progress, not perfection.',                                                 a: 'Anonymous' },
    { t: 'Push yourself, because no one else is going to do it for you.',                        a: 'Anonymous' },
    { t: 'Great things never come from comfort zones.',                                          a: 'Anonymous' },
    { t: 'Dream big. Start small. Act now.',                                                     a: 'Robin Sharma' },
    { t: 'Knowledge is power. Information is liberating.',                                       a: 'Kofi Annan' },
    { t: 'You will never always be motivated, so you must learn to be disciplined.',             a: 'Anonymous' },
    { t: 'Small daily improvements are the key to staggering long-term results.',                a: 'Anonymous' },
    { t: 'Focus on being productive instead of busy.',                                           a: 'Tim Ferriss' },
    { t: 'A goal without a plan is just a wish.',                                                a: 'Antoine de Saint-Exup\u00E9ry' },
    { t: 'Don\u2019t be afraid to give up the good to go for the great.',                          a: 'John D. Rockefeller' },
    { t: 'Energy and persistence conquer all things.',                                           a: 'Benjamin Franklin' },
    { t: 'Your only limit is your mind.',                                                        a: 'Anonymous' },
    { t: 'When you feel like quitting, think about why you started.',                            a: 'Anonymous' },
    { t: 'A little progress each day adds up to big results.',                                   a: 'Satya Nani' },
    { t: 'The mind is everything. What you think you become.',                                   a: 'Buddha' },
    { t: 'Sweat in study, less blood in exam.',                                                  a: 'Anonymous' },
    { t: 'The harder you work for something, the greater you\u2019ll feel when you achieve it.',  a: 'Anonymous' },
    { t: 'Stay focused, go after your dreams and keep moving toward your goals.',                a: 'LL Cool J' },
    { t: 'Don\u2019t let what you cannot do interfere with what you can do.',                      a: 'John Wooden' },
    { t: 'Success is no accident. It is hard work, perseverance, learning, studying, sacrifice and most of all, love of what you are doing.', a: 'Pel\u00E9' },
    { t: 'You are never too old to set another goal or to dream a new dream.',                   a: 'C.S. Lewis' },
    { t: 'The beautiful thing about learning is that nobody can take it away from you.',         a: 'B.B. King' },
    { t: 'If you can dream it, you can do it.',                                                  a: 'Walt Disney' },
    { t: 'Your education is a dress rehearsal for a life that is yours to lead.',                a: 'Nora Ephron' },
    { t: 'Do something today that your future self will thank you for.',                         a: 'Sean Patrick Flanery' }
  ];

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var ribbon = document.getElementById('ue-quote-ribbon');
    if (!ribbon) return;   // no widget on this page

    var quoteEl  = ribbon.querySelector('[data-ue-quote-text]');
    var authorEl = ribbon.querySelector('[data-ue-quote-author]');
    if (!quoteEl || !authorEl) return;

    var prefersReduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Random starting position so two open tabs don\u2019t show the same quote
    var idx = Math.floor(Math.random() * QUOTES.length);

    function paint(q) {
      quoteEl.textContent  = '\u201C' + q.t + '\u201D';
      authorEl.textContent = '\u2014 ' + q.a;
    }

    function render() {
      var q = QUOTES[idx % QUOTES.length];
      if (prefersReduce) {
        paint(q);
        return;
      }
      ribbon.classList.add('is-fading');
      setTimeout(function () {
        paint(q);
        ribbon.classList.remove('is-fading');
      }, FADE_MS);
    }

    function next() {
      idx = (idx + 1) % QUOTES.length;
      render();
    }

    // Initial paint (immediate, no fade)
    paint(QUOTES[idx]);

    // Pause on hover so the user can finish reading
    var paused = false;
    ribbon.addEventListener('mouseenter', function () { paused = true;  });
    ribbon.addEventListener('mouseleave', function () { paused = false; });

    var timer = setInterval(function () {
      if (!paused && !document.hidden) next();
    }, ROTATE_MS);

    // Allow manual cycling on click
    ribbon.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;  // don\u2019t hijack inner controls
      next();
    });

    // Clean up if the tab is being unloaded
    window.addEventListener('beforeunload', function () { clearInterval(timer); });
  });
})();
