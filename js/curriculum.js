/* ============================================================
   curriculum.js — Subjects, topics, and the TOPIC_BLUEPRINT
   Updated: Full WAEC Mathematics syllabus (7 modules, 30 topics)
   Google Drive video embedded on Quadratic Equations (standard)
   ============================================================ */

window.SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', accent: '#2563eb' },
  { id: 'literature',  name: 'Literature',  accent: '#7c3aed' },
  { id: 'biology',     name: 'Biology',     accent: '#16a34a' },
  { id: 'english',     name: 'English',     accent: '#ea580c' }
];

/* ─── Google Drive file ID for the sample maths video ─────────────────────
   Source: https://drive.google.com/file/d/1xKXn_g3Ta9pNLzMYhENi2tLqvqDEa2P_/view
   The classroom player picks up `driveId` on any topic and builds the embed
   automatically — no extra code needed.
   NOTE: Ensure the file is shared as "Anyone with the link can view" in
   Google Drive, otherwise students will see a permissions error.
   ─────────────────────────────────────────────────────────────────────── */
const SAMPLE_DRIVE_ID = '1xKXn_g3Ta9pNLzMYhENi2tLqvqDEa2P_';

/* TOPIC_BLUEPRINT — single source of truth for topics, lessons,
   diagnostics, drills, and power-ups per topic. */
