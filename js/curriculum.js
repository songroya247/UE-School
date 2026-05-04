/* ============================================================
   curriculum.js — Minimal shell + non-sheet subject fallbacks
   ============================================================
   MATHEMATICS topics are managed entirely via Google Sheets.
   To add/edit a maths topic: update the Google Sheet CSV (see
   config.js → GOOGLE_SHEET_CURRICULUM_CSV_URL). No code change
   needed — the sheet overrides TOPIC_BLUEPRINT automatically.

   This file only contains:
     1. window.SUBJECTS           — subject list & accent colours
     2. Non-sheet subjects        — Literature, Biology, English
                                    (kept here until they have a
                                    dedicated sheet of their own)
     3. Helper functions          — getBlueprint, getTopicsBySubject
   ============================================================ */

window.SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', accent: '#2563eb' },
  { id: 'literature',  name: 'Literature',  accent: '#7c3aed' },
  { id: 'biology',     name: 'Biology',     accent: '#16a34a' },
  { id: 'english',     name: 'English',     accent: '#ea580c' }
];

/* TOPIC_BLUEPRINT — sheet topics are merged into this object by
   gsheet-curriculum.js at page load. Entries here are fallbacks
   for subjects not yet on the sheet. */
window.TOPIC_BLUEPRINT = {

  /* ================================================================
     LITERATURE
     ================================================================ */

  'literature.lion_and_the_jewel': {
    id: 'literature.lion_and_the_jewel',
    subject: 'literature',
    title: 'The Lion and the Jewel',
    duration: '16 mins',
    videos: {
      foundation: { url: '', duration: '24 mins', tagline: 'Plot retold scene-by-scene · character intros · key vocabulary' },
      standard:   { url: '', duration: '16 mins', tagline: 'Default lesson · themes, conflict & symbolism' },
      mastery:    { url: '', duration: '11 mins', tagline: 'Exam-focused · essay angles, quote bank & past WAEC questions' }
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
      foundation: { url: '', duration: '26 mins', tagline: 'Chapter-by-chapter retelling · Igbo terms explained' },
      standard:   { url: '', duration: '18 mins', tagline: 'Default lesson · Okonkwo as tragic hero, colonial collapse' },
      mastery:    { url: '', duration: '12 mins', tagline: 'Exam-focused · thematic essay templates & quote analysis' }
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
      foundation: { url: '', duration: '18 mins', tagline: 'Built from scratch · enzymes, substrates, products explained simply' },
      standard:   { url: '', duration: '12 mins', tagline: 'Default lesson · lock-and-key, factors & denaturation' },
      mastery:    { url: '', duration: '8 mins',  tagline: 'Exam-focused · graph interpretation, induced fit & inhibitor types' }
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
      foundation: { url: '', duration: '20 mins', tagline: 'Slow walkthrough · what plants do, with simple diagrams' },
      standard:   { url: '', duration: '13 mins', tagline: 'Default lesson · equation, two stages, conditions' },
      mastery:    { url: '', duration: '9 mins',  tagline: 'Exam-focused · limiting factors, experiments & graph reading' }
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
      foundation: { url: '', duration: '14 mins', tagline: 'Built from scratch · what is a subject, what is a verb, with examples' },
      standard:   { url: '', duration: '9 mins',  tagline: 'Default lesson · all rules covered with examples' },
      mastery:    { url: '', duration: '6 mins',  tagline: 'Exam-focused · trickiest cases · collective nouns, "either/or"' }
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
      foundation: { url: '', duration: '17 mins', tagline: 'Slow walkthrough · time line for past/present/future · loads of examples' },
      standard:   { url: '', duration: '11 mins', tagline: 'Default lesson · simple, continuous & perfect forms' },
      mastery:    { url: '', duration: '7 mins',  tagline: 'Exam-focused · tense-shift errors & narrative consistency' }
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
