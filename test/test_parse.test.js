import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseFilename, parseGrade, parseQuestions, parseAnswers, slug,
  extractAnswerLetter, extractAnswerText, cleanExplanation, stripCrossQuestionRefs,
  cleanQuestion, passageKey, sourceLabelsIn,
} from '../tools/lib/parse.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(fx, f), 'utf8');

const MAP_Q = 'practice_questions_math_map_boy_2026-08-29_11-55.md';
const MAP_A = 'answers_math_map_boy_2026-08-29_11-55.md';
const OLD_Q = 'practice_questions_math_2026-03-07_14-30.md';
const OLD_A = 'answers_math_2026-03-07_14-30.md';

test('parseFilename extracts subject/test/phase/date/time (MAP)', () => {
  const f = parseFilename(MAP_Q);
  assert.equal(f.subject, 'math');
  assert.equal(f.test, 'map');
  assert.equal(f.phase, 'boy');
  assert.equal(f.date, '2026-08-29');
  assert.equal(f.time, '11-55');
});

test('parseFilename handles legacy files with no test/phase', () => {
  const f = parseFilename(OLD_Q);
  assert.equal(f.subject, 'math');
  assert.equal(f.test, null);
  assert.equal(f.phase, null);
  assert.equal(f.date, '2026-03-07');
});

// A `-g<N>` suffix marks which grade a set belongs to when several sets share one
// date/time stamp. It must still parse, or ids collapse to `<subject>_x_x_qN`.
test('parseFilename handles a -g<N> grade suffix', () => {
  const f = parseFilename('practice_questions_math_staar_2026-08-29_23-09-g4.md');
  assert.equal(f.subject, 'math');
  assert.equal(f.test, 'staar');
  assert.equal(f.date, '2026-08-29');
  assert.equal(f.time, '23-09');
  assert.equal(f.grade, 4);
  // The unsuffixed sibling parses to the same stamp but no grade.
  assert.equal(parseFilename('practice_questions_math_staar_2026-08-29_23-09.md').grade, null);
});

// STAAR answer keys head each answer with `**Correct answer/value:** A. <text>`.
test('extractAnswerLetter reads the STAAR "Correct answer/value" header', () => {
  assert.equal(extractAnswerLetter('**Correct answer/value:** A. 7,000,000'), 'A');
  assert.equal(extractAnswerLetter('**Correct answer/value:** C. cubic centimeters'), 'C');
  // A griddable value must not be misread as a letter.
  assert.equal(extractAnswerLetter('**Correct answer/value:** 0.45'), null);
  // The plain forms still work.
  assert.equal(extractAnswerLetter('Correct answer: B'), 'B');
  assert.equal(extractAnswerLetter('**Answer:** D'), 'D');
});

test('extractAnswerText reads a value-style "Correct answer/value" header', () => {
  assert.equal(extractAnswerText('**Correct answer/value:** 14'), '14');
  assert.equal(extractAnswerText('**Correct answer/value:** 7/9'), '7/9');
  // A letter answer is a letter, not text.
  assert.equal(extractAnswerText('**Correct answer/value:** A. 7,000,000'), 'A. 7,000,000');
  assert.equal(extractAnswerText('**Answer: 7/20 of a pizza**'), '7/20 of a pizza');
});

test('parseAnswers pairs STAAR letters and griddable values', () => {
  const md = [
    '## Answer 1', '', '**Correct answer/value:** A. 7,000,000  ',
    '**Step-by-step solution:** The 7 is in the millions place.  ', '', '---', '',
    '## Answer 5', '', '**Correct answer/value:** 0.45  ',
    '**Step-by-step solution:** $0.4+0.05=0.45$.  ', '',
  ].join('\n');
  const a = parseAnswers(md);
  assert.equal(a[1].letter, 'A');
  assert.equal(a[5].letter, null);
  assert.equal(a[5].text, '0.45');
});