window.TOPIC_BLUEPRINT = {

  /* ================================================================
     MATHEMATICS — Full WAEC Syllabus
     Module M1 · Number & Numeration
     Module M2 · Algebraic Processes
     Module M3 · Mensuration
     Module M4 · Plane Geometry
     Module M5 · Trigonometry
     Module M6 · Statistics & Probability
     Module M7 · Vectors & Transformations
     ================================================================ */

  /* ── M1.1 ── Number Bases ─────────────────────────────────────── */
  'mathematics.number_bases': {
    id: 'mathematics.number_bases',
    subject: 'mathematics',
    title: 'Number Bases (Binary / Decimal)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/number-bases-foundation', duration: '21 mins', tagline: 'Built from scratch · counting in base 2, 8 & 16 · place value explained' },
      standard:   { url: 'https://placeholder.video/number-bases-standard',   duration: '13 mins', tagline: 'Default lesson · conversion, addition & subtraction in any base' },
      mastery:    { url: 'https://placeholder.video/number-bases-mastery',    duration: '8 mins',  tagline: 'Exam-focused · WAEC past-question patterns & base-conversion traps' }
    },
    blurb: 'Convert numbers between bases 2, 8, 10 and 16, and perform arithmetic in non-decimal bases.',
    objectives: [
      'Convert integers and fractions between base 10 and other bases.',
      'Add, subtract and multiply numbers in base 2 and base 8.',
      'Recognise WAEC question patterns on number bases.'
    ],
    formulas: [
      'Base 10 → Base n  :  divide repeatedly, read remainders upward',
      'Base n → Base 10  :  multiply each digit by n^position, sum all',
      '1010₂  = 10₁₀',
      '77₈    = 63₁₀'
    ],
    subSkills: ['conversion','binary_arithmetic','base8'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.2 ── Modular Arithmetic ─────────────────────────────── */
  'mathematics.modular_arithmetic': {
    id: 'mathematics.modular_arithmetic',
    subject: 'mathematics',
    title: 'Modular Arithmetic',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/modular-foundation', duration: '18 mins', tagline: 'Clock-face analogy · what "mod" means · lots of worked examples' },
      standard:   { url: 'https://placeholder.video/modular-standard',   duration: '11 mins', tagline: 'Default lesson · mod addition, subtraction, multiplication & equivalence' },
      mastery:    { url: 'https://placeholder.video/modular-mastery',    duration: '7 mins',  tagline: 'Exam-focused · congruences, remainders & typical WAEC setups' }
    },
    blurb: 'Understand clock arithmetic and congruence — the language of cyclic patterns.',
    objectives: [
      'Define congruence modulo n and verify it using remainders.',
      'Add, subtract and multiply integers in a given modulus.',
      'Solve simple linear congruence equations.'
    ],
    formulas: [
      'a ≡ b (mod n)  ↔  n divides (a − b)',
      '17 ≡ 5 (mod 12)  — same remainder 5 when divided by 12',
      '(a + b) mod n = ((a mod n) + (b mod n)) mod n'
    ],
    subSkills: ['congruence','mod_operations','solving'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.3 ── Fractions & Decimals ───────────────────────────── */
  'mathematics.fractions_decimals': {
    id: 'mathematics.fractions_decimals',
    subject: 'mathematics',
    title: 'Fractions, Decimals & Significant Figures',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/fractions-foundation', duration: '20 mins', tagline: 'Visual fraction strips · decimal place value · no calculator assumed' },
      standard:   { url: 'https://placeholder.video/fractions-standard',   duration: '12 mins', tagline: 'Default lesson · operations on fractions, recurring decimals, sig figs' },
      mastery:    { url: 'https://placeholder.video/fractions-mastery',    duration: '8 mins',  tagline: 'Exam-focused · mixed operations, rounding traps & WAEC multi-step questions' }
    },
    blurb: 'Work fluently with fractions, decimals and the rounding rules that WAEC loves to test.',
    objectives: [
      'Add, subtract, multiply and divide fractions and mixed numbers.',
      'Convert between fractions, decimals and percentages.',
      'Round to given decimal places and significant figures.'
    ],
    formulas: [
      'a/b + c/d = (ad + bc) / bd',
      'a/b × c/d = ac / bd',
      '0.333... = 1/3  (recurring)',
      '3 sig figs: 0.004 567 → 0.004 57'
    ],
    subSkills: ['operations','conversion','rounding'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.4 ── Indices & Standard Form ───────────────────────── */
  'mathematics.indices': {
    id: 'mathematics.indices',
    subject: 'mathematics',
    title: 'Indices & Standard Form',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/indices-foundation', duration: '20 mins', tagline: 'Slow walkthrough · index laws built from first principles' },
      standard:   { url: 'https://placeholder.video/indices-standard',   duration: '12 mins', tagline: 'Default lesson · all six index laws + standard form' },
      mastery:    { url: 'https://placeholder.video/indices-mastery',    duration: '8 mins',  tagline: 'Exam-focused · negative indices, fractional powers, surd traps' }
    },
    blurb: 'Apply the laws of indices and write very large or small numbers in standard form.',
    objectives: [
      'Apply the multiplication, division and power laws of indices.',
      'Evaluate expressions with zero, negative and fractional indices.',
      'Write numbers in standard form A × 10ⁿ.'
    ],
    formulas: ['aᵐ × aⁿ = aᵐ⁺ⁿ','aᵐ ÷ aⁿ = aᵐ⁻ⁿ','(aᵐ)ⁿ = aᵐⁿ','a⁰ = 1','a⁻ⁿ = 1/aⁿ','a^(1/n) = ⁿ√a'],
    subSkills: ['index_laws','standard_form','fractional_indices'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.5 ── Logarithms ──────────────────────────────────────── */
  'mathematics.logarithms': {
    id: 'mathematics.logarithms',
    subject: 'mathematics',
    title: 'Logarithms (Tables & Roots)',
    duration: '14 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/logarithms-foundation', duration: '22 mins', tagline: 'What a log actually is · building from indices · no tables yet' },
      standard:   { url: 'https://placeholder.video/logarithms-standard',   duration: '14 mins', tagline: 'Default lesson · log laws, change of base, reading four-figure tables' },
      mastery:    { url: 'https://placeholder.video/logarithms-mastery',    duration: '9 mins',  tagline: 'Exam-focused · roots & powers via logs, antilog traps, WAEC past Qs' }
    },
    blurb: 'Use logarithm laws and four-figure tables to evaluate powers, roots and products without a calculator.',
    objectives: [
      'State and apply the product, quotient and power laws of logarithms.',
      'Use log tables and antilog tables to compute expressions.',
      'Solve simple logarithmic equations.'
    ],
    formulas: [
      'log(xy) = log x + log y',
      'log(x/y) = log x − log y',
      'log(xⁿ) = n log x',
      'log_a(a) = 1  ·  log_a(1) = 0',
      'Change of base: log_b(x) = log x / log b'
    ],
    subSkills: ['log_laws','tables','equations'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.6 ── Sequences (AP & GP) ───────────────────────────── */
  'mathematics.sequences': {
    id: 'mathematics.sequences',
    subject: 'mathematics',
    title: 'Sequences — AP & GP',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/sequences-foundation', duration: '21 mins', tagline: 'Patterns made visual · what AP and GP mean before any formula' },
      standard:   { url: 'https://placeholder.video/sequences-standard',   duration: '13 mins', tagline: 'Default lesson · nth term, sum formulas, geometric mean, series' },
      mastery:    { url: 'https://placeholder.video/sequences-mastery',    duration: '8 mins',  tagline: 'Exam-focused · mixed AP/GP, sum to infinity, WAEC word problems' }
    },
    blurb: 'Find any term and the sum of arithmetic and geometric sequences — a staple of WAEC Paper 2.',
    objectives: [
      'Derive the nth term of an AP and a GP.',
      'Calculate the sum of the first n terms of both types.',
      'Apply the formula for the sum to infinity of a convergent GP.'
    ],
    formulas: [
      'AP nth term: Tₙ = a + (n−1)d',
      'AP sum: Sₙ = n/2 [2a + (n−1)d]',
      'GP nth term: Tₙ = arⁿ⁻¹',
      'GP sum: Sₙ = a(1−rⁿ)/(1−r)  for r ≠ 1',
      'Sum to ∞: S∞ = a/(1−r)  for |r| < 1'
    ],
    subSkills: ['ap','gp','sum_to_infinity'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.7 ── Sets & Venn Diagrams ───────────────────────────── */
  'mathematics.sets_venn': {
    id: 'mathematics.sets_venn',
    subject: 'mathematics',
    title: 'Sets & Venn Diagrams (3-set)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/sets-foundation', duration: '21 mins', tagline: 'Drawing Venn diagrams step-by-step · no prior knowledge needed' },
      standard:   { url: 'https://placeholder.video/sets-standard',   duration: '13 mins', tagline: 'Default lesson · union, intersection, complement, 3-set problems' },
      mastery:    { url: 'https://placeholder.video/sets-mastery',    duration: '8 mins',  tagline: 'Exam-focused · WAEC word problems & shading regions correctly' }
    },
    blurb: 'Use set notation and Venn diagrams to solve word problems with up to three overlapping sets.',
    objectives: [
      'Define and use union, intersection, complement and the universal set.',
      'Solve 2-set and 3-set Venn diagram problems from word descriptions.',
      'Apply the inclusion-exclusion principle.'
    ],
    formulas: [
      'n(A ∪ B) = n(A) + n(B) − n(A ∩ B)',
      'n(A ∪ B ∪ C) = n(A)+n(B)+n(C) − n(A∩B) − n(A∩C) − n(B∩C) + n(A∩B∩C)',
      "A' = complement of A  (everything not in A)"
    ],
    subSkills: ['notation','2set','3set'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.8 ── Surds & Rationalisation ───────────────────────── */
  'mathematics.surds': {
    id: 'mathematics.surds',
    subject: 'mathematics',
    title: 'Surds & Rationalisation',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/surds-foundation', duration: '18 mins', tagline: 'What a surd is · simplifying radicals · no calculator approach' },
      standard:   { url: 'https://placeholder.video/surds-standard',   duration: '11 mins', tagline: 'Default lesson · addition, multiplication & rationalising the denominator' },
      mastery:    { url: 'https://placeholder.video/surds-mastery',    duration: '7 mins',  tagline: 'Exam-focused · conjugate pairs, nested surds & WAEC past Qs' }
    },
    blurb: 'Simplify and manipulate surds, and rationalise expressions with irrational denominators.',
    objectives: [
      'Simplify surds by extracting perfect square factors.',
      'Add, subtract and multiply surd expressions.',
      'Rationalise denominators using conjugate pairs.'
    ],
    formulas: [
      '√(ab) = √a × √b',
      '√a × √a = a',
      'Rationalise 1/(a+√b): multiply by (a−√b)/(a−√b)',
      '(√a + √b)(√a − √b) = a − b'
    ],
    subSkills: ['simplify','operations','rationalise'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.9 ── Variation ──────────────────────────────────────── */
  'mathematics.variation': {
    id: 'mathematics.variation',
    subject: 'mathematics',
    title: 'Joint & Partial Variation',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/variation-foundation', duration: '19 mins', tagline: 'Direct vs inverse variation from everyday examples' },
      standard:   { url: 'https://placeholder.video/variation-standard',   duration: '11 mins', tagline: 'Default lesson · direct, inverse, joint and partial variation with constants' },
      mastery:    { url: 'https://placeholder.video/variation-mastery',    duration: '7 mins',  tagline: 'Exam-focused · finding k, substituting values & WAEC word problems' }
    },
    blurb: 'Formulate and solve problems on direct, inverse, joint and partial variation.',
    objectives: [
      'Write variation statements as equations with constant k.',
      'Determine k from given values and use it to find unknowns.',
      'Distinguish joint variation from partial variation.'
    ],
    formulas: [
      'Direct: y = kx',
      'Inverse: y = k/x',
      'Joint: z = kxy',
      'Partial: z = ax + by  (sum of separate direct variations)'
    ],
    subSkills: ['direct','inverse','joint_partial'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M1.10 ── Percentages ───────────────────────────────────── */
  'mathematics.percentages': {
    id: 'mathematics.percentages',
    subject: 'mathematics',
    title: 'Percentages (Interest & Depreciation)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/percentages-foundation', duration: '20 mins', tagline: 'Percentage basics → profit & loss → simple interest — built gradually' },
      standard:   { url: 'https://placeholder.video/percentages-standard',   duration: '12 mins', tagline: 'Default lesson · SI, compound interest, depreciation & hire-purchase' },
      mastery:    { url: 'https://placeholder.video/percentages-mastery',    duration: '8 mins',  tagline: 'Exam-focused · reverse percentage, depreciation chains & WAEC data questions' }
    },
    blurb: 'Apply percentage calculations to financial problems including interest, depreciation and hire purchase.',
    objectives: [
      'Calculate simple and compound interest.',
      'Find depreciation using straight-line and reducing-balance methods.',
      'Solve hire-purchase and percentage profit/loss problems.'
    ],
    formulas: [
      'Simple Interest: I = PRT/100',
      'Compound Interest: A = P(1 + r/100)ⁿ',
      'Depreciation: V = P(1 − r/100)ⁿ',
      '% Profit = (Profit / Cost) × 100'
    ],
    subSkills: ['simple_interest','compound_interest','depreciation'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'I', left: 'P×R', right: 'T/100' } }
  },

  /* ── M2.1 ── Expressions ────────────────────────────────────── */
  'mathematics.expressions': {
    id: 'mathematics.expressions',
    subject: 'mathematics',
    title: 'Expressions (Expansion & Factorisation)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/expressions-foundation', duration: '20 mins', tagline: 'FOIL and distribution · factorising from first principles' },
      standard:   { url: 'https://placeholder.video/expressions-standard',   duration: '12 mins', tagline: 'Default lesson · expansion, HCF factorising, difference of two squares' },
      mastery:    { url: 'https://placeholder.video/expressions-mastery',    duration: '8 mins',  tagline: 'Exam-focused · perfect squares, grouping & WAEC polynomial traps' }
    },
    blurb: 'Expand brackets and factorise algebraic expressions including difference of two squares.',
    objectives: [
      'Expand single and double brackets correctly.',
      'Factorise by taking out common factors and by grouping.',
      'Recognise and apply the difference of two squares identity.'
    ],
    formulas: [
      '(a + b)² = a² + 2ab + b²',
      '(a − b)² = a² − 2ab + b²',
      'a² − b² = (a + b)(a − b)',
      '(a + b)(c + d) = ac + ad + bc + bd'
    ],
    subSkills: ['expansion','common_factor','difference_squares'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M2.2 ── Linear & Simultaneous Equations ────────────────── */
  'mathematics.linear_equations': {
    id: 'mathematics.linear_equations',
    subject: 'mathematics',
    title: 'Linear & Simultaneous Equations',
    duration: '10 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/linear-foundation', duration: '18 mins', tagline: 'Step-by-step · solving from scratch · plenty of examples' },
      standard:   { url: 'https://placeholder.video/linear-standard',   duration: '10 mins', tagline: 'Default lesson · isolation, simultaneous & graphing covered' },
      mastery:    { url: 'https://placeholder.video/linear-mastery',    duration: '7 mins',  tagline: 'Exam-focused · word problems & gradient traps' }
    },
    blurb: 'Solve equations of the form ax + b = c, and pairs of simultaneous equations.',
    objectives: [
      'Isolate the unknown using inverse operations.',
      'Solve simultaneous linear equations by elimination and substitution.',
      'Identify slope and y-intercept from y = mx + c.'
    ],
    formulas: ['y = mx + c', 'm = (y₂ − y₁)/(x₂ − x₁)', 'ax + b = 0  ⟹  x = −b/a'],
    subSkills: ['isolate','simultaneous','graphing'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'd', left: 's', right: 't' } }
  },

  /* ── M2.3 ── Change of Subject ──────────────────────────────── */
  'mathematics.change_of_subject': {
    id: 'mathematics.change_of_subject',
    subject: 'mathematics',
    title: 'Change of Subject of a Formula',
    duration: '10 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/cos-foundation', duration: '17 mins', tagline: 'What "subject" means · simple formulas first · inverse operations logic' },
      standard:   { url: 'https://placeholder.video/cos-standard',   duration: '10 mins', tagline: 'Default lesson · rearranging with squares, roots, fractions and brackets' },
      mastery:    { url: 'https://placeholder.video/cos-mastery',    duration: '7 mins',  tagline: 'Exam-focused · multi-step rearrangements & typical WAEC setups' }
    },
    blurb: 'Rearrange any formula to make a specified variable the subject.',
    objectives: [
      'Apply inverse operations to rearrange simple formulas.',
      'Handle formulas involving squares and square roots.',
      'Rearrange formulas where the new subject appears more than once.'
    ],
    formulas: [
      'From v = u + at  →  t = (v − u)/a',
      'From A = πr²   →  r = √(A/π)',
      'Strategy: isolate the target variable step by step'
    ],
    subSkills: ['simple','with_roots','appears_twice'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M2.4 ── Quadratic Equations ───────────────────────────── */
  'mathematics.quadratics': {
    id: 'mathematics.quadratics',
    subject: 'mathematics',
    title: 'Quadratic Equations',
    duration: '14 mins',

    /* ── GOOGLE DRIVE VIDEO EMBEDDED ──────────────────────────────
       The classroom player detects `driveId` and builds the embed:
         https://drive.google.com/file/d/<driveId>/preview
       Make sure sharing is set to "Anyone with the link can view".
       ─────────────────────────────────────────────────────────── */
    driveId: SAMPLE_DRIVE_ID,

    videos: {
      foundation: { url: 'https://placeholder.video/quadratics-foundation', duration: '22 mins', tagline: 'Slow walkthrough · 6 worked examples · no prior knowledge assumed' },
      standard:   { url: `https://drive.google.com/file/d/${SAMPLE_DRIVE_ID}/view`,  duration: '14 mins', tagline: 'WAEC-aligned lesson · all three solving methods · exam worked examples' },
      mastery:    { url: 'https://placeholder.video/quadratics-mastery',    duration: '9 mins',  tagline: 'Exam-focused · tricky discriminant cases & past-paper patterns' }
    },
    blurb: 'Master the structure ax² + bx + c = 0 and the three core solving techniques tested in every WAEC paper.',
    objectives: [
      'Recognise a quadratic equation in standard form.',
      'Solve quadratics by factorising, completing the square and using the formula.',
      'Interpret the discriminant to predict the number of real roots.'
    ],
    formulas: [
      'ax² + bx + c = 0',
      'x = (−b ± √(b² − 4ac)) / 2a',
      'Sum of roots = −b/a',
      'Product of roots = c/a',
      'Discriminant Δ = b² − 4ac',
      '(x + p)(x + q) = 0'
    ],
    subSkills: ['factorising','formula','discriminant'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M2.5 ── Graphs of Functions ───────────────────────────── */
  'mathematics.graphs_functions': {
    id: 'mathematics.graphs_functions',
    subject: 'mathematics',
    title: 'Graphs of Functions (Roots & Gradients)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/graphs-foundation', duration: '21 mins', tagline: 'Plotting from a table of values · reading key features · no scary calculus' },
      standard:   { url: 'https://placeholder.video/graphs-standard',   duration: '13 mins', tagline: 'Default lesson · roots, gradients, tangents & area under curve' },
      mastery:    { url: 'https://placeholder.video/graphs-mastery',    duration: '9 mins',  tagline: 'Exam-focused · simultaneous graphical solutions & WAEC graph question types' }
    },
    blurb: 'Draw and interpret graphs of linear, quadratic and cubic functions to find roots, gradients and solutions.',
    objectives: [
      'Construct a table of values and plot the graph of a given function.',
      'Use the graph to find roots, maximum/minimum points and gradients.',
      'Solve simultaneous equations graphically.'
    ],
    formulas: [
      'Gradient = (y₂ − y₁) / (x₂ − x₁)',
      'Roots = x-intercepts (where y = 0)',
      'y = ax² + bx + c  →  vertex at x = −b/2a'
    ],
    subSkills: ['plotting','reading_roots','gradient'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M2.6 ── Linear Inequalities ───────────────────────────── */
  'mathematics.linear_inequalities': {
    id: 'mathematics.linear_inequalities',
    subject: 'mathematics',
    title: 'Linear Inequalities',
    duration: '10 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/inequalities-foundation', duration: '18 mins', tagline: 'Number-line approach · what >, <, ≥, ≤ mean in real life' },
      standard:   { url: 'https://placeholder.video/inequalities-standard',   duration: '10 mins', tagline: 'Default lesson · solving, graphing on number line & shading regions' },
      mastery:    { url: 'https://placeholder.video/inequalities-mastery',    duration: '7 mins',  tagline: 'Exam-focused · compound inequalities, reversing signs & linear programming basics' }
    },
    blurb: 'Solve linear inequalities in one and two variables and represent solutions graphically.',
    objectives: [
      'Solve linear inequalities, remembering to reverse the sign when dividing by a negative.',
      'Represent solution sets on a number line.',
      'Graph inequalities in two variables and identify the feasible region.'
    ],
    formulas: [
      'Rule: multiplying/dividing by a negative reverses the inequality',
      'Solution set notation: {x : a ≤ x < b}',
      'Graphical: solid line for ≤/≥, dashed for </>; shade the correct region'
    ],
    subSkills: ['solving','number_line','graphical'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M2.7 ── Algebraic Fractions ───────────────────────────── */
  'mathematics.algebraic_fractions': {
    id: 'mathematics.algebraic_fractions',
    subject: 'mathematics',
    title: 'Algebraic Fractions',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/algfractions-foundation', duration: '19 mins', tagline: 'Bridge from numeric fractions to algebraic · LCM approach · visual' },
      standard:   { url: 'https://placeholder.video/algfractions-standard',   duration: '11 mins', tagline: 'Default lesson · simplification, addition, subtraction & equations with fractions' },
      mastery:    { url: 'https://placeholder.video/algfractions-mastery',    duration: '7 mins',  tagline: 'Exam-focused · partial fractions & complex denominators' }
    },
    blurb: 'Simplify, add, subtract and solve equations involving algebraic fractions.',
    objectives: [
      'Simplify algebraic fractions by factorising numerator and denominator.',
      'Add and subtract algebraic fractions using the LCM of denominators.',
      'Solve equations that contain algebraic fractions.'
    ],
    formulas: [
      'a/b + c/d = (ad + bc) / bd',
      'a/b × c/d = ac / bd',
      'To solve: multiply every term by the LCM of all denominators'
    ],
    subSkills: ['simplify','add_subtract','equations'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M3.1 ── Lengths & Perimeters ──────────────────────────── */
  'mathematics.lengths_perimeters': {
    id: 'mathematics.lengths_perimeters',
    subject: 'mathematics',
    title: 'Lengths & Perimeters (Arcs & Sectors)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/lengths-foundation', duration: '20 mins', tagline: 'Perimeter of basic shapes → arc length → sector perimeter, step by step' },
      standard:   { url: 'https://placeholder.video/lengths-standard',   duration: '12 mins', tagline: 'Default lesson · arc length, sector perimeter, π, and radian intro' },
      mastery:    { url: 'https://placeholder.video/lengths-mastery',    duration: '8 mins',  tagline: 'Exam-focused · combined shapes & WAEC tricky setups' }
    },
    blurb: 'Calculate perimeters of composite shapes including arcs and sectors of circles.',
    objectives: [
      'Find perimeters of rectangles, triangles, trapezoids and composite shapes.',
      'Calculate arc length using the fraction of 360°.',
      'Find the perimeter of a sector.'
    ],
    formulas: [
      'Circumference = 2πr',
      'Arc length = (θ/360) × 2πr',
      'Sector perimeter = arc length + 2r'
    ],
    subSkills: ['basic_perimeter','arc_length','sector'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'Arc', left: 'θ/360', right: '2πr' } }
  },

  /* ── M3.2 ── Areas ──────────────────────────────────────────── */
  'mathematics.areas': {
    id: 'mathematics.areas',
    subject: 'mathematics',
    title: 'Areas (Quadrilaterals & Surface Area)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/areas-foundation', duration: '21 mins', tagline: 'Counting squares → formula → sector area → surface area of 3-D shapes' },
      standard:   { url: 'https://placeholder.video/areas-standard',   duration: '13 mins', tagline: 'Default lesson · all 2-D shapes, sector area, surface area of solids' },
      mastery:    { url: 'https://placeholder.video/areas-mastery',    duration: '9 mins',  tagline: 'Exam-focused · composite shapes, shaded regions & WAEC past-question patterns' }
    },
    blurb: 'Compute areas of plane shapes and surface areas of common 3-D solids.',
    objectives: [
      'Apply area formulas for triangles, quadrilaterals and circles.',
      'Calculate the area of a sector.',
      'Find the surface area of prisms, cylinders, cones and spheres.'
    ],
    formulas: [
      'Triangle: ½ base × height',
      'Trapezoid: ½(a + b)h',
      'Circle: πr²',
      'Sector: (θ/360) × πr²',
      'Cylinder (total): 2πr² + 2πrh',
      'Sphere: 4πr²'
    ],
    subSkills: ['plane_shapes','sector_area','surface_area'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M3.3 ── Volumes ────────────────────────────────────────── */
  'mathematics.volumes': {
    id: 'mathematics.volumes',
    subject: 'mathematics',
    title: 'Volumes (Prisms, Pyramids & Spheres)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/volumes-foundation', duration: '21 mins', tagline: 'What volume is · filling boxes → cylinders → spheres, built slowly' },
      standard:   { url: 'https://placeholder.video/volumes-standard',   duration: '13 mins', tagline: 'Default lesson · all standard solids + density problems' },
      mastery:    { url: 'https://placeholder.video/volumes-mastery',    duration: '9 mins',  tagline: 'Exam-focused · frustum, composite solids & WAEC past questions' }
    },
    blurb: 'Calculate the volume of prisms, cylinders, pyramids, cones and spheres.',
    objectives: [
      'Apply the volume formula for prisms and cylinders.',
      'Calculate volumes of pyramids, cones and spheres.',
      'Solve density and capacity problems.'
    ],
    formulas: [
      'Prism / Cylinder: V = cross-section area × length',
      'Pyramid / Cone: V = ⅓ × base area × height',
      'Sphere: V = (4/3)πr³',
      'Density: ρ = m/V'
    ],
    subSkills: ['prisms','pyramids_cones','spheres'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'm', left: 'ρ', right: 'V' } }
  },

  /* ── M4.1 ── Angles & Parallel Lines ───────────────────────── */
  'mathematics.angles_parallel': {
    id: 'mathematics.angles_parallel',
    subject: 'mathematics',
    title: 'Angles & Parallel Lines',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/angles-foundation', duration: '19 mins', tagline: 'Types of angles → angle relationships → transversals, built visually' },
      standard:   { url: 'https://placeholder.video/angles-standard',   duration: '11 mins', tagline: 'Default lesson · alternate, co-interior & corresponding angles with proof' },
      mastery:    { url: 'https://placeholder.video/angles-mastery',    duration: '7 mins',  tagline: 'Exam-focused · multi-step angle chains & WAEC diagram traps' }
    },
    blurb: 'Identify angle relationships formed when a transversal crosses parallel lines.',
    objectives: [
      'Name and find vertically opposite, supplementary and complementary angles.',
      'Apply alternate, corresponding and co-interior angle theorems.',
      'Solve multi-step angle problems with reasons.'
    ],
    formulas: [
      'Angles on a straight line = 180°',
      'Angles at a point = 360°',
      'Alternate angles are equal (Z-angles)',
      'Corresponding angles are equal (F-angles)',
      'Co-interior (allied) angles sum to 180° (C-angles)'
    ],
    subSkills: ['basic_angles','parallel_line_theorems','multi_step'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M4.2 ── Polygons ───────────────────────────────────────── */
  'mathematics.polygons': {
    id: 'mathematics.polygons',
    subject: 'mathematics',
    title: 'Polygons (Interior & Exterior Angles)',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/polygons-foundation', duration: '19 mins', tagline: 'Triangles → quadrilaterals → general n-gon · angle sums built up' },
      standard:   { url: 'https://placeholder.video/polygons-standard',   duration: '11 mins', tagline: 'Default lesson · interior/exterior angle formulas, properties of special quadrilaterals' },
      mastery:    { url: 'https://placeholder.video/polygons-mastery',    duration: '7 mins',  tagline: 'Exam-focused · finding n from angle sum, irregular polygon traps' }
    },
    blurb: 'Calculate interior and exterior angles of regular and irregular polygons.',
    objectives: [
      'Find the sum of interior angles of any polygon.',
      'Calculate interior and exterior angles of a regular polygon.',
      'Identify and use properties of special quadrilaterals.'
    ],
    formulas: [
      'Sum of interior angles = (n − 2) × 180°',
      'Each interior angle (regular n-gon) = (n−2)×180° / n',
      'Each exterior angle (regular n-gon) = 360° / n',
      'Interior + exterior = 180°'
    ],
    subSkills: ['angle_sum','regular_polygon','quadrilaterals'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M4.3 ── Circle Theorems ────────────────────────────────── */
  'mathematics.circle_theorems': {
    id: 'mathematics.circle_theorems',
    subject: 'mathematics',
    title: 'Circle Theorems — The 8 Laws',
    duration: '15 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/circles-foundation', duration: '23 mins', tagline: 'Each theorem shown on a clear diagram before any algebra' },
      standard:   { url: 'https://placeholder.video/circles-standard',   duration: '15 mins', tagline: 'Default lesson · all 8 theorems with proofs and worked examples' },
      mastery:    { url: 'https://placeholder.video/circles-mastery',    duration: '10 mins', tagline: 'Exam-focused · combining multiple theorems in one diagram · WAEC style' }
    },
    blurb: 'State and apply the eight standard circle theorems to find angles and lengths.',
    objectives: [
      'State and apply all 8 circle theorems.',
      'Solve angle-in-a-circle problems giving reasons.',
      'Identify tangent-radius and cyclic quadrilateral properties.'
    ],
    formulas: [
      '1. Angle at centre = 2 × angle at circumference',
      '2. Angles in the same segment are equal',
      '3. Angle in a semicircle = 90°',
      '4. Opposite angles of a cyclic quadrilateral sum to 180°',
      '5. Tangent ⊥ radius at point of contact',
      '6. Two tangents from external point are equal',
      '7. Alternate segment theorem (tangent-chord angle)',
      '8. Equal chords are equidistant from centre'
    ],
    subSkills: ['centre_circumference','cyclic_quad','tangent'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M4.4 ── Constructions ──────────────────────────────────── */
  'mathematics.constructions': {
    id: 'mathematics.constructions',
    subject: 'mathematics',
    title: 'Constructions',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/constructions-foundation', duration: '20 mins', tagline: 'How to use a compass correctly before any construction · slow and clear' },
      standard:   { url: 'https://placeholder.video/constructions-standard',   duration: '12 mins', tagline: 'Default lesson · bisectors, 60°/90°/45° angles & copying segments' },
      mastery:    { url: 'https://placeholder.video/constructions-mastery',    duration: '8 mins',  tagline: 'Exam-focused · WAEC construction questions & accuracy requirements' }
    },
    blurb: 'Use a ruler and compass to construct standard geometric figures accurately.',
    objectives: [
      'Construct perpendicular and angle bisectors.',
      'Construct 30°, 45°, 60° and 90° angles without a protractor.',
      'Construct triangles given various combinations of sides and angles.'
    ],
    formulas: [
      'Perpendicular bisector: equal arcs from both endpoints',
      'Angle bisector: equal arcs from both rays of the angle',
      '60° = equilateral triangle construction',
      '90° = perpendicular at a point'
    ],
    subSkills: ['bisectors','standard_angles','triangles'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M4.5 ── Loci ───────────────────────────────────────────── */
  'mathematics.loci': {
    id: 'mathematics.loci',
    subject: 'mathematics',
    title: 'Loci — The 4 Basic Loci',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/loci-foundation', duration: '19 mins', tagline: '"The path of a moving point" · real-life locus examples before geometry' },
      standard:   { url: 'https://placeholder.video/loci-standard',   duration: '11 mins', tagline: 'Default lesson · 4 basic loci, intersecting loci & combined problems' },
      mastery:    { url: 'https://placeholder.video/loci-mastery',    duration: '7 mins',  tagline: 'Exam-focused · WAEC locus construction questions & shading regions' }
    },
    blurb: 'Describe and construct the locus of a point satisfying given conditions.',
    objectives: [
      'State the four basic loci and sketch each one.',
      'Construct loci accurately using compass and ruler.',
      'Find regions satisfying two or more locus conditions simultaneously.'
    ],
    formulas: [
      '1. Fixed distance from a point → circle of radius r',
      '2. Fixed distance from a line → pair of parallel lines',
      '3. Equidistant from two points → perpendicular bisector',
      '4. Equidistant from two lines → angle bisector'
    ],
    subSkills: ['4_basic_loci','construction','intersection'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M5.1 ── Trig Ratios ────────────────────────────────────── */
  'mathematics.trig_ratios': {
    id: 'mathematics.trig_ratios',
    subject: 'mathematics',
    title: 'Trig Ratios — SOH CAH TOA',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/trig-foundation', duration: '20 mins', tagline: 'Right-triangle first · sin/cos/tan built visually · no unit circle yet' },
      standard:   { url: 'https://placeholder.video/trig-standard',   duration: '12 mins', tagline: 'Default lesson · SOH CAH TOA, special angles, quadrant signs' },
      mastery:    { url: 'https://placeholder.video/trig-mastery',    duration: '8 mins',  tagline: 'Exam-focused · exact values, sin/cosine rule & area of triangle' }
    },
    blurb: 'Define and apply the three trigonometric ratios to solve right-angled triangle problems.',
    objectives: [
      'Define sin, cos and tan in a right-angled triangle.',
      'Find angles and sides using SOH CAH TOA.',
      'Recall exact values for 30°, 45° and 60°.'
    ],
    formulas: [
      'sin θ = opposite / hypotenuse',
      'cos θ = adjacent / hypotenuse',
      'tan θ = opposite / adjacent',
      'sin²θ + cos²θ = 1',
      'sin 30° = ½,  cos 60° = ½,  tan 45° = 1'
    ],
    subSkills: ['definitions','solving_triangles','special_angles'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'O', left: 'sin θ', right: 'H' } }
  },

  /* ── M5.2 ── Elevation & Depression ────────────────────────── */
  'mathematics.elevation_depression': {
    id: 'mathematics.elevation_depression',
    subject: 'mathematics',
    title: 'Angles of Elevation & Depression',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/elevation-foundation', duration: '19 mins', tagline: 'Real-life setup (towers, ships) → drawing the triangle → solving' },
      standard:   { url: 'https://placeholder.video/elevation-standard',   duration: '11 mins', tagline: 'Default lesson · elevation, depression, alternate angles & two-observer problems' },
      mastery:    { url: 'https://placeholder.video/elevation-mastery',    duration: '7 mins',  tagline: 'Exam-focused · two-angle word problems & WAEC diagram interpretation' }
    },
    blurb: 'Use angles of elevation and depression to find heights and distances in real-world problems.',
    objectives: [
      'Distinguish between angle of elevation and angle of depression.',
      'Draw an accurate diagram from a word problem.',
      'Solve for unknown heights or distances using tan, sin and cos.'
    ],
    formulas: [
      'Elevation: angle measured upward from horizontal',
      'Depression: angle measured downward from horizontal',
      'Elevation from A = Depression from B (alternate angles, parallel horizontals)',
      'tan θ = height / horizontal distance'
    ],
    subSkills: ['definitions','diagram','solving'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'height', left: 'tan θ', right: 'distance' } }
  },

  /* ── M5.3 ── Bearings ───────────────────────────────────────── */
  'mathematics.bearings': {
    id: 'mathematics.bearings',
    subject: 'mathematics',
    title: 'Bearings',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/bearings-foundation', duration: '20 mins', tagline: 'Compass directions → 3-digit bearing system → reading & plotting' },
      standard:   { url: 'https://placeholder.video/bearings-standard',   duration: '12 mins', tagline: 'Default lesson · back bearings, sine/cosine rule applications, multi-leg journeys' },
      mastery:    { url: 'https://placeholder.video/bearings-mastery',    duration: '8 mins',  tagline: 'Exam-focused · WAEC "find the bearing of B from A" problems with full diagrams' }
    },
    blurb: 'Express directions as three-figure bearings and solve navigation problems using trigonometry.',
    objectives: [
      'State and measure bearings using the three-digit convention.',
      'Find the back bearing from a given bearing.',
      'Solve multi-stage journey problems using sine and cosine rules.'
    ],
    formulas: [
      'Bearing: measured clockwise from North, always 3 digits (e.g. 045°)',
      'Back bearing = bearing ± 180°',
      'Sine rule: a/sin A = b/sin B = c/sin C',
      'Cosine rule: a² = b² + c² − 2bc cos A'
    ],
    subSkills: ['3figure_bearing','back_bearing','sine_cosine_rule'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M6.1 ── Data & Histograms ──────────────────────────────── */
  'mathematics.data_histograms': {
    id: 'mathematics.data_histograms',
    subject: 'mathematics',
    title: 'Data (Histograms & Frequency Polygons)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/data-foundation', duration: '20 mins', tagline: 'Tally charts → frequency tables → drawing histograms, step by step' },
      standard:   { url: 'https://placeholder.video/data-standard',   duration: '12 mins', tagline: 'Default lesson · frequency density, class boundaries, frequency polygons' },
      mastery:    { url: 'https://placeholder.video/data-mastery',    duration: '8 mins',  tagline: 'Exam-focused · reading histogram areas, ogive (cumulative frequency) & WAEC patterns' }
    },
    blurb: 'Construct and interpret histograms, frequency polygons and cumulative frequency curves.',
    objectives: [
      'Organise data into frequency tables with class intervals.',
      'Draw and interpret histograms using frequency density.',
      'Construct and use a cumulative frequency (ogive) curve.'
    ],
    formulas: [
      'Frequency density = frequency / class width',
      'Area of bar = frequency  (in a true histogram)',
      'Ogive: plot cumulative frequency against upper class boundary',
      'Median ≈ value at n/2 on the ogive'
    ],
    subSkills: ['frequency_tables','histograms','ogive'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M6.2 ── Central Tendency ───────────────────────────────── */
  'mathematics.central_tendency': {
    id: 'mathematics.central_tendency',
    subject: 'mathematics',
    title: 'Central Tendency (Mean, Median & Mode)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/central-foundation', duration: '20 mins', tagline: 'What average really means · mean vs median vs mode from real data sets' },
      standard:   { url: 'https://placeholder.video/central-standard',   duration: '12 mins', tagline: 'Default lesson · mean from frequency table, median from grouped data, modal class' },
      mastery:    { url: 'https://placeholder.video/central-mastery',    duration: '8 mins',  tagline: 'Exam-focused · assumed mean, interpolation formula & WAEC table questions' }
    },
    blurb: 'Calculate and interpret mean, median and mode for raw and grouped data.',
    objectives: [
      'Find the mean, median and mode of ungrouped data.',
      'Calculate the mean from a frequency table using Σfx / Σf.',
      'Estimate the median of grouped data using linear interpolation.'
    ],
    formulas: [
      'Mean (ungrouped) = Σx / n',
      'Mean (frequency table) = Σfx / Σf',
      'Assumed mean: x̄ = A + Σfd / Σf',
      'Median interpolation: L + [(n/2 − F) / f] × h'
    ],
    subSkills: ['mean','median','mode'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M6.3 ── Dispersion ─────────────────────────────────────── */
  'mathematics.dispersion': {
    id: 'mathematics.dispersion',
    subject: 'mathematics',
    title: 'Dispersion (Range & Standard Deviation)',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/dispersion-foundation', duration: '20 mins', tagline: 'Why spread matters · range → mean deviation → standard deviation, step by step' },
      standard:   { url: 'https://placeholder.video/dispersion-standard',   duration: '12 mins', tagline: 'Default lesson · range, IQR, mean deviation, variance & standard deviation' },
      mastery:    { url: 'https://placeholder.video/dispersion-mastery',    duration: '8 mins',  tagline: 'Exam-focused · SD from frequency table, comparing distributions & WAEC Qs' }
    },
    blurb: 'Measure the spread of data using range, interquartile range, variance and standard deviation.',
    objectives: [
      'Calculate range and interquartile range from raw and grouped data.',
      'Compute mean deviation and standard deviation.',
      'Interpret and compare measures of dispersion in context.'
    ],
    formulas: [
      'Range = max − min',
      'IQR = Q₃ − Q₁',
      'Variance σ² = Σ(x − x̄)² / n',
      'Standard deviation σ = √[Σ(x − x̄)² / n]',
      'SD from freq table: σ = √[Σf(x − x̄)² / Σf]'
    ],
    subSkills: ['range_iqr','mean_deviation','standard_deviation'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M6.4 ── Probability ────────────────────────────────────── */
  'mathematics.probability': {
    id: 'mathematics.probability',
    subject: 'mathematics',
    title: 'Probability (Independent & Mutually Exclusive)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/probability-foundation', duration: '21 mins', tagline: 'Coin flips & dice · what probability means before any formula' },
      standard:   { url: 'https://placeholder.video/probability-standard',   duration: '13 mins', tagline: 'Default lesson · addition rule, multiplication rule, tree diagrams, conditional' },
      mastery:    { url: 'https://placeholder.video/probability-mastery',    duration: '9 mins',  tagline: 'Exam-focused · combined events, expected value & WAEC table/venn setups' }
    },
    blurb: 'Calculate probabilities of single and combined events using rules and tree diagrams.',
    objectives: [
      'Define probability and find P(A) from the sample space.',
      'Apply the addition rule for mutually exclusive and non-exclusive events.',
      'Use the multiplication rule for independent and dependent events.'
    ],
    formulas: [
      'P(A) = favourable outcomes / total outcomes',
      'P(A ∪ B) = P(A) + P(B) − P(A ∩ B)',
      'Mutually exclusive: P(A ∪ B) = P(A) + P(B)',
      'Independent: P(A ∩ B) = P(A) × P(B)',
      "P(A') = 1 − P(A)"
    ],
    subSkills: ['basic_probability','addition_rule','multiplication_rule'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M7.1 ── Vectors ────────────────────────────────────────── */
  'mathematics.vectors': {
    id: 'mathematics.vectors',
    subject: 'mathematics',
    title: 'Vectors (Magnitude & Components)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/vectors-foundation', duration: '21 mins', tagline: 'What a vector is vs a scalar · drawing vectors · column notation intro' },
      standard:   { url: 'https://placeholder.video/vectors-standard',   duration: '13 mins', tagline: 'Default lesson · addition, subtraction, scalar multiplication, magnitude, unit vectors' },
      mastery:    { url: 'https://placeholder.video/vectors-mastery',    duration: '9 mins',  tagline: 'Exam-focused · position vectors, mid-point, collinearity & WAEC proof questions' }
    },
    blurb: 'Represent, add, subtract and find the magnitude of vectors in two dimensions.',
    objectives: [
      'Represent a vector as a column vector and by magnitude and direction.',
      'Add, subtract vectors and multiply by a scalar.',
      'Find the magnitude and unit vector of a given vector.'
    ],
    formulas: [
      'a = (x, y)  (column vector)',
      '|a| = √(x² + y²)  (magnitude)',
      'Unit vector: â = a / |a|',
      'Midpoint of AB: M = ½(a + b)',
      'AB = b − a'
    ],
    subSkills: ['representation','operations','magnitude'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ── M7.2 ── Transformations ────────────────────────────────── */
  'mathematics.transformations': {
    id: 'mathematics.transformations',
    subject: 'mathematics',
    title: 'Transformations (Reflect, Rotate & Translate)',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/transforms-foundation', duration: '21 mins', tagline: 'Tracing paper approach first · then coordinate rules · visually clear' },
      standard:   { url: 'https://placeholder.video/transforms-standard',   duration: '13 mins', tagline: 'Default lesson · reflection, rotation, translation, enlargement with matrices' },
      mastery:    { url: 'https://placeholder.video/transforms-mastery',    duration: '9 mins',  tagline: 'Exam-focused · combined transformations, invariant points & WAEC matrix Qs' }
    },
    blurb: 'Perform and describe reflections, rotations, translations and enlargements on the coordinate plane.',
    objectives: [
      'Reflect a shape in a given line and state the mirror line.',
      'Rotate a shape about a given centre and angle.',
      'Describe and apply translations using column vectors and enlargements using a scale factor.'
    ],
    formulas: [
      'Reflection in x-axis: (x, y) → (x, −y)',
      'Reflection in y-axis: (x, y) → (−x, y)',
      'Rotation 90° CCW about O: (x, y) → (−y, x)',
      'Translation by vector (a, b): (x, y) → (x+a, y+b)',
      'Enlargement by factor k from O: (x, y) → (kx, ky)'
    ],
    subSkills: ['reflection','rotation','translation_enlargement'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ================================================================
     LITERATURE
     ================================================================ */

  'literature.lion_and_the_jewel': {
    id: 'literature.lion_and_the_jewel',
    subject: 'literature',
    title: 'The Lion and the Jewel',
    duration: '16 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/lion-foundation', duration: '24 mins', tagline: 'Plot retold scene-by-scene · character intros · key vocabulary' },
      standard:   { url: 'https://placeholder.video/lion-standard',   duration: '16 mins', tagline: 'Default lesson · themes, conflict & symbolism' },
      mastery:    { url: 'https://placeholder.video/lion-mastery',    duration: '11 mins', tagline: 'Exam-focused · essay angles, quote bank & past WAEC questions' }
    },
    blurb: 'Wole Soyinka\'s comedy about tradition versus modernity in the village of Ilujinle.',
    objectives: [
      'Identify the major characters and their roles.',
      'Analyse the central conflict between Baroka and Lakunle.',
      'Trace the symbolism of the "jewel" through the play.'
    ],
    formulas: [
      'Theme · Tradition vs Modernity',
      'Setting · Ilujinle village, Nigeria',
      'Genre · Satirical comedy',
      'Author · Wole Soyinka (1959)'
    ],
    subSkills: ['characters','themes','plot'],
    powerUp: {
      kind: 'literature.character_tree',
      content: {
        nodes: [
          { id: 'sidi',    icon: '👸', name: 'Sidi',    role: 'The "Jewel" of Ilujinle — proud and beautiful.' },
          { id: 'baroka',  icon: '🦁', name: 'Baroka',  role: 'The Lion — cunning village Bale (chief).' },
          { id: 'lakunle', icon: '👨‍🏫', name: 'Lakunle', role: 'The young schoolteacher — modern, idealistic.' },
          { id: 'sadiku',  icon: '👵', name: 'Sadiku',  role: 'Baroka\'s eldest wife and matchmaker.' }
        ],
        edges: [
          'Lakunle ❤ wants to marry → Sidi (refuses bride-price)',
          'Baroka 🦁 schemes for → Sidi (uses Sadiku as pawn)',
          'Sadiku 👵 reports false news → Sidi → Baroka\'s trap'
        ]
      }
    }
  },

  'literature.things_fall_apart': {
    id: 'literature.things_fall_apart',
    subject: 'literature',
    title: 'Things Fall Apart',
    duration: '18 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/tfa-foundation', duration: '26 mins', tagline: 'Chapter-by-chapter retelling · Igbo terms explained' },
      standard:   { url: 'https://placeholder.video/tfa-standard',   duration: '18 mins', tagline: 'Default lesson · Okonkwo as tragic hero, colonial collapse' },
      mastery:    { url: 'https://placeholder.video/tfa-mastery',    duration: '12 mins', tagline: 'Exam-focused · thematic essay templates & quote analysis' }
    },
    blurb: 'Chinua Achebe\'s portrayal of pre-colonial Igbo society and the arrival of Europeans.',
    objectives: [
      'Understand Okonkwo as a tragic hero.',
      'Discuss the impact of colonisation on Umuofia.',
      'Recognise key Igbo cultural practices in the novel.'
    ],
    formulas: ['Author · Chinua Achebe (1958)','Setting · Umuofia, Igboland','Protagonist · Okonkwo','Theme · Colonisation & cultural collapse'],
    subSkills: ['characters','culture','themes'],
    powerUp: {
      kind: 'literature.character_tree',
      content: {
        nodes: [
          { id: 'okonkwo',  icon: '⚔️',  name: 'Okonkwo',  role: 'Tragic hero — driven by fear of weakness.' },
          { id: 'nwoye',    icon: '🙇',  name: 'Nwoye',    role: 'Okonkwo\'s son — converts to Christianity.' },
          { id: 'ezinma',   icon: '🌟',  name: 'Ezinma',   role: 'His favourite daughter — wise beyond her years.' },
          { id: 'obierika', icon: '🤝',  name: 'Obierika', role: 'Okonkwo\'s thoughtful friend & moral mirror.' }
        ],
        edges: [
          'Okonkwo ⚔️ disowns → Nwoye (for joining missionaries)',
          'Okonkwo ⚔️ secretly admires → Ezinma',
          'Obierika 🤝 questions → Umuofia\'s harsh customs'
        ]
      }
    }
  },

  /* ================================================================
     BIOLOGY
     ================================================================ */

  'biology.enzymes': {
    id: 'biology.enzymes',
    subject: 'biology',
    title: 'Enzymes',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/enzymes-foundation', duration: '18 mins', tagline: 'Built from scratch · enzymes, substrates, products explained simply' },
      standard:   { url: 'https://placeholder.video/enzymes-standard',   duration: '12 mins', tagline: 'Default lesson · lock-and-key, factors & denaturation' },
      mastery:    { url: 'https://placeholder.video/enzymes-mastery',    duration: '8 mins',  tagline: 'Exam-focused · graph interpretation, induced fit & inhibitor types' }
    },
    blurb: 'Biological catalysts — how they speed up reactions without being consumed.',
    objectives: [
      'Define an enzyme and describe its protein structure.',
      'Explain the lock-and-key model of enzyme action.',
      'Identify factors that affect enzyme activity.'
    ],
    formulas: [
      'Substrate + Enzyme → ES complex → Product + Enzyme',
      'Optimum pH ≈ 7  (most human enzymes)',
      'Optimum T ≈ 37 °C (human body)',
      'Denatured > 60 °C'
    ],
    subSkills: ['definition','mechanism','factors'],
    powerUp: {
      kind: 'biology.decoder',
      content: {
        items: [
          { tag: '-ase',   meaning: 'identifies an enzyme  (e.g. lipase, amylase, protease)' },
          { tag: 'lip-',   meaning: 'fat / lipid           (lipase digests fats)' },
          { tag: 'amyl-',  meaning: 'starch                (amylase digests starch)' },
          { tag: 'prote-', meaning: 'protein               (protease digests protein)' },
          { tag: 'sub-',   meaning: 'the molecule the enzyme acts on (substrate)' }
        ]
      }
    }
  },

  'biology.photosynthesis': {
    id: 'biology.photosynthesis',
    subject: 'biology',
    title: 'Photosynthesis',
    duration: '13 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/photo-foundation', duration: '20 mins', tagline: 'Slow walkthrough · what plants do, with simple diagrams' },
      standard:   { url: 'https://placeholder.video/photo-standard',   duration: '13 mins', tagline: 'Default lesson · equation, two stages, conditions' },
      mastery:    { url: 'https://placeholder.video/photo-mastery',    duration: '9 mins',  tagline: 'Exam-focused · limiting factors, experiments & graph reading' }
    },
    blurb: 'How green plants convert light energy into chemical energy stored in glucose.',
    objectives: [
      'Write the balanced equation of photosynthesis.',
      'Identify the conditions and pigments required.',
      'Distinguish between the light-dependent and light-independent stages.'
    ],
    formulas: [
      '6CO₂ + 6H₂O —(light, chlorophyll)→ C₆H₁₂O₆ + 6O₂',
      'Light stage · in the thylakoid',
      'Calvin cycle · in the stroma',
      'Pigment · chlorophyll a & b'
    ],
    subSkills: ['equation','stages','factors'],
    powerUp: {
      kind: 'biology.decoder',
      content: {
        items: [
          { tag: 'photo-',  meaning: 'light                 (photosynthesis = light + building)' },
          { tag: '-synth',  meaning: 'to build / make       (synthesis = construction)' },
          { tag: 'chloro-', meaning: 'green                 (chlorophyll = green leaf pigment)' },
          { tag: '-phyll',  meaning: 'leaf                  (chloro-phyll = green leaf)' },
          { tag: 'stoma-',  meaning: 'mouth / opening       (stomata exchange gases on leaves)' }
        ]
      }
    }
  },

  /* ================================================================
     ENGLISH
     ================================================================ */

  'english.subject_verb_agreement': {
    id: 'english.subject_verb_agreement',
    subject: 'english',
    title: 'Subject–Verb Agreement',
    duration: '9 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/sva-foundation', duration: '14 mins', tagline: 'Built from scratch · what is a subject, what is a verb, with examples' },
      standard:   { url: 'https://placeholder.video/sva-standard',   duration: '9 mins',  tagline: 'Default lesson · all rules covered with examples' },
      mastery:    { url: 'https://placeholder.video/sva-mastery',    duration: '6 mins',  tagline: 'Exam-focused · trickiest cases · collective nouns, "either/or"' }
    },
    blurb: 'The verb must always agree with its subject in number and person.',
    objectives: [
      'Match singular subjects with singular verbs and plurals with plurals.',
      'Handle compound subjects joined by "and", "or" and "nor".',
      'Apply agreement rules to indefinite pronouns.'
    ],
    formulas: [
      'Singular subject + Verb-s   ·  "She runs"',
      'Plural subject + Verb       ·  "They run"',
      'Either / Or → verb agrees with the nearest subject',
      'Each / Every / Everyone → singular verb'
    ],
    subSkills: ['singular_plural','compound_subjects','indefinite'],
    powerUp: {
      kind: 'english.grammar_formula',
      content: {
        tokens: ['Singular Subject', '+', 'Verb-s', '=', '✔ Agreement'],
        note: 'When the subject is one person/thing, add an "s" to the present-tense verb. The dog barks. (NOT: The dog bark.)'
      }
    }
  },

  'english.tenses': {
    id: 'english.tenses',
    subject: 'english',
    title: 'Tenses',
    duration: '11 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/tenses-foundation', duration: '17 mins', tagline: 'Slow walkthrough · time line for past/present/future · loads of examples' },
      standard:   { url: 'https://placeholder.video/tenses-standard',   duration: '11 mins', tagline: 'Default lesson · simple, continuous & perfect forms' },
      mastery:    { url: 'https://placeholder.video/tenses-mastery',    duration: '7 mins',  tagline: 'Exam-focused · tense-shift errors & narrative consistency' }
    },
    blurb: 'Past, present, future — and how each one branches into simple, continuous and perfect.',
    objectives: [
      'Form the simple, continuous and perfect tenses.',
      'Use time markers to choose the right tense.',
      'Avoid common tense-shifting mistakes in writing.'
    ],
    formulas: [
      'Present Simple · S + V / V-s',
      'Present Continuous · S + am/is/are + V-ing',
      'Past Simple · S + V-ed / V₂',
      'Present Perfect · S + has/have + V₃'
    ],
    subSkills: ['simple','continuous','perfect'],
    powerUp: {
      kind: 'english.grammar_formula',
      content: {
        tokens: ['Subject', '+', 'has/have', '+', 'V₃'],
        note: 'Present Perfect describes past actions still relevant now. "She has finished her homework." (V₃ = past participle)'
      }
    }
  }

};

/* Returns the blueprint for a topicId or null (the legacy-fallback signal). */
window.getBlueprint = function(topicId){
  return Object.prototype.hasOwnProperty.call(window.TOPIC_BLUEPRINT, topicId)
    ? window.TOPIC_BLUEPRINT[topicId]
    : null;
};

/* Topics indexed by subject for the sidebar. */
window.getTopicsBySubject = function(subjectId){
  return Object.values(window.TOPIC_BLUEPRINT).filter(t => t.subject === subjectId);
};
