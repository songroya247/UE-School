/* ═══════════════════════════════════════════════════════════════════
   UE School — js/classroom.js  —  Classroom Engine
   ───────────────────────────────────────────────────────────────────
   ⚠️  CRITICAL PATH — CORE OF THE GSHEETS → VIDEO RENDERING PIPELINE
   ───────────────────────────────────────────────────────────────────

   ROLE IN THE PIPELINE
   ────────────────────
   This file is the FINAL CONSUMER of all data prepared by the
   Google Sheets pipeline.  It owns:
     • The hardcoded CURRICULUM (fallback content for every subject)
     • mergeSheetIntoCurriculum() — ingests TOPIC_BLUEPRINT entries
       (written by gsheet-curriculum.js) into CURRICULUM at runtime
     • renderLesson() — picks the right video URL from topic.videos
       and injects it into the <iframe> in the #video-area element
     • The full UI: tabs, sidebar, lesson panel, quiz, navigation

   FULL PIPELINE IN EXECUTION ORDER
   ─────────────────────────────────
   classroom.html loads scripts in this order (script tags, body end):

     1. supabase.min.js        (CDN)
     2. auth.js                → window.sb (Supabase client)
     3. auth-guard.js          → AUTH_GUARD (session + premium check)
     4. storage.js             → adaptive storage (Skill Chamber dep)
     5. skill_questions.js     → Skill Chamber question bank
     6. curriculum.js          → TOPIC_BLUEPRINT base (hardcoded)
     7. intervention_modal.js  → diagnostic modal UI
     8. gsheet-curriculum.js   → GSHEET_CURRICULUM loader
     9. gdrive-video.js        → GDRIVE_VIDEO.embedUrl() helper
    10. classroom.js           ← THIS FILE (registers CLASSROOM global)
    11. skill_chamber.js       → monkey-patches CLASSROOM.loadTopic

   Then the inline DOMContentLoaded script runs:

     A. await AUTH_GUARD.init()           (auth check / redirect)
     B. await GSHEET_CURRICULUM.init()    (fetch + parse CSV sheets)
     C. mergeSheetIntoCurriculum()        (inline — mirrors step inside CLASSROOM.init)
     D. window._ueProfile = authData.profile  (student name for watermark)
     E. await CLASSROOM.init()            (renders sidebar + first topic)
     F. IntersectionObserver setup        (floating video behaviour)

   ───────────────────────────────────────────────────────────────────
   ⛔  DO NOT MODIFY THIS FILE WITHOUT READING THE FULL PIPELINE NOTES
   ───────────────────────────────────────────────────────────────────

   WHAT THIS FILE OWNS (do not move these responsibilities elsewhere)
   ──────────────────────────────────────────────────────────────────
   • CURRICULUM constant  — the hardcoded topic tree (fallback data)
   • mergeSheetIntoCurriculum()  — TOPIC_BLUEPRINT → CURRICULUM merge
   • init()  — auth, sheet load, tab render, first topic selection
   • renderLesson()  — video URL resolution and iframe injection
   • injectIframe()  — DOM manipulation for the video player
   • getVideoUrl()  — tier-aware video URL picker with fallback chain
   • Free-tier sample tracking  — localStorage + AUTH_GUARD.canSampleFeature
   • Supabase topic_mastery upsert  — study progress tracking

   WHAT THIS FILE DOES NOT OWN (do not add these here)
   ──────────────────────────────────────────────────────
   • Fetching Google Sheets CSV data         → gsheet-curriculum.js
   • Converting Drive URLs to /preview       → gdrive-video.js
   • Config constants (URLs, limits)         → config.js (UE_CONFIG)
   • Auth session management                 → auth.js + auth-guard.js
   • Supabase client initialisation          → supabase.js + auth.js
   • Skill Chamber adaptive routing          → skill_chamber.js

   KEY DATA CONTRACT (between gsheet-curriculum.js and this file)
   ─────────────────────────────────────────────────────────────────
   After GSHEET_CURRICULUM.init() resolves, window.TOPIC_BLUEPRINT
   contains entries shaped like:
     {
       id:         'mathematics.quadratics',
       subject:    'mathematics',
       title:      'Quadratic Equations',
       duration:   '14 mins',
       _source:    'gsheet',          ← mergeSheetIntoCurriculum() filters on this
       videos: {
         standard:   { url, duration, tagline },
         foundation: { url, duration, tagline },
         mastery:    { url, duration, tagline },
       },
       blurb:      'One-sentence intro',
       objectives: ['point 1', 'point 2'],
       formulas:   ['formula string'],
     }

   After mergeSheetIntoCurriculum(), CURRICULUM['mathematics'].topics
   contains classroomTopic objects shaped like:
     {
       id, title, duration, premium: false,
       videos: { standard, foundation, mastery },  ← read by getVideoUrl()
       content: { intro, points, formulas },        ← rendered in lesson panel
       quiz: [],
     }
═══════════════════════════════════════════════════════════════════ */

