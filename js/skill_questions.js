/* ============================================================
   questions.js — Question bank for diagnostics, drills and
   the lesson Quick-Check.

   Each question supports the optional fields:
     difficulty   (1=easy, 2=medium, 3=hard)   default: 2
     is_drill     (true  ⇒ excluded from the Predicted Score)
     sub_skill_tag                              default: null
   Older questions without these fields default at read-time.
============================================================ */

window.QUESTION_BANK = {

  /* ====== mathematics.quadratics ====== */
  'mathematics.quadratics': [
    /* --- diagnostic / quick-check --- */
    { id:'q1', q:'What is the standard form of a quadratic equation?',
      options:['ax + b = 0','ax² + bx + c = 0','ax³ + bx² + c = 0','x = a/b'],
      answer:1, difficulty:1, sub_skill_tag:'factorising',
      explain:'A quadratic has degree 2 — the highest power of x is 2.' },
    { id:'q2', q:'Solve: x² − 5x + 6 = 0',
      options:['x = 2 or 3','x = -2 or -3','x = 1 or 6','x = 0 or 5'],
      answer:0, difficulty:2, sub_skill_tag:'factorising',
      explain:'(x − 2)(x − 3) = 0  \u21D2  x = 2 or 3.' },
    { id:'q3', q:'For x² + 4x + 5 = 0, what does the discriminant tell us?',
      options:['Two real roots','One repeated root','No real roots','Cannot tell'],
      answer:2, difficulty:3, sub_skill_tag:'discriminant',
      explain:'Δ = 16 − 20 = -4 < 0, so there are no real roots.' },

    /* --- drills (is_drill: true — excluded from Predicted Score) --- */
    { id:'d1', q:'Factorise: x² − 9',
      options:['(x − 3)(x − 3)','(x − 9)(x + 1)','(x − 3)(x + 3)','(x + 9)(x − 1)'],
      answer:2, difficulty:1, is_drill:true, sub_skill_tag:'factorising',
      explain:'Difference of two squares: a² − b² = (a − b)(a + b).' },
    { id:'d2', q:'Use the formula to solve x² − 4x + 1 = 0',
      options:['x = 2 ± √3','x = 4 ± √3','x = 1 ± √3','x = -2 ± √3'],
      answer:0, difficulty:2, is_drill:true, sub_skill_tag:'formula',
      explain:'x = (4 ± √(16 − 4))/2 = (4 ± √12)/2 = 2 ± √3.' },
    { id:'d3', q:'How many real roots does 2x² + 3x − 5 = 0 have?',
      options:['0','1','2','3'],
      answer:2, difficulty:2, is_drill:true, sub_skill_tag:'discriminant',
      explain:'Δ = 9 + 40 = 49 > 0 \u21D2 two real roots.' }
  ],

  /* ====== mathematics.linear_equations ====== */
  'mathematics.linear_equations': [
    { id:'q1', q:'Solve: 3x − 7 = 11',
      options:['x = 4','x = 6','x = 18/3','x = -6'],
      answer:1, difficulty:1, sub_skill_tag:'isolate',
      explain:'3x = 18  \u21D2  x = 6.' },
    { id:'q2', q:'What is the slope of y = -2x + 5?',
      options:['5','-2','2','-5'],
      answer:1, difficulty:1, sub_skill_tag:'graphing',
      explain:'In y = mx + c, m is the slope.' },
    { id:'q3', q:'Solve simultaneously: x + y = 10, x − y = 2',
      options:['x=4, y=6','x=6, y=4','x=5, y=5','x=8, y=2'],
      answer:1, difficulty:2, sub_skill_tag:'simultaneous',
      explain:'Add the equations: 2x = 12  \u21D2  x = 6, then y = 4.' },

    { id:'d1', q:'Solve: 4(x − 1) = 12', options:['x = 3','x = 4','x = 2','x = 6'],
      answer:1, difficulty:1, is_drill:true, sub_skill_tag:'isolate',
      explain:'x − 1 = 3  \u21D2  x = 4.' },
    { id:'d2', q:'Slope between (1,2) and (3,8)?', options:['2','3','4','6'],
      answer:1, difficulty:2, is_drill:true, sub_skill_tag:'graphing',
      explain:'(8−2)/(3−1) = 6/2 = 3.' }
  ],

  /* ====== mathematics.indices ====== */
  'mathematics.indices': [
    { id:'q1', q:'Simplify: 2³ × 2⁴', options:['2⁷','2¹²','4⁷','2¹'],
      answer:0, difficulty:1, sub_skill_tag:'index_laws',
      explain:'aᵐ × aⁿ = aᵐ⁺ⁿ \u21D2 2³⁺⁴ = 2⁷.' },
    { id:'q2', q:'What is 5⁰?', options:['0','1','5','undefined'],
      answer:1, difficulty:1, sub_skill_tag:'index_laws',
      explain:'Any non-zero number raised to 0 is 1.' },
    { id:'q3', q:'Express 0.000045 in standard form.',
      options:['4.5 × 10⁻⁵','4.5 × 10⁵','45 × 10⁻⁶','0.45 × 10⁻⁴'],
      answer:0, difficulty:2, sub_skill_tag:'standard_form',
      explain:'Move the decimal 5 places right: 4.5 × 10⁻⁵.' },

    { id:'d1', q:'Simplify: (3²)³', options:['3⁵','3⁶','3⁹','9³'],
      answer:1, difficulty:2, is_drill:true, sub_skill_tag:'index_laws',
      explain:'(aᵐ)ⁿ = aᵐⁿ \u21D2 3²ˣ³ = 3⁶.' }
  ],

  /* ====== literature.lion_and_the_jewel ====== */
  'literature.lion_and_the_jewel': [
    { id:'q1', q:'Who wrote The Lion and the Jewel?',
      options:['Chinua Achebe','Wole Soyinka','Ngũgĩ wa Thiong\'o','Ola Rotimi'],
      answer:1, difficulty:1, sub_skill_tag:'characters',
      explain:'Wole Soyinka wrote the play in 1959.' },
    { id:'q2', q:'Who is referred to as "the Jewel" of Ilujinle?',
      options:['Sadiku','Sidi','Ailatu','The Stranger'],
      answer:1, difficulty:1, sub_skill_tag:'characters',
      explain:'Sidi is the village beauty whose photographs spread her fame.' },
    { id:'q3', q:'Which theme runs through the whole play?',
      options:['War and peace','Tradition versus modernity','Religion','Industrialisation'],
      answer:1, difficulty:2, sub_skill_tag:'themes',
      explain:'Baroka represents tradition; Lakunle represents modernity.' },

    { id:'d1', q:'How does Baroka trick Sidi?',
      options:['He pays a bride-price','He pretends to be impotent','He kidnaps her','He sends Lakunle away'],
      answer:1, difficulty:2, is_drill:true, sub_skill_tag:'plot',
      explain:'Baroka feigns impotence so Sadiku will reveal the news to Sidi, who then visits him out of curiosity.' },
    { id:'d2', q:'Why does Lakunle refuse to pay the bride-price?',
      options:['He has no money','He thinks it is "uncivilised"','Sidi forbids it','It is illegal'],
      answer:1, difficulty:2, is_drill:true, sub_skill_tag:'themes',
      explain:'Lakunle sees it as a barbaric custom that treats women as property.' }
  ],

  /* ====== literature.things_fall_apart ====== */
  'literature.things_fall_apart': [
    { id:'q1', q:'Who is the protagonist of Things Fall Apart?',
      options:['Nwoye','Obierika','Okonkwo','Unoka'],
      answer:2, difficulty:1, sub_skill_tag:'characters',
      explain:'Okonkwo is the central tragic hero.' },
    { id:'q2', q:'In what village is the novel mainly set?',
      options:['Mbanta','Umuofia','Abame','Ilujinle'],
      answer:1, difficulty:1, sub_skill_tag:'culture',
      explain:'Most of the action takes place in Umuofia.' },
    { id:'q3', q:'What ultimately drives Okonkwo to suicide?',
      options:['His son\'s conversion','The colonial collapse of his world','Loss of his yam farm','Banishment'],
      answer:1, difficulty:3, sub_skill_tag:'themes',
      explain:'When the clan refuses to fight the colonial messengers, Okonkwo realises his world has fallen apart.' },

    { id:'d1', q:'Who joins the Christian missionaries?',
      options:['Okonkwo','Obierika','Nwoye','Ezinma'],
      answer:2, difficulty:2, is_drill:true, sub_skill_tag:'characters',
      explain:'Nwoye, Okonkwo\'s eldest son, converts and takes the name Isaac.' }
  ],

  /* ====== biology.enzymes ====== */
  'biology.enzymes': [
    { id:'q1', q:'Enzymes are best described as biological…',
      options:['Substrates','Hormones','Catalysts','Vitamins'],
      answer:2, difficulty:1, sub_skill_tag:'definition',
      explain:'They speed up reactions without being consumed.' },
    { id:'q2', q:'Which model best describes enzyme–substrate binding?',
      options:['Lock-and-key','Sliding-filament','Fluid mosaic','Beta-pleat'],
      answer:0, difficulty:2, sub_skill_tag:'mechanism',
      explain:'The active site fits the substrate like a key fits a lock.' },
    { id:'q3', q:'Above 60 °C most human enzymes…',
      options:['Speed up forever','Become denatured','Turn into substrates','Reproduce'],
      answer:1, difficulty:2, sub_skill_tag:'factors',
      explain:'High heat changes the enzyme\'s shape so it can no longer bind substrate.' },

    { id:'d1', q:'The suffix "-ase" tells you a molecule is most likely a…',
      options:['Sugar','Hormone','Enzyme','Vitamin'],
      answer:2, difficulty:1, is_drill:true, sub_skill_tag:'definition',
      explain:'Most enzymes end in "-ase": lipase, amylase, protease, etc.' },
    { id:'d2', q:'Which enzyme breaks down starch?',
      options:['Lipase','Protease','Amylase','Maltase'],
      answer:2, difficulty:2, is_drill:true, sub_skill_tag:'mechanism',
      explain:'Amyl- = starch; -ase = enzyme. Amylase breaks starch into maltose.' }
  ],

  /* ====== biology.photosynthesis ====== */
  'biology.photosynthesis': [
    { id:'q1', q:'Which gas is absorbed during photosynthesis?',
      options:['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'],
      answer:2, difficulty:1, sub_skill_tag:'equation',
      explain:'Plants absorb CO₂ from the air to build glucose.' },
    { id:'q2', q:'In which plant organelle does photosynthesis happen?',
      options:['Mitochondria','Chloroplast','Ribosome','Nucleus'],
      answer:1, difficulty:1, sub_skill_tag:'stages',
      explain:'Chloroplasts contain chlorophyll, the green pigment that traps light.' },
    { id:'q3', q:'The Calvin cycle takes place in the…',
      options:['Thylakoid','Matrix','Stroma','Cytoplasm'],
      answer:2, difficulty:3, sub_skill_tag:'stages',
      explain:'Light-independent reactions occur in the stroma of the chloroplast.' },

    { id:'d1', q:'"Photo-" means…', options:['Water','Light','Green','Leaf'],
      answer:1, difficulty:1, is_drill:true, sub_skill_tag:'equation',
      explain:'Photo = light. Photosynthesis = building with light.' }
  ],

  /* ====== english.subject_verb_agreement ====== */
  'english.subject_verb_agreement': [
    { id:'q1', q:'Choose the correct sentence:',
      options:['The boys plays football.','The boy play football.','The boy plays football.','The boys plays footballs.'],
      answer:2, difficulty:1, sub_skill_tag:'singular_plural',
      explain:'Singular subject "the boy" + verb-s "plays".' },
    { id:'q2', q:'Either John or his brothers ____ responsible.',
      options:['is','are','was','be'],
      answer:1, difficulty:2, sub_skill_tag:'compound_subjects',
      explain:'With "either…or", the verb agrees with the nearer subject ("brothers" \u2192 are).' },
    { id:'q3', q:'Everyone in the class ____ the answer.',
      options:['know','knows','are knowing','have known'],
      answer:1, difficulty:2, sub_skill_tag:'indefinite',
      explain:'"Everyone" is a singular indefinite pronoun \u2192 singular verb "knows".' },

    { id:'d1', q:'My friend, along with her cousins, ____ here.',
      options:['are','were','is','have'],
      answer:2, difficulty:2, is_drill:true, sub_skill_tag:'singular_plural',
      explain:'The subject is singular ("my friend"); the prepositional phrase doesn\'t change agreement.' },
    { id:'d2', q:'Each of the students ____ a book.',
      options:['have','has','are having','having'],
      answer:1, difficulty:1, is_drill:true, sub_skill_tag:'indefinite',
      explain:'"Each" is singular \u2192 "has".' }
  ],

  /* ====== english.tenses ====== */
  'english.tenses': [
    { id:'q1', q:'Which sentence is in the Present Continuous?',
      options:['She runs every day.','She is running now.','She ran yesterday.','She has run twice.'],
      answer:1, difficulty:1, sub_skill_tag:'continuous',
      explain:'Present Continuous = am/is/are + V-ing.' },
    { id:'q2', q:'Choose the Past Simple form: "go".',
      options:['gone','goes','going','went'],
      answer:3, difficulty:1, sub_skill_tag:'simple',
      explain:'go \u2192 went (irregular past simple).' },
    { id:'q3', q:'"I ___ here since 2020." (live)',
      options:['live','am living','have lived','lived'],
      answer:2, difficulty:2, sub_skill_tag:'perfect',
      explain:'"Since 2020" needs Present Perfect \u2192 have lived.' },

    { id:'d1', q:'Past participle of "write"?',
      options:['wrote','writted','written','writing'],
      answer:2, difficulty:1, is_drill:true, sub_skill_tag:'perfect',
      explain:'write \u2192 wrote \u2192 written.' }
  ]
};

/* Read-time defaulter: ensures every question carries the optional fields. */
window.getQuestions = function(topicId){
  const raw = window.QUESTION_BANK[topicId] || [];
  return raw.map(q => ({
    difficulty: 2,
    is_drill: false,
    sub_skill_tag: null,
    ...q
  }));
};

/* Convenience selectors used by the gatekeeper / chamber. */
window.getQuickCheck = function(topicId){
  return window.getQuestions(topicId).filter(q => !q.is_drill);
};
window.getDrills = function(topicId, subSkillTag){
  return window.getQuestions(topicId).filter(q =>
    q.is_drill && (!subSkillTag || q.sub_skill_tag === subSkillTag)
  );
};
