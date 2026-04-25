/* ============================================================
   curriculum.js \u2014 Subjects, topics, and the TOPIC_BLUEPRINT
   ============================================================ */

window.SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', accent: '#2563eb' },
  { id: 'literature',  name: 'Literature',  accent: '#7c3aed' },
  { id: 'biology',     name: 'Biology',     accent: '#16a34a' },
  { id: 'english',     name: 'English',     accent: '#ea580c' }
];

/* TOPIC_BLUEPRINT \u2014 single source of truth for topics, lessons,
   diagnostics, drills, and power-ups per topic. */
window.TOPIC_BLUEPRINT = {

  /* ---------------- MATHEMATICS ---------------- */
  'mathematics.quadratics': {
    id: 'mathematics.quadratics',
    subject: 'mathematics',
    title: 'Quadratic Equations',
    duration: '14 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/quadratics-foundation', duration: '22 mins', tagline: 'Slow walkthrough · 6 worked examples · no prior knowledge assumed' },
      standard:   { url: 'https://placeholder.video/quadratics-standard',   duration: '14 mins', tagline: 'Default lesson · all three solving methods explained' },
      mastery:    { url: 'https://placeholder.video/quadratics-mastery',    duration: '9 mins',  tagline: 'Exam-focused · tricky discriminant cases & past-paper patterns' }
    },
    blurb: 'Master the structure ax² + bx + c = 0 and the three core solving techniques.',
    objectives: [
      'Recognise a quadratic equation in standard form.',
      'Solve quadratics by factorising, completing the square and using the formula.',
      'Interpret the discriminant to predict the number of real roots.'
    ],
    formulas: [
      'ax² + bx + c = 0',
      'x = (-b ± \u221A(b² \u2212 4ac)) / 2a',
      'Sum of roots = -b/a',
      'Product of roots = c/a',
      'Discriminant Δ = b² \u2212 4ac',
      '(x + p)(x + q) = 0'
    ],
    subSkills: ['factorising','formula','discriminant'],
    powerUp: { kind: 'math.slide_divide' }
  },

  'mathematics.linear_equations': {
    id: 'mathematics.linear_equations',
    subject: 'mathematics',
    title: 'Linear Equations',
    duration: '10 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/linear-foundation', duration: '18 mins', tagline: 'Step-by-step · solving from scratch · plenty of examples' },
      standard:   { url: 'https://placeholder.video/linear-standard',   duration: '10 mins', tagline: 'Default lesson · isolation, simultaneous & graphing covered' },
      mastery:    { url: 'https://placeholder.video/linear-mastery',    duration: '7 mins',  tagline: 'Exam-focused · word problems & gradient traps' }
    },
    blurb: 'Solve equations of the form ax + b = c and graph them on the Cartesian plane.',
    objectives: [
      'Isolate the unknown using inverse operations.',
      'Solve simultaneous linear equations by elimination and substitution.',
      'Identify slope and y-intercept from y = mx + c.'
    ],
    formulas: ['y = mx + c', 'm = (y\u2082 \u2212 y\u2081)/(x\u2082 \u2212 x\u2081)', 'ax + b = 0  \u21D2  x = -b/a'],
    subSkills: ['isolate','simultaneous','graphing'],
    powerUp: { kind: 'math.formula_triangle', content: { top: 'd', left: 's', right: 't' } }
  },

  'mathematics.indices': {
    id: 'mathematics.indices',
    subject: 'mathematics',
    title: 'Indices & Surds',
    duration: '12 mins',
    videos: {
      foundation: { url: 'https://placeholder.video/indices-foundation', duration: '20 mins', tagline: 'Slow walkthrough · index laws built from first principles' },
      standard:   { url: 'https://placeholder.video/indices-standard',   duration: '12 mins', tagline: 'Default lesson · all six index laws + standard form' },
      mastery:    { url: 'https://placeholder.video/indices-mastery',    duration: '8 mins',  tagline: 'Exam-focused · negative indices, fractional powers, surd traps' }
    },
    blurb: 'Apply the laws of indices and simplify expressions containing surds.',
    objectives: [
      'Apply the multiplication, division and power laws of indices.',
      'Express numbers in standard form.',
      'Rationalise simple surd denominators.'
    ],
    formulas: ['aᵐ × a\u207F = aᵐ\u207A\u207F','aᵐ ÷ a\u207F = aᵐ\u207B\u207F','(aᵐ)\u207F = aᵐ\u207F','a\u2070 = 1','a\u207B\u207F = 1/a\u207F','\u221Aa × \u221Ab = \u221A(ab)'],
    subSkills: ['index_laws','standard_form','surds'],
    powerUp: { kind: 'math.slide_divide' }
  },

  /* ---------------- LITERATURE ---------------- */
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
          { id: 'sidi',    icon: '\uD83D\uDC78', name: 'Sidi',    role: 'The "Jewel" of Ilujinle \u2014 proud and beautiful.' },
          { id: 'baroka',  icon: '\uD83E\uDD81', name: 'Baroka',  role: 'The Lion \u2014 cunning village Bale (chief).' },
          { id: 'lakunle', icon: '\uD83D\uDC68\u200D\uD83C\uDFEB', name: 'Lakunle', role: 'The young schoolteacher \u2014 modern, idealistic.' },
          { id: 'sadiku',  icon: '\uD83D\uDC75', name: 'Sadiku',  role: 'Baroka\'s eldest wife and matchmaker.' }
        ],
        edges: [
          'Lakunle \u2764 wants to marry \u2192 Sidi (refuses bride-price)',
          'Baroka \uD83E\uDD81 schemes for \u2192 Sidi (uses Sadiku as pawn)',
          'Sadiku \uD83D\uDC75 reports false news \u2192 Sidi \u2192 Baroka\'s trap'
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
          { id: 'okonkwo', icon: '\u2694️', name: 'Okonkwo', role: 'Tragic hero \u2014 driven by fear of weakness.' },
          { id: 'nwoye',   icon: '\uD83D\uDE47', name: 'Nwoye',   role: 'Okonkwo\'s son \u2014 converts to Christianity.' },
          { id: 'ezinma',  icon: '\uD83C\uDF1F', name: 'Ezinma',  role: 'His favourite daughter \u2014 wise beyond her years.' },
          { id: 'obierika',icon: '\uD83E\uDD1D', name: 'Obierika', role: 'Okonkwo\'s thoughtful friend & moral mirror.' }
        ],
        edges: [
          'Okonkwo \u2694️ disowns \u2192 Nwoye (for joining missionaries)',
          'Okonkwo \u2694️ secretly admires \u2192 Ezinma',
          'Obierika \uD83E\uDD1D questions \u2192 Umuofia\'s harsh customs'
        ]
      }
    }
  },

  /* ---------------- BIOLOGY ---------------- */
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
    blurb: 'Biological catalysts \u2014 how they speed up reactions without being consumed.',
    objectives: [
      'Define an enzyme and describe its protein structure.',
      'Explain the lock-and-key model of enzyme action.',
      'Identify factors that affect enzyme activity.'
    ],
    formulas: [
      'Substrate + Enzyme \u2192 ES complex \u2192 Product + Enzyme',
      'Optimum pH \u2248 7  (most human enzymes)',
      'Optimum T \u2248 37 °C (human body)',
      'Denatured > 60 °C'
    ],
    subSkills: ['definition','mechanism','factors'],
    powerUp: {
      kind: 'biology.decoder',
      content: {
        items: [
          { tag: '-ase',      meaning: 'identifies an enzyme  (e.g. lipase, amylase, protease)' },
          { tag: 'lip-',      meaning: 'fat / lipid           (lipase digests fats)' },
          { tag: 'amyl-',     meaning: 'starch                (amylase digests starch)' },
          { tag: 'prote-',    meaning: 'protein               (protease digests protein)' },
          { tag: 'sub-',      meaning: 'the molecule the enzyme acts on (substrate)' }
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
      '6CO\u2082 + 6H\u2082O \u2014(light, chlorophyll)\u2192 C\u2086H\u2081\u2082O\u2086 + 6O\u2082',
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

  /* ---------------- ENGLISH ---------------- */
  'english.subject_verb_agreement': {
    id: 'english.subject_verb_agreement',
    subject: 'english',
    title: 'Subject\u2013Verb Agreement',
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
      'Either / Or \u2192 verb agrees with the nearest subject',
      'Each / Every / Everyone \u2192 singular verb'
    ],
    subSkills: ['singular_plural','compound_subjects','indefinite'],
    powerUp: {
      kind: 'english.grammar_formula',
      content: {
        tokens: ['Singular Subject', '+', 'Verb-s', '=', '\u2714 Agreement'],
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
    blurb: 'Past, present, future \u2014 and how each one branches into simple, continuous and perfect.',
    objectives: [
      'Form the simple, continuous and perfect tenses.',
      'Use time markers to choose the right tense.',
      'Avoid common tense-shifting mistakes in writing.'
    ],
    formulas: [
      'Present Simple · S + V / V-s',
      'Present Continuous · S + am/is/are + V-ing',
      'Past Simple · S + V-ed / V\u2082',
      'Present Perfect · S + has/have + V\u2083'
    ],
    subSkills: ['simple','continuous','perfect'],
    powerUp: {
      kind: 'english.grammar_formula',
      content: {
        tokens: ['Subject', '+', 'has/have', '+', 'V\u2083'],
        note: 'Present Perfect describes past actions still relevant now. "She has finished her homework." (V\u2083 = past participle)'
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
