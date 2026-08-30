import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, shuffleArray, shuffleOptions, buildAttempt,
} from '../app/js/quiz.js';

const item = (correctIndex) => ({
  id: 'q1', grade: 3, subject: 'math', subtopic: 'Fractions',
  question: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex,
});

test('shuffleArray returns a permutation without mutating the input', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffleArray(src, mulberry32(42));
  assert.equal(out.length, src.length);
  assert.deepEqual([...out].sort(), [...src].sort());
  assert.deepEqual(src, [1, 2, 3, 4, 5]); // original untouched
});

test('shuffleOptions preserves the correct-answer mapping across many seeds', () => {
  for (let seed = 0; seed < 200; seed++) {
    const original = item(2); // 'C' is correct
    const shuffled = shuffleOptions(original, mulberry32(seed));
    // The option text at the new correctIndex must equal the original correct text.
    assert.equal(shuffled.options[shuffled.correctIndex], original.options[original.correctIndex]);
    // Same four options, just reordered.
    assert.deepEqual([...shuffled.options].sort(), ['A', 'B', 'C', 'D']);
    // Original object is not mutated.
    assert.equal(original.correctIndex, 2);
  }
});

test('shuffleOptions distributes the correct answer across all positions', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    seen.add(shuffleOptions(item(0), mulberry32(seed)).correctIndex);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]); // every slot is reachable
});

test('buildAttempt shuffles order + options while keeping mappings intact', () => {
  const deck = [item(0), item(1), item(2)];
  deck[0].id = 'a'; deck[1].id = 'b'; deck[2].id = 'c';
  // Expected correct option text per source id.
  const want = { a: 'A', b: 'B', c: 'C' };
  const attempt = buildAttempt(deck, mulberry32(7));
  assert.equal(attempt.length, 3);
  assert.deepEqual(attempt.map((q) => q.id).sort(), ['a', 'b', 'c']);
  for (const q of attempt) {
    assert.equal(q.options[q.correctIndex], want[q.id]); // mapping survived reordering
    assert.deepEqual([...q.options].sort(), ['A', 'B', 'C', 'D']);
  }
});
