import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  manifestPath, contentPath, subtopicsFor, subjectsFor,
  loadJson, loadManifest, loadSubtopic,
} from '../app/js/content-loader.js';

const MANIFEST = {
  grades: {
    3: {
      math: [
        { subtopic: 'Fractions', slug: 'fractions', count: 5 },
        { subtopic: 'Geometry', slug: 'geometry', count: 4 },
      ],
      english: [
        { subtopic: 'Vocabulary', slug: 'vocabulary', count: 3 },
      ],
    },
  },
};

const ITEMS = [
  { id: 'q1', question: 'a' },
  { id: 'q2', question: 'b' },
  { id: 'q3', question: 'c' },
];

// A tiny fetch stub: maps known paths to responses, everything else 404s.
function fakeFetch(routes) {
  return async (path) => {
    if (path in routes) return { ok: true, json: async () => routes[path] };
    return { ok: false, status: 404, json: async () => { throw new Error('no body'); } };
  };
}

test('path builders produce the static site layout', () => {
  assert.equal(manifestPath(), 'content/questions/en/manifest.json');
  assert.equal(
    contentPath({ grade: 3, subject: 'math', slug: 'fractions' }),
    'content/questions/en/3/math/fractions.json',
  );
});

test('subtopicsFor lists a subject\'s subtopics with their item counts', () => {
  const math = subtopicsFor(MANIFEST, 3, 'math');
  assert.deepEqual(math.map((s) => s.slug), ['fractions', 'geometry']);
  assert.equal(math.find((s) => s.slug === 'fractions').count, 5);
  assert.equal(math.find((s) => s.slug === 'fractions').subtopic, 'Fractions');

  assert.deepEqual(subtopicsFor(MANIFEST, 3, 'science'), []); // no science content
});

test('subjectsFor lists only subjects that have content, sorted', () => {
  assert.deepEqual(subjectsFor(MANIFEST, 3), ['english', 'math']);
  assert.deepEqual(subjectsFor(MANIFEST, 9), []); // no such grade
});

test('loadJson returns null on a missing/failed response instead of throwing', async () => {
  const fetchImpl = fakeFetch({ '/ok.json': { hello: 'world' } });
  assert.deepEqual(await loadJson('/ok.json', fetchImpl), { hello: 'world' });
  assert.equal(await loadJson('/missing.json', fetchImpl), null);
});

test('loadManifest reads the manifest path', async () => {
  const fetchImpl = fakeFetch({ 'content/questions/en/manifest.json': MANIFEST });
  const m = await loadManifest(fetchImpl);
  assert.equal(m.grades[3].math.length, 2);
});

test('loadSubtopic loads items, and returns [] for a missing file', async () => {
  const path = 'content/questions/en/3/math/fractions.json';
  const fetchImpl = fakeFetch({ [path]: ITEMS });
  const items = await loadSubtopic({ grade: 3, subject: 'math', slug: 'fractions' }, fetchImpl);
  assert.deepEqual(items.map((i) => i.id), ['q1', 'q2', 'q3']);

  const gone = await loadSubtopic({ grade: 3, subject: 'math', slug: 'nope' }, fetchImpl);
  assert.deepEqual(gone, []);
});