// Some sets open with a blank answer-sheet grid. Breaking there yielded zero questions
// and silently dropped a whole grade/subject from the build.
test('parseQuestions skips a leading Answer Sheet and still finds the questions', () => {
  const md = [
    '# Practice Questions — Science',
    '**Grade:** 5th Grade',
    '',
    '## Answer Sheet (fill in your answers here)',
    '',
    '| Q | Answer |',
    '|---|--------|',
    '| 1 | |',
    '',
    '---',
    '',
    '## Section 1: Cells',
    '',
    '**Question 1** *(TEKS 5.10)*',
    '',
    'Which structure do all cells have?',
    '',
    '- A) A cell wall',
    '- B) A cell membrane',
    '- C) Chloroplasts',
    '- D) A nucleus',
  ].join('\n');
  const qs = parseQuestions(md);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].subtopic, 'Cells');
  // Bullet-form options (`- A) text`) must be captured, not treated as body text.
  assert.deepEqual(qs[0].options.map((o) => o.letter), ['A', 'B', 'C', 'D']);
  assert.equal(qs[0].options[1].text, 'A cell membrane');
});

// A trailing answer sheet must still terminate parsing.
test('parseQuestions stops at a trailing Answer Sheet', () => {
  const md = [
    '# Set', '', '## Question 1', '', 'What is 2+2?', '',
    'A. 4', 'B. 5', '', '## Answer Sheet', '', '| Q | Answer |', '| 1 | |',
  ].join('\n');
  const qs = parseQuestions(md);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].options.length, 2);
});

test('parseGrade reads grade from H1 and metadata', () => {
  assert.equal(parseGrade(read(MAP_Q)), 6);
  assert.equal(parseGrade(read(OLD_Q)), 5);
});

test('parseQuestions extracts MCQ questions with options and subtopic', () => {
  const qs = parseQuestions(read(MAP_Q));
  assert.equal(qs.length, 2);
  assert.equal(qs[0].number, 1);
  assert.equal(qs[0].subtopic, 'Numerical Representations & Relationships');
  assert.equal(qs[0].options.length, 4);
  assert.deepEqual(qs[0].options.map((o) => o.letter), ['A', 'B', 'C', 'D']);
  assert.match(qs[0].options[1].text, /explorer is farther/);
  assert.match(qs[0].teks, /TEKS 6\.2B/);
  // Answer Sheet section must not be parsed as a question.
  assert.ok(qs.every((q) => Number.isInteger(q.number)));
});

test('parseQuestions extracts legacy free-response questions (no options)', () => {
  const qs = parseQuestions(read(OLD_Q));
  assert.equal(qs.length, 3);
  assert.equal(qs[0].subtopic, 'Fractions');
  assert.equal(qs[2].subtopic, 'Multiplication and Division');
  assert.equal(qs[0].options.length, 0);
  assert.match(qs[0].text, /Sarah has 3\/4 of a pizza/);
});

test('parseAnswers reads MCQ answer letters', () => {
  const a = parseAnswers(read(MAP_A));
  assert.equal(a[1].letter, 'B');
  assert.equal(a[2].letter, 'A');
  assert.match(a[1].explanation, /Absolute value/);
});

test('parseAnswers reads free-response answer text', () => {
  const a = parseAnswers(read(OLD_A));
  assert.equal(a[1].letter, null);
  assert.equal(a[1].text, '7/20 of a pizza');
  assert.equal(a[3].text, '65,688 toys');
});

test('parseAnswers reads a summary-table answer key', () => {
  const md = [
    '# English — Answer Key',
    '',
    '## Answer Summary Sheet',
    '',
    '| Q  | Answer | TEKS Standard |',
    '|----|--------|--------------|',
    '| 1  | C      | 5.3B |',
    '| 2  | B      | 5.3C |',
  ].join('\n');
  const a = parseAnswers(md);
  assert.equal(a[1].letter, 'C');
  assert.equal(a[2].letter, 'B');
});

test('parseAnswers reads a multi-column summary table', () => {
  const md = [
    '## Quick Reference Answer Key',
    '| Q | Answer | Q | Answer | Q | Answer |',
    '|---|--------|---|--------|---|--------|',
    '| 1 | B | 11 | C | 21 | A |',
    '| 2 | D | 12 | B | 22 | See rubric |',
  ].join('\n');
  const a = parseAnswers(md);
  assert.equal(a[1].letter, 'B');
  assert.equal(a[11].letter, 'C');
  assert.equal(a[21].letter, 'A');
  assert.equal(a[12].letter, 'B');
  assert.ok(!a[22]); // "See rubric" is not a letter -> not captured
});

test('slug normalizes subtopics for file paths', () => {
  assert.equal(slug('Numerical Representations & Relationships'), 'numerical-representations-and-relationships');
  assert.equal(slug('Multiplication and Division'), 'multiplication-and-division');
});

