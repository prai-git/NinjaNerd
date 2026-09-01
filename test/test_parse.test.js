import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseFilename, parseGrade, parseQuestions, parseAnswers, slug,
  extractAnswerLetter, extractAnswerText,
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
  for (const [g, subs] of Object.entries(manifest.grades)) {
    for (const [subj, entries] of Object.entries(subs)) {
      for (const e of entries) {
        const items = JSON.parse(readFileSync(
          join(repoRoot, `app/content/questions/en/${g}/${subj}/${e.slug}.json`), 'utf8'));
        for (const it of items) {
          total++;
          if (it.passage) withPassage++;
          else if (refersToText.test(it.question || '')) orphaned++;
        }
      }
    }
  }
  /* Not a fixed number: the corpus grows as the empty subtopics are filled. What matters is
     that a parser change never LOSES items — 15 vanished once when a heading rule was widened
     and only the count caught it. */
  assert.ok(total >= 1368, `item count fell to ${total}; a parser change is dropping questions`);
  assert.ok(withPassage > 300, `expected 300+ items with passages, got ${withPassage}`);
  assert.ok(orphaned <= 10, `${orphaned} questions still refer to a passage they do not have`);
});