window.CLASSROOM = (function () {

  // ─── Curriculum ───────────────────────────────────
  // Each topic has: id, title, duration, premium, youtubeId (optional),
  // content (key points), formulas (optional), quiz questions
  const CURRICULUM = {
    mathematics: {
      label: 'Mathematics', icon: '&#x1F4D0;', color: '#3b82f6',
      topics: [
        {
          id: 'mathematics.Number Bases', title: 'Number Bases', duration: '12:30', premium: false,
          content: {
            intro: 'Number bases are systems for representing numbers using a fixed number of digits. The decimal system (base 10) is most familiar, but binary (base 2), octal (base 8), and hexadecimal (base 16) are widely used in mathematics and computing.',
            points: [
              'In base 10, the digits are 0–9. In base 2, only 0 and 1 are used.',
              'To convert from base 10 to another base, repeatedly divide by the base and record remainders.',
              'To convert to base 10, multiply each digit by the base raised to its position power.',
              'Addition and subtraction can be performed directly in any base without converting first.'
            ],
            formulas: [
              { label: 'Base 10 \u2192 Base n', formula: 'Divide by n, read remainders upward' },
              { label: 'Base n \u2192 Base 10', formula: 'Σ (digit × nᵖᵒˢⁱᵗⁱᵒⁿ)' }
            ]
          },
          quiz: [
            { q: 'Convert 13 (base 10) to base 2', opts: ['1100', '1101', '1010', '1111'], ans: 1 },
            { q: 'What is 1011₂ in base 10?', opts: ['9', '10', '11', '12'], ans: 2 },
            { q: 'Convert 255 (base 10) to base 16', opts: ['EF', 'FF', 'FE', 'F0'], ans: 1 }
          ]
        },
        {
          id: 'mathematics.Indices', title: 'Indices', duration: '15:24', premium: false,
          content: {
            intro: 'Indices (or powers) provide a convenient way of writing numbers multiplied by themselves. Mastering the laws of indices is essential for JAMB and WAEC mathematics.',
            points: [
              'Any number raised to the power of 0 equals 1 (except 0 itself).',
              'When multiplying numbers with the same base, add the indices: aᵐ × aⁿ = aᵐ⁺ⁿ.',
              'When dividing numbers with the same base, subtract the indices: aᵐ ÷ aⁿ = aᵐ⁻ⁿ.',
              'A negative index means the reciprocal: a⁻ⁿ = 1/aⁿ.'
            ],
            formulas: [
              { label: 'Multiplication', formula: 'aᵐ × aⁿ = aᵐ⁺ⁿ' },
              { label: 'Division', formula: 'aᵐ ÷ aⁿ = aᵐ⁻ⁿ' },
              { label: 'Power of power', formula: '(aᵐ)ⁿ = aᵐˣⁿ' },
              { label: 'Negative index', formula: 'a⁻ⁿ = 1/aⁿ' }
            ]
          },
          quiz: [
            { q: 'Simplify: (2x²)³', opts: ['6x⁵', '8x⁵', '6x⁶', '8x⁶'], ans: 3 },
            { q: 'Evaluate: 3⁰ + 4⁻¹', opts: ['1', '1.25', '2', '0.25'], ans: 1 },
            { q: 'If 2ˣ = 32, find x', opts: ['4', '5', '6', '3'], ans: 1 }
          ]
        },
        {
          id: 'mathematics.Logarithms', title: 'Logarithms', duration: '18:10', premium: false,
          content: {
            intro: 'Logarithms are the inverse of exponentiation. If aˣ = N, then logₐN = x. They simplify multiplication of large numbers into addition.',
            points: [
              'log(AB) = log A + log B — multiplication becomes addition.',
              'log(A/B) = log A − log B — division becomes subtraction.',
              'log(Aⁿ) = n·log A — powers become multiplication.',
              'log₁₀ is called the common logarithm; logₑ is the natural logarithm (ln).'
            ],
            formulas: [
              { label: 'Product rule', formula: 'log(AB) = logA + logB' },
              { label: 'Quotient rule', formula: 'log(A/B) = logA − logB' },
              { label: 'Power rule', formula: 'log(Aⁿ) = n·logA' },
              { label: 'Change of base', formula: 'logₐB = logB / logA' }
            ]
          },
          quiz: [
            { q: 'Evaluate log₂ 64', opts: ['4', '5', '6', '7'], ans: 2 },
            { q: 'Simplify log 6 + log 5 − log 3', opts: ['log 10', 'log 28', 'log 8', 'log 2'], ans: 0 },
            { q: 'If log 2 = 0.3010, find log 8', opts: ['0.6020', '0.9030', '1.2040', '0.4515'], ans: 1 }
          ]
        },
        {
          id: 'mathematics.Quadratics', title: 'Quadratic Equations', duration: '20:15', premium: false,
          content: {
            intro: 'A quadratic equation is any equation of the form ax² + bx + c = 0. They are solved by factoring, completing the square, or using the quadratic formula.',
            points: [
              'Factoring works when the equation factors cleanly into (x−p)(x−q) = 0.',
              'The quadratic formula x = (−b ± √(b²−4ac)) / 2a works for all quadratics.',
              'The discriminant (b²−4ac) tells you the nature of roots: positive = 2 real roots, zero = 1 repeated root, negative = no real roots.',
              'Sum of roots = −b/a; Product of roots = c/a.'
            ],
            formulas: [
              { label: 'Quadratic formula', formula: 'x = (−b ± √(b²−4ac)) / 2a' },
              { label: 'Sum of roots', formula: 'α + β = −b/a' },
              { label: 'Product of roots', formula: 'αβ = c/a' },
              { label: 'Discriminant', formula: 'Δ = b² − 4ac' }
            ]
          },
          quiz: [
            { q: 'Solve x² − 5x + 6 = 0', opts: ['x=2 or x=3', 'x=−2 or x=3', 'x=1 or x=6', 'x=−2 or x=−3'], ans: 0 },
            { q: 'Sum of roots of 3x² − 9x + 4 = 0 is', opts: ['3', '9', '4/3', '−3'], ans: 0 },
            { q: 'The discriminant of x² + 2x + 5 = 0 is', opts: ['−16', '16', '24', '−24'], ans: 0 }
          ]
        },
        {
          id: 'mathematics.Probability', title: 'Probability', duration: '16:45', premium: true,
          content: {
            intro: 'Probability measures the likelihood of an event occurring, expressed as a number between 0 (impossible) and 1 (certain).',
            points: [
              'P(event) = (Number of favourable outcomes) / (Total possible outcomes).',
              'P(A or B) = P(A) + P(B) − P(A and B) for any two events.',
              'P(A and B) = P(A) × P(B) only when A and B are independent.',
              'The complementary event: P(not A) = 1 − P(A).'
            ],
            formulas: [
              { label: 'Basic probability', formula: 'P(E) = n(E) / n(S)' },
              { label: 'Addition rule', formula: 'P(A∪B) = P(A)+P(B)−P(A∩B)' },
              { label: 'Multiplication (independent)', formula: 'P(A∩B) = P(A)×P(B)' },
              { label: 'Complement', formula: 'P(Aʹ) = 1 − P(A)' }
            ]
          },
          quiz: [
            { q: 'A bag has 3 red, 5 blue balls. P(red) =', opts: ['3/8', '5/8', '3/5', '1/3'], ans: 0 },
            { q: 'P(rolling a 6 on a fair die) is', opts: ['1/2', '1/3', '1/6', '1/4'], ans: 2 },
            { q: 'P(A)=0.4, P(B)=0.3, independent. P(A∩B) =', opts: ['0.7', '0.12', '0.1', '0.4'], ans: 1 }
          ]
        },
        {
          id: 'mathematics.Calculus', title: 'Differentiation', duration: '22:00', premium: true,
          content: {
            intro: 'Differentiation finds the rate of change of a function. It is the foundation of calculus and is heavily tested in WAEC.',
            points: [
              'The derivative of xⁿ is nxⁿ⁻¹ — this is the power rule.',
              'The derivative of a constant is 0.',
              'Sum rule: d/dx [f(x) + g(x)] = f\'(x) + g\'(x).',
              'Set dy/dx = 0 to find turning points (maxima or minima).'
            ],
            formulas: [
              { label: 'Power rule', formula: 'd/dx(xⁿ) = nxⁿ⁻¹' },
              { label: 'Constant', formula: 'd/dx(c) = 0' },
              { label: 'Sum rule', formula: 'd/dx(f+g) = f\'+g\'' },
              { label: 'Turning point', formula: 'Set dy/dx = 0' }
            ]
          },
          quiz: [
            { q: 'Find dy/dx if y = 3x² + 2x − 5', opts: ['6x+2', '3x+2', '6x−5', '6x'], ans: 0 },
            { q: 'Differentiate y = x⁴ − 3x² + 7', opts: ['4x³−6x', '4x³−3x', 'x³−6x', '4x³+6x'], ans: 0 },
            { q: 'At a turning point, dy/dx equals', opts: ['1', '−1', '0', 'undefined'], ans: 2 }
          ]
        }
      ]
    },

    english: {
      label: 'English Language', icon: '&#x1F4D6;', color: '#10b981',
      topics: [
        {
          id: 'english.Comprehension', title: 'Reading Comprehension', duration: '14:00', premium: false,
          content: {
            intro: 'Comprehension tests your ability to understand written passages and answer questions about them. It is the highest-weighted section in WAEC English.',
            points: [
              'Read the questions before reading the passage to know what to look for.',
              'Identify the main idea in each paragraph before tackling the questions.',
              'Vocabulary questions: use context clues from surrounding sentences.',
              'Inference questions: the answer is implied, not directly stated.'
            ],
            formulas: []
          },
          quiz: [
            { q: '"Benevolent" means closest to', opts: ['Generous', 'Cruel', 'Strict', 'Ambitious'], ans: 0 },
            { q: '"Ephemeral" means', opts: ['Short-lived', 'Eternal', 'Enormous', 'Ordinary'], ans: 0 },
            { q: 'The antonym of "diligent" is', opts: ['Lazy', 'Hardworking', 'Clever', 'Smart'], ans: 0 }
          ]
        },
        {
          id: 'english.Lexis & Structure', title: 'Lexis & Structure', duration: '16:30', premium: false,
          content: {
            intro: 'Lexis refers to vocabulary knowledge; Structure covers grammar rules. Together, they form the backbone of the English Language exam.',
            points: [
              'Subject-verb agreement: the verb must agree in number with its subject.',
              'Figures of speech: simile (like/as), metaphor (direct comparison), personification (human traits to objects).',
              'Tense consistency: do not switch tenses within the same paragraph.',
              'Correct pronoun usage: "between you and me" (not "I") because "me" is the object.'
            ],
            formulas: []
          },
          quiz: [
            { q: '"The wind whispered through the trees" is', opts: ['Personification', 'Simile', 'Metaphor', 'Alliteration'], ans: 0 },
            { q: 'Neither the boys nor the girl ___ present.', opts: ['was', 'were', 'are', 'were not'], ans: 0 },
            { q: 'The plural of "phenomenon" is', opts: ['Phenomena', 'Phenomenons', 'Phenomenas', 'Phenomen'], ans: 0 }
          ]
        },
        {
          id: 'english.Essay Writing', title: 'Essay Writing', duration: '18:45', premium: false,
          content: {
            intro: 'Essay writing tests your ability to communicate ideas in a structured, coherent way. WAEC tests narrative, argumentative, descriptive, and formal letter writing.',
            points: [
              'Structure: Introduction, Body (3+ paragraphs), Conclusion.',
              'Formal letters: start with Dear Sir/Madam, end with Yours faithfully.',
              'Personal/informal letters: start with Dear [Name], end with Yours sincerely.',
              'Paragraphing: each paragraph should have one main idea with a topic sentence.'
            ],
            formulas: []
          },
          quiz: [
            { q: 'A formal letter ends with', opts: ['Yours faithfully', 'Yours sincerely', 'Best regards', 'Kind regards'], ans: 0 },
            { q: 'The introduction of an essay should', opts: ['State the main idea and engage the reader', 'List all arguments', 'Summarise the entire essay', 'Give the conclusion first'], ans: 0 },
            { q: 'Each paragraph should begin with a', opts: ['Topic sentence', 'Question', 'Quotation', 'Definition'], ans: 0 }
          ]
        }
      ]
    },

    physics: {
      label: 'Physics', icon: '&#x269B;', color: '#7c3aed',
      topics: [
        {
          id: 'physics.Mechanics', title: 'Mechanics & Motion', duration: '19:20', premium: false,
          content: {
            intro: 'Mechanics is the study of motion and forces. Newton\'s laws of motion and equations of uniformly accelerated motion are core JAMB topics.',
            points: [
              'Newton\'s 1st Law: an object remains at rest or in uniform motion unless acted upon by an external force.',
              'Newton\'s 2nd Law: F = ma — force equals mass times acceleration.',
              'Newton\'s 3rd Law: for every action, there is an equal and opposite reaction.',
              'SUVAT equations describe motion with constant acceleration.'
            ],
            formulas: [
              { label: 'Newton\'s 2nd Law', formula: 'F = ma' },
              { label: 'Velocity', formula: 'v = u + at' },
              { label: 'Distance', formula: 's = ut + ½at²' },
              { label: 'Kinetic Energy', formula: 'KE = ½mv²' }
            ]
          },
          quiz: [
            { q: 'A body accelerates at 4 m/s² from rest. Speed after 5s is', opts: ['20 m/s', '25 m/s', '10 m/s', '15 m/s'], ans: 0 },
            { q: 'KE of a 5kg object moving at 10 m/s is', opts: ['250 J', '500 J', '50 J', '25 J'], ans: 0 },
            { q: 'Newton\'s 1st Law is also called the law of', opts: ['Inertia', 'Momentum', 'Action', 'Acceleration'], ans: 0 }
          ]
        },
        {
          id: 'physics.Electricity', title: 'Electricity & Circuits', duration: '17:55', premium: false,
          content: {
            intro: 'Electricity covers current, voltage, resistance, and circuit analysis. Ohm\'s Law is the cornerstone of all electrical calculations.',
            points: [
              'Ohm\'s Law: V = IR — voltage equals current times resistance.',
              'In series circuits, total resistance = R₁ + R₂ + R₃.',
              'In parallel circuits, 1/R_total = 1/R₁ + 1/R₂.',
              'Power: P = IV = I²R = V²/R.'
            ],
            formulas: [
              { label: 'Ohm\'s Law', formula: 'V = IR' },
              { label: 'Series resistance', formula: 'R = R₁+R₂+R₃' },
              { label: 'Parallel resistance', formula: '1/R = 1/R₁+1/R₂' },
              { label: 'Power', formula: 'P = IV = I²R' }
            ]
          },
          quiz: [
            { q: 'A 12V battery connected to 4Ω gives current', opts: ['3 A', '4 A', '48 A', '8 A'], ans: 0 },
            { q: 'In series circuits, resistance', opts: ['Adds up', 'Decreases', 'Stays same', 'Halves'], ans: 0 },
            { q: 'The unit of electrical power is', opts: ['Watt', 'Joule', 'Ampere', 'Ohm'], ans: 0 }
          ]
        },
        {
          id: 'physics.Waves', title: 'Waves & Sound', duration: '15:10', premium: true,
          content: {
            intro: 'Waves transfer energy without transferring matter. They are classified as transverse (light) or longitudinal (sound).',
            points: [
              'Wave speed v = fλ (frequency × wavelength).',
              'Sound cannot travel in a vacuum; it needs a medium.',
              'The speed of light in a vacuum is approximately 3 × 10⁸ m/s.',
              'Resonance occurs when a system is driven at its natural frequency.'
            ],
            formulas: [
              { label: 'Wave speed', formula: 'v = fλ' },
              { label: 'Speed of light', formula: 'c = 3 × 10⁸ m/s' },
              { label: 'Period', formula: 'T = 1/f' },
              { label: 'Wavelength', formula: 'λ = v/f' }
            ]
          },
          quiz: [
            { q: 'A wave of frequency 50 Hz and wavelength 4m. Speed =', opts: ['200 m/s', '12.5 m/s', '54 m/s', '46 m/s'], ans: 0 },
            { q: 'Which wave does NOT need a medium?', opts: ['Electromagnetic', 'Sound', 'Water', 'Seismic'], ans: 0 },
            { q: 'Speed of light in vacuum is approximately', opts: ['3×10⁸ m/s', '3×10⁶ m/s', '3×10¹⁰ m/s', '3×10⁴ m/s'], ans: 0 }
          ]
        }
      ]
    },

    chemistry: {
      label: 'Chemistry', icon: '&#x1F9EA;', color: '#ff6b35',
      topics: [
        {
          id: 'chemistry.Periodic Table', title: 'The Periodic Table', duration: '16:00', premium: false,
          content: {
            intro: 'The periodic table organises all known elements by atomic number. Elements in the same group share similar chemical properties.',
            points: [
              'Periods are horizontal rows; groups are vertical columns.',
              'Group I (alkali metals) are highly reactive with water.',
              'Group VII (halogens) are highly reactive non-metals.',
              'Noble gases (Group VIII/0) are extremely unreactive.'
            ],
            formulas: [
              { label: 'Atomic number', formula: 'Z = number of protons' },
              { label: 'Mass number', formula: 'A = protons + neutrons' },
              { label: 'Isotopes', formula: 'Same Z, different A' },
              { label: 'Valence electrons', formula: 'Group number (I–VIII)' }
            ]
          },
          quiz: [
            { q: 'Element with atomic number 11 is', opts: ['Sodium', 'Magnesium', 'Potassium', 'Chlorine'], ans: 0 },
            { q: 'Halogens are in Group', opts: ['VII', 'I', 'VI', 'VIII'], ans: 0 },
            { q: 'Noble gases are', opts: ['Extremely unreactive', 'Highly reactive', 'Radioactive', 'Metallic'], ans: 0 }
          ]
        },
        {
          id: 'chemistry.Acids & Bases', title: 'Acids, Bases & Salts', duration: '17:30', premium: false,
          content: {
            intro: 'Acids and bases are opposites on the pH scale. Their reaction — neutralisation — produces a salt and water.',
            points: [
              'Acids have pH < 7; bases have pH > 7; neutral solutions have pH = 7.',
              'Strong acids (HCl, H₂SO₄) fully dissociate; weak acids only partially dissociate.',
              'Neutralisation: acid + base \u2192 salt + water.',
              'Indicators (litmus, phenolphthalein) show whether a solution is acid or base.'
            ],
            formulas: [
              { label: 'Neutralisation', formula: 'Acid + Base \u2192 Salt + H₂O' },
              { label: 'pH scale', formula: 'Acid: <7 | Neutral: 7 | Base: >7' },
              { label: 'HCl dissociation', formula: 'HCl \u2192 H⁺ + Cl⁻' },
              { label: 'NaOH dissociation', formula: 'NaOH \u2192 Na⁺ + OH⁻' }
            ]
          },
          quiz: [
            { q: 'An acid has a pH', opts: ['Less than 7', 'Greater than 7', 'Equal to 7', 'Greater than 14'], ans: 0 },
            { q: 'The reaction between acid and base is called', opts: ['Neutralisation', 'Oxidation', 'Reduction', 'Combustion'], ans: 0 },
            { q: 'HCl in water gives', opts: ['H⁺ and Cl⁻', 'H₂ and Cl₂', 'OH⁻ and Cl⁻', 'H⁺ and OH⁻'], ans: 0 }
          ]
        },
        {
          id: 'chemistry.Organic Chemistry', title: 'Organic Chemistry Basics', duration: '21:10', premium: true,
          content: {
            intro: 'Organic chemistry studies carbon-containing compounds. The main families (homologous series) tested in WAEC are alkanes, alkenes, and alkynes.',
            points: [
              'Alkanes (CₙH₂ₙ₊₂) have only single C–C bonds; they are saturated.',
              'Alkenes (CₙH₂ₙ) contain at least one C=C double bond; they are unsaturated.',
              'Alkynes (CₙH₂ₙ₋₂) contain at least one C≡C triple bond.',
              'Isomers are compounds with the same molecular formula but different structural formulae.'
            ],
            formulas: [
              { label: 'Alkane general formula', formula: 'CₙH₂ₙ₊₂' },
              { label: 'Alkene general formula', formula: 'CₙH₂ₙ' },
              { label: 'Alkyne general formula', formula: 'CₙH₂ₙ₋₂' },
              { label: 'Functional group (alcohol)', formula: '−OH' }
            ]
          },
          quiz: [
            { q: 'The simplest alkane is', opts: ['Methane', 'Ethane', 'Propane', 'Butane'], ans: 0 },
            { q: 'Alkenes are characterised by a', opts: ['Double carbon bond', 'Single bond', 'Triple bond', 'Ionic bond'], ans: 0 },
            { q: 'General formula for alkanes is', opts: ['CₙH₂ₙ₊₂', 'CₙH₂ₙ', 'CₙH₂ₙ₋₂', 'CₙH₄'], ans: 0 }
          ]
        }
      ]
    },

    biology: {
      label: 'Biology', icon: '&#x1F33F;', color: '#0891b2',
      topics: [
        {
          id: 'biology.Cell Biology', title: 'Cell Biology', duration: '18:00', premium: false,
          content: {
            intro: 'The cell is the basic structural and functional unit of all living organisms. Understanding cell structure and processes is essential for JAMB and WAEC Biology.',
            points: [
              'The mitochondria is the powerhouse of the cell — site of aerobic respiration.',
              'The nucleus controls cell activities and contains DNA.',
              'Osmosis is the movement of water from low to high solute concentration across a semi-permeable membrane.',
              'Photosynthesis occurs in chloroplasts: 6CO₂ + 6H₂O + light \u2192 C₆H₁₂O₆ + 6O₂.'
            ],
            formulas: [
              { label: 'Photosynthesis', formula: '6CO₂+6H₂O \u2192 C₆H₁₂O₆+6O₂' },
              { label: 'Aerobic respiration', formula: 'C₆H₁₂O₆+6O₂ \u2192 6CO₂+6H₂O+ATP' },
              { label: 'Osmosis direction', formula: 'Low \u2192 High solute concentration' },
              { label: 'Cell wall composition', formula: 'Cellulose (plants)' }
            ]
          },
          quiz: [
            { q: 'The powerhouse of the cell is the', opts: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body'], ans: 0 },
            { q: 'Osmosis moves water from', opts: ['Low to high solute', 'High to low solute', 'High to low temp', 'Low to high pressure'], ans: 0 },
            { q: 'Photosynthesis occurs in the', opts: ['Chloroplast', 'Mitochondria', 'Nucleus', 'Ribosome'], ans: 0 }
          ]
        }
      ]
    },

    economics: {
      label: 'Economics', icon: '&#x1F4C8;', color: '#f59e0b',
      topics: [
        {
          id: 'economics.Supply & Demand', title: 'Supply & Demand', duration: '16:20', premium: false,
          content: {
            intro: 'Supply and demand are the forces that drive market economies. Understanding these concepts is fundamental to all of economics.',
            points: [
              'Law of demand: as price rises, quantity demanded falls (inverse relationship).',
              'Law of supply: as price rises, quantity supplied rises (direct relationship).',
              'Equilibrium is where supply equals demand — the market-clearing price.',
              'Price elasticity measures how responsive quantity is to a price change.'
            ],
            formulas: [
              { label: 'Price elasticity of demand', formula: 'PED = %ΔQd / %ΔP' },
              { label: 'Elastic demand', formula: 'PED > 1' },
              { label: 'Inelastic demand', formula: 'PED < 1' },
              { label: 'Unit elastic', formula: 'PED = 1' }
            ]
          },
          quiz: [
            { q: 'When price rises and demand falls, this illustrates', opts: ['Law of demand', 'Law of supply', 'Diminishing returns', 'Substitution effect'], ans: 0 },
            { q: 'Equilibrium price is where', opts: ['Supply = Demand', 'Demand > Supply', 'Supply > Demand', 'Price = 0'], ans: 0 },
            { q: 'Price elasticity of demand measures responsiveness to changes in', opts: ['Price', 'Income', 'Supply', 'Tastes'], ans: 0 }
          ]
        }
      ]
    },

    government: {
      label: 'Government', icon: '&#x1F3DB;', color: '#6366f1',
      topics: [
        {
          id: 'government.Constitution', title: 'The Nigerian Constitution', duration: '14:45', premium: false,
          content: {
            intro: 'The constitution is the supreme law of Nigeria. It establishes the three arms of government and guarantees fundamental rights.',
            points: [
              'Nigeria operates a federal system with a presidential constitution.',
              'The 1999 Constitution (as amended) is the current operating constitution.',
              'The three arms: Legislature (makes laws), Executive (implements), Judiciary (interprets).',
              'Fundamental rights include: right to life, dignity, fair hearing, freedom of expression.'
            ],
            formulas: []
          },
          quiz: [
            { q: 'Nigeria\'s current constitution was adopted in', opts: ['1999', '1979', '1963', '1960'], ans: 0 },
            { q: 'The highest court in Nigeria is the', opts: ['Supreme Court', 'Court of Appeal', 'Federal High Court', 'Sharia Court'], ans: 0 },
            { q: 'The upper chamber of Nigeria\'s National Assembly is the', opts: ['Senate', 'House of Reps', 'State Assembly', 'Federal Executive Council'], ans: 0 }
          ]
        }
      ]
    }
  };

  /* ───────────────────────────────────────────────────────────────────
     FREE-TIER SAMPLE TRACKING  ★ CRITICAL PATH ★
     ───────────────────────────────────────────────────────────────────
     Free (registered-but-unpaid) users may watch a limited number of
     distinct video topics — configured in UE_CONFIG.FREE_SAMPLE.
     VIDEOS_PER_ACCOUNT (default: 1).

     HOW IT WORKS:
     ─────────────
     • When a user opens a topic video for the first time, we store its
       topic ID in localStorage under FREE_VIDEOS_KEY.
     • On subsequent visits (or page reloads), we read this list back.
     • topicUnlockedForUser() uses this list + AUTH_GUARD.canSampleFeature()
       to decide whether to let the user in or bounce them to pricing.

     TWO SYSTEMS WORKING TOGETHER:
     ──────────────────────────────
     1. AUTH_GUARD.canSampleFeature('video')  — reads from Supabase (or
        local storage fallback) the QUOTA: how many video samples are
        still available for this account.  Decremented by recordSampleUse().

     2. getWatchedVideoIds() / rememberWatchedVideo()  — local cache of
        WHICH topic IDs have been watched.  A user who has already watched
        topic X can re-watch X without spending a new sample credit.

     WHY BOTH?
     ─────────
     A user might close the browser and return.  The quota in Supabase
     (via AUTH_GUARD) is the authoritative cap.  The local list of watched
     IDs ensures re-opening a previously-viewed topic feels free — without
     having to re-query Supabase for every click.

     ⚠️  FREE_VIDEOS_KEY is a stable localStorage key name.  Changing it
         would reset all existing free-sample state for every user on that
         device.  Do NOT rename this constant.

     ⚠️  This tracking ONLY applies in classroom.js.  The CBT and
         study-guides pages have their own equivalent tracking logic.
         Do not centralise it here without updating those pages too.
  ───────────────────────────────────────────────────────────────────── */

  const FREE_VIDEOS_KEY = 'ue_free_videos_watched'; // ← DO NOT RENAME

  /* getWatchedVideoIds() — returns array of topic IDs already watched
     by this user on this device.  Catches JSON parse errors silently
     (corrupted localStorage) and returns [] as a safe default. */
  function getWatchedVideoIds() {
    try { return JSON.parse(localStorage.getItem(FREE_VIDEOS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  /* rememberWatchedVideo(topicId) — adds topicId to the watched list
     if not already present.  Idempotent; safe to call multiple times.
     Silently suppresses storage errors (private browsing, quota full). */
  function rememberWatchedVideo(topicId) {
    const ids = getWatchedVideoIds();
    if (!ids.includes(topicId)) {
      ids.push(topicId);
      try { localStorage.setItem(FREE_VIDEOS_KEY, JSON.stringify(ids)); } catch (_) {}
    }
  }

  /* ───────────────────────────────────────────────────────────────────
     topicUnlockedForUser(topic)  ★ CRITICAL PATH ★
     ───────────────────────────────────────────────────────────────────
     Central gating function.  Called by:
       • renderSidebar()   — to show lock icon / PRO badge in topic list
       • selectTopic()     — to bounce free users to pricing page
       • nextLesson()      — to skip locked topics in navigation

     Decision logic (in order of precedence):
       1. Premium user → always unlocked (no further checks)
       2. Free user, already watched this topic → unlocked (re-watch free)
       3. Free user, still has sample credits → unlocked (first watch)
       4. Free user, no credits left → locked (returns false → bounce)

     Returns: boolean
  ───────────────────────────────────────────────────────────────────── */
  function topicUnlockedForUser(topic) {
    if (isPremiumUser) return true;
    const watched = getWatchedVideoIds();
    if (watched.includes(topic.id)) return true;      // re-watch: always free
    return AUTH_GUARD.canSampleFeature('video');       // first watch: check quota
  }

  /* ─────────────────────────────────────────────────────────────────
     Module-level state (private — NOT exported)

     currentSubject  — key of the active subject tab ('mathematics' etc)
     currentTopicId  — id of the topic currently rendered in the player
     quizState       — tracks current quiz question index and score
     isPremiumUser   — cached from AUTH_GUARD.isPremium() at init time
     userId          — Supabase user UUID, used for topic_mastery upserts
  ───────────────────────────────────────────────────────────────────── */
  let currentSubject = 'mathematics';
  let currentTopicId = null;
  let quizState      = { idx: 0, questions: [] };
  let isPremiumUser  = false;
  let userId         = null;

  /* ─────────────────────────────────────────────────────────────────
     mergeSheetIntoCurriculum()  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     WHEN CALLED:
       1. By CLASSROOM.init() after GSHEET_CURRICULUM.init() resolves.
       2. By classroom.html DOMContentLoaded inline script (Step C) —
          this second call is intentional redundancy to handle timing
          edge cases where the HTML script runs after DOM load but
          before CLASSROOM.init() is called.

     WHAT IT DOES:
     ─────────────
     Reads window.TOPIC_BLUEPRINT (written by gsheet-curriculum.js)
     and converts each entry with _source='gsheet' into a
     classroomTopic object that matches the CURRICULUM topic shape.
     These objects are then injected into CURRICULUM[subject].topics,
     either replacing an existing hardcoded topic of the same ID or
     being appended as a new topic.

     After this function runs, CURRICULUM is fully populated with
     both hardcoded AND sheet-sourced topics.  Every downstream
     function (renderSidebar, selectTopic, renderLesson) reads from
     CURRICULUM — none of them read from TOPIC_BLUEPRINT directly.

     DATA SHAPE TRANSLATION:
     ────────────────────────
     TOPIC_BLUEPRINT entry (from gsheet-curriculum.js):
       { id, subject, title, duration, videos, blurb, objectives, formulas }

     classroomTopic (the CURRICULUM topic shape):
       {
         id, title, duration,
         premium: false,           ← sheet topics are always free-gated via subscription,
                                      not topic-level premium flag; false = show in sidebar
         videos: topic.videos,     ← { standard, foundation, mastery } — read by getVideoUrl()
         content: {
           intro:    topic.blurb,
           points:   topic.objectives,
           formulas: topic.formulas.map(f => ({ label:'', formula:f }))
                                   ← CURRICULUM expects { label, formula } objects;
                                      sheet stores bare strings; we normalise here
         },
         quiz: [],                 ← sheets don't supply quizzes; left empty
       }

     SHEET WINS:
     ───────────
     If a hardcoded CURRICULUM topic has the same ID as a sheet topic,
     the sheet version REPLACES the hardcoded one.  This lets operators
     update content without touching classroom.js.

     ⚠️  The _source check (`topic._source !== 'gsheet'`) is the guard
         that prevents non-sheet entries in TOPIC_BLUEPRINT from being
         double-processed.  Do NOT remove this check.
  ───────────────────────────────────────────────────────────────────── */
  function mergeSheetIntoCurriculum() {
    const blueprint = window.TOPIC_BLUEPRINT || {};
    let merged = 0;

    for (const topic of Object.values(blueprint)) {
      // Only process entries that came from Google Sheets
      if (topic._source !== 'gsheet') continue;

      const subj = topic.subject;
      if (!subj) continue;

      // Create a new subject bucket if the sheet introduces a subject
      // not present in the hardcoded CURRICULUM (e.g. 'further_maths')
      if (!CURRICULUM[subj]) {
        CURRICULUM[subj] = {
          label:  subj.charAt(0).toUpperCase() + subj.slice(1),
          icon:   '&#x1F4D6;',
          color:  '#6366f1',
          topics: [],
        };
      }

      // Build the classroomTopic object from the TOPIC_BLUEPRINT entry
      // This is the shape that renderSidebar(), selectTopic(), and
      // renderLesson() all expect.
      const classroomTopic = {
        id:       topic.id,
        title:    topic.title,
        duration: topic.duration || '14 mins',
        premium:  false, // sheet topics are always subscription-gated, not topic-level locked
        videos:   topic.videos || null, // { standard, foundation, mastery } — see getVideoUrl()
        content: {
          intro:    topic.blurb || `${topic.title} — lesson loaded from Google Sheets.`,
          points:   topic.objectives || [],
          // CURRICULUM formulas expect { label, formula } objects;
          // sheet formulas are bare strings → normalise with empty label
          formulas: (topic.formulas || []).map(f => ({ label: '', formula: f })),
        },
        quiz: [], // sheets do not supply quiz questions; CBT questions come from a separate sheet
      };

      // Sheet wins: replace hardcoded topic with same ID, or append if new.
      // Use case-insensitive + whitespace/underscore-normalised comparison as a fallback
      // so 'mathematics.number_bases' (curriculum.js) matches 'mathematics.Number Bases'
      // (classroom.js CURRICULUM) and any sheet variation in between.
      const normalise = id => (id || '').toLowerCase().replace(/[\s_]+/g, '');
      const normalisedSheetId = normalise(topic.id);

      let existing = CURRICULUM[subj].topics.findIndex(t => t.id === topic.id);
      if (existing < 0) {
        // Fuzzy fallback: match ignoring case and whitespace differences
        existing = CURRICULUM[subj].topics.findIndex(
          t => normalise(t.id) === normalisedSheetId
        );
        if (existing >= 0) {
          // ID matched fuzzily — adopt the hardcoded ID so sidebar links still work
          classroomTopic.id = CURRICULUM[subj].topics[existing].id;
        }
      }

      if (existing >= 0) {
        CURRICULUM[subj].topics[existing] = classroomTopic; // overwrite hardcoded
      } else {
        CURRICULUM[subj].topics.push(classroomTopic);       // append new
      }
      merged++;
    }

    if (merged > 0) {
      console.info(`[CLASSROOM] Merged ${merged} sheet topics into CURRICULUM.`);
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     init()  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     The main entry point for the classroom page.  Called by the
     classroom.html DOMContentLoaded inline script as Step E (after
     auth, sheet loading, and merging are complete).

     SEQUENCE OF OPERATIONS:
     ────────────────────────
     1. AUTH_GUARD.init() — verify session + load user profile.
        Redirects to login.html if unauthenticated.  Sets isPremiumUser
        and userId for use throughout this module.

     2. Defaulter banner — show/hide the "subscription expired" banner
        based on subscriptionStatus(profile) from auth-guard.js.

     3. GSHEET_CURRICULUM.init() + mergeSheetIntoCurriculum() —
        If the sheet loader is enabled (SUBJECT_SHEET_URLS configured),
        fetch and parse CSV data NOW, then merge into CURRICULUM.
        This must happen BEFORE renderSubjectTabs() so that any
        sheet-introduced subjects appear in the tab bar.

        NOTE: The classroom.html inline script also calls
        GSHEET_CURRICULUM.init() and mergeSheetIntoCurriculum() before
        calling CLASSROOM.init().  That means in most cases the sheet
        data is already in CURRICULUM by the time we reach step 3 here.
        The GSHEET_CURRICULUM.init() call is idempotent (_loaded guard),
        and the mergeSheetIntoCurriculum() call is also safe to run
        twice (replace-or-append logic is idempotent for same IDs).
        So this double-call is intentional and harmless.

     4. renderSubjectTabs() — build the horizontal tab bar from the
        user's registered exam_subjects (from Supabase profile), or all
        subjects if none are registered.

     5. Deep-link handling — parse ?subject= and ?topic= from the URL
        to allow external links to jump directly to a specific lesson.

     6. renderSidebar() — build the topic list for the initial subject
        and auto-select the first unlocked topic (or the URL-specified one).

     ⚠️  Do not reorder steps 3 and 4.  renderSubjectTabs() reads
         CURRICULUM which must be fully merged before tabs are built.
  ───────────────────────────────────────────────────────────────────── */
  async function init() {
    const result = await AUTH_GUARD.init();
    if (!result) return; // unauthenticated — AUTH_GUARD redirected to login.html

    const { profile, session } = result;
    userId        = session?.user?.id;
    isPremiumUser = AUTH_GUARD.isPremium(profile);

    // Show "subscription expired" banner for lapsed subscribers
    const banner = document.getElementById('defaulter-banner');
    if (banner) {
      const status = AUTH_GUARD.subscriptionStatus(profile);
      banner.style.display = status === 'EXPIRED' ? 'block' : 'none';
    }

    /* ── Load Google Sheet curriculum, then render ──────────────────
       This is the SECOND call to GSHEET_CURRICULUM.init() in the page
       lifecycle (the first is in the inline DOMContentLoaded script).
       It is safe because init() is idempotent (_loaded guard).

       This call exists here as a defensive measure: if the HTML inline
       script order ever changes, the classroom still loads sheet data
       correctly because CLASSROOM.init() also ensures the load happens.

       ⚠️  Do NOT remove this block.  Without it, classroom.js would
           silently fall back to hardcoded content if the inline script
           failed or was removed, with no error visible to developers.
    ───────────────────────────────────────────────────────────────── */
    if (window.GSHEET_CURRICULUM && window.GSHEET_CURRICULUM.isEnabled()) {
      await window.GSHEET_CURRICULUM.init();
      mergeSheetIntoCurriculum();
    }

    // Build subject tabs: use the user's registered subjects if available,
    // otherwise show all subjects in CURRICULUM (including sheet-sourced ones)
    const userSubjects = profile?.exam_subjects?.length
      ? profile.exam_subjects.filter(s => CURRICULUM[s])
      : Object.keys(CURRICULUM);

    renderSubjectTabs(userSubjects);

    // Deep-link from URL params
    const params   = new URLSearchParams(window.location.search);
    const urlSubj  = params.get('subject');
    const urlTopic = params.get('topic');

    const startSubject = (urlSubj && CURRICULUM[urlSubj]) ? urlSubj : (userSubjects[0] || 'mathematics');
    currentSubject = startSubject;

    renderSidebar(startSubject, urlTopic);

    // Activate the right subject tab
    document.querySelectorAll('.subject-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.subject === startSubject);
    });
  }

  // ─── Render subject tabs ──────────────────────────
  function renderSubjectTabs(subjects) {
    const container = document.getElementById('subject-tabs');
    if (!container) return;

    container.innerHTML = subjects.map(s => {
      const meta = CURRICULUM[s];
      if (!meta) return '';
      return `<button class="subject-tab" data-subject="${s}"
                onclick="CLASSROOM.switchSubject('${s}', this)">
                ${meta.label}
              </button>`;
    }).join('');
  }

  // ─── Switch subject ───────────────────────────────
  function switchSubject(subjKey, tabEl) {
    if (!CURRICULUM[subjKey]) return;
    currentSubject = subjKey;

    document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');

    renderSidebar(subjKey, null);
  }

  // ─── Render sidebar topic list ────────────────────
  function renderSidebar(subjKey, autoSelectTopic) {
    const subj    = CURRICULUM[subjKey];
    if (!subj) return;

    const headEl = document.getElementById('sidebar-subject-name');
    const countEl = document.getElementById('sidebar-lesson-count');
    if (headEl)  headEl.textContent  = subj.label;
    if (countEl) countEl.textContent = `${subj.topics.length} Lesson${subj.topics.length !== 1 ? 's' : ''}`;

    const list = document.getElementById('topic-list');
    if (!list) return;

    list.innerHTML = subj.topics.map((topic, idx) => {
      const isLocked   = !topicUnlockedForUser(topic);
      const isActive   = topic.id === currentTopicId;

      const icon = isLocked ? '&#x1F512;'
                 : isActive  ? '<span style="color:var(--accent)">▶</span>'
                 :             '<span style="color:var(--muted2)">&#x1F4D6;</span>';

      return `<button class="topic-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}"
                data-topic-id="${topic.id}"
                onclick="CLASSROOM.loadTopic('${topic.id}')">
                ${icon}
                <span class="topic-text">${idx + 1}. ${topic.title}</span>
                ${isLocked ? '<span style="font-size:.7rem;color:var(--muted);margin-left:auto">PRO</span>' : ''}
              </button>`;
    }).join('');

    // Auto-select first unlocked topic or the URL-specified topic
    const firstUnlocked = subj.topics.find(t => topicUnlockedForUser(t));
    let targetId = null;

    if (autoSelectTopic) {
      const match = subj.topics.find(t =>
        t.id.endsWith(autoSelectTopic) || t.title.toLowerCase() === autoSelectTopic.toLowerCase()
      );
      targetId = match ? match.id : (firstUnlocked ? firstUnlocked.id : null);
    } else {
      targetId = firstUnlocked ? firstUnlocked.id : null;
    }

    if (targetId) selectTopic(targetId);
  }

  // ─── Select topic ─────────────────────────────────
  function selectTopic(topicId, tier) {
    // Find topic across all subjects
    let topic = null;
    for (const subj of Object.values(CURRICULUM)) {
      topic = subj.topics.find(t => t.id === topicId);
      if (topic) break;
    }
    if (!topic) return;

    // Free-tier gate: if the user has spent their video sample and
    // is opening a NEW topic, redirect to the pricing page instead
    // of showing an in-page locked state. (Already-watched topics
    // remain available so the sample never feels like a punishment.)
    if (!topicUnlockedForUser(topic)) {
      AUTH_GUARD.bouncePremium(
        'You\'ve used your free video sample. Upgrade to UE Premium to unlock every lesson.'
      );
      return;
    }

    // Spend a free-sample credit the first time we open this topic.
    const watched = getWatchedVideoIds();
    if (!isPremiumUser && !watched.includes(topic.id)) {
      AUTH_GUARD.recordSampleUse('video');
      rememberWatchedVideo(topic.id);
    }

    currentTopicId = topicId;

    // Update sidebar active state
    document.querySelectorAll('.topic-item').forEach(el => {
      el.classList.toggle('active', el.dataset.topicId === topicId);
    });

    renderLesson(topic, tier);

    // Close mobile sidebar
    if (window.innerWidth <= 720) closeSidebar();
  }

  /* ─────────────────────────────────────────────────────────────────
     renderLesson(topic, tier)  ★ CRITICAL PATH ★
     ─────────────────────────────────────────────────────────────────
     The VIDEO RENDERING function.  This is where the Google Sheets
     data ultimately delivers its payload: the video URL is resolved
     from topic.videos (built by gsheet-curriculum.js → buildVideos)
     and injected as an <iframe> into the #video-area element.

     PARAMETERS:
     ───────────
     topic  — classroomTopic object from CURRICULUM (merged from
               TOPIC_BLUEPRINT or hardcoded).  Shape:
               { id, title, duration, videos, youtubeId, driveId,
                 driveUrl, content: { intro, points, formulas }, quiz }

     tier   — optional string: 'foundation' | 'standard' | 'mastery'
               Provided by skill_chamber.js after its adaptive
               diagnostic determines the student's level.
               If undefined, defaults to 'standard' via fallback chain.

     EXECUTION STEPS:
     ────────────────
     1. Set title, tag, and duration badge in the DOM.
     2. Resolve video URL via getVideoUrl() (tier-aware, with fallback).
     3. Determine YouTube vs Google Drive source.
     4. Inject the appropriate <iframe> via injectIframe().
     5. Render lesson text (intro, key points, formula box).
     6. Initialise the quick quiz.
     7. Set the "Practice in CBT" button href.
     8. Upsert topic_mastery row in Supabase (fire-and-forget).

     FALLBACK CHAIN (step 2 above — see getVideoUrl):
     ─────────────────────────────────────────────────
       requested tier → 'standard' → 'foundation' → 'mastery'
       → topic.driveId  (legacy)
       → topic.driveUrl (legacy, via GDRIVE_VIDEO.embedUrl)
       → '' (no video → show animated placeholder)

     ⚠️  renderLesson() reads topic.videos which is set during
         mergeSheetIntoCurriculum() (from gsheet-curriculum.js).
         If you change the `videos` object shape in gsheet-curriculum.js
         you MUST update getVideoUrl() in this function accordingly.
  ───────────────────────────────────────────────────────────────────── */
  function renderLesson(topic, tier) {
    // Title + meta
    setEl('topic-tag',    topic.id.split('.')[1] || topic.title);
    setEl('topic-title',  topic.title);
    { const d = (topic.duration || '').toString().replace(/\s*mins?\s*$/i, '').trim(); setEl('lesson-duration-badge', d ? d + ' mins' : '—'); }

    // Video area — supports YouTube, Google Drive ID, Drive URL, or Sheet video tiers
    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      /* ── getVideoUrl(t, requestedTier) — TIER-AWARE URL RESOLVER  ★ CRITICAL PATH ★
         ─────────────────────────────────────────────────────────────────────────────
         Resolves the video URL to embed for the given topic and requested tier.

         This is the BRIDGE between the Google Sheet data and the iframe player:
           • topic.videos  → built by gsheet-curriculum.js buildVideos()
                             normalised via gdrive-video.js embedUrl()
                             stored in CURRICULUM via mergeSheetIntoCurriculum()
           • Returns       → a /preview or YouTube embed URL string for injectIframe()

         FALLBACK CHAIN (applied when a tier's URL is missing):
         ────────────────────────────────────────────────────────
         1. requestedTier  — the tier skill_chamber.js selected for this student
         2. 'standard'     — the default lesson (most complete)
         3. 'foundation'   — slower walkthrough
         4. 'mastery'      — exam-focused rapid version
         5. topic.driveId  — legacy field (hardcoded in classroom.js CURRICULUM)
         6. topic.driveUrl — legacy field (converted via GDRIVE_VIDEO.embedUrl)
         7. ''             — no video available; caller shows animated placeholder

         DEDUPLICATION:
         The order array is deduplicated with filter+indexOf to prevent the same
         tier from being tried twice (e.g. if requestedTier === 'standard', we
         don't want standard appearing at both positions 0 and 1).

         ⚠️  The tier key names ('foundation', 'standard', 'mastery') must match
             exactly what gsheet-curriculum.js uses in buildVideos().  If you
             rename a tier there, rename it in the order array here too.
         ──────────────────────────────────────────────────────────────────── */
      const getVideoUrl = (t, requestedTier) => {
        if (t.videos) {
          const order = [requestedTier, 'standard', 'foundation', 'mastery']
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i); // dedupe
          for (const t_tier of order) {
            const url = t.videos[t_tier] && t.videos[t_tier].url;
            if (url) return url;
          }
        }
        if (t.driveId) return `https://drive.google.com/file/d/${t.driveId}/preview`;
        if (t.driveUrl && window.GDRIVE_VIDEO) return window.GDRIVE_VIDEO.embedUrl(t.driveUrl);
        return '';
      };

      // ── Helpers for skeleton + tier badge ──
      const skeleton  = document.getElementById('video-skeleton');
      const tierBadge = document.getElementById('video-tier-badge');
      const driveCover = document.getElementById('video-drive-cover');

      function showSkeleton() {
        if (skeleton) skeleton.style.display = 'flex';
      }
      function hideSkeleton() {
        if (skeleton) skeleton.style.display = 'none';
      }
      function showTierBadge(t) {
        if (!tierBadge) return;
        const labels = { foundation: '🟠 Foundation', standard: '🔵 Standard', mastery: '🟣 Mastery' };
        tierBadge.textContent = labels[t] || '';
        tierBadge.className = `video-tier-badge tier-${t}`;
        tierBadge.style.display = t ? 'block' : 'none';
      }

      // ── Detect YouTube URL ──
      function extractYouTubeId(url) {
        if (!url) return null;
        // Strip ?si= tracking params (e.g. youtu.be/ID?si=xxx) before matching
        const clean = url.replace(/[?&]si=[^&]*/i, '');
        const m = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
      }

      // ── Get student name for watermark ──
      const studentName = (window._ueProfile?.full_name || window._ueProfile?.email || 'UE School Student').trim();

      /* ── injectIframe(src, isYouTube)  ★ CRITICAL PATH ★
         ─────────────────────────────────────────────────────────────────
         The final step of the video pipeline — injects the <iframe>
         element into #video-area with the resolved embed URL.

         Called by renderLesson() with either:
           • A YouTube embed URL (isYouTube = true):
               https://www.youtube.com/embed/{ytId}?rel=0&...
           • A Google Drive /preview URL (isYouTube = false):
               https://drive.google.com/file/d/{FILE_ID}/preview
             (the URL comes from getVideoUrl() → gsheet-curriculum.js
              buildVideos() → gdrive-video.js embedUrl())

         WHAT injectIframe DOES:
         ───────────────────────
         1. Shows the loading skeleton (#video-skeleton) immediately.
         2. Creates an <iframe> with the resolved src.
         3. Hides the skeleton when iframe fires 'load' (or after 8s timeout).
         4. For Drive iframes only: overlays a transparent cover div in the
            top-right corner to block the Drive external-link arrow icon.
         5. Adds a repeating diagonal watermark overlay with the student's
            name (read from window._ueProfile, set in DOMContentLoaded).

         ⚠️  The `isYouTube` parameter controls the arrow blocker:
             YouTube iframes do not have the Drive external-link icon,
             so the blocker is only added for Drive embeds.  Do not add
             the blocker for YouTube embeds — it would cover the player UI.

         ⚠️  window._ueProfile is set by the DOMContentLoaded inline script
             (Step D) BEFORE CLASSROOM.init() is called.  If you change the
             profile storage point, the watermark will break.

         ⚠️  The iframe src is the direct output of the Google Sheets pipeline:
             Sheet CSV → gsheet-curriculum.js normaliseVideoUrl()
                       → gdrive-video.js embedUrl()
                       → TOPIC_BLUEPRINT[id].videos.standard.url
                       → CURRICULUM[subj].topics[n].videos.standard.url
                       → getVideoUrl() → here.
             Any breakage in that chain produces an empty src, which will
             result in a blank video area (no iframe injected).
      ──────────────────────────────────────────────────────────────── */
      function injectIframe(src, isYouTube) {
        showSkeleton();

        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.allow = 'autoplay; fullscreen';
        iframe.allowFullscreen = true;
        iframe.loading = 'lazy';
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;z-index:3';

        iframe.addEventListener('load', hideSkeleton);
        setTimeout(hideSkeleton, 8000);

        // Clear placeholder elements
        videoArea.querySelectorAll('.video-bg,.video-grid,.video-play-btn,.video-duration')
          .forEach(el => el.remove());
        videoArea.appendChild(iframe);

        // ── Arrow blocker — sits ABOVE the iframe ──
        // Covers the top-right corner where Drive/YouTube puts the external link icon
        if (!isYouTube) {
          const cover = document.createElement('div');
          cover.style.cssText = [
            'position:absolute',
            'top:0','right:0',
            'width:80px','height:60px',
            'z-index:10',
            'background:transparent',
            'pointer-events:all',
            'cursor:default',
          ].join(';');
          videoArea.appendChild(cover);
        }

        // ── Watermark overlay ──
        if (studentName) {
          const wm = document.createElement('div');
          wm.id = 'video-watermark';
          const escaped = studentName.replace(/</g,'&lt;').replace(/>/g,'&gt;');

          wm.style.cssText = [
            'position:absolute','inset:0',
            'z-index:9',
            'pointer-events:none',
            'overflow:hidden',
          ].join(';');

          // Build a repeating diagonal grid of watermark text (professional DRM style)
          const rows = 5;
          const cols = 4;
          let rowsHTML = '';
          for (let r = 0; r < rows; r++) {
            let cells = '';
            for (let c = 0; c < cols; c++) {
              cells += `<span style="
                color:rgba(255,255,255,0.065);
                font-size:0.62rem;
                font-weight:600;
                letter-spacing:0.12em;
                white-space:nowrap;
                text-transform:uppercase;
                padding:0 18px;
                user-select:none;
                pointer-events:none;
                font-family:'DM Sans',system-ui,sans-serif;
              ">${escaped}</span>`;
            }
            rowsHTML += `<div style="
              display:flex;
              justify-content:space-around;
              align-items:center;
              width:160%;
              margin-left:-30%;
            ">${cells}</div>`;
          }

          wm.innerHTML = `
            <div style="
              position:absolute;inset:0;
              display:flex;flex-direction:column;
              justify-content:space-around;
              transform:rotate(-22deg) scale(1.15);
              transform-origin:center center;
              pointer-events:none;user-select:none;
            ">${rowsHTML}</div>

            <div style="
              position:absolute;bottom:10px;right:12px;
              display:flex;align-items:center;gap:5px;
              background:rgba(0,0,0,0.45);
              backdrop-filter:blur(6px);
              -webkit-backdrop-filter:blur(6px);
              border:1px solid rgba(255,255,255,0.1);
              border-radius:5px;
              padding:3px 9px 3px 7px;
              pointer-events:none;user-select:none;
            ">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.5 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="rgba(255,255,255,0.45)" stroke-width="0.9"/>
                <path d="M3.2 3.2h2.6L3.2 5.8h2.6" stroke="rgba(255,255,255,0.45)" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span style="
                color:rgba(255,255,255,0.5);
                font-size:0.58rem;
                font-weight:600;
                letter-spacing:0.07em;
                white-space:nowrap;
                text-transform:uppercase;
                font-family:'DM Sans',system-ui,sans-serif;
              ">${escaped}</span>
            </div>`;

          videoArea.appendChild(wm);
        }
      }

      // Determine video source — YouTube takes priority
      const rawUrl = getVideoUrl(topic, tier);
      const ytId   = topic.youtubeId || extractYouTubeId(rawUrl);

      if (ytId) {
        // YouTube embed — no Drive cover needed
        showTierBadge(tier);
        injectIframe(
          `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`,
          true
        );
      } else if (rawUrl) {
        // Google Drive embed
        showTierBadge(tier);
        injectIframe(rawUrl, false);
      } else {
        // No video yet — show animated placeholder
        hideSkeleton();
        if (tierBadge) tierBadge.style.display = 'none';
        videoArea.innerHTML = `
          <div class="video-bg"></div>
          <div class="video-grid"></div>
          <div class="video-play-btn" onclick="CLASSROOM.playVideo('${topic.id}')">&#x25B6;</div>
          <div class="video-duration">${topic.duration}</div>`;
      }
    }

    // Lesson content
    const contentEl = document.getElementById('lesson-content');
    if (contentEl) {
      const { intro, points = [], formulas = [] } = topic.content;

      const pointsHTML = points.length ? `
        <h3>Key Points</h3>
        <ul>${points.map(p => `<li><span class="bullet">•</span>${p}</li>`).join('')}</ul>
      ` : '';

      const formulaHTML = formulas.length ? `
        <div class="formula-box">
          <div class="formula-box-label">Formula Box</div>
          <div class="formula-grid">
            ${formulas.map(f => `<div class="formula-item"><strong style="font-size:.72rem;color:var(--muted);display:block;margin-bottom:4px">${f.label}</strong>${f.formula}</div>`).join('')}
          </div>
        </div>
      ` : '';

      contentEl.innerHTML = `<p>${intro}</p>${pointsHTML}${formulaHTML}`;
    }

    // Quick quiz
    quizState = { idx: 0, questions: topic.quiz || [], answered: 0, correct: 0 };
    renderQuiz();

    // Practice button
    const practiceBtn = document.getElementById('practice-btn');
    if (practiceBtn) {
      const parts = topicId(topic);
      practiceBtn.href = `cbt.html?subject=${parts.subj}&topic=${encodeURIComponent(parts.topic)}`;
    }

    // Mark as studied in Supabase (fire-and-forget)
    if (userId) {
      window.sb.from('topic_mastery').upsert({
        user_id:     userId,
        topic_id:    topic.id,
        last_studied: new Date().toISOString(),
        status:      'IN_PROGRESS'
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: false }).then(() => {});
    }
  }

  function topicId(topic) {
    const parts = topic.id.split('.');
    return { subj: parts[0], topic: parts.slice(1).join('.') };
  }

  // ─── Video placeholder click ──────────────────────
  function playVideo(topicId) {
    toast('Video lesson coming soon! Practice with CBT questions in the meantime.');
  }

  // ─── Locked state ─────────────────────────────────
  function showLockedState(topic) {
    currentTopicId = null;

    setEl('topic-title', topic.title);
    setEl('topic-tag', 'Premium');
    { const d = (topic.duration || '').toString().replace(/\s*mins?\s*$/i, '').trim(); setEl('lesson-duration-badge', d ? d + ' mins' : '—'); }

    const videoArea = document.getElementById('video-area');
    if (videoArea) {
      videoArea.innerHTML = `
        <div class="video-bg"></div>
        <div class="video-grid"></div>
        <div class="video-locked">
          <div style="font-size:2.5rem;margin-bottom:14px">&#x1F512;</div>
          <h3 style="font-family:var(--font-head);font-size:1.8rem;margin-bottom:8px">Premium Content</h3>
          <p style="color:rgba(15,28,63,.55);margin-bottom:22px">Upgrade your plan to unlock this lesson and all premium topics.</p>
          <a href="pricing.html" class="btn btn-primary btn-lg">Unlock Premium \u2192</a>
        </div>`;
    }

    const contentEl = document.getElementById('lesson-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="text-align:center;padding:40px 20px;background:var(--surface2);border-radius:var(--radius-lg);border:1px solid var(--border2)">
          <div style="font-size:2rem;margin-bottom:12px">&#x1F512;</div>
          <div style="font-weight:700;margin-bottom:8px">This lesson requires a premium subscription</div>
          <div style="font-size:.88rem;color:var(--muted);margin-bottom:20px">From ₦1,500/month — less than a data bundle</div>
          <a href="pricing.html" class="btn btn-primary">View Plans</a>
        </div>`;
    }

    const quizSection = document.getElementById('quiz-section');
    if (quizSection) quizSection.style.display = 'none';
  }

  // ─── Next / Prev lesson navigation ───────────────
  function nextLesson() {
    const subj   = CURRICULUM[currentSubject];
    if (!subj) return;
    const idx    = subj.topics.findIndex(t => t.id === currentTopicId);
    const next   = subj.topics.slice(idx + 1).find(t => topicUnlockedForUser(t));
    if (next) selectTopic(next.id);
    else toast('You\'ve completed all available lessons in this subject! &#x1F389;');
  }

  function prevLesson() {
    const subj = CURRICULUM[currentSubject];
    if (!subj) return;
    const idx  = subj.topics.findIndex(t => t.id === currentTopicId);
    if (idx > 0) selectTopic(subj.topics[idx - 1].id);
  }

  // ─── Quiz ─────────────────────────────────────────
  function renderQuiz() {
    const section = document.getElementById('quiz-section');
    if (!section) return;

    if (!quizState.questions.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    const q = quizState.questions[quizState.idx];

    setEl('quiz-q-num',   String(quizState.idx + 1));
    setEl('quiz-q-total', String(quizState.questions.length));

    const questionEl = document.getElementById('quiz-question');
    if (questionEl) questionEl.innerHTML = q.q;

    // Dots
    const dotsEl = document.getElementById('quiz-dots');
    if (dotsEl) {
      dotsEl.innerHTML = quizState.questions.map((_, i) => {
        const cls = i < quizState.idx ? 'done' : i === quizState.idx ? 'active' : '';
        return `<div class="quiz-dot ${cls}"></div>`;
      }).join('');
    }

    // Options
    const optsEl = document.getElementById('quiz-options');
    if (optsEl) {
      optsEl.innerHTML = '';
      q.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'drill-option';
        btn.innerHTML = `<span class="opt-label">${String.fromCharCode(65 + i)}</span>${opt}`;
        btn.onclick = () => checkAnswer(i, btn);
        optsEl.appendChild(btn);
      });
    }

    const fb = document.getElementById('quiz-feedback');
    if (fb) fb.style.display = 'none';
  }

  function checkAnswer(idx, btn) {
    const q  = quizState.questions[quizState.idx];
    const fb = document.getElementById('quiz-feedback');

    document.querySelectorAll('#quiz-options .drill-option').forEach(b => b.style.pointerEvents = 'none');
    btn.classList.add('selected');

    const isCorrect = idx === q.ans;
    if (isCorrect) quizState.correct++;

    if (fb) {
      fb.style.display = 'block';
      if (isCorrect) {
        fb.style.cssText = 'display:block;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
        fb.textContent = '&#x2713; Correct! Well done.';
      } else {
        fb.style.cssText = 'display:block;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
        fb.textContent = `&#x2717; Not quite. Correct answer: ${q.opts[q.ans]}.`;
        const allBtns = document.querySelectorAll('#quiz-options .drill-option');
        if (allBtns[q.ans]) allBtns[q.ans].style.borderColor = '#22c55e';
      }
    }

    setTimeout(() => {
      if (quizState.idx < quizState.questions.length - 1) {
        quizState.idx++;
        renderQuiz();
      } else {
        // Quiz complete
        const pct = Math.round((quizState.correct / quizState.questions.length) * 100);
        if (fb) {
          fb.style.cssText = 'display:block;background:rgba(79,142,255,.1);color:#3b82f6;border:1px solid rgba(79,142,255,.25);padding:12px 16px;border-radius:10px;font-weight:600;margin-top:12px';
          fb.innerHTML = `&#x1F389; Quiz complete! You scored <strong>${pct}%</strong>. <a href="${document.getElementById('practice-btn')?.href || 'cbt.html'}" style="color:var(--accent);text-decoration:underline">Take full practice \u2192</a>`;
        }
        if (document.getElementById('quiz-options')) document.getElementById('quiz-options').innerHTML = '';
      }
    }, 1500);
  }

  // ─── Helpers ──────────────────────────────────────
  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function closeSidebar() {
    document.querySelector('.classroom-sidebar')?.classList.remove('drawer-open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');
  }

  function toggleSidebar() {
    const sidebar = document.querySelector('.classroom-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const isOpen  = sidebar?.classList.toggle('drawer-open');
    overlay?.classList.toggle('open', isOpen);
  }

  // ─── loadTopic — public alias used by Skill Chamber monkey-patch ─
  // skill_chamber.js wraps this function to intercept topic loading
  // and run the adaptive diagnostic before rendering the lesson.
  // opts.tier: 'foundation' | 'standard' | 'mastery'
  function loadTopic(topicId, opts) {
    opts = opts || {};
    selectTopic(topicId, opts.tier);
  }

  // ── Stop floating — dock video back ──
  function stopFloat() {
    const va = document.getElementById('video-area');
    const ph = document.getElementById('video-placeholder-box');
    if (va) { va.classList.remove('floating'); va.style.left = ''; va.style.top = ''; }
    if (ph) ph.classList.remove('visible');
  }

  return {
    init, switchSubject, selectTopic, loadTopic, nextLesson, prevLesson,
    playVideo, toggleSidebar, closeSidebar, stopFloat, CURRICULUM
  };

})();