/* Reading passages (2026-09-01).

   175 questions shipped referring to a passage they did not contain — "How does Marcus MOST
   change from the beginning of the passage to the end?" with no passage. The prose was in the
   source all along; the parser read the passage TITLE as a subtopic and discarded the body,
   which also produced subtopics literally named "The First Bowl" and "The Old Kite". */

test('a heading followed by prose is a passage, not a subtopic', () => {
  const md = [
    '# 6th Grade Reading',
    '# Instructional Area: Literary Text',
    '## The First Bowl',
    'x'.repeat(250),
    '## Question 4  *(TEKS 6.7)*',
    'Which statement BEST expresses the theme?',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  assert.equal(q.passageTitle, 'The First Bowl');
  assert.ok(q.passage.length >= 250, 'the passage body is kept — this is what was being lost');
  /* The passage title also becomes the raw subtopic. That is harmless since prompt 00b:
     subtopics are MAPPED onto the legacy taxonomy, and "The First Bowl" maps to reading
     just as "Literary Text" does. What must never happen again is the passage body being
     discarded. */
});

test('a heading with no prose is a subtopic and does not become a passage', () => {
  const md = [
    '# Grade 5 ELA',
    '## Section 1: Vocabulary and Word Study',
    '## Question 1',
    'What does *aptitude* mean?',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  // cleanSubtopic strips the "Section N:" prefix.
  assert.equal(q.subtopic, 'Vocabulary and Word Study');
  assert.equal(q.passage, null);
});

test('a deeper section heading does not end the passage above it', () => {
  /* STAAR nests sections under a passage; questions in them still refer to it. Clearing on
     every heading orphaned twelve questions from Reading Passage 1. */
  const md = [
    '# Grade 5 ELA',
    '## Reading Passage 1 — Informational Text',
    'y'.repeat(250),
    '### Section 1: Vocabulary and Word Study',
    '## Question 1',
    'What does it mean?',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  assert.equal(q.passageTitle, 'Reading Passage 1 — Informational Text');
  assert.equal(q.subtopic, 'Vocabulary and Word Study', 'the deeper heading still names the subtopic');
});

test('a same-level heading with no prose DOES end the passage', () => {
  const md = [
    '# Grade 5 ELA',
    '## Reading Passage 1',
    'z'.repeat(250),
    '## Section 5: Grammar',
    '## Question 1',
    'Which sentence is correct?',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  assert.equal(q.passage, null, 'grammar questions must not inherit a reading passage');
});

test('"Read the story." inside a question does not terminate it', () => {
  /* Widening the heading match to H3 (for "### Section 1:") made these end the question they
     belonged to, silently losing 15 grade-2 English items — stem, options and all. */
  const md = [
    '# Grade 2 English',
    '## Question 19 [MOY]',
    '### Read the story.',
    'Ana found a shell.',
    'What did Ana find?',
    '- **A.** a shell', '- **B.** a rock', '- **C.** a cup', '- **D.** a hat',
  ].join('\n');
  const qs = parseQuestions(md);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].options.length, 4, 'the options must survive');
});

test('a question-range heading points at a passage instead of ending it', () => {
  // "### Questions 1–8: Refer to ..." is a label, not a section break.
  const md = [
    '# Grade 5 ELA',
    '## Reading Passage 1',
    '### The Printing Press',
    'w'.repeat(250),
    '### Questions 1–8: Refer to "The Printing Press"',
    '## Question 1',
    'According to the passage, what changed?',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  assert.equal(q.passageTitle, 'The Printing Press');
});

test('passages listed up front are found by back-reference', () => {
  /* Some sets list every passage first, then group questions as "Questions 1–8 — Passage 1".
     Positional scoping cannot resolve that; without the lookup every such question is
     orphaned, and "In Passage 1, revealed means—" is unanswerable. */
  const md = [
    '# Grade 4 ELAR',
    '## Passage 1 — Informational Text: *The Map of Cool Places*',
    'a'.repeat(250),
    '## Passage 2 — Literary Fiction: *The Backward Sign*',
    'b'.repeat(250),
    '## Questions 1–8 — Passage 1',
    '## Question 1',
    'In Passage 1, revealed means—',
    '- **A.** one', '- **B.** two', '- **C.** three', '- **D.** four',
  ].join('\n');
  const [q] = parseQuestions(md);
  assert.match(q.passageTitle, /Passage 1/);
  assert.ok(q.passage.startsWith('a'), 'must attach Passage 1, not the most recent passage');
});

test('the built content carries passages through to the JSON', () => {
  /* End-to-end guard: the parser can be right while the build drops the field. 175 questions
     shipped unanswerable, so this asserts the served JSON actually has them. */
  const manifest = JSON.parse(readFileSync(
    join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  let total = 0; let withPassage = 0; let orphaned = 0;
  const refersToText =
    /\b(the passage|the story|the poem|the excerpt|according to the|the author|in passage \d)\b/i;
  /* A question may carry its own text INLINE as a blockquote instead of using the shared
     `passage` field:

         Read the passage below.
         > The lighthouse keeper had not spoken to anyone in nine weeks.
         What does the passage suggest about the keeper?

     That is self-contained and answerable, which is the only thing this guard actually cares
     about. It is also the better shape for THIS app: practice serves one shuffled question at
     a time, so a passage shared across a numbered run of questions is the awkward case and a
     question that carries its own text is the clean one. */
  const carriesTextInline = (q) => /^\s*>/m.test(q || '');
  for (const [g, subs] of Object.entries(manifest.grades)) {
    for (const [subj, entries] of Object.entries(subs)) {
      for (const e of entries) {
        const items = JSON.parse(readFileSync(
          join(repoRoot, `app/content/questions/en/${g}/${subj}/${e.slug}.json`), 'utf8'));
        for (const it of items) {
          total++;
          if (it.passage) withPassage++;
          else if (refersToText.test(it.question || '') && !carriesTextInline(it.question)) {
            orphaned++;
          }
        }
      }
    }
  }
  /* Not a fixed number: the corpus grows as the empty subtopics are filled. What matters is
     that a parser change never LOSES items — 15 vanished once when a heading rule was widened
     and only the count caught it. */
  assert.ok(total >= 1368, `item count fell to ${total}; a parser change is dropping questions`);
  assert.ok(withPassage > 300, `expected 300+ items with passages, got ${withPassage}`);
  /* Four pre-existing grade-5 items still reference a passage they neither own nor carry
     inline (english_g5_2026-04-03_10-15 q3, q4, q8 and one more). They are known and within
     tolerance; the bound stays low so a regression that orphans a run of questions still
     fails, as it did when 175 shipped unanswerable. */
  assert.ok(orphaned <= 10, `${orphaned} questions still refer to a passage they do not have`);
});

/* ---- cleanExplanation (2026-09-01) --------------------------------------------------------

   Found by rendering the whole corpus and reading the output. Explanations are shown to a
   child AFTER a wrong answer, and they carried three things from the authoring format:
   the answer key, standards codes, and option letters. Practice SHUFFLES the options, so a
   stated letter was wrong in 78% of 3000 trials — a confident, false statement.

   The tests below are split deliberately: what must be REMOVED, and what must SURVIVE. The
   second half matters more. Every case there is real corpus text that an over-broad rule
   destroyed while I was writing this. */

test('the answer-key line goes — the page already shows the answer, correctly', () => {
  assert.equal(cleanExplanation('**Correct answer: B. sock**\n**Explanation:** X.').trim(),
    '**Explanation:** X.');
  assert.equal(cleanExplanation('**Correct Answer:** A) The bird sings.\n\nBecause.').trim(),
    'Because.');
  // The same claim as a trailing sentence, 50 items, all one template.
  assert.equal(cleanExplanation('Evidence supports it. Therefore, **C** is the best answer.').trim(),
    'Evidence supports it.');
});

test('standards annotations go, anywhere in the block and not just line 1', () => {
  // Line 1 was all the old stripper ever looked at; these put the key first and the code second.
  assert.equal(cleanExplanation('**MAP area / TEKS:** Reading Foundations; 1.2A(ii).\n**Explanation:** X.').trim(),
    '**Explanation:** X.');
  assert.equal(cleanExplanation('**Topic:** T\n**TEKS:** 5.4\n\n**Solution:** X.').trim(),
    '**Topic:** T\n\n**Solution:** X.');
  assert.equal(cleanExplanation('**TEKS 6.12B** — Ecological relationships\n**Key concept:** X.').trim(),
    '**Key concept:** X.');
});

test('an option letter is dropped when the option TEXT follows it', () => {
  // "**B** *bird sing* does not agree" still reads correctly without the label.
  assert.match(cleanExplanation('**Why the other answers are wrong:**\n- **B** *bird sing* does not agree.'),
    /- \*bird sing\* does not agree\./);
  assert.match(cleanExplanation('**Why the other answers are wrong:** A *map* begins /m/; C *top* begins /t/.'),
    /\*map\* begins \/m\/; \*top\* begins \/t\/\./);
});

test('a distractor section whose letters are the SUBJECT is dropped whole, not mangled', () => {
  /* "B ends /im/" cannot lose its letter and still parse — the first attempt produced
     "ends /im/", which is worse than either keeping or dropping it. And it cannot be kept:
     after the shuffle it names the wrong option. */
  const out = cleanExplanation(
    '**Explanation:** X.\n**Why the other answers are wrong:** B ends /im/; C ends /unk/.');
  assert.equal(out.trim(), '**Explanation:** X.');
  assert.doesNotMatch(out, /ends \/im\//, 'the fragment must not survive');
});

test('a distractor section is judged as a UNIT, never item by item', () => {
  /* Deciding line by line produced lists where two items had lost their letter and a third
     had kept it. The surviving letter then looks authoritative, which is the worst outcome. */
  const mixed = '**Why the other answers are wrong:**\n'
    + '- **B** *bird sing* does not agree.\n'   // strippable
    + '- **C** plural *birds* needs *sing*.\n'  // NOT strippable
    + '- **D** *singing* alone is incomplete.';
  const out = cleanExplanation(mixed);
  assert.doesNotMatch(out, /\*\*[A-D]\*\*/, 'no letter may survive its section');
  assert.doesNotMatch(out, /bird sing/, 'and the section goes as a whole');
});

test('every distractor-header variant in the corpus is recognised', () => {
  // Counted, not guessed: wrong (643/309/164/40), incorrect (56), distractor note (1).
  for (const header of [
    'Why the other answers are wrong:', 'Why other answers are wrong:',
    'Why others are wrong:', 'Why other answers are incorrect:',
    'Why the others are wrong:', 'Distractor note:',
  ]) {
    const out = cleanExplanation(`**Explanation:** Keep me.\n**${header}** B ends /im/.`);
    assert.equal(out.trim(), '**Explanation:** Keep me.', `missed variant: ${header}`);
  }
});

/* ---- what must SURVIVE. Each of these was destroyed by a draft of the rules above. ---- */

test('real teaching prose is never touched', () => {
  const keep = [
    // "A" is the article, not option A. An early rule ate it.
    '**Explanation:** A number n is greater than 15.',
    '**Explanation:** A singular subject takes the *-s* form of the verb.',
    // A sub-skill name is not a standard.
    '**Topic:** Finding Percent Discount',
    // The corpus really does explain sublimation using the word STAAR.
    '**Key concept:** Sublimation = solid to gas. Dry ice is the classic STAAR example.',
    // "map area" in geometry must not match the "MAP area" keyword — hence case-sensitivity.
    '**Key Concept:** The map area of a rectangle is length x width.',
    // A distractor section with no letters at all is useful and stays.
    '**Why the other answers are wrong:** they use the wrong unit.',
  ];
  for (const text of keep) {
    assert.equal(cleanExplanation(text).trim(), text.trim(), `must survive: ${text}`);
  }
});

test('cleaning never empties an explanation, across the whole shipped corpus', () => {
  /* The guard that matters. Every rule here deletes text, and a rule that is one character
     too greedy turns a teaching aid into a blank card. */
  const man = JSON.parse(readFileSync(
    join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  assert.ok(man.grades, 'manifest should be present');

  const root = join(repoRoot, 'app/content/questions/en');
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json') && name !== 'manifest.json') files.push(p);
    }
  }(root));

  let withExplanation = 0;
  for (const f of files) {
    for (const item of JSON.parse(readFileSync(f, 'utf8'))) {
      if (!item.explanation) continue;
      withExplanation++;
      assert.ok(item.explanation.trim().length > 0, `${item.id} has a blank explanation`);
      // Idempotent: re-cleaning shipped content must be a no-op.
      assert.equal(cleanExplanation(item.explanation), item.explanation,
        `${item.id} is not stable under a second clean`);
    }
  }
  assert.ok(withExplanation > 1000, `expected the corpus, saw ${withExplanation}`);
});

test('no shipped explanation states an option letter as the answer', () => {
  // The defect that started this: wrong in 78% of shuffles.
  const root = join(repoRoot, 'app/content/questions/en');
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json') && name !== 'manifest.json') {
        for (const item of JSON.parse(readFileSync(p, 'utf8'))) {
          if (item.explanation && /correct answer:\s*\*{0,2}[A-D]\b/i.test(item.explanation)) {
            offenders.push(item.id);
          }
        }
      }
    }
  }(root));
  assert.deepEqual(offenders, [], `these state an option letter: ${offenders.slice(0, 5)}`);
});

/* ---- stripCrossQuestionRefs (2026-09-01, reported on the live site) ----------------------- */

test('cross-question references go, but the instruction stays', () => {
  /* Authored sets number their questions and share a passage across several. Practice serves
     ONE question at a time, shuffled, so "questions 34-37" points at nothing the child can
     see. The owner hit this directly: "what is questions 34-37". */
  const cases = [
    ['*Read the following passage and answer questions 34–37.*', '*Read the following passage.*'],
    ['*Read the following story and answer questions 12-15.*', '*Read the following story.*'],
    ['*Use the diagram below for Questions 34–37:*', '*Use the diagram below:*'],
    ["*Read the following paragraph from a student's essay and answer questions 8-9.*",
      "*Read the following paragraph from a student's essay.*"],
  ];
  for (const [input, want] of cases) {
    assert.equal(stripCrossQuestionRefs(input), want);
  }
});

test('both dash characters in the corpus are handled', () => {
  // The authored files use an en dash in some sets and a hyphen in others.
  assert.equal(stripCrossQuestionRefs('answer questions 1–2.'), '.');
  assert.equal(stripCrossQuestionRefs('answer questions 1-2.'), '.');
});

test('ordinary uses of the word "questions" are untouched', () => {
  for (const keep of [
    'How many questions did Maria answer correctly?',
    'The survey had 34 questions in total.',
    'Answer the questions using the table.',
  ]) {
    assert.equal(stripCrossQuestionRefs(keep), keep, `must survive: ${keep}`);
  }
});

test('no shipped item references a question number', () => {
  const root = join(repoRoot, 'app/content/questions/en');
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json') && name !== 'manifest.json') {
        for (const item of JSON.parse(readFileSync(p, 'utf8'))) {
          for (const field of ['question', 'passage', 'explanation']) {
            if (item[field] && /\bQuestions?\s+\d+\s*[–-]\s*\d+/i.test(item[field])) {
              offenders.push(`${item.id}:${field}`);
            }
          }
        }
      }
    }
  }(root));
  assert.deepEqual(offenders, [], `these reference a question number: ${offenders.slice(0, 5)}`);
});

