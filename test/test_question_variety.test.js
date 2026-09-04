/* Question variety within a subtopic bucket.

   Added 2026-09-04 after the owner reported that grade 7 maths served the same question five
   times running: "A scale drawing uses 1 cm for {3|4|5|6} m. A rectangular garden is {N} cm wide
   on the drawing. What is its actual width?" — twenty of the twenty-five items in the bucket,
   with only the two numbers changing in a strict cycle.

   The root cause was that the grade-7 maths source file had been produced from numeric TEMPLATES
   rather than authored: 250 questions across ten buckets contained roughly 21 distinct question
   forms, each bucket being 20 copies of one template plus 5 of another. Grades 1-6 averaged 0.98
   distinct stems per item; grade 7 maths ran 0.08-0.24.

   This matters more here than it would in most quiz apps because `practice.js` `buildAttempt()`
   applies NO session cap — it serves the entire remaining bucket, so bucket size IS quiz length.
   A child working a templated bucket meets the same sentence twenty times in a row.

   Two guards, both measured on the stem with digits normalised away, because a template's whole
   signature is that only its numbers move:

     1. a bucket must be mostly distinct — at least 75% of its items must have distinct shapes;
     2. no single shape may account for more than a quarter of a bucket.

   The thresholds are set against the corpus as it stands: the weakest real bucket today is
   grade 6 maths advanced_number_systems at 0.82 distinct, and the heaviest legitimate repeat is
   5 of 25 (0.20) in grade 2 english grammar_language_mechanics. Both guards therefore sit clear
   of ordinary authored variation and nowhere near the templated regime they exist to catch. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(repoRoot, 'app/content/questions/en');

const MIN_DISTINCT_RATIO = 0.75;
const MAX_SHARE_OF_ONE_SHAPE = 0.25;

/* Normalising digits away is the whole point: two items that differ only in their numbers are
   the same question to a child. Whitespace and case are flattened so formatting cannot disguise
   a repeat. */
const shapeOf = (q) => String(q || '')
  .replace(/-?\d+(?:[.,]\d+)*/g, '#')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function everyBucket(fn) {
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json') && f !== 'manifest.json') {
        fn(JSON.parse(readFileSync(p, 'utf8')), p.slice(CONTENT.length + 1));
      }
    }
  };
  walk(CONTENT);
}

test('no bucket is built from a handful of numeric templates', () => {
  const failures = [];
  everyBucket((items, name) => {
    if (items.length < 5) return;
    const shapes = new Set(items.map((it) => shapeOf(it.question)));
    const ratio = shapes.size / items.length;
    if (ratio < MIN_DISTINCT_RATIO) {
      failures.push(`${name}: ${shapes.size} distinct shapes across ${items.length} items `
        + `(${ratio.toFixed(2)}, floor ${MIN_DISTINCT_RATIO})`);
    }
  });
  assert.deepEqual(failures, [], `templated buckets:\n  ${failures.join('\n  ')}`);
});

test('no single question shape dominates a bucket', () => {
  const failures = [];
  everyBucket((items, name) => {
    if (items.length < 5) return;
    const counts = new Map();
    for (const it of items) {
      const s = shapeOf(it.question);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    let worstShape = '';
    let worst = 0;
    for (const [s, n] of counts) if (n > worst) { worst = n; worstShape = s; }
    if (worst / items.length > MAX_SHARE_OF_ONE_SHAPE) {
      failures.push(`${name}: one shape appears ${worst}/${items.length} times `
        + `— "${worstShape.slice(0, 80)}"`);
    }
  });
  assert.deepEqual(failures, [], `dominant shapes:\n  ${failures.join('\n  ')}`);
});

test('the thresholds are the ones that were measured, not round numbers picked blind', () => {
  /* Recorded so a future change has to confront the evidence rather than just loosen a constant.
     Measured 2026-09-04 over 4,175 items in 145 buckets. */
  assert.equal(MIN_DISTINCT_RATIO, 0.75, 'weakest authored bucket measured 0.82');
  assert.equal(MAX_SHARE_OF_ONE_SHAPE, 0.25, 'heaviest legitimate repeat measured 5/25 = 0.20');
});
