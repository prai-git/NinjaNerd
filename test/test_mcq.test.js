import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isAlreadyMcq, letterToIndex, splitMultiPart, buildItem } from '../tools/lib/mcq.mjs';
import { parseQuestions, parseAnswers } from '../tools/lib/parse.mjs';
import { buildFile } from '../tools/build-content.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => readFileSync(join(fx, f), 'utf8');

const MAP_Q = 'practice_questions_math_map_boy_2026-08-29_11-55.md';
const MAP_A = 'answers_math_map_boy_2026-08-29_11-55.md';
const OLD_Q = 'practice_questions_math_2026-03-07_14-30.md';
const OLD_A = 'answers_math_2026-03-07_14-30.md';

// Mock OpenAI: returns three fixed distractors, never the correct answer.
const mockLlm = async () => ['wrong one', 'wrong two', 'wrong three'];

test('detector: authored MCQ classified as already-MCQ', () => {
  const qs = parseQuestions(read(MAP_Q));
  assert.equal(isAlreadyMcq(qs[0]), true);
});

test('detector: free-response classified as NOT already-MCQ', () => {
  const qs = parseQuestions(read(OLD_Q));
  assert.equal(isAlreadyMcq(qs[0]), false);
});

test('letterToIndex maps A-D to 0-3', () => {
  assert.equal(letterToIndex('A'), 0);
  assert.equal(letterToIndex('d'), 3);
});

test('buildItem passes MCQ through with correctIndex from answer letter', async () => {
  const qs = parseQuestions(read(MAP_Q));
  const answers = parseAnswers(read(MAP_A));
  const built = await buildItem(qs[0], answers[1]); // answer B
  assert.equal(built.source, 'authored');
  assert.equal(built.needsReview, false);
  assert.equal(built.options.length, 4);
  assert.equal(built.correctIndex, 1);
  assert.match(built.options[built.correctIndex], /explorer is farther/);
});

test('buildItem flags MCQ with a missing answer letter', async () => {
  const qs = parseQuestions(read(MAP_Q));
  const built = await buildItem(qs[0], { number: 1, letter: null });
  assert.equal(built.needsReview, true);
});

test('converter: free-response -> MCQ preserves correct answer VERBATIM', async () => {
  const qs = parseQuestions(read(OLD_Q));
  const answers = parseAnswers(read(OLD_A));
  const built = await buildItem(qs[0], answers[1], { llm: mockLlm });
  assert.equal(built.source, 'llm');
  assert.equal(built.needsReview, false);
  assert.equal(built.options.length, 4);
  // Correct option text must equal the answer key text exactly.
  assert.equal(built.options[built.correctIndex], '7/20 of a pizza');
  // The three distractors from the mock are all present.
  for (const d of ['wrong one', 'wrong two', 'wrong three']) {
    assert.ok(built.options.includes(d), `expected distractor "${d}"`);
  }
});

test('converter: flags needsReview when no answer key text', async () => {
  const qs = parseQuestions(read(OLD_Q));
  const built = await buildItem(qs[0], null, { llm: mockLlm });
  assert.equal(built.needsReview, true);
  assert.match(built.reviewReason, /answer-key/);
});

test('converter: flags needsReview when no LLM available', async () => {
  const qs = parseQuestions(read(OLD_Q));
  const answers = parseAnswers(read(OLD_A));
  const built = await buildItem(qs[0], answers[1]); // no llm passed
  assert.equal(built.needsReview, true);
  assert.match(built.reviewReason, /LLM/);
});

test('converter: flags needsReview with insufficient distractors', async () => {
  const qs = parseQuestions(read(OLD_Q));
  const answers = parseAnswers(read(OLD_A));
  const built = await buildItem(qs[0], answers[1], { llm: async () => ['only one'] });
  assert.equal(built.needsReview, true);
  assert.match(built.reviewReason, /distractor/);
});

test('splitMultiPart splits an a/b/c free-response item', () => {
  const q = { number: 5, subtopic: 'X', options: [], text: 'Compute:\na) 2+2\nb) 3+3\nc) 4+4' };
  const parts = splitMultiPart(q);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((p) => p.part), ['a', 'b', 'c']);
  assert.match(parts[0].text, /2\+2/);
});

test('splitMultiPart leaves already-MCQ items untouched', () => {
  const qs = parseQuestions(read(MAP_Q));
  assert.equal(splitMultiPart(qs[0]).length, 1);
});

test('buildFile emits schema-complete items for an authored MCQ set', async () => {
  const { items } = await buildFile({
    filename: MAP_Q,
    questionsMd: read(MAP_Q),
    answersMd: read(MAP_A),
    llm: mockLlm,
  });
  assert.equal(items.length, 2);
  const it = items[0];
  for (const k of ['id', 'grade', 'subject', 'subtopic', 'question', 'options', 'correctIndex', 'explanation', 'source', 'needsReview']) {
    assert.ok(k in it, `item missing key ${k}`);
  }
  // testType/tier were dropped — the legacy app has no MAP/STAAR concept.
  assert.ok(!('testType' in it) && !('tier' in it), 'testType/tier should be gone');
  assert.equal(it.grade, 6);
  assert.equal(it.subject, 'math');
  assert.equal(it.options.length, 4);
  // Ids carry the grade: sibling sets can share a date/time stamp (see the `-g<N>`
  // suffix case in test_parse) and would otherwise collide.
  assert.match(it.id, /^math_g6_2026-08-29_11-55_q1$/);
});