/* A standards code must never reach a child, wherever the author put it. stripStandardsAnnotation
   only inspects line 1, which is right for a heading but misses a question that opens with its
   reading text and carries the code after the passage — 13 items shipped showing "TEKS 6.5F"
   mid-question before this was added. */
test('cleanQuestion strips a standards code from anywhere in a question', () => {
  const q = 'Read the passage below.\n\n> The keeper had not spoken in weeks.\n\n'
    + '**TEKS 6.5F**\nWhat does the passage suggest?';
  const out = cleanQuestion(q);
  assert.doesNotMatch(out, /TEKS/);
  assert.match(out, /lighthouse|keeper/i, 'the reading text must survive');
  assert.match(out, /What does the passage suggest/, 'and so must the question');
});

test('cleanQuestion leaves ordinary question text alone', () => {
  for (const keep of [
    'Which expression has the greatest value?',
    'Read the sentence below.\n\n> The hikers were tired.\n\nWhat does *tired* mean?',
    '**Topic:** Finding Percent Discount',
  ]) {
    assert.equal(cleanQuestion(keep), keep.trim(), `must survive: ${keep}`);
  }
});

test('no shipped question contains a standards code', () => {
  const root = join(repoRoot, 'app/content/questions/en');
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json') && name !== 'manifest.json') {
        for (const item of JSON.parse(readFileSync(p, 'utf8'))) {
          if (/\b(TEKS|MAP area|NWEA|Instructional Area)\b/.test(item.question || '')) {
            offenders.push(item.id);
          }
        }
      }
    }
  }(root));
  assert.deepEqual(offenders, [], `these show a standards code: ${offenders.slice(0, 5)}`);
});

