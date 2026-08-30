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
