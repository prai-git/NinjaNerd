/* Maps an authored content heading onto a legacy subtopic id (app/js/subtopics-data.js).

   The legacy Flask app curated a fixed subtopic list and generated questions on demand, so
   nothing ever had to be filed against it. Our questions are authored ahead of time under
   STAAR/MAP headings ("Reporting Category 2 — Computations and Algebraic Relationships",
   "Selection 4 — Poem: *Rain on the Tin Roof*"), which is why a mapping layer is needed.

   Rules are ordered: the FIRST match wins, so put specific patterns above general ones.
   `confident: false` marks a heading whose bucket is a genuine judgment call — those are
   listed separately in the review report for the owner to confirm or correct.

   Grade matters: grades 1-5 have 5 buckets (7 for math, per the owner-approved additions),
   grade 6 has 10. A rule may therefore give a different id per grade band. */

const G6 = (grade) => grade >= 6;

/* ---------------------------------------------------------------- math -- */
const MATH = [
  // Financial literacy — its own bucket at 1-5 (owner-approved); at grade 6 the legacy
  // data_analysis_functions bucket carries STAAR's combined "Data Analysis & Personal
  // Financial Literacy" category.
  [/financial\s+literacy|income\s+and\s+expense/i,
    (g) => (G6(g) ? 'data_analysis_functions' : 'financial_literacy')],

  // Reporting Category 4 is literally "Data Analysis AND Personal Financial Literacy" — it
  // mixes two buckets, so the split is a judgment call.
  [/reporting\s+category\s+4/i,
    (g) => (G6(g) ? 'data_analysis_functions' : 'measurement_data'), false],

  [/reporting\s+category\s+1/i, (g) => (G6(g) ? 'advanced_number_systems' : 'number_sense_basic_operations')],
  [/reporting\s+category\s+2/i, (g) => (G6(g) ? 'algebraic_concepts' : 'algebraic_concepts')],
  [/reporting\s+category\s+3/i, (g) => (G6(g) ? 'advanced_geometry_measurement' : 'geometry_spatial_concepts')],

  [/\bpercentages?\b|\bproportion|\bratios?\b/i,
    (g) => (G6(g) ? 'proportional_reasoning_percentages' : 'fractions_decimals'), false],

  [/algebra|inequalit|equations?\s+with\s+unknown|patterns?\/functions|additive\s+vs/i,
    (g) => (G6(g) ? 'algebraic_concepts' : 'algebraic_concepts')],

  // "Operations & Algebraic Thinking" is the early-grades CCSS domain for add/subtract; at
  // grades 1-2 it is arithmetic, not algebra. Judgment call.
  [/operations?\s*&\s*algebraic\s+thinking/i,
    (g) => (G6(g) ? 'algebraic_concepts' : 'number_sense_basic_operations'), false],

  [/\bfractions?\b|\bdecimals?\b|mixed\s+number/i, () => 'fractions_decimals'],

  [/coordinate\s+plane|geometry|area\s+and\s+perimeter|\bvolume\b|2d\s+figures|\bshapes?\b/i,
    (g) => (G6(g) ? 'advanced_geometry_measurement' : 'geometry_spatial_concepts')],

  [/measurement|unit\s+conversion|customary\s+length/i,
    (g) => (G6(g) ? 'advanced_geometry_measurement' : 'measurement_data')],

  [/data\s+analysis|probability|statistics|\bgraphs?\b|frequency\s+table/i,
    (g) => (G6(g) ? 'data_analysis_functions' : 'measurement_data')],

  [/place\s+value|prime\s+and\s+composite|order\s+of\s+operations|multi-?digit|computation|estimation|number\s*(&|and)?\s*(number\s+sense|operations)|numerical\s+representation/i,
    (g) => (G6(g) ? 'advanced_number_systems' : 'number_sense_basic_operations')],

  [/word\s+problem|multi-?topic|challenge|problem\s+solving/i,
    () => 'problem_solving_applications'],
];

/* ------------------------------------------------------------- english -- */
const ENGLISH = [
  [/vocabulary|prefix|suffix|synonym|antonym|analog|idiom|root\s+word/i,
    () => 'vocabulary_building'],

  // Editing/revision is conventions; plain "grammar" is mechanics. Both appear together in
  // headings like "Writing and Grammar", so the split is a judgment call.
  [/revis|editing|convention|punctuation|capitali[sz]|spelling/i,
    (g) => (G6(g) ? 'advanced_punctuation_style' : 'written_conventions'), false],

  [/grammar|\blanguage\b|parts\s+of\s+speech|sentence/i,
    (g) => (G6(g) ? 'advanced_grammar_applications' : 'grammar_language_mechanics'), false],

  [/writing|compos|essay|research/i,
    (g) => (G6(g) ? 'advanced_writing_styles' : 'writing_essentials'), false],

  // Everything passage-shaped is reading comprehension. This is the bulk of English: the
  // authored sets are organised by passage, not by skill.
  [/passage|selection|poem|poetry|literary|informational|argument|nonfiction|fiction|reading|text\b|paired/i,
    (g) => (G6(g) ? 'literary_analysis_comprehension' : 'reading_fundamentals')],
];