/* PAIRED PASSAGES (2026-09-02).

   19 questions across grades 1, 3, 4, 5 and 6 shipped asking about a text the child was never
   shown. Every one of those passages WAS in the authored source; the parser dropped it.

   Two faults combined. `passageKey` required a leading digit, so "Passage 1" and "Passage 6A"
   were indexed but "Passage A", "Passage B" and every "Source A/B" were not — those sets fell
   back to positional scoping, which keeps only the LAST passage seen. And an item has one
   `passage` field, so even correct scoping cannot serve a question that needs both halves.

   The worst case was grade 3: "Which sentence best paraphrases Passage A?" showed Passage B,
   and all four options quoted the invisible text. */

test('a letter-only source label is a lookup key, like a numbered one', () => {
  assert.equal(passageKey('Passage 1'), 'passage 1');
  assert.equal(passageKey('Passage 6A Literary Fiction'), 'passage 6a');
  // These four were the gap: no leading digit, so none of them was ever indexed.
  assert.equal(passageKey('Passage A — Informational: *A Tiny Free Library*'), 'passage a');
  assert.equal(passageKey('Passage B — Personal Letter'), 'passage b');
  assert.equal(passageKey('Source A: Park Sign'), 'passage a');
  assert.equal(passageKey('Selection 2 — Literary Fiction'), 'passage 2');
  // An ordinary word after "Passage" must not be read as a label, or every heading collides.
  assert.equal(passageKey('Passage About the Sea'), 'passage about the sea');
  assert.equal(passageKey('The Printing Press'), 'the printing press');
});

test('sourceLabelsIn finds every distinct label, in order', () => {
  assert.deepEqual(sourceLabelsIn('How does Passage 6B deepen Passage 6A?'),
    ['passage 6b', 'passage 6a']);
  assert.deepEqual(sourceLabelsIn('Why did the writer of Source B stay still?'), ['passage b']);
  assert.deepEqual(sourceLabelsIn('What is the main idea?'), []);
});

const PAIRED = `# Grade 3 Reading

## Selections 6A and 6B — Paired Passages

### Passage A — Informational: *A Tiny Free Library*

A tiny free library is a weatherproof box where people may take a book or leave a book. Neighbors often build the boxes near sidewalks so walkers can use them. A clear sign explains the simple rule: “Take a book; share a book.” These small libraries can help books travel from one reader to another.

### Passage B — Personal Letter: *Books on Our Block*

Dear City Helpers,

Last month, my dad and I painted a book box bright blue and placed it near the bus stop. At first, only two books sat inside. By the next week, I saw mysteries, comics, and a book about planets. I like checking the box because it feels as if neighbors are leaving friendly surprises for one another.

Sincerely,
Imani

### Questions 37–42

## Question 37

What idea is shared by both passages?

A. People can share books through a small book box.
B. All book boxes must be blue.
C. Only adults may use book boxes.
D. Book boxes should be kept inside buses.

## Question 42

Which sentence best paraphrases Passage A without copying it?

A. A tiny free library lets neighbors exchange books in a small outdoor box.
B. “Take a book; share a book.”
C. A tiny free library is a weatherproof box where people may take a book or leave a book.
D. Books travel from one reader to another.
`;