/* ------------------------------------------------------------- science -- */
const SCIENCE = [
  [/scientific\s*(&|and)?\s*engineering|investigation|engineering\s+design|recurring\s+themes|integrated\s+(map|science)|adaptive\s+review/i,
    (g) => (G6(g) ? 'scientific_methods_research' : 'scientific_investigation_skills')],

  [/\bearth\b|\bspace\b|weather|climate|\brocks?\b|fossil/i,
    (g) => (G6(g) ? 'earth_space_science' : 'earth_systems')],

  [/biolog|life\s+science|organism|ecosystem|\bcells?\b|human\s+body|\bplants?\b|\banimal|\btraits?\b|classification|photosynthesis/i,
    (g) => (G6(g) ? 'advanced_biology' : 'life_science_fundamentals')],

  [/\bforces?\b|\bmotion\b|\benergy\b|\bwaves?\b|magnetism|electricity|stability/i,
    (g) => (G6(g) ? 'physics_energy_systems' : 'forces_energy')],

  [/\bmatter\b|chemistry|physical\s+science|properties|interactions/i,
    (g) => (G6(g) ? 'chemistry_concepts' : 'physical_science_basics')],
];

/* An authored heading that names a legacy subtopic outright means exactly that.

   The keyword rules below are grade-aware and route grade 6 to the ADVANCED variants, which
   is right for content authored under STAAR/MAP category names. But it makes the five base
   subtopics grade 6 also offers unreachable: a set written specifically to fill
   "Number Sense & Basic Operations" at grade 6 would land in "Advanced Number Systems".

   So a heading matching a subtopic's own name wins, before any keyword rule. Authoring to
   fill a named gap then hits that gap by intent rather than by luck. */
import { SUBTOPICS, subtopicsForGrade } from '../../app/js/subtopics-data.js';

const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CANONICAL = new Map();
for (const subj of Object.keys(SUBTOPICS)) {
  for (const grp of Object.keys(SUBTOPICS[subj])) {
    for (const s of SUBTOPICS[subj][grp]) CANONICAL.set(`${subj}|${key(s.name)}`, s.id);
  }
}

/* Only honour the name if that subtopic is actually OFFERED at this grade.

   Without the grade check, existing grade 1-4 content headed "Earth & Space Science" mapped to
   `earth_space_science`, which is a GRADE 6 subtopic — the grades 1-5 equivalent is
   `earth_systems`. Those items landed in a bucket their grade does not have, emptying Earth
   Systems at four grades at once. */
function canonicalId(subject, grade, heading) {
  const id = CANONICAL.get(`${subject}|${key(heading)}`);
  if (!id) return null;
  return subtopicsForGrade(subject, grade).some((s) => s.id === id) ? id : null;
}

const RULES = { math: MATH, english: ENGLISH, science: SCIENCE };

/* Fallback when no rule matches.

   For ENGLISH this is expected and correct, not a gap: the authored sets name each reading
   passage by its title ("The Old Kite", "A Cooler Playground", "The Dance of the Honeybee").
   A title carries no skill keyword by definition, so anything that reaches here is a passage
   and belongs in reading. Matching arbitrary titles by pattern is impossible; falling through
   IS the rule. Such rows are reported as "passage title" rather than unmapped.

   For MATH and SCIENCE a fallback hit means a real gap in the rules above, and is reported
   as UNMAPPED so it gets a proper rule instead of sitting in a catch-all. */
const FALLBACK = {
  math: (g) => (G6(g) ? 'advanced_number_systems' : 'problem_solving_applications'),
  english: (g) => (G6(g) ? 'literary_analysis_comprehension' : 'reading_fundamentals'),
  science: (g) => (G6(g) ? 'scientific_methods_research' : 'scientific_investigation_skills'),
};

export function mapSubtopic(subject, grade, heading) {
  const text = String(heading || '');
  // A heading that names a subtopic outright wins over every keyword rule.
  const exact = canonicalId(subject, grade, text);
  if (exact) return { id: exact, confident: true, matched: 'canonical-name' };
  const rules = RULES[subject] || [];
  for (const [re, pick, confident = true] of rules) {
    if (re.test(text)) return { id: pick(grade), confident, matched: String(re) };
  }
  const fb = FALLBACK[subject];
  // An English heading with no skill keyword is a passage title; see FALLBACK above.
  const passageTitle = subject === 'english';
  return {
    id: fb ? fb(grade) : null,
    confident: passageTitle,
    matched: null,
    passageTitle,
    unmapped: !passageTitle,
  };
}