test('a paired set serves BOTH passages, each under its own heading', () => {
  const qs = parseQuestions(PAIRED);
  for (const n of [37, 42]) {
    const q = qs.find((x) => x.number === n);
    assert.ok(q, `question ${n} parsed`);
    assert.match(q.passage, /tiny free library/i, `q${n} must carry Passage A`);
    assert.match(q.passage, /Dear City Helpers/i, `q${n} must carry Passage B`);
    // Both headings survive, or the child cannot tell which text is which.
    assert.match(q.passage, /\*\*Passage A[^*]*\*\*/, `q${n} labels Passage A`);
    assert.match(q.passage, /\*\*Passage B[^*]*\*\*/, `q${n} labels Passage B`);
  }
  assert.equal(qs.find((x) => x.number === 42).passageTitle, 'Passage A and Passage B');
});

const NOT_PAIRED = `# Grade 4 Reading

## Passage 1 — Informational Text: *The Map of Cool Places*

On the hottest days in Larkspur, some sidewalks seem to glow. The town planning team wanted to
learn where people could find relief from heat, so the team made a shade map that **revealed**
a pattern: tree-covered sidewalks were often cooler than open ones.

## Passage 2 — Literary Fiction: *The Backward Sign*

Talia saw that the paper sign outside the community theater had torn in the wind. She wrote
TICKETS HERE in tall letters, but from the sidewalk the words faced the street backward.

## Questions 1–8 — Passage 1

## Question 1

In Passage 1, revealed means—

A. showed
B. hid
C. painted
D. counted
`;

/* The counterweight to the test above. Grade 4 declares Passages 1-5, 6A and 6B one after
   another before any question, so "consecutive passages" alone cannot mean "a pair" — serving
   all seven to "In Passage 1, revealed means—" would be worse than the bug being fixed. Only a
   letter-suffixed family (A/B, 6A/6B) is treated as paired. */
test('merely consecutive passages are NOT merged into one', () => {
  const q = parseQuestions(NOT_PAIRED).find((x) => x.number === 1);
  assert.match(q.passage, /shade map/i, 'keeps its own passage');
  assert.ok(!/Talia/i.test(q.passage), 'must not absorb the next, unrelated passage');
});

const OUT_OF_SCOPE = `# Grade 4 Reading

## Paired Passages — Passage 6A Informational: *Why Pine Cones Open*

[1] A pine cone is a structure that protects seeds between scales. In damp air, many scales press together, helping keep seeds dry.

[2] In warm, dry air, scales bend outward, allowing seeds to fall or travel in wind. Scientists can compare cones in dry and moist places to study this change.

[3] Not every pine cone acts exactly the same, but the changing scales show how plant structures respond to conditions.

### Passage 6B Literary Fiction: *Mason’s Two Jars*

[1] Mason found two pine cones near tennis courts. He wondered why one cone’s scales stuck out farther than the other’s.

[2] He put one cone in a dry jar and another near a bowl of water. The next morning, the cone near water looked tighter. He drew both cones and labeled the jars instead of trusting memory.

[3] Mason said his test did not prove what every cone would do. He wondered whether the cones would change again if he switched their places.

## Questions 41–46 — Language, Writing, and Research

## Question 45

Which note correctly paraphrases Passage 6A?

A. Scales often close in damp air and spread in dry air, which can release seeds.
B. Pine cones are the prettiest part of a tree.
C. Mason owns two jars.
D. Tennis courts have many trees.
`;

/* A question can sit in a LATER group and still name an earlier passage. Positional scoping
   gives it whatever that group has — for grade 4 question 45 that was nothing at all, and for
   question 13 it was an unrelated story about a torn theatre sign. Naming the label must win. */
test('a question naming a passage outside its group still gets that passage', () => {
  const q = parseQuestions(OUT_OF_SCOPE).find((x) => x.number === 45);
  assert.ok(q.passage, 'question 45 shipped with no passage at all');
  assert.match(q.passage, /pine cone/i, 'must carry the Passage 6A it names');
  assert.match(q.passage, /Mason/i, 'and its pair, as the paper presents them');
});

/* The corpus-wide gate. tools/check-content.mjs enforces the same rule on every build; this
   keeps it true for the shipped content specifically, so a regression fails `npm test` too. */
test('no shipped question names a source the child is not shown', () => {
  const LABEL = /\b(?:passage|source|selection)\s*#?\s*(?:\d{1,2}[A-Za-z]?|[A-Da-d])\b/gi;
  const contentRoot = join(repoRoot, 'app/content/questions/en');
  const dirs = (d) => readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory());
  const bad = [];
  for (const g of dirs(contentRoot)) {
    for (const subj of dirs(join(contentRoot, g))) {
      const sd = join(contentRoot, g, subj);
      for (const f of readdirSync(sd)) {
        if (!f.endsWith('.json')) continue;
        for (const it of JSON.parse(readFileSync(join(sd, f), 'utf8'))) {
          const q = it.question || '';
          // Inline reading material is self-contained; that shape is fine.
          if (/^\s*>/m.test(q)) continue;
          const named = [...new Set([q, ...(it.options || [])].join('\n').match(LABEL) || [])]
            .map((x) => x.toLowerCase().replace(/^(source|selection)/, 'passage'));
          if (!named.length) continue;
          const have = `${it.passageTitle || ''}\n${it.passage || ''}`.toLowerCase()
            .replace(/\b(source|selection)(\s)/g, 'passage$2');
          const missing = named.filter((l) => !have.includes(l));
          if (missing.length) bad.push(`${it.id}: names ${missing.join(', ')}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `${bad.length} questions name a source that is not shown:\n${bad.join('\n')}`);
});
